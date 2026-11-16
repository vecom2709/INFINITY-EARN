import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CRITERIA_LABELS, criterionLabel } from '../../apps/customer-portal/src/i18n-pages.ts';
import { renderPortal } from '../../apps/customer-portal/src/pages.ts';
import type { CustomerRow } from '../../services/core-api/src/customers.ts';
import { getCapability, listCapabilities } from '../../services/product-factory/src/registry.ts';
import { inbound, makeCtx, toDelivered } from '../helpers.ts';
import { Client, serve } from '../http.ts';

/**
 * Tiefenprüfung Kundenbereich (16.11.2026): Funde aus dem Durchgang im echten Browser – technische Kürzel im Angebot,
 * doppeltes „Gültig gültig bis“, falsche Dateibezeichnung „(CSV)“ bei Excel-Aufträgen.
 */
const SCOPE = { title: 'Montage Halle 3', currency: 'EUR', margin_bps: 1750, language: 'de', items: [{ name: 'Montage', quantity: 10, unit_cost_minor: 4500 }, { name: 'Material', quantity: 3, unit_cost_minor: 12050 }] };
const ENV = { ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-xlsx,b2b-calc-pdf,b2b-calc-bundle', OWNER_ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-xlsx,b2b-calc-pdf,b2b-calc-bundle' };

test('Jede Abnahmeprüfung jeder Produktart hat einen verständlichen Namen in drei Sprachen', () => {
  const ids = new Set(listCapabilities().flatMap((c) => getCapability(c.id)?.qa_suite ?? []));
  assert.ok(ids.size >= 20);
  for (const id of ids) {
    const l = CRITERIA_LABELS[id];
    assert.ok(l, `Name fehlt für ${id}`);
    for (const lang of ['de', 'it', 'en'] as const) assert.ok(l[lang].length > 5 && !l[lang].includes('_'), `${id}/${lang}`);
  }
  assert.equal(criterionLabel('unbekannt_xyz'), 'unbekannt_xyz', 'Unbekanntes bleibt sichtbar statt zu verschwinden');
});

test('Angebot im Browserweg: keine technischen Kürzel, kein doppeltes „gültig“, Excel als Format wählbar', async () => {
  const { ctx } = makeCtx({ env: ENV });
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    const r = await c.post('/anfrage', { name: 'Test Einkauf', email: 'einkauf@pruef-gmbh.example', company: 'Prüf GmbH', country: 'DE', title: 'Montage Halle 3', items: 'Montage;10;45,00\nMaterial;3;120,50', margin: '17,5', message: 'Bitte als Excel-Datei.', privacy: '1', format: 'b2b-calc-xlsx' }, { 'sec-fetch-site': 'same-origin', origin: 'null' });
    assert.equal(r.status, 303, 'Formular aus dem Browser (Origin null) wird angenommen');
    const offer = (await c.get(r.location ?? '')).text;
    assert.match(offer, /Formeln vorhanden und richtig/);
    assert.match(offer, /Summen nachgerechnet/);
    for (const raw of ['xlsx_formulas', 'xlsx_structure', 'formula_injection']) assert.ok(!offer.includes(raw), `Kürzel ${raw} nicht sichtbar`);
    assert.ok(!/Gültig<\/span>\s*<span class="muted">gültig bis/.test(offer), 'kein „Gültig gültig bis“');
    assert.match(offer, /Gültig<\/span>\s*<span class="muted">bis \d{4}-\d{2}-\d{2}/);
    assert.match((await c.get(`${r.location ?? ''}&lang=en`)).text, /Formulas present and correct/);
  } finally {
    s.server.close();
  }
});

test('Kundenportal nennt die gelieferte Datei richtig: Excel (XLSX) statt CSV', () => {
  const { ctx } = makeCtx({ env: ENV });
  const x = toDelivered(ctx, inbound({ request: { capabilityId: 'b2b-calc-xlsx', scope: SCOPE } }));
  const customer = ctx.db.get<CustomerRow>('SELECT * FROM customers WHERE customer_id = ?', x.customerId) as CustomerRow;
  const html = renderPortal(ctx, customer);
  assert.match(html, /Download: Ihre Kalkulation \(Excel \(XLSX\)\)/);
  assert.ok(!html.includes('Ihre Kalkulation (CSV)'));
  const csv = toDelivered(ctx, inbound({ email: 'zwei@pruef-gmbh.example', request: { capabilityId: 'b2b-calc-csv', scope: SCOPE } }));
  const c2 = ctx.db.get<CustomerRow>('SELECT * FROM customers WHERE customer_id = ?', csv.customerId) as CustomerRow;
  assert.match(renderPortal(ctx, c2), /Ihre Kalkulation \(CSV\)/);
});
