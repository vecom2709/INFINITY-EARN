import { bpsOf } from '../../../packages/contracts/src/money.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { accountingCurrency, ledgerSums } from './ledger.ts';

/**
 * Dashboard-Kennzahlen ausschließlich aus Ledger/Provider-Daten. LIVE und TEST strikt getrennt.
 * Steuerrücklage ist immer als Schätzung gekennzeichnet (IE-077). Bankeingang nur, wenn
 * bestätigt (IE-074) – in M0 nie automatisch.
 */
export interface Kpis {
  mode: 'LIVE' | 'TEST';
  currency: string;
  grossReceiptsMinor: number;
  refundsMinor: number;
  feesMinor: number;
  disputesMinor: number;
  otherCostsMinor: number;
  contributionMinor: number;
  taxReserve: { estimateMinor: number | null; label: 'SCHÄTZUNG – nicht buchhalterisch bestätigt' | 'nicht konfiguriert' };
  providerReportedPayoutsMinor: number;
  bankCreditConfirmedMinor: number;
  openOrders: number;
  qaFailures: number;
  failedPayouts: number;
}

export function computeKpis(ctx: AppContext, testMode: boolean): Kpis {
  const t = testMode ? 1 : 0;
  const s = ledgerSums(ctx, testMode);
  const contribution = s.customer_payments + s.refunds + s.provider_fees + s.disputes + s.operating_costs;
  const bps = ctx.config.taxReserveEstimateBps;
  const taxBase = Math.max(0, s.customer_payments + s.refunds);
  const payouts = ctx.db.get<{ sent: number; confirmed: number; failed: number }>(
    `SELECT COALESCE(SUM(CASE WHEN status='SENT' THEN amount_minor END),0) AS sent,
            COALESCE(SUM(CASE WHEN status='SENT' AND bank_credit_confirmed=1 THEN amount_minor END),0) AS confirmed,
            COALESCE(SUM(CASE WHEN status='FAILED' THEN 1 END),0) AS failed
     FROM payouts WHERE test_mode = ?`,
    t,
  ) ?? { sent: 0, confirmed: 0, failed: 0 };
  const openOrders = ctx.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id
     WHERE o.test_mode = ? AND op.pipeline_state NOT IN ('CLOSED','CANCELLED')`,
    t,
  )?.n ?? 0;
  const qaFailures = ctx.db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.test_mode = ? AND q.passed = 0',
    t,
  )?.n ?? 0;
  return {
    mode: testMode ? 'TEST' : 'LIVE',
    currency: accountingCurrency(ctx),
    grossReceiptsMinor: s.customer_payments,
    refundsMinor: s.refunds,
    feesMinor: s.provider_fees,
    disputesMinor: s.disputes,
    otherCostsMinor: s.operating_costs,
    contributionMinor: contribution,
    taxReserve: bps === null ? { estimateMinor: null, label: 'nicht konfiguriert' } : { estimateMinor: bpsOf(taxBase, bps), label: 'SCHÄTZUNG – nicht buchhalterisch bestätigt' },
    providerReportedPayoutsMinor: -s.payouts,
    bankCreditConfirmedMinor: payouts.confirmed,
    openOrders,
    qaFailures,
    failedPayouts: payouts.failed,
  };
}
