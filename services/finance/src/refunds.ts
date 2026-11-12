import { newId } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { getOrder } from '../../core-api/src/orders.ts';
import { decide } from '../../core-api/src/policy-store.ts';
import type { PaymentProvider } from './providers/types.ts';

export type RefundOrigin = 'customer_withdrawal' | 'complaint' | 'qa_failure' | 'owner';

export interface RefundRequestRow {
  refund_request_id: string;
  order_id: string;
  amount_minor: number;
  currency: string;
  origin: RefundOrigin;
  reason: string;
  status: 'PENDING_OWNER' | 'REQUESTED' | 'CONFIRMED' | 'REJECTED' | 'FAILED';
  provider_refund_id: string | null;
  ticket_id: string | null;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  test_mode: number;
  created_at: string;
  updated_at: string;
}

const refundedSoFar = (ctx: AppContext, orderId: string): number =>
  -(ctx.db.get<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS s FROM ledger_entries WHERE order_id = ? AND account = 'refunds'`, orderId)?.s ?? 0);

/**
 * Rückerstattungsantrag anlegen (Widerruf, Reklamation, QA-Fehler). Es wird NICHTS automatisch erstattet:
 * Ob ein Widerrufsrecht bei digitalen Inhalten besteht, entscheidet der Eigentümer (Rechtsprüfung LA-07).
 */
export function createRefundRequest(ctx: AppContext, orderId: string, origin: RefundOrigin, reason: string, ticketId: string | null = null, amountMinor?: number): RefundRequestRow {
  const order = getOrder(ctx, orderId);
  if (order.payment_state !== 'CONFIRMED') throw new WorkflowError('NOT_REFUNDABLE', `Zahlungsstatus ${order.payment_state}`);
  const open = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM refund_requests WHERE order_id = ? AND status IN ('PENDING_OWNER','REQUESTED')`, orderId);
  if (open?.n) throw new WorkflowError('REFUND_ALREADY_OPEN');
  const remaining = order.amount_minor - refundedSoFar(ctx, orderId);
  const amount = amountMinor ?? remaining;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) throw new WorkflowError('REFUND_AMOUNT_INVALID');
  const now = ctx.clock().toISOString();
  const row: RefundRequestRow = {
    refund_request_id: newId('rfr'), order_id: orderId, amount_minor: amount, currency: order.currency, origin, reason: reason.slice(0, 1000),
    status: 'PENDING_OWNER', provider_refund_id: null, ticket_id: ticketId, decided_by: null, decision_note: null, decided_at: null,
    test_mode: order.test_mode, created_at: now, updated_at: now,
  };
  ctx.db.run(
    `INSERT INTO refund_requests (refund_request_id, order_id, amount_minor, currency, origin, reason, status, ticket_id, test_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING_OWNER', ?, ?, ?, ?)`,
    row.refund_request_id, orderId, amount, row.currency, origin, row.reason, ticketId, row.test_mode, now, now,
  );
  ctx.audit.record({ type: 'refund.requested', actor: origin === 'owner' ? 'owner' : 'customer', subjectType: 'order', subjectId: orderId, data: { refund_request_id: row.refund_request_id, origin, amount }, testMode: ctx.config.testMode });
  return row;
}

export function getRefundRequest(ctx: AppContext, id: string): RefundRequestRow {
  const r = ctx.db.get<RefundRequestRow>('SELECT * FROM refund_requests WHERE refund_request_id = ?', id);
  if (!r) throw new WorkflowError('REFUND_REQUEST_NOT_FOUND');
  return r;
}

export function rejectRefundRequest(ctx: AppContext, id: string, actor: 'owner' | 'ai' | 'system', note: string): void {
  if (actor !== 'owner') throw new WorkflowError('OWNER_REQUIRED');
  const r = getRefundRequest(ctx, id);
  if (r.status !== 'PENDING_OWNER') throw new WorkflowError('REFUND_NOT_PENDING');
  ctx.db.run(`UPDATE refund_requests SET status = 'REJECTED', decided_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE refund_request_id = ?`, actor, note.slice(0, 500), ctx.clock().toISOString(), ctx.clock().toISOString(), id);
  ctx.audit.record({ type: 'refund.rejected', actor, subjectType: 'refund_request', subjectId: id, data: { note: note.slice(0, 200) }, testMode: ctx.config.testMode });
}

/**
 * Eigentümer genehmigt -> Provider-Aufruf. Status REQUESTED; Ledger, Gutschrift und Sperre des Downloads
 * erfolgen ausschließlich nach dem bestätigenden Webhook `charge.refunded`.
 */
export async function approveRefundRequest(ctx: AppContext, id: string, actor: 'owner' | 'ai' | 'system', provider: PaymentProvider, note = ''): Promise<RefundRequestRow> {
  const r = getRefundRequest(ctx, id);
  if (r.status !== 'PENDING_OWNER') throw new WorkflowError('REFUND_NOT_PENDING');
  const order = getOrder(ctx, r.order_id);
  const already = refundedSoFar(ctx, order.order_id);
  const d = decide(ctx, { action: 'refund.initiate', amountMinor: r.amount_minor, capturedMinor: order.payment_state === 'CONFIRMED' ? order.amount_minor : 0, alreadyRefundedMinor: already }, actor, { type: 'refund_request', id });
  if (!d.allowed) throw new WorkflowError('REFUND_BLOCKED', `${d.rule} – ${d.reason}`);
  const now = ctx.clock().toISOString();
  ctx.db.run(`UPDATE refund_requests SET status = 'REQUESTED', decided_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE refund_request_id = ?`, actor, note.slice(0, 500), now, now, id);
  try {
    const res = await provider.requestRefund(order, r.amount_minor, id, already);
    ctx.db.run(`UPDATE refund_requests SET provider_refund_id = ?, updated_at = ? WHERE refund_request_id = ?`, res.providerRefundId, ctx.clock().toISOString(), id);
    if (res.status === 'failed' || res.status === 'canceled') {
      ctx.db.run(`UPDATE refund_requests SET status = 'FAILED', updated_at = ? WHERE refund_request_id = ?`, ctx.clock().toISOString(), id);
    }
    ctx.audit.record({ type: 'refund.provider_requested', actor, subjectType: 'refund_request', subjectId: id, data: { provider: provider.name, provider_refund_id: res.providerRefundId, status: res.status }, testMode: ctx.config.testMode });
  } catch (e) {
    ctx.db.run(`UPDATE refund_requests SET status = 'FAILED', decision_note = ?, updated_at = ? WHERE refund_request_id = ?`, (e as Error).message.slice(0, 300), ctx.clock().toISOString(), id);
    ctx.audit.record({ type: 'alert.refund_failed', actor, subjectType: 'refund_request', subjectId: id, data: { error: (e as Error).message }, testMode: ctx.config.testMode });
    throw new WorkflowError('REFUND_PROVIDER_FAILED', (e as Error).message);
  }
  return getRefundRequest(ctx, id);
}
