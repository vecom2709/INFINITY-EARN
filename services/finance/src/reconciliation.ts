import { newId } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { tryTransition } from '../../core-api/src/opportunities.ts';

export interface ReconciliationResult {
  runId: string;
  status: 'OK' | 'REVIEW';
  issues: string[];
  reconciledOrders: string[];
}

/**
 * Abgleich Ledger ↔ Provider-Events. Unbekannte oder nicht belegte Buchungen -> REVIEW (IE-072).
 * Aufträge mit Testbeleg und sauberem Abgleich gehen auf LEDGER_RECONCILED.
 */
export function reconcile(ctx: AppContext, actor: 'system' | 'owner' = 'system'): ReconciliationResult {
  const t = ctx.config.testMode ? 1 : 0;
  const issues: string[] = [];
  const badOrders = new Set<string>();

  const orphanPayments = ctx.db.all<{ entry_id: string; order_id: string | null; source_ref: string }>(
    `SELECT l.entry_id, l.order_id, l.source_ref FROM ledger_entries l
     LEFT JOIN payment_events p ON p.provider_event_id = l.source_ref
     WHERE l.test_mode = ? AND l.source_type = 'payment_event' AND p.id IS NULL`,
    t,
  );
  for (const o of orphanPayments) {
    issues.push(`UNKNOWN_LEDGER_ENTRY:${o.entry_id}`);
    if (o.order_id) badOrders.add(o.order_id);
  }
  const orphanPayouts = ctx.db.all<{ entry_id: string }>(
    `SELECT l.entry_id FROM ledger_entries l LEFT JOIN payouts p ON p.provider_event_id = l.source_ref
     WHERE l.test_mode = ? AND l.source_type = 'payout_event' AND p.payout_id IS NULL`,
    t,
  );
  orphanPayouts.forEach((o) => issues.push(`UNKNOWN_PAYOUT_ENTRY:${o.entry_id}`));
  const manual = ctx.db.all<{ entry_id: string }>(`SELECT entry_id FROM ledger_entries WHERE test_mode = ? AND source_type = 'owner_manual'`, t);
  manual.forEach((m) => issues.push(`UNMATCHED_MANUAL_ENTRY:${m.entry_id}`));

  const orders = ctx.db.all<{ order_id: string; opportunity_id: string; amount_minor: number; payment_state: string }>(
    `SELECT order_id, opportunity_id, amount_minor, payment_state FROM orders WHERE test_mode = ? AND payment_state IN ('CONFIRMED','REFUNDED','DISPUTED')`,
    t,
  );
  for (const o of orders) {
    const booked = ctx.db.get<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS s FROM ledger_entries WHERE order_id = ? AND account = 'customer_payments'`, o.order_id)?.s ?? 0;
    if (booked !== o.amount_minor) {
      issues.push(`PAYMENT_MISMATCH:${o.order_id}:${booked}!=${o.amount_minor}`);
      badOrders.add(o.order_id);
    }
    const fee = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ledger_entries WHERE order_id = ? AND account = 'provider_fees'`, o.order_id)?.n ?? 0;
    if (fee === 0) {
      issues.push(`FEE_UNCONFIRMED:${o.order_id}`);
      badOrders.add(o.order_id);
    }
  }

  const reconciledOrders: string[] = [];
  const candidates = ctx.db.all<{ order_id: string; opportunity_id: string }>(
    `SELECT o.order_id, o.opportunity_id FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id
     WHERE o.test_mode = ? AND op.pipeline_state = 'INVOICE_RECORDED' AND o.payment_state = 'CONFIRMED'`,
    t,
  );
  for (const c of candidates) {
    if (badOrders.has(c.order_id)) continue;
    if (tryTransition(ctx, c.opportunity_id, 'LEDGER_RECONCILED', actor, 'Ledger = Provider-Events')) reconciledOrders.push(c.order_id);
  }

  const status = issues.length === 0 ? 'OK' : 'REVIEW';
  const runId = newId('rec');
  ctx.db.run(
    'INSERT INTO reconciliation_runs (run_id, status, details_json, test_mode, created_at) VALUES (?, ?, ?, ?, ?)',
    runId, status, JSON.stringify({ issues, reconciledOrders }), t, ctx.clock().toISOString(),
  );
  ctx.audit.record({ type: status === 'OK' ? 'ledger.reconciled' : 'review.required', actor, subjectType: 'reconciliation', subjectId: runId, data: { status, issues: issues.slice(0, 20), reconciled: reconciledOrders.length }, testMode: ctx.config.testMode });
  return { runId, status, issues, reconciledOrders };
}
