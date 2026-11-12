import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderConsole } from '../../apps/console/src/index.ts';
import { recordAcceptance, recordFeedback } from '../../services/core-api/src/aftercare.ts';
import { offerCatalog } from '../../services/core-api/src/trust.ts';
import { buyerSignals, followUpCandidates, productPortfolio } from '../../services/finance/src/insights.ts';
import { Client, serve } from '../http.ts';
import { count, inbound, makeCtx, toDelivered, toOrder, toQuote } from '../helpers.ts';

test('050 Portfolio: Deckungsbeitrag je Produktart = Zahlungen − Gebühren − Erstattungen aus dem Hauptbuch', () => {
  const { ctx } = makeCtx();
  toDelivered(ctx);
  toDelivered(ctx);
  const [row] = productPortfolio(ctx, true);
  const ledger = ctx.db.get<{ pay: number; fee: number }>(`SELECT SUM(CASE WHEN account='customer_payments' THEN amount_minor END) AS pay, -SUM(CASE WHEN account='provider_fees' THEN amount_minor END) AS fee FROM ledger_entries WHERE test_mode = 1`);
  assert.equal(row?.product, 'b2b-calc-csv');
  assert.equal(row?.paidOrders, 2);
  assert.equal(row?.revenueMinor, ledger?.pay);
  assert.equal(row?.contributionMinor, (ledger?.pay ?? 0) - (ledger?.fee ?? 0));
  assert.equal(row?.avgItems, 2);
  assert.equal(productPortfolio(ctx, false).length, 0);
});

test('051 Käufersignale: zahlend vs. unverbindlich – nur aus eigenen Vorgängen', () => {
  const { ctx } = makeCtx();
  toQuote(ctx);
  toOrder(ctx);
  toDelivered(ctx);
  assert.deepEqual(buyerSignals(ctx, true), { bezahlt: 1, angenommen: 1, angebot_offen: 1, nur_anfrage: 0 });
  assert.deepEqual(buyerSignals(ctx, false), { bezahlt: 0, angenommen: 0, angebot_offen: 0, nur_anfrage: 0 });
});

test('058 Folgeangebote: nur zufriedene Kunden, Kontakt nur mit Einwilligung, nichts wird versendet', () => {
  const { ctx } = makeCtx();
  const happy = toDelivered(ctx, inbound({ marketingConsent: true }));
  recordAcceptance(ctx, happy.customerAccessKey ?? undefined, happy.orderId, 'ACCEPTED', '');
  recordFeedback(ctx, happy.customerAccessKey ?? undefined, happy.orderId, { rating: 5, outcome: 'IN_USE', comment: '', consentPublish: false });
  const meh = toDelivered(ctx);
  recordAcceptance(ctx, meh.customerAccessKey ?? undefined, meh.orderId, 'ACCEPTED', '');
  recordFeedback(ctx, meh.customerAccessKey ?? undefined, meh.orderId, { rating: 2, outcome: 'NOT_USEFUL', comment: '', consentPublish: false });
  const before = count(ctx, 'SELECT COUNT(*) AS n FROM audit_events');
  const c = followUpCandidates(ctx, true, ['b2b-calc-csv', 'b2b-calc-pdf']);
  assert.equal(c.length, 1, 'nur der zufriedene Kunde');
  assert.equal(c[0]?.contactAllowed, true);
  assert.match(c[0]?.reason ?? '', /b2b-calc-pdf/);
  assert.equal(followUpCandidates(ctx, true, ['b2b-calc-csv']).length, 0, 'keine Ergänzung freigegeben → kein Kandidat');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM audit_events'), before, 'Analyse erzeugt keine Aktion');
  const html = renderConsole(ctx, '/dashboard/kunden', new URLSearchParams('modus=test'), 'x') ?? '';
  assert.match(html, /Wer wirklich kauft/);
  assert.match(html, /es wird nichts automatisch verschickt/);
});

test('071 Angebotskatalog: freigegebene Produkte, Eingabeschema, Bestellweg, ohne Kundendaten', async () => {
  const { ctx } = makeCtx();
  toDelivered(ctx);
  const cat = offerCatalog(ctx) as { products: { id: string; quality_checks: string[] }[]; ordering: { endpoint: string }; operating_mode: string };
  assert.deepEqual(cat.products.map((p) => p.id), ['b2b-calc-csv']);
  assert.ok(cat.products[0]?.quality_checks.includes('totals'));
  assert.equal(cat.ordering.endpoint, '/api/leads');
  assert.equal(cat.operating_mode, 'TEST');
  const { server, base } = await serve(ctx);
  try {
    const r = await new Client(base).get('/api/katalog');
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.text, /@|ord_|cus_|Test GmbH/);
  } finally {
    server.close();
  }
});
