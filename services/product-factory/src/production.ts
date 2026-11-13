import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { parseJsonOr } from '../../../packages/shared/src/text.ts';
import { claimNext, completeJob, failJob, setJobState, type JobRow } from '../../ai-orchestrator/src/queue.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { getOpportunity, tryTransition } from '../../core-api/src/opportunities.ts';
import { getOrder, setFulfillmentState } from '../../core-api/src/orders.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { decide } from '../../core-api/src/policy-store.ts';
import { assetGate } from '../../core-api/src/client-assets.ts';
import { readVerifiedArtifact, storeArtifact } from './artifacts.ts';
import { releaseDelivery } from './delivery.ts';
import { routeCapability } from './registry.ts';
import { acceptanceGate } from './quality-standard.ts';
import { createRefundRequest } from '../../finance/src/refunds.ts';
import { queueNotDeliverable } from '../../core-api/src/outbox.ts';
import type { QaCheckResult } from './types.ts';

/**
 * 13 „Nicht lieferfähig“: Auftrag wird gekennzeichnet, eine volle Erstattung wird dem Eigentümer zur Freigabe
 * vorgeschlagen (nie automatisch ausgelöst) und der Kunde wird über den Postausgang informiert.
 */
export function markNotDeliverable(ctx: AppContext, orderId: string, reason: string): void {
  if (ctx.audit.byType('order.not_deliverable').some((a) => a.subject_id === orderId)) return;
  ctx.audit.record({ type: 'order.not_deliverable', actor: 'system', subjectType: 'order', subjectId: orderId, data: { reason }, testMode: ctx.config.testMode });
  try {
    createRefundRequest(ctx, orderId, 'qa_failure', `Nicht lieferfähig: ${reason}`);
  } catch (e) {
    if (!(e instanceof WorkflowError)) throw e; // z. B. bereits offen oder nicht bezahlt – Kennzeichnung bleibt bestehen
  }
  queueNotDeliverable(ctx, orderId);
}

export type ProductionOutcome = 'DELIVERED' | 'QA_FAILED' | 'RETRY' | 'DEAD_LETTER' | 'BLOCKED' | 'NO_CAPACITY';

export interface ProductionRunResult {
  processed: number;
  results: { jobId: string; orderId: string | null; outcome: ProductionOutcome; detail?: string }[];
}

export interface ProductionHooks {
  /** Nur für Tests: Generator-Fehler oder Artefakt-Manipulation simulieren. */
  beforeGenerate?: (job: JobRow) => void;
  mutateBytes?: (bytes: Uint8Array) => Uint8Array;
}

/**
 * Deterministischer Produktions-Worker. Läuft ohne KI. Startet nur, wenn die Policy-Engine
 * production.start erlaubt (bestätigte Zahlung, kein Notstopp) – IE-037, IE-041, IE-045..IE-047, IE-051, IE-052.
 */
export function runProductionOnce(ctx: AppContext, hooks: ProductionHooks = {}, maxJobs = 10): ProductionRunResult {
  const results: ProductionRunResult['results'] = [];
  for (let i = 0; i < maxJobs; i++) {
    const job = claimNext(ctx, ['production']);
    if (!job) break;
    results.push(processJob(ctx, job, hooks));
  }
  return { processed: results.length, results };
}

function processJob(ctx: AppContext, job: JobRow, hooks: ProductionHooks): ProductionRunResult['results'][number] {
  const base = { jobId: job.job_id, orderId: job.order_id };
  if (!job.order_id) {
    setJobState(ctx, job.job_id, 'HUMAN_REVIEW', 'NO_ORDER');
    return { ...base, outcome: 'BLOCKED', detail: 'NO_ORDER' };
  }
  const order = getOrder(ctx, job.order_id);
  const opp = getOpportunity(ctx, order.opportunity_id);
  const scope = parseJsonOr<unknown>(opp.scope_json, null);
  const d = decide(ctx, { action: 'production.start', paymentState: order.payment_state, feasibilityApproved: opp.capability_id !== null, scopeValid: scope !== null }, 'system', { type: 'order', id: order.order_id });
  if (!d.allowed) {
    const terminal = order.payment_state === 'REFUNDED' || order.payment_state === 'FAILED' || order.payment_state === 'DISPUTED';
    setJobState(ctx, job.job_id, terminal ? 'REJECTED' : 'QUEUED', d.rule, terminal ? 0 : 60_000);
    return { ...base, outcome: 'BLOCKED', detail: d.rule };
  }
  // 161: Fehlt eine benötigte Kundendatei oder ein Zugang, pausiert die Produktion – keine Ersatz- oder Fantasiedaten.
  const assets = assetGate(ctx, order.order_id);
  if (!assets.ready) {
    setJobState(ctx, job.job_id, 'QUEUED', 'ASSET_MISSING', 15 * 60_000);
    return { ...base, outcome: 'BLOCKED', detail: `ASSET_MISSING: ${assets.missing.join(', ').slice(0, 200)}` };
  }
  const route = routeCapability(opp.capability_id ?? '');
  if (!route.ok) {
    setJobState(ctx, job.job_id, 'HUMAN_REVIEW', route.reason);
    tryTransition(ctx, opp.opportunity_id, 'MANUAL_REVIEW', 'system', route.reason);
    markNotDeliverable(ctx, order.order_id, route.reason.slice(0, 200));
    return { ...base, outcome: 'BLOCKED', detail: route.reason };
  }
  const cap = route.capability;
  if (cap.complexity(scope) > cap.max_complexity) {
    setJobState(ctx, job.job_id, 'BLOCKED_CAPACITY', 'MAX_COMPLEXITY_EXCEEDED');
    tryTransition(ctx, opp.opportunity_id, 'NO_CAPACITY', 'system', 'Ressourcengrenze erreicht – keine Rechnung riskieren');
    return { ...base, outcome: 'NO_CAPACITY' };
  }

  tryTransition(ctx, opp.opportunity_id, 'IN_PRODUCTION', 'system', `Job ${job.job_id}`);
  setFulfillmentState(ctx, order.order_id, 'IN_PRODUCTION');
  let bytes: Uint8Array;
  try {
    hooks.beforeGenerate?.(job);
    bytes = cap.generate(scope);
  } catch (e) {
    const state = failJob(ctx, job.job_id, (e as Error).message);
    tryTransition(ctx, opp.opportunity_id, 'PRODUCTION_QUEUED', 'system', 'Generierung fehlgeschlagen – Retry');
    setFulfillmentState(ctx, order.order_id, 'QUEUED');
    if (state === 'DEAD_LETTER') {
      tryTransition(ctx, opp.opportunity_id, 'MANUAL_REVIEW', 'system', 'Dead-Letter erreicht');
      markNotDeliverable(ctx, order.order_id, `Herstellung wiederholt fehlgeschlagen: ${(e as Error).message.slice(0, 160)}`);
    }
    return { ...base, outcome: state === 'DEAD_LETTER' ? 'DEAD_LETTER' : 'RETRY', detail: (e as Error).message };
  }
  const original = bytes;
  const artifact = storeArtifact(ctx, {
    orderId: order.order_id,
    capabilityId: cap.capability_id,
    capabilityVersion: cap.version,
    bytes,
    mediaType: cap.output_schema.media_type,
    extension: cap.output_schema.extension,
    rights: { origin: 'own_work', generator: `${cap.capability_id}@${cap.version}`, third_party_assets: [], customer_license: 'Einfaches, zeitlich unbegrenztes Nutzungsrecht für den Kunden (Entwurf, Rechtsprüfung M3).' },
  });
  if (hooks.mutateBytes) bytes = hooks.mutateBytes(bytes);
  const checks: QaCheckResult[] = cap.runQa(bytes, scope);
  const readBack = readVerifiedArtifact(ctx, artifact.artifact_id);
  checks.push({ check: 'checksum', passed: readBack.ok && sha256Hex(bytes) === sha256Hex(original), detail: readBack.ok ? artifact.sha256 : readBack.reason });
  checks.push(acceptanceGate(cap.capability_id, checks)); // Premium-Produktstandard: alle Abnahmekriterien ausgeführt und bestanden
  const passed = checks.every((c) => c.passed);
  ctx.db.run('INSERT INTO qa_runs (qa_run_id, artifact_id, passed, results_json, created_at) VALUES (?, ?, ?, ?, ?)', newId('qa'), artifact.artifact_id, passed ? 1 : 0, JSON.stringify(checks), ctx.clock().toISOString());
  ctx.audit.record({ type: passed ? 'qa.passed' : 'qa.failed', actor: 'system', subjectType: 'order', subjectId: order.order_id, data: { artifact_id: artifact.artifact_id, checks }, testMode: ctx.config.testMode });

  if (!passed) {
    setFulfillmentState(ctx, order.order_id, 'QA_FAILED');
    tryTransition(ctx, opp.opportunity_id, 'QA_FAILED', 'system', 'QA fehlgeschlagen – Lieferung blockiert');
    const state = failJob(ctx, job.job_id, 'QA_FAILED');
    if (state === 'DEAD_LETTER') {
      tryTransition(ctx, opp.opportunity_id, 'MANUAL_REVIEW', 'system', 'QA wiederholt fehlgeschlagen');
      markNotDeliverable(ctx, order.order_id, `Abnahmekriterien nicht erfüllt: ${checks.filter((c) => !c.passed).map((c) => c.check).join(', ')}`);
    }
    return { ...base, outcome: 'QA_FAILED', detail: checks.filter((c) => !c.passed).map((c) => c.check).join(',') };
  }
  setFulfillmentState(ctx, order.order_id, 'QA_PASSED');
  tryTransition(ctx, opp.opportunity_id, 'QA_PASSED', 'system', 'Alle QA-Checks bestanden');
  try {
    releaseDelivery(ctx, order.order_id, artifact.artifact_id);
  } catch (e) {
    if (!(e instanceof WorkflowError)) throw e;
    // Lieferung blockiert (z. B. fehlende Vertragsbestätigung, Notstopp): nicht abstürzen, sondern zur Eigentümerprüfung.
    setJobState(ctx, job.job_id, 'HUMAN_REVIEW', e.message.slice(0, 200));
    tryTransition(ctx, opp.opportunity_id, 'MANUAL_REVIEW', 'system', e.message.slice(0, 200));
    return { ...base, outcome: 'BLOCKED', detail: e.code };
  }
  completeJob(ctx, job.job_id);
  return { ...base, outcome: 'DELIVERED' };
}
