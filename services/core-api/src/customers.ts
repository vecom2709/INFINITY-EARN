import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { hasControlChars } from '../../../packages/shared/src/text.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';

export interface CustomerRow {
  customer_id: string;
  lead_id: string;
  name: string | null;
  email: string | null;
  address: string | null;
  country: string | null;
  buyer_type: 'B2B' | 'B2C' | null;
  vat_id: string | null;
  processing_restricted: number;
  erased_at: string | null;
  test_mode: number;
}

/** Identitätsprüfung über den geheimen Kundenschlüssel (nur als Hash gespeichert). */
export function customerByKey(ctx: AppContext, key: string | undefined): CustomerRow | undefined {
  if (!key || key.length < 20) return undefined;
  return ctx.db.get<CustomerRow>('SELECT * FROM customers WHERE access_key_hash = ? AND erased_at IS NULL', sha256Hex(key));
}

/** DSGVO-Auskunft: nur nach Identitätsprüfung, nur eigene Daten (IE-086, IE-090, IE-083). */
export function exportPersonalData(ctx: AppContext, key: string | undefined): Record<string, unknown> {
  const c = customerByKey(ctx, key);
  if (!c) {
    ctx.audit.record({ type: 'security.data_export_denied', actor: 'customer', subjectType: 'gdpr', subjectId: 'unknown', testMode: ctx.config.testMode });
    throw new WorkflowError('FORBIDDEN');
  }
  const data = {
    generated_at: ctx.clock().toISOString(),
    test_mode: c.test_mode === 1,
    customer: { name: c.name, email: c.email, address: c.address, country: c.country, buyer_type: c.buyer_type, vat_id: c.vat_id },
    lead: ctx.db.get('SELECT lead_id, name, company, country, message, contact_legal_basis, created_at FROM leads WHERE lead_id = ?', c.lead_id),
    consents: ctx.db.all('SELECT purpose, proof_ref, granted_at, withdrawn_at FROM consents WHERE lead_id = ?', c.lead_id),
    orders: ctx.db.all('SELECT order_id, amount_minor, currency, payment_state, fulfillment_state, created_at FROM orders WHERE customer_id = ?', c.customer_id),
    invoices: ctx.db.all('SELECT i.invoice_number, i.kind, i.status, i.gross_minor, i.currency FROM invoices i JOIN orders o ON o.order_id = i.order_id WHERE o.customer_id = ?', c.customer_id),
    tickets: ctx.db.all('SELECT ticket_id, kind, status, created_at FROM support_tickets WHERE customer_id = ?', c.customer_id),
  };
  ctx.audit.record({ type: 'gdpr.data_exported', actor: 'customer', subjectType: 'customer', subjectId: c.customer_id, testMode: ctx.config.testMode });
  return data;
}

/**
 * Löschantrag: Ohne Aufbewahrungspflicht -> personenbezogene Daten entfernen.
 * Mit Belegen (Aufbewahrungspflicht) -> Verarbeitung einschränken, Werbung/Freitext löschen,
 * belegrelevante Daten sperren statt löschen (IE-087). Fristen: Rechtsprüfung M3.
 */
export function erasePersonalData(ctx: AppContext, leadId: string, actor: 'owner'): { mode: 'ERASED' | 'RESTRICTED' } {
  if (actor !== 'owner') throw new WorkflowError('OWNER_REQUIRED');
  const now = ctx.clock().toISOString();
  const hasInvoices = (ctx.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM invoices i JOIN orders o ON o.order_id = i.order_id JOIN customers c ON c.customer_id = o.customer_id WHERE c.lead_id = ?`,
    leadId,
  )?.n ?? 0) > 0;
  const hasPayments = (ctx.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM payment_events p JOIN orders o ON o.order_id = p.order_id JOIN customers c ON c.customer_id = o.customer_id WHERE c.lead_id = ?`,
    leadId,
  )?.n ?? 0) > 0;
  const mode = hasInvoices || hasPayments ? 'RESTRICTED' : 'ERASED';
  ctx.db.tx(() => {
    ctx.db.run(`UPDATE consents SET withdrawn_at = COALESCE(withdrawn_at, ?) WHERE lead_id = ?`, now, leadId);
    if (mode === 'ERASED') {
      ctx.db.run(`UPDATE leads SET email = NULL, email_hash = NULL, name = '[gelöscht]', company = NULL, message = NULL, marketing_opt_out = 1, erased_at = ? WHERE lead_id = ?`, now, leadId);
      ctx.db.run(`UPDATE customers SET name = '[gelöscht]', email = NULL, address = NULL, vat_id = NULL, access_key_hash = NULL, erased_at = ? WHERE lead_id = ?`, now, leadId);
    } else {
      ctx.db.run(`UPDATE leads SET message = NULL, company = NULL, marketing_opt_out = 1, processing_restricted = 1 WHERE lead_id = ?`, leadId);
      ctx.db.run(`UPDATE customers SET processing_restricted = 1 WHERE lead_id = ?`, leadId);
    }
    // Freitext auch in Auftragsanforderungen (156) entfernen; Prüfsumme und Versionen bleiben als Nachweis.
    ctx.db.run(`UPDATE assignment_specs SET source_text = '[gelöscht]', spec_json = '{"erased":true}', attachments_json = '[]' WHERE lead_id = ?`, leadId);
  });
  ctx.audit.record({ type: 'gdpr.erasure_processed', actor, subjectType: 'lead', subjectId: leadId, data: { mode }, testMode: ctx.config.testMode });
  return { mode };
}

/** Reklamation/Support -> Ticket (IE-058). */
export function createSupportTicket(ctx: AppContext, key: string | undefined, orderId: string, kind: 'complaint' | 'question' | 'withdrawal', message: string): string {
  const c = customerByKey(ctx, key);
  if (!c) throw new WorkflowError('FORBIDDEN');
  const owns = ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE order_id = ? AND customer_id = ?', orderId, c.customer_id);
  if (!owns?.n) throw new WorkflowError('FORBIDDEN');
  const text = message.trim();
  if (text.length < 1 || text.length > 5000 || hasControlChars(text)) throw new WorkflowError('INVALID_MESSAGE');
  const id = newId('tkt');
  ctx.db.run(
    `INSERT INTO support_tickets (ticket_id, order_id, customer_id, kind, message, status, test_mode, created_at) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    id, orderId, c.customer_id, kind, text, c.test_mode, ctx.clock().toISOString(),
  );
  ctx.audit.record({ type: 'support.ticket_created', actor: 'customer', subjectType: 'order', subjectId: orderId, data: { ticket_id: id, kind }, testMode: ctx.config.testMode });
  return id;
}
