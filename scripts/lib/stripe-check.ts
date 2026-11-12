import { STRIPE_API_VERSION } from '../../services/finance/src/providers/stripe.ts';
import type { HttpFetch } from '../../services/finance/src/providers/types.ts';

/** Prüft einen Stripe-Schlüssel lesend (GET /v1/balance): gültig und livemode=false. Legt nichts an. */
export async function checkStripeKey(secretKey: string, fetchFn: HttpFetch = (u, i) => fetch(u, i), apiBase = 'https://api.stripe.com'): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!/^(sk|rk)_test_/.test(secretKey)) return { ok: false, reason: 'KEIN_TESTSCHLUESSEL' };
  try {
    const res = await fetchFn(`${apiBase}/v1/balance`, {
      method: 'GET',
      headers: { authorization: `Bearer ${secretKey}`, 'stripe-version': STRIPE_API_VERSION, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, reason: `HTTP_${res.status}` };
    if (json.livemode !== false) return { ok: false, reason: 'NICHT_TESTMODUS' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `NETZWERK: ${(e as Error).message.slice(0, 80)}` };
  }
}
