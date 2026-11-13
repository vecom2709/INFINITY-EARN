import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DICT, pickLang, productTitle } from '../../apps/customer-portal/src/i18n-pages.ts';
import { renderCheckoutReturn, renderInquiryForm, renderPortal, renderQuote } from '../../apps/customer-portal/src/pages.ts';
import { createHandler, parseItemsText } from '../../services/core-api/src/http-core.ts';
import { customerByKey } from '../../services/core-api/src/customers.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { getQuote } from '../../services/core-api/src/workflow.ts';
import { makeCtx, toDelivered, toQuote } from '../helpers.ts';

test('Jeder übersetzbare Text der Kundenseiten hat eine italienische und englische Fassung', () => {
  const src = readFileSync('apps/customer-portal/src/pages.ts', 'utf8');
  const used = new Set<string>();
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)+)'\)/g)) used.add(m[1] ?? '');
  for (const m of src.matchAll(/\bt\((?:[^()']|'[^']*')*?\? '((?:[^'\\]|\\.)+)' : '((?:[^'\\]|\\.)+)'\)/g)) { used.add(m[1] ?? ''); used.add(m[2] ?? ''); }
  for (const m of src.matchAll(/STEPS = \[([^\]]+)\]/g)) for (const s of (m[1] ?? '').matchAll(/'([^']+)'/g)) used.add(s[1] ?? '');
  const http = readFileSync('services/core-api/src/http-core.ts', 'utf8');
  for (const m of http.matchAll(/renderInquiryResult\('([^']+)', '([^']+)'/g)) { used.add(m[1] ?? ''); used.add(m[2] ?? ''); }
  for (const m of http.matchAll(/PORTAL_(?:MSG|ERR): Record<string, string> = \{([\s\S]*?)\n {2}\};/g)) for (const s of (m[1] ?? '').matchAll(/: '([^']+)'/g)) used.add(s[1] ?? '');
  assert.ok(used.size > 150, `gefunden: ${used.size}`);
  const missing = [...used].filter((k) => !DICT[k]?.it || !DICT[k]?.en);
  assert.deepEqual(missing, [], 'fehlende Übersetzungen');
});

test('Seiten in IT/EN: richtige Sprache, Rahmen übersetzt, keine deutschen Bedientexte; Rechtstexte bewusst deutsch mit Hinweis', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  const d = toDelivered(ctx);
  const it = renderInquiryForm(['Indicare almeno una voce.'], {}, ['b2b-calc-csv', 'b2b-calc-pdf'], undefined, 'it');
  assert.match(it, /<html lang="it">/);
  assert.match(it, /Richiedi un’offerta/);
  assert.match(it, /MODALITÀ TEST/);
  for (const de of ['Angebot anfordern', 'Ihre Angaben', 'Anfrage senden', 'Gewünschter Aufschlag']) assert.ok(!it.includes(de), `deutsch übrig: ${de}`);
  const quoteEn = renderQuote(getQuote(ctx, q.quote.quoteId), 'tok', 'en');
  assert.match(quoteEn, /Accept the quote and pay/);
  assert.match(quoteEn, /The German version is authoritative/);
  assert.match(quoteEn, /<ul lang="de">/, 'Rechtstext als deutsch gekennzeichnet');
  assert.match(quoteEn, /Calculation spreadsheet as requested/);
  const portalIt = renderPortal(ctx, customerByKey(ctx, d.customerAccessKey ?? undefined), undefined, 'it');
  assert.match(portalIt, /I vostri documenti/);
  assert.match(portalIt, /La consegna va bene\?/);
  assert.doesNotMatch(portalIt, /Ihre Dokumente|Zahlung fortsetzen|Meine Daten exportieren|Passt die Lieferung/);
  assert.match(renderCheckoutReturn(getOrder(ctx, d.orderId), 'en'), /Thank you for your order/);
  const de = renderInquiryForm([], {}, ['b2b-calc-csv']);
  assert.match(de, /<html lang="de">/);
  assert.match(de, /Angebot anfordern/, 'Deutsch bleibt unverändert der Standard');
});

test('Sprachwahl: ?lang= > Cookie > Browsersprache; Cookie wird gesetzt und gilt für Folgeseiten', async () => {
  assert.equal(pickLang('en', 'it', 'de-DE'), 'en');
  assert.equal(pickLang(null, 'it', 'en-US'), 'it');
  assert.equal(pickLang(null, undefined, 'it-IT,it;q=0.9'), 'it');
  assert.equal(pickLang('xx', 'zz', 'fr-FR'), 'de');
  const { ctx } = makeCtx();
  const h = createHandler(ctx);
  const r = await h({ method: 'GET', url: '/it', headers: {}, body: '', ip: '127.0.0.1' });
  assert.match(String(r.headers?.['set-cookie']), /ie_lang=it; Path=\/; Max-Age=31536000; SameSite=Lax/);
  const form = await h({ method: 'GET', url: '/anfrage', headers: { cookie: 'ie_lang=it' }, body: '', ip: '127.0.0.1' });
  assert.match(String(form.body), /<html lang="it">/);
  const en = await h({ method: 'GET', url: '/berater?lang=en', headers: { cookie: 'ie_lang=it' }, body: '', ip: '127.0.0.1' });
  assert.match(String(en.body), /Describe what you need/);
  const post = await h({ method: 'POST', url: '/berater', headers: { cookie: 'ie_lang=en', 'content-type': 'application/x-www-form-urlencoded' }, body: 'wunsch=' + encodeURIComponent('Installation 10 h @ 60, markup 10%'), ip: '127.0.0.1' });
  assert.match(String(post.body), /This is what I understood/);
  assert.match(String(post.body), /1 item with quantity and unit price/);
});

test('Positionsfehler und Produkttitel in der Sprache des Kunden', () => {
  assert.match(parseItemsText('Montaggio;dieci;45', 'EUR', 'it').errors[0] ?? '', /^Riga 1: La quantità deve essere un numero intero/);
  assert.match(parseItemsText('just text', 'EUR', 'en').errors[0] ?? '', /^Line 1 .*exactly three values/);
  assert.equal(parseItemsText('', 'EUR', 'de').errors[0], 'Mindestens eine Position angeben.');
  assert.equal(productTitle('b2b-calc-pdf gemäß Anfrage', 'it'), 'Calcolo in PDF su richiesta');
});
