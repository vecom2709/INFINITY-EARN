import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAFE_DEFAULT_POLICY } from '../../packages/policies/src/policy.ts';
import { claimNext, enqueueJob, getJob } from '../../services/ai-orchestrator/src/queue.ts';
import { submitAgentProposal } from '../../services/ai-orchestrator/src/untrusted.ts';
import { approvePolicy, decide, effectivePolicy, proposePolicy, setStop } from '../../services/core-api/src/policy-store.ts';
import { createQuote } from '../../services/core-api/src/workflow.ts';
import { submitInboundLead } from '../../services/acquisition/src/leads.ts';
import { assessFeasibility, qualify } from '../../services/core-api/src/workflow.ts';
import { runProductionOnce } from '../../services/product-factory/src/production.ts';
import { count, inbound, makeCtx, oppState, toDelivered, toPaid } from '../helpers.ts';

test('IE-005 Notstopp: Produktionsjobs pausieren und laufen nach Freigabe weiter', () => {
  const { ctx, clock } = makeCtx();
  const p = toPaid(ctx);
  setStop(ctx, 'STOP_ALL_JOBS', true, 'owner');
  assert.equal(runProductionOnce(ctx).processed, 0);
  assert.equal(oppState(ctx, p.opportunityId), 'PRODUCTION_QUEUED');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM jobs WHERE state = 'QUEUED' AND reason = 'EMERGENCY_STOP'`), 1);
  assert.throws(() => setStop(ctx, 'STOP_ALL_JOBS', false, 'ai'), /OWNER_REQUIRED/);
  setStop(ctx, 'STOP_ALL_JOBS', false, 'owner');
  clock.advance(61_000);
  assert.equal(runProductionOnce(ctx).results[0]?.outcome, 'DELIVERED');
});

test('IE-006 KI-Vorschlag Fremdüberweisung: abgelehnt mit Audit-Eintrag', () => {
  const { ctx } = makeCtx();
  const d = submitAgentProposal(ctx, { kind: 'transfer_funds', beneficiary: 'DE89370400440532013000', amountMinor: 50000 });
  assert.equal(d.allowed, false);
  const denied = ctx.audit.byType('policy.denied');
  assert.equal(denied.length, 1);
  assert.match(denied[0]?.data_json ?? '', /NO_SOFTWARE_TRANSFERS/);
  assert.doesNotMatch(denied[0]?.data_json ?? '', /0532013000/, 'IBAN wird im Audit redigiert');
  assert.equal(submitAgentProposal(ctx, { kind: 'rm_rf', path: '/' }).rule, 'MALFORMED_PROPOSAL');
});

test('IE-007 KI-Vorschlag kostenpflichtige API: abgelehnt, keine Zahlungsdaten', () => {
  const { ctx } = makeCtx();
  const d = submitAgentProposal(ctx, { kind: 'enable_paid_api', service: 'x', monthlyCostEur: 9 });
  assert.deepEqual([d.allowed, d.rule], [false, 'PAID_APIS_DISABLED']);
});

test('IE-008 Policy-Versionswechsel: neue Policy erst nach Eigentümer-Freigabe gültig', () => {
  const { ctx } = makeCtx();
  const lead = submitInboundLead(ctx, inbound(), { ipHash: 't' });
  qualify(ctx, lead.opportunityId);
  assessFeasibility(ctx, lead.opportunityId);
  const v = proposePolicy(ctx, { ...SAFE_DEFAULT_POLICY, quote: { ...SAFE_DEFAULT_POLICY.quote, minMinor: 1000, maxMinor: 5000 } }, 'ai');
  assert.equal(effectivePolicy(ctx)?.quote.maxMinor, 200000, 'vor Freigabe gilt alte Policy');
  assert.throws(() => approvePolicy(ctx, v, 'ai'), /OWNER_APPROVAL_REQUIRED/);
  approvePolicy(ctx, v, 'owner');
  assert.equal(effectivePolicy(ctx)?.quote.maxMinor, 5000);
  assert.throws(() => createQuote(ctx, lead.opportunityId), /QUOTE_ABOVE_MAX/);
});

test('IE-002 keine aktive Policy in der DB: alles blockiert (fail-closed)', () => {
  const { ctx } = makeCtx();
  ctx.db.run(`UPDATE policy_versions SET status = 'SUPERSEDED'`);
  assert.equal(effectivePolicy(ctx), null);
  assert.equal(decide(ctx, { action: 'checkout.create', testMode: true }, 'customer').rule, 'NO_POLICY');
  assert.equal(decide(ctx, { action: 'job.run', kind: 'production', production: true }, 'system').rule, 'NO_POLICY');
});

test('IE-009 IE-096 ausgeschöpftes Claude-Kontingent: Job wartet in Queue, kein API-Kredit, Plan B läuft', () => {
  const { ctx } = makeCtx({ env: { AI_DAILY_TASK_LIMIT: '0' } });
  const { job } = enqueueJob(ctx, { kind: 'ai_text_draft', idempotencyKey: 'ai:1', requiresAi: true, estimatedTokens: 5000 });
  assert.equal(claimNext(ctx, ['ai_text_draft']), null);
  const after = getJob(ctx, job.job_id);
  assert.deepEqual([after?.state, after?.reason], ['QUEUED', 'AI_QUOTA_EXHAUSTED']);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'policy.allowed' AND data_json LIKE '%paid_api%'`), 0);
  const d = toDelivered(ctx);
  assert.equal(oppState(ctx, d.opportunityId), 'DELIVERED', 'deterministischer Kern arbeitet ohne KI weiter');
});

test('IE-010 Offline-KI während Checkout: deterministischer Bestellkern arbeitet weiter', () => {
  const { ctx } = makeCtx({ env: { AI_DAILY_TASK_LIMIT: '0' } });
  const d = toDelivered(ctx);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', d.orderId), 1);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM jobs WHERE requires_ai = 1'), 0);
});
