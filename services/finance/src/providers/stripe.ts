import { sha256Hex } from '../../../../packages/shared/src/crypto.ts';
import type { OrderRow } from '../../../core-api/src/orders.ts';
import { ProviderError, type HttpFetch, type PaymentProvider } from './types.ts';

/**
 * Stripe-Adapter über die REST-API (ohne SDK-Abhängigkeit). M2: AUSSCHLIESSLICH Testmodus.
 * - Schlüssel wird nur im Authorization-Header verwendet, nie geloggt oder gespeichert.
 * - Jede Antwort, die auf Live-Objekte hindeutet (livemode=true, cs_live_…), wird verworfen.
 * - Idempotency-Key bei schreibenden Aufrufen (sichere Wiederholung nach Netzfehlern).
 * - Keine Kundendaten (E-Mail, Name) werden an Stripe übergeben; Stripe Checkout erfasst sie selbst.
 */
export const STRIPE_API_VERSION = '2024-06-20';

function form(params: Record<string, string | number>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

export interface StripeOptions {
  secretKey: string;
  apiBase?: string;
  fetchFn?: HttpFetch;
}

export function createStripeProvider(opts: StripeOptions): PaymentProvider {
  if (!/^(sk|rk)_test_/.test(opts.secretKey)) throw new ProviderError('STRIPE_TEST_KEY_REQUIRED');
  const base = (opts.apiBase ?? 'https://api.stripe.com').replace(/\/$/, '');
  const fetchFn: HttpFetch = opts.fetchFn ?? ((url, init) => fetch(url, init));

  async function call(method: 'GET' | 'POST', path: string, params?: Record<string, string | number>, idempotencyKey?: string): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${opts.secretKey}`,
      'stripe-version': STRIPE_API_VERSION,
      accept: 'application/json',
    };
    let url = `${base}${path}`;
    let body: string | undefined;
    if (method === 'POST') {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
      body = form(params ?? {});
    } else if (params) url += `?${form(params)}`;
    let res;
    try {
      res = await fetchFn(url, { method, headers, body, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw new ProviderError('STRIPE_NETWORK', (e as Error).message.slice(0, 120));
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json.error ?? {}) as Record<string, unknown>;
      throw new ProviderError(`STRIPE_HTTP_${res.status}`, String(err.code ?? err.type ?? 'error').slice(0, 80));
    }
    if (json.livemode === true) throw new ProviderError('STRIPE_LIVEMODE_REFUSED');
    return json;
  }

  return {
    name: 'stripe',
    async createCheckout(order: OrderRow, urls, productName) {
      if (order.test_mode !== 1) throw new ProviderError('TEST_ORDERS_ONLY');
      const s = await call('POST', '/v1/checkout/sessions', {
        mode: 'payment',
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': order.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': order.amount_minor,
        'line_items[0][price_data][product_data][name]': productName.slice(0, 120),
        client_reference_id: order.order_id,
        'metadata[order_id]': order.order_id,
        'payment_intent_data[metadata][order_id]': order.order_id,
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
      }, `ie-checkout-${order.order_id}-${sha256Hex(order.checkout_session_id ?? 'first').slice(0, 12)}`);
      const id = typeof s.id === 'string' ? s.id : '';
      const url = typeof s.url === 'string' ? s.url : '';
      if (!id.startsWith('cs_test_')) throw new ProviderError('STRIPE_NOT_TEST_SESSION');
      if (!url.startsWith('https://checkout.stripe.com/')) throw new ProviderError('STRIPE_UNEXPECTED_URL');
      return { sessionId: id, url };
    },
    async requestRefund(order: OrderRow, amountMinor, refundRequestId) {
      if (!order.provider_payment_ref?.startsWith('pi_')) throw new ProviderError('NO_PAYMENT_INTENT');
      const r = await call('POST', '/v1/refunds', {
        payment_intent: order.provider_payment_ref,
        amount: amountMinor,
        reason: 'requested_by_customer',
        'metadata[order_id]': order.order_id,
        'metadata[refund_request_id]': refundRequestId,
      }, `ie-refund-${refundRequestId}`);
      const id = typeof r.id === 'string' ? r.id : '';
      if (!id.startsWith('re_') && !id.startsWith('pyr_')) throw new ProviderError('STRIPE_REFUND_SHAPE');
      return { providerRefundId: id, status: typeof r.status === 'string' ? r.status : 'unknown' };
    },
    async fetchFee(paymentRef, currency) {
      if (!paymentRef.startsWith('pi_')) return null;
      const pi = await call('GET', `/v1/payment_intents/${encodeURIComponent(paymentRef)}`, { 'expand[]': 'latest_charge.balance_transaction' });
      const charge = pi.latest_charge as Record<string, unknown> | null | undefined;
      const bt = charge && typeof charge === 'object' ? (charge.balance_transaction as Record<string, unknown> | null | undefined) : null;
      if (!bt || typeof bt !== 'object') return null; // noch nicht verfügbar -> später erneut
      if (!Number.isSafeInteger(bt.fee) || typeof bt.id !== 'string') throw new ProviderError('STRIPE_FEE_SHAPE');
      if (typeof bt.currency === 'string' && bt.currency.toUpperCase() !== currency) throw new ProviderError('STRIPE_FEE_CURRENCY_MISMATCH', `${bt.currency}`);
      return { feeMinor: bt.fee as number, ref: bt.id };
    },
  };
}
