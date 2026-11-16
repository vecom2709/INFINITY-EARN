import assert from 'node:assert/strict';
import { test } from 'node:test';
import { page } from '../../apps/shared/layout.ts';
import { makeCtx } from '../helpers.ts';
import { Client, serve } from '../http.ts';

/**
 * Einheitlicher Kopfbereich (16.11.2026): Jede Kundenseite trägt dieselbe dunkle Leiste mit Logo, demselben Menü,
 * Sprachwahl und Betriebsart. Sprachwahl und Betriebsart stehen außerhalb der Menüzeile, damit sie auf Tablet und
 * Handy nicht aus dem Bild geschoben werden.
 */
const PAGES = ['/', '/it', '/en', '/anfrage', '/berater', '/portal', '/vertrauen', '/pruefen', '/programm-nach-vorlage', '/hilfe/b2b-calc-csv', '/produkte/warenwirtschaft', '/login'];

test('Alle Kundenseiten: gleiche Leiste, gleiches Logo, gleiches Menü mit sechs Punkten', async () => {
  const { ctx } = makeCtx();
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    for (const p of PAGES) {
      const h = (await c.get(p)).text;
      assert.equal((h.match(/<header class="site dark">/g) ?? []).length, 1, `${p}: dunkle Leiste`);
      assert.match(h, /<a class="brand xl"[^>]*>[\s\S]*?Infinity <i>Earn<\/i>/, `${p}: Logo`);
      const nav = /<nav aria-label="Hauptnavigation">([\s\S]*?)<\/nav>/.exec(h)?.[1] ?? '';
      assert.equal((nav.match(/<a /g) ?? []).length, 6, `${p}: sechs Menüpunkte`);
      for (const target of ['#k4', '#k2', '#k3', '/vertrauen', '/anfrage']) assert.ok(nav.includes(`${target}"`), `${p}: Menüpunkt ${target}`);
      assert.ok(!nav.includes('class="langs"') && !nav.includes('class="mode"'), `${p}: Sprachwahl und Betriebsart nicht in der Menüzeile`);
      assert.match(h, /<div class="tools">[\s\S]*?class="mode"/, `${p}: Betriebsart sichtbar`);
      assert.match(h, /href="\/portal"/, `${p}: Kundenportal erreichbar`);
    }
    for (const p of ['/', '/anfrage', '/portal']) assert.match((await c.get(p)).text, /<div class="tools"><span class="langs" role="group"/, `${p}: Sprachwahl neben dem Logo`);
  } finally {
    s.server.close();
  }
});

test('Startseite liegt über dem Titelbild, alle anderen Seiten haben die Leiste fest über dem Inhalt', () => {
  assert.match(page('Start', '<p>x</p>', { testMode: true, theme: 'dark' }), /<div class="darkzone">/);
  const inner = page('Innen', '<p>x</p>', { testMode: true, active: 'anfrage' });
  assert.match(inner, /<div class="darkzone bar">/);
  assert.match(inner, /href="\/anfrage" aria-current="page">Kontakt/);
  assert.match(inner, /\.darkzone\.bar header\.site\.dark\{position:relative/);
  assert.match(inner, /\.site \.langs a\{[^}]*border-radius:999px/, 'aktive Sprache als runde Fläche, nicht eckig');
});
