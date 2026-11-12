import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderConsole } from '../../apps/console/src/index.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { buildTestCamt053, importBankStatement } from '../../services/finance/src/bank-statement.ts';
import { buyerJourney, cashForecast, customerConcentration, revenueAttribution, salesDiagnosis } from '../../services/finance/src/insights.ts';
import { mockPay, mockPayout } from '../../services/finance/src/mock-provider.ts';
import { createRefundRequest } from '../../services/finance/src/refunds.ts';
import { inbound, makeCtx, toDelivered, toOrder } from '../helpers.ts';

test('088 Diagnose: leerer Echtbetrieb nennt die Sperre als Engpass; Test ohne Anfragen nennt fehlende Anfragen', () => {
  const { ctx } = makeCtx();
  const live = salesDiagnosis(ctx, false, 12);
  assert.equal(live.bottleneck?.key, 'live_locked');
  assert.match(live.bottleneck?.nextStep ?? '', /LA-01/);
  assert.equal(salesDiagnosis(ctx, true, 12).bottleneck?.key, 'no_leads');
});

test('088 Diagnose: angenommen, aber unbezahlt → Engpass Zahlung; Trichter zählt echte Datensätze', () => {
  const { ctx } = makeCtx();
  toOrder(ctx);
  const d = salesDiagnosis(ctx, true, 12);
  assert.deepEqual(d.funnel.map((f) => f.count), [1, 1, 1, 0, 0]);
  assert.equal(d.bottleneck?.key, 'not_paid');
  toDelivered(ctx);
  assert.equal(salesDiagnosis(ctx, true, 12).hasSales, true);
});

test('098 Prognose: nur bekannte Beträge; unbezahlte Aufträge nicht eingerechnet, Erstattungen abgezogen, Bank nach Beleg', () => {
  const { ctx } = makeCtx();
  const a = toDelivered(ctx);
  toOrder(ctx);
  autopilotTick(ctx);
  let f = cashForecast(ctx, true);
  assert.ok(f.atProviderMinor > 0);
  assert.equal(f.inTransitMinor, 0);
  assert.ok(f.unpaidAcceptedMinor > 0);
  assert.equal(f.expectedBankMinor, f.atProviderMinor, 'unbezahlt nicht eingerechnet');
  const net = f.atProviderMinor;
  mockPayout(ctx, [a.orderId], net, 'EUR');
  f = cashForecast(ctx, true);
  assert.deepEqual([f.atProviderMinor, f.inTransitMinor, f.expectedBankMinor], [0, net, net]);
  importBankStatement(ctx, buildTestCamt053(ctx));
  f = cashForecast(ctx, true);
  assert.deepEqual([f.inTransitMinor, f.expectedBankMinor], [0, 0], 'angekommen = nicht mehr „erwartet“');
  const b = toDelivered(ctx);
  createRefundRequest(ctx, b.orderId, 'owner', 'Test');
  f = cashForecast(ctx, true);
  assert.equal(f.pendingRefundsMinor, getOrder(ctx, b.orderId).amount_minor);
  assert.ok(f.notes.some((n) => /Erstattungsanträge/.test(n)));
  assert.equal(cashForecast(ctx, false).expectedBankMinor, 0, 'Echtbetrieb unberührt');
});

test('088 technische Ursachen: fehlgeschlagene Zahlung wird erfasst und beim Engpass konkret genannt', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  mockPay(ctx, getOrder(ctx, o.orderId), { outcome: 'failed' });
  const d = salesDiagnosis(ctx, true, 12);
  assert.ok(d.technical.some((x) => x.key === 'payment_failed' && x.count === 1));
  assert.equal(d.bottleneck?.key, 'not_paid');
  assert.match(d.bottleneck?.nextStep ?? '', /1× „Fehlgeschlagene Zahlungen“/);
});

test('095 Herkunft: Umsatz je Quelle aus eigenen Daten, Messunsicherheit bei kleinen Zahlen; 101 Kaufweg aus Zeitstempeln', () => {
  const { ctx, clock } = makeCtx();
  toDelivered(ctx);
  toOrder(ctx);
  const a = revenueAttribution(ctx, true);
  const form = a.channels.find((c) => /Anfrageformular/.test(c.source));
  assert.deepEqual([form?.leads, form?.paidOrders, form?.conversionPct], [2, 1, 50]);
  assert.ok((form?.paidMinor ?? 0) > 0);
  assert.equal(a.reliable, false);
  assert.match(a.note, /Zu wenige Anfragen/);
  assert.equal(revenueAttribution(ctx, false).channels.length, 0);
  clock.advance(3 * 3_600_000);
  const j = buyerJourney(ctx, true);
  assert.deepEqual(j.map((s) => `${s.from}→${s.to}`), ['Anfrage→Angebot', 'Angebot→Annahme', 'Annahme→Zahlung', 'Zahlung→Lieferung']);
  assert.equal(j[0]?.cases, 2);
  assert.equal(j[2]?.cases, 1);
  assert.ok(j.every((s) => s.medianHours === null || s.medianHours >= 0));
});

test('099 Konzentration: ein Kunde = hohe Abhängigkeit, anonymisiert; ohne Verkäufe keine Auswertung', () => {
  const { ctx } = makeCtx();
  assert.equal(customerConcentration(ctx, true).level, 'none');
  toDelivered(ctx);
  const one = customerConcentration(ctx, true);
  assert.deepEqual([one.level, one.customers, one.topSharePct, one.top[0]?.label], ['high', 1, 100, 'Kunde 1']);
  for (let i = 0; i < 4; i++) toDelivered(ctx, inbound());
  const five = customerConcentration(ctx, true);
  assert.equal(five.customers, 5);
  assert.equal(five.level, 'ok');
  const html = renderConsole(ctx, '/dashboard/berichte', new URLSearchParams('modus=test'), 'x') ?? '';
  assert.match(html, /Warum \(noch\) kein Verkauf\?/);
  assert.match(html, /Was in nächster Zeit ankommt/);
  assert.match(html, /Namen bewusst ausgeblendet/);
  assert.doesNotMatch(html, /Test GmbH<\/dd>/, 'keine Kundennamen in der Konzentrationsauswertung');
});
