import { canTransition, type OpportunityState, type TransitionActor } from '../../../packages/contracts/src/states.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';

export interface OpportunityRow {
  opportunity_id: string;
  lead_id: string;
  capability_id: string | null;
  scope_json: string | null;
  scope_hash: string | null;
  open_points_json: string | null;
  pipeline_state: OpportunityState;
  state_reason: string | null;
  estimated_cost_minor: number | null;
  currency: string | null;
  test_mode: number;
  created_at: string;
  updated_at: string;
}

export function getOpportunity(ctx: AppContext, id: string): OpportunityRow {
  const row = ctx.db.get<OpportunityRow>('SELECT * FROM opportunities WHERE opportunity_id = ?', id);
  if (!row) throw new WorkflowError('OPPORTUNITY_NOT_FOUND');
  return row;
}

/** Einziger Weg, den Pipeline-Zustand zu ändern: geprüft, protokolliert, append-only Historie. */
export function transition(ctx: AppContext, id: string, to: OpportunityState, actor: TransitionActor, reason: string): OpportunityRow {
  return ctx.db.tx(() => {
    const opp = getOpportunity(ctx, id);
    const check = canTransition(opp.pipeline_state, to, actor);
    if (!check.ok) throw new WorkflowError('INVALID_TRANSITION', check.reason);
    const now = ctx.clock().toISOString();
    ctx.db.run('UPDATE opportunities SET pipeline_state = ?, state_reason = ?, updated_at = ? WHERE opportunity_id = ?', to, reason, now, id);
    ctx.db.run(
      'INSERT INTO state_transitions (opportunity_id, from_state, to_state, actor, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      opp.pipeline_state,
      to,
      actor,
      reason,
      now,
    );
    ctx.audit.record({
      type: 'opportunity.state_changed',
      actor,
      subjectType: 'opportunity',
      subjectId: id,
      data: { from: opp.pipeline_state, to, reason },
      testMode: opp.test_mode === 1,
    });
    return { ...opp, pipeline_state: to, state_reason: reason, updated_at: now };
  });
}

/** Wie transition(), aber ohne Ausnahme, falls der Übergang nicht erlaubt ist. */
export function tryTransition(ctx: AppContext, id: string, to: OpportunityState, actor: TransitionActor, reason: string): boolean {
  const opp = getOpportunity(ctx, id);
  if (opp.pipeline_state === to) return true;
  if (!canTransition(opp.pipeline_state, to, actor).ok) return false;
  transition(ctx, id, to, actor, reason);
  return true;
}
