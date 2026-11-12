import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderInquiryForm } from '../../apps/customer-portal/src/pages.ts';
import { sha256Hex } from '../../packages/shared/src/crypto.ts';
import { autoProcessOpportunity } from '../../services/core-api/src/workflow.ts';
import { submitInboundLead } from '../../services/acquisition/src/leads.ts';
import { b2bCalcPdf, checkPdfStructure, MAX_PAGES } from '../../services/product-factory/src/capabilities/b2b-calc-pdf.ts';
import { downloadArtifact, getDeliveryByOrder, issueDownloadToken } from '../../services/product-factory/src/delivery.ts';
import { listCapabilities, routeCapability } from '../../services/product-factory/src/registry.ts';
import { calcScope, inbound, makeCtx, toDelivered } from '../helpers.ts';

const latin = (b: Uint8Array): string => new TextDecoder('latin1').decode(b);
const PDF_ON = { ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf' };

test('Herstellbarkeit: gleiche Eingabe → byte-identisches PDF, alle QA-Prüfungen bestanden', () => {
  const scope = calcScope();
  const a = b2bCalcPdf.generate(scope);
  const b = b2bCalcPdf.generate(scope);
  assert.equal(sha256Hex(a), sha256Hex(b), 'reproduzierbar');
  const qa = b2bCalcPdf.runQa(a, scope);
  assert.deepEqual(qa.map((c) => [c.check, c.passed]), [['encoding', true], ['pdf_structure', true], ['pages', true], ['items_complete', true], ['totals', true], ['layout', true]]);
  assert.ok(latin(a).includes('Gesamt'));
  assert.equal(routeCapability('b2b-calc-pdf').ok, true);
  assert.ok(listCapabilities().some((c) => c.id === 'b2b-calc-pdf' && c.enabled));
});

test('QA erkennt Manipulation, fehlende Positionen, falsche Summe und ungültige Eingabe', () => {
  const scope = calcScope();
  const bytes = b2bCalcPdf.generate(scope);
  const tampered = new TextEncoder().encode(latin(bytes).replace('Gesamt', 'Gesamt '));
  const qa1 = b2bCalcPdf.runQa(tampered, scope);
  assert.equal(qa1.find((c) => c.check === 'pdf_structure')?.passed, false, 'verschobene Offsets');
  const moreItems = calcScope({ items: [...(calcScope().items as object[]), { name: 'Zusatz', quantity: 1, unit_cost_minor: 100 }] });
  const qa2 = b2bCalcPdf.runQa(bytes, moreItems);
  assert.equal(qa2.find((c) => c.check === 'items_complete')?.passed, false);
  assert.equal(qa2.find((c) => c.check === 'totals')?.passed, false);
  const qa3 = b2bCalcPdf.runQa(bytes, { title: '' });
  assert.equal(qa3.find((c) => c.check === 'input')?.passed, false);
  assert.equal(checkPdfStructure('kein pdf').ok, false);
});

test('Grenzen: 200 Positionen bleiben unter dem Seitenlimit; Umlaute und € werden korrekt kodiert', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ name: `Position Größe ${i} – Prüfung`, quantity: 1 + (i % 5), unit_cost_minor: 1999 + i }));
  const scope = calcScope({ items });
  const bytes = b2bCalcPdf.generate(scope);
  const qa = b2bCalcPdf.runQa(bytes, scope);
  assert.ok(qa.every((c) => c.passed), JSON.stringify(qa));
  const pages = checkPdfStructure(latin(bytes)).pages;
  assert.ok(pages > 1 && pages <= MAX_PAGES, `${pages} Seiten`);
});

test('Freischaltung bleibt beim Eigentümer: ohne Policy-Freigabe wird kein PDF-Auftrag angeboten', () => {
  const { ctx } = makeCtx();
  const lead = submitInboundLead(ctx, inbound({ request: { capabilityId: 'b2b-calc-pdf', scope: calcScope() } }), { ipHash: 't' });
  const auto = autoProcessOpportunity(ctx, lead.opportunityId);
  assert.notEqual(auto.stage, 'QUOTED', 'Produktart nicht in allowedCapabilities');
  assert.doesNotMatch(renderInquiryForm([], {}, ['b2b-calc-csv']), /name="format" value="b2b-calc-pdf"/);
  assert.match(renderInquiryForm([], {}, ['b2b-calc-csv', 'b2b-calc-pdf']), /type="radio" name="format" value="b2b-calc-pdf"/);
});

test('Mit Freigabe: kompletter Ablauf bis zur geprüften PDF-Lieferung an den Kunden', () => {
  const { ctx } = makeCtx({ env: PDF_ON });
  const d = toDelivered(ctx, inbound({ request: { capabilityId: 'b2b-calc-pdf', scope: calcScope() } }));
  const del = getDeliveryByOrder(ctx, d.orderId);
  assert.ok(del, 'geliefert');
  const qa = ctx.db.get<{ results_json: string }>('SELECT q.results_json FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.order_id = ?', d.orderId);
  assert.deepEqual((JSON.parse(qa?.results_json ?? '[]') as { check: string }[]).map((c) => c.check), ['encoding', 'pdf_structure', 'pages', 'items_complete', 'totals', 'layout', 'checksum', 'standard_acceptance']);
  const dl = downloadArtifact(ctx, issueDownloadToken(ctx, del?.delivery_id ?? '', d.customerId), d.customerAccessKey ?? undefined);
  assert.equal(dl.ok, true);
  if (dl.ok) {
    assert.equal(dl.mediaType, 'application/pdf');
    assert.match(dl.filename, /\.pdf$/);
    assert.ok(latin(dl.bytes).startsWith('%PDF-1.4'));
  }
});
