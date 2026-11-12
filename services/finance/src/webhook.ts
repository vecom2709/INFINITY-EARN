import { hmacHex, safeEqual } from '../../../packages/shared/src/crypto.ts';

/**
 * HMAC-SHA256-Webhook-Signaturen im Stripe-kompatiblen Schema:
 *   Header: "t=<unix>,v1=<hex(hmac(secret, `${t}.${payload}`))>"
 * Zeittoleranz schützt vor Replay (IE-084); Vergleich in konstanter Zeit.
 */
export const DEFAULT_TOLERANCE_SEC = 300;

export function signPayload(secret: string, payload: string, timestampSec: number): string {
  return `t=${timestampSec},v1=${hmacHex(secret, `${timestampSec}.${payload}`)}`;
}

export type SignatureCheck = { ok: true; timestamp: number } | { ok: false; reason: string };

export function verifySignature(secret: string, payload: string, header: string | undefined, nowSec: number, toleranceSec = DEFAULT_TOLERANCE_SEC): SignatureCheck {
  if (!secret) return { ok: false, reason: 'WEBHOOK_SECRET_MISSING' };
  if (!header) return { ok: false, reason: 'SIGNATURE_MISSING' };
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s.trim());
    if (k === 't' && v && /^\d+$/.test(v)) t = Number(v);
    else if (k === 'v1' && v && /^[a-f0-9]{64}$/.test(v)) v1.push(v);
  }
  if (t === null || v1.length === 0) return { ok: false, reason: 'SIGNATURE_MALFORMED' };
  if (Math.abs(nowSec - t) > toleranceSec) return { ok: false, reason: 'TIMESTAMP_OUT_OF_TOLERANCE' };
  const expected = hmacHex(secret, `${t}.${payload}`);
  return v1.some((s) => safeEqual(s, expected)) ? { ok: true, timestamp: t } : { ok: false, reason: 'SIGNATURE_INVALID' };
}
