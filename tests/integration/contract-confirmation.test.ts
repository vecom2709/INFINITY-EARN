import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTextPdf, pdfString } from '../../packages/shared/src/pdf.ts';
import { createConfirmation, downloadConfirmation, getConfirmation } from '../../services/core-api/src/contract-confirmation.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { acceptQuote, createCheckout } from '../../services/core-api/src/workflow.ts';
import { mockPay } from '../../services/finance/src/mock-provider.ts';
import { runProductionOnce } from '../../services/product-factory/src/production.ts';
import { count, makeCtx, toOrder, toQuote } from '../helpers.ts';

const text = (b: Uint8Array): string => new TextDecoder('latin1').decode(b);
const consumer = { name: 'Maria Rossi', address: 'Via Roma 1, Milano', country: 'IT', type: 'B2C' as const, vatId: null };

test('PDF-Generator: gültige Struktur, korrekte xref-Offsets, Umlaute und € in WinAnsi, mehrseitig', () => {
  const lines = Array.from({ length: 120 }, (_, i) => ({ text: `Zeile ${i}: Größe über 45,00 € – „Prüfung“ (ok) \\ Ende` }));
  const pdf = createTextPdf({ title: 'Test ÄÖÜ', lines, created: new Date('2026-11-12T00:00:00Z') });
  const s = text(pdf);
  assert.ok(s.startsWith('%PDF-1.4\n'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.ok(/\/Count [2-9]/.test(s), 'mehrere Seiten');
  const xrefAt = Number(/startxref\n(\d+)/.exec(s)?.[1]);
  assert.equal(s.slice(xrefAt, xrefAt + 4), 'xref');
  const entries = [...s.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((off, i) => assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `Objekt ${i + 1}`));
  for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = (m.index ?? 0) + m[0].length;
    assert.equal(s.slice(start + Number(m[1]), start + Number(m[1]) + 10), '\nendstream', 'Stream-Länge exakt');
  }
  assert.equal(pdfString('Größe €'), 'Gr\\366\\337e \\200');
  assert.equal(pdfString('(a) \\'), '\\(a\\) \\\\');
  assert.ok([...pdf].every((b) => b < 0x80), 'reines ASCII');
});

test('Vertragsbestätigung entsteht bei Angebotsannahme (B2B) – Inhalt, kein Verzicht, unveränderlich', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  const c = getConfirmation(ctx, o.orderId);
  assert.ok(c, 'bei Annahme erzeugt');
  assert.equal(c?.buyer_type, 'B2B');
  assert.equal(c?.consumer_waiver_ref, null);
  const pdf = text(ctx.blobs.get(c?.blob_locator ?? '') ?? new Uint8Array());
  assert.match(pdf, new RegExp(o.orderId));
  assert.ok(pdf.includes(pdfString('Vertragsbestätigung')));
  assert.ok(pdf.includes(pdfString('kein gesetzliches Verbraucher-Widerrufsrecht')));
  assert.ok(pdf.includes(pdfString('TESTMODUS')));
  assert.ok(pdf.includes(pdfString(`${(getOrder(ctx, o.orderId).amount_minor / 100).toFixed(2).replace('.', ',')} EUR`)));
  assert.equal(createConfirmation(ctx, o.orderId).confirmation_id, c?.confirmation_id, 'idempotent');
  assert.throws(() => ctx.db.run(`UPDATE contract_confirmations SET sha256 = 'x'`), /CONFIRMATION_IMMUTABLE/);
  assert.throws(() => ctx.db.run('DELETE FROM contract_confirmations'), /CONFIRMATION_IMMUTABLE/);
  assert.equal(ctx.audit.byType('contract.confirmation_created').length, 1);
});

test('Verbraucher (B2C): Bestätigung enthält Verzicht mit Nachweis, Widerrufsbelehrung und Muster-Formular', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  const acc = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'ip9', buyer: consumer, consumerWaiver: { immediatePerformance: true, acknowledgeLoss: true } });
  const c = getConfirmation(ctx, acc.orderId);
  assert.equal(c?.buyer_type, 'B2C');
  assert.match(c?.consumer_waiver_ref ?? '', /^waiver:v1-entwurf-2026-11-12:/);
  const pdf = text(ctx.blobs.get(c?.blob_locator ?? '') ?? new Uint8Array());
  assert.ok(pdf.includes(pdfString('binnen vierzehn Tagen')));
  assert.ok(pdf.includes(pdfString('[x] „Ich verlange ausdrücklich')));
  assert.ok(pdf.includes(pdfString('Muster-Widerrufsformular')));
  assert.ok(pdf.includes(pdfString(c?.consumer_waiver_ref ?? '-')));
  const dup = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'ip9', buyer: consumer, consumerWaiver: { immediatePerformance: true, acknowledgeLoss: true } });
  assert.equal(dup.duplicate, true);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM contract_confirmations'), 1);
});

test('Abruf nur durch den bestellenden Kunden, Prüfsumme bei jedem Abruf, Abrufe protokolliert', () => {
  const { ctx } = makeCtx();
  const a = toOrder(ctx);
  const b = toOrder(ctx);
  const ok = downloadConfirmation(ctx, a.customerAccessKey ?? undefined, a.orderId);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.ok(text(ok.bytes).startsWith('%PDF-1.4'));
  assert.equal(getConfirmation(ctx, a.orderId)?.download_count, 1);
  assert.notEqual(getConfirmation(ctx, a.orderId)?.first_downloaded_at, null);
  const foreign = downloadConfirmation(ctx, b.customerAccessKey ?? undefined, a.orderId);
  assert.deepEqual(foreign.ok ? null : [foreign.status, foreign.reason], [403, 'FORBIDDEN']);
  assert.equal(downloadConfirmation(ctx, undefined, a.orderId).ok, false);
  ctx.blobs.overwrite?.(getConfirmation(ctx, a.orderId)?.blob_locator ?? '', new TextEncoder().encode('manipuliert'));
  const tampered = downloadConfirmation(ctx, a.customerAccessKey ?? undefined, a.orderId);
  assert.deepEqual(tampered.ok ? null : [tampered.status, tampered.reason], [500, 'INTEGRITY']);
});

test('Verbraucher: ohne Vertragsbestätigung keine Bereitstellung', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  const acc = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'ip', buyer: consumer, consumerWaiver: { immediatePerformance: true, acknowledgeLoss: true } });
  createCheckout(ctx, acc.orderId);
  // Fehlende Bestätigung simulieren (nur im Test: Löschschutz entfernen)
  ctx.db.exec('DROP TRIGGER contract_confirmations_no_delete');
  ctx.db.run('DELETE FROM contract_confirmations WHERE order_id = ?', acc.orderId);
  mockPay(ctx, getOrder(ctx, acc.orderId));
  const run = runProductionOnce(ctx);
  assert.deepEqual([run.results[0]?.outcome, run.results[0]?.detail], ['BLOCKED', 'DELIVERY_BLOCKED'], 'Worker stürzt nicht ab');
  assert.equal(ctx.db.get<{ s: string }>('SELECT state AS s FROM jobs WHERE kind = ?', 'production')?.s, 'HUMAN_REVIEW');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM deliveries'), 0);
  assert.ok(ctx.audit.byType('delivery.blocked').some((e) => e.data_json.includes('CONFIRMATION_MISSING')));
});
