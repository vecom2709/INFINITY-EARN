import { evaluate, STOP_NAMES, type ActionRequest, type Actor, type Decision, type EngineContext, type StopName } from '../../../packages/policies/src/engine.ts';
import { mostRestrictive, parsePolicyJson, validatePolicy, type Policy } from '../../../packages/policies/src/policy.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';

/** Legt beim ersten Start die Env-Policy als Version 1 an (Eigentümer-Konfiguration). */
export function bootstrapPolicy(ctx: AppContext): void {
  const active = ctx.db.get<{ version: number }>(`SELECT version FROM policy_versions WHERE status = 'ACTIVE'`);
  if (active) return;
  const any = ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM policy_versions');
  if (any && any.n > 0) return; // Policies existieren, aber keine aktiv -> bewusst blockiert lassen.
  const now = ctx.clock().toISOString();
  ctx.db.run(
    `INSERT INTO policy_versions (version, policy_json, status, proposed_by, approved_by, created_at, approved_at)
     VALUES (1, ?, 'ACTIVE', 'owner:env-bootstrap', 'owner:env-bootstrap', ?, ?)`,
    JSON.stringify(ctx.config.policy),
    now,
    now,
  );
  ctx.audit.record({ type: 'policy.bootstrapped', actor: 'system', subjectType: 'policy', subjectId: '1', data: ctx.config.policy, testMode: ctx.config.testMode });
}

export function activeDbPolicy(ctx: AppContext): Policy | null {
  const row = ctx.db.get<{ policy_json: string }>(`SELECT policy_json FROM policy_versions WHERE status = 'ACTIVE'`);
  return row ? parsePolicyJson(row.policy_json) : null;
}

/** Wirksame Policy = strengste Kombination aus freigegebener DB-Policy und Env. Keine DB-Policy -> null (alles blockiert). */
export function effectivePolicy(ctx: AppContext): Policy | null {
  const db = activeDbPolicy(ctx);
  return db ? mostRestrictive(db, ctx.config.policy) : null;
}

export function proposePolicy(ctx: AppContext, policy: Policy, proposedBy: Actor): number {
  const problems = validatePolicy(policy);
  if (problems.length > 0) throw new WorkflowError('POLICY_INVALID', problems.join('; '));
  const next = (ctx.db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM policy_versions')?.v ?? 0) + 1;
  ctx.db.run(
    `INSERT INTO policy_versions (version, policy_json, status, proposed_by, created_at) VALUES (?, ?, 'PROPOSED', ?, ?)`,
    next,
    JSON.stringify(policy),
    proposedBy,
    ctx.clock().toISOString(),
  );
  ctx.audit.record({ type: 'policy.proposed', actor: proposedBy, subjectType: 'policy', subjectId: String(next), data: policy, testMode: ctx.config.testMode });
  return next;
}

/** Neue Policy wird erst nach Eigentümer-Freigabe wirksam (IE-008). */
export function approvePolicy(ctx: AppContext, version: number, approver: Actor): void {
  if (approver !== 'owner') {
    ctx.audit.record({ type: 'policy.approval_denied', actor: approver, subjectType: 'policy', subjectId: String(version), testMode: ctx.config.testMode });
    throw new WorkflowError('OWNER_APPROVAL_REQUIRED', 'Nur der Eigentümer kann eine Policy freigeben.');
  }
  ctx.db.tx(() => {
    const row = ctx.db.get<{ status: string }>('SELECT status FROM policy_versions WHERE version = ?', version);
    if (!row || row.status !== 'PROPOSED') throw new WorkflowError('POLICY_NOT_PROPOSED');
    ctx.db.run(`UPDATE policy_versions SET status = 'SUPERSEDED' WHERE status = 'ACTIVE'`);
    ctx.db.run(`UPDATE policy_versions SET status = 'ACTIVE', approved_by = ?, approved_at = ? WHERE version = ?`, approver, ctx.clock().toISOString(), version);
  });
  ctx.audit.record({ type: 'policy.approved', actor: approver, subjectType: 'policy', subjectId: String(version), testMode: ctx.config.testMode });
}

export function activeStops(ctx: AppContext): Set<StopName> {
  const rows = ctx.db.all<{ stop: StopName }>('SELECT stop FROM emergency_stops WHERE active = 1');
  return new Set(rows.map((r) => r.stop));
}

export function setStop(ctx: AppContext, stop: StopName, active: boolean, actor: Actor): void {
  if (!(STOP_NAMES as readonly string[]).includes(stop)) throw new WorkflowError('UNKNOWN_STOP');
  if (actor !== 'owner') throw new WorkflowError('OWNER_REQUIRED', 'Notstopps schaltet nur der Eigentümer.');
  ctx.db.run('UPDATE emergency_stops SET active = ?, changed_by = ?, changed_at = ? WHERE stop = ?', active ? 1 : 0, actor, ctx.clock().toISOString(), stop);
  ctx.audit.record({ type: active ? 'stop.activated' : 'stop.released', actor, subjectType: 'stop', subjectId: stop, testMode: ctx.config.testMode });
}

export function engineContext(ctx: AppContext, actor: Actor): EngineContext {
  return { policy: effectivePolicy(ctx), stops: activeStops(ctx), actor };
}

/** Policy-Entscheidung + Audit-Eintrag. Jede Ablehnung wird protokolliert. */
export function decide(ctx: AppContext, req: ActionRequest, actor: Actor, subject?: { type: string; id: string }): Decision {
  const decision = evaluate(req, engineContext(ctx, actor));
  ctx.audit.record({
    type: decision.allowed ? 'policy.allowed' : 'policy.denied',
    actor,
    subjectType: subject?.type ?? 'action',
    subjectId: subject?.id ?? req.action,
    data: { action: req.action, rule: decision.rule, reason: decision.reason },
    testMode: ctx.config.testMode,
  });
  return decision;
}
