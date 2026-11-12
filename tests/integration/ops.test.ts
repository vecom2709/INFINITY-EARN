import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Db } from '../../packages/storage/src/db.ts';
import { migrate } from '../../packages/storage/src/migrate.ts';
import { incrementUsage } from '../../services/ai-orchestrator/src/quota.ts';
import { BACKOFF_BASE_MS, claimNext, cronTick, enqueueJob, failJob, getJob } from '../../services/ai-orchestrator/src/queue.ts';
import { count, makeCtx } from '../helpers.ts';

test('IE-091 Cron erfolgreich: ein Job pro Intervall und Schlüssel', () => {
  const { ctx, clock } = makeCtx();
  const a = cronTick(ctx, 'reconcile', 60_000);
  clock.advance(60_000);
  const b = cronTick(ctx, 'reconcile', 60_000);
  assert.equal(a.created && b.created, true);
  assert.notEqual(a.job.job_id, b.job.job_id);
});

test('IE-092 Cron doppelt ausgelöst: idempotent', () => {
  const { ctx, clock } = makeCtx();
  const a = cronTick(ctx, 'reconcile', 60_000);
  clock.advance(10_000);
  const b = cronTick(ctx, 'reconcile', 60_000);
  assert.equal(b.created, false);
  assert.equal(b.job.job_id, a.job.job_id);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM jobs WHERE kind = 'reconcile'`), 1);
});

test('IE-093 Queue-Worker abgestürzt: Retry mit exponentiellem Backoff', () => {
  const { ctx, clock } = makeCtx();
  const { job } = enqueueJob(ctx, { kind: 'export', idempotencyKey: 'exp:1' });
  assert.equal(claimNext(ctx, ['export'])?.job_id, job.job_id);
  assert.equal(failJob(ctx, job.job_id, 'worker crashed'), 'FAILED_RETRY');
  assert.equal(getJob(ctx, job.job_id)?.next_run_at, new Date(clock.t + BACKOFF_BASE_MS).toISOString());
  assert.equal(claimNext(ctx, ['export']), null, 'vor Ablauf des Backoffs nicht erneut');
  clock.advance(BACKOFF_BASE_MS);
  assert.equal(claimNext(ctx, ['export'])?.job_id, job.job_id);
  failJob(ctx, job.job_id, 'again');
  assert.equal(getJob(ctx, job.job_id)?.next_run_at, new Date(clock.t + 2 * BACKOFF_BASE_MS).toISOString());
});

test('IE-094 Dead-Letter erreicht: Alarm und kein Endlosloop', () => {
  const { ctx, clock } = makeCtx();
  const { job } = enqueueJob(ctx, { kind: 'export', idempotencyKey: 'exp:2', maxRetries: 2 });
  const states: string[] = [];
  for (let i = 0; i < 5; i++) {
    const j = claimNext(ctx, ['export']);
    if (!j) break;
    states.push(failJob(ctx, j.job_id, 'boom'));
    clock.advance(3_600_000);
  }
  assert.deepEqual(states, ['FAILED_RETRY', 'FAILED_RETRY', 'DEAD_LETTER']);
  assert.equal(claimNext(ctx, ['export']), null);
  assert.equal(getJob(ctx, job.job_id)?.state, 'DEAD_LETTER');
  assert.equal(ctx.audit.byType('alert.dead_letter').length, 1);
});

test('IE-095 Free-Quota nähert sich dem Limit: Drosselung', () => {
  const { ctx } = makeCtx({ env: { FREE_TIER_DAILY_REQUEST_LIMIT: '10', FREE_TIER_THROTTLE_AT_BPS: '8000' } });
  const { job } = enqueueJob(ctx, { kind: 'export', idempotencyKey: 'exp:3' });
  incrementUsage(ctx, 'platform_requests', 7);
  assert.equal(claimNext(ctx, ['export'])?.job_id, job.job_id);
  const { job: j2 } = enqueueJob(ctx, { kind: 'export', idempotencyKey: 'exp:4' });
  incrementUsage(ctx, 'platform_requests', 1);
  assert.equal(claimNext(ctx, ['export']), null);
  assert.equal(getJob(ctx, j2.job_id)?.reason, 'FREE_TIER_THROTTLE');
});

test('IE-080 Job mit Kosten > 0 ohne Freigabe: abgelehnt, Budget-Ereignis protokolliert', () => {
  const { ctx } = makeCtx();
  const { job } = enqueueJob(ctx, { kind: 'render', idempotencyKey: 'r:1', budgetEurCents: 199 });
  assert.equal(job.state, 'REJECTED');
  assert.match(job.reason ?? '', /COST_LIMIT/);
  assert.equal(ctx.audit.byType('budget.blocked').length, 1);
  assert.equal(claimNext(ctx, ['render']), null);
});

test('Migrationen: idempotent und gegen nachträgliche Änderung geschützt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ie-mig-'));
  copyFileSync(resolve('db/migrations/0001_init.sql'), join(dir, '0001_init.sql'));
  const db = new Db(':memory:');
  assert.deepEqual(migrate(db, dir), ['0001_init.sql']);
  assert.deepEqual(migrate(db, dir), []);
  writeFileSync(join(dir, '0001_init.sql'), '-- manipuliert');
  assert.throws(() => migrate(db, dir), /MIGRATION_TAMPERED/);
  db.close();
});
