import { sha256Hex, newId } from '../../../packages/shared/src/crypto.ts';
import { isUniqueViolation } from '../../../packages/storage/src/errors.ts';
import { enqueueJob } from '../../ai-orchestrator/src/queue.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { tryTransition } from '../../core-api/src/opportunities.ts';
import { findOrder, setFulfillmentState, setPaymentState, type OrderRow } from '../../core-api/src/orders.ts';
import { revokeDelivery } from '../../product-factory/src/delivery.ts';
import { createCreditNote } from './invoice.ts';
import { appendLedger } from './ledger.ts';
import { verifySignature } from './webhook.ts';

/** Provider-Event im Stripe-ähnlichen Format. */
export interface ProviderEvent {
  id: string;
  type: string;
  livemode: boolean;
  created: number;
  data: { object: Record<string, unknown> };
}

export class WebhookRejected extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'WebhookRejected';
  }
}

export type WebhookResult = { status: 'processed' | 'duplicate' | 'ignored'; eventId: string; detail?: string };

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length < 300 ? v : null);
const int = (v: unknown): number | null => (Number.isSafeInteger(v) ? (v as number) : null);
const meta = (o: Record<string, unknown>): Record<string, unknown> => (o.metadata && typeof o.metadata === 'object' ? (o.metadata as Record<string, unknown>) : {});

function parseEvent(raw: string): ProviderEvent {
  let e: unknown;
  try {
    e = JSON.parse(raw);
  } catch {
    throw new WebhookRejected('PAYLOAD_NOT_JSON');
  }
  const ev = e as Partial<ProviderEvent>;
  if (!ev || typeof ev.id !== 'string' || !/^evt_[A-Za-z0-9_-]{6,100}$/.test(ev.id)) throw new WebhookRejected('EVENT_ID_INVALID');
  if (typeof ev.type !== 'string' || typeof ev.livemode !== 'boolean' || !ev.data || typeof ev.data.object !== 'object' || ev.data.object === null) {
    throw new WebhookRejected('EVENT_SHAPE_INVALID');
  }
  return ev as ProviderEvent;
}

/**
 * Einziger Weg, einen Zahlungsstatus zu setzen: signierter Provider-Webhook (IE-031..IE-040, IE-084).
 * Ein Frontend-Redirect kann keinen Zahlungsstatus ändern.
 */
export function handlePaymentWebhook(ctx: AppContext, rawBody: string, signatureHeader: string | undefined, provider = 'mock'): WebhookResult {
  const nowSec = Math.floor(ctx.clock().getTime() / 1000);
  const sig = verifySignature(ctx.config.payment.webhookSecret, rawBody, signatureHeader, nowSec);
  if (!sig.ok) {
    ctx.audit.record({ type: 'payment.webhook_rejected', actor: 'provider', subjectType: 'webhook', subjectId: provider, data: { reason: sig.reason }, testMode: ctx.config.testMode });
    throw new WebhookRejected(sig.reason);
  }
  const event = parseEvent(rawBody);
  if (ctx.config.testMode && event.livemode !== false) {
    ctx.audit.record({ type: 'payment.webhook_rejected', actor: 'provider', subjectType: 'webhook', subjectId: event.id, data: { reason: 'LIVEMODE_MISMATCH' }, testMode: true });
    throw new WebhookRejected('LIVEMODE_MISMATCH');
  }
  const obj = event.data.object;
  const orderId = str(meta(obj).order_id);
  // Disputes tragen bei Stripe keine Metadaten -> Zuordnung über die PaymentIntent-Referenz.
  const paymentRef = str(obj.payment_intent);
  const order = orderId
    ? findOrder(ctx, orderId)
    : paymentRef
      ? ctx.db.get<OrderRow>('SELECT * FROM orders WHERE provider_payment_ref = ?', paymentRef)
      : undefined;

  return ctx.db.tx(() => {
    try {
      ctx.db.run(
        `INSERT INTO payment_events (provider, provider_event_id, event_type, order_id, amount_minor, fee_minor, currency, livemode, payload_sha256, test_mode, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        provider,
        event.id,
        event.type,
        order?.order_id ?? null,
        int(obj.amount_total) ?? int(obj.amount_refunded) ?? int(obj.amount),
        int(obj.fee_minor),
        str(obj.currency)?.toUpperCase() ?? null,
        event.livemode ? 1 : 0,
        sha256Hex(rawBody),
        ctx.config.testMode ? 1 : 0,
        ctx.clock().toISOString(),
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        ctx.audit.record({ type: 'payment.duplicate_ignored', actor: 'provider', subjectType: 'payment_event', subjectId: event.id, testMode: ctx.config.testMode });
        return { status: 'duplicate', eventId: event.id } as WebhookResult;
      }
      throw e;
    }
    return dispatch(ctx, event, order);
  });
}

function dispatch(ctx: AppContext, event: ProviderEvent, order: OrderRow | undefined): WebhookResult {
  const obj = event.data.object;
  const ignored = (detail: string): WebhookResult => {
    ctx.audit.record({ type: 'payment.event_ignored', actor: 'provider', subjectType: 'payment_event', subjectId: event.id, data: { type: event.type, detail }, testMode: ctx.config.testMode });
    return { status: 'ignored', eventId: event.id, detail };
  };

  if (event.type === 'payout.paid' || event.type === 'payout.failed') return handlePayout(ctx, event);
  if (!order) return ignored('ORDER_UNKNOWN');

  switch (event.type) {
    case 'checkout.session.completed': {
      if (str(obj.id) !== order.checkout_session_id) return ignored('SESSION_MISMATCH');
      if (obj.payment_status === 'paid') return confirm(ctx, event, order);
      setPaymentState(ctx, order.order_id, 'PENDING');
      ctx.audit.record({ type: 'payment.pending', actor: 'provider', subjectType: 'order', subjectId: order.order_id, data: { event: event.id }, testMode: ctx.config.testMode });
      return { status: 'processed', eventId: event.id, detail: 'PENDING' };
    }
    case 'checkout.session.async_payment_succeeded':
      if (str(obj.id) !== order.checkout_session_id) return ignored('SESSION_MISMATCH');
      return confirm(ctx, event, order);
    case 'checkout.session.async_payment_failed':
    case 'payment_intent.payment_failed': {
      if (order.payment_state === 'CONFIRMED') return ignored('ALREADY_CONFIRMED');
      setPaymentState(ctx, order.order_id, 'FAILED');
      tryTransition(ctx, order.opportunity_id, 'PAYMENT_FAILED', 'provider', `event ${event.id}`);
      ctx.audit.record({ type: 'payment.failed', actor: 'provider', subjectType: 'order', subjectId: order.order_id, data: { event: event.id }, testMode: ctx.config.testMode });
      return { status: 'processed', eventId: event.id, detail: 'FAILED' };
    }
    case 'charge.refunded': {
      // amount_refunded ist bei Stripe KUMULATIV -> nur die Differenz zu bereits gebuchten Erstattungen buchen.
      const cumulative = int(obj.amount_refunded);
      if (cumulative === null || cumulative <= 0 || cumulative > order.amount_minor) return ignored('REFUND_AMOUNT_INVALID');
      const booked = -(ctx.db.get<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS s FROM ledger_entries WHERE order_id = ? AND account = 'refunds'`, order.order_id)?.s ?? 0);
      const delta = cumulative - booked;
      if (delta <= 0) return ignored('REFUND_ALREADY_BOOKED');
      appendLedger(ctx, { orderId: order.order_id, account: 'refunds', amountMinor: -delta, currency: order.currency, sourceType: 'payment_event', sourceRef: event.id, description: 'Rückerstattung (Provider bestätigt)' });
      const requestId = str(meta(obj).refund_request_id);
      const req = requestId
        ? ctx.db.get<{ refund_request_id: string }>(`SELECT refund_request_id FROM refund_requests WHERE refund_request_id = ? AND order_id = ?`, requestId, order.order_id)
        : ctx.db.get<{ refund_request_id: string }>(`SELECT refund_request_id FROM refund_requests WHERE order_id = ? AND status = 'REQUESTED' ORDER BY created_at LIMIT 1`, order.order_id);
      if (req) ctx.db.run(`UPDATE refund_requests SET status = 'CONFIRMED', updated_at = ? WHERE refund_request_id = ?`, ctx.clock().toISOString(), req.refund_request_id);
      if (cumulative < order.amount_minor) {
        ctx.audit.record({ type: 'refund.partial', actor: 'provider', subjectType: 'order', subjectId: order.order_id, data: { event: event.id, delta, cumulative }, testMode: ctx.config.testMode });
        return { status: 'processed', eventId: event.id, detail: 'PARTIALLY_REFUNDED' };
      }
      setPaymentState(ctx, order.order_id, 'REFUNDED');
      setFulfillmentState(ctx, order.order_id, 'CANCELLED');
      revokeDelivery(ctx, order.order_id, 'REFUNDED');
      const inv = ctx.db.get<{ invoice_id: string }>(`SELECT invoice_id FROM invoices WHERE order_id = ? AND kind = 'INVOICE' AND status NOT IN ('CREDITED','TAX_REVIEW') ORDER BY created_at DESC LIMIT 1`, order.order_id);
      if (inv) createCreditNote(ctx, inv.invoice_id, `Rückerstattung ${event.id}`, 'provider');
      if (!tryTransition(ctx, order.opportunity_id, 'REFUND_PENDING', 'provider', `event ${event.id}`) ||
          !tryTransition(ctx, order.opportunity_id, 'CANCELLED', 'provider', 'Rückerstattung abgeschlossen')) {
        tryTransition(ctx, order.opportunity_id, 'MANUAL_REVIEW', 'provider', 'Rückerstattung in unerwartetem Zustand');
      }
      ctx.audit.record({ type: 'refund.completed', actor: 'provider', subjectType: 'order', subjectId: order.order_id, data: { event: event.id, amount: delta, credit_note: !!inv }, testMode: ctx.config.testMode });
      return { status: 'processed', eventId: event.id, detail: 'REFUNDED' };
    }
    case 'charge.dispute.created': {
      const amount = int(obj.amount) ?? order.amount_minor;
      appendLedger(ctx, { orderId: order.order_id, account: 'disputes', amountMinor: -amount, currency: order.currency, sourceType: 'payment_event', sourceRef: event.id, description: 'Chargeback/Dispute (Mittel einbehalten)' });
      setPaymentState(ctx, order.order_id, 'DISPUTED');
      revokeDelivery(ctx, order.order_id, 'DISPUTED');
      tryTransition(ctx, order.opportunity_id, 'DISPUTE', 'provider', `event ${event.id}`);
      ctx.audit.record({ type: 'dispute.opened', actor: 'provider', subjectType: 'order', subjectId: order.order_id, data: { event: event.id, amount }, testMode: ctx.config.testMode });
      return { status: 'processed', eventId: event.id, detail: 'DISPUTED' };
    }
    default:
      return ignored('EVENT_TYPE_NOT_HANDLED');
  }
}

function confirm(ctx: AppContext, event: ProviderEvent, order: OrderRow): WebhookResult {
  const obj = event.data.object;
  if (order.payment_state === 'CONFIRMED') return { status: 'ignored', eventId: event.id, detail: 'ALREADY_CONFIRMED' };
  const amount = int(obj.amount_total);
  const currency = str(obj.currency)?.toUpperCase();
  if (amount !== order.amount_minor || currency !== order.currency) {
    ctx.audit.record({ type: 'payment.amount_mismatch', actor: 'provider', subjectType: 'order', subjectId: order.order_id, data: { event: event.id, amount, currency }, testMode: ctx.config.testMode });
    tryTransition(ctx, order.opportunity_id, 'MANUAL_REVIEW', 'provider', 'Betrag/Währung weicht ab');
    return { status: 'processed', eventId: event.id, detail: 'AMOUNT_MISMATCH' };
  }
  setPaymentState(ctx, order.order_id, 'CONFIRMED');
  const paymentRef = str(obj.payment_intent);
  if (paymentRef) ctx.db.run('UPDATE orders SET provider_payment_ref = ? WHERE order_id = ?', paymentRef, order.order_id);
  appendLedger(ctx, { orderId: order.order_id, account: 'customer_payments', amountMinor: amount, currency, sourceType: 'payment_event', sourceRef: event.id, description: 'Zahlungseingang (Provider bestätigt)' });
  const fee = int(obj.fee_minor);
  if (fee !== null && fee > 0) {
    appendLedger(ctx, { orderId: order.order_id, account: 'provider_fees', amountMinor: -fee, currency, sourceType: 'payment_event', sourceRef: event.id, description: 'Zahlungsgebühr (Provider bestätigt)' });
  } else if (paymentRef) {
    // Stripe liefert die Gebühr erst über die Balance Transaction -> späterer Abgleich (Reconciliation bleibt bis dahin REVIEW).
    enqueueJob(ctx, { kind: 'fee_sync', orderId: order.order_id, idempotencyKey: `fee_sync:${order.order_id}`, payload: { paymentRef, eventId: event.id }, maxRetries: 8 });
  }
  tryTransition(ctx, order.opportunity_id, 'PAYMENT_CONFIRMED', 'provider', `event ${event.id}`);
  const { created } = enqueueJob(ctx, { kind: 'production', orderId: order.order_id, idempotencyKey: `production:${order.order_id}`, priority: 10 });
  if (created) {
    setFulfillmentState(ctx, order.order_id, 'QUEUED');
    tryTransition(ctx, order.opportunity_id, 'PRODUCTION_QUEUED', 'system', 'Produktionsjob eingereiht');
  }
  ctx.audit.record({ type: 'payment.confirmed', actor: 'provider', subjectType: 'order', subjectId: order.order_id, data: { event: event.id, amount, fee }, testMode: ctx.config.testMode });
  return { status: 'processed', eventId: event.id, detail: 'CONFIRMED' };
}

function handlePayout(ctx: AppContext, event: ProviderEvent): WebhookResult {
  const obj = event.data.object;
  const payoutId = str(obj.id);
  const amount = int(obj.amount);
  const currency = str(obj.currency)?.toUpperCase();
  if (!payoutId || amount === null || !currency) return { status: 'ignored', eventId: event.id, detail: 'PAYOUT_SHAPE_INVALID' };
  const orderIds = (str(meta(obj).order_ids) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const status = event.type === 'payout.paid' ? 'SENT' : 'FAILED';
  const now = ctx.clock().toISOString();
  const existing = ctx.db.get<{ payout_id: string }>('SELECT payout_id FROM payouts WHERE provider_payout_id = ?', payoutId);
  if (existing) {
    ctx.db.run('UPDATE payouts SET status = ?, failure_reason = ?, provider_event_id = ?, updated_at = ? WHERE payout_id = ?', status, str(obj.failure_message), event.id, now, existing.payout_id);
  } else {
    ctx.db.run(
      `INSERT INTO payouts (payout_id, provider, provider_payout_id, amount_minor, currency, status, failure_reason, order_ids_json, provider_event_id, test_mode, created_at, updated_at)
       VALUES (?, 'mock', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId('pay'), payoutId, amount, currency, status, str(obj.failure_message), JSON.stringify(orderIds), event.id, ctx.config.testMode ? 1 : 0, now, now,
    );
  }
  if (status === 'FAILED') {
    ctx.audit.record({ type: 'alert.payout_failed', actor: 'provider', subjectType: 'payout', subjectId: payoutId, data: { event: event.id, reason: str(obj.failure_message) }, testMode: ctx.config.testMode });
    return { status: 'processed', eventId: event.id, detail: 'PAYOUT_FAILED' };
  }
  appendLedger(ctx, { orderId: null, account: 'payouts', amountMinor: -amount, currency, sourceType: 'payout_event', sourceRef: event.id, description: `Auszahlung ${payoutId} vom Provider gemeldet (Bankeingang unbestätigt)` });
  for (const oid of orderIds) {
    const o = findOrder(ctx, oid);
    // 15.0: Abgeschlossen wird erst nach bestätigtem Bankeingang (bank-statement.ts), nicht schon bei der Auszahlungsmeldung.
    if (o) tryTransition(ctx, o.opportunity_id, 'PAYOUT_RECORDED', 'provider', `payout ${payoutId} – Bankeingang noch unbestätigt`);
  }
  ctx.audit.record({ type: 'payout.confirmed', actor: 'provider', subjectType: 'payout', subjectId: payoutId, data: { event: event.id, amount, bank_credit_confirmed: false }, testMode: ctx.config.testMode });
  return { status: 'processed', eventId: event.id, detail: 'PAYOUT_SENT' };
}
