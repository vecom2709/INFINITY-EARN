import { Buffer } from 'node:buffer';
import { createPublicKey, randomBytes, verify as cryptoVerify, type JsonWebKey } from 'node:crypto';
import { randomToken, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from './context.ts';

/**
 * Zweiter Faktor des Eigentümers per Passkey (WebAuthn Level 2) – Windows Hello, Handy-Entsperrung oder
 * Sicherheitsschlüssel; keine zusätzliche App, kein externer Dienst, keine Kosten.
 *  - Gespeichert wird nur der öffentliche Schlüssel des Geräts (ES256 oder RS256), nie ein Geheimnis.
 *  - Geprüft werden Herausforderung (einmalig, 5 Min.), Herkunft (Origin), Dienst (rpId-Hash), Anwesenheit und
 *    Benutzerprüfung (PIN/Fingerabdruck), Signatur und Signaturzähler (Schutz gegen geklonte Schlüssel).
 *  - 8 Wiederherstellungscodes (nur Hash, je einmal) für den Fall, dass kein Gerät verfügbar ist.
 *  - Anmeldung in zwei Stufen: Passwort → kurzlebige Prüfung (5 Min., höchstens 5 Versuche) → Sitzung.
 */
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const CHALLENGE_MAX_ATTEMPTS = 5;
export const RECOVERY_CODES = 8;
const RP_NAME = 'INFINITY EARN';
const USER_ID = Buffer.from('infinity-earn-owner').toString('base64url');

const b64u = (b: Uint8Array): string => Buffer.from(b).toString('base64url');
const fromB64u = (s: string): Buffer => Buffer.from(s, 'base64url');

// ------------------------------------------------------------------ CBOR (nur was WebAuthn braucht)
type Cbor = number | bigint | Uint8Array | string | Cbor[] | Map<Cbor, Cbor> | boolean | null;
export function decodeCbor(buf: Uint8Array, start = 0): { value: Cbor; end: number } {
  let p = start;
  const byte = (): number => {
    if (p >= buf.length) throw new Error('CBOR_TRUNCATED');
    return buf[p++] as number;
  };
  const len = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) return byte();
    if (info === 25) return (byte() << 8) | byte();
    if (info === 26) return ((byte() << 24) >>> 0) + (byte() << 16) + (byte() << 8) + byte();
    throw new Error('CBOR_UNSUPPORTED_LENGTH');
  };
  const item = (): Cbor => {
    const b = byte();
    const major = b >> 5;
    const info = b & 31;
    switch (major) {
      case 0: return len(info);
      case 1: return -1 - len(info);
      case 2: { const n = len(info); if (p + n > buf.length) throw new Error('CBOR_TRUNCATED'); const v = buf.slice(p, p + n); p += n; return v; }
      case 3: { const n = len(info); if (p + n > buf.length) throw new Error('CBOR_TRUNCATED'); const v = Buffer.from(buf.slice(p, p + n)).toString('utf8'); p += n; return v; }
      case 4: { const n = len(info); const a: Cbor[] = []; for (let i = 0; i < n; i++) a.push(item()); return a; }
      case 5: { const n = len(info); const m = new Map<Cbor, Cbor>(); for (let i = 0; i < n; i++) { const k = item(); m.set(k, item()); } return m; }
      case 7: if (info === 20) return false; if (info === 21) return true; if (info === 22) return null; throw new Error('CBOR_UNSUPPORTED_SIMPLE');
      default: throw new Error('CBOR_UNSUPPORTED_TYPE');
    }
  };
  const value = item();
  return { value, end: p };
}

/** COSE-Schlüssel (ES256/RS256) → SPKI (DER, base64url). */
function coseToSpki(cose: Map<Cbor, Cbor>): { spki: string; alg: -7 | -257 } {
  const kty = cose.get(1);
  const alg = cose.get(3);
  let jwk: JsonWebKey;
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) throw new Error('COSE_EC_INVALID');
    jwk = { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y) };
  } else if (kty === 3 && alg === -257) {
    const n = cose.get(-1);
    const e = cose.get(-2);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length < 256) throw new Error('COSE_RSA_INVALID');
    jwk = { kty: 'RSA', n: b64u(n), e: b64u(e) };
  } else throw new Error('COSE_ALG_UNSUPPORTED');
  const der = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'der' });
  return { spki: b64u(der), alg: alg as -7 | -257 };
}

interface AuthData { rpIdHash: Buffer; up: boolean; uv: boolean; signCount: number; credId?: string; cose?: Map<Cbor, Cbor> }
function parseAuthData(a: Uint8Array): AuthData {
  if (a.length < 37) throw new Error('AUTHDATA_SHORT');
  const flags = a[32] as number;
  const signCount = Buffer.from(a.slice(33, 37)).readUInt32BE(0);
  const out: AuthData = { rpIdHash: Buffer.from(a.slice(0, 32)), up: (flags & 0x01) !== 0, uv: (flags & 0x04) !== 0, signCount };
  if (flags & 0x40) {
    const idLen = Buffer.from(a.slice(53, 55)).readUInt16BE(0);
    out.credId = b64u(a.slice(55, 55 + idLen));
    const cose = decodeCbor(a, 55 + idLen).value;
    if (!(cose instanceof Map)) throw new Error('COSE_MISSING');
    out.cose = cose;
  }
  return out;
}

// ------------------------------------------------------------------ Umgebung
function rp(ctx: AppContext): { id: string; origin: string } {
  const u = new URL(ctx.config.publicOrigin);
  return { id: u.hostname, origin: u.origin };
}

function newChallenge(ctx: AppContext, purpose: 'register' | 'login'): string {
  const c = b64u(randomBytes(32));
  const now = ctx.clock();
  ctx.db.run('DELETE FROM webauthn_challenges WHERE expires_at < ?', now.toISOString());
  ctx.db.run('INSERT INTO webauthn_challenges (challenge, purpose, expires_at) VALUES (?, ?, ?)', c, purpose, new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString());
  return c;
}
function consumeChallenge(ctx: AppContext, c: string, purpose: 'register' | 'login'): boolean {
  const r = ctx.db.run('DELETE FROM webauthn_challenges WHERE challenge = ? AND purpose = ? AND expires_at >= ?', c, purpose, ctx.clock().toISOString());
  return r.changes === 1;
}

function checkClientData(ctx: AppContext, clientDataJSON: string, type: 'webauthn.create' | 'webauthn.get', purpose: 'register' | 'login'): Buffer {
  const raw = fromB64u(clientDataJSON);
  let cd: { type?: string; challenge?: string; origin?: string; crossOrigin?: boolean };
  try {
    cd = JSON.parse(raw.toString('utf8')) as typeof cd;
  } catch {
    throw new Error('CLIENTDATA_INVALID');
  }
  if (cd.type !== type) throw new Error('CLIENTDATA_TYPE');
  if (cd.origin !== rp(ctx).origin || cd.crossOrigin === true) throw new Error('ORIGIN_MISMATCH');
  if (!cd.challenge || !consumeChallenge(ctx, cd.challenge, purpose)) throw new Error('CHALLENGE_INVALID');
  return raw;
}

// ------------------------------------------------------------------ Status und Verwaltung
export interface Passkey { cred_id: string; label: string; created_at: string; last_used_at: string | null }
export function listPasskeys(ctx: AppContext): Passkey[] {
  return ctx.db.all<Passkey>('SELECT cred_id, label, created_at, last_used_at FROM owner_passkeys ORDER BY created_at');
}
export function mfaStatus(ctx: AppContext): { enabled: boolean; passkeys: number; recoveryLeft: number } {
  const n = listPasskeys(ctx).length;
  const left = ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM owner_recovery_codes WHERE used_at IS NULL')?.n ?? 0;
  return { enabled: n > 0, passkeys: n, recoveryLeft: n > 0 ? left : 0 };
}

/** Optionen für navigator.credentials.create (Registrierung eines Geräts). */
export function registrationOptions(ctx: AppContext): Record<string, unknown> {
  const r = rp(ctx);
  return {
    challenge: newChallenge(ctx, 'register'),
    rp: { name: RP_NAME, id: r.id },
    user: { id: USER_ID, name: 'eigentuemer', displayName: 'Eigentümer INFINITY EARN' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
    excludeCredentials: listPasskeys(ctx).map((p) => ({ type: 'public-key', id: p.cred_id })),
    attestation: 'none',
    timeout: CHALLENGE_TTL_MS,
  };
}

export interface RegistrationInput { id?: string; response?: { clientDataJSON?: string; attestationObject?: string }; label?: string }

/** Gerät registrieren. Beim ersten Gerät entstehen die Wiederherstellungscodes (einmalige Anzeige). */
export function register(ctx: AppContext, input: RegistrationInput): { ok: true; recoveryCodes: string[] | null } | { ok: false; reason: string } {
  try {
    const cdj = input.response?.clientDataJSON ?? '';
    checkClientData(ctx, cdj, 'webauthn.create', 'register');
    const att = decodeCbor(fromB64u(input.response?.attestationObject ?? '')).value;
    if (!(att instanceof Map)) throw new Error('ATTESTATION_INVALID');
    const authData = att.get('authData');
    if (!(authData instanceof Uint8Array)) throw new Error('AUTHDATA_MISSING');
    const a = parseAuthData(authData);
    if (!a.rpIdHash.equals(Buffer.from(sha256Hex(rp(ctx).id), 'hex'))) throw new Error('RPID_MISMATCH');
    if (!a.up || !a.uv) throw new Error('USER_VERIFICATION_REQUIRED');
    if (!a.credId || !a.cose || a.credId !== input.id) throw new Error('CREDENTIAL_MISSING');
    const { spki, alg } = coseToSpki(a.cose);
    const first = listPasskeys(ctx).length === 0;
    const label = (input.label ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 40) || `Gerät ${listPasskeys(ctx).length + 1}`;
    const now = ctx.clock().toISOString();
    let codes: string[] | null = null;
    ctx.db.tx(() => {
      ctx.db.run('INSERT INTO owner_passkeys (cred_id, public_key_spki, alg, sign_count, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', a.credId as string, spki, alg, a.signCount, label, now);
      if (first) {
        codes = Array.from({ length: RECOVERY_CODES }, () => b64u(randomBytes(8)).toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(10, '7').slice(0, 10));
        ctx.db.run('DELETE FROM owner_recovery_codes');
        for (const c of codes) ctx.db.run('INSERT INTO owner_recovery_codes (code_hash, created_at) VALUES (?, ?)', sha256Hex(c), now);
      }
    });
    ctx.audit.record({ type: 'security.passkey_registered', actor: 'owner', subjectType: 'auth', subjectId: 'owner', data: { label, alg, first }, testMode: ctx.config.testMode });
    return { ok: true, recoveryCodes: codes ? (codes as string[]).map((c) => `${c.slice(0, 5)}-${c.slice(5)}`) : null };
  } catch (e) {
    ctx.audit.record({ type: 'security.passkey_register_failed', actor: 'owner', subjectType: 'auth', subjectId: 'owner', data: { reason: (e as Error).message.slice(0, 60) }, testMode: ctx.config.testMode });
    return { ok: false, reason: (e as Error).message.slice(0, 60) };
  }
}

/** Gerät entfernen. Ohne letztes Gerät ist der zweite Faktor aus – dafür ist ein Wiederherstellungscode nötig. */
export function removePasskey(ctx: AppContext, credId: string, recoveryCode?: string): boolean {
  const all = listPasskeys(ctx);
  if (!all.some((p) => p.cred_id === credId)) return false;
  if (all.length === 1 && !useRecovery(ctx, recoveryCode ?? '')) return false;
  ctx.db.run('DELETE FROM owner_passkeys WHERE cred_id = ?', credId);
  if (all.length === 1) ctx.db.run('DELETE FROM owner_recovery_codes');
  ctx.audit.record({ type: all.length === 1 ? 'security.mfa_disabled' : 'security.passkey_removed', actor: 'owner', subjectType: 'auth', subjectId: 'owner', testMode: ctx.config.testMode });
  return true;
}

// ------------------------------------------------------------------ Anmeldung Stufe 2
/** Stufe 1 bestanden (Passwort): kurzlebige Prüfung anlegen. */
export function createChallenge(ctx: AppContext): string {
  const token = randomToken(32);
  const now = ctx.clock();
  ctx.db.run('DELETE FROM owner_mfa_challenges WHERE expires_at < ?', now.toISOString());
  ctx.db.run('INSERT INTO owner_mfa_challenges (token_hash, attempts, created_at, expires_at) VALUES (?, 0, ?, ?)', sha256Hex(token), now.toISOString(), new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString());
  return token;
}

function challengeRow(ctx: AppContext, token: string | undefined): { h: string; attempts: number } | null {
  if (!token) return null;
  const h = sha256Hex(token);
  const c = ctx.db.get<{ attempts: number; expires_at: string }>('SELECT attempts, expires_at FROM owner_mfa_challenges WHERE token_hash = ?', h);
  return c && Date.parse(c.expires_at) >= ctx.clock().getTime() ? { h, attempts: c.attempts } : null;
}

/** Optionen für navigator.credentials.get – nur mit gültiger Passwort-Prüfung. */
export function loginOptions(ctx: AppContext, token: string | undefined): Record<string, unknown> | null {
  if (!challengeRow(ctx, token)) return null;
  return { challenge: newChallenge(ctx, 'login'), rpId: rp(ctx).id, allowCredentials: listPasskeys(ctx).map((p) => ({ type: 'public-key', id: p.cred_id })), userVerification: 'required', timeout: CHALLENGE_TTL_MS };
}

export interface AssertionInput { id?: string; response?: { clientDataJSON?: string; authenticatorData?: string; signature?: string } }
export type ChallengeResult = { ok: true } | { ok: false; reason: 'EXPIRED' | 'INVALID' | 'LOCKED' };

function checkAssertion(ctx: AppContext, input: AssertionInput): boolean {
  try {
    const key = ctx.db.get<{ public_key_spki: string; alg: number; sign_count: number }>('SELECT public_key_spki, alg, sign_count FROM owner_passkeys WHERE cred_id = ?', input.id ?? '');
    if (!key) return false;
    const cdRaw = checkClientData(ctx, input.response?.clientDataJSON ?? '', 'webauthn.get', 'login');
    const ad = fromB64u(input.response?.authenticatorData ?? '');
    const a = parseAuthData(ad);
    if (!a.rpIdHash.equals(Buffer.from(sha256Hex(rp(ctx).id), 'hex')) || !a.up || !a.uv) return false;
    const signed = Buffer.concat([ad, Buffer.from(sha256Hex(cdRaw), 'hex')]);
    const pub = createPublicKey({ key: fromB64u(key.public_key_spki), format: 'der', type: 'spki' });
    const sig = fromB64u(input.response?.signature ?? '');
    const ok = key.alg === -7 ? cryptoVerify('sha256', signed, { key: pub, dsaEncoding: 'der' }, sig) : cryptoVerify('sha256', signed, pub, sig);
    if (!ok) return false;
    // Signaturzähler: steigt er nicht (und ist nicht 0), wurde der Schlüssel womöglich kopiert.
    if (a.signCount !== 0 && a.signCount <= key.sign_count) {
      ctx.audit.record({ type: 'security.passkey_clone_suspected', actor: 'system', subjectType: 'auth', subjectId: 'owner', testMode: ctx.config.testMode });
      return false;
    }
    ctx.db.run('UPDATE owner_passkeys SET sign_count = ?, last_used_at = ? WHERE cred_id = ?', a.signCount, ctx.clock().toISOString(), input.id ?? '');
    return true;
  } catch {
    return false;
  }
}

const normRecovery = (c: string): string => c.toLowerCase().replace(/[^a-z0-9]/g, '');
function useRecovery(ctx: AppContext, code: string): boolean {
  const n = normRecovery(code);
  if (n.length !== 10) return false;
  const r = ctx.db.run('UPDATE owner_recovery_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL', ctx.clock().toISOString(), sha256Hex(n));
  if (r.changes === 1) ctx.audit.record({ type: 'security.mfa_recovery_used', actor: 'owner', subjectType: 'auth', subjectId: 'owner', testMode: ctx.config.testMode });
  return r.changes === 1;
}

/** Stufe 2 prüfen – per Passkey (Signatur) oder Wiederherstellungscode. Nach 5 Fehlversuchen verbraucht. */
export function verifySecondFactor(ctx: AppContext, token: string | undefined, factor: { assertion?: AssertionInput; recoveryCode?: string }): ChallengeResult {
  const c = challengeRow(ctx, token);
  if (!c) return { ok: false, reason: 'EXPIRED' };
  const ok = mfaStatus(ctx).enabled && (factor.assertion ? checkAssertion(ctx, factor.assertion) : useRecovery(ctx, factor.recoveryCode ?? ''));
  if (ok) {
    ctx.db.run('DELETE FROM owner_mfa_challenges WHERE token_hash = ?', c.h);
    return { ok: true };
  }
  ctx.audit.record({ type: 'security.mfa_failed', actor: 'anonymous', subjectType: 'auth', subjectId: 'owner', testMode: ctx.config.testMode });
  if (c.attempts + 1 >= CHALLENGE_MAX_ATTEMPTS) {
    ctx.db.run('DELETE FROM owner_mfa_challenges WHERE token_hash = ?', c.h);
    return { ok: false, reason: 'LOCKED' };
  }
  ctx.db.run('UPDATE owner_mfa_challenges SET attempts = attempts + 1 WHERE token_hash = ?', c.h);
  return { ok: false, reason: 'INVALID' };
}
