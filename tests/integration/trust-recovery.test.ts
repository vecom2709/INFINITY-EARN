import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderTrust } from '../../apps/customer-portal/src/pages.ts';
import { renderConsole } from '../../apps/console/src/index.ts';
import { assertCanResume, openCheckouts, trustFacts } from '../../services/core-api/src/trust.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { recordAcceptance, recordFeedback } from '../../services/core-api/src/aftercare.ts';
import { mockPay } from '../../services/finance/src/mock-provider.ts';
import { Client, serve } from '../http.ts';
import { count, makeCtx, toDelivered, toOrder } from '../helpers.ts';

test('118/125 Vertrauensfakten: keine erfundenen Anbieterdaten, nur freigegebene Produkte mit echten Prüfungszahlen', () => {
  const { ctx } = makeCtx();
  const f = trustFacts(ctx);
  assert.deepEqual([f.provider.verified, f.provider.legal_name, f.provider.registration], [false, null, null]);
  assert.match(f.provider.note, /LA-02/);
  assert.equal(f.operating_mode, 'TEST');
  assert.deepEqual(f.products.map((p) => [p.id, p.quality_checks]), [['b2b-calc-csv', 5]], 'nur freigegebene Produktart, QA-Anzahl aus dem Register');
  assert.equal(f.payments.card_data_stored_by_us, false);
  assert.equal(f.data_protection.tracking_cookies, false);
  const html = renderTrust(f);
  assert.match(html, /Noch nicht verifiziert/);
  assert.doesNotMatch(html, /zertifiziert|ISO 9001|TÜV|Partner von/i, 'keine erfundenen Zertifikate oder Partner');
});

test('118 Testbewertungen erscheinen nie öffentlich – auch nicht mit Einwilligung', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  recordAcceptance(ctx, d.customerAccessKey ?? undefined, d.orderId, 'ACCEPTED', '');
  recordFeedback(ctx, d.customerAccessKey ?? undefined, d.orderId, { rating: 5, outcome: 'IN_USE', comment: 'Super Testkommentar', consentPublish: true });
  const f = trustFacts(ctx);
  assert.deepEqual([f.feedback.live_reviews, f.feedback.published_comments.length], [0, 0]);
  assert.doesNotMatch(renderTrust(f), /Super Testkommentar/);
});

test('119 Wiederaufnahme: offene/fehlgeschlagene Zahlungen gelistet, nur der eigene Kunde kann fortsetzen, keine Erinnerungen', () => {
  const { ctx, clock } = makeCtx();
  const open = toOrder(ctx);
  const failed = toOrder(ctx);
  mockPay(ctx, getOrder(ctx, failed.orderId), { outcome: 'failed' });
  assert.deepEqual(openCheckouts(ctx, true).map((o) => o.orderId), [failed.orderId], 'offen erst nach 1 Std., fehlgeschlagen sofort');
  clock.advance(2 * 3_600_000);
  assert.equal(openCheckouts(ctx, true).length, 2);
  assertCanResume(ctx, open.customerAccessKey ?? undefined, open.orderId);
  assert.throws(() => assertCanResume(ctx, failed.customerAccessKey ?? undefined, open.orderId), /FORBIDDEN/);
  const paid = toDelivered(ctx);
  assert.throws(() => assertCanResume(ctx, paid.customerAccessKey ?? undefined, paid.orderId), /NOTHING_TO_RESUME/);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM audit_events WHERE event_type LIKE '%reminder%' OR event_type LIKE 'marketing%'`), 0, 'keine Erinnerungen verschickt');
  assert.match(renderConsole(ctx, '/dashboard/finanzen', new URLSearchParams('modus=test'), 'x') ?? '', /keine automatischen Erinnerungen/);
});

test('HTTP: Vertrauensseite, JSON-Pass und „Zahlung fortsetzen“ im Portal', async () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  mockPay(ctx, getOrder(ctx, o.orderId), { outcome: 'failed' });
  const { server, base } = await serve(ctx);
  try {
    const anon = new Client(base);
    assert.match((await anon.get('/vertrauen')).text, /Vertrauen &amp; Fakten/);
    const j = await anon.get('/.well-known/infinity-earn.json');
    assert.equal((JSON.parse(j.text) as { schema: string }).schema, 'infinity-earn-trust/1');
    assert.doesNotMatch(j.text, /@|ord_|cus_/, 'keine personenbezogenen oder Auftragsdaten im öffentlichen Pass');
    const c = new Client(base);
    c.cookies.set('ie_customer', o.customerAccessKey ?? '');
    const portal = await c.get('/portal');
    assert.match(portal.text, /Die letzte Zahlung ist nicht zustande gekommen/);
    const r = await c.post('/portal/zahlung', { order_id: o.orderId });
    assert.equal(r.status, 303);
    assert.match(r.location ?? '', /^\/checkout\/mock\/cs_test_mock_/, 'neue Zahlungssitzung');
    assert.equal(getOrder(ctx, o.orderId).payment_state, 'UNPAID');
    assert.equal((await anon.post('/portal/zahlung', { order_id: o.orderId })).location, '/portal?fehler=FORBIDDEN');
  } finally {
    server.close();
  }
});
