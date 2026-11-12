import { hmacHex, newId, safeEqual } from '../../../packages/shared/src/crypto.ts';
import { contactDecision, withdrawMarketingConsent } from '../../acquisition/src/consent.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';
import { decide, effectivePolicy } from './policy-store.ts';

/**
 * Automatischer Postausgang für Kundennachrichten.
 *  - transaktional (Rechtsgrundlage Vertrag/Anfrage): Angebot bereit, Zahlung bestätigt, Datei bereit
 *  - Werbung (Folgeangebot) NUR mit nachweisbarer, nicht widerrufener Einwilligung (DB-Trigger erzwingt das),
 *    mit Abmeldelink, max. eine Werbenachricht je Kunde in 90 Tagen, Tageslimit.
 *  - KEINE Kaltakquise: Leads ohne Einwilligung (z. B. aus Ausschreibungen) erhalten nie Werbung.
 *
 * Versand: Es gibt noch keinen freigegebenen Versandkanal und keine Anbieterangaben für die Pflichtangaben
 * (Impressum, LA-02). Deshalb bleiben alle Nachrichten im Status HELD und werden NICHT gesendet.
 */
export const MARKETING_DAILY_LIMIT = 50;
export const MARKETING_MIN_GAP_DAYS = 90;

export type Template = 'quote_ready' | 'payment_confirmed' | 'delivery_ready' | 'not_deliverable' | 'followup_offer';

export function maskEmail(email: string | null): string {
  if (!email || !email.includes('@')) return '—';
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain.replace(/^[^.]+/, (m) => `${m.slice(0, 1)}•••`)}`;
}

export function unsubscribeToken(ctx: AppContext, leadId: string): string {
  return `${leadId}.${hmacHex(ctx.config.downloadSigningKey, `unsubscribe:${leadId}`).slice(0, 32)}`;
}

/** Abmeldung über den Link in jeder Werbenachricht. Ungültige Links verraten nichts. */
export function unsubscribe(ctx: AppContext, token: string): boolean {
  const [leadId = '', mac = ''] = token.split('.');
  if (!leadId || mac.length !== 32 || !safeEqual(unsubscribeToken(ctx, leadId), token)) return false;
  if (!ctx.db.get('SELECT 1 AS x FROM leads WHERE lead_id = ?', leadId)) return false;
  withdrawMarketingConsent(ctx, leadId);
  ctx.db.run(`UPDATE outbox_messages SET status = 'SUPPRESSED', reason = 'Empfänger hat sich abgemeldet' WHERE lead_id = ? AND kind = 'marketing' AND status = 'HELD'`, leadId);
  return true;
}

/** Kanalstatus: ohne freigegebenen Kanal und Anbieterangaben wird nichts versendet. */
export function deliveryChannel(ctx: AppContext): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  reasons.push('Kein E-Mail-Versanddienst freigegeben (Auswahl und Konto durch den Eigentümer).');
  if (!ctx.config.ownerBusinessVerified || !ctx.config.seller.name) reasons.push('Anbieterangaben für die Pflichtangaben jeder Nachricht fehlen (Registrierung, LA-02).');
  if (ctx.config.testMode) reasons.push('Testbetrieb: es werden keine echten Nachrichten versendet.');
  return { ready: false, reasons };
}

interface Draft { template: Template; leadId: string; orderId: string | null; subject: string; body: string; kind: 'transactional' | 'marketing'; key: string }

function enqueue(ctx: AppContext, d: Draft): 'created' | 'exists' | 'blocked' {
  if (ctx.db.get('SELECT 1 AS x FROM outbox_messages WHERE idempotency_key = ?', d.key)) return 'exists';
  const lead = ctx.db.get<{ email: string | null }>('SELECT email FROM leads WHERE lead_id = ?', d.leadId);
  const decision = contactDecision(ctx, d.leadId, d.kind === 'marketing' ? 'marketing' : 'transactional', true);
  const now = ctx.clock().toISOString();
  const channel = deliveryChannel(ctx);
  if (!decision.allowed) {
    if (d.kind === 'marketing') return 'blocked'; // Werbung ohne Grundlage wird nicht einmal gespeichert
    ctx.db.run(
      `INSERT INTO outbox_messages (message_id, kind, template, lead_id, order_id, recipient_masked, subject, body_text, status, reason, legal_basis, idempotency_key, test_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BLOCKED', ?, 'contract', ?, ?, ?)`,
      newId('msg'), d.kind, d.template, d.leadId, d.orderId, maskEmail(lead?.email ?? null), d.subject, d.body, `${decision.rule}: ${decision.reason}`, d.key, ctx.config.testMode ? 1 : 0, now,
    );
    return 'blocked';
  }
  ctx.db.run(
    `INSERT INTO outbox_messages (message_id, kind, template, lead_id, order_id, recipient_masked, subject, body_text, status, reason, legal_basis, idempotency_key, test_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'HELD', ?, ?, ?, ?, ?)`,
    newId('msg'), d.kind, d.template, d.leadId, d.orderId, maskEmail(lead?.email ?? null), d.subject, d.body, channel.reasons.join(' '), d.kind === 'marketing' ? 'consent' : 'contract', d.key, ctx.config.testMode ? 1 : 0, now,
  );
  ctx.audit.record({ type: 'message.queued', actor: 'system', subjectType: 'lead', subjectId: d.leadId, data: { template: d.template, kind: d.kind, sent: false }, testMode: ctx.config.testMode });
  return 'created';
}

const portal = (ctx: AppContext): string => `${ctx.config.publicOrigin.replace(/\/$/, '')}/portal`;
const footer = (ctx: AppContext): string => `\n\n—\nINFINITY EARN${ctx.config.testMode ? ' (TESTBETRIEB – kein echter Vorgang)' : ''}\nAnbieterangaben: ${ctx.config.seller.name ?? 'folgen nach Registrierung'}`;

/**
 * Angebot bereit – direkt bei der Angebotserstellung. Der geheime Annahmeschlüssel wird bewusst NICHT im
 * Postausgang gespeichert (die Datenbank kennt nur seinen Hash); er wird erst beim echten Versand neu ausgestellt.
 */
export function queueQuoteReady(ctx: AppContext, quoteId: string): void {
  const q = ctx.db.get<{ lead_id: string; description: string }>('SELECT lead_id, description FROM quotes WHERE quote_id = ?', quoteId);
  if (!q) return;
  enqueue(ctx, {
    template: 'quote_ready', kind: 'transactional', leadId: q.lead_id, orderId: null, key: `quote_ready:${quoteId}`,
    subject: 'Ihr Angebot ist bereit',
    body: `Guten Tag,\n\nvielen Dank für Ihre Anfrage „${q.description}“. Ihr Angebot ist bereit:\n${ctx.config.publicOrigin.replace(/\/$/, '')}/angebot/${quoteId}\n(Ihr persönlicher Zugangsschlüssel wird beim Versand an diesen Link angehängt.)\n\nDas Angebot ist unverbindlich, bis Sie es annehmen und bezahlen.${footer(ctx)}`,
  });
}

/** Auftrag nicht lieferfähig: ehrliche Information an den Kunden; die Erstattung gibt der Eigentümer frei. */
export function queueNotDeliverable(ctx: AppContext, orderId: string): void {
  const o = ctx.db.get<{ lead_id: string; description: string }>(
    `SELECT op.lead_id, q.description FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id JOIN quotes q ON q.quote_id = o.quote_id WHERE o.order_id = ?`, orderId,
  );
  if (!o) return;
  enqueue(ctx, {
    template: 'not_deliverable', kind: 'transactional', leadId: o.lead_id, orderId, key: `not_deliverable:${orderId}`,
    subject: 'Ihr Auftrag kann nicht in der zugesagten Qualität geliefert werden',
    body: `Guten Tag,\n\nIhr Auftrag „${o.description}“ hat unsere verbindliche Qualitätsprüfung nicht bestanden. Wir liefern nichts, was nicht vollständig und zuverlässig funktioniert.\nWir haben die Erstattung des vollen Betrags veranlasst; sie wird nach Freigabe über den Zahlungsanbieter ausgeführt. Den Stand sehen Sie im Kundenportal:\n${portal(ctx)}${footer(ctx)}`,
  });
}

/** Läuft im Autopilot-Takt: erzeugt fällige transaktionale Nachrichten und erlaubte Folgeangebote. */
export function runOutbox(ctx: AppContext): { created: number; blocked: number } {
  const t = ctx.config.testMode ? 1 : 0;
  let created = 0;
  let blocked = 0;
  const count = (r: ReturnType<typeof enqueue>): void => { if (r === 'created') created++; else if (r === 'blocked') blocked++; };
  for (const o of ctx.db.all<{ order_id: string; lead_id: string; description: string }>(
    `SELECT o.order_id, op.lead_id, q.description FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id JOIN quotes q ON q.quote_id = o.quote_id
     WHERE o.test_mode = ? AND o.payment_state = 'CONFIRMED'`, t,
  )) {
    count(enqueue(ctx, { template: 'payment_confirmed', kind: 'transactional', leadId: o.lead_id, orderId: o.order_id, key: `payment_confirmed:${o.order_id}`, subject: 'Zahlung bestätigt – wir erstellen Ihre Datei', body: `Guten Tag,\n\nIhre Zahlung ist vom Zahlungsanbieter bestätigt. Ihre Datei wird jetzt erstellt und automatisch geprüft. Vertragsbestätigung und Beleg finden Sie im Kundenportal:\n${portal(ctx)}\n(im selben Browser, in dem Sie das Angebot angenommen haben)${footer(ctx)}` }));
    if (ctx.db.get('SELECT 1 AS x FROM deliveries WHERE order_id = ? AND revoked_at IS NULL', o.order_id)) {
      count(enqueue(ctx, { template: 'delivery_ready', kind: 'transactional', leadId: o.lead_id, orderId: o.order_id, key: `delivery_ready:${o.order_id}`, subject: 'Ihre Datei ist bereit', body: `Guten Tag,\n\nIhre geprüfte Datei steht im Kundenportal zum Download bereit:\n${portal(ctx)}\n\nBitte bestätigen Sie dort kurz, ob alles passt, oder melden Sie einen Mangel.${footer(ctx)}` }));
    }
  }
  // Werbung: nur zufriedene Kunden (abgenommen, ≥ 4 Sterne) mit Einwilligung, die eine freigegebene Ergänzung noch nicht haben.
  const sentToday = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'marketing' AND test_mode = ? AND created_at >= ?`, t, new Date(ctx.clock().getTime() - 86_400_000).toISOString())?.n ?? 0;
  // Vorprüfung ohne Protokolleintrag (sonst jede Minute ein „policy.denied“); die eigentliche Entscheidung bleibt beim Policy-Gate.
  if (sentToday < MARKETING_DAILY_LIMIT && effectivePolicy(ctx)?.autoMarketingOutreach === true && decide(ctx, { action: 'marketing.outreach', recipients: 1 }, 'system').allowed) {
    const since = new Date(ctx.clock().getTime() - MARKETING_MIN_GAP_DAYS * 86_400_000).toISOString();
    for (const c of ctx.db.all<{ lead_id: string; rating: number }>(
      `SELECT c.lead_id, MAX(f.rating) AS rating FROM customers c JOIN orders o ON o.customer_id = c.customer_id
       JOIN delivery_acceptances da ON da.order_id = o.order_id AND da.decision = 'ACCEPTED' JOIN customer_feedback f ON f.order_id = o.order_id
       WHERE c.test_mode = ? GROUP BY c.lead_id HAVING MAX(f.rating) >= 4`, t,
    ).slice(0, MARKETING_DAILY_LIMIT - sentToday)) {
      if (ctx.db.get(`SELECT 1 AS x FROM outbox_messages WHERE lead_id = ? AND kind = 'marketing' AND created_at >= ?`, c.lead_id, since)) continue;
      const link = `${ctx.config.publicOrigin.replace(/\/$/, '')}/abmelden/${unsubscribeToken(ctx, c.lead_id)}`;
      count(enqueue(ctx, { template: 'followup_offer', kind: 'marketing', leadId: c.lead_id, orderId: null, key: `followup:${c.lead_id}:${ctx.clock().toISOString().slice(0, 10)}`, subject: 'Ihre Kalkulation auch als PDF oder Paket', body: `Guten Tag,\n\nSie haben Neuigkeiten von uns abonniert. Ihre Kalkulation gibt es auch als druckfertiges PDF oder als Paket aus Tabelle und PDF: ${ctx.config.publicOrigin.replace(/\/$/, '')}/anfrage\n\nKeine weiteren Nachrichten? Hier abmelden: ${link}${footer(ctx)}` }));
    }
  }
  return { created, blocked };
}

export function outboxSummary(ctx: AppContext, test: boolean): { held: number; blocked: number; suppressed: number; sent: number } {
  const r = ctx.db.get<{ held: number; blocked: number; suppressed: number; sent: number }>(
    `SELECT SUM(status = 'HELD') AS held, SUM(status = 'BLOCKED') AS blocked, SUM(status = 'SUPPRESSED') AS suppressed, SUM(status = 'SENT') AS sent FROM outbox_messages WHERE test_mode = ?`, test ? 1 : 0,
  );
  return { held: r?.held ?? 0, blocked: r?.blocked ?? 0, suppressed: r?.suppressed ?? 0, sent: r?.sent ?? 0 };
}

export function assertNoColdOutreach(ctx: AppContext, leadId: string): void {
  const l = ctx.db.get<{ contact_legal_basis: string }>('SELECT contact_legal_basis FROM leads WHERE lead_id = ?', leadId);
  if (l?.contact_legal_basis === 'none') throw new WorkflowError('COLD_OUTREACH_FORBIDDEN', 'Keine Rechtsgrundlage für Kontakt – Antwort nur über den offiziellen Kanal der Quelle.');
}
