import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisions } from '../../apps/console/src/model.ts';
import { renderConsole } from '../../apps/console/src/index.ts';
import { hashPassword, randomToken } from '../../packages/shared/src/crypto.ts';
import { recordAcceptance, recordFeedback } from '../../services/core-api/src/aftercare.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { dailyReport } from '../../services/core-api/src/daily-report.ts';
import { generateOfferDraft } from '../../services/core-api/src/offers.ts';
import { cashForecast, productConcentration } from '../../services/finance/src/insights.ts';
import { Client, serve } from '../http.ts';
import { count, makeCtx, toDelivered, toQuote } from '../helpers.ts';

test('107 abgelaufene Daten: kein Angebotsentwurf nach Fristende, Sperre protokolliert', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  ctx.db.run(`UPDATE leads SET expires_at = '2000-01-01T00:00:00.000Z' WHERE lead_id = ?`, q.leadId);
  assert.throws(() => generateOfferDraft(ctx, q.opportunityId), /LEAD_EXPIRED/);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM offer_drafts'), 0);
  assert.equal(ctx.audit.byType('offer.draft_blocked_expired').length, 1);
});

test('098 Prognose: Steuer- und Erstattungsrücklage abgezogen, Datum nur mit eingetragener Frist', () => {
  const { ctx } = makeCtx({ env: { TAX_RESERVE_ESTIMATE_BPS: '2000', PAYOUT_DELAY_DAYS: '7' } });
  toDelivered(ctx);
  autopilotTick(ctx);
  const f = cashForecast(ctx, true);
  assert.ok((f.taxReserveMinor ?? 0) > 0);
  assert.ok(f.refundReserveMinor > 0, 'Mindestquote 10 % bei wenig Daten');
  assert.equal(f.freeAfterReservesMinor, Math.max(0, f.expectedBankMinor - (f.taxReserveMinor ?? 0) - f.refundReserveMinor));
  assert.match(f.earliestPayoutDay ?? '', /^\d{4}-\d{2}-\d{2}$/);
  const { ctx: plain } = makeCtx();
  toDelivered(plain);
  const g = cashForecast(plain, true);
  assert.deepEqual([g.taxReserveMinor, g.earliestPayoutDay], [null, null], 'ohne Angaben keine geratenen Werte');
  assert.ok(g.notes.some((n) => /kein Auszahlungsdatum/.test(n)) && g.notes.some((n) => /LA-06/.test(n)));
});

test('099 Produktdimension und 120 Qualitätsmaßnahme aus schlechter Rückmeldung', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  assert.deepEqual(productConcentration(ctx, true), [{ product: 'b2b-calc-csv', sharePct: 100 }]);
  assert.match(renderConsole(ctx, '/dashboard/berichte', new URLSearchParams('modus=test'), 'x') ?? '', /Marktplätze: keine angebunden/);
  recordAcceptance(ctx, d.customerAccessKey ?? undefined, d.orderId, 'ACCEPTED', '');
  recordFeedback(ctx, d.customerAccessKey ?? undefined, d.orderId, { rating: 2, outcome: 'NOT_USEFUL', comment: 'unklar', consentPublish: false });
  const q = decisions(ctx, true).find((x) => x.kind === 'quality');
  assert.ok(q, 'Qualitätsmaßnahme zur Entscheidung');
  assert.match(q?.text ?? '', /2 von 5 Sternen/);
  assert.equal(decisions(ctx, false).filter((x) => x.kind === 'quality').length, 0);
});

test('001 Tagesbericht: Zahlen der letzten 24 Std. aus echten Ereignissen, LIVE getrennt, per API abrufbar', async () => {
  const PASSWORD = `pw-${randomToken(12)}`;
  const { ctx, clock } = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } });
  toDelivered(ctx);
  const r = dailyReport(ctx, true, 0);
  assert.deepEqual([r.inquiries, r.quotes, r.accepted, r.paidOrders, r.delivered], [1, 1, 1, 1, 1]);
  assert.ok(r.paidMinor > 0);
  assert.match(r.summary, /1 Anfrage\(n\), 1 Angebot\(e\), 1 angenommen, 1 bezahlt/);
  const live = dailyReport(ctx, false, 0);
  assert.equal(live.paidOrders, 0);
  assert.match(live.summary, /Echtbetrieb gesperrt/);
  clock.advance(2 * 86_400_000);
  assert.match(dailyReport(ctx, true, 0).summary, /Keine neuen Vorgänge/);
  assert.match(renderConsole(ctx, '/dashboard', new URLSearchParams('modus=test'), 'x') ?? '', /Tagesbericht \(letzte 24 Std\.\)/);
  const { server, base } = await serve(ctx);
  try {
    assert.equal((await new Client(base).get('/api/bericht/tag')).status, 401);
    const c = new Client(base);
    await c.post('/auth/login', { password: PASSWORD });
    const j = JSON.parse((await c.get('/api/bericht/tag?modus=test')).text) as { mode: string };
    assert.equal(j.mode, 'TEST');
  } finally {
    server.close();
  }
});
