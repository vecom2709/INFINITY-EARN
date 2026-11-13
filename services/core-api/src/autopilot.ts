import { cronTick, recoverStaleJobs } from '../../ai-orchestrator/src/queue.ts';
import { recordInvoiceForOrder } from '../../finance/src/invoice.ts';
import { reconcile, type ReconciliationResult } from '../../finance/src/reconciliation.ts';
import { runProductionOnce, type ProductionRunResult } from '../../product-factory/src/production.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';
import { runOutbox } from './outbox.ts';
import { accrueCommissions, evaluateExperiments } from '../../growth/src/sales-growth.ts';
import { ingestIntents, syncContent, syncLandingPages } from '../../growth/src/visibility.ts';

export interface TickResult {
  production: ProductionRunResult;
  invoices: { orderId: string; status: string; number: string }[];
  reconciliation: ReconciliationResult | null;
  /** Kundennachrichten im Postausgang (nicht gesendet, solange kein Versandkanal freigegeben ist). */
  messages: { created: number; blocked: number };
  errors: string[];
}

/**
 * Always-On-Takt (lokal: setInterval; Cloudflare: Cron Trigger). Läuft ohne KI:
 * Produktion bezahlter Aufträge -> Belege für gelieferte Aufträge -> Reconciliation.
 * Ein Tick pro Intervall wird über cronTick idempotent protokolliert (IE-091, IE-092).
 */
export function autopilotTick(ctx: AppContext, intervalMs = 60_000): TickResult {
  const errors: string[] = [];
  cronTick(ctx, 'autopilot', intervalMs);
  recoverStaleJobs(ctx);
  const production = runProductionOnce(ctx);
  const invoices: TickResult['invoices'] = [];
  const delivered = ctx.db.all<{ order_id: string; name: string | null; address: string | null; country: string | null; buyer_type: 'B2B' | 'B2C' | null; vat_id: string | null }>(
    `SELECT o.order_id, c.name, c.address, c.country, c.buyer_type, c.vat_id FROM orders o
     JOIN opportunities op ON op.opportunity_id = o.opportunity_id JOIN customers c ON c.customer_id = o.customer_id
     WHERE op.pipeline_state = 'DELIVERED' AND o.test_mode = ?`,
    ctx.config.testMode ? 1 : 0,
  );
  for (const d of delivered) {
    try {
      const inv = recordInvoiceForOrder(ctx, d.order_id, { name: d.name, address: d.address, country: d.country, type: d.buyer_type, vatId: d.vat_id });
      invoices.push({ orderId: d.order_id, status: inv.status, number: inv.invoice_number });
    } catch (e) {
      errors.push(e instanceof WorkflowError ? `${d.order_id}: ${e.code}` : `${d.order_id}: ${(e as Error).message}`);
    }
  }
  const needsReconcile = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM opportunities WHERE pipeline_state = 'INVOICE_RECORDED'`)?.n ?? 0;
  const reconciliation = needsReconcile > 0 ? reconcile(ctx, 'system') : null;
  let messages = { created: 0, blocked: 0 };
  try {
    messages = runOutbox(ctx);
  } catch (e) {
    errors.push(`outbox: ${e instanceof WorkflowError ? e.code : (e as Error).message}`);
  }
  // Wachstum (147/139/140/135/148): Suchabsichten auswerten, Provisionen aus bestätigten Zahlungen, Experimente, Seiten-QA.
  try {
    ingestIntents(ctx);
    accrueCommissions(ctx);
    evaluateExperiments(ctx);
    syncLandingPages(ctx);
    syncContent(ctx);
  } catch (e) {
    errors.push(`growth: ${e instanceof WorkflowError ? e.code : (e as Error).message}`);
  }
  return { production, invoices, reconciliation, messages, errors };
}
