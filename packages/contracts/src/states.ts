/** Verbindliche Pipeline-Zustandsmaschine (Masterprompt §3). */
export const PIPELINE_STATES = [
  'DISCOVERED',
  'SOURCE_COMPLIANT',
  'QUALIFIED',
  'FEASIBILITY_APPROVED',
  'QUOTED',
  'CUSTOMER_ACCEPTED',
  'PAYMENT_CONFIRMED',
  'PRODUCTION_QUEUED',
  'IN_PRODUCTION',
  'QA_PASSED',
  'DELIVERED',
  'INVOICE_RECORDED',
  'LEDGER_RECONCILED',
  'PAYOUT_RECORDED',
  'CLOSED',
] as const;

export const SIDE_STATES = [
  'UNAUTHORIZED_SOURCE',
  'CONSENT_MISSING',
  'OUT_OF_SCOPE',
  'LICENCE_RISK',
  'NO_CAPACITY',
  'COST_LIMIT',
  'PAYMENT_FAILED',
  'CANCELLED',
  'QA_FAILED',
  'REFUND_PENDING',
  'DISPUTE',
  'TAX_REVIEW',
  'MANUAL_REVIEW',
] as const;

export type PipelineState = (typeof PIPELINE_STATES)[number];
export type SideState = (typeof SIDE_STATES)[number];
export type OpportunityState = PipelineState | SideState;
export type TransitionActor = 'system' | 'ai' | 'owner' | 'customer' | 'provider';

export const ALL_STATES: readonly OpportunityState[] = [...PIPELINE_STATES, ...SIDE_STATES];

export const TERMINAL_STATES: ReadonlySet<OpportunityState> = new Set<OpportunityState>([
  'CLOSED',
  'CANCELLED',
  'UNAUTHORIZED_SOURCE',
  'CONSENT_MISSING',
  'OUT_OF_SCOPE',
  'LICENCE_RISK',
  'COST_LIMIT',
]);

const POST_PAYMENT: readonly OpportunityState[] = [
  'PAYMENT_CONFIRMED',
  'PRODUCTION_QUEUED',
  'IN_PRODUCTION',
  'QA_PASSED',
  'DELIVERED',
  'INVOICE_RECORDED',
  'LEDGER_RECONCILED',
  'PAYOUT_RECORDED',
  'QA_FAILED',
  'NO_CAPACITY',
  'TAX_REVIEW',
];

function buildSideTransitions(): Map<OpportunityState, Set<OpportunityState>> {
  const m = new Map<OpportunityState, Set<OpportunityState>>();
  const add = (from: OpportunityState, ...to: OpportunityState[]): void => {
    const set = m.get(from) ?? new Set<OpportunityState>();
    to.forEach((t) => set.add(t));
    m.set(from, set);
  };
  add('DISCOVERED', 'UNAUTHORIZED_SOURCE', 'CONSENT_MISSING', 'MANUAL_REVIEW', 'CANCELLED');
  add('SOURCE_COMPLIANT', 'OUT_OF_SCOPE', 'MANUAL_REVIEW', 'CANCELLED');
  add('QUALIFIED', 'OUT_OF_SCOPE', 'LICENCE_RISK', 'NO_CAPACITY', 'COST_LIMIT', 'MANUAL_REVIEW', 'CANCELLED');
  add('FEASIBILITY_APPROVED', 'COST_LIMIT', 'MANUAL_REVIEW', 'CANCELLED');
  add('QUOTED', 'MANUAL_REVIEW', 'CANCELLED');
  add('CUSTOMER_ACCEPTED', 'PAYMENT_FAILED', 'MANUAL_REVIEW', 'CANCELLED');
  add('PAYMENT_FAILED', 'CUSTOMER_ACCEPTED', 'CANCELLED');
  add('PRODUCTION_QUEUED', 'NO_CAPACITY');
  add('IN_PRODUCTION', 'QA_FAILED', 'PRODUCTION_QUEUED', 'NO_CAPACITY');
  add('NO_CAPACITY', 'PRODUCTION_QUEUED', 'CANCELLED');
  add('QA_FAILED', 'IN_PRODUCTION');
  add('DELIVERED', 'TAX_REVIEW');
  add('TAX_REVIEW', 'INVOICE_RECORDED');
  add('REFUND_PENDING', 'CANCELLED', 'DISPUTE', 'MANUAL_REVIEW');
  add('DISPUTE', 'CANCELLED', 'CLOSED', 'MANUAL_REVIEW');
  for (const s of POST_PAYMENT) add(s, 'DISPUTE', 'REFUND_PENDING', 'MANUAL_REVIEW');
  return m;
}

const SIDE_TRANSITIONS = buildSideTransitions();

export function allowedTargets(from: OpportunityState): OpportunityState[] {
  const idx = (PIPELINE_STATES as readonly string[]).indexOf(from);
  const next: OpportunityState[] = idx >= 0 && idx < PIPELINE_STATES.length - 1 ? [PIPELINE_STATES[idx + 1] as PipelineState] : [];
  return [...next, ...(SIDE_TRANSITIONS.get(from) ?? [])];
}

export interface TransitionCheck {
  ok: boolean;
  reason?: string;
}

export function canTransition(from: OpportunityState, to: OpportunityState, actor: TransitionActor): TransitionCheck {
  if (to === 'PAYMENT_CONFIRMED' && actor !== 'provider') {
    return { ok: false, reason: 'PAYMENT_CONFIRMATION_REQUIRES_VERIFIED_PROVIDER_EVENT' };
  }
  if (TERMINAL_STATES.has(from)) return { ok: false, reason: `TERMINAL_STATE:${from}` };
  if (from === 'MANUAL_REVIEW') {
    return actor === 'owner' ? { ok: true } : { ok: false, reason: 'MANUAL_REVIEW_REQUIRES_OWNER' };
  }
  return allowedTargets(from).includes(to) ? { ok: true } : { ok: false, reason: `INVALID_TRANSITION:${from}->${to}` };
}

export function isOpportunityState(v: string): v is OpportunityState {
  return (ALL_STATES as readonly string[]).includes(v);
}
