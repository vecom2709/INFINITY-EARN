import { formatMinor, priceFromCost } from '../../../packages/contracts/src/money.ts';
import { newId } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';
import { getOpportunity } from './opportunities.ts';
import { effectivePolicy } from './policy-store.ts';

export interface OfferDraftRow {
  draft_id: string;
  opportunity_id: string;
  content_md: string;
  price_minor: number | null;
  currency: string | null;
  status: 'DRAFT_FOR_REVIEW' | 'APPROVED_FOR_MANUAL_SUBMISSION' | 'REJECTED';
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  test_mode: number;
  created_at: string;
}

/**
 * Angebotsentwurf mit menschlich prüfbaren Nachweisen (Masterprompt M1). Wird NIE automatisch
 * versendet. Für Ausschreibungen erfolgt die Einreichung ausschließlich manuell durch den
 * Eigentümer über das offizielle Vergabeverfahren. Ohne klaren Leistungsumfang kein Preis.
 */
export function generateOfferDraft(ctx: AppContext, opportunityId: string): OfferDraftRow {
  const opp = getOpportunity(ctx, opportunityId);
  const lead = ctx.db.get<{ lead_id: string; source_id: string; source_url: string; name: string | null; message: string | null; purchase_intent_evidence: string | null; contact_legal_basis: string; expires_at: string | null }>(
    'SELECT lead_id, source_id, source_url, name, message, purchase_intent_evidence, contact_legal_basis, expires_at FROM leads WHERE lead_id = ?',
    opp.lead_id,
  );
  if (!lead) throw new WorkflowError('LEAD_NOT_FOUND');
  // 107: abgelaufene Daten nicht als aktuell verwenden – kein Entwurf für eine Ausschreibung nach Fristende.
  if (lead.expires_at && Date.parse(lead.expires_at) < ctx.clock().getTime()) {
    ctx.audit.record({ type: 'offer.draft_blocked_expired', actor: 'system', subjectType: 'opportunity', subjectId: opportunityId, data: { expires_at: lead.expires_at }, testMode: ctx.config.testMode });
    throw new WorkflowError('LEAD_EXPIRED', `Frist am ${lead.expires_at.slice(0, 10)} abgelaufen – kein Angebotsentwurf.`);
  }
  const item = ctx.db.get<{ external_id: string; raw_sha256: string; created_at: string; score_reasons_json: string; total_score: number; fetched_run_id: string }>(
    'SELECT external_id, raw_sha256, created_at, score_reasons_json, total_score, fetched_run_id FROM source_items WHERE lead_id = ?',
    lead.lead_id,
  );
  const policy = effectivePolicy(ctx);
  let price: number | null = null;
  const currency = policy?.quote.currency ?? 'EUR';
  if (opp.capability_id && opp.estimated_cost_minor !== null && policy && opp.pipeline_state === 'FEASIBILITY_APPROVED') {
    price = Math.max(priceFromCost(opp.estimated_cost_minor, policy.quote.minMarginBps), policy.quote.minMinor);
  }
  const openPoints = opp.open_points_json ? (JSON.parse(opp.open_points_json) as string[]) : [];
  const tender = lead.source_id !== 'src_inbound_form';
  const lines = [
    `# Angebotsentwurf – ${ctx.config.testMode ? 'TESTMODUS, ' : ''}nur zur Prüfung`,
    '',
    '> Dieser Entwurf wird nicht automatisch versendet.' + (tender ? ' Einreichung nur manuell durch den Eigentümer über das offizielle Vergabeverfahren, nach Prüfung der Teilnahmebedingungen.' : ''),
    '> LIVE-Verkäufe sind gesperrt, bis die Live-Aktivierungs-Checkliste freigegeben ist.',
    '',
    '## Bedarf (Quelle)',
    `- Titel: ${lead.name ?? '–'}`,
    `- Quelle: ${lead.source_id} · ${lead.source_url}`,
    `- Nachweis der Kaufabsicht: ${lead.purchase_intent_evidence ?? 'keiner'}`,
    item ? `- Bekanntmachung: ${item.external_id} · Rohdaten-SHA-256 ${item.raw_sha256} · abgerufen ${item.created_at} (Lauf ${item.fetched_run_id})` : '',
    lead.expires_at ? `- Frist: ${lead.expires_at.slice(0, 10)}` : '',
    `- Kontaktgrundlage: ${lead.contact_legal_basis}${lead.contact_legal_basis === 'none' ? ' (keine Direktansprache zulässig)' : ''}`,
    '',
    '## Bewertung',
    item ? `- Punktzahl ${item.total_score}: ${(JSON.parse(item.score_reasons_json) as string[]).join('; ')}` : '- Direkte Anfrage über das eigene Formular',
    '',
    '## Leistung',
    `- Produktklasse: ${opp.capability_id ?? 'nicht festgelegt'}`,
    `- Pipeline-Zustand: ${opp.pipeline_state}`,
    openPoints.length ? `- Offene Punkte: ${openPoints.join('; ')}` : '',
    '',
    '## Preis',
    price !== null
      ? `- ${formatMinor(price, currency)} ${currency} (Kosten ${formatMinor(opp.estimated_cost_minor ?? 0, currency)} + Mindestmarge ${(policy?.quote.minMarginBps ?? 0) / 100} %; Steuer nicht berechnet)`
      : '- Kein Preis: Leistungsumfang/Machbarkeit nicht freigegeben. Erst Umfang klären, dann kalkulieren.',
    '',
    '## Vor einer Einreichung zu prüfen (Eigentümer)',
    '- Teilnahmebedingungen, Eignungsnachweise, Formvorschriften und Fristen der Ausschreibung',
    '- Ob die geforderte Leistung tatsächlich mit einer aktiven Produktklasse lieferbar ist',
    '- Rechtliche/steuerliche Freigaben LA-01 … LA-12',
  ].filter((l) => l !== '');
  const row: OfferDraftRow = {
    draft_id: newId('drf'),
    opportunity_id: opportunityId,
    content_md: lines.join('\n') + '\n',
    price_minor: price,
    currency: price !== null ? currency : null,
    status: 'DRAFT_FOR_REVIEW',
    reviewed_by: null,
    review_note: null,
    reviewed_at: null,
    test_mode: ctx.config.testMode ? 1 : 0,
    created_at: ctx.clock().toISOString(),
  };
  ctx.db.run(
    `INSERT INTO offer_drafts (draft_id, opportunity_id, content_md, price_minor, currency, status, test_mode, created_at) VALUES (?, ?, ?, ?, ?, 'DRAFT_FOR_REVIEW', ?, ?)`,
    row.draft_id, row.opportunity_id, row.content_md, row.price_minor, row.currency, row.test_mode, row.created_at,
  );
  ctx.audit.record({ type: 'offer.draft_created', actor: 'system', subjectType: 'opportunity', subjectId: opportunityId, data: { draft_id: row.draft_id, price }, testMode: ctx.config.testMode });
  return row;
}

export function getOfferDraft(ctx: AppContext, draftId: string): OfferDraftRow {
  const d = ctx.db.get<OfferDraftRow>('SELECT * FROM offer_drafts WHERE draft_id = ?', draftId);
  if (!d) throw new WorkflowError('DRAFT_NOT_FOUND');
  return d;
}

/** Prüfentscheidung nur durch den Eigentümer. Freigabe bedeutet: zur MANUELLEN Einreichung – nichts wird versendet. */
export function reviewOfferDraft(ctx: AppContext, draftId: string, decision: 'APPROVED_FOR_MANUAL_SUBMISSION' | 'REJECTED', actor: 'owner' | 'ai' | 'system', note = ''): void {
  if (actor !== 'owner') throw new WorkflowError('OWNER_REQUIRED');
  const d = getOfferDraft(ctx, draftId);
  if (d.status !== 'DRAFT_FOR_REVIEW') throw new WorkflowError('DRAFT_ALREADY_REVIEWED');
  ctx.db.run('UPDATE offer_drafts SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = ? WHERE draft_id = ?', decision, actor, note.slice(0, 500), ctx.clock().toISOString(), draftId);
  ctx.audit.record({ type: 'offer.draft_reviewed', actor, subjectType: 'offer_draft', subjectId: draftId, data: { decision }, testMode: ctx.config.testMode });
}
