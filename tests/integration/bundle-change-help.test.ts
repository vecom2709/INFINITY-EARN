import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP, renderHelp } from '../../apps/customer-portal/src/pages.ts';
import { renderConsole } from '../../apps/console/src/index.ts';
import { sha256Hex } from '../../packages/shared/src/crypto.ts';
import { createZip, crc32, readZip } from '../../packages/shared/src/zip.ts';
import { changesForOrder, requestChange } from '../../services/core-api/src/change-requests.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { getQuote } from '../../services/core-api/src/workflow.ts';
import { autoProcessOpportunity } from '../../services/core-api/src/workflow.ts';
import { submitInboundLead } from '../../services/acquisition/src/leads.ts';
import { mockPay } from '../../services/finance/src/mock-provider.ts';
import { b2bCalcBundle } from '../../services/product-factory/src/capabilities/b2b-calc-bundle.ts';
import { b2bCalcCsv } from '../../services/product-factory/src/capabilities/b2b-calc-csv.ts';
import { downloadArtifact, getDeliveryByOrder, issueDownloadToken } from '../../services/product-factory/src/delivery.ts';
import { Client, serve } from '../http.ts';
import { calcScope, inbound, makeCtx, toDelivered, toOrder } from '../helpers.ts';

const ALL = { ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf,b2b-calc-bundle' };

test('ZIP-Baustein: Rundreise, CRC32 erkennt Beschädigung, unsichere Namen abgelehnt', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'CRC32-Referenzwert');
  const z = createZip([{ name: 'a.txt', bytes: new TextEncoder().encode('Hallo') }, { name: 'b.bin', bytes: new Uint8Array([0, 1, 2]) }]);
  const r = readZip(z);
  assert.deepEqual(r.map((x) => [x.name, x.bytes.length, x.crcOk]), [['a.txt', 5, true], ['b.bin', 3, true]]);
  const bad = new Uint8Array(z);
  bad[30 + 5] = 0x41; // erstes Datenbyte von a.txt verändern
  assert.equal(readZip(bad)[0]?.crcOk, false);
  assert.throws(() => createZip([{ name: '../x', bytes: new Uint8Array() }]), /ZIP_NAME_INVALID/);
  assert.throws(() => readZip(new Uint8Array(10)), /ZIP_EOCD_MISSING/);
});

test('093 Paket: reproduzierbar, beide Dateien bestehen ihre eigene QA, Manipulation wird erkannt', () => {
  const scope = calcScope();
  const a = b2bCalcBundle.generate(scope);
  assert.equal(sha256Hex(a), sha256Hex(b2bCalcBundle.generate(scope)));
  assert.deepEqual(b2bCalcBundle.runQa(a, scope).map((c) => [c.check, c.passed]), [['zip_structure', true], ['csv_qa', true], ['pdf_qa', true]]);
  const csvOnly = createZip([{ name: 'kalkulation.csv', bytes: b2bCalcCsv.generate(scope) }]);
  assert.equal(b2bCalcBundle.runQa(csvOnly, scope).find((c) => c.check === 'zip_structure')?.passed, false, 'PDF fehlt');
  const wrongCsv = createZip([{ name: 'kalkulation.csv', bytes: new TextEncoder().encode('x,y\r\n') }, { name: 'kalkulation.pdf', bytes: readZip(a)[1]?.bytes ?? new Uint8Array() }]);
  assert.equal(b2bCalcBundle.runQa(wrongCsv, scope).find((c) => c.check === 'csv_qa')?.passed, false);
  assert.ok(b2bCalcBundle.estimatedCostMinor(scope) > b2bCalcCsv.estimatedCostMinor(scope), 'Paket ist teurer als ein Einzelprodukt – kein Scheinrabatt');
});

test('093 Paket nur mit Freigabe; dann Lieferung als ZIP mit richtiger Dateiendung', () => {
  const { ctx: locked } = makeCtx();
  const lead = submitInboundLead(locked, inbound({ request: { capabilityId: 'b2b-calc-bundle', scope: calcScope() } }), { ipHash: 't' });
  assert.notEqual(autoProcessOpportunity(locked, lead.opportunityId).stage, 'QUOTED');
  const { ctx } = makeCtx({ env: ALL });
  const d = toDelivered(ctx, inbound({ request: { capabilityId: 'b2b-calc-bundle', scope: calcScope() } }));
  const del = getDeliveryByOrder(ctx, d.orderId);
  const dl = downloadArtifact(ctx, issueDownloadToken(ctx, del?.delivery_id ?? '', d.customerId), d.customerAccessKey ?? undefined);
  assert.equal(dl.ok, true);
  if (dl.ok) {
    assert.equal(dl.mediaType, 'application/zip');
    assert.match(dl.filename, /\.zip$/);
    assert.equal(readZip(dl.bytes).length, 2);
  }
});

test('124 Anleitung beschreibt genau die gelieferte Datei (Kopfzeile, Punkt als Dezimalzeichen) und nichts Erfundenes', () => {
  const csv = new TextDecoder().decode(b2bCalcCsv.generate(calcScope()));
  const header = csv.split('\r\n')[1] ?? '';
  assert.equal(header, 'Position,Menge,Einzelpreis,Summe');
  assert.ok(HELP['b2b-calc-csv']?.contents.some((c) => c.includes('Position, Menge, Einzelpreis, Summe')));
  assert.match(csv, /,45\.00,/, 'Beträge mit Punkt – wie in der Anleitung beschrieben');
  assert.ok(HELP['b2b-calc-csv']?.steps.some((s) => /Punkt als Dezimaltrennzeichen/.test(s)));
  assert.ok(HELP['b2b-calc-csv']?.limits.some((s) => /keine Excel-Formeln/.test(s)), 'ehrlich: keine Formeln');
  assert.match(csv, /Erstellt mit INFINITY EARN/);
  for (const id of ['b2b-calc-csv', 'b2b-calc-pdf', 'b2b-calc-bundle']) assert.match(renderHelp(id) ?? '', /<h1>So nutzen Sie/);
  assert.equal(renderHelp('video-production'), null, 'keine Anleitung für nicht angebotene Produkte');
});

test('092 Nachtrag: eigenes Angebot zum bezahlten Auftrag, Original bleibt unverändert, beauftragt erst nach Zahlung', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const before = getOrder(ctx, d.orderId);
  const key = d.customerAccessKey ?? undefined;
  const r = requestChange(ctx, key, d.orderId, [{ name: 'Zusatzleistung', quantity: 2, unit_cost_minor: 2500 }], 'Bitte ergänzen');
  assert.equal(r.stage, 'QUOTED');
  const q = getQuote(ctx, r.quote?.quoteId ?? '');
  assert.match(JSON.parse(q.scope).title as string, /^Nachtrag zu IE-/);
  assert.equal((JSON.parse(q.scope) as { margin_bps: number }).margin_bps, 2000, 'gleicher Aufschlag wie im Original');
  assert.deepEqual(getOrder(ctx, d.orderId), before, 'Original-Auftrag unverändert');
  let ch = changesForOrder(ctx, d.orderId);
  assert.equal(ch.length, 1);
  assert.equal(ch[0]?.paid, false, 'nicht stillschweigend beauftragt');
  assert.throws(() => requestChange(ctx, toDelivered(ctx).customerAccessKey ?? undefined, d.orderId, [{ name: 'x', quantity: 1, unit_cost_minor: 100 }], ''), /FORBIDDEN/);
  const unpaid = toOrder(ctx);
  assert.throws(() => requestChange(ctx, unpaid.customerAccessKey ?? undefined, unpaid.orderId, [{ name: 'x', quantity: 1, unit_cost_minor: 100 }], ''), /ORIGINAL_NOT_PAID/);
  // Annahme + Zahlung über den regulären Ablauf
  const { acceptQuote, createCheckout } = workflow;
  const acc = acceptQuote(ctx, q.quote_id, r.quote?.acceptanceToken ?? '', { termsAccepted: true, ipHash: 'x', buyer: { name: 'Test GmbH', address: 'Teststraße 1, 10115 Berlin', country: 'DE', type: 'B2B', vatId: null } });
  createCheckout(ctx, acc.orderId);
  mockPay(ctx, getOrder(ctx, acc.orderId));
  ch = changesForOrder(ctx, d.orderId);
  assert.equal(ch[0]?.paid, true);
  assert.match(renderConsole(ctx, `/dashboard/auftraege/${d.orderId}`, new URLSearchParams(), 'x') ?? '', /<dt>Nachträge<\/dt><dd>1 zusätzliche Position\(en\) – Bitte ergänzen – <span class="tag ok">/);
});

test('HTTP: Nachtrag aus dem Portal führt direkt zum neuen Angebot; Anleitung öffentlich abrufbar', async () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const { server, base } = await serve(ctx);
  try {
    const c = new Client(base);
    c.cookies.set('ie_customer', d.customerAccessKey ?? '');
    const portal = await c.get('/portal');
    assert.match(portal.text, /Erweiterung anfragen \(Nachtrag\)/);
    assert.match(portal.text, /href="\/hilfe\/b2b-calc-csv"/);
    const r = await c.post('/portal/nachtrag', { order_id: d.orderId, items: 'Zusatz;1;30,00', note: '' });
    assert.equal(r.status, 303);
    assert.match(r.location ?? '', /^\/angebot\/quo_[a-f0-9]+\?t=/);
    const bad = await c.post('/portal/nachtrag', { order_id: d.orderId, items: 'kaputt', note: '' });
    assert.equal(bad.status, 400);
    assert.equal((await c.get('/hilfe/b2b-calc-csv')).status, 200);
    assert.equal((await c.get('/hilfe/unbekannt')).status, 404);
  } finally {
    server.close();
  }
});

import * as workflow from '../../services/core-api/src/workflow.ts';
