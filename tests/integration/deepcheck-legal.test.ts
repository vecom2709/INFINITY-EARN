import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCEPT_ERRORS, acceptError } from '../../services/core-api/src/http-core.ts';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { count, makeCtx } from '../helpers.ts';
import { Client, serve } from '../http.ts';

/**
 * Tiefenprüfung Recht und Freigaben (16.11.2026). Funde: Ein unbekannter Käufertyp galt stillschweigend als
 * Unternehmen (Verbraucherschutz entfiel), eine USt-ID wurde ungeprüft gespeichert, und abgelehnte Annahmen zeigten
 * dem Kunden interne Kürzel statt einer verständlichen Meldung.
 */
const INQUIRY = { name: 'Test', country: 'DE', title: 'T', items: 'Montage;10;45,00', margin: '10', message: 'x', privacy: '1', format: 'b2b-calc-csv' };
const BUYER = { buyer_name: 'Prüf GmbH', buyer_address: 'Teststraße 1, 10115 Berlin', buyer_country: 'DE', buyer_type: 'B2B', terms: '1' };
const RAW_CODE = /\b[A-Z]{3,}(?:_[A-Z]{2,})+\b/;

async function withServer(fn: (ctx: AppContext, base: string) => Promise<void>): Promise<void> {
  const { ctx } = makeCtx({ env: { ALLOWED_CAPABILITIES: 'b2b-calc-csv', OWNER_ALLOWED_CAPABILITIES: 'b2b-calc-csv' } });
  const s = await serve(ctx);
  try {
    await fn(ctx, s.base);
  } finally {
    s.server.close();
  }
}
let n = 0;
async function accept(base: string, over: Record<string, string>, lang = ''): Promise<{ status: number; text: string; location: string | null }> {
  const c = new Client(base);
  const r = await c.post('/anfrage', { ...INQUIRY, email: `kunde${n++}@pruef.example` });
  const loc = r.location ?? '';
  const t = decodeURIComponent(/t=([^&]+)/.exec(loc)?.[1] ?? '');
  return c.post(`${loc.split('?')[0]}/annehmen${lang}`, { t, ...BUYER, ...over });
}

test('Unbekannter oder fehlender Käufertyp wird abgelehnt – nie stillschweigend als Unternehmen behandelt', async () => {
  await withServer(async (ctx, base) => {
    for (const over of [{ buyer_type: 'XYZ' }, { buyer_type: '' }, { buyer_type: 'b2c' }]) {
      const r = await accept(base, over);
      assert.equal(r.status, 400, JSON.stringify(over));
      assert.match(r.text, /ob Sie als Unternehmen oder als Verbraucher kaufen/);
    }
    assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM orders'), 0);
    assert.equal((await accept(base, { buyer_type: 'B2B' })).status, 303);
  });
});

test('USt-ID: nur plausibles Format wird angenommen; leer bleibt erlaubt', async () => {
  await withServer(async (ctx, base) => {
    for (const bad of ['<script>', '123456789', 'DE', 'DE-!!', 'D1234567']) {
      const r = await accept(base, { vat_id: bad });
      assert.equal(r.status, 400, bad);
      assert.match(r.text, /Umsatzsteuer-Identifikationsnummer hat kein gültiges Format/);
    }
    assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM orders'), 0);
    for (const good of ['DE123456789', 'it 12345678901', 'ATU12345678', '']) assert.equal((await accept(base, { vat_id: good })).status, 303, good);
  });
});

test('Abgelehnte Annahme: verständliche Meldung mit Rückweg, keine internen Kürzel – auch auf Englisch', async () => {
  await withServer(async (_ctx, base) => {
    const cases: [Record<string, string>, RegExp][] = [
      [{ buyer_country: 'US' }, /nur an Kunden mit Sitz in der Europäischen Union/],
      [{ buyer_country: 'Deutschland' }, /Land als zweistelligen Code/],
      [{ buyer_type: 'B2C' }, /Als Verbraucher müssen Sie der sofortigen Ausführung zustimmen/],
      [{ terms: '' }, /Bitte bestätigen Sie die Bedingungen/],
      [{ buyer_name: ' ' }, /Rechnungsname, Rechnungsadresse/],
    ];
    for (const [over, expected] of cases) {
      const r = await accept(base, over);
      assert.equal(r.status, 400, JSON.stringify(over));
      assert.match(r.text, expected);
      const main = /<main[\s\S]*<\/main>/.exec(r.text)?.[0] ?? '';
      assert.ok(!RAW_CODE.test(main.replace(/<[^>]+>/g, ' ')), `kein internes Kürzel sichtbar: ${JSON.stringify(over)}`);
      assert.match(main, /Zurück zum Angebot/);
    }
    assert.match((await accept(base, { buyer_country: 'US' }, '?lang=en')).text, /only customers based in the European Union/);
    assert.equal((await accept(base, { buyer_type: 'B2C', waiver_immediate: '1', waiver_loss: '1' })).status, 303, 'Verbraucher mit beiden Zustimmungen');
  });
});

test('Jede Meldung ist ein ganzer Satz; unbekannte Fehler bekommen eine allgemeine Meldung', () => {
  for (const [code, text] of Object.entries(ACCEPT_ERRORS)) assert.ok(text.length > 30 && /[.!]$/.test(text) && !RAW_CODE.test(text), code);
  assert.match(acceptError('GIBT_ES_NICHT'), /gerade nicht möglich/);
});
