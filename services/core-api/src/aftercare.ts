import { newId } from '../../../packages/shared/src/crypto.ts';
import { hasControlChars } from '../../../packages/shared/src/text.ts';
import type { AppContext } from './context.ts';
import { createSupportTicket, customerByKey } from './customers.ts';
import { WorkflowError } from './errors.ts';

/**
 * Nach der Lieferung (15.0):
 *  084/047 Abnahme – der Kunde bestätigt „passt“ oder meldet einen Mangel (→ Reklamation, Nachbesserung durch den Eigentümer).
 *          Es gibt KEINE automatische Abnahme durch Fristablauf (ohne klaren Scope kein automatisches PASS).
 *  120/034 Rückmeldung – Bewertung 1–5 und Nutzen, nur vom Kunden selbst, eine je Auftrag, unveränderlich.
 *          Veröffentlichung nur mit ausdrücklicher Einwilligung (es gibt derzeit keine Veröffentlichung).
 *  106     Risiko vor Vertragsschluss – erklärte Hinweise, keine Rechtsbewertung, keine Gewissheit.
 */

function ownedDeliveredOrder(ctx: AppContext, key: string | undefined, orderId: string): { customer_id: string; test_mode: number } {
  const c = customerByKey(ctx, key);
  const o = ctx.db.get<{ customer_id: string; test_mode: number }>('SELECT customer_id, test_mode FROM orders WHERE order_id = ?', orderId);
  if (!c || !o || o.customer_id !== c.customer_id) throw new WorkflowError('FORBIDDEN');
  if (!ctx.db.get('SELECT 1 AS x FROM deliveries WHERE order_id = ? AND revoked_at IS NULL', orderId)) throw new WorkflowError('NOT_DELIVERED', 'Abnahme und Rückmeldung sind erst nach der Lieferung möglich.');
  return o;
}

export function getAcceptance(ctx: AppContext, orderId: string): { decision: 'ACCEPTED' | 'DEFECT_REPORTED'; note: string | null; created_at: string } | undefined {
  return ctx.db.get('SELECT decision, note, created_at FROM delivery_acceptances WHERE order_id = ?', orderId);
}

export function recordAcceptance(ctx: AppContext, key: string | undefined, orderId: string, decision: 'ACCEPTED' | 'DEFECT_REPORTED', note: string): void {
  const o = ownedDeliveredOrder(ctx, key, orderId);
  if (getAcceptance(ctx, orderId)) throw new WorkflowError('ALREADY_DECIDED', 'Für diesen Auftrag wurde bereits entschieden.');
  const text = note.trim().slice(0, 2000);
  if (hasControlChars(text)) throw new WorkflowError('INVALID_MESSAGE');
  if (decision === 'DEFECT_REPORTED' && text.length < 5) throw new WorkflowError('DEFECT_NEEDS_DESCRIPTION', 'Bitte beschreiben Sie den Mangel kurz.');
  const ticket = decision === 'DEFECT_REPORTED' ? createSupportTicket(ctx, key, orderId, 'complaint', `Mangel bei Abnahme gemeldet: ${text}`) : null;
  ctx.db.run(
    `INSERT INTO delivery_acceptances (order_id, decision, note, ticket_id, decided_by, test_mode, created_at) VALUES (?, ?, ?, ?, 'customer', ?, ?)`,
    orderId, decision, text || null, ticket, o.test_mode, ctx.clock().toISOString(),
  );
  ctx.audit.record({ type: decision === 'ACCEPTED' ? 'delivery.accepted' : 'delivery.defect_reported', actor: 'customer', subjectType: 'order', subjectId: orderId, data: { ticket }, testMode: ctx.config.testMode });
}

export function getFeedback(ctx: AppContext, orderId: string): { rating: number; outcome: string } | undefined {
  return ctx.db.get('SELECT rating, outcome FROM customer_feedback WHERE order_id = ?', orderId);
}

export function recordFeedback(ctx: AppContext, key: string | undefined, orderId: string, input: { rating: number; outcome: string; comment: string; consentPublish: boolean }): void {
  const o = ownedDeliveredOrder(ctx, key, orderId);
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new WorkflowError('INVALID_RATING', 'Bitte 1 bis 5 Sterne wählen.');
  if (!['IN_USE', 'NOT_YET', 'NOT_USEFUL'].includes(input.outcome)) throw new WorkflowError('INVALID_OUTCOME');
  if (getFeedback(ctx, orderId)) throw new WorkflowError('ALREADY_RATED', 'Sie haben diesen Auftrag bereits bewertet.');
  const comment = input.comment.trim().slice(0, 2000);
  if (hasControlChars(comment)) throw new WorkflowError('INVALID_MESSAGE');
  ctx.db.run(
    'INSERT INTO customer_feedback (feedback_id, order_id, rating, outcome, comment, consent_publish, test_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    newId('fb'), orderId, input.rating, input.outcome, comment || null, input.consentPublish ? 1 : 0, o.test_mode, ctx.clock().toISOString(),
  );
  ctx.audit.record({ type: 'feedback.received', actor: 'customer', subjectType: 'order', subjectId: orderId, data: { rating: input.rating, outcome: input.outcome, consent_publish: input.consentPublish }, testMode: ctx.config.testMode });
}

export interface FeedbackSummary { count: number; average: number | null; inUse: number; notUseful: number; defects: number; accepted: number; publishable: number }

export function feedbackSummary(ctx: AppContext, test: boolean): FeedbackSummary {
  const t = test ? 1 : 0;
  const f = ctx.db.get<{ n: number; avg: number | null; used: number; bad: number; pub: number }>(
    `SELECT COUNT(*) AS n, AVG(rating) AS avg, SUM(outcome = 'IN_USE') AS used, SUM(outcome = 'NOT_USEFUL') AS bad, SUM(consent_publish) AS pub FROM customer_feedback WHERE test_mode = ?`, t,
  );
  const a = ctx.db.get<{ ok: number; bad: number }>(`SELECT SUM(decision = 'ACCEPTED') AS ok, SUM(decision = 'DEFECT_REPORTED') AS bad FROM delivery_acceptances WHERE test_mode = ?`, t);
  return { count: f?.n ?? 0, average: f?.avg === null || f?.avg === undefined ? null : Math.round(f.avg * 10) / 10, inUse: f?.used ?? 0, notUseful: f?.bad ?? 0, publishable: f?.pub ?? 0, accepted: a?.ok ?? 0, defects: a?.bad ?? 0 };
}

export interface RiskAssessment { level: 'niedrig' | 'mittel' | 'erhöht'; points: number; reasons: string[]; disclaimer: string }

/** 106: erklärte Risikohinweise vor bzw. bei Vertragsschluss – keine Rechtsbewertung, keine Gewissheit. */
export function preContractRisk(ctx: AppContext, orderId: string): RiskAssessment {
  const o = ctx.db.get<{ amount_minor: number; customer_id: string; buyer_type: string | null; country: string | null; scope_json: string | null; capability_id: string | null }>(
    `SELECT o.amount_minor, o.customer_id, c.buyer_type, c.country, op.scope_json, op.capability_id FROM orders o JOIN customers c ON c.customer_id = o.customer_id JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE o.order_id = ?`, orderId,
  );
  if (!o) throw new WorkflowError('ORDER_NOT_FOUND');
  const reasons: string[] = [];
  let points = 0;
  if (o.buyer_type === 'B2C') { points += 1; reasons.push('Verbraucher: Widerrufsrecht gilt, solange die Lieferung nicht mit ausdrücklichem Verzicht begonnen hat.'); }
  if (o.amount_minor >= 100_000) { points += 1; reasons.push('Hoher Auftragswert: eine Erstattung würde stärker ins Gewicht fallen.'); }
  if (o.country && o.country !== (ctx.config.seller.country ?? 'DE')) { points += 1; reasons.push('Kunde in einem anderen EU-Land: Steuer- und Rechnungsregeln müssen passen (Live-Freigabe LA-06).'); }
  const items = ((JSON.parse(o.scope_json ?? '{}') as { items?: unknown[] }).items ?? []).length;
  if (items > 100) { points += 1; reasons.push('Viele Positionen: höherer Prüfaufwand bei Reklamationen.'); }
  const prior = ctx.db.get<{ refunds: number; orders: number }>(
    `SELECT SUM(payment_state IN ('REFUNDED','DISPUTED')) AS refunds, COUNT(*) AS orders FROM orders WHERE customer_id = ? AND order_id <> ?`, o.customer_id, orderId,
  );
  if ((prior?.refunds ?? 0) > 0) { points += 2; reasons.push(`Bei diesem Kunden gab es bereits ${prior?.refunds} Erstattung(en) oder Anfechtung(en).`); }
  if (reasons.length === 0) reasons.push('Keine besonderen Risikohinweise erkannt.');
  return { level: points >= 3 ? 'erhöht' : points >= 1 ? 'mittel' : 'niedrig', points, reasons, disclaimer: 'Automatischer Hinweis aus den vorliegenden Daten – keine Rechtsberatung und keine Vorhersage.' };
}
