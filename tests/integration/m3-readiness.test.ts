import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderDashboard } from '../../apps/dashboard/src/render.ts';
import { businessProfile, listActivationItems, marketAllows, readinessSummary, updateActivationItem } from '../../services/core-api/src/readiness.ts';
import { acceptQuote, CONSUMER_WAIVER_VERSION, getQuote } from '../../services/core-api/src/workflow.ts';
import { count, makeCtx, toQuote } from '../helpers.ts';

test('Unternehmensprofil aus M3-Fragebogen: neues Unternehmen, B2B+B2C, EU, Sitzland offen', () => {
  const { ctx } = makeCtx();
  assert.deepEqual({ ...businessProfile(ctx) }, { seat_country: 'OPEN', legal_entity: 'NEW_INDEPENDENT_ENTITY', customer_types: 'B2B,B2C', markets: 'EU' });
});

test('Live-Freigaben: nur Eigentümer, Freigabe nur mit Nachweis, Historie append-only', () => {
  const { ctx } = makeCtx();
  assert.equal(listActivationItems(ctx).length, 12);
  assert.throws(() => updateActivationItem(ctx, 'LA-10', 'APPROVED', 'docs/M2-BERICHT.md', '', 'ai'), /OWNER_REQUIRED/);
  assert.throws(() => updateActivationItem(ctx, 'LA-10', 'APPROVED', '', '', 'owner'), /EVIDENCE_REQUIRED/);
  assert.throws(() => updateActivationItem(ctx, 'LA-10', 'ERLEDIGT', 'x', '', 'owner'), /INVALID_STATUS/);
  updateActivationItem(ctx, 'LA-10', 'APPROVED', 'docs/M2-BERICHT.md – Stripe-Sandbox-Testkauf 12.11.2026', 'Testkauf ok', 'owner');
  updateActivationItem(ctx, 'LA-01', 'IN_PROGRESS', '', 'Beratungstermin vereinbart', 'owner');
  const s = readinessSummary(ctx);
  assert.equal(s.done, 1);
  assert.equal(s.allItemsDone, false);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM live_activation_history'), 2);
  assert.throws(() => ctx.db.run('DELETE FROM live_activation_history'), /APPEND_ONLY/);
  assert.throws(() => ctx.db.run(`UPDATE live_activation_items SET status = 'APPROVED', approved_by = 'ai', evidence_ref = 'xxxxx' WHERE item_id = 'LA-02'`), /CHECK constraint/);
});

test('Alle Freigaben erteilt: LIVE bleibt trotzdem technisch gesperrt', () => {
  const { ctx } = makeCtx();
  for (const i of listActivationItems(ctx)) updateActivationItem(ctx, i.item_id, 'APPROVED', `Nachweis für ${i.item_id}`, '', 'owner');
  const s = readinessSummary(ctx);
  assert.equal(s.allItemsDone, true);
  assert.equal(s.liveTechnicallyLocked, true);
  assert.throws(() => ctx.db.run('UPDATE system_mode SET live_enabled = 1'), /LIVE_ACTIVATION_REQUIRES_M3_MIGRATION/);
  assert.match(renderDashboard(ctx, 'csrf'), /Offene Live-Freigaben: <strong>0<\/strong> von 12/);
});

test('Märkte: nur EU-Kunden, außerhalb der EU wird die Annahme verweigert', () => {
  const { ctx } = makeCtx();
  assert.deepEqual(marketAllows(ctx, 'IT', 'B2C'), { ok: true });
  assert.deepEqual(marketAllows(ctx, 'CH', 'B2B'), { ok: false, reason: 'MARKET_NOT_ALLOWED:CH' });
  const q = toQuote(ctx);
  assert.throws(
    () => acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 't', buyer: { name: 'US Inc', address: 'NY', country: 'US', type: 'B2B', vatId: null } }),
    /MARKET_NOT_ALLOWED/,
  );
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM orders'), 0);
});

test('Verbraucher (B2C): Kauf nur mit ausdrücklichem Verzicht auf das Widerrufsrecht für digitale Inhalte, Nachweis gespeichert', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  const consumer = { name: 'Maria Rossi', address: 'Via Roma 1, Milano', country: 'IT', type: 'B2C' as const, vatId: null };
  assert.throws(() => acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 't', buyer: consumer }), /CONSUMER_WAIVER_MISSING/);
  assert.throws(() => acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 't', buyer: consumer, consumerWaiver: { immediatePerformance: true, acknowledgeLoss: false } }), /CONSUMER_WAIVER_MISSING/);
  const acc = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'ip1', buyer: consumer, consumerWaiver: { immediatePerformance: true, acknowledgeLoss: true } });
  assert.ok(acc.orderId);
  const waiver = (getQuote(ctx, q.quote.quoteId) as unknown as { consumer_waiver_ref: string | null }).consumer_waiver_ref;
  assert.match(waiver ?? '', new RegExp(`^waiver:${CONSUMER_WAIVER_VERSION}:`));
});

test('Unternehmen (B2B): kein Verzicht nötig, kein Verzichtsnachweis gespeichert', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 't', buyer: { name: 'Firma', address: 'A 1', country: 'DE', type: 'B2B', vatId: null } });
  assert.equal((getQuote(ctx, q.quote.quoteId) as unknown as { consumer_waiver_ref: string | null }).consumer_waiver_ref, null);
});
