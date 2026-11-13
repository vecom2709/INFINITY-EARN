import { randomToken, safeEqual, sha256Hex, verifyPassword } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from './context.ts';
import { createChallenge, mfaStatus } from './mfa.ts';

/** Owner-Basisauthentifizierung: scrypt-Passwort, serverseitige Sessions, CSRF-Token, Login-Ratenlimit. */
export interface OwnerSession {
  token_hash: string;
  csrf_token: string;
  expires_at: string;
}

const attempts = new Map<string, { count: number; resetAt: number }>();
export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;

export function loginRateLimited(ip: string, now: number): boolean {
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) return false;
  return a.count >= MAX_LOGIN_FAILURES;
}

function noteFailure(ip: string, now: number): void {
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) attempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else a.count++;
}

export function resetLoginAttempts(): void {
  attempts.clear();
}

export function login(ctx: AppContext, password: string, ip: string): { ok: true; token: string; csrf: string } | { ok: true; mfaChallenge: string } | { ok: false; reason: 'DISABLED' | 'RATE_LIMITED' | 'INVALID' } {
  const now = ctx.clock().getTime();
  if (!ctx.config.ownerPasswordHash) return { ok: false, reason: 'DISABLED' };
  if (loginRateLimited(ip, now)) {
    ctx.audit.record({ type: 'security.login_rate_limited', actor: 'anonymous', subjectType: 'auth', subjectId: sha256Hex(ip).slice(0, 12), testMode: ctx.config.testMode });
    return { ok: false, reason: 'RATE_LIMITED' };
  }
  if (!verifyPassword(password, ctx.config.ownerPasswordHash)) {
    noteFailure(ip, now);
    ctx.audit.record({ type: 'security.login_failed', actor: 'anonymous', subjectType: 'auth', subjectId: sha256Hex(ip).slice(0, 12), testMode: ctx.config.testMode });
    return { ok: false, reason: 'INVALID' };
  }
  attempts.delete(ip);
  // Zwei-Faktor aktiv: erst nach dem App- oder Wiederherstellungscode gibt es eine Sitzung.
  if (mfaStatus(ctx).enabled) {
    ctx.audit.record({ type: 'security.login_password_ok_mfa_pending', actor: 'owner', subjectType: 'auth', subjectId: 'owner', testMode: ctx.config.testMode });
    return { ok: true, mfaChallenge: createChallenge(ctx) };
  }
  return createSession(ctx);
}

/** Owner-Sitzung anlegen (nach Passwort bzw. nach Passwort + zweitem Faktor). */
export function createSession(ctx: AppContext): { ok: true; token: string; csrf: string } {
  const now = ctx.clock().getTime();
  const token = randomToken(32);
  const csrf = randomToken(24);
  ctx.db.run(
    'INSERT INTO owner_sessions (token_hash, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?)',
    sha256Hex(token), csrf, new Date(now).toISOString(), new Date(now + ctx.config.sessionTtlMinutes * 60_000).toISOString(),
  );
  ctx.db.run('DELETE FROM owner_sessions WHERE expires_at < ?', new Date(now).toISOString());
  ctx.audit.record({ type: 'security.login_succeeded', actor: 'owner', subjectType: 'auth', subjectId: 'owner', testMode: ctx.config.testMode });
  return { ok: true, token, csrf };
}

export function sessionFromToken(ctx: AppContext, token: string | undefined): OwnerSession | null {
  if (!token) return null;
  const s = ctx.db.get<OwnerSession>('SELECT token_hash, csrf_token, expires_at FROM owner_sessions WHERE token_hash = ?', sha256Hex(token));
  if (!s || new Date(s.expires_at).getTime() < ctx.clock().getTime()) return null;
  return s;
}

export function csrfValid(session: OwnerSession, provided: string | undefined | null): boolean {
  return !!provided && safeEqual(provided, session.csrf_token);
}

export function logout(ctx: AppContext, token: string | undefined): void {
  if (token) ctx.db.run('DELETE FROM owner_sessions WHERE token_hash = ?', sha256Hex(token));
}
