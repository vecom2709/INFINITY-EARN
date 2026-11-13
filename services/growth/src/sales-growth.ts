import { newId, randomToken } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';

/**
 * Wachstumsfunktionen im bestehenden Lead-, Auftrags- und Zahlungskern (Gesamtprompt 15.0, Anlage E/G):
 *   132 Zeitpunkt-Signale · 138 Antwort-Warteschlange · 139 Partner und Provisionen · 140 Erste-Kunden-Experimente
 *   155 Funnel bis zur Bank · Herkunft einer Anfrage (Kanal/Kampagne, datensparsam).
 * Alles wird aus echten Datensätzen berechnet. Unbekanntes bleibt unbekannt – keine Wahrscheinlichkeiten, keine Volumina,
 * kein Umsatz ohne bestätigtes Zahlungsereignis, keine Bankbuchung ohne Bankbeleg.
 */

const t = (ctx: AppContext, test?: boolean): number => ((test ?? ctx.config.testMode) ? 1 : 0);
const DAY = 86_400_000;

// ---------------------------------------------------------------------------------------------------------------
// Herkunft (155/139): nur freiwillig mitgegebene, technisch harmlose Parameter. Kein Tracking-Cookie, kein Fingerprint.
export const CHANNELS = ['website', 'advisor', 'product-page', 'landing', 'content', 'partner', 'ted', 'social', 'newsletter'] as const;

export function cleanToken(raw: string | null | undefined, max = 40): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,60}$/.test(v) ? v.slice(0, max) : null;
}

/** Setzt Kanal/Kampagne eines Leads nur beim ersten Mal (First-Touch); Partnercode erzeugt eine Empfehlung. */
export function recordAcquisition(ctx: AppContext, leadId: string, opts: { channel?: string | null; campaign?: string | null; ref?: string | null }): void {
  const channel = cleanToken(opts.channel);
  const campaign = cleanToken(opts.campaign);
  const row = ctx.db.get<{ acquisition_channel: string | null }>('SELECT acquisition_channel FROM leads WHERE lead_id = ?', leadId);
  if (!row) return;
  if (!row.acquisition_channel && channel && (CHANNELS as readonly string[]).includes(channel)) {
    ctx.db.run('UPDATE leads SET acquisition_channel = ?, acquisition_campaign = ? WHERE lead_id = ?', channel, campaign, leadId);
  }
  const ref = cleanToken(opts.ref, 24);
  if (ref) attachReferral(ctx, leadId, ref);
}

// ---------------------------------------------------------------------------------------------------------------
// 132 Zeitpunkt-Signale aus belegten Ereignissen (heute: Fristen öffentlicher Ausschreibungen).
export interface TimingSignal {
  opportunityId: string; title: string; signalType: 'TENDER_DEADLINE'; publishedDate: string; eventDate: string | null;
  bestContactWindow: { from: string; to: string } | null; reasonCodes: string[]; evidenceRefs: string[];
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW' | 'TIMING_UNCERTAIN'; expiry: string | null;
}

export function timingSignals(ctx: AppContext, test?: boolean): TimingSignal[] {
  const now = ctx.clock().getTime();
  const rows = ctx.db.all<{ opportunity_id: string; message: string | null; company: string | null; created_at: string; expires_at: string | null; source_url: string; buyer_signal: string | null; purchase_intent_evidence: string | null; pipeline_state: string }>(
    `SELECT o.opportunity_id, l.message, l.company, l.created_at, l.expires_at, l.source_url, l.buyer_signal, l.purchase_intent_evidence, o.pipeline_state
     FROM opportunities o JOIN leads l ON l.lead_id = o.lead_id WHERE l.source_id = 'src_ted_eu' AND o.test_mode = ? ORDER BY l.expires_at`, t(ctx, test));
  return rows.map((r) => {
    const evidence = [r.source_url, r.buyer_signal, r.purchase_intent_evidence].filter((x): x is string => !!x);
    const deadline = r.expires_at ? Date.parse(r.expires_at) : Number.NaN;
    const reasons: string[] = [];
    let band: TimingSignal['confidenceBand'] = 'TIMING_UNCERTAIN';
    let window: TimingSignal['bestContactWindow'] = null;
    if (Number.isFinite(deadline)) {
      const daysLeft = Math.floor((deadline - now) / DAY);
      if (daysLeft < 0) reasons.push('FRIST_ABGELAUFEN');
      else {
        reasons.push(`FRIST_IN_${daysLeft}_TAGEN`);
        // Angebot braucht Vorlauf: mindestens 2 Tage vor Fristende einreichen.
        const to = deadline - 2 * DAY;
        if (to > now) window = { from: new Date(now).toISOString().slice(0, 10), to: new Date(to).toISOString().slice(0, 10) };
        else reasons.push('ZU_KNAPP_FUER_SORGFAELTIGES_ANGEBOT');
        band = evidence.length >= 3 ? 'HIGH' : evidence.length === 2 ? 'MEDIUM' : 'LOW';
        if (!window) band = 'LOW';
      }
    } else reasons.push('KEINE_BELEGTE_FRIST');
    if (evidence.length < 2) reasons.push('WENIG_BELEGE');
    return {
      opportunityId: r.opportunity_id, title: (r.message ?? r.company ?? '').slice(0, 120), signalType: 'TENDER_DEADLINE', publishedDate: r.created_at.slice(0, 10),
      eventDate: r.expires_at ? r.expires_at.slice(0, 10) : null, bestContactWindow: window, reasonCodes: reasons, evidenceRefs: evidence, confidenceBand: band, expiry: r.expires_at,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// 138 Antwort-Warteschlange aus echten Zeitstempeln: Eingang (Lead) → Angebot → Nachricht (Postausgang).
export type ResponseState = 'QUEUED' | 'PREPARED' | 'SENT' | 'POLICY_BLOCKED' | 'QUOTA_BLOCKED' | 'EXPIRED' | 'FAILED';
export interface ResponseItem { leadId: string; opportunityId: string; receivedAt: string; deadlineAt: string | null; priority: number; state: ResponseState; firstResponseMinutes: number | null; reason: string; next: string }

export function responseQueue(ctx: AppContext, test?: boolean): ResponseItem[] {
  const now = ctx.clock().getTime();
  const rows = ctx.db.all<{ lead_id: string; opportunity_id: string; created_at: string; expires_at: string | null; pipeline_state: string; quote_at: string | null; msg_status: string | null; msg_reason: string | null }>(
    `SELECT l.lead_id, o.opportunity_id, l.created_at, l.expires_at, o.pipeline_state,
       (SELECT MIN(q.created_at) FROM quotes q WHERE q.opportunity_id = o.opportunity_id) AS quote_at,
       (SELECT m.status FROM outbox_messages m WHERE m.lead_id = l.lead_id ORDER BY m.created_at DESC LIMIT 1) AS msg_status,
       (SELECT m.reason FROM outbox_messages m WHERE m.lead_id = l.lead_id ORDER BY m.created_at DESC LIMIT 1) AS msg_reason
     FROM leads l JOIN opportunities o ON o.lead_id = l.lead_id WHERE l.source_id = 'src_inbound_form' AND l.test_mode = ? ORDER BY l.created_at DESC LIMIT 200`, t(ctx, test));
  return rows.map((r) => {
    const received = Date.parse(r.created_at);
    const deadline = r.expires_at ? Date.parse(r.expires_at) : null;
    let state: ResponseState;
    let reason: string;
    let next: string;
    if (r.msg_status === 'SENT') { state = 'SENT'; reason = 'Nachricht vom Versandanbieter bestätigt'; next = 'Auf Annahme warten'; }
    else if (r.msg_status === 'BLOCKED' || r.msg_status === 'SUPPRESSED') { state = 'POLICY_BLOCKED'; reason = r.msg_reason ?? 'Kontaktregel verbietet den Versand'; next = 'Kunde sieht sein Angebot im Portal/Link; kein Versand'; }
    else if (r.msg_status === 'HELD') { state = 'QUOTA_BLOCKED'; reason = r.msg_reason ?? 'Kein Versandkanal verbunden'; next = 'E-Mail-Anbieter verbinden (Eigentümer)'; }
    else if (r.quote_at) { state = 'PREPARED'; reason = 'Angebot erstellt, Kunde hat den Link direkt erhalten'; next = 'Keine Aktion nötig'; }
    else if (deadline !== null && deadline < now) { state = 'EXPIRED'; reason = 'Anfrage abgelaufen'; next = 'Nichts senden'; }
    else if (['OUT_OF_SCOPE', 'LICENCE_RISK', 'NO_CAPACITY', 'MANUAL_REVIEW', 'COST_LIMIT'].includes(r.pipeline_state)) { state = 'FAILED'; reason = `Nicht automatisch lieferbar (${r.pipeline_state})`; next = 'Ehrlich absagen oder manuell prüfen'; }
    else { state = 'QUEUED'; reason = 'Offene Punkte oder Prüfung ausstehend'; next = 'Fehlende Angaben anfordern'; }
    const hoursLeft = deadline !== null ? (deadline - now) / 3_600_000 : null;
    const priority = state === 'QUEUED' || state === 'FAILED' ? (hoursLeft !== null && hoursLeft < 48 ? 1 : 2) : 3;
    return {
      leadId: r.lead_id, opportunityId: r.opportunity_id, receivedAt: r.created_at, deadlineAt: r.expires_at, priority, state,
      firstResponseMinutes: r.quote_at ? Math.max(0, Math.round((Date.parse(r.quote_at) - received) / 60_000)) : null, reason, next,
    };
  }).sort((a, b) => a.priority - b.priority || a.receivedAt.localeCompare(b.receivedAt));
}

// ---------------------------------------------------------------------------------------------------------------
// 139 Partnernetzwerk.
export interface PartnerRow { partner_id: string; name: string; consent_ref: string; contract_ref: string; territory: string; capabilities_json: string; commission_bps: number; status: string; referral_code: string; test_mode: number; created_at: string }

export function addPartner(ctx: AppContext, input: { name: string; consentRef: string; contractRef: string; territory: string; capabilities: string[]; commissionBps: number }): PartnerRow {
  if (!input.name.trim()) throw new WorkflowError('PARTNER_NAME_MISSING');
  if (!input.consentRef.trim() || !input.contractRef.trim()) throw new WorkflowError('PARTNER_CONSENT_OR_CONTRACT_MISSING', 'Teilnahme nur mit ausdrücklicher Zustimmung und Vertrag.');
  if (!/^[A-Z]{2}(,[A-Z]{2})*$/.test(input.territory)) throw new WorkflowError('PARTNER_TERRITORY_INVALID');
  if (!Number.isInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > 3000) throw new WorkflowError('PARTNER_COMMISSION_INVALID', '0–30 %');
  const id = newId('ptn');
  const code = `p-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || id.slice(-8)}`;
  ctx.db.run(
    `INSERT INTO partners (partner_id, name, consent_ref, contract_ref, territory, capabilities_json, commission_bps, status, referral_code, test_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
    id, input.name.trim().slice(0, 120), input.consentRef.trim().slice(0, 200), input.contractRef.trim().slice(0, 200), input.territory, JSON.stringify(input.capabilities), input.commissionBps, code, t(ctx), ctx.clock().toISOString(),
  );
  ctx.audit.record({ type: 'partner.added', actor: 'owner', subjectType: 'partner', subjectId: id, data: { territory: input.territory, commission_bps: input.commissionBps }, testMode: ctx.config.testMode });
  return ctx.db.get<PartnerRow>('SELECT * FROM partners WHERE partner_id = ?', id) as PartnerRow;
}

export function setPartnerStatus(ctx: AppContext, partnerId: string, status: 'ACTIVE' | 'PAUSED' | 'ENDED'): void {
  ctx.db.run('UPDATE partners SET status = ? WHERE partner_id = ?', status, partnerId);
  ctx.audit.record({ type: 'partner.status', actor: 'owner', subjectType: 'partner', subjectId: partnerId, data: { status }, testMode: ctx.config.testMode });
}

/** Empfehlung nur für aktive Partner; ein Lead gehört höchstens einem Partner (erste Zuordnung zählt). */
export function attachReferral(ctx: AppContext, leadId: string, code: string): string | null {
  const p = ctx.db.get<{ partner_id: string }>(`SELECT partner_id FROM partners WHERE referral_code = ? AND status = 'ACTIVE' AND test_mode = ?`, code, t(ctx));
  if (!p) return null;
  if (ctx.db.get('SELECT 1 AS x FROM referrals WHERE lead_id = ?', leadId)) return null;
  const id = newId('ref');
  ctx.db.run(`INSERT INTO referrals (referral_id, partner_id, lead_id, attribution_rule, created_at) VALUES (?, ?, ?, 'first_touch_referral_code', ?)`, id, p.partner_id, leadId, ctx.clock().toISOString());
  ctx.db.run(`UPDATE leads SET acquisition_channel = COALESCE(acquisition_channel, 'partner') WHERE lead_id = ?`, leadId);
  return id;
}

/** Provision nur für Aufträge mit bestätigtem Zahlungsereignis, nicht erstattet. Auszahlung erst nach Freigabe (PENDING_OWNER). */
export function accrueCommissions(ctx: AppContext): number {
  const rows = ctx.db.all<{ referral_id: string; order_id: string; amount_minor: number; currency: string; commission_bps: number; event: string | null; test_mode: number }>(
    `SELECT r.referral_id, o.order_id, o.amount_minor, o.currency, p.commission_bps, o.test_mode,
       (SELECT e.provider_event_id FROM payment_events e WHERE e.order_id = o.order_id AND e.event_type IN ('checkout.session.completed','payment_intent.succeeded') ORDER BY e.id LIMIT 1) AS event
     FROM referrals r JOIN partners p ON p.partner_id = r.partner_id JOIN orders o ON o.customer_id IN (SELECT customer_id FROM customers c WHERE c.lead_id = r.lead_id)
     WHERE o.payment_state = 'CONFIRMED' AND NOT EXISTS (SELECT 1 FROM partner_commissions pc WHERE pc.order_id = o.order_id)`);
  let n = 0;
  for (const r of rows) {
    if (!r.event) continue; // ohne Zahlungsereignis keine Provision
    ctx.db.run(
      `INSERT INTO partner_commissions (commission_id, referral_id, order_id, base_minor, amount_minor, currency, payment_event_ref, state, test_mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_OWNER', ?, ?)`,
      newId('com'), r.referral_id, r.order_id, r.amount_minor, Math.floor((r.amount_minor * r.commission_bps) / 10_000), r.currency, r.event, r.test_mode, ctx.clock().toISOString(),
    );
    n++;
  }
  // Erstattete oder angefochtene Aufträge: offene Provision verfällt.
  ctx.db.run(`UPDATE partner_commissions SET state = 'VOID' WHERE state = 'PENDING_OWNER' AND order_id IN (SELECT order_id FROM orders WHERE payment_state IN ('REFUNDED','DISPUTED'))`);
  return n;
}

export function decideCommission(ctx: AppContext, commissionId: string, approve: boolean): void {
  const c = ctx.db.get<{ state: string }>('SELECT state FROM partner_commissions WHERE commission_id = ?', commissionId);
  if (!c) throw new WorkflowError('COMMISSION_NOT_FOUND');
  if (c.state !== 'PENDING_OWNER') throw new WorkflowError('COMMISSION_NOT_PENDING', c.state);
  ctx.db.run('UPDATE partner_commissions SET state = ? WHERE commission_id = ?', approve ? 'APPROVED' : 'VOID', commissionId);
  ctx.audit.record({ type: approve ? 'partner.commission_approved' : 'partner.commission_void', actor: 'owner', subjectType: 'commission', subjectId: commissionId, testMode: ctx.config.testMode });
}

export function partnerOverview(ctx: AppContext, test?: boolean): { partner: PartnerRow; referrals: number; paidOrders: number; pendingMinor: number; approvedMinor: number }[] {
  return ctx.db.all<PartnerRow>('SELECT * FROM partners WHERE test_mode = ? ORDER BY created_at DESC', t(ctx, test)).map((p) => ({
    partner: p,
    referrals: ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM referrals WHERE partner_id = ?', p.partner_id)?.n ?? 0,
    paidOrders: ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM partner_commissions pc JOIN referrals r ON r.referral_id = pc.referral_id WHERE r.partner_id = ? AND pc.state <> 'VOID'`, p.partner_id)?.n ?? 0,
    pendingMinor: ctx.db.get<{ n: number }>(`SELECT COALESCE(SUM(pc.amount_minor),0) AS n FROM partner_commissions pc JOIN referrals r ON r.referral_id = pc.referral_id WHERE r.partner_id = ? AND pc.state = 'PENDING_OWNER'`, p.partner_id)?.n ?? 0,
    approvedMinor: ctx.db.get<{ n: number }>(`SELECT COALESCE(SUM(pc.amount_minor),0) AS n FROM partner_commissions pc JOIN referrals r ON r.referral_id = pc.referral_id WHERE r.partner_id = ? AND pc.state = 'APPROVED'`, p.partner_id)?.n ?? 0,
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// 140 Erste-Kunden-Experimente: Budget fest 0 €, Entscheidung nur aus echten bezahlten Aufträgen.
export interface ExperimentRow { experiment_id: string; capability_id: string; hypothesis: string; primary_metric: string; permitted_channels_json: string; max_spend_eur: number; start_at: string; end_at: string; decision: string; decided_at: string | null; created_at: string }

export function proposeExperiment(ctx: AppContext, input: { capabilityId: string; hypothesis: string; channels: string[]; days: number }): ExperimentRow {
  if (!input.hypothesis.trim()) throw new WorkflowError('HYPOTHESIS_MISSING');
  const bad = input.channels.filter((c) => !(CHANNELS as readonly string[]).includes(c) || c === 'ted');
  if (!input.channels.length || input.channels.length > 3 || bad.length) throw new WorkflowError('CHANNELS_INVALID', '1–3 erlaubte eigene Kanäle');
  if (!Number.isInteger(input.days) || input.days < 7 || input.days > 90) throw new WorkflowError('DURATION_INVALID', '7–90 Tage');
  const now = ctx.clock();
  const id = newId('exp');
  ctx.db.run(
    `INSERT INTO first_customer_experiments (experiment_id, capability_id, hypothesis, primary_metric, permitted_channels_json, max_spend_eur, start_at, end_at, decision, created_at) VALUES (?, ?, ?, 'verified_paid_orders', ?, 0, ?, ?, 'RUNNING', ?)`,
    id, input.capabilityId, input.hypothesis.trim().slice(0, 300), JSON.stringify(input.channels), now.toISOString(), new Date(now.getTime() + input.days * DAY).toISOString(), now.toISOString(),
  );
  ctx.audit.record({ type: 'experiment.started', actor: 'owner', subjectType: 'experiment', subjectId: id, data: { capability: input.capabilityId, max_spend_eur: 0 }, testMode: ctx.config.testMode });
  return ctx.db.get<ExperimentRow>('SELECT * FROM first_customer_experiments WHERE experiment_id = ?', id) as ExperimentRow;
}

/** Zählt echte bezahlte Aufträge (Live; im Testbetrieb getrennt als Test) und entscheidet nüchtern. */
export function evaluateExperiments(ctx: AppContext): { id: string; decision: string; livePaid: number; testPaid: number; inquiries: number }[] {
  const now = ctx.clock().toISOString();
  return ctx.db.all<ExperimentRow>('SELECT * FROM first_customer_experiments ORDER BY created_at DESC').map((x) => {
    const paid = (mode: number): number => ctx.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id
       WHERE op.capability_id = ? AND o.payment_state IN ('CONFIRMED') AND o.test_mode = ? AND o.created_at >= ? AND o.created_at <= ?
       AND EXISTS (SELECT 1 FROM payment_events e WHERE e.order_id = o.order_id)`, x.capability_id, mode, x.start_at, x.end_at)?.n ?? 0;
    const livePaid = paid(0);
    const testPaid = paid(1);
    const inquiries = ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM opportunities WHERE capability_id = ? AND created_at >= ? AND created_at <= ? AND test_mode = 0', x.capability_id, x.start_at, x.end_at)?.n ?? 0;
    let decision = x.decision;
    if (decision === 'RUNNING' || decision === 'FIRST_PAID_ORDER_VERIFIED') {
      if (livePaid >= 3) decision = 'SCALE_ELIGIBLE';
      else if (livePaid >= 1) decision = 'FIRST_PAID_ORDER_VERIFIED';
      else if (now > x.end_at) decision = 'NO_DEMAND';
      if (decision !== x.decision) ctx.db.run('UPDATE first_customer_experiments SET decision = ?, decided_at = ? WHERE experiment_id = ?', decision, now, x.experiment_id);
    }
    return { id: x.experiment_id, decision, livePaid, testPaid, inquiries };
  });
}

export function stopExperiment(ctx: AppContext, id: string): void {
  ctx.db.run(`UPDATE first_customer_experiments SET decision = 'STOPPED', decided_at = ? WHERE experiment_id = ? AND decision IN ('RUNNING','EXPERIMENT_PROPOSED','FIRST_PAID_ORDER_VERIFIED')`, ctx.clock().toISOString(), id);
}

// ---------------------------------------------------------------------------------------------------------------
// 155 Funnel von der Suche bis zur Bank.
export type Measured = { value: number } | { unavailable: string };
export interface FunnelRow {
  channel: string; impressions: Measured; clicks: Measured; leads: number; qualified: number; quotes: number; paidOrders: number;
  delivered: number; paymentsMinor: number; feesMinor: number; refundsMinor: number; netMinor: number;
}
export interface Funnel { rows: FunnelRow[]; payoutsMinor: number; bankVerifiedMinor: number; currency: string; optimization: 'PAUSED_INSUFFICIENT_DATA' | 'READY'; note: string }

export function funnel(ctx: AppContext, test?: boolean): Funnel {
  const mode = t(ctx, test);
  const channels = ctx.db.all<{ ch: string }>(`SELECT DISTINCT COALESCE(acquisition_channel, CASE WHEN source_id = 'src_ted_eu' THEN 'ted' ELSE 'unattributed' END) AS ch FROM leads WHERE test_mode = ?`, mode).map((r) => r.ch);
  const chExpr = `COALESCE(l.acquisition_channel, CASE WHEN l.source_id = 'src_ted_eu' THEN 'ted' ELSE 'unattributed' END)`;
  const n = (sql: string, ch: string): number => ctx.db.get<{ n: number }>(sql, mode, ch)?.n ?? 0;
  const rows = channels.map((ch): FunnelRow => {
    const ledger = (account: string): number => ctx.db.get<{ n: number }>(
      `SELECT COALESCE(SUM(le.amount_minor),0) AS n FROM ledger_entries le JOIN orders o ON o.order_id = le.order_id JOIN customers c ON c.customer_id = o.customer_id JOIN leads l ON l.lead_id = c.lead_id
       WHERE le.account = ? AND le.test_mode = ? AND ${chExpr} = ?`, account, mode, ch)?.n ?? 0;
    const payments = ledger('customer_payments');
    const fees = Math.abs(ledger('provider_fees'));
    const refunds = Math.abs(ledger('refunds'));
    return {
      channel: ch,
      impressions: { unavailable: 'Search Console nicht verbunden' },
      clicks: { unavailable: 'Keine Klickmessung verbunden (keine Tracking-Cookies)' },
      leads: n(`SELECT COUNT(*) AS n FROM leads l WHERE l.test_mode = ? AND ${chExpr} = ?`, ch),
      qualified: n(`SELECT COUNT(*) AS n FROM leads l WHERE l.test_mode = ? AND ${chExpr} = ? AND l.status = 'QUALIFIED'`, ch),
      quotes: n(`SELECT COUNT(*) AS n FROM quotes q JOIN leads l ON l.lead_id = q.lead_id WHERE q.test_mode = ? AND ${chExpr} = ?`, ch),
      paidOrders: n(`SELECT COUNT(*) AS n FROM orders o JOIN customers c ON c.customer_id = o.customer_id JOIN leads l ON l.lead_id = c.lead_id WHERE o.test_mode = ? AND ${chExpr} = ? AND o.payment_state IN ('CONFIRMED','REFUNDED') AND EXISTS (SELECT 1 FROM payment_events e WHERE e.order_id = o.order_id)`, ch),
      delivered: n(`SELECT COUNT(*) AS n FROM deliveries d JOIN customers c ON c.customer_id = d.customer_id JOIN leads l ON l.lead_id = c.lead_id WHERE d.test_mode = ? AND ${chExpr} = ?`, ch),
      paymentsMinor: payments, feesMinor: fees, refundsMinor: refunds, netMinor: payments - fees - refunds,
    };
  });
  const payoutsMinor = ctx.db.get<{ n: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS n FROM payouts WHERE status = 'SENT' AND test_mode = ?`, mode)?.n ?? 0;
  const bankVerifiedMinor = ctx.db.get<{ n: number }>(`SELECT COALESCE(SUM(amount_minor),0) AS n FROM payouts WHERE status = 'SENT' AND bank_credit_confirmed = 1 AND test_mode = ?`, mode)?.n ?? 0;
  const totalPaid = rows.reduce((s, r) => s + r.paidOrders, 0);
  return {
    rows, payoutsMinor, bankVerifiedMinor, currency: ctx.config.policy.quote.currency,
    optimization: totalPaid < 20 ? 'PAUSED_INSUFFICIENT_DATA' : 'READY',
    note: totalPaid < 20 ? `Erst ${totalPaid} bezahlte Aufträge – zu wenig für belastbare Aussagen; keine automatische Optimierung.` : 'Genug Daten für vorsichtige Tests (Änderungen nur mit Freigabe).',
  };
}
