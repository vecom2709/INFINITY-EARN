import assert from 'node:assert/strict';
import { test } from 'node:test';
import { understand } from '../../services/core-api/src/advisor.ts';
import { createHandler } from '../../services/core-api/src/http-core.ts';
import { makeCtx } from '../helpers.ts';

const ALL = ['b2b-calc-csv', 'b2b-calc-pdf', 'b2b-calc-bundle'];

test('Berater versteht natürliche Sprache (DE): Positionen, Aufschlag, Format', () => {
  const a = understand('Ich brauche eine Kalkulation Badsanierung als PDF: Fliesen 24 m² à 38 €, Arbeit 16 h à 52 €, Entsorgung pauschal 180 €. Aufschlag 15 %', ALL);
  assert.deepEqual(a.items, ['Fliesen;24;38', 'Arbeit;16;52', 'Entsorgung;1;180']);
  assert.equal(a.marginPct, 15);
  assert.equal(a.format, 'b2b-calc-pdf');
  assert.equal(a.outOfScope, null);
  assert.ok(a.questions.every((q) => !/Positionen|Aufschlag|Format/.test(q)), 'fragt nichts nach, was schon klar ist');
});

test('Berater versteht Italienisch und Englisch sowie Excel-Zeilen', () => {
  const it = understand('Mi serve un preventivo in tabella: 2 x Montaggio a 45 €, Materiale 3 pz a 12,50 €, ricarico 20 %', ALL);
  assert.deepEqual(it.items, ['Montaggio;2;45', 'Materiale;3;12,50']);
  assert.equal(it.format, 'b2b-calc-csv');
  assert.equal(it.marginPct, 20);
  const en = understand('I need both files: Installation 10 h @ 60, travel lump sum 35. markup 10%', ALL);
  assert.deepEqual(en.items, ['Installation;10;60', 'travel;1;35']);
  assert.equal(en.format, 'b2b-calc-bundle');
  const xl = understand('Montage\t2\t45,00\nMaterial\t1\t20', ALL);
  assert.deepEqual(xl.items, ['Montage;2;45,00', 'Material;1;20']);
});

test('Berater erfindet nichts: Fehlendes wird gefragt, Nicht-Lieferbares ehrlich abgelehnt', () => {
  const vague = understand('Ich brauche ein Angebot für meine Kunden', ALL);
  assert.deepEqual(vague.items, []);
  assert.equal(vague.marginPct, null);
  assert.ok(vague.questions.some((q) => /Positionen/.test(q)) && vague.questions.some((q) => /Aufschlag/.test(q)) && vague.questions.some((q) => /Format/.test(q)));
  const web = understand('Bitte eine neue Website mit Shop für meinen Betrieb', ALL);
  assert.match(web.outOfScope ?? '', /nicht zu unseren lieferbaren Produkten/);
  const onlyCsv = understand('Als PDF bitte: Montage 2 x 45', ['b2b-calc-csv']);
  assert.equal(onlyCsv.format, null);
  assert.ok(onlyCsv.questions.some((q) => /nicht bestellbar/.test(q)), 'nicht freigegebenes Format wird nicht angenommen');
});

test('HTTP: Berater → vorausgefüllte Anfrage → echtes Angebot über dieselbe Kette', async () => {
  const { ctx } = makeCtx();
  const h = createHandler(ctx);
  const post = (url: string, body: Record<string, string>) => h({ method: 'POST', url, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString(), ip: '127.0.0.1' });
  assert.equal((await h({ method: 'GET', url: '/berater', headers: {}, body: '', ip: '127.0.0.1' })).status, 200);
  const r = await post('/berater', { wunsch: 'Kalkulation Umbau: Montage 2 x à 45 €, Material pauschal 20 €, Aufschlag 20 %' });
  const page = String(r.body);
  assert.match(page, /Das habe ich verstanden/);
  assert.match(page, /Montage;2;45/);
  assert.doesNotMatch(page, /<script/i);
  const nope = await post('/berater', { wunsch: 'Ich möchte ein Logo' });
  assert.match(String(nope.body), /Derzeit nicht lieferbar/);
  const items = /<textarea id="items"[^>]*>([^<]*)</.exec(page)?.[1]?.replace(/&#10;/g, '\n') ?? '';
  const sent = await post('/anfrage', { name: 'Test', email: 'berater@example.invalid', country: 'DE', title: 'Umbau', items, margin: '20', message: 'über Berater', privacy: '1', format: 'b2b-calc-csv' });
  assert.equal(sent.status, 303);
  assert.match(String(sent.headers?.location), /^\/angebot\/quo_/, 'gleiches Angebotssystem wie das Formular');
});
