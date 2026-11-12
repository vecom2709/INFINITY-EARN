import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { invoiceSchema, validate } from '../../packages/contracts/src/schemas.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { createCreditNote, recordInvoiceForOrder, renderInvoiceText } from '../../services/finance/src/invoice.ts';
import { computeKpis } from '../../services/finance/src/kpis.ts';
import { appendLedger } from '../../services/finance/src/ledger.ts';
import { mockPayout } from '../../services/finance/src/mock-provider.ts';
import { buildMonthlyExport } from '../../services/finance/src/monthly-export.ts';
import { writeMonthlyExport } from '../../services/finance/src/monthly-export-fs.ts';
import { reconcile } from '../../services/finance/src/reconciliation.ts';
import { buyer, count, makeCtx, oppState, toDelivered } from '../helpers.ts';

type Ctx = ReturnType<typeof makeCtx>['ctx'];
const invoiceFor = (ctx: Ctx, orderId: string, b: Partial<typeof buyer> = {}) =>
  recordInvoiceForOrder(ctx, orderId, { name: buyer.name, address: buyer.address, country: buyer.country, type: buyer.type, vatId: null, ...b });

test('IE-061 gültige Pflichtdaten im Test: Test-Rechnungsentwurf', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const inv = invoiceFor(ctx, d.orderId);
  assert.equal(inv.status, 'DRAFT');
  assert.equal(inv.invoice_number, 'TEST-2026-000001');
  assert.equal(inv.tax_minor, null);
  assert.equal(inv.issued_by_registered_business, 0);
  assert.equal(oppState(ctx, d.opportunityId), 'INVOICE_RECORDED');
  assert.match(renderInvoiceText(inv), /TESTBELEG – KEINE GÜLTIGE RECHNUNG/);
  const contract = { ...inv, issued_by_registered_business: false, test_mode: true };
  assert.deepEqual(validate(invoiceSchema, contract), []);
  assert.equal(invoiceFor(ctx, d.orderId).invoice_id, inv.invoice_id, 'idempotent');
});

test('IE-062 Pflichtdaten fehlen: TAX_REVIEW', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const inv = invoiceFor(ctx, d.orderId, { address: '' });
  assert.equal(inv.status, 'TAX_REVIEW');
  assert.match(inv.status_reason ?? '', /MISSING_FIELDS:buyer\.address/);
  assert.equal(oppState(ctx, d.opportunityId), 'TAX_REVIEW');
});

test('IE-063 gleiche Rechnungsnummer zweimal: Datenbank verweigert', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const inv = invoiceFor(ctx, d.orderId);
  assert.throws(
    () => ctx.db.run(
      `INSERT INTO invoices (invoice_id, order_id, kind, series, invoice_number, issued_by_registered_business, seller_json, buyer_json, lines_json, currency, net_minor, gross_minor, tax_context, status, test_mode, created_at)
       VALUES ('inv_dup', ?, 'INVOICE', ?, ?, 0, '{}', '{}', '[]', 'EUR', 1, 1, 'x', 'DRAFT', 1, 'now')`,
      d.orderId, inv.series, inv.invoice_number,
    ),
    /UNIQUE constraint failed/,
  );
});

test('IE-064 italienischer SdI-Fall ohne Kanal: nicht als gültig ausgegeben', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const inv = invoiceFor(ctx, d.orderId, { country: 'IT' });
  assert.equal(inv.status, 'TAX_REVIEW');
  assert.match(inv.status_reason ?? '', /SDI_CHANNEL_MISSING/);
  assert.match(inv.status_reason ?? '', /XML_REQUIRED_PDF_INSUFFICIENT/, 'IE-065 integriert');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM invoices WHERE status IN ('ISSUED','SUBMITTED','ACCEPTED')`), 0);
});

test('IE-069 OSS-Fall unbekannt: steuerliche Fachfreigabe angefordert', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const inv = invoiceFor(ctx, d.orderId, { country: 'AT', type: 'B2C' });
  assert.equal(inv.status, 'TAX_REVIEW');
  assert.match(inv.status_reason ?? '', /OSS_REVIEW_REQUIRED/);
  assert.ok(ctx.audit.byType('review.required').length >= 1);
});

test('IE-067 IE-068 Gutschrift referenziert Original, Historie bleibt unverändert', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const inv = invoiceFor(ctx, d.orderId);
  const cn = createCreditNote(ctx, inv.invoice_id, 'Rückerstattung', 'owner');
  assert.equal(cn.kind, 'CREDIT_NOTE');
  assert.equal(cn.references_invoice_id, inv.invoice_id);
  assert.equal(cn.gross_minor, -inv.gross_minor);
  const orig = ctx.db.get<{ status: string; gross_minor: number; invoice_number: string }>('SELECT status, gross_minor, invoice_number FROM invoices WHERE invoice_id = ?', inv.invoice_id);
  assert.deepEqual({ ...orig }, { status: 'CREDITED', gross_minor: inv.gross_minor, invoice_number: inv.invoice_number });
  assert.throws(() => ctx.db.run('UPDATE invoices SET gross_minor = 0 WHERE invoice_id = ?', inv.invoice_id), /INVOICE_IMMUTABLE/);
  assert.throws(() => ctx.db.run('DELETE FROM invoices WHERE invoice_id = ?', inv.invoice_id), /INVOICE_IMMUTABLE/);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM invoice_status_history WHERE invoice_id = ?', inv.invoice_id), 2);
  assert.throws(() => createCreditNote(ctx, inv.invoice_id, 'nochmal', 'owner'), /ALREADY_CREDITED/);
});

test('IE-070 Monatsbericht: lückenloser Belegexport', () => {
  const { ctx } = makeCtx();
  const a = toDelivered(ctx);
  const b = toDelivered(ctx);
  invoiceFor(ctx, a.orderId);
  invoiceFor(ctx, b.orderId);
  const exp = buildMonthlyExport(ctx, '2026-11');
  assert.equal(exp.mode, 'TEST');
  assert.deepEqual(exp.invoices.map((i) => i.invoice_number), ['TEST-2026-000001', 'TEST-2026-000002']);
  assert.deepEqual(exp.numberingGaps, []);
  assert.equal(exp.paymentEvents.length, 2);
  assert.ok(exp.ledger.length >= 4);
  const out = writeMonthlyExport(ctx, '2026-11');
  assert.ok(out.files.every((f) => existsSync(f)));
  assert.throws(() => buildMonthlyExport(ctx, '2026-13'), /INVALID_MONTH/);
});

test('IE-072 unbekannte Buchung: Reconciliation auf REVIEW', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  invoiceFor(ctx, d.orderId);
  appendLedger(ctx, { orderId: d.orderId, account: 'customer_payments', amountMinor: 999, currency: 'EUR', sourceType: 'payment_event', sourceRef: 'evt_unbekannt_123', description: 'unbekannt' });
  const r = reconcile(ctx);
  assert.equal(r.status, 'REVIEW');
  assert.ok(r.issues.some((i) => i.startsWith('UNKNOWN_LEDGER_ENTRY')));
  assert.equal(oppState(ctx, d.opportunityId), 'INVOICE_RECORDED', 'betroffener Auftrag nicht als abgeglichen markiert');
});

test('IE-073 Payout vom Provider bestätigt: als gesendet markiert, Auftrag erst nach Bankbeleg abgeschlossen', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  autopilotTick(ctx);
  assert.equal(oppState(ctx, d.opportunityId), 'LEDGER_RECONCILED');
  const order = getOrder(ctx, d.orderId);
  assert.equal(mockPayout(ctx, [d.orderId], order.amount_minor - 100, 'EUR').detail, 'PAYOUT_SENT');
  assert.equal(ctx.db.get<{ status: string }>('SELECT status FROM payouts')?.status, 'SENT');
  assert.equal(oppState(ctx, d.opportunityId), 'PAYOUT_RECORDED', 'Auszahlungsmeldung allein schließt nicht ab (15.0)');
});

test('IE-074 Bankeingang noch nicht bestätigt: nicht als gutgeschrieben gemeldet', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  mockPayout(ctx, [d.orderId], 1000, 'EUR');
  const k = computeKpis(ctx, true);
  assert.equal(k.providerReportedPayoutsMinor, 1000);
  assert.equal(k.bankCreditConfirmedMinor, 0);
  assert.equal(ctx.db.get<{ b: number }>('SELECT bank_credit_confirmed AS b FROM payouts')?.b, 0);
});

test('IE-077 Steuerreserve-Schätzung: als geschätzt gekennzeichnet', () => {
  const { ctx } = makeCtx({ env: { TAX_RESERVE_ESTIMATE_BPS: '2200' } });
  toDelivered(ctx);
  const k = computeKpis(ctx, true);
  assert.equal(k.taxReserve.label, 'SCHÄTZUNG – nicht buchhalterisch bestätigt');
  assert.ok((k.taxReserve.estimateMinor ?? 0) > 0);
  const { ctx: c2 } = makeCtx();
  assert.deepEqual(computeKpis(c2, true).taxReserve, { estimateMinor: null, label: 'nicht konfiguriert' });
});

test('IE-079 Payout gescheitert: Status FAILED und Alarm', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  assert.equal(mockPayout(ctx, [d.orderId], 1000, 'EUR', true).detail, 'PAYOUT_FAILED');
  assert.equal(ctx.db.get<{ status: string }>('SELECT status FROM payouts')?.status, 'FAILED');
  assert.equal(ctx.audit.byType('alert.payout_failed').length, 1);
  assert.equal(computeKpis(ctx, true).failedPayouts, 1);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM ledger_entries WHERE account = 'payouts'`), 0);
});

test('LIVE-Kennzahlen bleiben 0, solange keine echte Zahlung existiert', () => {
  const { ctx } = makeCtx();
  toDelivered(ctx);
  const live = computeKpis(ctx, false);
  assert.equal(live.mode, 'LIVE');
  assert.deepEqual([live.grossReceiptsMinor, live.feesMinor, live.contributionMinor, live.openOrders], [0, 0, 0, 0]);
  assert.ok(computeKpis(ctx, true).grossReceiptsMinor > 0);
});

test('Ledger: Fremdwährung und Änderungen werden verweigert', () => {
  const { ctx } = makeCtx();
  assert.throws(() => appendLedger(ctx, { orderId: null, account: 'operating_costs', amountMinor: -1, currency: 'USD', sourceType: 'owner_manual', sourceRef: 'x', description: 'x' }), /CURRENCY_MISMATCH/);
  appendLedger(ctx, { orderId: null, account: 'operating_costs', amountMinor: -1, currency: 'EUR', sourceType: 'owner_manual', sourceRef: 'x', description: 'x' });
  assert.equal(appendLedger(ctx, { orderId: null, account: 'operating_costs', amountMinor: -1, currency: 'EUR', sourceType: 'owner_manual', sourceRef: 'x', description: 'x' }), null);
  assert.throws(() => ctx.db.run('UPDATE ledger_entries SET amount_minor = 0'), /LEDGER_APPEND_ONLY/);
  assert.throws(() => ctx.db.run('DELETE FROM ledger_entries'), /LEDGER_APPEND_ONLY/);
});
