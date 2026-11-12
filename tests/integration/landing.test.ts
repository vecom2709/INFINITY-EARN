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

test('Startseite DE/IT/EN: richtige Sprache, hreflang-Alternativen, Sprachwechsel, gleiche echte Zahlen', () => {
  const o = 'https://beispiel.invalid';
  const pages = { de: renderHome(ALL, 'de', o), it: renderHome(ALL, 'it', o), en: renderHome(ALL, 'en', o) };
  assert.match(pages.it, /<html lang="it">/);
  assert.match(pages.en, /<html lang="en">/);
  assert.match(pages.it, /Lavoro digitale/);
  assert.match(pages.en, /Digital work/);
  assert.match(pages.it, /MODALITÀ TEST/);
  assert.match(pages.en, /TEST MODE/);
  for (const h of Object.values(pages)) {
    for (const [l, p] of [['de', '/'], ['it', '/it'], ['en', '/en'], ['x-default', '/']]) assert.ok(h.includes(`hreflang="${l}" href="${o}${p}"`), `hreflang ${l}`);
    for (let i = 1; i <= 8; i++) assert.match(h, new RegExp(`id="k${i}"`));
    assert.match(h, /174,00 €/, 'gleiche nachgerechnete Beispielsumme in jeder Sprache');
    assert.doesNotMatch(h, /<script/i);
  }
  assert.match(pages.it, /href="\/it" hreflang="it" lang="it" aria-current="true"/);
  assert.match(pages.de, /<link rel="canonical" href="https:\/\/beispiel\.invalid\/">/);
});

test('HTTP: /it, /en, robots.txt sperrt interne Bereiche, Sitemap nennt nur öffentliche Seiten', async () => {
  const { makeCtx } = await import('../helpers.ts');
  const { createHandler } = await import('../../services/core-api/src/http-core.ts');
  const { ctx } = makeCtx();
  const core = createHandler(ctx);
  const get = async (url: string) => core({ method: 'GET', url, headers: {}, body: '', ip: '127.0.0.1' });
  assert.match(String((await get('/it')).body), /<html lang="it">/);
  assert.match(String((await get('/en')).body), /<html lang="en">/);
  const robots = String((await get('/robots.txt')).body);
  for (const p of ['/dashboard', '/admin', '/portal', '/api/']) assert.ok(robots.includes(`Disallow: ${p}`), p);
  const sitemap = String((await get('/sitemap.xml')).body);
  assert.match(sitemap, /<loc>[^<]+\/it<\/loc>/);
  assert.doesNotMatch(sitemap, /dashboard|admin|portal/);
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
