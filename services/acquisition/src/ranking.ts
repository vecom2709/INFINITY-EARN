import { TERMINAL_STATES, type OpportunityState } from '../../../packages/contracts/src/states.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { routeCapability } from '../../product-factory/src/registry.ts';

export interface RankedOpportunity {
  kind: 'tender' | 'inbound';
  opportunityId: string | null;
  title: string;
  url: string | null;
  buyer: string | null;
  deadline: string | null;
  fit: number;
  evidence: number;
  risk: number;
  total: number;
  relevant: boolean;
  reasons: string[];
  state: OpportunityState | null;
}

/**
 * Opportunity-Ranking über alle Quellen: Inbound-Anfragen (belegter Kaufwunsch über eigenes
 * Formular) und abgerufene öffentliche Ausschreibungen. Sortiert nach Gesamtpunktzahl.
 */
export function rankOpportunities(ctx: AppContext, limit = 20): RankedOpportunity[] {
  const t = ctx.config.testMode ? 1 : 0;
  const tenders = ctx.db.all<{
    title: string; url: string; buyer: string | null; deadline_at: string | null; fit_score: number; evidence_score: number; risk_score: number;
    total_score: number; relevant: number; score_reasons_json: string; opportunity_id: string | null; pipeline_state: OpportunityState | null;
  }>(
    `SELECT s.title, s.url, s.buyer, s.deadline_at, s.fit_score, s.evidence_score, s.risk_score, s.total_score, s.relevant, s.score_reasons_json,
            o.opportunity_id, o.pipeline_state
     FROM source_items s LEFT JOIN opportunities o ON o.lead_id = s.lead_id
     ORDER BY s.relevant DESC, s.total_score DESC LIMIT ?`,
    limit,
  ).map<RankedOpportunity>((r) => ({
    kind: 'tender', opportunityId: r.opportunity_id, title: r.title, url: r.url, buyer: r.buyer, deadline: r.deadline_at,
    fit: r.fit_score, evidence: r.evidence_score, risk: r.risk_score, total: r.total_score, relevant: r.relevant === 1,
    reasons: JSON.parse(r.score_reasons_json) as string[], state: r.pipeline_state,
  }));

  const inbound = ctx.db.all<{ opportunity_id: string; capability_id: string | null; pipeline_state: OpportunityState; name: string | null; company: string | null }>(
    `SELECT o.opportunity_id, o.capability_id, o.pipeline_state, l.name, l.company FROM opportunities o JOIN leads l ON l.lead_id = o.lead_id
     WHERE l.source_id = 'src_inbound_form' AND o.test_mode = ? ORDER BY o.created_at DESC LIMIT ?`,
    t, limit,
  ).filter((o) => !TERMINAL_STATES.has(o.pipeline_state) && ['SOURCE_COMPLIANT', 'QUALIFIED', 'FEASIBILITY_APPROVED', 'QUOTED', 'MANUAL_REVIEW'].includes(o.pipeline_state))
    .map<RankedOpportunity>((o) => {
      const cap = o.capability_id ? routeCapability(o.capability_id) : { ok: false as const, reason: 'keine Produktklasse' };
      const fit = cap.ok ? 100 : 0;
      const evidence = 100;
      const risk = o.pipeline_state === 'MANUAL_REVIEW' ? 60 : 10;
      return {
        kind: 'inbound', opportunityId: o.opportunity_id, title: `Anfrage ${o.company ?? o.name ?? ''}`.trim(), url: null, buyer: o.company, deadline: null,
        fit, evidence, risk, total: Math.round(fit * 0.5 + evidence * 0.4 - risk * 0.1), relevant: cap.ok,
        reasons: ['Direkte Anfrage über eigenes Formular (Kaufwunsch belegt)', cap.ok ? 'Produktklasse aktiv' : `Produktklasse: ${cap.ok ? '' : cap.reason}`],
        state: o.pipeline_state,
      };
    });

  return [...inbound, ...tenders].sort((a, b) => Number(b.relevant) - Number(a.relevant) || b.total - a.total).slice(0, limit);
}
