import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { hasControlChars } from '../../../packages/shared/src/text.ts';
import { TERMINAL_STATES, type OpportunityState } from '../../../packages/contracts/src/states.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { transition } from '../../core-api/src/opportunities.ts';
import { activeStops } from '../../core-api/src/policy-store.ts';
import { checkSourceCompliance, getSource } from './sources.ts';

export interface InboundRequest {
  capabilityId: string;
  scope: unknown;
}

export interface InboundLeadInput {
  name: string;
  email: string;
  company: string | null;
  country: string;
  message: string;
  privacyAccepted: boolean;
  marketingConsent: boolean;
  request: InboundRequest | null;
}

const NAME = /^[\p{L}\p{M}\p{N} .,'&()\-/]{1,200}$/u;
const EMAIL = /^[^\s@<>"'(),;:]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;

/** Strenge Eingabevalidierung (IE-088). Freitext wird nur gespeichert und beim Rendern escaped. */
export function validateInboundLead(raw: unknown): { ok: true; value: InboundLeadInput } | { ok: false; errors: string[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const s = (k: string): string => (typeof r[k] === 'string' ? (r[k] as string).trim() : '');
  const name = s('name');
  const email = s('email').toLowerCase();
  const company = s('company');
  const country = s('country').toUpperCase();
  const message = s('message');
  for (const [k, v] of Object.entries({ name, email, company, country, message })) {
    if (hasControlChars(v)) errors.push(`${k}: unzulässige Steuerzeichen`);
  }
  if (!NAME.test(name)) errors.push('name: ungültig (keine Sonderzeichen wie < > " ;)');
  if (company && !NAME.test(company)) errors.push('company: ungültig');
  if (!EMAIL.test(email) || email.length > 254) errors.push('email: ungültig');
  if (!/^[A-Z]{2}$/.test(country)) errors.push('country: ISO-Code mit 2 Buchstaben erwartet');
  if (message.length < 1 || message.length > 5000) errors.push('message: 1–5000 Zeichen');
  if (r.privacyAccepted !== true) errors.push('privacyAccepted: Datenschutzhinweis muss bestätigt werden');
  let request: InboundRequest | null = null;
  if (r.request !== undefined && r.request !== null) {
    const q = r.request as Record<string, unknown>;
    if (typeof q.capabilityId !== 'string' || !/^[a-z0-9-]{1,60}$/.test(q.capabilityId)) errors.push('request.capabilityId: ungültig');
    else request = { capabilityId: q.capabilityId, scope: q.scope ?? null };
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, email, company: company || null, country, message, privacyAccepted: true, marketingConsent: r.marketingConsent === true, request },
  };
}

function createOpportunity(ctx: AppContext, leadId: string, request: InboundRequest | null): string {
  const id = newId('opp');
  const now = ctx.clock().toISOString();
  const scopeJson = request ? JSON.stringify(request.scope ?? null) : null;
  ctx.db.run(
    `INSERT INTO opportunities (opportunity_id, lead_id, capability_id, scope_json, scope_hash, pipeline_state, test_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'DISCOVERED', ?, ?, ?)`,
    id, leadId, request?.capabilityId ?? null, scopeJson, scopeJson ? sha256Hex(`${request?.capabilityId}:${scopeJson}`) : null, ctx.config.testMode ? 1 : 0, now, now,
  );
  return id;
}

function addConsent(ctx: AppContext, leadId: string, purpose: 'marketing_email' | 'transactional', proof: string): void {
  ctx.db.run(
    'INSERT INTO consents (consent_id, lead_id, purpose, proof_ref, granted_at, test_mode) VALUES (?, ?, ?, ?, ?, ?)',
    newId('cns'), leadId, purpose, proof, ctx.clock().toISOString(), ctx.config.testMode ? 1 : 0,
  );
}

/**
 * Inbound-Anfrage über das eigene Formular (Priorität 2, ohne Consent-Fälschung – IE-013).
 * Ein Kontaktprofil pro E-Mail (IE-017); identische Anfrage erzeugt keine zweite Opportunity.
 */
export function submitInboundLead(ctx: AppContext, input: InboundLeadInput, evidence: { ipHash: string }): { leadId: string; opportunityId: string; duplicate: boolean } {
  const stops = activeStops(ctx);
  if (stops.has('PAUSE_ACQUISITION') || stops.has('STOP_ALL_JOBS')) throw new WorkflowError('ACQUISITION_PAUSED', 'Annahme neuer Anfragen ist pausiert.');
  const t = ctx.config.testMode ? 1 : 0;
  const emailHash = sha256Hex(input.email.toLowerCase());
  const now = ctx.clock().toISOString();

  return ctx.db.tx(() => {
    const existing = ctx.db.get<{ lead_id: string }>('SELECT lead_id FROM leads WHERE email_hash = ? AND test_mode = ?', emailHash, t);
    if (existing) {
      if (input.marketingConsent) {
        const has = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM consents WHERE lead_id = ? AND purpose = 'marketing_email' AND withdrawn_at IS NULL`, existing.lead_id);
        if (!has?.n) {
          addConsent(ctx, existing.lead_id, 'marketing_email', `form:${existing.lead_id}:${now}:${evidence.ipHash}`);
          ctx.db.run('UPDATE leads SET marketing_opt_out = 0, consent_proof_ref = ? WHERE lead_id = ?', `form:${existing.lead_id}:${now}`, existing.lead_id);
        }
      }
      const scopeJson = input.request ? JSON.stringify(input.request.scope ?? null) : null;
      const scopeHash = scopeJson ? sha256Hex(`${input.request?.capabilityId}:${scopeJson}`) : null;
      const open = ctx.db
        .all<{ opportunity_id: string; pipeline_state: OpportunityState; scope_hash: string | null }>('SELECT opportunity_id, pipeline_state, scope_hash FROM opportunities WHERE lead_id = ? ORDER BY created_at DESC', existing.lead_id)
        .find((o) => !TERMINAL_STATES.has(o.pipeline_state) && o.scope_hash === scopeHash);
      ctx.audit.record({ type: 'lead.duplicate', actor: 'customer', subjectType: 'lead', subjectId: existing.lead_id, testMode: ctx.config.testMode });
      if (open) return { leadId: existing.lead_id, opportunityId: open.opportunity_id, duplicate: true };
      const oppId = createOpportunity(ctx, existing.lead_id, input.request);
      transition(ctx, oppId, 'SOURCE_COMPLIANT', 'system', 'Eigenes Inbound-Formular');
      return { leadId: existing.lead_id, opportunityId: oppId, duplicate: true };
    }

    const src = getSource(ctx, 'src_inbound_form');
    const compliance = checkSourceCompliance(src, ctx.clock());
    if (!compliance.ok) throw new WorkflowError('SOURCE_NOT_COMPLIANT', compliance.reason);
    const leadId = newId('lead');
    const consentRef = input.marketingConsent ? `form:${leadId}:${now}` : null;
    ctx.db.run(
      `INSERT INTO leads (lead_id, source_id, source_url, source_terms_checked, contact_legal_basis, consent_proof_ref, buyer_signal, purchase_intent_evidence,
         intent_verified, email, email_hash, name, company, country, message, status, test_mode, created_at)
       VALUES (?, 'src_inbound_form', ?, 1, 'permitted_inbound', ?, 'inbound_request', ?, 1, ?, ?, ?, ?, ?, ?, 'SOURCE_COMPLIANT', ?, ?)`,
      leadId, `${ctx.config.publicOrigin}/anfrage`, consentRef, `inbound_form_submission:${now}:${evidence.ipHash}`,
      input.email, emailHash, input.name, input.company, input.country, input.message, t, now,
    );
    addConsent(ctx, leadId, 'transactional', `form:${leadId}:${now}:${evidence.ipHash}`);
    if (input.marketingConsent) addConsent(ctx, leadId, 'marketing_email', `form:${leadId}:${now}:${evidence.ipHash}`);
    const oppId = createOpportunity(ctx, leadId, input.request);
    transition(ctx, oppId, 'SOURCE_COMPLIANT', 'system', 'Eigenes Inbound-Formular');
    ctx.audit.record({ type: 'lead.received', actor: 'customer', subjectType: 'lead', subjectId: leadId, data: { opportunity_id: oppId, marketing_consent: input.marketingConsent }, testMode: ctx.config.testMode });
    return { leadId, opportunityId: oppId, duplicate: false };
  });
}

export interface SourceItem {
  url: string;
  title: string;
  text: string;
  structuredIntent: { kind: 'public_tender' | 'platform_api_request'; reference: string } | null;
  expiresAt: string | null;
  request: InboundRequest | null;
}

/**
 * Lead aus einer externen, freigegebenen Quelle (Priorität 1). Kaufabsicht gilt nur über
 * strukturierte Nachweise der Quelle, nie über Behauptungen im Freitext (IE-011, IE-012, IE-020).
 * Kein Kontaktkanal (contact_legal_basis = none): Antwort nur über den offiziellen Kanal der Quelle.
 */
export function ingestSourceItem(ctx: AppContext, sourceId: string, item: SourceItem): { leadId: string; opportunityId: string; intentVerified: boolean } {
  const stops = activeStops(ctx);
  if (stops.has('PAUSE_ACQUISITION') || stops.has('STOP_ALL_JOBS')) throw new WorkflowError('ACQUISITION_PAUSED');
  const src = getSource(ctx, sourceId);
  const compliance = checkSourceCompliance(src, ctx.clock());
  if (!compliance.ok) {
    ctx.audit.record({ type: 'source.blocked', actor: 'system', subjectType: 'source', subjectId: sourceId, data: { reason: compliance.reason, url: item.url }, testMode: ctx.config.testMode });
    throw new WorkflowError('SOURCE_NOT_COMPLIANT', compliance.reason);
  }
  if (!item.url.startsWith(src.base_url)) throw new WorkflowError('URL_OUTSIDE_SOURCE');
  const intentVerified = !!item.structuredIntent && item.structuredIntent.reference.trim().length > 0;
  const claimsIntent = /(kauf|buy|order|bestell|purchase|acquist)/i.test(item.text);
  const now = ctx.clock().toISOString();
  const leadId = newId('lead');
  ctx.db.run(
    `INSERT INTO leads (lead_id, source_id, source_url, source_terms_checked, contact_legal_basis, buyer_signal, purchase_intent_evidence, intent_verified,
       name, message, status, expires_at, test_mode, created_at)
     VALUES (?, ?, ?, 1, 'none', ?, ?, ?, ?, ?, 'SOURCE_COMPLIANT', ?, ?, ?)`,
    leadId, sourceId, item.url,
    intentVerified ? item.structuredIntent?.kind ?? null : claimsIntent ? 'unverified_text_claim' : 'none',
    intentVerified ? `${item.structuredIntent?.kind}:${item.structuredIntent?.reference}` : null,
    intentVerified ? 1 : 0, item.title.slice(0, 200), item.text.slice(0, 5000), item.expiresAt, ctx.config.testMode ? 1 : 0, now,
  );
  const oppId = createOpportunity(ctx, leadId, item.request);
  transition(ctx, oppId, 'SOURCE_COMPLIANT', 'system', `Quelle ${sourceId} konform`);
  ctx.audit.record({ type: 'lead.ingested', actor: 'system', subjectType: 'lead', subjectId: leadId, data: { source_id: sourceId, source_url: item.url, intent_verified: intentVerified }, testMode: ctx.config.testMode });
  return { leadId, opportunityId: oppId, intentVerified };
}

/** Lead im Vertragsformat (packages/contracts lead.schema.json). */
export function leadContract(ctx: AppContext, leadId: string): Record<string, unknown> {
  const l = ctx.db.get<Record<string, unknown>>('SELECT * FROM leads WHERE lead_id = ?', leadId);
  if (!l) throw new WorkflowError('LEAD_NOT_FOUND');
  return {
    lead_id: l.lead_id,
    source_url: l.source_url,
    source_terms_checked: l.source_terms_checked === 1,
    contact_legal_basis: l.contact_legal_basis,
    consent_proof_ref: l.consent_proof_ref ?? null,
    buyer_signal: l.buyer_signal ?? '',
    status: l.status,
  };
}
