import { createTextPdf, type PdfLine } from '../../../packages/shared/src/pdf.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { customerByKey } from '../../core-api/src/customers.ts';
import type { InvoiceRow } from './invoice.ts';

/**
 * Beleg als PDF für das Kundenportal (UI-09: Kunde findet seine Rechnung ohne Chat-Eingabe).
 * Wird deterministisch aus dem gespeicherten, unveränderlichen Belegdatensatz erzeugt (gleicher Inhalt bei jedem Abruf).
 * Im Testbetrieb unmissverständlich als ungültig gekennzeichnet. Steuer erst nach geprüftem Steuerkontext (LA-06).
 */
const eur = (minor: number, currency: string): string => `${(minor / 100).toFixed(2).replace('.', ',')} ${currency}`;

export function invoicePdfLines(inv: InvoiceRow): PdfLine[] {
  const seller = JSON.parse(inv.seller_json) as Record<string, string | null>;
  const buyer = JSON.parse(inv.buyer_json) as Record<string, string | null>;
  const lines = JSON.parse(inv.lines_json) as { description: string; quantity: number; net_minor: number }[];
  const test = inv.test_mode === 1;
  const title = inv.kind === 'CREDIT_NOTE' ? 'Gutschrift' : test ? 'Testbeleg' : 'Rechnung';
  const out: PdfLine[] = [];
  if (test) {
    out.push({ text: 'TESTBELEG – KEINE GÜLTIGE RECHNUNG – KEIN STEUERBELEG', bold: true, size: 12 });
    out.push({ text: 'Erstellt im Testbetrieb mit Testzahlung. Es wurde kein echtes Geld bezahlt.', gap: 10 });
  }
  out.push({ text: `${title} ${inv.invoice_number}`, bold: true, size: 16, gap: 6 });
  out.push({ text: `Datum: ${inv.created_at.slice(0, 10)} · Status: ${inv.status === 'DRAFT' ? 'Entwurf (Testbetrieb)' : inv.status}`, gap: 12 });
  out.push({ text: 'Leistungserbringer', bold: true });
  out.push({ text: `${seller.name ?? '—'}` });
  out.push({ text: `${seller.address ?? '—'} · Steuer-Nr./USt-IdNr.: ${seller.taxId ?? '—'}`, gap: 10 });
  out.push({ text: 'Kunde', bold: true });
  out.push({ text: `${buyer.name ?? '—'}` });
  out.push({ text: `${buyer.address ?? '—'} · ${buyer.country ?? ''} · ${buyer.type === 'B2C' ? 'Verbraucher' : buyer.type === 'B2B' ? 'Unternehmen' : '—'}${buyer.vatId ? ` · USt-IdNr. ${buyer.vatId}` : ''}`, gap: 12 });
  out.push({ text: 'Leistungen', bold: true });
  for (const l of lines) out.push({ text: `${l.quantity} × ${l.description.replace(/b2b-calc-csv/g, 'Kalkulationstabelle')} – ${eur(l.net_minor, inv.currency)}` });
  out.push({ text: '', gap: 6 });
  out.push({ text: `Nettobetrag: ${eur(inv.net_minor, inv.currency)}` });
  out.push({ text: `Umsatzsteuer: ${inv.tax_minor === null ? 'nicht berechnet – Steuerkontext noch nicht geprüft' : eur(inv.tax_minor, inv.currency)}` });
  out.push({ text: `Gesamtbetrag: ${eur(inv.gross_minor, inv.currency)}`, bold: true, gap: 12 });
  if (inv.references_invoice_id) out.push({ text: 'Diese Gutschrift bezieht sich auf einen früheren Beleg derselben Bestellung.' });
  out.push({ text: `Bestellung: ${inv.order_id}`, size: 9 });
  out.push({ text: `Steuerkontext: ${inv.tax_context}${inv.status_reason ? ` · Hinweis: ${inv.status_reason}` : ''}`, size: 9 });
  return out;
}

export function renderInvoicePdf(inv: InvoiceRow): Uint8Array {
  const kind = inv.kind === 'CREDIT_NOTE' ? 'Gutschrift' : 'Beleg';
  return createTextPdf({ title: `${kind} ${inv.invoice_number}`, lines: invoicePdfLines(inv), footer: `INFINITY EARN · ${kind} ${inv.invoice_number}${inv.test_mode ? ' · TESTBELEG' : ''}`, created: new Date(inv.created_at) });
}

/** Abruf nur durch den bestellenden Kunden; Belege in Steuerprüfung (REVIEW) werden nicht ausgegeben. */
export function downloadInvoice(ctx: AppContext, customerKey: string | undefined, invoiceId: string): { ok: true; bytes: Uint8Array; filename: string } | { ok: false; status: 403 | 404; reason: string } {
  const customer = customerByKey(ctx, customerKey);
  const inv = ctx.db.get<InvoiceRow & { customer_id: string }>('SELECT i.*, o.customer_id FROM invoices i JOIN orders o ON o.order_id = i.order_id WHERE i.invoice_id = ?', invoiceId);
  if (!customer || !inv || inv.customer_id !== customer.customer_id) {
    ctx.audit.record({ type: 'security.invoice_denied', actor: 'customer', subjectType: 'invoice', subjectId: invoiceId, testMode: ctx.config.testMode });
    return { ok: false, status: 403, reason: 'FORBIDDEN' };
  }
  if (inv.series === 'REVIEW' || inv.series === 'REVIEW-CN' || inv.status === 'TAX_REVIEW') return { ok: false, status: 404, reason: 'NOT_AVAILABLE' };
  ctx.audit.record({ type: 'invoice.downloaded', actor: 'customer', subjectType: 'invoice', subjectId: invoiceId, testMode: ctx.config.testMode });
  return { ok: true, bytes: renderInvoicePdf(inv), filename: `${inv.kind === 'CREDIT_NOTE' ? 'Gutschrift' : 'Beleg'}-${inv.invoice_number}.pdf` };
}

/** Für das Portal: abrufbare Belege einer Bestellung. */
export function customerInvoices(ctx: AppContext, orderId: string): { invoice_id: string; invoice_number: string; kind: string }[] {
  return ctx.db.all(`SELECT invoice_id, invoice_number, kind FROM invoices WHERE order_id = ? AND series NOT IN ('REVIEW','REVIEW-CN') AND status <> 'TAX_REVIEW' ORDER BY created_at`, orderId);
}
