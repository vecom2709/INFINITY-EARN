import type { AppContext } from '../../core-api/src/context.ts';

/**
 * Auswertungen ohne Außenwirkung, ausschließlich aus echten gespeicherten Daten (keine Schätzung ohne Grundlage):
 *  088 Ursachen fehlender Verkäufe – an welcher Stufe der Kette es hängt, mit nächstem sinnvollen Schritt.
 *  098 Liquiditäts- und Auszahlungsprognose – nur aus bekannten Beträgen (beim Anbieter, unterwegs, offen),
 *      ohne erfundene Umsatzprognose. Unsicherheit wird benannt.
 *  099 Abhängigkeit von Großkunden – Anteil der größten Kunden am bezahlten Umsatz.
 * LIVE und TEST strikt getrennt.
 */

export interface FunnelStep { key: string; label: string; count: number }
export interface TechnicalIssue { key: string; label: string; count: number }
export interface SalesDiagnosis {
  mode: 'LIVE' | 'TEST';
  funnel: FunnelStep[];
  bottleneck: { key: string; reason: string; nextStep: string } | null;
  /** Technische Ursachen aus echten Fehlerdaten (088). */
  technical: TechnicalIssue[];
  hasSales: boolean;
}

export function technicalIssues(ctx: AppContext, test: boolean): TechnicalIssue[] {
  const t = test ? 1 : 0;
  const n = (sql: string): number => ctx.db.get<{ n: number }>(sql, t)?.n ?? 0;
  return [
    { key: 'payment_failed', label: 'Fehlgeschlagene Zahlungen', count: n(`SELECT COUNT(*) AS n FROM orders WHERE test_mode = ? AND payment_state = 'FAILED'`) },
    { key: 'checkout_failed', label: 'Zahlungsseite nicht erreichbar', count: n(`SELECT COUNT(*) AS n FROM audit_events WHERE test_mode = ? AND event_type = 'checkout.provider_failed'`) },
    { key: 'acceptance_rejected', label: 'Abgelehnte Angebotsannahmen (z. B. Pflichtangaben fehlen)', count: n(`SELECT COUNT(*) AS n FROM audit_events WHERE test_mode = ? AND event_type = 'quote.acceptance_rejected'`) },
    { key: 'qa_failed', label: 'Nicht bestandene Qualitätsprüfungen', count: n('SELECT COUNT(*) AS n FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.test_mode = ? AND q.passed = 0') },
    { key: 'jobs_stuck', label: 'Angehaltene Aufgaben', count: n(`SELECT COUNT(*) AS n FROM jobs WHERE test_mode = ? AND state IN ('DEAD_LETTER','HUMAN_REVIEW')`) },
  ].filter((x) => x.count > 0);
}

export function salesDiagnosis(ctx: AppContext, test: boolean, liveApprovalsOpen: number): SalesDiagnosis {
  const t = test ? 1 : 0;
  const n = (sql: string): number => ctx.db.get<{ n: number }>(sql, t)?.n ?? 0;
  const funnel: FunnelStep[] = [
    { key: 'leads', label: 'Anfragen', count: n('SELECT COUNT(*) AS n FROM leads WHERE test_mode = ?') },
    { key: 'quoted', label: 'Angebote', count: n('SELECT COUNT(*) AS n FROM quotes WHERE test_mode = ?') },
    { key: 'accepted', label: 'Angenommen', count: n('SELECT COUNT(*) AS n FROM orders WHERE test_mode = ?') },
    { key: 'paid', label: 'Bezahlt', count: n(`SELECT COUNT(*) AS n FROM orders WHERE test_mode = ? AND payment_state IN ('CONFIRMED','REFUNDED','DISPUTED')`) },
    { key: 'delivered', label: 'Geliefert', count: n('SELECT COUNT(*) AS n FROM deliveries WHERE test_mode = ?') },
  ];
  const c = Object.fromEntries(funnel.map((f) => [f.key, f.count])) as Record<string, number>;
  let bottleneck: SalesDiagnosis['bottleneck'] = null;
  if (!test && liveApprovalsOpen > 0) {
    bottleneck = { key: 'live_locked', reason: `Echtbetrieb ist gesperrt – ${liveApprovalsOpen} Live-Freigabe(n) offen.`, nextStep: 'Live-Freigaben unter Einstellungen bearbeiten (zuerst LA-01 Sitzland).' };
  } else if (c.leads === 0) {
    bottleneck = { key: 'no_leads', reason: 'Es sind noch keine Anfragen eingegangen.', nextStep: 'Erlaubte Quellen freigeben (Kunden → Woher Anfragen kommen dürfen) und das Anfrageformular bekannt machen.' };
  } else if ((c.quoted ?? 0) < (c.leads ?? 0) * 0.5) {
    bottleneck = { key: 'not_quoted', reason: 'Viele Anfragen erhalten kein automatisches Angebot.', nextStep: 'Anfragen mit „Deine Entscheidung nötig“ prüfen; ggf. passende Produktart freigeben.' };
  } else if (c.accepted === 0) {
    bottleneck = { key: 'not_accepted', reason: 'Angebote werden nicht angenommen.', nextStep: 'Preis, Lieferumfang und Angebotstext prüfen.' };
  } else if (c.paid === 0) {
    bottleneck = { key: 'not_paid', reason: 'Angenommene Angebote werden nicht bezahlt.', nextStep: 'Zahlungsablauf beim Anbieter prüfen (abgebrochene Zahlungen).' };
  } else if ((c.delivered ?? 0) < (c.paid ?? 0)) {
    bottleneck = { key: 'not_delivered', reason: 'Bezahlte Aufträge sind noch nicht geliefert.', nextStep: 'Aufträge mit Prüfbedarf öffnen.' };
  }
  const technical = technicalIssues(ctx, test);
  // Technische Ursache, die genau zum Engpass passt, wird im nächsten Schritt konkret benannt.
  const related: Record<string, string[]> = { not_accepted: ['acceptance_rejected'], not_paid: ['payment_failed', 'checkout_failed'], not_delivered: ['qa_failed', 'jobs_stuck'] };
  const hit = bottleneck ? technical.find((x) => related[bottleneck?.key ?? '']?.includes(x.key)) : undefined;
  if (bottleneck && hit) bottleneck = { ...bottleneck, nextStep: `${bottleneck.nextStep} Hinweis aus den Daten: ${hit.count}× „${hit.label}“.` };
  return { mode: test ? 'TEST' : 'LIVE', funnel, bottleneck, technical, hasSales: (c.paid ?? 0) > 0 };
}

export interface ChannelRow { source: string; leads: number; paidOrders: number; paidMinor: number; conversionPct: number | null }
export interface Attribution { mode: 'LIVE' | 'TEST'; channels: ChannelRow[]; reliable: boolean; note: string }

/**
 * 095 „Woher kamen die Käufer?“ – nur über die eigene, erlaubte Herkunft der Anfrage (kein Tracking, keine Cookies).
 * Unter 30 Anfragen je Kanal wird ausdrücklich vor Schlüssen gewarnt (Messunsicherheit).
 */
export function revenueAttribution(ctx: AppContext, test: boolean): Attribution {
  const rows = ctx.db.all<{ source: string; leads: number; paid_orders: number; paid: number }>(
    `SELECT s.name AS source, COUNT(DISTINCT l.lead_id) AS leads,
            COUNT(DISTINCT CASE WHEN o.payment_state = 'CONFIRMED' THEN o.order_id END) AS paid_orders,
            COALESCE(SUM(CASE WHEN o.payment_state = 'CONFIRMED' THEN o.amount_minor END), 0) AS paid
     FROM leads l JOIN sources s ON s.source_id = l.source_id
     LEFT JOIN opportunities op ON op.lead_id = l.lead_id LEFT JOIN orders o ON o.opportunity_id = op.opportunity_id
     WHERE l.test_mode = ? GROUP BY s.source_id ORDER BY paid DESC, leads DESC`, test ? 1 : 0,
  );
  const channels = rows.map((r) => ({ source: r.source, leads: r.leads, paidOrders: r.paid_orders, paidMinor: r.paid, conversionPct: r.leads ? Math.round((r.paid_orders / r.leads) * 1000) / 10 : null }));
  const reliable = channels.some((c) => c.leads >= 30);
  return { mode: test ? 'TEST' : 'LIVE', channels, reliable, note: reliable ? 'Kanäle mit weniger als 30 Anfragen sind noch nicht aussagekräftig.' : 'Zu wenige Anfragen für belastbare Schlüsse – Zahlen nur als Orientierung.' };
}

export interface JourneyStep { from: string; to: string; cases: number; medianHours: number | null }

/** 101 Kaufweg: Median-Wartezeit zwischen den Schritten aus echten Zeitstempeln (kein Tracking). */
export function buyerJourney(ctx: AppContext, test: boolean): JourneyStep[] {
  const t = test ? 1 : 0;
  const median = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return Math.round(((s.length % 2 ? s[m] : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2) ?? 0) * 10) / 10;
  };
  const hours = (sql: string): number[] => ctx.db.all<{ h: number }>(sql, t).map((r) => r.h).filter((h) => Number.isFinite(h) && h >= 0);
  const steps: [string, string, string][] = [
    ['Anfrage', 'Angebot', `SELECT (julianday(q.created_at) - julianday(l.created_at)) * 24 AS h FROM quotes q JOIN leads l ON l.lead_id = q.lead_id WHERE q.test_mode = ?`],
    ['Angebot', 'Annahme', `SELECT (julianday(q.accepted_at) - julianday(q.created_at)) * 24 AS h FROM quotes q WHERE q.test_mode = ? AND q.accepted_at IS NOT NULL`],
    ['Annahme', 'Zahlung', `SELECT (julianday(e.created_at) - julianday(o.created_at)) * 24 AS h FROM orders o JOIN audit_events e ON e.subject_id = o.order_id AND e.event_type = 'payment.confirmed' WHERE o.test_mode = ?`],
    ['Zahlung', 'Lieferung', `SELECT (julianday(d.released_at) - julianday(e.created_at)) * 24 AS h FROM deliveries d JOIN audit_events e ON e.subject_id = d.order_id AND e.event_type = 'payment.confirmed' WHERE d.test_mode = ?`],
  ];
  return steps.map(([from, to, sql]) => { const xs = hours(sql); return { from, to, cases: xs.length, medianHours: median(xs) }; });
}

export interface CashForecast {
  mode: 'LIVE' | 'TEST';
  currency: string;
  /** Sicher bekannt: beim Anbieter verfügbar/gebunden (nach Gebühren/Erstattungen, vor Auszahlung). */
  atProviderMinor: number;
  /** Gemeldet, Bankeingang offen. */
  inTransitMinor: number;
  /** Angenommen, aber noch nicht bezahlt – unsicher (kann ausfallen). */
  unpaidAcceptedMinor: number;
  /** Offene Erstattungsanträge – mögliche Abflüsse. */
  pendingRefundsMinor: number;
  /** Erwartbar auf dem Bankkonto, wenn alles Bekannte eintrifft (ohne neue Verkäufe). */
  expectedBankMinor: number;
  /** Geschätzte Steuerrücklage (nur wenn vom Eigentümer konfiguriert) – kein verfügbares Geld. */
  taxReserveMinor: number | null;
  /** Empfohlene Erstattungsrücklage (aus 114). */
  refundReserveMinor: number;
  /** Frei verfügbar nach Rücklagen (Schätzung). */
  freeAfterReservesMinor: number;
  /** Frühestes Auszahlungsdatum laut eingetragener Anbieterfrist; null ohne Angabe – kein geratenes Datum. */
  earliestPayoutDay: string | null;
  notes: string[];
}

export function cashForecast(ctx: AppContext, test: boolean): CashForecast {
  const t = test ? 1 : 0;
  const sums = Object.fromEntries(ctx.db.all<{ account: string; s: number }>('SELECT account, COALESCE(SUM(amount_minor),0) AS s FROM ledger_entries WHERE test_mode = ? GROUP BY account', t).map((r) => [r.account, r.s])) as Record<string, number>;
  const paidOut = -(sums.payouts ?? 0);
  const atProvider = (sums.customer_payments ?? 0) + (sums.refunds ?? 0) + (sums.provider_fees ?? 0) + (sums.disputes ?? 0) - paidOut;
  const confirmed = ctx.db.get<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS s FROM payouts WHERE test_mode = ? AND status = 'SENT' AND bank_credit_confirmed = 1`, t)?.s ?? 0;
  const inTransit = Math.max(0, paidOut - confirmed);
  const unpaid = ctx.db.get<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS s FROM orders WHERE test_mode = ? AND payment_state IN ('UNPAID','PENDING')`, t)?.s ?? 0;
  const refunds = ctx.db.get<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS s FROM refund_requests WHERE test_mode = ? AND status IN ('PENDING_OWNER','REQUESTED')`, t)?.s ?? 0;
  const notes: string[] = [];
  if (unpaid > 0) notes.push('Angenommene, aber unbezahlte Aufträge sind nicht eingerechnet – sie können ausfallen.');
  if (refunds > 0) notes.push('Offene Erstattungsanträge sind als möglicher Abfluss abgezogen.');
  const delay = ctx.config.payoutDelayDays;
  const lastPayment = ctx.db.get<{ d: string | null }>(`SELECT MAX(created_at) AS d FROM ledger_entries WHERE test_mode = ? AND account = 'customer_payments'`, t)?.d ?? null;
  const earliestPayoutDay = atProvider > 0 && delay !== null && lastPayment ? new Date(Date.parse(lastPayment) + delay * 86_400_000).toISOString().slice(0, 10) : null;
  if (atProvider > 0) notes.push(delay === null ? 'Ohne eingetragene Auszahlungsfrist (PAYOUT_DELAY_DAYS) wird kein Auszahlungsdatum vorhergesagt.' : `Auszahlungsdatum laut eingetragener Frist von ${delay} Tagen – der Anbieter kann abweichen.`);
  const bps = ctx.config.taxReserveEstimateBps;
  const paid = sums.customer_payments ?? 0;
  const taxReserve = bps === null ? null : Math.ceil(Math.max(0, paid + (sums.refunds ?? 0)) * bps / 10_000);
  if (taxReserve === null) notes.push('Steuerrücklage nicht eingerichtet (TAX_RESERVE_ESTIMATE_BPS) – geprüfte Steuerregeln fehlen noch (LA-06).');
  const refundRes = refundReserve(ctx, test).reserveMinor - refunds; // offene Anträge sind schon abgezogen
  const expected = Math.max(0, atProvider + inTransit - refunds);
  return {
    mode: test ? 'TEST' : 'LIVE', currency: 'EUR', atProviderMinor: atProvider, inTransitMinor: inTransit, unpaidAcceptedMinor: unpaid, pendingRefundsMinor: refunds,
    expectedBankMinor: expected, taxReserveMinor: taxReserve, refundReserveMinor: Math.max(0, refundRes),
    freeAfterReservesMinor: Math.max(0, expected - (taxReserve ?? 0) - Math.max(0, refundRes)), earliestPayoutDay, notes,
  };
}

export interface RefundReserve {
  mode: 'LIVE' | 'TEST';
  recentPaidMinor: number;
  refundRatePct: number;
  basis: 'history' | 'minimum';
  pendingRequestsMinor: number;
  reserveMinor: number;
  explain: string;
}

/**
 * 114 Rücklage für Erstattungen: aus tatsächlichen Erstattungen der Vergangenheit (Quote) auf die bezahlten
 * Umsätze der letzten 90 Tage plus offene Erstattungsanträge. Bei weniger als 10 bezahlten Aufträgen gilt
 * vorsichtshalber eine Mindestquote von 10 %. Rücklage ist eine Empfehlung – kein auszahlbarer Gewinn, keine Buchung.
 */
export function refundReserve(ctx: AppContext, test: boolean): RefundReserve {
  const t = test ? 1 : 0;
  const since = new Date(ctx.clock().getTime() - 90 * 86_400_000).toISOString();
  const all = ctx.db.get<{ paid: number; refunded: number; n: number }>(
    `SELECT COALESCE(SUM(CASE WHEN account = 'customer_payments' THEN amount_minor END),0) AS paid,
            -COALESCE(SUM(CASE WHEN account IN ('refunds','disputes') THEN amount_minor END),0) AS refunded,
            (SELECT COUNT(*) FROM orders WHERE test_mode = ? AND payment_state IN ('CONFIRMED','REFUNDED','DISPUTED')) AS n
     FROM ledger_entries WHERE test_mode = ?`, t, t,
  ) ?? { paid: 0, refunded: 0, n: 0 };
  const recent = ctx.db.get<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS s FROM ledger_entries WHERE test_mode = ? AND account = 'customer_payments' AND created_at >= ?`, t, since)?.s ?? 0;
  const pending = ctx.db.get<{ s: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS s FROM refund_requests WHERE test_mode = ? AND status IN ('PENDING_OWNER','REQUESTED')`, t)?.s ?? 0;
  const histRate = all.paid > 0 ? all.refunded / all.paid : 0;
  const basis: RefundReserve['basis'] = all.n >= 10 ? 'history' : 'minimum';
  const rate = basis === 'history' ? histRate : Math.max(0.1, histRate);
  const reserve = Math.ceil(recent * rate) + pending;
  return {
    mode: test ? 'TEST' : 'LIVE', recentPaidMinor: recent, refundRatePct: Math.round(rate * 1000) / 10, basis, pendingRequestsMinor: pending, reserveMinor: reserve,
    explain: basis === 'history'
      ? 'Berechnet aus der tatsächlichen Erstattungsquote aller bisherigen Aufträge auf die Umsätze der letzten 90 Tage, plus offene Anträge.'
      : 'Weniger als 10 bezahlte Aufträge – vorsichtshalber mindestens 10 % der Umsätze der letzten 90 Tage, plus offene Anträge.',
  };
}

export interface FreshnessRow { source: string; status: string; lastRun: string | null; lastRunAgeDays: number | null; termsAgeDays: number | null; warnings: string[] }

/**
 * 107 Aktualität und Herkunft der Daten: freigegebene Quellen mit letztem Abruf und Alter der geprüften
 * Nutzungsbedingungen; abgelaufene Ausschreibungen, die noch offen sind, werden gemeldet (nicht als aktuell verkaufen).
 */
export function dataFreshness(ctx: AppContext, recheckDays = 90): { sources: FreshnessRow[]; expiredOpen: number } {
  const now = ctx.clock().getTime();
  const age = (iso: string | null): number | null => (iso ? Math.floor((now - Date.parse(iso)) / 86_400_000) : null);
  const sources = ctx.db.all<{ source_id: string; name: string; status: string; terms_checked_at: string | null }>(`SELECT source_id, name, status, terms_checked_at FROM sources WHERE source_id <> 'src_inbound_form' ORDER BY name`).map((s) => {
    const run = ctx.db.get<{ finished_at: string; status: string }>(`SELECT finished_at, status FROM source_fetch_runs WHERE source_id = ? ORDER BY finished_at DESC LIMIT 1`, s.source_id);
    const warnings: string[] = [];
    const termsAge = age(s.terms_checked_at);
    if (s.status === 'APPROVED' && termsAge !== null && termsAge > recheckDays) warnings.push(`Nutzungsbedingungen seit ${termsAge} Tagen nicht neu geprüft.`);
    if (s.status === 'APPROVED' && !run) warnings.push('Freigegeben, aber noch nie abgerufen.');
    if (run && run.status !== 'OK') warnings.push(`Letzter Abruf: ${run.status}.`);
    if (run && (age(run.finished_at) ?? 0) > 2 && s.status === 'APPROVED') warnings.push('Letzter erfolgreicher Abruf älter als 2 Tage.');
    return { source: s.name, status: s.status, lastRun: run?.finished_at ?? null, lastRunAgeDays: age(run?.finished_at ?? null), termsAgeDays: termsAge, warnings };
  });
  const expiredOpen = ctx.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM leads l JOIN opportunities op ON op.lead_id = l.lead_id WHERE l.expires_at IS NOT NULL AND l.expires_at < ? AND op.pipeline_state IN ('DISCOVERED','SOURCE_COMPLIANT','QUALIFIED','FEASIBILITY_APPROVED','QUOTED')`,
    ctx.clock().toISOString(),
  )?.n ?? 0;
  return { sources, expiredOpen };
}

export interface PriceBand { label: string; quotes: number; accepted: number; paid: number; acceptancePct: number | null; enoughData: boolean }

/** Ab dieser Zahl Angebote je Preisspanne werden Unterschiede überhaupt als Hinweis gezeigt (Schutz vor Zufallsgewinnern). */
export const MIN_SAMPLE = 30;

/**
 * 014/033 Annahme je Preisspanne aus echten Angeboten und Käufen. Es wird NIE ein „Gewinner“ ausgerufen, solange eine
 * Spanne weniger als 30 Angebote hat. Keine automatische Preisänderung – nur Hinweis für den Eigentümer.
 */
export function priceAcceptance(ctx: AppContext, test: boolean): { bands: PriceBand[]; hint: string } {
  const rows = ctx.db.all<{ band: number; quotes: number; accepted: number; paid: number }>(
    `SELECT CASE WHEN q.gross_total_minor < 10000 THEN 0 WHEN q.gross_total_minor < 50000 THEN 1 ELSE 2 END AS band,
            COUNT(*) AS quotes, SUM(q.accepted) AS accepted,
            SUM(CASE WHEN o.payment_state = 'CONFIRMED' THEN 1 ELSE 0 END) AS paid
     FROM quotes q LEFT JOIN orders o ON o.quote_id = q.quote_id WHERE q.test_mode = ? GROUP BY band`, test ? 1 : 0,
  );
  const labels = ['unter 100 €', '100 bis 500 €', 'über 500 €'];
  const bands = labels.map((label, i) => {
    const r = rows.find((x) => x.band === i);
    const quotes = r?.quotes ?? 0;
    return { label, quotes, accepted: r?.accepted ?? 0, paid: r?.paid ?? 0, acceptancePct: quotes ? Math.round(((r?.accepted ?? 0) / quotes) * 1000) / 10 : null, enoughData: quotes >= MIN_SAMPLE };
  });
  const eligible = bands.filter((b) => b.enoughData);
  const hint = eligible.length < 2
    ? `Noch zu wenige Angebote für Preisvergleiche (mindestens ${MIN_SAMPLE} je Preisspanne). Preise werden nicht automatisch geändert.`
    : `Höchste Annahmequote: ${[...eligible].sort((a, b) => (b.acceptancePct ?? 0) - (a.acceptancePct ?? 0))[0]?.label}. Nur ein Hinweis – Preisänderungen entscheidest du.`;
  return { bands, hint };
}

export interface LifecycleRow { product: string; version: number; orders: number; delivered: number; qaFailed: number; defects: number; lastSale: string | null; status: 'neu' | 'stabil' | 'prüfen'; reason: string }

/** 087 Lebenszyklus je Produktart aus echten Aufträgen, Prüfungen und Mangelmeldungen – Empfehlung, keine automatische Änderung. */
export function productLifecycle(ctx: AppContext, test: boolean, products: { id: string; version: number; enabled: boolean }[]): LifecycleRow[] {
  const t = test ? 1 : 0;
  return products.filter((p) => p.enabled).map((p) => {
    const r = ctx.db.get<{ orders: number; delivered: number; last: string | null }>(
      `SELECT COUNT(o.order_id) AS orders, COUNT(d.delivery_id) AS delivered, MAX(CASE WHEN o.payment_state = 'CONFIRMED' THEN o.created_at END) AS last
       FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id LEFT JOIN deliveries d ON d.order_id = o.order_id
       WHERE op.capability_id = ? AND o.test_mode = ?`, p.id, t,
    ) ?? { orders: 0, delivered: 0, last: null };
    const qaFailed = ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.capability_id = ? AND a.test_mode = ? AND q.passed = 0', p.id, t)?.n ?? 0;
    const defects = ctx.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM delivery_acceptances da JOIN orders o ON o.order_id = da.order_id JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE op.capability_id = ? AND da.test_mode = ? AND da.decision = 'DEFECT_REPORTED'`, p.id, t,
    )?.n ?? 0;
    const problemRate = r.delivered ? (qaFailed + defects) / r.delivered : 0;
    const status: LifecycleRow['status'] = r.delivered < 5 ? 'neu' : problemRate > 0.2 ? 'prüfen' : 'stabil';
    const reason = status === 'neu' ? 'Weniger als 5 Lieferungen – noch zu früh für eine Bewertung.' : status === 'prüfen' ? `Hohe Problemquote (${Math.round(problemRate * 100)} % Prüffehler oder Mängel) – Version überarbeiten.` : 'Wenige Probleme bei ausreichend Lieferungen.';
    return { product: p.id, version: p.version, orders: r.orders, delivered: r.delivered, qaFailed, defects, lastSale: r.last, status, reason };
  });
}

export interface PortfolioRow { product: string; paidOrders: number; revenueMinor: number; feesMinor: number; refundsMinor: number; contributionMinor: number; avgItems: number }

/** 050 Portfolio: Deckungsbeitrag je Produktart aus dem Hauptbuch (Zahlungen − Gebühren − Erstattungen) und Aufwand (Positionen). */
export function productPortfolio(ctx: AppContext, test: boolean): PortfolioRow[] {
  return ctx.db.all<{ product: string; paid_orders: number; revenue: number; fees: number; refunds: number; avg_items: number | null }>(
    `SELECT op.capability_id AS product,
            COUNT(DISTINCT CASE WHEN o.payment_state IN ('CONFIRMED','REFUNDED','DISPUTED') THEN o.order_id END) AS paid_orders,
            COALESCE(SUM(CASE WHEN l.account = 'customer_payments' THEN l.amount_minor END), 0) AS revenue,
            -COALESCE(SUM(CASE WHEN l.account = 'provider_fees' THEN l.amount_minor END), 0) AS fees,
            -COALESCE(SUM(CASE WHEN l.account IN ('refunds','disputes') THEN l.amount_minor END), 0) AS refunds,
            AVG(json_array_length(json_extract(op.scope_json, '$.items'))) AS avg_items
     FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id LEFT JOIN ledger_entries l ON l.order_id = o.order_id
     WHERE o.test_mode = ? AND op.capability_id IS NOT NULL GROUP BY op.capability_id ORDER BY revenue DESC`, test ? 1 : 0,
  ).map((r) => ({ product: r.product, paidOrders: r.paid_orders, revenueMinor: r.revenue, feesMinor: r.fees, refundsMinor: r.refunds, contributionMinor: r.revenue - r.fees - r.refunds, avgItems: Math.round((r.avg_items ?? 0) * 10) / 10 }));
}

export type BuyerSignal = 'bezahlt' | 'angenommen' | 'angebot_offen' | 'nur_anfrage';

/**
 * 051 Käufersignale: trennt nachweisbar zahlende Käufer von unverbindlichen Interessenten – ausschließlich aus eigenen
 * Vorgängen (Anfrage → Angebot → Annahme → Zahlung). Keine externen Daten, kein Scoring von Personenmerkmalen.
 */
export function buyerSignals(ctx: AppContext, test: boolean): Record<BuyerSignal, number> {
  const rows = ctx.db.all<{ sig: BuyerSignal; n: number }>(
    `SELECT sig, COUNT(*) AS n FROM (
       SELECT l.lead_id,
         CASE WHEN EXISTS (SELECT 1 FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE op.lead_id = l.lead_id AND o.payment_state = 'CONFIRMED') THEN 'bezahlt'
              WHEN EXISTS (SELECT 1 FROM quotes q WHERE q.lead_id = l.lead_id AND q.accepted = 1) THEN 'angenommen'
              WHEN EXISTS (SELECT 1 FROM quotes q WHERE q.lead_id = l.lead_id) THEN 'angebot_offen'
              ELSE 'nur_anfrage' END AS sig
       FROM leads l WHERE l.test_mode = ? AND l.erased_at IS NULL) GROUP BY sig`, test ? 1 : 0,
  );
  const out: Record<BuyerSignal, number> = { bezahlt: 0, angenommen: 0, angebot_offen: 0, nur_anfrage: 0 };
  for (const r of rows) out[r.sig] = r.n;
  return out;
}

export interface FollowUpCandidate { customerRef: string; reason: string; contactAllowed: boolean }

/**
 * 058 Mögliche Folgeangebote: zufriedene Kunden (abgenommen, Bewertung ≥ 4) mit einer passenden, freigegebenen
 * Ergänzung. Es wird NICHTS versendet; „Kontakt erlaubt“ nur mit aktiver Einwilligung für E-Mail-Neuigkeiten.
 */
export function followUpCandidates(ctx: AppContext, test: boolean, allowedProducts: readonly string[]): FollowUpCandidate[] {
  const rows = ctx.db.all<{ customer_id: string; lead_id: string; products: string; rating: number | null }>(
    `SELECT c.customer_id, c.lead_id, GROUP_CONCAT(DISTINCT op.capability_id) AS products, MAX(f.rating) AS rating
     FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN opportunities op ON op.opportunity_id = o.opportunity_id
     JOIN delivery_acceptances da ON da.order_id = o.order_id AND da.decision = 'ACCEPTED'
     LEFT JOIN customer_feedback f ON f.order_id = o.order_id
     WHERE c.test_mode = ? AND c.erased_at IS NULL GROUP BY c.customer_id`, test ? 1 : 0,
  );
  return rows.filter((r) => (r.rating ?? 0) >= 4).flatMap((r, i) => {
    const owned = r.products.split(',');
    const missing = allowedProducts.filter((p) => !owned.includes(p));
    if (missing.length === 0) return [];
    const consent = !!ctx.db.get(`SELECT 1 AS x FROM consents WHERE lead_id = ? AND purpose = 'marketing_email' AND withdrawn_at IS NULL`, r.lead_id);
    return [{ customerRef: `Kunde ${i + 1}`, reason: `Zufrieden (${r.rating}/5); noch nicht genutzt: ${missing.join(', ')}`, contactAllowed: consent }];
  });
}

/** 099 Abhängigkeit je Produktart (Anteil am bezahlten Umsatz). Marktplätze: derzeit keine angebunden. */
export function productConcentration(ctx: AppContext, test: boolean): { product: string; sharePct: number }[] {
  const rows = ctx.db.all<{ product: string; s: number }>(
    `SELECT op.capability_id AS product, SUM(o.amount_minor) AS s FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id
     WHERE o.test_mode = ? AND o.payment_state = 'CONFIRMED' GROUP BY op.capability_id ORDER BY s DESC`, test ? 1 : 0,
  );
  const total = rows.reduce((a, r) => a + r.s, 0);
  return rows.map((r) => ({ product: r.product, sharePct: total ? Math.round((r.s / total) * 1000) / 10 : 0 }));
}

export interface Concentration {
  mode: 'LIVE' | 'TEST';
  customers: number;
  totalMinor: number;
  top: { label: string; minor: number; sharePct: number }[];
  topSharePct: number;
  level: 'none' | 'ok' | 'watch' | 'high';
  explain: string;
}

/** Kunden werden anonymisiert („Kunde 1“) dargestellt – für die Auswertung reicht die Verteilung. */
export function customerConcentration(ctx: AppContext, test: boolean): Concentration {
  const rows = ctx.db.all<{ customer_id: string; s: number }>(
    `SELECT customer_id, SUM(amount_minor) AS s FROM orders WHERE test_mode = ? AND payment_state = 'CONFIRMED' GROUP BY customer_id ORDER BY s DESC`, test ? 1 : 0,
  );
  const total = rows.reduce((a, r) => a + r.s, 0);
  const top = rows.slice(0, 3).map((r, i) => ({ label: `Kunde ${i + 1}`, minor: r.s, sharePct: total ? Math.round((r.s / total) * 1000) / 10 : 0 }));
  const topShare = top[0]?.sharePct ?? 0;
  const level = rows.length === 0 ? 'none' : rows.length < 3 || topShare >= 50 ? 'high' : topShare >= 30 ? 'watch' : 'ok';
  const explain = level === 'none' ? 'Noch keine bezahlten Aufträge – keine Auswertung möglich.'
    : level === 'high' ? 'Ein großer Teil des Umsatzes hängt an sehr wenigen Kunden. Fällt einer weg, bricht der Umsatz deutlich ein.'
      : level === 'watch' ? 'Der größte Kunde hat einen spürbaren Anteil. Weitere Kunden würden das Risiko senken.'
        : 'Der Umsatz ist auf mehrere Kunden verteilt.';
  return { mode: test ? 'TEST' : 'LIVE', customers: rows.length, totalMinor: total, top, topSharePct: topShare, level, explain };
}
