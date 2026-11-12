import { newId } from '../../../packages/shared/src/crypto.ts';
import { hasControlChars } from '../../../packages/shared/src/text.ts';
import { submitInboundLead } from '../../acquisition/src/leads.ts';
import type { AppContext } from './context.ts';
import { customerByKey } from './customers.ts';
import { WorkflowError } from './errors.ts';
import { autoProcessOpportunity } from './workflow.ts';

/**
 * 092 Nachtragsangebot: Ein zusätzlicher Wunsch des Kunden zu einem bezahlten Auftrag wird zu einem EIGENEN Angebot
 * (gleiche Produktart, gleicher Aufschlag, nur die neuen Positionen). Es gilt erst nach Annahme und bestätigter Zahlung
 * als beauftragt – der Original-Auftrag bleibt unverändert. Keine stillschweigende Erweiterung.
 */
export interface ChangeRequestResult {
  changeId: string;
  opportunityId: string;
  stage: ReturnType<typeof autoProcessOpportunity>['stage'];
  quote?: { quoteId: string; acceptanceToken: string };
}

export function requestChange(ctx: AppContext, key: string | undefined, originalOrderId: string, items: { name: string; quantity: number; unit_cost_minor: number }[], note: string): ChangeRequestResult {
  const c = customerByKey(ctx, key);
  const o = ctx.db.get<{ customer_id: string; payment_state: string; scope_json: string | null; capability_id: string | null; lead_id: string; test_mode: number }>(
    `SELECT o.customer_id, o.payment_state, op.scope_json, op.capability_id, op.lead_id, o.test_mode FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE o.order_id = ?`, originalOrderId,
  );
  if (!c || !o || o.customer_id !== c.customer_id) throw new WorkflowError('FORBIDDEN');
  if (o.payment_state !== 'CONFIRMED') throw new WorkflowError('ORIGINAL_NOT_PAID', 'Nachträge sind zu bezahlten Aufträgen möglich.');
  if (items.length === 0) throw new WorkflowError('NO_ITEMS', 'Bitte mindestens eine zusätzliche Position angeben.');
  const text = note.trim().slice(0, 1000);
  if (hasControlChars(text)) throw new WorkflowError('INVALID_MESSAGE');
  const lead = ctx.db.get<{ name: string | null; email: string | null; company: string | null; country: string | null }>('SELECT name, email, company, country FROM leads WHERE lead_id = ?', o.lead_id);
  if (!lead?.email) throw new WorkflowError('LEAD_DATA_MISSING');
  const original = JSON.parse(o.scope_json ?? '{}') as { title?: string; currency?: string; margin_bps?: number; language?: string };
  const ref = `IE-${originalOrderId.replace(/^ord_/, '').slice(0, 6).toUpperCase()}`;
  const scope = {
    title: `Nachtrag zu ${ref}${original.title ? `: ${original.title}` : ''}`.slice(0, 200),
    currency: original.currency ?? 'EUR',
    items,
    margin_bps: original.margin_bps ?? 2000,
    language: original.language ?? 'de',
  };
  const lr = submitInboundLead(ctx, {
    name: lead.name ?? c.name ?? 'Kunde', email: lead.email, company: lead.company, country: lead.country ?? c.country ?? 'DE',
    message: `Nachtrag zu ${ref}. ${text}`.trim(), privacyAccepted: true, marketingConsent: false,
    request: { capabilityId: o.capability_id ?? 'b2b-calc-csv', scope },
  }, { ipHash: 'portal-nachtrag' });
  const existing = ctx.db.get<{ change_id: string }>('SELECT change_id FROM change_requests WHERE opportunity_id = ?', lr.opportunityId);
  const changeId = existing?.change_id ?? newId('chg');
  if (!existing) {
    ctx.db.run('INSERT INTO change_requests (change_id, original_order_id, opportunity_id, description, test_mode, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      changeId, originalOrderId, lr.opportunityId, `${items.length} zusätzliche Position(en)${text ? ` – ${text}` : ''}`.slice(0, 1200), o.test_mode, ctx.clock().toISOString());
    ctx.audit.record({ type: 'change.requested', actor: 'customer', subjectType: 'order', subjectId: originalOrderId, data: { change_id: changeId, opportunity_id: lr.opportunityId, items: items.length }, testMode: ctx.config.testMode });
  }
  const auto = autoProcessOpportunity(ctx, lr.opportunityId);
  return { changeId, opportunityId: lr.opportunityId, stage: auto.stage, ...(auto.stage === 'QUOTED' ? { quote: { quoteId: auto.quote.quoteId, acceptanceToken: auto.quote.acceptanceToken } } : {}) };
}

/** Nachträge zu einem Auftrag mit ihrem tatsächlichen Stand (Angebot offen / angenommen / bezahlt). */
export function changesForOrder(ctx: AppContext, orderId: string): { changeId: string; description: string; state: string; paid: boolean; amountMinor: number | null; createdAt: string }[] {
  return ctx.db.all<{ change_id: string; description: string; pipeline_state: string; payment_state: string | null; amount: number | null; created_at: string }>(
    `SELECT cr.change_id, cr.description, op.pipeline_state, o.payment_state, COALESCE(o.amount_minor, q.gross_total_minor) AS amount, cr.created_at
     FROM change_requests cr JOIN opportunities op ON op.opportunity_id = cr.opportunity_id
     LEFT JOIN orders o ON o.opportunity_id = cr.opportunity_id LEFT JOIN quotes q ON q.opportunity_id = cr.opportunity_id
     WHERE cr.original_order_id = ? ORDER BY cr.created_at`, orderId,
  ).map((r) => ({ changeId: r.change_id, description: r.description, state: r.pipeline_state, paid: r.payment_state === 'CONFIRMED', amountMinor: r.amount, createdAt: r.created_at }));
}
