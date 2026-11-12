import { newId } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { getOpportunity, tryTransition } from '../../core-api/src/opportunities.ts';
import { getOrder } from '../../core-api/src/orders.ts';
import { decide } from '../../core-api/src/policy-store.ts';
import { checkOutputFormat, resolveTaxContext } from './tax.ts';

export type InvoiceStatus = 'DRAFT' | 'TAX_REVIEW' | 'ISSUED' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'CREDITED';

export interface InvoiceRow {
  invoice_id: string;
  order_id: string;
  kind: 'INVOICE' | 'CREDIT_NOTE';
  references_invoice_id: string | null;
  series: string;
  invoice_number: string;
  issued_by_registered_business: number;
  seller_json: string;
  buyer_json: string;
  lines_json: string;
  currency: string;
  net_minor: number;
  tax_minor: number | null;
  gross_minor: number;
  tax_context: string;
  sdi_reference: string | null;
  status: InvoiceStatus;
  status_reason: string | null;
  test_mode: number;
  created_at: string;
}

export interface BuyerData {
  name: string | null;
  address: string | null;
  country: string | null;
  type: 'B2B' | 'B2C' | null;
  vatId: string | null;
}

export const TEST_SELLER_PLACEHOLDER = {
  name: 'TESTBELEG – kein registriertes Unternehmen',
  address: 'nicht konfiguriert',
  taxId: 'nicht konfiguriert',
  country: null as string | null,
};

/** Fortlaufende Nummer pro Nummernkreis, atomar (IE-063 zusätzlich per UNIQUE gesichert). */
export function allocateInvoiceNumber(ctx: AppContext, series: string): string {
  return ctx.db.tx(() => {
    ctx.db.run('INSERT OR IGNORE INTO invoice_series (series, next_number, test_mode) VALUES (?, 1, ?)', series, ctx.config.testMode ? 1 : 0);
    const row = ctx.db.get<{ n: number }>('UPDATE invoice_series SET next_number = next_number + 1 WHERE series = ? RETURNING next_number - 1 AS n', series);
    if (!row) throw new WorkflowError('SERIES_ALLOCATION_FAILED');
    return `${series}-${String(row.n).padStart(6, '0')}`;
  });
}

function addHistory(ctx: AppContext, invoiceId: string, from: InvoiceStatus | null, to: InvoiceStatus, reason: string | null, actor: string): void {
  ctx.db.run(
    'INSERT INTO invoice_status_history (invoice_id, from_status, to_status, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    invoiceId, from, to, reason, actor, ctx.clock().toISOString(),
  );
}

export function getInvoice(ctx: AppContext, invoiceId: string): InvoiceRow {
  const row = ctx.db.get<InvoiceRow>('SELECT * FROM invoices WHERE invoice_id = ?', invoiceId);
  if (!row) throw new WorkflowError('INVOICE_NOT_FOUND');
  return row;
}

/**
 * Beleg zu einer gelieferten Bestellung. Im Testmodus entsteht höchstens ein als TEST
 * gekennzeichneter Rechnungsentwurf (DRAFT) – niemals ISSUED. Unklarer Steuerkontext oder fehlende
 * Pflichtdaten -> TAX_REVIEW (IE-061, IE-062, IE-064, IE-066, IE-069).
 */
export function recordInvoiceForOrder(ctx: AppContext, orderId: string, buyer: BuyerData, actor: 'system' | 'owner' = 'system'): InvoiceRow {
  const order = getOrder(ctx, orderId);
  const opp = getOpportunity(ctx, order.opportunity_id);
  const existing = ctx.db.get<InvoiceRow>(`SELECT * FROM invoices WHERE order_id = ? AND kind = 'INVOICE' AND status IN ('DRAFT','ISSUED','SUBMITTED','ACCEPTED') ORDER BY created_at DESC`, orderId);
  if (existing) return existing;
  if (opp.pipeline_state !== 'DELIVERED' && opp.pipeline_state !== 'TAX_REVIEW') throw new WorkflowError('INVOICE_REQUIRES_DELIVERY', `Zustand ${opp.pipeline_state}`);
  const d = decide(ctx, { action: 'invoice.issue', testMode: ctx.config.testMode }, actor, { type: 'order', id: orderId });
  if (!d.allowed) throw new WorkflowError('INVOICE_BLOCKED', `${d.rule} – ${d.reason}`);

  const testMode = ctx.config.testMode;
  const s = ctx.config.seller;
  const seller = testMode && !s.name ? TEST_SELLER_PLACEHOLDER : { name: s.name, address: s.address, taxId: s.taxId, country: s.country };
  const missing: string[] = [];
  if (!seller.name) missing.push('seller.name');
  if (!seller.address) missing.push('seller.address');
  if (!seller.taxId) missing.push('seller.taxId');
  if (!buyer.name) missing.push('buyer.name');
  if (!buyer.address) missing.push('buyer.address');
  if (!buyer.country || !/^[A-Z]{2}$/.test(buyer.country)) missing.push('buyer.country');
  if (!buyer.type) missing.push('buyer.type');

  let status: InvoiceStatus;
  let reason: string | null = null;
  let taxContext = 'UNRESOLVED';
  if (missing.length > 0) {
    status = 'TAX_REVIEW';
    reason = `MISSING_FIELDS:${missing.join(',')}`;
  } else {
    const tax = resolveTaxContext({
      sellerCountry: seller.country,
      buyerCountry: buyer.country as string,
      buyerType: buyer.type as 'B2B' | 'B2C',
      buyerVatId: buyer.vatId,
      jurisdictionConfigured: ctx.config.legalJurisdiction !== null,
      sdiChannelConfigured: ctx.config.sdiChannelConfigured,
      testMode,
    });
    taxContext = tax.context;
    const fmt = checkOutputFormat(tax.requiredFormat, ['JSON', 'TEXT']);
    if (tax.status === 'REVIEW') {
      status = 'TAX_REVIEW';
      reason = fmt.ok ? tax.reason : `${tax.reason};${fmt.reason}`;
    } else status = 'DRAFT';
  }

  const year = ctx.clock().getUTCFullYear();
  const series = status === 'DRAFT' ? `TEST-${year}` : 'REVIEW';
  const number = status === 'DRAFT' ? allocateInvoiceNumber(ctx, series) : `REVIEW-${newId('rv').slice(3, 15)}`;
  const lines = [{ description: `Bestellung ${orderId} (Testmodus)`, quantity: 1, net_minor: order.amount_minor }];
  const row: InvoiceRow = {
    invoice_id: newId('inv'),
    order_id: orderId,
    kind: 'INVOICE',
    references_invoice_id: null,
    series,
    invoice_number: number,
    issued_by_registered_business: ctx.config.ownerBusinessVerified ? 1 : 0,
    seller_json: JSON.stringify(seller),
    buyer_json: JSON.stringify(buyer),
    lines_json: JSON.stringify(lines),
    currency: order.currency,
    net_minor: order.amount_minor,
    tax_minor: null,
    gross_minor: order.amount_minor,
    tax_context: taxContext,
    sdi_reference: null,
    status,
    status_reason: reason,
    test_mode: testMode ? 1 : 0,
    created_at: ctx.clock().toISOString(),
  };
  ctx.db.tx(() => {
    ctx.db.run(
      `INSERT INTO invoices (invoice_id, order_id, kind, references_invoice_id, series, invoice_number, issued_by_registered_business, seller_json, buyer_json,
         lines_json, currency, net_minor, tax_minor, gross_minor, tax_context, sdi_reference, status, status_reason, test_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.invoice_id, row.order_id, row.kind, row.references_invoice_id, row.series, row.invoice_number, row.issued_by_registered_business, row.seller_json,
      row.buyer_json, row.lines_json, row.currency, row.net_minor, row.tax_minor, row.gross_minor, row.tax_context, row.sdi_reference, row.status,
      row.status_reason, row.test_mode, row.created_at,
    );
    addHistory(ctx, row.invoice_id, null, status, reason, actor);
    if (status === 'DRAFT') tryTransition(ctx, opp.opportunity_id, 'INVOICE_RECORDED', actor, `Testbeleg ${number}`);
    else tryTransition(ctx, opp.opportunity_id, 'TAX_REVIEW', actor, reason ?? 'Steuerprüfung');
  });
  ctx.audit.record({
    type: status === 'DRAFT' ? 'invoice.created' : 'review.required',
    actor,
    subjectType: 'order',
    subjectId: orderId,
    data: { invoice_id: row.invoice_id, number, status, reason, tax_context: taxContext, test_mode: testMode },
    testMode,
  });
  return row;
}

/** Gutschrift referenziert das Original; Original bleibt inhaltlich unverändert (IE-067, IE-068). */
export function createCreditNote(ctx: AppContext, invoiceId: string, reason: string, actor: 'system' | 'owner' | 'provider'): InvoiceRow {
  const orig = getInvoice(ctx, invoiceId);
  if (orig.kind !== 'INVOICE') throw new WorkflowError('CREDIT_NOTE_REQUIRES_INVOICE');
  if (orig.status === 'CREDITED') throw new WorkflowError('ALREADY_CREDITED');
  const number = allocateInvoiceNumber(ctx, orig.series === 'REVIEW' ? 'REVIEW-CN' : `${orig.series}-GS`);
  const row: InvoiceRow = {
    ...orig,
    invoice_id: newId('inv'),
    kind: 'CREDIT_NOTE',
    references_invoice_id: orig.invoice_id,
    series: orig.series === 'REVIEW' ? 'REVIEW-CN' : `${orig.series}-GS`,
    invoice_number: number,
    net_minor: -orig.net_minor,
    tax_minor: orig.tax_minor === null ? null : -orig.tax_minor,
    gross_minor: -orig.gross_minor,
    status: 'DRAFT',
    status_reason: reason,
    created_at: ctx.clock().toISOString(),
  };
  ctx.db.tx(() => {
    ctx.db.run(
      `INSERT INTO invoices (invoice_id, order_id, kind, references_invoice_id, series, invoice_number, issued_by_registered_business, seller_json, buyer_json,
         lines_json, currency, net_minor, tax_minor, gross_minor, tax_context, sdi_reference, status, status_reason, test_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.invoice_id, row.order_id, row.kind, row.references_invoice_id, row.series, row.invoice_number, row.issued_by_registered_business, row.seller_json,
      row.buyer_json, row.lines_json, row.currency, row.net_minor, row.tax_minor, row.gross_minor, row.tax_context, row.sdi_reference, row.status,
      row.status_reason, row.test_mode, row.created_at,
    );
    ctx.db.run(`UPDATE invoices SET status = 'CREDITED', status_reason = ? WHERE invoice_id = ?`, `Gutschrift ${number}`, orig.invoice_id);
    addHistory(ctx, orig.invoice_id, orig.status, 'CREDITED', reason, actor);
    addHistory(ctx, row.invoice_id, null, 'DRAFT', reason, actor);
  });
  ctx.audit.record({ type: 'invoice.credit_note_created', actor, subjectType: 'invoice', subjectId: orig.invoice_id, data: { credit_note: row.invoice_id, number }, testMode: ctx.config.testMode });
  return row;
}

/** Menschenlesbarer Beleg. Im Testmodus unmissverständlich als ungültig gekennzeichnet. */
export function renderInvoiceText(inv: InvoiceRow): string {
  const seller = JSON.parse(inv.seller_json) as Record<string, unknown>;
  const buyer = JSON.parse(inv.buyer_json) as Record<string, unknown>;
  const banner = inv.test_mode === 1 ? '*** TESTBELEG – KEINE GÜLTIGE RECHNUNG – KEIN STEUERBELEG ***\n' : '';
  return [
    banner,
    `${inv.kind === 'CREDIT_NOTE' ? 'Gutschrift' : 'Rechnungsentwurf'} ${inv.invoice_number} (${inv.status})`,
    `Verkäufer: ${String(seller.name)} · ${String(seller.address)} · Steuer-ID: ${String(seller.taxId)}`,
    `Käufer: ${String(buyer.name)} · ${String(buyer.address)} · ${String(buyer.country)} (${String(buyer.type)})`,
    `Netto: ${inv.net_minor} ${inv.currency} (Minor Units) · Steuer: ${inv.tax_minor === null ? 'nicht berechnet' : inv.tax_minor} · Brutto: ${inv.gross_minor}`,
    `Steuerkontext: ${inv.tax_context}${inv.status_reason ? ` · Hinweis: ${inv.status_reason}` : ''}`,
    inv.references_invoice_id ? `Bezieht sich auf: ${inv.references_invoice_id}` : '',
  ].filter(Boolean).join('\n');
}
