import { newId } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { decide } from '../../core-api/src/policy-store.ts';
import { aiQuotaAvailable, freeTierThrottled } from './quota.ts';

export type JobState = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED_RETRY' | 'DEAD_LETTER' | 'HUMAN_REVIEW' | 'REJECTED' | 'BLOCKED_CAPACITY';

export interface JobRow {
  job_id: string;
  order_id: string | null;
  kind: string;
  state: JobState;
  priority: number;
  idempotency_key: string;
  requires_ai: number;
  estimated_tokens: number;
  budget_eur_cents: number;
  retry_count: number;
  max_retries: number;
  next_run_at: string | null;
  reason: string | null;
  last_error: string | null;
  payload_json: string;
  test_mode: number;
  created_at: string;
  updated_at: string;
}

export interface EnqueueInput {
  kind: string;
  idempotencyKey: string;
  orderId?: string | null;
  requiresAi?: boolean;
  estimatedTokens?: number;
  budgetEurCents?: number;
  payload?: unknown;
  priority?: number;
  maxRetries?: number;
}

export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 3_600_000;
export const ADMISSION_RETRY_MS = 60_000;

export const backoffMs = (attempt: number): number => Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_MAX_MS);

const PRODUCTION_KINDS = new Set(['production']);

export function getJob(ctx: AppContext, jobId: string): JobRow | undefined {
  return ctx.db.get<JobRow>('SELECT * FROM jobs WHERE job_id = ?', jobId);
}

/** Idempotentes Einreihen: gleicher Schlüssel -> derselbe Job (IE-092). Kosten > 0 -> REJECTED (IE-080). */
export function enqueueJob(ctx: AppContext, input: EnqueueInput): { job: JobRow; created: boolean } {
  const existing = ctx.db.get<JobRow>('SELECT * FROM jobs WHERE idempotency_key = ?', input.idempotencyKey);
  if (existing) return { job: existing, created: false };
  const now = ctx.clock().toISOString();
  const budget = input.budgetEurCents ?? 0;
  let state: JobState = 'QUEUED';
  let reason: string | null = null;
  if (budget > 0) {
    const d = decide(ctx, { action: 'cost.commit', amountEur: budget / 100, recurring: false, description: `job:${input.kind}` }, 'ai', { type: 'job', id: input.idempotencyKey });
    if (!d.allowed) {
      state = 'REJECTED';
      reason = `COST_LIMIT:${d.rule}`;
      ctx.audit.record({ type: 'budget.blocked', actor: 'system', subjectType: 'job', subjectId: input.idempotencyKey, data: { budget_eur_cents: budget }, testMode: ctx.config.testMode });
    }
  }
  const jobId = newId('job');
  ctx.db.run(
    `INSERT INTO jobs (job_id, order_id, kind, state, priority, idempotency_key, requires_ai, estimated_tokens, budget_eur_cents, max_retries, reason, payload_json, test_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    jobId,
    input.orderId ?? null,
    input.kind,
    state,
    input.priority ?? 0,
    input.idempotencyKey,
    input.requiresAi ? 1 : 0,
    input.estimatedTokens ?? 0,
    budget,
    input.maxRetries ?? 3,
    reason,
    JSON.stringify(input.payload ?? {}),
    ctx.config.testMode ? 1 : 0,
    now,
    now,
  );
  ctx.audit.record({ type: 'job.enqueued', actor: 'system', subjectType: 'job', subjectId: jobId, data: { kind: input.kind, state, reason }, testMode: ctx.config.testMode });
  return { job: getJob(ctx, jobId) as JobRow, created: true };
}

export type Admission = { admit: true } | { admit: false; state: 'QUEUED' | 'REJECTED' | 'HUMAN_REVIEW'; reason: string };

/** Job-Admission: Notstopp, Policy, KI-Kontingent, Free-Tier-Drosselung (Masterprompt §2 Ebene B). */
export function admission(ctx: AppContext, job: JobRow): Admission {
  const d = decide(ctx, { action: 'job.run', kind: job.kind, production: PRODUCTION_KINDS.has(job.kind) }, 'system', { type: 'job', id: job.job_id });
  if (!d.allowed) return { admit: false, state: 'QUEUED', reason: d.rule };
  if (job.requires_ai === 1 && !aiQuotaAvailable(ctx)) return { admit: false, state: 'QUEUED', reason: 'AI_QUOTA_EXHAUSTED' };
  if (freeTierThrottled(ctx)) return { admit: false, state: 'QUEUED', reason: 'FREE_TIER_THROTTLE' };
  return { admit: true };
}

/** Wiederanlauf nach Absturz/Neustart: Jobs, die länger als maxAgeMs auf RUNNING stehen, kommen protokolliert zurück in die Warteschlange. */
export const STALE_RUNNING_MS = 30 * 60_000;
export function recoverStaleJobs(ctx: AppContext, maxAgeMs = STALE_RUNNING_MS): number {
  const now = ctx.clock();
  const limit = new Date(now.getTime() - maxAgeMs).toISOString();
  const stale = ctx.db.all<{ job_id: string; kind: string }>(`SELECT job_id, kind FROM jobs WHERE state = 'RUNNING' AND updated_at < ?`, limit);
  for (const j of stale) {
    const r = ctx.db.run(`UPDATE jobs SET state = 'QUEUED', reason = 'RECOVERED_AFTER_RESTART', next_run_at = NULL, updated_at = ? WHERE job_id = ? AND state = 'RUNNING'`, now.toISOString(), j.job_id);
    if (r.changes === 1) ctx.audit.record({ type: 'job.recovered', actor: 'system', subjectType: 'job', subjectId: j.job_id, data: { kind: j.kind }, testMode: ctx.config.testMode });
  }
  return stale.length;
}

/** Nächsten lauffähigen Job holen; nicht zugelassene Jobs bleiben QUEUED (nicht verloren). */
export function claimNext(ctx: AppContext, kinds: readonly string[]): JobRow | null {
  const now = ctx.clock();
  const placeholders = kinds.map(() => '?').join(',');
  const candidates = ctx.db.all<JobRow>(
    `SELECT * FROM jobs WHERE state IN ('QUEUED','FAILED_RETRY') AND kind IN (${placeholders})
       AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY priority DESC, created_at LIMIT 20`,
    ...kinds,
    now.toISOString(),
  );
  for (const job of candidates) {
    const adm = admission(ctx, job);
    const ts = now.toISOString();
    if (adm.admit) {
      const r = ctx.db.run(`UPDATE jobs SET state = 'RUNNING', reason = NULL, updated_at = ? WHERE job_id = ? AND state = ?`, ts, job.job_id, job.state);
      if (r.changes === 1) return { ...job, state: 'RUNNING', reason: null };
      continue;
    }
    ctx.db.run(
      'UPDATE jobs SET state = ?, reason = ?, next_run_at = ?, updated_at = ? WHERE job_id = ?',
      adm.state,
      adm.reason,
      new Date(now.getTime() + ADMISSION_RETRY_MS).toISOString(),
      ts,
      job.job_id,
    );
  }
  return null;
}

export function completeJob(ctx: AppContext, jobId: string): void {
  ctx.db.run(`UPDATE jobs SET state = 'SUCCEEDED', reason = NULL, updated_at = ? WHERE job_id = ?`, ctx.clock().toISOString(), jobId);
  ctx.audit.record({ type: 'job.succeeded', actor: 'system', subjectType: 'job', subjectId: jobId, testMode: ctx.config.testMode });
}

/** Fehler -> Retry mit exponentiellem Backoff; nach max_retries Dead-Letter + Alarm (IE-047, IE-093, IE-094). */
export function failJob(ctx: AppContext, jobId: string, error: string): 'FAILED_RETRY' | 'DEAD_LETTER' {
  const job = getJob(ctx, jobId);
  if (!job) throw new Error('JOB_NOT_FOUND');
  const attempt = job.retry_count + 1;
  const now = ctx.clock();
  if (attempt > job.max_retries) {
    ctx.db.run(`UPDATE jobs SET state = 'DEAD_LETTER', retry_count = ?, last_error = ?, updated_at = ? WHERE job_id = ?`, attempt, error.slice(0, 500), now.toISOString(), jobId);
    ctx.audit.record({ type: 'alert.dead_letter', actor: 'system', subjectType: 'job', subjectId: jobId, data: { kind: job.kind, error: error.slice(0, 200), attempts: attempt }, testMode: ctx.config.testMode });
    return 'DEAD_LETTER';
  }
  ctx.db.run(
    `UPDATE jobs SET state = 'FAILED_RETRY', retry_count = ?, last_error = ?, next_run_at = ?, updated_at = ? WHERE job_id = ?`,
    attempt,
    error.slice(0, 500),
    new Date(now.getTime() + backoffMs(attempt)).toISOString(),
    now.toISOString(),
    jobId,
  );
  ctx.audit.record({ type: 'job.retry_scheduled', actor: 'system', subjectType: 'job', subjectId: jobId, data: { attempt, backoff_ms: backoffMs(attempt) }, testMode: ctx.config.testMode });
  return 'FAILED_RETRY';
}

export function setJobState(ctx: AppContext, jobId: string, state: JobState, reason: string, delayMs = 0): void {
  const now = ctx.clock();
  ctx.db.run(
    'UPDATE jobs SET state = ?, reason = ?, next_run_at = ?, updated_at = ? WHERE job_id = ?',
    state,
    reason,
    delayMs > 0 ? new Date(now.getTime() + delayMs).toISOString() : null,
    now.toISOString(),
    jobId,
  );
  ctx.audit.record({ type: 'job.state_changed', actor: 'system', subjectType: 'job', subjectId: jobId, data: { state, reason }, testMode: ctx.config.testMode });
}

/** Ein Job pro Intervall und Schlüssel; doppelte Cron-Auslösung ist idempotent (IE-091, IE-092). */
export function cronTick(ctx: AppContext, kind: string, intervalMs: number): { job: JobRow; created: boolean } {
  const bucket = Math.floor(ctx.clock().getTime() / intervalMs);
  return enqueueJob(ctx, { kind, idempotencyKey: `cron:${kind}:${intervalMs}:${bucket}`, priority: -1 });
}
