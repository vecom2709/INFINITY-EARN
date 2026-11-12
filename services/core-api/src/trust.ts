import { getCapability, listCapabilities } from '../../product-factory/src/registry.ts';
import type { AppContext } from './context.ts';
import { customerByKey } from './customers.ts';
import { WorkflowError } from './errors.ts';
import { effectivePolicy } from './policy-store.ts';
import { readinessSummary } from './readiness.ts';

/**
 * 118 Vertrauensseite und 125 maschinenlesbarer Vertrauenspass: ausschließlich überprüfbare Fakten aus dem System.
 * Keine erfundenen Bewertungen, Partner, Zertifikate oder Anbieterdaten. Öffentliche Kundenstimmen nur aus dem
 * Echtbetrieb und nur mit ausdrücklicher Einwilligung – Testbewertungen werden nie öffentlich gezeigt.
 *
 * 119 Abgebrochene Zahlungen: technische Wiederaufnahme durch den Kunden selbst im Portal, keine Werbeerinnerung.
 */
const PRODUCT_NAMES: Record<string, string> = { 'b2b-calc-csv': 'Kalkulationstabelle (CSV)', 'b2b-calc-pdf': 'Kalkulation als PDF', 'b2b-calc-bundle': 'Kalkulationspaket (Tabelle + PDF)' };

export interface TrustFacts {
  schema: 'infinity-earn-trust/1';
  generated_at: string;
  operating_mode: 'TEST' | 'LIVE';
  provider: { legal_name: string | null; registration: string | null; verified: boolean; note: string };
  live_approvals: { done: number; total: number };
  payments: { processor: string; card_data_stored_by_us: false; confirmation: string };
  products: { id: string; name: string; help_url: string; quality_checks: number }[];
  quality: string;
  provenance_check_url: string;
  feedback: { live_reviews: number; live_average: number | null; published_comments: string[]; note: string };
  legal_texts: { status: string };
  data_protection: { export_self_service: boolean; tracking_cookies: false };
}

export function trustFacts(ctx: AppContext): TrustFacts {
  const s = ctx.config.seller;
  const verified = ctx.config.ownerBusinessVerified && !!s.name && !!s.taxId;
  const rs = readinessSummary(ctx);
  const allowed = effectivePolicy(ctx)?.allowedCapabilities ?? [];
  const live = ctx.db.get<{ n: number; avg: number | null }>('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM customer_feedback WHERE test_mode = 0');
  const comments = ctx.db.all<{ comment: string }>(`SELECT comment FROM customer_feedback WHERE test_mode = 0 AND consent_publish = 1 AND comment IS NOT NULL ORDER BY created_at DESC LIMIT 5`).map((r) => r.comment);
  return {
    schema: 'infinity-earn-trust/1',
    generated_at: ctx.clock().toISOString(),
    operating_mode: ctx.config.testMode ? 'TEST' : 'LIVE',
    provider: verified
      ? { legal_name: s.name, registration: s.taxId, verified: true, note: 'Anbieterangaben vom Eigentümer hinterlegt und als verifiziert markiert.' }
      : { legal_name: null, registration: null, verified: false, note: 'Anbieterangaben folgen nach der Unternehmensregistrierung (Live-Freigabe LA-02). Bis dahin nur Testbetrieb, keine Verkäufe.' },
    live_approvals: { done: rs.done, total: rs.total },
    payments: { processor: ctx.config.payment.provider === 'stripe' ? 'Stripe' : 'Testzahlung (kein Geld)', card_data_stored_by_us: false, confirmation: 'Zahlungen gelten nur nach signierter Bestätigung des Zahlungsanbieters.' },
    products: listCapabilities().filter((c) => c.enabled && allowed.includes(c.id)).map((c) => ({ id: c.id, name: PRODUCT_NAMES[c.id] ?? c.id, help_url: `/hilfe/${c.id}`, quality_checks: getCapability(c.id)?.qa_suite.length ?? 0 })),
    quality: 'Jede Datei wird vor der Lieferung automatisch geprüft (u. a. Format, Summen, Prüfsumme). Ohne bestandene Prüfung keine Lieferung.',
    provenance_check_url: '/pruefen',
    feedback: {
      live_reviews: live?.n ?? 0,
      live_average: live?.avg === null || live?.avg === undefined ? null : Math.round(live.avg * 10) / 10,
      published_comments: comments,
      note: (live?.n ?? 0) === 0 ? 'Noch keine Bewertungen aus echten Aufträgen.' : 'Nur echte Bewertungen nach Lieferung; Kommentare nur mit Einwilligung, ohne Namen.',
    },
    legal_texts: { status: 'AGB, Widerrufsbelehrung, Impressum und Datenschutzerklärung liegen als Entwurf vor und werden vor dem Echtbetrieb rechtlich geprüft (LA-07, LA-08).' },
    data_protection: { export_self_service: true, tracking_cookies: false },
  };
}

/**
 * 071 Maschinenlesbarer Angebotskatalog für Einkaufssysteme: freigegebene Produkte, Eingabeformat, Preisregeln
 * und der dokumentierte Bestellweg (POST /api/leads → automatisches Angebot). Keine Preise ohne Kalkulation,
 * keine Zusagen über Liefertermine hinaus, die das Angebot selbst nennt.
 */
export function offerCatalog(ctx: AppContext): Record<string, unknown> {
  const p = effectivePolicy(ctx);
  const allowed = p?.allowedCapabilities ?? [];
  return {
    schema: 'infinity-earn-catalog/1',
    generated_at: ctx.clock().toISOString(),
    operating_mode: ctx.config.testMode ? 'TEST' : 'LIVE',
    ordering: {
      endpoint: '/api/leads',
      method: 'POST',
      content_type: 'application/json',
      required: ['name', 'email', 'country', 'message', 'privacyAccepted', 'request.capabilityId', 'request.scope'],
      result: 'Automatisch kalkuliertes, unverbindliches Angebot mit persönlichem Annahmelink. Beauftragt erst nach Annahme und bestätigter Zahlung.',
      test_access: ctx.config.testMode ? 'Gesamter Dienst läuft im Testbetrieb – Bestellungen erzeugen keine echten Zahlungen.' : null,
    },
    pricing: p ? { currency: p.quote.currency, min_minor: p.quote.minMinor, max_minor: p.quote.maxMinor, rule: 'Preis = interner Aufwand + Marge, mindestens Mindestmarge; Umsatzsteuer noch nicht berechnet.' } : null,
    products: listCapabilities().filter((c) => c.enabled && allowed.includes(c.id)).map((c) => {
      const cap = getCapability(c.id);
      return { id: c.id, name: PRODUCT_NAMES[c.id] ?? c.id, version: c.version, output: cap?.output_schema, input_schema: cap?.inputs_schema, max_items: cap?.max_complexity, quality_checks: cap?.qa_suite, help_url: `/hilfe/${c.id}` };
    }),
  };
}

export interface OpenCheckout { orderId: string; amountMinor: number; currency: string; paymentState: string; ageHours: number }

/** 119: angenommene, aber nicht bezahlte Aufträge (offen > 1 Std. oder fehlgeschlagen). Keine Erinnerungen werden versendet. */
export function openCheckouts(ctx: AppContext, test: boolean): OpenCheckout[] {
  const now = ctx.clock().getTime();
  return ctx.db.all<{ order_id: string; amount_minor: number; currency: string; payment_state: string; updated_at: string }>(
    `SELECT order_id, amount_minor, currency, payment_state, updated_at FROM orders WHERE test_mode = ? AND payment_state IN ('UNPAID','FAILED') ORDER BY updated_at`, test ? 1 : 0,
  ).map((o) => ({ orderId: o.order_id, amountMinor: o.amount_minor, currency: o.currency, paymentState: o.payment_state, ageHours: Math.floor((now - Date.parse(o.updated_at)) / 3_600_000) }))
    .filter((o) => o.paymentState === 'FAILED' || o.ageHours >= 1);
}

/** Wiederaufnahme nur durch den Kunden selbst (Besitzprüfung über den Kundenschlüssel). */
export function assertCanResume(ctx: AppContext, key: string | undefined, orderId: string): void {
  const c = customerByKey(ctx, key);
  const o = ctx.db.get<{ customer_id: string; payment_state: string }>('SELECT customer_id, payment_state FROM orders WHERE order_id = ?', orderId);
  if (!c || !o || o.customer_id !== c.customer_id) throw new WorkflowError('FORBIDDEN');
  if (o.payment_state !== 'UNPAID' && o.payment_state !== 'FAILED') throw new WorkflowError('NOTHING_TO_RESUME', 'Für diesen Auftrag ist keine Zahlung offen.');
}
