import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { hashPassword, randomToken } from '../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { Client, csrfFrom, serve } from '../http.ts';
import { makeCtx } from '../helpers.ts';

/**
 * IE-100: Kompletter Pilot-E2E im Testmodus über die echte HTTP-Schnittstelle:
 * Anfrage -> Angebot -> Annahme -> Mock-Checkout -> signierter Webhook -> Autopilot (Produktion/QA/Lieferung/Beleg/Reconciliation)
 * -> Download -> Dashboard. Beweis: Event-IDs + Datensätze in data/e2e/. (Screenshots: siehe M0-Bericht.)
 */
const PASSWORD = `pw-${randomToken(12)}`;
let ctx: AppContext;
let base: string;
let close: () => void;

before(async () => {
  ctx = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } }).ctx;
  // E2E läuft mit echter Uhr, damit Webhook-Zeitstempel zur Server-Zeit passen.
  (ctx as { clock: () => Date }).clock = () => new Date();
  const s = await serve(ctx);
  base = s.base;
  close = () => s.server.close();
});
after(() => close());

test('IE-100 kompletter Pilot-E2E im Testmodus mit Event-IDs (inkl. IE-034 Redirect ohne Webhook)', async () => {
  const customer = new Client(base);
  const inquiry = await customer.post('/anfrage', {
    name: 'E2E Pilot GmbH', email: `pilot-${Date.now()}@example.invalid`, company: 'E2E Pilot GmbH', country: 'DE',
    title: 'Montage Halle 7', items: 'Montage;10;45.00\nMaterial;3;120.50\nAnfahrt;1;35', margin: '20',
    message: 'Bitte Kalkulation erstellen.', privacy: '1',
  });
  assert.equal(inquiry.status, 303, inquiry.text);
  assert.match(inquiry.location ?? '', /^\/angebot\/quo_[a-f0-9]+\?t=/);

  const quotePage = await customer.get(inquiry.location ?? '');
  assert.equal(quotePage.status, 200);
  assert.match(quotePage.text, /TESTMODUS – kein verbindliches Vertragsangebot/);
  const quoteId = /\/angebot\/(quo_[a-f0-9]+)/.exec(inquiry.location ?? '')?.[1] ?? '';
  const token = new URL(base + (inquiry.location ?? '')).searchParams.get('t') ?? '';
  assert.equal((await customer.get(`/angebot/${quoteId}?t=falsch`)).status, 403);

  const accept = await customer.post(`/angebot/${quoteId}/annehmen`, {
    t: token, buyer_name: 'E2E Pilot GmbH', buyer_address: 'Pilotweg 1, 10115 Berlin', buyer_country: 'DE', buyer_type: 'B2B', vat_id: '', terms: '1',
  });
  assert.equal(accept.status, 303, accept.text);
  assert.match(accept.location ?? '', /^\/checkout\/mock\/cs_test_mock_/);
  assert.ok(customer.cookies.get('ie_customer'));
  const order = ctx.db.get<{ order_id: string; payment_state: string }>('SELECT order_id, payment_state FROM orders WHERE quote_id = ?', quoteId);
  assert.ok(order);

  // IE-034: Rücksprung-Seite ohne Webhook ändert nichts.
  const early = await customer.get(`/checkout/erfolg?order=${order?.order_id}`);
  assert.match(early.text, /Noch nicht bezahlt/);
  assert.equal(ctx.db.get<{ p: string }>('SELECT payment_state AS p FROM orders WHERE order_id = ?', order?.order_id ?? '')?.p, 'UNPAID');

  const stranger = new Client(base);
  assert.equal((await stranger.post(`${accept.location}/pay`, { outcome: 'paid' })).status, 403, 'nur der Besteller kann testzahlen');
  const pay = await customer.post(`${accept.location}/pay`, { outcome: 'paid' });
  assert.equal(pay.status, 303);

  const forged = await stranger.post('/webhooks/payments', JSON.stringify({ id: 'evt_forged_123456', type: 'checkout.session.completed', livemode: false, data: { object: {} } }), { 'stripe-signature': 't=1,v1=' + '0'.repeat(64) });
  assert.equal(forged.status, 400);

  const owner = new Client(base);
  assert.equal((await owner.post('/auth/login', { password: PASSWORD })).status, 303);
  const dash = await owner.get('/dashboard');
  const tick = await owner.post('/admin/tick', { _csrf: csrfFrom(dash.text) });
  assert.equal(tick.status, 303);
  assert.match(decodeURIComponent(tick.location ?? ''), /1 Produktionsjob\(s\), 1 Beleg\(e\), Reconciliation OK/);

  const portal = await customer.get('/portal');
  const link = /href="(\/download\/[^"]+)"/.exec(portal.text)?.[1];
  assert.ok(link, 'Download-Link im Kundenportal');
  const file = await customer.get(link ?? '');
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') ?? '', /text\/csv/);
  assert.match(file.text, /Position,Menge,Einzelpreis,Summe/);
  assert.match(file.text, /Gesamt,,,/);
  assert.equal((await stranger.get(link ?? '')).status, 403, 'Link ohne Kundenschlüssel wertlos');
  // UI-09: Beleg im Portal ohne Chat auffindbar
  const belegLink = /href="(\/portal\/beleg\/inv_[a-f0-9]+)"/.exec(portal.text)?.[1];
  assert.ok(belegLink, 'Beleg-Link im Kundenportal');
  const beleg = await customer.get(belegLink ?? '');
  assert.equal(beleg.status, 200);
  assert.equal(beleg.headers.get('content-type'), 'application/pdf');
  assert.ok(beleg.text.startsWith('%PDF-1.4'));
  assert.equal((await stranger.get(belegLink ?? '')).status, 403);

  const summary = JSON.parse((await owner.get('/api/reports/summary')).text) as { live: { grossReceiptsMinor: number }; test: { grossReceiptsMinor: number } };
  assert.equal(summary.live.grossReceiptsMinor, 0, 'keine simulierten Echtgeld-Zahlen');
  assert.ok(summary.test.grossReceiptsMinor > 0);

  const audit = JSON.parse((await owner.get('/api/audit?limit=500')).text) as { event_id: string; event_type: string; subject_id: string | null; created_at: string }[];
  const required = ['lead.received', 'quote.issued', 'quote.accepted', 'checkout.created', 'payment.confirmed', 'artifact.created', 'qa.passed', 'delivery.completed', 'invoice.created', 'ledger.reconciled', 'delivery.downloaded'];
  for (const t of required) assert.ok(audit.some((a) => a.event_type === t), `Audit-Event ${t}`);

  const finalDash = await owner.get('/dashboard');
  assert.match(finalDash.text, /data-metric="paid"[\s\S]*?0,00\s€/, 'Echtbetrieb: keine simulierten Umsätze');
  assert.match(finalDash.text, /Noch keine Verkäufe im Echtbetrieb/);
  const testDash = await owner.get('/dashboard?modus=test');
  const paidValue = /data-metric="paid"[\s\S]*?<div class="metric-value[^"]*">([^<]*)</.exec(testDash.text)?.[1] ?? '';
  assert.match(paidValue, /^\d{1,3}(\.\d{3})*,\d{2}\s€$/);
  assert.notEqual(paidValue.replace(/\s/g, ' '), '0,00 €', 'Testansicht zeigt die Testzahlung');
  assert.match(testDash.text, /<strong>Testdaten:<\/strong>/);
  const detail = await owner.get(`/dashboard/auftraege/${order?.order_id ?? ''}`);
  assert.equal(detail.status, 200);
  assert.match(detail.text, /<li class="done">[\s\S]*?Geliefert/, 'Lieferstatus in zwei Klicks sichtbar (UI-08)');

  // 15.0-M1: Auszahlung → „unterwegs“ → gesonderter Bank-Testbeleg → BANK_CREDIT_VERIFIED → abgeschlossen
  const fin = await owner.get('/dashboard/finanzen?modus=test');
  const po = await owner.post('/admin/payouts/test', { _csrf: csrfFrom(fin.text), _back: '/dashboard/finanzen?modus=test' });
  assert.match(decodeURIComponent(po.location ?? ''), /1 Testauszahlung\(en\) gemeldet/);
  const stateOf = (): string | undefined => ctx.db.get<{ s: string }>('SELECT op.pipeline_state AS s FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE o.order_id = ?', order?.order_id ?? '')?.s;
  assert.equal(stateOf(), 'PAYOUT_RECORDED');
  const transit = await owner.get('/dashboard/finanzen?modus=test');
  assert.match(transit.text, /data-metric="bank"[\s\S]*?Noch nicht verbunden/, 'ohne Kontoauszug kein Bankeingang');
  const xml = await owner.get('/admin/bank/test-statement');
  const imp = await owner.post('/admin/bank/import', { _csrf: csrfFrom(fin.text), statement: xml.text, _back: '/dashboard/finanzen?modus=test' });
  assert.match(decodeURIComponent(imp.location ?? ''), /1 Auszahlung\(en\) als Bankeingang bestätigt/);
  assert.equal(stateOf(), 'CLOSED');
  const banked = await owner.get(`/dashboard/auftraege/${order?.order_id ?? ''}`);
  assert.match(banked.text, /Auf Bank angekommen/);
  assert.match((await owner.get('/dashboard')).text, /Noch keine Verkäufe im Echtbetrieb/, 'Echtbetrieb bleibt unberührt');

  const evidence = {
    test: 'IE-100',
    run_at: new Date().toISOString(),
    order_id: order?.order_id,
    quote_id: quoteId,
    pipeline: ctx.db.all('SELECT t.from_state, t.to_state, t.actor, t.created_at FROM state_transitions t JOIN orders o ON o.opportunity_id = t.opportunity_id WHERE o.order_id = ? ORDER BY t.id', order?.order_id ?? ''),
    payment_events: ctx.db.all('SELECT provider_event_id, event_type, amount_minor, fee_minor FROM payment_events'),
    invoice: ctx.db.get('SELECT invoice_number, status, tax_context, test_mode FROM invoices WHERE order_id = ?', order?.order_id ?? ''),
    audit_events: audit.filter((a) => required.includes(a.event_type)).map((a) => ({ id: a.event_id, type: a.event_type, subject: a.subject_id, at: a.created_at })),
    kpis: summary,
  };
  const dir = join('data', 'e2e');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'IE-100-evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(join(dir, 'IE-100-dashboard.html'), finalDash.text);
  assert.equal(ctx.db.get<{ s: string }>('SELECT pipeline_state AS s FROM opportunities o JOIN orders r ON r.opportunity_id = o.opportunity_id WHERE r.order_id = ?', order?.order_id ?? '')?.s, 'CLOSED', 'erst nach verifiziertem Bank-Testbeleg abgeschlossen');
  assert.equal(ctx.db.get<{ b: number }>('SELECT bank_credit_confirmed AS b FROM payouts')?.b, 1);
});
