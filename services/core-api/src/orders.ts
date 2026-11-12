import type { PaymentState } from '../../../packages/policies/src/engine.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';

export type FulfillmentState = 'NOT_STARTED' | 'QUEUED' | 'IN_PRODUCTION' | 'QA_FAILED' | 'QA_PASSED' | 'DELIVERED' | 'CANCELLED';

export interface OrderRow {
  order_id: string;
  quote_id: string;
  customer_id: string;
  opportunity_id: string;
  amount_minor: number;
  currency: string;
  payment_state: PaymentState;
  fulfillment_state: FulfillmentState;
  checkout_session_id: string | null;
  payment_provider: 'mock' | 'stripe' | null;
  provider_payment_ref: string | null;
  test_mode: number;
  created_at: string;
  updated_at: string;
}

export function getOrder(ctx: AppContext, orderId: string): OrderRow {
  const row = ctx.db.get<OrderRow>('SELECT * FROM orders WHERE order_id = ?', orderId);
  if (!row) throw new WorkflowError('ORDER_NOT_FOUND');
  return row;
}

export function findOrder(ctx: AppContext, orderId: string): OrderRow | undefined {
  return ctx.db.get<OrderRow>('SELECT * FROM orders WHERE order_id = ?', orderId);
}

export function setPaymentState(ctx: AppContext, orderId: string, state: PaymentState): void {
  ctx.db.run('UPDATE orders SET payment_state = ?, updated_at = ? WHERE order_id = ?', state, ctx.clock().toISOString(), orderId);
}

export function setFulfillmentState(ctx: AppContext, orderId: string, state: FulfillmentState): void {
  ctx.db.run('UPDATE orders SET fulfillment_state = ?, updated_at = ? WHERE order_id = ?', state, ctx.clock().toISOString(), orderId);
}

/** Order im Schema-Format (packages/contracts order.schema.json). */
export function orderContract(ctx: AppContext, orderId: string): Record<string, unknown> {
  const o = getOrder(ctx, orderId);
  const events = ctx.db.all<{ provider_event_id: string }>('SELECT provider_event_id FROM payment_events WHERE order_id = ? ORDER BY id', orderId);
  return {
    order_id: o.order_id,
    quote_id: o.quote_id,
    payment_state: o.payment_state,
    fulfillment_state: o.fulfillment_state,
    provider_event_ids: events.map((e) => e.provider_event_id),
    test_mode: o.test_mode === 1,
  };
}
