import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHome } from '../../apps/customer-portal/src/pages.ts';
import { asCalcInput, computeTotals } from '../../services/product-factory/src/capabilities/b2b-calc-csv.ts';

const ALL = ['b2b-calc-csv', 'b2b-calc-pdf', 'b2b-calc-bundle'];

test('Startseite: 8 Kapitel Storyscrolling, ohne Skripte, Bewegung nur wenn erlaubt und unterstützt', () => {
  const h = renderHome(ALL);
  for (let i = 1; i <= 8; i++) assert.match(h, new RegExp(`id="k${i}"`), `Kapitel ${i}`);
  assert.equal((h.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.doesNotMatch(h, /<script|on(load|click|scroll)=/i);
  assert.match(h, /@supports \(animation-timeline: view\(\)\)\s*\{\s*@media \(prefers-reduced-motion:no-preference\)/, 'Reveal nur mit Unterstützung und erlaubter Bewegung');
  assert.match(h, /prefers-reduced-motion:no-preference\) and \(min-width:900px\)[\s\S]*?\.parallax/, 'Parallax nicht auf kleinen/leistungsarmen Geräten');
  assert.match(h, /prefers-reduced-motion:reduce/);
  assert.match(h, /<meta name="description"/);
});

test('Startseite zeigt nur freigegebene Produkte und echte, nachgerechnete Werte – keine erfundenen Zahlen', () => {
  const only = renderHome(['b2b-calc-csv']);
  assert.match(only, /Tabelle \(CSV/);
  assert.doesNotMatch(only, /Druckfertiges PDF<\/h3>/, 'nicht freigegebenes Produkt wird nicht angeboten');
  const h = renderHome(ALL);
  const t = computeTotals(asCalcInput({ title: 'x', currency: 'EUR', margin_bps: 2000, language: 'de', items: [{ name: 'Montage', quantity: 2, unit_cost_minor: 4500 }, { name: 'Material', quantity: 1, unit_cost_minor: 2000 }, { name: 'Anfahrt', quantity: 1, unit_cost_minor: 3500 }] }));
  assert.ok(h.includes(`${(t.total / 100).toFixed(2).replace('.', ',')} €`), 'Beispielsumme vom echten Rechenkern');
  assert.match(h, /Beispiel · EUR/, 'Beispiel als Beispiel gekennzeichnet');
  assert.doesNotMatch(h, /Kunden vertrauen|\d+\s?\+?\s?(zufriedene )?Kunden|★★★★★|Bewertung(en)? \d/i, 'keine erfundenen Referenzen');
  for (const href of h.matchAll(/href="([^"]+)"/g)) assert.match(href[1] ?? '', /^(\/|#k\d|#inhalt$)/, `nur echte interne Ziele: ${href[1]}`);
});
