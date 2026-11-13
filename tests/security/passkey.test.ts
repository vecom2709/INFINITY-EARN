import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { after, before, test } from 'node:test';
import { hashPassword, randomToken } from '../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { decodeCbor, mfaStatus } from '../../services/core-api/src/mfa.ts';
import { Client, serve } from '../http.ts';
import { makeCtx } from '../helpers.ts';

/** Zweiter Faktor per Passkey (WebAuthn) – mit nachgebildetem Gerät (echte ES256-/RS256-Schlüssel, Browser-Format). */
const PASSWORD = `pw-${randomToken(12)}`;
const sha = (b: Uint8Array | string): Buffer => createHash('sha256').update(b).digest();
const b64u = (b: Uint8Array): string => Buffer.from(b).toString('base64url');

// Minimaler CBOR-Encoder (wie ein Authenticator)
function cbor(v: unknown): Buffer {
  const head = (major: number, n: number): Buffer => (n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]));
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('cbor');
}

class Device {
  readonly credId = randomBytes(16);
  readonly priv: KeyObject;
  readonly cose: Map<number, unknown>;
  readonly alg: -7 | -257;
  count = 0;
  constructor(alg: -7 | -257) {
    this.alg = alg;
    if (alg === -7) {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const j = publicKey.export({ format: 'jwk' });
      this.priv = privateKey;
      this.cose = new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(j.x as string, 'base64url')], [-3, Buffer.from(j.y as string, 'base64url')]]);
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const j = publicKey.export({ format: 'jwk' });
      this.priv = privateKey;
      this.cose = new Map<number, unknown>([[1, 3], [3, -257], [-1, Buffer.from(j.n as string, 'base64url')], [-2, Buffer.from(j.e as string, 'base64url')]]);
    }
  }
  register(rpId: string, origin: string, challenge: string): Record<string, unknown> {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(this.credId.length);
    const authData = Buffer.concat([sha(rpId), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), len, this.credId, cbor(this.cose)]);
    const cd = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
    return { id: b64u(this.credId), label: this.alg === -7 ? 'Handy' : 'Windows Hello', response: { clientDataJSON: b64u(cd), attestationObject: b64u(cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))) } };
  }
  assert(rpId: string, origin: string, challenge: string, o: { flags?: number; count?: number; key?: KeyObject } = {}): Record<string, unknown> {
    this.count = o.count ?? this.count + 1;
    const c = Buffer.alloc(4);
    c.writeUInt32BE(this.count);
    const authData = Buffer.concat([sha(rpId), Buffer.from([o.flags ?? 0x05]), c]);
    const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin }));
    const signed = Buffer.concat([authData, sha(cd)]);
    const sig = this.alg === -7 ? sign('sha256', signed, { key: o.key ?? this.priv, dsaEncoding: 'der' }) : sign('sha256', signed, o.key ?? this.priv);
    return { id: b64u(this.credId), response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(sig) } };
  }
}

let ctx: AppContext;
let base: string;
let close: () => void;
let rpId: string;
let origin: string;
before(async () => {
  ctx = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } }).ctx;
  const s = await serve(ctx);
  base = s.base;
  close = () => s.server.close();
  origin = new URL(ctx.config.publicOrigin).origin;
  rpId = new URL(ctx.config.publicOrigin).hostname;
});
after(() => close());

const jpost = (c: Client, path: string, body: unknown, csrf?: string) => c.req('POST', path, JSON.stringify(body), { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) });
async function owner(): Promise<{ c: Client; csrf: string }> {
  const c = new Client(base);
  assert.equal((await c.post('/auth/login', { password: PASSWORD })).status, 303);
  const page = await c.get('/dashboard/sicherheit');
  assert.equal(page.status, 200);
  return { c, csrf: /data-csrf="([^"]+)"/.exec(page.text)?.[1] ?? '' };
}
async function passwordStep(): Promise<Client> {
  const c = new Client(base);
  const r = await c.post('/auth/login', { password: PASSWORD });
  assert.equal(r.location, '/login/mfa', 'nach Passwort kommt der zweite Schritt');
  return c;
}
async function loginWith(dev: Device, mutate: (ch: string) => Record<string, unknown>): Promise<{ status: number; c: Client }> {
  const c = await passwordStep();
  const o = JSON.parse((await jpost(c, '/auth/mfa/optionen', {})).text) as { challenge: string };
  const r = await jpost(c, '/auth/mfa/passkey', mutate(o.challenge));
  return { status: r.status, c };
}

const phone = new Device(-7);
const hello = new Device(-257);
let codes: string[] = [];

test('Einrichten: Seite mit eigenem Skript (CSP script-src self), Gerät registrieren, 8 Wiederherstellungscodes einmalig', async () => {
  const { c, csrf } = await owner();
  const page = await c.get('/dashboard/sicherheit');
  assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  assert.match(page.text, /Passkey hinzufügen/);
  assert.match((await c.get('/assets/passkey.js')).text, /navigator\.credentials\.create/);
  assert.equal((await jpost(c, '/admin/mfa/passkey/optionen', {})).status, 403, 'ohne CSRF-Token abgelehnt');
  const o = JSON.parse((await jpost(c, '/admin/mfa/passkey/optionen', {}, csrf)).text) as { challenge: string; rp: { id: string }; authenticatorSelection: { userVerification: string } };
  assert.equal(o.rp.id, rpId);
  assert.equal(o.authenticatorSelection.userVerification, 'required');
  const bad = JSON.parse((await jpost(c, '/admin/mfa/passkey/registrieren', phone.register(rpId, 'https://boese.example', o.challenge), csrf)).text) as { ok: boolean; reason: string };
  assert.equal(bad.ok, false, 'fremde Herkunft abgelehnt');
  const o2 = JSON.parse((await jpost(c, '/admin/mfa/passkey/optionen', {}, csrf)).text) as { challenge: string };
  const r = JSON.parse((await jpost(c, '/admin/mfa/passkey/registrieren', phone.register(rpId, origin, o2.challenge), csrf)).text) as { ok: boolean; recoveryCodes: string[] };
  assert.equal(r.ok, true);
  assert.equal(r.recoveryCodes.length, 8);
  codes = r.recoveryCodes;
  const o3 = JSON.parse((await jpost(c, '/admin/mfa/passkey/optionen', {}, csrf)).text) as { challenge: string; excludeCredentials: unknown[] };
  assert.equal(o3.excludeCredentials.length, 1, 'bereits registriertes Gerät ausgeschlossen');
  const r2 = JSON.parse((await jpost(c, '/admin/mfa/passkey/registrieren', hello.register(rpId, origin, o3.challenge), csrf)).text) as { ok: boolean; recoveryCodes: unknown };
  assert.equal(r2.ok, true, 'Windows Hello (RS256) registriert');
  assert.equal(r2.recoveryCodes, null, 'Codes nur beim ersten Gerät');
  assert.deepEqual(mfaStatus(ctx), { enabled: true, passkeys: 2, recoveryLeft: 8 });
  assert.ok(!JSON.stringify(ctx.db.all('SELECT * FROM owner_recovery_codes')).includes(codes[0]?.replace('-', '') ?? 'x'), 'Codes nur als Hash gespeichert');
});

test('Anmeldung: Passwort allein reicht nicht; Passkey (ES256 und RS256) öffnet die Verwaltung', async () => {
  const c = await passwordStep();
  assert.equal((await c.get('/dashboard')).status, 303, 'ohne zweiten Faktor keine Sitzung');
  assert.match((await c.get('/login/mfa')).text, /Mit Passkey bestätigen/);
  for (const dev of [phone, hello]) {
    const r = await loginWith(dev, (ch) => dev.assert(rpId, origin, ch));
    assert.equal(r.status, 200, `Anmeldung mit ${dev.alg}`);
    assert.equal((await r.c.get('/dashboard')).status, 200);
  }
});

test('Abgelehnt: fremde Herkunft, falscher Schlüssel, ohne Benutzerprüfung, wiederverwendete Herausforderung, nicht steigender Zähler', async () => {
  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  assert.equal((await loginWith(phone, (ch) => phone.assert(rpId, 'https://boese.example', ch))).status, 401, 'Phishing-Seite');
  assert.equal((await loginWith(phone, (ch) => phone.assert(rpId, origin, ch, { key: other }))).status, 401, 'falscher Schlüssel');
  assert.equal((await loginWith(phone, (ch) => phone.assert(rpId, origin, ch, { flags: 0x01 }))).status, 401, 'ohne PIN/Fingerabdruck');
  assert.equal((await loginWith(phone, (ch) => phone.assert(rpId, origin, ch, { count: 1 }))).status, 401, 'Zähler nicht gestiegen (Klon)');
  const c = await passwordStep();
  const o = JSON.parse((await jpost(c, '/auth/mfa/optionen', {})).text) as { challenge: string };
  const a = phone.assert(rpId, origin, o.challenge, { count: 100 });
  assert.equal((await jpost(c, '/auth/mfa/passkey', a)).status, 200);
  const c2 = await passwordStep();
  assert.equal((await jpost(c2, '/auth/mfa/passkey', a)).status, 401, 'Herausforderung nur einmal gültig');
});

test('Nach 5 Fehlversuchen ist die Prüfung verbraucht; ohne Passwort-Schritt gibt es keine Herausforderung', async () => {
  const c = await passwordStep();
  let last = 0;
  for (let i = 0; i < 5; i++) last = (await jpost(c, '/auth/mfa/passkey', { id: 'x', response: {} })).status;
  assert.equal(last, 401);
  assert.equal((await jpost(c, '/auth/mfa/optionen', {})).status, 401, 'Prüfung verbraucht');
  assert.equal((await jpost(new Client(base), '/auth/mfa/optionen', {})).status, 401);
});

test('Wiederherstellungscode: genau einmal gültig; letztes Gerät nur mit Code entfernbar', async () => {
  const c = await passwordStep();
  const ok = await c.post('/auth/mfa', { code: codes[0] ?? '' });
  assert.equal(ok.status, 303);
  assert.equal((await c.get('/dashboard')).status, 200);
  const again = await passwordStep();
  assert.equal((await again.post('/auth/mfa', { code: codes[0] ?? '' })).status, 401, 'Code verbraucht');
  const { c: o, csrf } = await (async () => {
    const x = await passwordStep();
    await x.post('/auth/mfa', { code: codes[1] ?? '' });
    const page = await x.get('/dashboard/sicherheit');
    return { c: x, csrf: /name="_csrf" value="([^"]+)"/.exec(page.text)?.[1] ?? '' };
  })();
  await o.post('/admin/mfa/passkey/entfernen', { _csrf: csrf, cred: b64u(hello.credId) });
  assert.equal(mfaStatus(ctx).passkeys, 1);
  await o.post('/admin/mfa/passkey/entfernen', { _csrf: csrf, cred: b64u(phone.credId) });
  assert.equal(mfaStatus(ctx).passkeys, 1, 'letztes Gerät ohne Code nicht entfernbar');
  await o.post('/admin/mfa/passkey/entfernen', { _csrf: csrf, cred: b64u(phone.credId), code: codes[2] ?? '' });
  assert.deepEqual(mfaStatus(ctx), { enabled: false, passkeys: 0, recoveryLeft: 0 });
  const plain = new Client(base);
  assert.equal((await plain.post('/auth/login', { password: PASSWORD })).location, '/dashboard', 'ohne Gerät wieder nur Passwort');
});

test('CBOR-Leser: Werte, Abschneiden erkannt', () => {
  const m = decodeCbor(cbor(new Map<unknown, unknown>([[1, 2], [-7, 'x'], ['b', Buffer.from([1, 2])]]))).value as Map<unknown, unknown>;
  assert.equal(m.get(1), 2);
  assert.equal(m.get(-7), 'x');
  assert.throws(() => decodeCbor(Buffer.from([0x42, 1])), /CBOR_TRUNCATED/);
});
