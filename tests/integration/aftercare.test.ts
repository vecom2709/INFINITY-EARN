import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderProvenance, renderQuote } from '../../apps/customer-portal/src/pages.ts';
import { renderConsole } from '../../apps/console/src/index.ts';
import { hashPassword, randomToken } from '../../packages/shared/src/crypto.ts';
import { feedbackSummary, getAcceptance, preContractRisk, recordAcceptance, recordFeedback } from '../../services/core-api/src/aftercare.ts';
import { acceptQuote, getQuote } from '../../services/core-api/src/workflow.ts';
import { dataFreshness, refundReserve } from '../../services/finance/src/insights.ts';
import { createRefundRequest } from '../../services/finance/src/refunds.ts';
import { verifyProvenance } from '../../services/product-factory/src/provenance.ts';
import { Client, serve } from '../http.ts';
import { calcScope, count, inbound, makeCtx, toDelivered, toOrder, toQuote } from '../helpers.ts';

test('043 Vorschau: Angebot zeigt die eigene Kalkulation (Positionen, Summen), aber keine Datei', () => {
  const { ctx } = makeCtx();
  const items = Array.from({ length: 12 }, (_, i) => ({ name: `Pos ${i}`, quantity: 1, unit_cost_minor: 1000 }));
  const q = toQuote(ctx, inbound({ request: { capabilityId: 'b2b-calc-csv', scope: calcScope({ items }) } }));
  const html = renderQuote(getQuote(ctx, q.quote.quoteId), 'tok');
  assert.match(html, /Vorschau Ihrer Kalkulation/);
  assert.match(html, /Pos 0/);
  assert.doesNotMatch(html, /Pos 9/, 'nur die ersten 8 Positionen');
  assert.match(html, /und 4 weitere Positionen/);
  assert.match(html, /Kalkulierter Gesamtwert 144,00 €/);
  assert.doesNotMatch(html, /href="\/download\//);
});

test('084 Abnahme: nur eigener, gelieferter Auftrag; Mangel braucht Beschreibung und erzeugt Reklamation; endgültig; keine automatische Abnahme', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const other = toDelivered(ctx);
  const open = toOrder(ctx);
  const key = d.customerAccessKey ?? undefined;
  assert.equal(getAcceptance(ctx, d.orderId), undefined, 'ohne Kundenaktion keine Abnahme');
  assert.throws(() => recordAcceptance(ctx, other.customerAccessKey ?? undefined, d.orderId, 'ACCEPTED', ''), /FORBIDDEN/);
  assert.throws(() => recordAcceptance(ctx, open.customerAccessKey ?? undefined, open.orderId, 'ACCEPTED', ''), /NOT_DELIVERED/);
  assert.throws(() => recordAcceptance(ctx, key, d.orderId, 'DEFECT_REPORTED', 'x'), /DEFECT_NEEDS_DESCRIPTION/);
  recordAcceptance(ctx, key, d.orderId, 'DEFECT_REPORTED', 'Summe in Zeile 2 fehlt');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM support_tickets WHERE kind = 'complaint' AND order_id = ?`, d.orderId), 1);
  assert.throws(() => recordAcceptance(ctx, key, d.orderId, 'ACCEPTED', ''), /ALREADY_DECIDED/);
  assert.throws(() => ctx.db.run(`UPDATE delivery_acceptances SET decision = 'ACCEPTED'`), /ACCEPTANCE_FINAL/);
  assert.equal(ctx.audit.byType('delivery.defect_reported').length, 1);
});

test('120/034 Rückmeldung: nur echter Kunde nach Lieferung, eine je Auftrag, unveränderlich, Zusammenfassung ehrlich', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const key = d.customerAccessKey ?? undefined;
  assert.throws(() => recordFeedback(ctx, key, d.orderId, { rating: 6, outcome: 'IN_USE', comment: '', consentPublish: false }), /INVALID_RATING/);
  recordAcceptance(ctx, key, d.orderId, 'ACCEPTED', '');
  recordFeedback(ctx, key, d.orderId, { rating: 4, outcome: 'IN_USE', comment: 'Spart Zeit', consentPublish: true });
  assert.throws(() => recordFeedback(ctx, key, d.orderId, { rating: 5, outcome: 'IN_USE', comment: '', consentPublish: false }), /ALREADY_RATED/);
  assert.throws(() => ctx.db.run('UPDATE customer_feedback SET rating = 5'), /FEEDBACK_IMMUTABLE/);
  const o = toOrder(ctx);
  assert.throws(() => ctx.db.run(`INSERT INTO customer_feedback (feedback_id, order_id, rating, outcome, consent_publish, test_mode, created_at) VALUES ('fb_x', ?, 5, 'IN_USE', 0, 1, 'x')`, o.orderId), /FEEDBACK_REQUIRES_DELIVERY/, 'keine Bewertung ohne Lieferung – auch nicht direkt in der DB');
  assert.deepEqual(feedbackSummary(ctx, true), { count: 1, average: 4, inUse: 1, notUseful: 0, publishable: 1, accepted: 1, defects: 0 });
  assert.equal(feedbackSummary(ctx, false).count, 0);
  const html = renderConsole(ctx, '/dashboard/kunden', new URLSearchParams('modus=test'), 'x') ?? '';
  assert.match(html, /<strong>4<\/strong> von 5 Sternen aus 1 Bewertung/);
  assert.match(html, /werden derzeit nirgends veröffentlicht/);
});

test('106 Risiko vor Vertragsschluss: erklärte Hinweise, kein Urteil', () => {
  const { ctx } = makeCtx();
  const low = toOrder(ctx);
  const r1 = preContractRisk(ctx, low.orderId);
  assert.equal(r1.level, 'niedrig');
  assert.match(r1.reasons[0] ?? '', /Keine besonderen/);
  assert.match(r1.disclaimer, /keine Rechtsberatung/);
  const q = toQuote(ctx);
  const consumer = { name: 'Maria Rossi', address: 'Via Roma 1, Milano', country: 'IT', type: 'B2C' as const, vatId: null };
  const acc = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'x', buyer: consumer, consumerWaiver: { immediatePerformance: true, acknowledgeLoss: true } });
  const r2 = preContractRisk(ctx, acc.orderId);
  assert.ok(r2.level !== 'niedrig');
  assert.ok(r2.reasons.some((x) => /Verbraucher/.test(x)) && r2.reasons.some((x) => /anderen EU-Land/.test(x)));
  assert.match(renderConsole(ctx, `/dashboard/auftraege/${acc.orderId}`, new URLSearchParams(), 'x') ?? '', /Risiko vor Vertragsschluss/);
});

test('108 Herkunftsnachweis: Prüfsumme der gelieferten Datei → vollständiger Nachweis ohne Kunden-/Auftragsdaten', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  const sha = ctx.db.get<{ s: string }>('SELECT sha256 AS s FROM artifacts WHERE order_id = ?', d.orderId)?.s ?? '';
  const p = verifyProvenance(ctx, sha.toUpperCase());
  assert.equal(p.found, true);
  if (p.found) {
    assert.equal(p.complete, true);
    assert.deepEqual(p.aiTools, []);
    assert.ok(p.qa?.passed);
    assert.ok(p.warnings.some((w) => /Testbetrieb/.test(w)));
    const html = renderProvenance(p, sha);
    assert.doesNotMatch(html, /Test GmbH|example\.invalid|ord_|cus_/, 'keine personenbezogenen oder Auftragsdaten');
    assert.match(html, /Vollständig nachgewiesen/);
  }
  assert.deepEqual(verifyProvenance(ctx, 'f'.repeat(64)), { found: false });
  assert.deepEqual(verifyProvenance(ctx, 'kein-hash'), { found: false });
});

test('114 Erstattungsrücklage: Mindestquote bei wenig Daten, offene Anträge eingerechnet, als Empfehlung gekennzeichnet', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  let r = refundReserve(ctx, true);
  assert.equal(r.basis, 'minimum');
  assert.equal(r.refundRatePct, 10);
  assert.equal(r.reserveMinor, Math.ceil(r.recentPaidMinor * 0.1));
  createRefundRequest(ctx, d.orderId, 'owner', 'Test');
  r = refundReserve(ctx, true);
  assert.ok(r.pendingRequestsMinor > 0);
  assert.equal(r.reserveMinor, Math.ceil(r.recentPaidMinor * 0.1) + r.pendingRequestsMinor);
  assert.equal(refundReserve(ctx, false).reserveMinor, 0);
  assert.match(renderConsole(ctx, '/dashboard/berichte', new URLSearchParams('modus=test'), 'x') ?? '', /kein auszahlbarer Gewinn/);
});

test('107 Datenaktualität: freigegebene, nie abgerufene Quelle und abgelaufene offene Ausschreibung werden gemeldet', () => {
  const { ctx } = makeCtx();
  const f0 = dataFreshness(ctx);
  assert.equal(f0.expiredOpen, 0);
  const q = toQuote(ctx);
  ctx.db.run(`UPDATE leads SET expires_at = '2000-01-01T00:00:00.000Z' WHERE lead_id = ?`, q.leadId);
  assert.equal(dataFreshness(ctx).expiredOpen, 1);
  ctx.db.run(`UPDATE sources SET status = 'APPROVED', terms_checked_at = '2000-01-01T00:00:00.000Z' WHERE source_id <> 'src_inbound_form'`);
  const rows = dataFreshness(ctx).sources;
  if (rows.length) {
    assert.ok(rows[0]?.warnings.some((w) => /nie abgerufen/.test(w)));
    assert.ok(rows[0]?.warnings.some((w) => /nicht neu geprüft/.test(w)));
  }
});

test('HTTP: Abnahme und Rückmeldung im Portal, öffentliche Echtheitsprüfung', async () => {
  const PASSWORD = `pw-${randomToken(12)}`;
  const { ctx } = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } });
  const d = toDelivered(ctx);
  const { server, base } = await serve(ctx);
  try {
    const c = new Client(base);
    c.cookies.set('ie_customer', d.customerAccessKey ?? '');
    const portal = await c.get('/portal');
    assert.match(portal.text, /Passt die Lieferung\?/);
    assert.match(portal.text, /Echtheit der Datei prüfen/);
    const ok = await c.post('/portal/abnahme', { order_id: d.orderId, decision: 'ok', note: '' });
    assert.equal(ok.location, '/portal?ok=abnahme');
    const after = await c.get('/portal?ok=abnahme');
    assert.match(after.text, /Ihre Abnahme ist gespeichert/);
    assert.match(after.text, /Wie zufrieden sind Sie\?/);
    const fb = await c.post('/portal/rueckmeldung', { order_id: d.orderId, rating: '5', outcome: 'IN_USE', comment: '' });
    assert.equal(fb.location, '/portal?ok=bewertung');
    const again = await c.post('/portal/rueckmeldung', { order_id: d.orderId, rating: '5', outcome: 'IN_USE', comment: '' });
    assert.equal(again.location, '/portal?fehler=ALREADY_RATED');
    const stranger = new Client(base);
    assert.equal((await stranger.post('/portal/abnahme', { order_id: d.orderId, decision: 'ok' })).location, '/portal?fehler=FORBIDDEN');
    const sha = ctx.db.get<{ s: string }>('SELECT sha256 AS s FROM artifacts')?.s ?? '';
    const pass = await stranger.get(`/pruefen/${sha}`);
    assert.equal(pass.status, 200);
    assert.match(pass.text, /Herkunftsnachweis/);
    assert.equal((await stranger.get(`/pruefen/${'0'.repeat(64)}`)).status, 404);
    assert.equal((await stranger.get(`/pruefen?hash=${sha.toUpperCase()}`)).location, `/pruefen/${sha}`);
  } finally {
    server.close();
  }
});
