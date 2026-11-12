import type { AppContext } from '../../../services/core-api/src/context.ts';
import { lastOffsiteBackup } from '../../../services/core-api/src/backup-offsite.ts';
import { computeKpis } from '../../../services/finance/src/kpis.ts';
import { bankReconciliationActive } from '../../../services/finance/src/bank-statement.ts';
import { ACTIVITY } from './labels.ts';

/**
 * Datensicht der Business-Konsole. Ausschließlich echte Datenbankwerte – keine Musterzahlen.
 * LIVE und TEST sind strikt getrennt (Parameter `test`). Bankeingang gilt nur mit Bankbestätigung.
 */

export interface FinanceView {
  mode: 'LIVE' | 'TEST';
  currency: string;
  /** Bestätigte Kundenzahlungen (kein Gewinn). */
  paidMinor: number;
  /** Beim Zahlungsanbieter: Zahlungen − Erstattungen − Gebühren − Disputes − gemeldete Auszahlungen. */
  atProviderMinor: number;
  /** Vom Anbieter als gesendet gemeldet, aber nicht als Bankeingang bestätigt. */
  inTransitMinor: number;
  /** Nur bankseitig bestätigte Eingänge. */
  onBankMinor: number;
  /** Gibt es eine vertrauenswürdige Bankabstimmung? Solange nicht, wird kein Bankeingang als Zahl gezeigt. */
  bankConnected: boolean;
  reserveMinor: number | null;
  refundsMinor: number;
  feesMinor: number;
  disputesMinor: number;
  contributionMinor: number;
  hasSales: boolean;
  failedPayouts: number;
}

/**
 * Echte Bankanbindung existiert noch nicht (LA-03/LA-04). Im Echtbetrieb daher immer false.
 * Im Testbetrieb gilt der Bankabgleich als eingerichtet, sobald ein (als TEST gekennzeichneter) Kontoauszug importiert wurde.
 */
export const BANK_CONNECTED = false;
export function bankConnected(ctx: AppContext, test: boolean): boolean {
  return test ? bankReconciliationActive(ctx, true) : BANK_CONNECTED;
}

export function financeView(ctx: AppContext, test: boolean): FinanceView {
  const k = computeKpis(ctx, test);
  const payouts = k.providerReportedPayoutsMinor;
  return {
    mode: k.mode,
    currency: k.currency,
    paidMinor: k.grossReceiptsMinor,
    atProviderMinor: k.grossReceiptsMinor + k.refundsMinor + k.feesMinor + k.disputesMinor - payouts,
    inTransitMinor: Math.max(0, payouts - k.bankCreditConfirmedMinor),
    onBankMinor: k.bankCreditConfirmedMinor,
    bankConnected: bankConnected(ctx, test),
    reserveMinor: k.taxReserve.estimateMinor,
    refundsMinor: k.refundsMinor,
    feesMinor: k.feesMinor,
    disputesMinor: k.disputesMinor,
    contributionMinor: k.contributionMinor,
    hasSales: k.grossReceiptsMinor > 0,
    failedPayouts: k.failedPayouts,
  };
}

const MONEY_CACHE = new Map<string, Intl.NumberFormat>();
export function money(minor: number, currency = 'EUR'): string {
  let f = MONEY_CACHE.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('de-DE', { style: 'currency', currency });
    MONEY_CACHE.set(currency, f);
  }
  return f.format(minor / 100 + 0); // + 0 vermeidet „-0,00 €“
}

/** Interne Produktkennungen durch verständliche Namen ersetzen (keine Technik-Labels in der Oberfläche). */
const PRODUCT_NAMES: Record<string, string> = { 'b2b-calc-csv': 'Kalkulationstabelle', 'b2b-calc-pdf': 'Kalkulation als PDF', 'b2b-calc-bundle': 'Kalkulationspaket (Tabelle + PDF)' };
export function friendlyTitle(text: string): string {
  return Object.entries(PRODUCT_NAMES).reduce((t, [id, name]) => t.split(id).join(name), text);
}

/** Systemhinweise lesbar machen: interne IDs (dlv_…, job_…) und Versionskürzel ausblenden, Produktnamen übersetzen. */
export function plainReason(text: string): string {
  return friendlyTitle(text)
    .replace(/\bCapability\b/g, 'Produktart')
    .replace(/@\d+\b/g, '')
    .replace(/\s*\b[a-z]{2,5}_[a-f0-9]{8,}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Bezahlte Kundenzahlungen der letzten 12 Kalendermonate (UTC), ältester zuerst. */
export function monthlyPaid(ctx: AppContext, test: boolean, now = ctx.clock()): { label: string; key: string; minor: number }[] {
  const out: { label: string; key: string; minor: number }[] = [];
  const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ label: names[d.getUTCMonth()] ?? '', key: d.toISOString().slice(0, 7), minor: 0 });
  }
  const rows = ctx.db.all<{ m: string; total: number }>(
    `SELECT substr(created_at, 1, 7) AS m, COALESCE(SUM(amount_minor), 0) AS total FROM ledger_entries
     WHERE account = 'customer_payments' AND test_mode = ? AND created_at >= ? GROUP BY m`,
    test ? 1 : 0, `${out[0]?.key ?? ''}-01`,
  );
  for (const r of rows) {
    const slot = out.find((o) => o.key === r.m);
    if (slot) slot.minor = r.total;
  }
  return out;
}

export interface Decision {
  kind: 'review' | 'job' | 'reconciliation' | 'refund' | 'backup' | 'ticket' | 'quality';
  title: string;
  text: string;
  href: string;
  tone: 'pending' | 'bad';
}

const BACKUP_STALE_MS = 36 * 3_600_000;

export function backupState(ctx: AppContext): { health: 'none' | 'ok' | 'bad'; storedAt: string | null; failedSince: string | null } {
  const b = lastOffsiteBackup(ctx);
  const health = b.failed_since ? 'bad' : !b.stored_at ? 'none' : ctx.clock().getTime() - Date.parse(b.stored_at) > BACKUP_STALE_MS ? 'bad' : 'ok';
  return { health, storedAt: b.stored_at, failedSince: b.failed_since };
}

/** Alles, was die Entscheidung des Eigentümers braucht – nichts davon wird automatisch „gelöst“. */
export function decisions(ctx: AppContext, test: boolean): Decision[] {
  const t = test ? 1 : 0;
  const out: Decision[] = [];
  for (const r of ctx.db.all<{ opportunity_id: string; pipeline_state: string; state_reason: string | null }>(
    `SELECT opportunity_id, pipeline_state, state_reason FROM opportunities WHERE test_mode = ? AND pipeline_state IN ('MANUAL_REVIEW','TAX_REVIEW','DISPUTE','REFUND_PENDING','NO_CAPACITY') ORDER BY updated_at DESC LIMIT 20`, t,
  )) {
    const order = ctx.db.get<{ order_id: string }>('SELECT order_id FROM orders WHERE opportunity_id = ?', r.opportunity_id);
    out.push({ kind: 'review', title: reviewTitle(r.pipeline_state), text: r.state_reason ?? 'Bitte prüfen.', href: order ? `/dashboard/auftraege/${order.order_id}` : '/dashboard/kunden', tone: r.pipeline_state === 'DISPUTE' ? 'bad' : 'pending' });
  }
  for (const j of ctx.db.all<{ job_id: string; order_id: string | null; last_error: string | null; reason: string | null }>(
    `SELECT job_id, order_id, last_error, reason FROM jobs WHERE test_mode = ? AND state IN ('DEAD_LETTER','HUMAN_REVIEW') ORDER BY updated_at DESC LIMIT 20`, t,
  )) {
    if (j.order_id && out.some((d) => d.href.endsWith(j.order_id ?? '#'))) continue; // schon über den Auftrag gemeldet
    out.push({ kind: 'job', title: 'Aufgabe angehalten', text: j.last_error ?? j.reason ?? 'Mehrfach fehlgeschlagen.', href: j.order_id ? `/dashboard/auftraege/${j.order_id}` : '/dashboard/aktivitaeten', tone: 'pending' });
  }
  for (const r of ctx.db.all<{ refund_request_id: string; order_id: string; reason: string }>(
    `SELECT refund_request_id, order_id, reason FROM refund_requests WHERE test_mode = ? AND status = 'PENDING_OWNER' ORDER BY created_at DESC`, t,
  )) {
    out.push({ kind: 'refund', title: 'Erstattung beantragt', text: r.reason.slice(0, 140), href: `/dashboard/finanzen#erstattungen`, tone: 'pending' });
  }
  // 120: schlechte Ergebnisse führen zu einer Qualitätsmaßnahme zur Entscheidung (nicht automatisch erledigt)
  for (const f of ctx.db.all<{ order_id: string; rating: number; outcome: string }>(
    `SELECT order_id, rating, outcome FROM customer_feedback WHERE test_mode = ? AND (rating <= 2 OR outcome = 'NOT_USEFUL') ORDER BY created_at DESC LIMIT 10`, t,
  )) {
    out.push({ kind: 'quality', title: 'Qualitätsmaßnahme prüfen', text: `Kundenrückmeldung: ${f.rating} von 5 Sternen${f.outcome === 'NOT_USEFUL' ? ', „hilft nicht“' : ''}. Ursache klären, ggf. Produktversion verbessern oder Erstattung anbieten.`, href: `/dashboard/auftraege/${f.order_id}`, tone: 'pending' });
  }
  const tickets = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM support_tickets WHERE test_mode = ? AND status = 'OPEN'`, t)?.n ?? 0;
  if (tickets) out.push({ kind: 'ticket', title: `${tickets} offene Kundennachricht${tickets === 1 ? '' : 'en'}`, text: 'Fragen, Reklamationen oder Widerrufe aus dem Kundenportal.', href: '/dashboard/kunden#nachrichten', tone: 'pending' });
  const recon = ctx.db.get<{ status: string; test_mode: number }>('SELECT status, test_mode FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1');
  if (recon?.status === 'REVIEW') out.push({ kind: 'reconciliation', title: 'Zahlungsabgleich weicht ab', text: 'Buchungen und Anbieterdaten stimmen nicht überein.', href: '/dashboard/finanzen', tone: 'bad' });
  const b = backupState(ctx);
  if (b.health === 'bad') out.push({ kind: 'backup', title: 'Datensicherung prüfen', text: b.failedSince ? 'Die letzte automatische Sicherung ist fehlgeschlagen.' : 'Die letzte Sicherung ist älter als 36 Stunden.', href: '/dashboard/einstellungen#sicherung', tone: 'bad' });
  return out;
}

function reviewTitle(state: string): string {
  return ({ MANUAL_REVIEW: 'Hier wird deine Entscheidung benötigt', TAX_REVIEW: 'Steuerangaben fehlen für einen Beleg', DISPUTE: 'Zahlung wurde angefochten', REFUND_PENDING: 'Erstattung offen', NO_CAPACITY: 'Vorübergehend pausiert: kein kostenloses Kontingent frei' } as Record<string, string>)[state] ?? 'Prüfung nötig';
}

export interface ActivityItem {
  title: string;
  text: string;
  icon: (typeof ACTIVITY)[string]['icon'];
  tone?: 'warn' | 'bad';
  at: string;
}

export function activity(ctx: AppContext, test: boolean, limit = 6): ActivityItem[] {
  const types = Object.keys(ACTIVITY);
  const rows = ctx.db.all<{ event_type: string; created_at: string }>(
    `SELECT event_type, created_at FROM audit_events WHERE test_mode = ? AND event_type IN (${types.map(() => '?').join(',')}) ORDER BY seq DESC LIMIT ?`,
    test ? 1 : 0, ...types, limit,
  );
  return rows.map((r) => ({ ...(ACTIVITY[r.event_type] as (typeof ACTIVITY)[string]), at: r.created_at }));
}

export interface OrderRowView {
  orderId: string;
  title: string;
  customer: string;
  amountMinor: number;
  currency: string;
  paymentState: string;
  fulfillmentState: string;
  pipelineState: string;
  bankConfirmed: boolean;
  createdAt: string;
  test: boolean;
}

export function orderRows(ctx: AppContext, test: boolean, limit = 50): OrderRowView[] {
  return ctx.db.all<{ order_id: string; description: string; name: string | null; amount_minor: number; currency: string; payment_state: string; fulfillment_state: string; pipeline_state: string; created_at: string; test_mode: number; bank: number }>(
    `SELECT o.order_id, q.description, c.name, o.amount_minor, o.currency, o.payment_state, o.fulfillment_state, op.pipeline_state, o.created_at, o.test_mode,
            EXISTS (SELECT 1 FROM payouts p WHERE p.bank_credit_confirmed = 1 AND p.order_ids_json LIKE '%' || o.order_id || '%') AS bank
     FROM orders o JOIN quotes q ON q.quote_id = o.quote_id JOIN customers c ON c.customer_id = o.customer_id
     JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE o.test_mode = ? ORDER BY o.created_at DESC LIMIT ?`,
    test ? 1 : 0, limit,
  ).map((r) => ({ orderId: r.order_id, title: friendlyTitle(r.description), customer: r.name ?? '—', amountMinor: r.amount_minor, currency: r.currency, paymentState: r.payment_state, fulfillmentState: r.fulfillment_state, pipelineState: r.pipeline_state, bankConfirmed: r.bank === 1, createdAt: r.created_at, test: r.test_mode === 1 }));
}

/** Kurze, gut lesbare Auftragsnummer (stabil, aus der internen ID abgeleitet). */
export function shortRef(id: string): string {
  return `IE‑${id.replace(/^[a-z]+_/, '').slice(0, 6).toUpperCase()}`; // geschützter Bindestrich: kein Umbruch
}

/** Liest ISO-Zeitpunkte und reine Daten mit Zeitzonenzusatz (TED: „2026-12-01+01:00“). Ungültiges wird nie zum Absturz. */
export function parseDate(iso: string): Date | null {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  const m = /^(\d{4}-\d{2}-\d{2})(?:Z|[+-]\d{2}:?\d{2})?$/.exec(iso.trim());
  const f = m ? new Date(`${m[1]}T12:00:00Z`) : null;
  return f && !Number.isNaN(f.getTime()) ? f : null;
}

export function fmtDate(iso: string, withTime = false): string {
  const d = parseDate(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Europe/Berlin' }).format(d);
}

export function fmtWhen(iso: string, now: Date): string {
  const d = parseDate(iso);
  if (!d) return iso;
  const day = (x: Date): string => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  if (day(d) === day(now)) return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(d);
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return 'Gestern';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' }).format(d);
}

export function greeting(now: Date): { hello: string; date: string } {
  const hour = Number(new Intl.DateTimeFormat('de-DE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).format(now));
  const hello = hour < 11 ? 'Guten Morgen.' : hour < 18 ? 'Guten Tag.' : 'Guten Abend.';
  const date = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(now);
  return { hello, date };
}
