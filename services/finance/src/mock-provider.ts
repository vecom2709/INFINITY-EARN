import { randomToken } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import type { OrderRow } from '../../core-api/src/orders.ts';
import { handlePaymentWebhook, type ProviderEvent, type WebhookResult } from './payments.ts';
import { signPayload } from './webhook.ts';

/**
 * NUR TESTMODUS. Simuliert einen Zahlungsanbieter, der signierte Webhooks sendet.
 * Die Events laufen durch exakt denselben Verifikationspfad wie echte Provider-Webhooks.
 * Es fließt kein Geld; alle Events tragen livemode=false.
 */
function assertTestOnly(ctx: AppContext): void {
  if (!ctx.config.testMode || ctx.config.payment.provider !== 'mock') throw new WorkflowError('MOCK_PROVIDER_TEST_ONLY');
}

export function buildMockEvent(ctx: AppContext, type: string, object: Record<string, unknown>): ProviderEvent {
  return { id: `evt_test_${randomToken(12)}`, type, livemode: false, created: Math.floor(ctx.clock().getTime() / 1000), data: { object } };
}

export function signedDelivery(ctx: AppContext, event: ProviderEvent): { body: string; signature: string } {
  const body = JSON.stringify(event);
  return { body, signature: signPayload(ctx.config.payment.webhookSecret, body, Math.floor(ctx.clock().getTime() / 1000)) };
}

export function deliverMockEvent(ctx: AppContext, event: ProviderEvent): WebhookResult {
  assertTestOnly(ctx);
  const { body, signature } = signedDelivery(ctx, event);
  return handlePaymentWebhook(ctx, body, signature, 'mock');
}

/** Simulierte Testgebühr (1,5 % + 0,25 €) – nur zur Prüfung der Gebührenbuchung, keine echte Tarifangabe. */
export const mockFee = (amountMinor: number): number => Math.ceil(amountMinor * 0.015) + 25;

export function mockPay(ctx: AppContext, order: OrderRow, opts: { outcome?: 'paid' | 'pending' | 'failed' } = {}): WebhookResult {
  assertTestOnly(ctx);
  if (!order.checkout_session_id) throw new WorkflowError('NO_CHECKOUT_SESSION');
  const outcome = opts.outcome ?? 'paid';
  if (outcome === 'failed') {
    return deliverMockEvent(ctx, buildMockEvent(ctx, 'checkout.session.async_payment_failed', { id: order.checkout_session_id, metadata: { order_id: order.order_id } }));
  }
  return deliverMockEvent(
    ctx,
    buildMockEvent(ctx, 'checkout.session.completed', {
      id: order.checkout_session_id,
      amount_total: order.amount_minor,
      currency: order.currency.toLowerCase(),
      payment_status: outcome === 'paid' ? 'paid' : 'unpaid',
      fee_minor: outcome === 'paid' ? mockFee(order.amount_minor) : null,
      payment_intent: `pi_test_mock_${order.order_id.slice(4, 20)}`,
      metadata: { order_id: order.order_id },
    }),
  );
}

export function mockPayout(ctx: AppContext, orderIds: string[], amountMinor: number, currency: string, failed = false): WebhookResult {
  assertTestOnly(ctx);
  return deliverMockEvent(
    ctx,
    buildMockEvent(ctx, failed ? 'payout.failed' : 'payout.paid', {
      id: `po_test_${randomToken(10)}`,
      amount: amountMinor,
      currency: currency.toLowerCase(),
      failure_message: failed ? 'account_closed (Test)' : null,
      metadata: { order_ids: orderIds.join(',') },
    }),
  );
}
