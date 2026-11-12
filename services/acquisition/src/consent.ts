import type { Decision, LegalBasis } from '../../../packages/policies/src/engine.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { decide } from '../../core-api/src/policy-store.ts';

interface LeadContactRow {
  lead_id: string;
  contact_legal_basis: LegalBasis;
  marketing_opt_out: number;
  processing_restricted: number;
  erased_at: string | null;
}

/**
 * Darf dieser Lead kontaktiert werden? Marketing nur mit gültiger, nicht widerrufener Einwilligung
 * (IE-014, IE-015, IE-016). Automatisierte Werbung zusätzlich nur mit AUTO_MARKETING_OUTREACH.
 * M0 versendet selbst KEINE E-Mails – dies ist die verbindliche Vorab-Entscheidung.
 */
export function contactDecision(ctx: AppContext, leadId: string, purpose: 'marketing' | 'transactional', automated: boolean): Decision {
  const lead = ctx.db.get<LeadContactRow>('SELECT lead_id, contact_legal_basis, marketing_opt_out, processing_restricted, erased_at FROM leads WHERE lead_id = ?', leadId);
  if (!lead) throw new WorkflowError('LEAD_NOT_FOUND');
  if (lead.erased_at || lead.processing_restricted) {
    return decide(ctx, { action: 'lead.contact', purpose, legalBasis: 'none', consentProofRef: null, consentWithdrawn: true, optedOut: true, automated }, automated ? 'ai' : 'owner', { type: 'lead', id: leadId });
  }
  const consent = ctx.db.get<{ proof_ref: string; withdrawn_at: string | null }>(
    `SELECT proof_ref, withdrawn_at FROM consents WHERE lead_id = ? AND purpose = 'marketing_email' ORDER BY granted_at DESC LIMIT 1`,
    leadId,
  );
  const marketingBasis: LegalBasis = consent && !consent.withdrawn_at ? 'consent' : 'none';
  return decide(
    ctx,
    {
      action: 'lead.contact',
      purpose,
      legalBasis: purpose === 'marketing' ? marketingBasis : lead.contact_legal_basis,
      consentProofRef: purpose === 'marketing' ? consent?.proof_ref ?? null : null,
      consentWithdrawn: !!consent?.withdrawn_at,
      optedOut: lead.marketing_opt_out === 1,
      automated,
    },
    automated ? 'ai' : 'owner',
    { type: 'lead', id: leadId },
  );
}

/** Abmeldung: Einwilligung widerrufen, keine weitere Werbung (IE-016). */
export function withdrawMarketingConsent(ctx: AppContext, leadId: string): void {
  const now = ctx.clock().toISOString();
  ctx.db.tx(() => {
    ctx.db.run(`UPDATE consents SET withdrawn_at = ? WHERE lead_id = ? AND purpose = 'marketing_email' AND withdrawn_at IS NULL`, now, leadId);
    ctx.db.run('UPDATE leads SET marketing_opt_out = 1 WHERE lead_id = ?', leadId);
  });
  ctx.audit.record({ type: 'consent.withdrawn', actor: 'customer', subjectType: 'lead', subjectId: leadId, testMode: ctx.config.testMode });
}
