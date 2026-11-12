import { REGISTRY, REGISTRY_SHA256 } from '../../../packages/registry/src/registry.ts';
import { statusCounts } from '../../../packages/registry/src/status.ts';
import type { AppContext } from '../../../services/core-api/src/context.ts';
import { activeStops, effectivePolicy } from '../../../services/core-api/src/policy-store.ts';
import { readinessSummary } from '../../../services/core-api/src/readiness.ts';
import { listCapabilities } from '../../../services/product-factory/src/registry.ts';
import { backupState, BANK_CONNECTED, decisions, financeView } from './model.ts';

/**
 * Technischer Statusbericht (Masterprompt M0): maschinenlesbar, ohne personenbezogene Daten,
 * ohne Geheimnisse. Grundlage für Monitoring und PROGRESS.md.
 */
export function statusReport(ctx: AppContext): Record<string, unknown> {
  const policy = effectivePolicy(ctx);
  const rs = readinessSummary(ctx);
  const live = financeView(ctx, false);
  const jobs = ctx.db.all<{ state: string; n: number }>('SELECT state, COUNT(*) AS n FROM jobs GROUP BY state');
  return {
    product: 'INFINITY EARN',
    version: REGISTRY.version,
    generated_at: ctx.clock().toISOString(),
    environment: ctx.config.environment,
    mode: ctx.config.testMode ? 'TEST' : 'LIVE',
    live: { technically_locked: rs.liveTechnicallyLocked, approvals_done: rs.done, approvals_total: rs.total, real_sales_minor: live.paidMinor, bank_connected: BANK_CONNECTED },
    cost_gate: {
      max_additional_monthly_fixed_eur: policy?.maxNewMonthlyFixedCostEur ?? 0,
      paid_apis_allowed: policy?.allowPaidApis ?? false,
      new_financial_commitments_allowed: policy?.allowNewFinancialCommitments ?? false,
      policy_active: policy !== null,
    },
    emergency_stops_active: [...activeStops(ctx)],
    registry: { sha256: REGISTRY_SHA256, approved: REGISTRY.modules.length, rejected_ids: REGISTRY.rejectedIds, implementation: statusCounts() },
    capabilities: listCapabilities().map((c) => ({ id: c.id, enabled: c.enabled, reason: c.disabled_reason })),
    payment_provider: `${ctx.config.payment.provider}${ctx.config.testMode ? ' (test)' : ''}`,
    jobs: Object.fromEntries(jobs.map((j) => [j.state, j.n])),
    open_decisions: decisions(ctx, ctx.config.testMode).length,
    backup: backupState(ctx).health,
  };
}
