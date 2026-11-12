import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { toCsv } from '../../product-factory/src/csv.ts';

export interface MonthlyExport {
  month: string;
  mode: 'TEST' | 'LIVE';
  generatedAt: string;
  invoices: Record<string, unknown>[];
  paymentEvents: Record<string, unknown>[];
  ledger: Record<string, unknown>[];
  payouts: Record<string, unknown>[];
  openItems: Record<string, unknown>[];
  tickets: Record<string, unknown>[];
  numberingGaps: string[];
  disclaimer: string;
}

/** Lückenloser Belegexport mit Prüfung der Nummernkreise (IE-070). */
export function buildMonthlyExport(ctx: AppContext, month: string): MonthlyExport {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new WorkflowError('INVALID_MONTH');
  const t = ctx.config.testMode ? 1 : 0;
  const like = `${month}%`;
  const invoices = ctx.db.all<Record<string, unknown>>(
    'SELECT invoice_id, order_id, kind, references_invoice_id, series, invoice_number, currency, net_minor, tax_minor, gross_minor, tax_context, status, status_reason, created_at FROM invoices WHERE test_mode = ? AND created_at LIKE ? ORDER BY series, invoice_number',
    t, like,
  );
  const numberingGaps: string[] = [];
  const bySeries = new Map<string, number[]>();
  for (const inv of invoices) {
    const series = String(inv.series);
    if (series.startsWith('REVIEW')) continue;
    const n = Number(String(inv.invoice_number).split('-').pop());
    bySeries.set(series, [...(bySeries.get(series) ?? []), n]);
  }
  for (const [series, nums] of bySeries) {
    nums.sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) {
      if ((nums[i] as number) !== (nums[i - 1] as number) + 1) numberingGaps.push(`${series}: Lücke nach ${nums[i - 1]}`);
    }
  }
  return {
    month,
    mode: t ? 'TEST' : 'LIVE',
    generatedAt: ctx.clock().toISOString(),
    invoices,
    paymentEvents: ctx.db.all('SELECT provider, provider_event_id, event_type, order_id, amount_minor, fee_minor, currency, received_at FROM payment_events WHERE test_mode = ? AND received_at LIKE ? ORDER BY id', t, like),
    ledger: ctx.db.all('SELECT entry_id, order_id, account, amount_minor, currency, source_type, source_ref, description, created_at FROM ledger_entries WHERE test_mode = ? AND created_at LIKE ? ORDER BY created_at', t, like),
    payouts: ctx.db.all('SELECT provider_payout_id, amount_minor, currency, status, failure_reason, bank_credit_confirmed, created_at FROM payouts WHERE test_mode = ? AND created_at LIKE ?', t, like),
    openItems: ctx.db.all(
      `SELECT o.order_id, o.amount_minor, o.currency, o.payment_state, op.pipeline_state FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id
       WHERE o.test_mode = ? AND op.pipeline_state NOT IN ('CLOSED','CANCELLED')`,
      t,
    ),
    tickets: ctx.db.all('SELECT ticket_id, order_id, kind, status, created_at FROM support_tickets WHERE test_mode = ? AND created_at LIKE ?', t, like),
    numberingGaps,
    disclaimer: t
      ? 'TESTEXPORT – enthält ausschließlich Testdaten, keine steuerlich relevanten Belege.'
      : 'Export ersetzt keine gesetzlich vorgeschriebene Steuererklärung oder Buchhaltung.',
  };
}

/** CSV-Dateien des Exports als Name -> Inhalt (plattformneutral; Schreiben auf Platte: monthly-export-fs.ts). */
export function monthlyExportCsvs(exp: MonthlyExport): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, rows] of [['rechnungen', exp.invoices], ['ledger', exp.ledger], ['zahlungen', exp.paymentEvents]] as const) {
    const header = rows[0] ? Object.keys(rows[0]) : ['leer'];
    out[`${name}.csv`] = toCsv([header, ...rows.map((r) => header.map((h) => String(r[h] ?? '')))]);
  }
  return out;
}
