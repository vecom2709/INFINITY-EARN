import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { checkoutPreflight, recordCheckoutSession } from '../../core-api/src/workflow.ts';
import type { PaymentProvider } from './providers/types.ts';

/** Checkout beim konfigurierten Provider anlegen. Fehler beim Provider ändern keinen Zahlungsstatus. */
export async function startCheckout(ctx: AppContext, orderId: string, provider: PaymentProvider): Promise<{ sessionId: string; url: string }> {
  const order = checkoutPreflight(ctx, orderId);
  const origin = ctx.config.publicOrigin.replace(/\/$/, '');
  let session;
  try {
    session = await provider.createCheckout(
      order,
      { successUrl: `${origin}/checkout/erfolg?order=${encodeURIComponent(orderId)}`, cancelUrl: `${origin}/portal` },
      `INFINITY EARN – B2B-Kalkulationstabelle (Auftrag ${orderId.slice(0, 12)}, TESTMODUS)`,
    );
  } catch (e) {
    ctx.audit.record({ type: 'checkout.provider_failed', actor: 'system', subjectType: 'order', subjectId: orderId, data: { provider: provider.name, error: (e as Error).message }, testMode: ctx.config.testMode });
    throw new WorkflowError('CHECKOUT_PROVIDER_FAILED', (e as Error).message);
  }
  recordCheckoutSession(ctx, order, session.sessionId, provider.name);
  return session;
}
