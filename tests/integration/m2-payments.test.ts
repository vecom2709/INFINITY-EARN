import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { ConfigError } from '../../services/core-api/src/config.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { acceptQuote } from '../../services/core-api/src/workflow.ts';
import { startCheckout } from '../../services/finance/src/checkout.ts';
import { runFeeSync } from '../../services/finance/src/fee-sync.ts';
import { handlePaymentWebhook, type ProviderEvent } from '../../services/finance/src/payments.ts';
import { createMockProvider } from '../../services/finance/src/providers/index.ts';
import { createStripeProvider } from '../../services/finance/src/providers/stripe.ts';
import type { HttpFetch } from '../../services/finance/src/providers/types.ts';
import { approveRefundRequest, createRefundRequest, getRefundRequest, rejectRefundRequest } from '../../services/finance/src/refunds.ts';
import { signPayload } from '../../services/finance/src/webhook.ts';
import { reconcile } from '../../services/finance/src/reconciliation.ts';
import { getDeliveryByOrder } from '../../services/product-factory/src/delivery.ts';
import { runProductionOnce } from '../../services/product-factory/src/production.ts';
import { checkStripeKey } from '../../scripts/lib/stripe-check.ts';
import { buyer, count, makeCtx, oppState, toDelivered, toQuote } from '../helpers.ts';

// Zur Laufzeit zusammengesetzt – keine schlüsselähnlichen Literale im Repository.
const SK = ['sk', 'test', 'fixture0123456789ABCDEF'].join('_');
const WH = ['whsec', 'fixtureABCDEF0123456789'].join('_');
const stripeEnv = { PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: SK, STRIPE_WEBHOOK_SECRET: WH };

interface Call { method: string; url: string; body: string; headers: Record<string, string> }
function fakeStripe(routes: Record<string, (c: Call) => { status?: number; json: unknown }>): { fn: HttpFetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn: HttpFetch = async (url, init) => {
    const c = { method: init.method, url, body: init.body ?? '', headers: init.headers };
    calls.push(c);
    const path = new URL(url).pathname;
    const handler = Object.entries(routes).find(([p]) => path.startsWith(p))?.[1];
    const r = handler ? handler(c) : { status: 404, json: { error: { type: 'invalid_request_error' } } };
    const status = r.status ?? 200;
    return { ok: status < 300, status, json: async () => r.json };
  };
  return { fn, calls };
}

const sessionRoute = () => ({ json: { id: `cs_test_a1${Math.random().toString(36).slice(2, 10)}`, object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_x', livemode: false } });

function stripeEvent(ctx: ReturnType<typeof makeCtx>['ctx'], type: string, object: Record<string, unknown>): { body: string; sig: string } {
  const ev: ProviderEvent = { id: `evt_1T${Math.random().toString(36).slice(2, 14)}`, type, livemode: false, created: Math.floor(ctx.clock().getTime() / 1000), data: { object } };
  const body = JSON.stringify(ev);
  return { body, sig: signPayload(WH, body, Math.floor(ctx.clock().getTime() / 1000)) };
}

async function stripeOrder(ctx: ReturnType<typeof makeCtx>['ctx']) {
  const q = toQuote(ctx);
  const acc = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 't', buyer });
  const s = fakeStripe({ '/v1/checkout/sessions': sessionRoute });
  const session = await startCheckout(ctx, acc.orderId, createStripeProvider({ secretKey: SK, fetchFn: s.fn }));
  return { ...q, ...acc, session, calls: s.calls };
}

function payStripe(ctx: ReturnType<typeof makeCtx>['ctx'], orderId: string, pi = 'pi_3Ttest000001') {
  const o = getOrder(ctx, orderId);
  const { body, sig } = stripeEvent(ctx, 'checkout.session.completed', {
    id: o.checkout_session_id, object: 'checkout.session', amount_total: o.amount_minor, currency: 'eur', payment_status: 'paid', payment_intent: pi, metadata: { order_id: orderId },
  });
  return handlePaymentWebhook(ctx, body, sig, 'stripe');
}

test('IE-040 Stripe nur im Testmodus: Konfiguration verlangt Test-Schlüssel + whsec, Live verweigert', () => {
  assert.equal(makeCtx({ env: stripeEnv }).ctx.config.payment.provider, 'stripe');
  assert.throws(() => makeCtx({ env: { ...stripeEnv, STRIPE_SECRET_KEY: SK.replace('_test_', '_live_') } }), ConfigError);
  assert.throws(() => makeCtx({ env: { ...stripeEnv, STRIPE_WEBHOOK_SECRET: 'nicht-gesetzt' } }), /STRIPE_WEBHOOK_SECRET/);
  assert.throws(() => makeCtx({ env: { PAYMENT_PROVIDER: 'stripe' } }), /Test-Schlüssel/);
  assert.throws(() => createStripeProvider({ secretKey: SK.replace('_test_', '_live_') }), /STRIPE_TEST_KEY_REQUIRED/);
});

test('Stripe Checkout: korrekte Anfrage, Idempotenz, keine Kundendaten, Zahlung bleibt offen', async () => {
  const { ctx } = makeCtx({ env: stripeEnv });
  const o = await stripeOrder(ctx);
  const call = o.calls[0];
  assert.equal(call?.method, 'POST');
  assert.equal(call?.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(call?.headers.authorization, `Bearer ${SK}`);
  assert.equal(call?.headers['stripe-version'], '2024-06-20');
  assert.match(call?.headers['idempotency-key'] ?? '', /^ie-checkout-ord_/);
  const body = new URLSearchParams(call?.body);
  assert.equal(body.get('mode'), 'payment');
  assert.equal(body.get('metadata[order_id]'), o.orderId);
  assert.equal(body.get('payment_intent_data[metadata][order_id]'), o.orderId);
  assert.equal(body.get('line_items[0][price_data][currency]'), 'eur');
  assert.equal(Number(body.get('line_items[0][price_data][unit_amount]')), getOrder(ctx, o.orderId).amount_minor);
  assert.doesNotMatch(call?.body ?? '', /email|example\.invalid|Test%20GmbH/i, 'keine personenbezogenen Daten an Stripe');
  const order = getOrder(ctx, o.orderId);
  assert.deepEqual([order.payment_provider, order.payment_state, order.checkout_session_id], ['stripe', 'UNPAID', o.session.sessionId]);
  assert.match(o.session.url, /^https:\/\/checkout\.stripe\.com\//);
});

test('Stripe Checkout: Live-Sitzung oder Fehler beim Provider ändern nichts', async () => {
  const { ctx } = makeCtx({ env: stripeEnv });
  const q = toQuote(ctx);
  const acc = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 't', buyer });
  const live = fakeStripe({ '/v1/checkout/sessions': () => ({ json: { id: 'cs_live_abc', url: 'https://checkout.stripe.com/x', livemode: true } }) });
  await assert.rejects(startCheckout(ctx, acc.orderId, createStripeProvider({ secretKey: SK, fetchFn: live.fn })), /STRIPE_LIVEMODE_REFUSED/);
  const err = fakeStripe({ '/v1/checkout/sessions': () => ({ status: 401, json: { error: { type: 'authentication_error' } } }) });
  await assert.rejects(startCheckout(ctx, acc.orderId, createStripeProvider({ secretKey: SK, fetchFn: err.fn })), /STRIPE_HTTP_401/);
  assert.equal(getOrder(ctx, acc.orderId).checkout_session_id, null);
  assert.equal(ctx.audit.byType('checkout.provider_failed').length, 2);
});

test('IE-031 IE-071 Stripe-Event ohne Gebühr: Zahlung bestätigt, Gebühr später exakt aus Balance Transaction', async () => {
  const { ctx, clock } = makeCtx({ env: stripeEnv });
  const o = await stripeOrder(ctx);
  assert.equal(payStripe(ctx, o.orderId).detail, 'CONFIRMED');
  assert.equal(getOrder(ctx, o.orderId).provider_payment_ref, 'pi_3Ttest000001');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM jobs WHERE kind = 'fee_sync'`), 1);
  assert.equal(runProductionOnce(ctx).results[0]?.outcome, 'DELIVERED');
  autopilotTick(ctx);
  assert.equal(oppState(ctx, o.opportunityId), 'INVOICE_RECORDED', 'ohne bestätigte Gebühr kein Abgleich');
  assert.ok(reconcile(ctx).issues.some((i) => i.startsWith('FEE_UNCONFIRMED')));

  let available = false;
  const s = fakeStripe({
    '/v1/payment_intents/': () => ({ json: { id: 'pi_3Ttest000001', livemode: false, latest_charge: { id: 'ch_1', balance_transaction: available ? { id: 'txn_1', fee: 98, currency: 'eur' } : null } } }),
  });
  const provider = createStripeProvider({ secretKey: SK, fetchFn: s.fn });
  assert.deepEqual(await runFeeSync(ctx, provider), { booked: 0, pending: 1, failed: 0 });
  assert.match(s.calls[0]?.url ?? '', /expand%5B%5D=latest_charge\.balance_transaction/);
  available = true;
  clock.advance(60 * 60_000);
  assert.deepEqual(await runFeeSync(ctx, provider), { booked: 1, pending: 0, failed: 0 });
  assert.equal(ctx.db.get<{ s: number }>(`SELECT SUM(amount_minor) AS s FROM ledger_entries WHERE account = 'provider_fees'`)?.s, -98);
  autopilotTick(ctx);
  assert.equal(oppState(ctx, o.opportunityId), 'LEDGER_RECONCILED');
});

test('IE-038 Stripe-Dispute ohne Metadaten: Zuordnung über PaymentIntent', async () => {
  const { ctx } = makeCtx({ env: stripeEnv });
  const o = await stripeOrder(ctx);
  payStripe(ctx, o.orderId, 'pi_3Tdispute0001');
  const { body, sig } = stripeEvent(ctx, 'charge.dispute.created', { id: 'du_1', object: 'dispute', amount: getOrder(ctx, o.orderId).amount_minor, currency: 'eur', payment_intent: 'pi_3Tdispute0001', metadata: {} });
  assert.equal(handlePaymentWebhook(ctx, body, sig, 'stripe').detail, 'DISPUTED');
  assert.equal(getOrder(ctx, o.orderId).payment_state, 'DISPUTED');
});

test('IE-039 Teilerstattungen: kumulativer Stripe-Betrag wird als Differenz gebucht, keine Doppelbuchung', async () => {
  const { ctx } = makeCtx({ env: stripeEnv });
  const o = await stripeOrder(ctx);
  payStripe(ctx, o.orderId);
  const amount = getOrder(ctx, o.orderId).amount_minor;
  const refund = (cumulative: number) => {
    const { body, sig } = stripeEvent(ctx, 'charge.refunded', { id: 'ch_1', object: 'charge', amount_refunded: cumulative, currency: 'eur', payment_intent: 'pi_3Ttest000001', metadata: { order_id: o.orderId } });
    return handlePaymentWebhook(ctx, body, sig, 'stripe').detail;
  };
  assert.equal(refund(1000), 'PARTIALLY_REFUNDED');
  assert.equal(getOrder(ctx, o.orderId).payment_state, 'CONFIRMED');
  assert.equal(refund(1000), 'REFUND_ALREADY_BOOKED', 'neues Event, gleicher kumulativer Betrag');
  assert.equal(refund(amount), 'REFUNDED');
  assert.equal(ctx.db.get<{ s: number }>(`SELECT SUM(amount_minor) AS s FROM ledger_entries WHERE account = 'refunds'`)?.s, -amount);
  assert.equal(getOrder(ctx, o.orderId).payment_state, 'REFUNDED');
});

test('IE-067 Widerruf-Ablauf: Antrag -> Eigentümer -> Provider -> Webhook -> Ledger, Gutschrift, Download gesperrt', async () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  autopilotTick(ctx);
  const req = createRefundRequest(ctx, d.orderId, 'customer_withdrawal', 'Widerruf innerhalb der Frist');
  assert.equal(req.status, 'PENDING_OWNER');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM ledger_entries WHERE account = 'refunds'`), 0, 'nichts automatisch erstattet');
  assert.throws(() => createRefundRequest(ctx, d.orderId, 'complaint', 'nochmal'), /REFUND_ALREADY_OPEN/);
  await assert.rejects(approveRefundRequest(ctx, req.refund_request_id, 'ai', createMockProvider(ctx)), /REFUND_OWNER_ONLY/);
  const r = await approveRefundRequest(ctx, req.refund_request_id, 'owner', createMockProvider(ctx));
  assert.equal(r.status, 'CONFIRMED', 'per signiertem Webhook bestätigt');
  assert.match(r.provider_refund_id ?? '', /^re_test_/);
  assert.equal(getOrder(ctx, d.orderId).payment_state, 'REFUNDED');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM invoices WHERE order_id = ? AND kind = 'CREDIT_NOTE'`, d.orderId), 1);
  assert.ok(getDeliveryByOrder(ctx, d.orderId)?.revoked_at);
  assert.equal(oppState(ctx, d.opportunityId), 'CANCELLED');
});

test('Erstattungsantrag ablehnen und Grenzen: nur bezahlte Aufträge, nur Eigentümer', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const req = createRefundRequest(ctx, d.orderId, 'complaint', 'unzufrieden');
  assert.throws(() => rejectRefundRequest(ctx, req.refund_request_id, 'ai', 'x'), /OWNER_REQUIRED/);
  rejectRefundRequest(ctx, req.refund_request_id, 'owner', 'Leistung vertragsgemäß');
  assert.equal(getRefundRequest(ctx, req.refund_request_id).status, 'REJECTED');
  assert.throws(() => createRefundRequest(ctx, d.orderId, 'owner', 'zu viel', undefined, 999_999_999), /REFUND_AMOUNT_INVALID/);
  assert.throws(() => ctx.db.run('UPDATE refund_requests SET amount_minor = 1'), /REFUND_REQUEST_IMMUTABLE/);
});

test('Stripe-Erstattung: korrekte Anfrage mit Idempotenz; Providerfehler -> FAILED + Alarm, keine Buchung', async () => {
  const { ctx } = makeCtx({ env: stripeEnv });
  const o = await stripeOrder(ctx);
  payStripe(ctx, o.orderId);
  const ok = fakeStripe({ '/v1/refunds': () => ({ json: { id: 're_3Tok', status: 'pending', livemode: false } }) });
  const req = createRefundRequest(ctx, o.orderId, 'owner', 'Test');
  const r = await approveRefundRequest(ctx, req.refund_request_id, 'owner', createStripeProvider({ secretKey: SK, fetchFn: ok.fn }));
  assert.equal(r.status, 'REQUESTED', 'bis zum Webhook nicht bestätigt');
  const body = new URLSearchParams(ok.calls[0]?.body);
  assert.deepEqual([body.get('payment_intent'), body.get('metadata[refund_request_id]')], ['pi_3Ttest000001', req.refund_request_id]);
  assert.equal(ok.calls[0]?.headers['idempotency-key'], `ie-refund-${req.refund_request_id}`);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM ledger_entries WHERE account = 'refunds'`), 0);

  const { ctx: c2 } = makeCtx({ env: stripeEnv });
  const o2 = await stripeOrder(c2);
  payStripe(c2, o2.orderId);
  const fail = fakeStripe({ '/v1/refunds': () => ({ status: 402, json: { error: { code: 'charge_already_refunded' } } }) });
  const req2 = createRefundRequest(c2, o2.orderId, 'owner', 'Test');
  await assert.rejects(approveRefundRequest(c2, req2.refund_request_id, 'owner', createStripeProvider({ secretKey: SK, fetchFn: fail.fn })), /REFUND_PROVIDER_FAILED/);
  assert.equal(getRefundRequest(c2, req2.refund_request_id).status, 'FAILED');
  assert.equal(c2.audit.byType('alert.refund_failed').length, 1);
});

test('Stripe-Schlüsselprüfung: nur lesend, erkennt Live und ungültige Schlüssel', async () => {
  const ok = fakeStripe({ '/v1/balance': () => ({ json: { object: 'balance', livemode: false } }) });
  assert.deepEqual(await checkStripeKey(SK, ok.fn), { ok: true });
  assert.equal(ok.calls[0]?.method, 'GET');
  const live = fakeStripe({ '/v1/balance': () => ({ json: { livemode: true } }) });
  assert.deepEqual(await checkStripeKey(SK, live.fn), { ok: false, reason: 'NICHT_TESTMODUS' });
  const bad = fakeStripe({ '/v1/balance': () => ({ status: 401, json: {} }) });
  assert.deepEqual(await checkStripeKey(SK, bad.fn), { ok: false, reason: 'HTTP_401' });
  assert.deepEqual(await checkStripeKey(SK.replace('_test_', '_live_'), ok.fn), { ok: false, reason: 'KEIN_TESTSCHLUESSEL' });
});
