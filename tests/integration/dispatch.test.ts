import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchPending, expectedStartDelay, MEASURED_SCHEDULE, type DispatchFetch } from '../../services/product-factory/src/dispatch.ts';
import { requestProbe } from '../../services/product-factory/src/external-build.ts';
import { makeCtx } from '../helpers.ts';

/** 17.0 Sofort-Auslöser: wartende Bau-/KI-Aufträge stoßen den GitHub-Workflow an – nur mit Token des Eigentümers, gedrosselt, ohne Kundendaten. */
const AGENT = `agent_${'x'.repeat(40)}`;

test('Ohne Token: kein Aufruf nach außen; ehrliche Wartezeit aus der Messung', async () => {
  const { ctx } = makeCtx({ env: { BUILD_AGENT_TOKEN: AGENT } });
  requestProbe(ctx, 'win-lager');
  const calls: string[] = [];
  const r = await dispatchPending(ctx, async (url) => { calls.push(url); return { status: 204 }; });
  assert.deepEqual(r.map((x) => x.outcome), ['NOT_CONFIGURED', 'NOT_CONFIGURED']);
  assert.equal(calls.length, 0);
  assert.equal(expectedStartDelay(ctx).minutes, MEASURED_SCHEDULE.maxMinutes);
  assert.match(expectedStartDelay(ctx).text, /gemessen alle 4–7 Stunden/);
});

test('Mit Token: nur wenn etwas wartet, höchstens ein Anstoß je 10 Minuten, nur „starte Workflow“ ohne Kundendaten', async () => {
  const { ctx, clock } = makeCtx({ env: { BUILD_AGENT_TOKEN: AGENT, AI_DAILY_TASK_LIMIT: '2', GITHUB_DISPATCH_TOKEN: `github_pat_${'a'.repeat(30)}`, GITHUB_REPOSITORY: 'vecom2709/INFINITY-EARN' } });
  const calls: { url: string; body: string; auth: string }[] = [];
  const ok: DispatchFetch = async (url, init) => { calls.push({ url, body: init.body, auth: init.headers.authorization ?? '' }); return { status: 204 }; };
  assert.deepEqual((await dispatchPending(ctx, ok)).map((x) => x.outcome), ['NOTHING_PENDING', 'NOTHING_PENDING']);
  requestProbe(ctx, 'win-lager');
  assert.deepEqual((await dispatchPending(ctx, ok)).map((x) => x.outcome), ['DISPATCHED', 'NOTHING_PENDING']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.github.com/repos/vecom2709/INFINITY-EARN/actions/workflows/win-build.yml/dispatches');
  assert.equal(calls[0]?.body, '{"ref":"main"}', 'keine Kundendaten im Aufruf');
  assert.match(calls[0]?.auth ?? '', /^Bearer github_pat_/);
  assert.deepEqual((await dispatchPending(ctx, ok)).map((x) => x.outcome), ['THROTTLED', 'NOTHING_PENDING'], 'kein zweiter Anstoß im selben Fenster');
  clock.advance(11 * 60_000);
  requestProbe(ctx, 'ai-texte');
  assert.deepEqual((await dispatchPending(ctx, ok)).map((x) => x.outcome), ['DISPATCHED', 'DISPATCHED']);
  assert.match(calls[2]?.url ?? '', /ai-job\.yml/);
  assert.equal(expectedStartDelay(ctx).minutes, 15);
  assert.ok(!JSON.stringify(ctx.audit.byType('build.dispatch_sent')).includes('github_pat_'), 'Token nie im Protokoll');
});

test('GitHub lehnt ab oder ist nicht erreichbar: protokolliert, Auftrag bleibt wartend, kein Absturz', async () => {
  const { ctx, clock } = makeCtx({ env: { BUILD_AGENT_TOKEN: AGENT, GITHUB_DISPATCH_TOKEN: `github_pat_${'a'.repeat(30)}`, GITHUB_REPOSITORY: 'vecom2709/INFINITY-EARN' } });
  const b = requestProbe(ctx, 'win-lager').build;
  assert.deepEqual((await dispatchPending(ctx, async () => ({ status: 401 })))[0], { platform: 'windows', outcome: 'FAILED', status: 401 });
  clock.advance(11 * 60_000);
  assert.equal((await dispatchPending(ctx, async () => { throw new Error('offline'); }))[0]?.outcome, 'FAILED');
  assert.equal(ctx.db.get<{ state: string }>('SELECT state FROM external_builds WHERE build_id = ?', b.build_id)?.state, 'PENDING');
  assert.equal(ctx.audit.byType('build.dispatch_failed').length, 2);
});
