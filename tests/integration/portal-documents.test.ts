import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCheckoutReturn, renderHome, renderInquiryForm, renderPortal, renderQuote } from '../../apps/customer-portal/src/pages.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { customerByKey } from '../../services/core-api/src/customers.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { getQuote } from '../../services/core-api/src/workflow.ts';
import { customerInvoices, downloadInvoice, invoicePdfLines } from '../../services/finance/src/invoice-pdf.ts';
import { recordInvoiceForOrder, type InvoiceRow } from '../../services/finance/src/invoice.ts';
import { makeCtx, toDelivered, toOrder, toQuote } from '../helpers.ts';

const latin = (b: Uint8Array): string => new TextDecoder('latin1').decode(b);

test('UI-09: Kunde findet Vertragsbestätigung, Beleg und Datei im Portal – ohne Chat', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  autopilotTick(ctx); // erzeugt Testbeleg
  const customer = customerByKey(ctx, d.customerAccessKey ?? undefined);
  const html = renderPortal(ctx, customer);
  const inv = customerInvoices(ctx, d.orderId);
  assert.equal(inv.length, 1);
  assert.ok(html.includes(`/portal/beleg/${inv[0]?.invoice_id}`), 'Beleg-Link');
  assert.ok(html.includes(`/portal/vertrag/${d.orderId}`), 'Vertrags-Link');
  assert.match(html, /href="\/download\/[^"]+"/, 'Datei-Link');
  assert.match(html, /Ihre Dokumente/);
  assert.match(html, /Kalkulationstabelle/, 'verständlicher Produktname statt interner Kennung');
  assert.doesNotMatch(html, />[^<]*b2b-calc-csv[^<]*</, 'interne Kennung nie im sichtbaren Text (nur in Link-Adressen)');
});

test('Beleg-PDF: gültige PDF-Datei, als Testbeleg gekennzeichnet, nur für den bestellenden Kunden', () => {
  const { ctx } = makeCtx();
  const a = toDelivered(ctx);
  const b = toDelivered(ctx);
  autopilotTick(ctx);
  const invA = customerInvoices(ctx, a.orderId)[0]?.invoice_id ?? '';
  const ok = downloadInvoice(ctx, a.customerAccessKey ?? undefined, invA);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    const s = latin(ok.bytes);
    assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
    assert.match(ok.filename, /^Beleg-TEST-\d{4}-\d{6}\.pdf$/);
  }
  const row = ctx.db.get<InvoiceRow>('SELECT * FROM invoices WHERE invoice_id = ?', invA) as InvoiceRow;
  const text = invoicePdfLines(row).map((l) => l.text).join('\n');
  assert.match(text, /TESTBELEG – KEINE GÜLTIGE RECHNUNG/);
  assert.match(text, /Umsatzsteuer: nicht berechnet/);
  assert.match(text, new RegExp(`Bestellung ${a.orderId}`));
  const foreign = downloadInvoice(ctx, b.customerAccessKey ?? undefined, invA);
  assert.deepEqual(foreign.ok ? null : [foreign.status, foreign.reason], [403, 'FORBIDDEN']);
  assert.equal(downloadInvoice(ctx, undefined, invA).ok, false);
  assert.equal(ctx.audit.byType('security.invoice_denied').length, 2);
  assert.equal(ctx.audit.byType('invoice.downloaded').length, 1);
});

test('Belege in Steuerprüfung werden dem Kunden nicht als Rechnung ausgegeben', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  // Pflichtdaten fehlen → Beleg geht in die Steuerprüfung (TAX_REVIEW), nicht an den Kunden
  const inv = recordInvoiceForOrder(ctx, d.orderId, { name: null, address: null, country: null, type: null, vatId: null });
  assert.equal(inv.status, 'TAX_REVIEW');
  assert.equal(customerInvoices(ctx, d.orderId).length, 0);
  const r = downloadInvoice(ctx, d.customerAccessKey ?? undefined, inv.invoice_id);
  assert.deepEqual(r.ok ? null : r.status, 404);
});

test('Kundenseiten im Design-System: Struktur, Barrierefreiheit, keine Skripte, Testbetrieb sichtbar', () => {
  const { ctx } = makeCtx();
  const open = toQuote(ctx);
  const o = toOrder(ctx);
  const pages = [renderHome(), renderInquiryForm(), renderQuote(getQuote(ctx, open.quote.quoteId), 'tok'), renderCheckoutReturn(getOrder(ctx, o.orderId)), renderPortal(ctx, customerByKey(ctx, o.customerAccessKey ?? undefined)), renderPortal(ctx, undefined)];
  for (const h of pages) {
    assert.ok(h.startsWith('<!doctype html><html lang="de">'));
    assert.equal((h.match(/<h1[\s>]/g) ?? []).length, 1);
    assert.match(h, /class="skip" href="#inhalt"/);
    assert.match(h, /<span class="mode">/, 'Testbetrieb sichtbar');
    assert.match(h, /TESTMODUS – Testbetrieb/);
    assert.doesNotMatch(h, /<script|https?:\/\/[^"]*\.(js|css)|AI CEO|Godmode/i);
    for (const m of h.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      const attrs = m[2] ?? '';
      if (/type="(hidden|checkbox)"/.test(attrs)) continue;
      const id = /id="([^"]+)"/.exec(attrs)?.[1];
      assert.ok(id && h.includes(`for="${id}"`), `Feld ohne Beschriftung: ${attrs.slice(0, 60)}`);
    }
  }
  assert.match(pages[3] ?? '', /Noch nicht bezahlt/);
  assert.match(pages[2] ?? '', /Angebot annehmen und bezahlen/);
});
