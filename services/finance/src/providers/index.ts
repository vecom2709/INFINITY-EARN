import { randomToken } from '../../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../../core-api/src/context.ts';
import type { OrderRow } from '../../../core-api/src/orders.ts';
import { buildMockEvent, deliverMockEvent } from '../mock-provider.ts';
import { createStripeProvider } from './stripe.ts';
import { ProviderError, type HttpFetch, type PaymentProvider } from './types.ts';

/** Mock-Provider (nur Testmodus): Rückerstattung wird als signierter Test-Webhook ausgeliefert. */
export function createMockProvider(ctx: AppContext): PaymentProvider {
  return {
    name: 'mock',
    async createCheckout(_order: OrderRow) {
      const sessionId = `cs_test_mock_${randomToken(16)}`;
      return { sessionId, url: `/checkout/mock/${sessionId}` };
    },
    async requestRefund(order: OrderRow, amountMinor, refundRequestId, alreadyRefundedMinor) {
      const id = `re_test_${randomToken(10)}`;
      deliverMockEvent(ctx, buildMockEvent(ctx, 'charge.refunded', {
        id: `ch_test_${randomToken(8)}`,
        amount_refunded: alreadyRefundedMinor + amountMinor,
        currency: order.currency.toLowerCase(),
        payment_intent: order.provider_payment_ref,
        metadata: { order_id: order.order_id, refund_request_id: refundRequestId },
      }));
      return { providerRefundId: id, status: 'succeeded' };
    },
    async fetchFee() {
      return null; // Mock-Events tragen die Gebühr bereits im Event (fee_minor)
    },
  };
}

export function providerFor(ctx: AppContext, fetchFn?: HttpFetch): PaymentProvider {
  if (ctx.config.payment.provider === 'stripe') {
    if (!ctx.config.payment.stripeSecretKey) throw new ProviderError('STRIPE_NOT_CONFIGURED');
    return createStripeProvider({ secretKey: ctx.config.payment.stripeSecretKey, apiBase: ctx.config.payment.stripeApiBase, fetchFn });
  }
  return createMockProvider(ctx);
}
