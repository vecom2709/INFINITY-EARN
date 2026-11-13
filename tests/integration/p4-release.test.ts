import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readZip } from '../../packages/shared/src/zip.ts';
import { createHandler } from '../../services/core-api/src/http-core.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { activeRelease, isSellable, releaseProduct, revokeProduct, sampleQa } from '../../services/core-api/src/releases.ts';
import { acceptQuote, autoProcessOpportunity, createCheckout } from '../../services/core-api/src/workflow.ts';
import { submitInboundLead } from '../../services/acquisition/src/leads.ts';
import { mockPay } from '../../services/finance/src/mock-provider.ts';
import { miniWw } from '../../services/product-factory/src/capabilities/mini-ww.ts';
import { runProductionOnce } from '../../services/product-factory/src/production.ts';
import { buyer, inbound, makeCtx } from '../helpers.ts';

/** P4 – Vorschau, Produktseite, Festpreis und Verkaufsfreigabe der Mini-Warenwirtschaft durch den Eigentümer. */
const ENV = { ALLOWED_CAPABILITIES: 'b2b-calc-csv,mini-ww' };
const wwScope = { company: 'Ferramenta Rossi', primary: '#1F5FA8', language: 'it', setup: { paymentTermDays: 30 } };
const get = (h: ReturnType<typeof createHandler>, url: string) => h({ method: 'GET', url, headers: {}, body: '', ip: '127.0.0.1' });

test('Ohne Freigabe nicht bestellbar: Anfrage wird ehrlich abgelehnt, Produktseite ohne Bestellformular', async () => {
  const { ctx } = makeCtx({ env: ENV });
  assert.equal(isSellable(ctx, 'mini-ww'), false);
  const lead = submitInboundLead(ctx, inbound({ request: { capabilityId: 'mini-ww', scope: wwScope } }), { ipHash: 't' });
  const auto = autoProcessOpportunity(ctx, lead.opportunityId);
  assert.notEqual(auto.stage, 'QUOTED', 'ohne Freigabe kein Angebot');
  const page = String((await get(createHandler(ctx), '/produkte/warenwirtschaft')).body);
  assert.match(page, /Noch nicht bestellbar/);
  assert.doesNotMatch(page, /action="\/produkte\/warenwirtschaft\/bestellen/);
  assert.match(page, /\/demo\/warenwirtschaft/, 'Demo trotzdem erreichbar');
  const post = await createHandler(ctx)({ method: 'POST', url: '/produkte/warenwirtschaft/bestellen', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=A&email=a%40b.example', ip: '127.0.0.1' });
  assert.equal(post.status, 409);
});

test('Freigabe: Preis außerhalb der Policy abgelehnt; Musterpaket wird geprüft; danach Festpreis im Angebot und Lieferung', () => {
  const { ctx } = makeCtx({ env: ENV });
  assert.throws(() => releaseProduct(ctx, 'mini-ww', 10), /PRICE_OUT_OF_POLICY/);
  const qa = sampleQa('mini-ww');
  assert.equal(qa.passed, true, JSON.stringify(qa.checks.filter((c) => !c.passed)));
  assert.ok(qa.checks.some((c) => c.check === 'standard_acceptance' && c.passed));
  const r = releaseProduct(ctx, 'mini-ww', 49000);
  assert.equal(r.release.price_minor, 49000);
  assert.equal(r.ceilingMissing, false);
  assert.equal(isSellable(ctx, 'mini-ww'), true);
  const lead = submitInboundLead(ctx, inbound({ request: { capabilityId: 'mini-ww', scope: wwScope } }), { ipHash: 't' });
  const auto = autoProcessOpportunity(ctx, lead.opportunityId);
  assert.equal(auto.stage, 'QUOTED', JSON.stringify(auto));
  if (auto.stage !== 'QUOTED') return;
  assert.equal(auto.quote.grossTotalMinor, 49000, 'Festpreis des Eigentümers');
  const acc = acceptQuote(ctx, auto.quote.quoteId, auto.quote.acceptanceToken, { termsAccepted: true, ipHash: 't', buyer });
  createCheckout(ctx, acc.orderId);
  mockPay(ctx, getOrder(ctx, acc.orderId));
  const run = runProductionOnce(ctx);
  assert.equal(run.results[0]?.outcome, 'DELIVERED', JSON.stringify(run));
  const art = ctx.db.get<{ path: string; capability_id: string }>('SELECT path, capability_id FROM artifacts WHERE order_id = ?', acc.orderId);
  assert.equal(art?.capability_id, 'mini-ww');
});

test('Widerruf: sofort nicht mehr bestellbar, Verlauf append-only, Grund Pflicht', () => {
  const { ctx } = makeCtx({ env: ENV });
  releaseProduct(ctx, 'mini-ww', 49000);
  assert.throws(() => revokeProduct(ctx, 'mini-ww', ' '), /REASON_REQUIRED/);
  revokeProduct(ctx, 'mini-ww', 'Preis überarbeiten');
  assert.equal(activeRelease(ctx, 'mini-ww'), null);
  assert.equal(isSellable(ctx, 'mini-ww'), false);
  assert.throws(() => ctx.db.run(`DELETE FROM product_releases`), /APPEND_ONLY/);
  assert.throws(() => ctx.db.run(`UPDATE product_releases SET price_minor = 1`), /APPEND_ONLY/);
});

test('Produktseite nach Freigabe: Preis, echte Screenshots, Bestellung über das Formular bis zum Angebot (IT)', async () => {
  const { ctx } = makeCtx({ env: ENV });
  releaseProduct(ctx, 'mini-ww', 49000);
  const h = createHandler(ctx);
  const page = String((await get(h, '/produkte/warenwirtschaft?lang=it')).body);
  assert.match(page, /490,00 €/);
  assert.match(page, /<html lang="it">/);
  const shots = [...page.matchAll(/src="(\/bilder\/ww\/it-[a-z]+\.jpg)"/g)].map((m) => m[1] as string);
  assert.ok(shots.length >= 6);
  const img = await get(h, shots[0] as string);
  assert.equal(img.status, 200);
  assert.deepEqual([...(img.body as Uint8Array).slice(0, 2)], [0xff, 0xd8]);
  const body = new URLSearchParams({ name: 'Mario Rossi', email: 'mario@rossi.example', company: 'Ferramenta Rossi', country: 'IT', brand_company: 'Ferramenta Rossi', primary: '#C8A2C8', language: 'it', tax: 'IT', term: '30', privacy: '1', src: 'product-page' }).toString();
  const res = await h({ method: 'POST', url: '/produkte/warenwirtschaft/bestellen?lang=it', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, ip: '127.0.0.1' });
  assert.equal(res.status, 303, String(res.body).slice(0, 300));
  const loc = String(res.headers?.location ?? '');
  assert.match(loc, /^\/angebot\/quo_/);
  const quote = String((await get(h, loc)).body);
  assert.match(quote, /Gestionale come programma con il design di/);
  const scope = JSON.parse(ctx.db.get<{ scope: string }>('SELECT scope FROM quotes ORDER BY created_at DESC LIMIT 1')?.scope ?? '{}') as { setup: { taxRates: { bps: number }[]; paymentTermDays: number } };
  assert.deepEqual(scope.setup.taxRates.map((t) => t.bps), [2200, 1000, 400, 0], 'Steuersätze Italien');
  assert.equal(scope.setup.paymentTermDays, 30);
  assert.equal(ctx.db.get<{ c: string }>('SELECT acquisition_channel AS c FROM leads ORDER BY created_at DESC LIMIT 1')?.c, 'product-page');
  const bad = await h({ method: 'POST', url: '/produkte/warenwirtschaft/bestellen', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.replace('term=30', 'term=500'), ip: '127.0.0.1' });
  assert.equal(bad.status, 400);
  assert.match(String(bad.body), /Zahlungsziel: 1–120 Tage/);
});

test('Demo (152): eigene strenge CSP ohne Netzwerk, Beispieldaten gekennzeichnet, nicht indexiert; Musterpaket nur für den Eigentümer', async () => {
  const { ctx } = makeCtx({ env: ENV });
  const h = createHandler(ctx);
  const d = await get(h, '/demo/warenwirtschaft?lang=en');
  assert.equal(d.status, 200);
  const csp = String(d.headers?.['content-security-policy'] ?? '');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /connect-src|https?:/);
  assert.equal(d.headers?.['x-robots-tag'], 'noindex');
  assert.match(String(d.body), /"demo":true/);
  assert.match(String(d.body), /Example Company \(demo\)/);
  const zip = await get(h, '/admin/muster/mini-ww/paket.zip');
  assert.equal(zip.status, 303, 'ohne Anmeldung kein Musterpaket');
  assert.equal(readZip(miniWw.generate({ company: 'Musterfirma', primary: '#1F5FA8', language: 'de' })).length, 3, 'Programm, Anleitung, LIESMICH');
});
