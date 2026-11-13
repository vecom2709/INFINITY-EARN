import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { parseJsonOr } from '../../../packages/shared/src/text.ts';
import { completeJob, getJob, setJobState, type JobRow } from '../../ai-orchestrator/src/queue.ts';
import { aiQuotaAvailable, incrementUsage } from '../../ai-orchestrator/src/quota.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { getOpportunity } from '../../core-api/src/opportunities.ts';
import { getOrder } from '../../core-api/src/orders.ts';
import { decide } from '../../core-api/src/policy-store.ts';
import { finishProduction, markNotDeliverable, type ProductionRunResult } from './production.ts';
import { acceptanceGate } from './quality-standard.ts';
import { getCapability } from './registry.ts';
import type { ProductCapability, QaCheckResult } from './types.ts';

/**
 * Bau je Auftrag auf einem externen Rechner (Funktion 157/158). Der Worker kann keine Windows-Programme übersetzen:
 *  1. Die Produktion legt einen Bauauftrag an; der Auftrag wartet (WAITING_WINDOWS_BUILD).
 *  2. Der Bau-Agent (GitHub-Windows-Server, scripts/win-build-agent.ts) holt ihn mit eigenem Schlüssel ab (Lease),
 *     baut, testet und lädt das Paket hoch – oder meldet einen Fehler.
 *  3. Der Worker prüft das Paket selbst (Abnahmeprüfung der Produktart) und gibt erst dann die Lieferung frei.
 * Höchstens MAX_BUILD_ATTEMPTS Versuche; danach „nicht lieferfähig“ mit Erstattungsvorschlag an den Eigentümer.
 * Probebauten (kind PROBE, Musterfirma) belegen den Weg ohne Kundenauftrag.
 */
export const BUILD_LEASE_MS = 45 * 60_000;
export const MAX_BUILD_ATTEMPTS = 3;
export const WAIT_POLL_MS = 10 * 60_000;
export const PROBE_SPEC = { company: 'Musterfirma', color: '#1F5FA8', lang: 'de', country: 'DE' } as const;
/** Probe für KI-Texte: erfundene Musterfirma, keine Kundendaten. */
export const TEXT_PROBE_SPEC = {
  company: 'Musterfirma', offer: 'Montage und Wartung von Fenstern und Türen für Privathaushalte', audience: 'Hausbesitzer in der Region',
  language: 'de', tone: 'freundlich', facts: ['Familienbetrieb in zweiter Generation', 'Termine auch samstags'], keywords: ['Fenster', 'Wartung'], forbidden: [],
  texts: [{ kind: 'startseite', words_min: 120, words_max: 260 }], confirm_no_personal_data: true,
} as const;
export type Platform = 'windows' | 'ai-claude';
const PROBES: Record<string, { spec: unknown; platform: Platform }> = { 'win-lager': { spec: PROBE_SPEC, platform: 'windows' }, 'ai-texte': { spec: TEXT_PROBE_SPEC, platform: 'ai-claude' } };

export interface BuildRow {
  build_id: string; order_id: string | null; job_id: string | null; capability_id: string; platform: Platform; kind: 'ORDER' | 'PROBE';
  spec_json: string; state: 'PENDING' | 'CLAIMED' | 'DONE' | 'FAILED'; attempts: number; lease_until: string | null; last_error: string | null;
  runner_ref: string | null; result_path: string | null; result_sha256: string | null; qa_json: string | null; qa_passed: number | null;
  test_mode: number; created_at: string; updated_at: string;
}

type Result = ProductionRunResult['results'][number];

export const getBuild = (ctx: AppContext, id: string): BuildRow | undefined => ctx.db.get<BuildRow>('SELECT * FROM external_builds WHERE build_id = ?', id);
export const buildByOrder = (ctx: AppContext, orderId: string): BuildRow | undefined => ctx.db.get<BuildRow>('SELECT * FROM external_builds WHERE order_id = ?', orderId);
export const latestProbe = (ctx: AppContext, capabilityId = 'win-lager'): BuildRow | undefined => ctx.db.get<BuildRow>(`SELECT * FROM external_builds WHERE kind = 'PROBE' AND capability_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, capabilityId);

function insertBuild(ctx: AppContext, kind: 'ORDER' | 'PROBE', capabilityId: string, spec: unknown, orderId: string | null, jobId: string | null, platform: Platform): BuildRow {
  const now = ctx.clock().toISOString();
  const id = newId('bld');
  ctx.db.run(
    `INSERT INTO external_builds (build_id, order_id, job_id, capability_id, platform, kind, spec_json, state, attempts, test_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
    id, orderId, jobId, capabilityId, platform, kind, JSON.stringify(spec), ctx.config.testMode ? 1 : 0, now, now,
  );
  // Ins Protokoll nur Kennungen – keine Kundenangaben.
  ctx.audit.record({ type: 'build.requested', actor: 'system', subjectType: orderId ? 'order' : 'capability', subjectId: orderId ?? capabilityId, data: { build_id: id, kind }, testMode: ctx.config.testMode });
  return getBuild(ctx, id) as BuildRow;
}

function setBuild(ctx: AppContext, id: string, fields: Partial<BuildRow>): void {
  const keys = Object.keys(fields) as (keyof BuildRow)[];
  ctx.db.run(`UPDATE external_builds SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE build_id = ?`, ...keys.map((k) => fields[k] as string | number | null), ctx.clock().toISOString(), id);
}

/** Aufgerufen von der Produktion: Bauauftrag anlegen bzw. Stand prüfen; der Auftrag wartet ohne Leerlauf-Schleife. */
export function awaitExternalBuild(ctx: AppContext, job: JobRow, orderId: string, cap: ProductCapability, scope: unknown): Result {
  const base = { jobId: job.job_id, orderId };
  const b = buildByOrder(ctx, orderId);
  if (!b) {
    let spec: unknown;
    try {
      spec = cap.externalBuild?.spec(scope);
    } catch (e) {
      const reason = (e as Error).message.slice(0, 200);
      setJobState(ctx, job.job_id, 'HUMAN_REVIEW', reason);
      markNotDeliverable(ctx, orderId, `Bauauftrag ungültig: ${reason}`);
      return { ...base, outcome: 'BLOCKED', detail: reason };
    }
    insertBuild(ctx, 'ORDER', cap.capability_id, spec, orderId, job.job_id, cap.externalBuild?.platform ?? 'windows');
  } else if (b.state === 'DONE') {
    completeJob(ctx, job.job_id);
    return { ...base, outcome: 'DELIVERED' };
  } else if (b.state === 'FAILED') {
    setJobState(ctx, job.job_id, 'HUMAN_REVIEW', 'WINDOWS_BUILD_FAILED');
    return { ...base, outcome: 'DEAD_LETTER', detail: b.last_error ?? 'WINDOWS_BUILD_FAILED' };
  }
  const ai = cap.externalBuild?.platform === 'ai-claude';
  // KI-Kontingent erschöpft → sichtbar „wartet auf KI“, nichts geht verloren
  setJobState(ctx, job.job_id, 'QUEUED', ai ? (aiQuotaAvailable(ctx) ? 'WAITING_AI_JOB' : 'AI_QUOTA_EXHAUSTED') : 'WAITING_WINDOWS_BUILD', WAIT_POLL_MS);
  return { ...base, outcome: 'WAITING' };
}

/** Endgültig gescheitert: Auftrag „nicht lieferfähig“ (Erstattung nur als Vorschlag an den Eigentümer). */
function giveUp(ctx: AppContext, b: BuildRow, reason: string): void {
  setBuild(ctx, b.build_id, { state: 'FAILED', lease_until: null, last_error: reason.slice(0, 300) });
  ctx.audit.record({ type: 'build.failed', actor: 'system', subjectType: b.order_id ? 'order' : 'capability', subjectId: b.order_id ?? b.capability_id, data: { build_id: b.build_id, attempts: b.attempts }, testMode: ctx.config.testMode });
  if (b.kind === 'ORDER' && b.order_id) {
    if (b.job_id) setJobState(ctx, b.job_id, 'HUMAN_REVIEW', 'WINDOWS_BUILD_FAILED');
    markNotDeliverable(ctx, b.order_id, `Windows-Bau nach ${b.attempts} Versuchen nicht gelungen: ${reason.slice(0, 120)}`);
  }
}

/** Nach einem Fehlversuch: erneut anbieten oder aufgeben. */
function retryOrGiveUp(ctx: AppContext, b: BuildRow, reason: string): 'PENDING' | 'FAILED' {
  if (b.attempts >= MAX_BUILD_ATTEMPTS) {
    giveUp(ctx, b, reason);
    return 'FAILED';
  }
  setBuild(ctx, b.build_id, { state: 'PENDING', lease_until: null, last_error: reason.slice(0, 300) });
  return 'PENDING';
}

function releaseExpiredLeases(ctx: AppContext): void {
  const now = ctx.clock().toISOString();
  for (const b of ctx.db.all<BuildRow>(`SELECT * FROM external_builds WHERE state = 'CLAIMED' AND lease_until < ?`, now)) retryOrGiveUp(ctx, b, 'LEASE_EXPIRED: Bau-Agent hat sich nicht zurückgemeldet');
}

/** Anzahl abholbereiter Bauaufträge (für die günstige Vorabprüfung des Agenten). */
export function pendingBuilds(ctx: AppContext, platform: Platform = 'windows'): number {
  releaseExpiredLeases(ctx);
  // Ohne freies KI-Kontingent startet kein KI-Lauf (spart Abo-Nutzung und GitHub-Minuten).
  if (platform === 'ai-claude' && !aiQuotaAvailable(ctx)) return 0;
  return ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM external_builds WHERE state = 'PENDING' AND platform = ?`, platform)?.n ?? 0;
}

/** Bauauftrag an den Agenten übergeben (Lease). Gibt nur die vier Bauangaben heraus. */
export function claimBuild(ctx: AppContext, runnerRef: string, platform: Platform = 'windows'): { build_id: string; kind: BuildRow['kind']; attempt: number; spec: unknown } | null {
  releaseExpiredLeases(ctx);
  for (;;) {
    if (platform === 'ai-claude' && !aiQuotaAvailable(ctx)) return null; // Tageslimit des Eigentümers
    const b = ctx.db.get<BuildRow>(`SELECT * FROM external_builds WHERE state = 'PENDING' AND platform = ? ORDER BY created_at, rowid LIMIT 1`, platform);
    if (!b) return null;
    if (b.kind === 'ORDER' && b.order_id) {
      // Kein Bau für Aufträge, die nicht (mehr) produziert werden dürfen – z. B. erstattet oder Notstopp.
      const order = getOrder(ctx, b.order_id);
      const d = decide(ctx, { action: 'production.start', paymentState: order.payment_state, feasibilityApproved: true, scopeValid: true }, 'system', { type: 'order', id: b.order_id });
      if (!d.allowed) {
        if (d.rule === 'EMERGENCY_STOP') return null; // Notstopp: nichts herausgeben, später erneut
        giveUp(ctx, b, `PRODUCTION_NOT_ALLOWED: ${d.rule}`);
        continue;
      }
    }
    const lease = new Date(ctx.clock().getTime() + BUILD_LEASE_MS).toISOString();
    const r = ctx.db.run(`UPDATE external_builds SET state = 'CLAIMED', attempts = attempts + 1, lease_until = ?, runner_ref = ?, updated_at = ? WHERE build_id = ? AND state = 'PENDING'`, lease, runnerRef, ctx.clock().toISOString(), b.build_id);
    if (r.changes !== 1) continue;
    if (platform === 'ai-claude') incrementUsage(ctx, 'ai_tasks'); // jeder KI-Versuch zählt gegen das Tageslimit
    ctx.audit.record({ type: 'build.claimed', actor: 'system', subjectType: 'build', subjectId: b.build_id, data: { runner: runnerRef, attempt: b.attempts + 1 }, testMode: ctx.config.testMode });
    return { build_id: b.build_id, kind: b.kind, attempt: b.attempts + 1, spec: JSON.parse(b.spec_json) };
  }
}

function claimed(ctx: AppContext, buildId: string): BuildRow {
  const b = getBuild(ctx, buildId);
  if (!b) throw new WorkflowError('BUILD_UNKNOWN');
  if (b.state !== 'CLAIMED') throw new WorkflowError('BUILD_NOT_CLAIMED', `Stand ${b.state}`);
  return b;
}

/** Agent meldet einen Fehlschlag (ohne Kundendaten im Text). */
export function failBuild(ctx: AppContext, buildId: string, reason: string): { state: 'PENDING' | 'FAILED' } {
  const b = claimed(ctx, buildId);
  const clean = reason.replace(/[\r\n\t]+/g, ' ').slice(0, 300) || 'ohne Angabe';
  ctx.audit.record({ type: 'build.attempt_failed', actor: 'system', subjectType: 'build', subjectId: buildId, data: { attempt: b.attempts, reason: clean.slice(0, 120) }, testMode: ctx.config.testMode });
  return { state: retryOrGiveUp(ctx, b, clean) };
}

/** Agent lädt das Paket hoch: unabhängige Abnahmeprüfung, bei Aufträgen danach die normale Lieferfreigabe. */
export function submitBuild(ctx: AppContext, buildId: string, raw: Uint8Array, platform?: Platform): { outcome: string; passed: boolean; checks: QaCheckResult[] } {
  const b = claimed(ctx, buildId);
  if (platform && b.platform !== platform) throw new WorkflowError('BUILD_UNKNOWN');
  const cap = getCapability(b.capability_id);
  if (!cap?.externalBuild) throw new WorkflowError('CAPABILITY_UNKNOWN');
  let bytes: Uint8Array;
  try {
    bytes = cap.externalBuild.assemble ? cap.externalBuild.assemble(raw, JSON.parse(b.spec_json)) : raw;
  } catch (e) {
    const reason = `RESULT_INVALID: ${(e as Error).message.slice(0, 160)}`;
    retryOrGiveUp(ctx, b, reason);
    return { outcome: 'RESULT_INVALID', passed: false, checks: [{ check: 'result', passed: false, detail: reason }] };
  }
  const sha = sha256Hex(bytes);
  if (b.kind === 'PROBE') {
    const spec = JSON.parse(b.spec_json) as unknown;
    const checks = [...cap.runQa(bytes, spec), { check: 'checksum', passed: sha256Hex(bytes) === sha, detail: sha.slice(0, 16) }];
    checks.push(acceptanceGate(cap.capability_id, checks));
    const passed = checks.every((c) => c.passed);
    const path = ctx.blobs.put(`${ctx.config.testMode ? 'test' : 'live'}/probe/${cap.capability_id}.zip`, bytes);
    setBuild(ctx, buildId, { state: passed ? 'DONE' : b.state, lease_until: null, result_path: path, result_sha256: sha, qa_json: JSON.stringify(checks), qa_passed: passed ? 1 : 0 });
    if (!passed) retryOrGiveUp(ctx, b, `QA_FAILED: ${checks.filter((c) => !c.passed).map((c) => c.check).join(', ')}`);
    ctx.audit.record({ type: passed ? 'build.probe_passed' : 'build.probe_failed', actor: 'system', subjectType: 'build', subjectId: buildId, data: { sha256: sha, runner: b.runner_ref }, testMode: ctx.config.testMode });
    return { outcome: passed ? 'PASSED' : 'QA_FAILED', passed, checks };
  }
  const order = getOrder(ctx, b.order_id as string);
  const opp = getOpportunity(ctx, order.opportunity_id);
  const job = b.job_id ? getJob(ctx, b.job_id) : undefined;
  if (!job) throw new WorkflowError('JOB_NOT_FOUND');
  const scope = parseJsonOr<unknown>(opp.scope_json, null);
  const r = finishProduction(ctx, job, order, opp, cap, scope, bytes);
  const qa = ctx.db.get<{ results_json: string; passed: number }>('SELECT q.results_json, q.passed FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.order_id = ? ORDER BY q.created_at DESC, q.rowid DESC LIMIT 1', order.order_id);
  const checks = parseJsonOr<QaCheckResult[]>(qa?.results_json ?? '[]', []);
  const passed = qa?.passed === 1;
  setBuild(ctx, buildId, { lease_until: null, result_sha256: sha, qa_json: JSON.stringify(checks), qa_passed: passed ? 1 : 0 });
  if (passed) setBuild(ctx, buildId, { state: 'DONE' });
  else retryOrGiveUp(ctx, getBuild(ctx, buildId) as BuildRow, `QA_FAILED: ${r.detail ?? ''}`);
  return { outcome: r.outcome, passed, checks };
}

/** Probebau mit Musterfirma anstoßen – höchstens einer gleichzeitig. */
export function requestProbe(ctx: AppContext, capabilityId = 'win-lager'): { build: BuildRow; created: boolean } {
  const probe = PROBES[capabilityId];
  if (!probe) throw new WorkflowError('CAPABILITY_UNKNOWN');
  const open = ctx.db.get<BuildRow>(`SELECT * FROM external_builds WHERE kind = 'PROBE' AND capability_id = ? AND state IN ('PENDING', 'CLAIMED') ORDER BY created_at DESC LIMIT 1`, capabilityId);
  if (open) return { build: open, created: false };
  return { build: insertBuild(ctx, 'PROBE', capabilityId, probe.spec, null, null, probe.platform), created: true };
}
