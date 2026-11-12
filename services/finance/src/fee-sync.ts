import { claimNext, completeJob, failJob } from '../../ai-orchestrator/src/queue.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { findOrder } from '../../core-api/src/orders.ts';
import { appendLedger } from './ledger.ts';
import type { PaymentProvider } from './providers/types.ts';

/**
 * Gebührenabgleich: holt die vom Provider BESTÄTIGTE Gebühr (Stripe Balance Transaction) und bucht sie
 * exakt (IE-071). Noch nicht verfügbar -> Retry mit Backoff. Bis dahin bleibt die Reconciliation auf REVIEW.
 */
export async function runFeeSync(ctx: AppContext, provider: PaymentProvider, maxJobs = 10): Promise<{ booked: number; pending: number; failed: number }> {
  const out = { booked: 0, pending: 0, failed: 0 };
  for (let i = 0; i < maxJobs; i++) {
    const job = claimNext(ctx, ['fee_sync']);
    if (!job) break;
    const payload = JSON.parse(job.payload_json) as { paymentRef?: string; eventId?: string };
    const order = job.order_id ? findOrder(ctx, job.order_id) : undefined;
    if (!order || !payload.paymentRef || !payload.eventId) {
      failJob(ctx, job.job_id, 'FEE_SYNC_PAYLOAD_INVALID');
      out.failed++;
      continue;
    }
    try {
      const fee = await provider.fetchFee(payload.paymentRef, order.currency);
      if (!fee) {
        failJob(ctx, job.job_id, 'FEE_NOT_YET_AVAILABLE');
        out.pending++;
        continue;
      }
      if (fee.feeMinor > 0) {
        appendLedger(ctx, {
          orderId: order.order_id, account: 'provider_fees', amountMinor: -fee.feeMinor, currency: order.currency,
          sourceType: 'payment_event', sourceRef: payload.eventId, description: `Zahlungsgebühr laut Provider (${fee.ref})`,
        });
      }
      completeJob(ctx, job.job_id);
      ctx.audit.record({ type: 'fee.synced', actor: 'provider', subjectType: 'order', subjectId: order.order_id, data: { fee: fee.feeMinor, ref: fee.ref }, testMode: ctx.config.testMode });
      out.booked++;
    } catch (e) {
      failJob(ctx, job.job_id, (e as Error).message);
      out.failed++;
    }
  }
  return out;
}
