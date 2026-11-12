import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderSchema, validate } from '../../packages/contracts/src/schemas.ts';
import { getOrder, orderContract } from '../../services/core-api/src/orders.ts';
import { buildMockEvent, deliverMockEvent, mockFee, mockPay, signedDelivery } from '../../services/finance/src/mock-provider.ts';
import { handlePaymentWebhook } from '../../services/finance/src/payments.ts';
import { signPayload } from '../../services/finance/src/webhook.ts';
import { downloadArtifact, getDeliveryByOrder, issueDownloadToken } from '../../services/product-factory/src/delivery.ts';
import { runProductionOnce } from '../../services/product-factory/src/production.ts';
import { count, makeCtx, oppState, toDelivered, toOrder, toPaid } from '../helpers.ts';

const ledger = (ctx: ReturnType<typeof makeCtx>['ctx'], orderId: string, account: string): number =>
  ctx.db.get<{ s: number }>('SELECT COALESCE(SUM(amount_minor),0) AS s FROM ledger_entries WHERE order_id = ? AND account = ?', orderId, account)?.s ?? 0;

test('IE-031 gültiger Checkout-Testevent: Testorder payment confirmed', () => {
  const { ctx } = makeCtx();
  const p = toPaid(ctx);
  const o = getOrder(ctx, p.orderId);
  assert.equal(o.payment_state, 'CONFIRMED');
  assert.equal(o.test_mode, 1);
  assert.equal(oppState(ctx, p.opportunityId), 'PRODUCTION_QUEUED');
  const contract = orderContract(ctx, p.orderId);
  assert.deepEqual(validate(orderSchema, contract), []);
  assert.deepEqual(contract.provider_event_ids, [p.payEventId]);
});

test('IE-032 gefälschte Webhook-Signatur: Event abgelehnt, nichts gespeichert', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  const ev = buildMockEvent(ctx, 'checkout.session.completed', { id: getOrder(ctx, o.orderId).checkout_session_id, amount_total: 1, currency: 'eur', payment_status: 'paid', metadata: { order_id: o.orderId } });
  const body = JSON.stringify(ev);
  assert.throws(() => handlePaymentWebhook(ctx, body, signPayload('whsec_attacker_secret_xxxxxxxx', body, Math.floor(ctx.clock().getTime() / 1000))), /SIGNATURE_INVALID/);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM payment_events'), 0);
  assert.equal(getOrder(ctx, o.orderId).payment_state, 'UNPAID');
});

test('IE-033 IE-075 doppelter Provider-Event: keine Doppelbuchung', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  const order = getOrder(ctx, o.orderId);
  const ev = buildMockEvent(ctx, 'checkout.session.completed', { id: order.checkout_session_id, amount_total: order.amount_minor, currency: 'eur', payment_status: 'paid', fee_minor: 100, metadata: { order_id: o.orderId } });
  assert.equal(deliverMockEvent(ctx, ev).status, 'processed');
  assert.equal(deliverMockEvent(ctx, ev).status, 'duplicate');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM ledger_entries WHERE account = 'customer_payments'`), 1);
  assert.equal(ledger(ctx, o.orderId, 'customer_payments'), order.amount_minor);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM jobs'), 1);
});

test('IE-034 Frontend-Redirect ohne Webhook: keine Auslieferung', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  assert.equal(runProductionOnce(ctx).processed, 0);
  assert.equal(getOrder(ctx, o.orderId).payment_state, 'UNPAID');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM deliveries'), 0);
});

test('IE-035 asynchrone Zahlung pending: Produktion wartet', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  assert.equal(mockPay(ctx, getOrder(ctx, o.orderId), { outcome: 'pending' }).detail, 'PENDING');
  assert.equal(getOrder(ctx, o.orderId).payment_state, 'PENDING');
  assert.equal(runProductionOnce(ctx).processed, 0);
  assert.equal(oppState(ctx, o.opportunityId), 'CUSTOMER_ACCEPTED');
  const order = getOrder(ctx, o.orderId);
  const ok = deliverMockEvent(ctx, buildMockEvent(ctx, 'checkout.session.async_payment_succeeded', { id: order.checkout_session_id, amount_total: order.amount_minor, currency: 'eur', fee_minor: 90, metadata: { order_id: o.orderId } }));
  assert.equal(ok.detail, 'CONFIRMED');
  assert.equal(runProductionOnce(ctx).results[0]?.outcome, 'DELIVERED');
});

test('IE-036 Zahlung fehlgeschlagen: keine Produktion', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  assert.equal(mockPay(ctx, getOrder(ctx, o.orderId), { outcome: 'failed' }).detail, 'FAILED');
  assert.equal(oppState(ctx, o.opportunityId), 'PAYMENT_FAILED');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM jobs'), 0);
  assert.equal(runProductionOnce(ctx).processed, 0);
});

test('IE-037 Zahlung bestätigt: Produktion nach Policy zugelassen', () => {
  const { ctx } = makeCtx();
  const p = toPaid(ctx);
  const run = runProductionOnce(ctx);
  assert.equal(run.results[0]?.outcome, 'DELIVERED');
  assert.ok(ctx.audit.byType('policy.allowed').some((a) => a.data_json.includes('production.start')));
  assert.equal(oppState(ctx, p.opportunityId), 'DELIVERED');
});

test('IE-038 Chargeback erhalten: Order/Ledger auf Dispute, Lieferung gesperrt', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const order = getOrder(ctx, d.orderId);
  const r = deliverMockEvent(ctx, buildMockEvent(ctx, 'charge.dispute.created', { id: 'dp_test_1', amount: order.amount_minor, currency: 'eur', metadata: { order_id: d.orderId } }));
  assert.equal(r.detail, 'DISPUTED');
  assert.equal(getOrder(ctx, d.orderId).payment_state, 'DISPUTED');
  assert.equal(oppState(ctx, d.opportunityId), 'DISPUTE');
  assert.equal(ledger(ctx, d.orderId, 'disputes'), -order.amount_minor);
  assert.ok(getDeliveryByOrder(ctx, d.orderId)?.revoked_at);
});

test('IE-039 Refund bestätigt: korrekte Rückbuchung, Download gesperrt', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const order = getOrder(ctx, d.orderId);
  const r = deliverMockEvent(ctx, buildMockEvent(ctx, 'charge.refunded', { id: 'ch_test_1', amount_refunded: order.amount_minor, currency: 'eur', metadata: { order_id: d.orderId } }));
  assert.equal(r.detail, 'REFUNDED');
  assert.equal(ledger(ctx, d.orderId, 'refunds'), -order.amount_minor);
  assert.equal(ledger(ctx, d.orderId, 'customer_payments'), order.amount_minor, 'Originalbuchung bleibt erhalten');
  assert.equal(oppState(ctx, d.opportunityId), 'CANCELLED');
  const del = getDeliveryByOrder(ctx, d.orderId);
  const dl = downloadArtifact(ctx, issueDownloadToken(ctx, del?.delivery_id ?? '', d.customerId), d.customerAccessKey ?? undefined);
  assert.equal(dl.ok, false);
});

test('IE-040 Live-Event im Testmodus: abgelehnt, DB-Trigger als zweite Sperre', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  const ev = { ...buildMockEvent(ctx, 'checkout.session.completed', { id: getOrder(ctx, o.orderId).checkout_session_id, amount_total: 1, currency: 'eur', payment_status: 'paid', metadata: { order_id: o.orderId } }), livemode: true };
  const { body, signature } = signedDelivery(ctx, ev);
  assert.throws(() => handlePaymentWebhook(ctx, body, signature), /LIVEMODE_MISMATCH/);
  assert.throws(
    () => ctx.db.run(`INSERT INTO payment_events (provider, provider_event_id, event_type, livemode, payload_sha256, test_mode, received_at) VALUES ('x','evt_live_1','t',1,'h',1,'now')`),
    /LIVE_MODE_DISABLED/,
  );
});

test('IE-071 Gebühren vom Provider bestätigt: exakte Gebühren verbucht', () => {
  const { ctx } = makeCtx();
  const p = toPaid(ctx);
  const order = getOrder(ctx, p.orderId);
  assert.equal(ledger(ctx, p.orderId, 'provider_fees'), -mockFee(order.amount_minor));
});

test('Betrag/Währung weicht ab: keine Bestätigung, manuelle Prüfung', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  const order = getOrder(ctx, o.orderId);
  const r = deliverMockEvent(ctx, buildMockEvent(ctx, 'checkout.session.completed', { id: order.checkout_session_id, amount_total: 1, currency: 'eur', payment_status: 'paid', metadata: { order_id: o.orderId } }));
  assert.equal(r.detail, 'AMOUNT_MISMATCH');
  assert.equal(getOrder(ctx, o.orderId).payment_state, 'UNPAID');
  assert.equal(oppState(ctx, o.opportunityId), 'MANUAL_REVIEW');
});
