import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceFromCost } from '../../packages/contracts/src/money.ts';
import { quoteSchema, validate } from '../../packages/contracts/src/schemas.ts';
import { submitInboundLead } from '../../services/acquisition/src/leads.ts';
import { acceptQuote, assessFeasibility, createQuote, getQuote, qualify } from '../../services/core-api/src/workflow.ts';
import { buyer, calcScope, count, inbound, makeCtx, oppState, toQuote } from '../helpers.ts';

function qualified(ctx: ReturnType<typeof makeCtx>['ctx'], scope: unknown, capabilityId = 'b2b-calc-csv') {
  const r = submitInboundLead(ctx, inbound({ request: { capabilityId, scope } }), { ipHash: 't' });
  qualify(ctx, r.opportunityId);
  return r;
}

test('IE-021 echter Scope vorhanden: Feasibility-Check startet und genehmigt', () => {
  const { ctx } = makeCtx();
  const r = qualified(ctx, calcScope());
  const f = assessFeasibility(ctx, r.opportunityId);
  assert.deepEqual(f, { status: 'APPROVED', estimatedCostMinor: 3700 });
  assert.equal(oppState(ctx, r.opportunityId), 'FEASIBILITY_APPROVED');
});

test('IE-022 unklarer Umfang: offene Punkte, nicht verkaufen', () => {
  const { ctx } = makeCtx();
  const r = qualified(ctx, { title: 'nur Titel' });
  const f = assessFeasibility(ctx, r.opportunityId);
  assert.equal(f.status, 'OPEN_POINTS');
  assert.equal(oppState(ctx, r.opportunityId), 'QUALIFIED');
  assert.throws(() => createQuote(ctx, r.opportunityId), /INVALID_STATE/);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM quotes'), 0);
});

test('IE-023 rentabler Auftrag: Angebotspreis aus Kosten + Mindestmarge', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  assert.equal(q.quote.grossTotalMinor, Math.max(priceFromCost(3700, 3000), 5000));
  const row = getQuote(ctx, q.quote.quoteId);
  assert.deepEqual(validate(quoteSchema, { ...row, accepted: row.accepted === 1 }), []);
});

test('IE-024 negativer Deckungsbeitrag: Angebot abgelehnt (COST_LIMIT)', () => {
  const { ctx } = makeCtx();
  const r = qualified(ctx, calcScope());
  assessFeasibility(ctx, r.opportunityId);
  assert.throws(() => createQuote(ctx, r.opportunityId, 'ai', { priceMinor: 3000 }), /QUOTE_BLOCKED/);
  assert.equal(oppState(ctx, r.opportunityId), 'COST_LIMIT');
});

test('IE-025 fehlende Lieferressourcen: NO_CAPACITY', () => {
  const { ctx } = makeCtx();
  const items = Array.from({ length: 201 }, (_, i) => ({ name: `P${i}`, quantity: 1, unit_cost_minor: 100 }));
  const r = qualified(ctx, calcScope({ items }));
  const f = assessFeasibility(ctx, r.opportunityId);
  assert.equal(f.status, 'REJECTED');
  assert.equal(oppState(ctx, r.opportunityId), 'NO_CAPACITY');
});

test('IE-026 unerlaubtes Produkt: rechtliches Gate blockiert', () => {
  const { ctx } = makeCtx();
  const r = qualified(ctx, calcScope({ category: 'medical_opinion' }));
  assert.equal(assessFeasibility(ctx, r.opportunityId).status, 'REJECTED');
  assert.equal(oppState(ctx, r.opportunityId), 'LICENCE_RISK');
});

test('IE-042 Capability nicht verfügbar: Auftrag abgelehnt', () => {
  const { ctx } = makeCtx();
  const r = qualified(ctx, { duration_s: 60 }, 'video-production');
  const f = assessFeasibility(ctx, r.opportunityId);
  assert.equal(f.status, 'REJECTED');
  assert.equal(oppState(ctx, r.opportunityId), 'OUT_OF_SCOPE');
});

test('IE-027 Kunde akzeptiert nachvollziehbar: Order angelegt', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  const acc = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'ip', buyer });
  assert.equal(acc.duplicate, false);
  assert.ok(acc.customerAccessKey && acc.customerAccessKey.length > 30);
  assert.equal(oppState(ctx, q.opportunityId), 'CUSTOMER_ACCEPTED');
  const quote = getQuote(ctx, q.quote.quoteId);
  assert.match(quote.customer_acceptance_ref ?? '', /^acc:quo_/);
  assert.equal(ctx.db.get<{ payment_state: string }>('SELECT payment_state FROM orders WHERE order_id = ?', acc.orderId)?.payment_state, 'UNPAID');
});

test('IE-028 kein Akzeptanznachweis: kein Auftrag', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  for (const [token, terms] of [[undefined, true], ['falsch', true], [q.quote.acceptanceToken, false]] as const) {
    assert.throws(() => acceptQuote(ctx, q.quote.quoteId, token, { termsAccepted: terms, ipHash: 'ip', buyer }), /NO_ACCEPTANCE_PROOF/);
  }
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM orders'), 0);
  assert.equal(ctx.audit.byType('quote.acceptance_rejected').length, 3);
});

test('IE-029 doppelte Akzeptanznachricht: nur ein Auftrag', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  const a = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'ip', buyer });
  const b = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'ip', buyer });
  assert.equal(b.duplicate, true);
  assert.equal(b.orderId, a.orderId);
  assert.equal(b.customerAccessKey, null);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM orders'), 1);
});

test('IE-003 IE-004 Angebot über Policy-Maximum: blockiert und zur Eigentümerprüfung', () => {
  const { ctx } = makeCtx();
  const r = qualified(ctx, calcScope());
  assessFeasibility(ctx, r.opportunityId);
  assert.throws(() => createQuote(ctx, r.opportunityId, 'ai', { priceMinor: 250000 }), /QUOTE_ABOVE_MAX/);
  assert.equal(oppState(ctx, r.opportunityId), 'MANUAL_REVIEW');
});
