import { priceFromCost } from '../../../packages/contracts/src/money.ts';
import { validate } from '../../../packages/contracts/src/schemas.ts';
import { newId, randomToken, safeEqual, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { parseJsonOr } from '../../../packages/shared/src/text.ts';
import { legalGate, type LegalScope } from '../../product-factory/src/legal.ts';
import { getCapability, routeCapability } from '../../product-factory/src/registry.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';
import { getOpportunity, transition } from './opportunities.ts';
import { getOrder, type OrderRow } from './orders.ts';
import { decide, effectivePolicy } from './policy-store.ts';
import { marketAllows } from './readiness.ts';
import { createConfirmation } from './contract-confirmation.ts';

export const QUOTE_VALIDITY_DAYS = 14;

interface LeadRow {
  lead_id: string;
  name: string | null;
  email: string | null;
  country: string | null;
  intent_verified: number;
  expires_at: string | null;
  status: string;
}

function lead(ctx: AppContext, leadId: string): LeadRow {
  const l = ctx.db.get<LeadRow>('SELECT lead_id, name, email, country, intent_verified, expires_at, status FROM leads WHERE lead_id = ?', leadId);
  if (!l) throw new WorkflowError('LEAD_NOT_FOUND');
  return l;
}

const expired = (ctx: AppContext, l: LeadRow): boolean => !!l.expires_at && new Date(l.expires_at).getTime() < ctx.clock().getTime();

/** SOURCE_COMPLIANT -> QUALIFIED. Nur mit verifizierter Kaufabsicht und nicht abgelaufen (IE-018, IE-020). */
export function qualify(ctx: AppContext, opportunityId: string, actor: 'system' | 'owner' | 'ai' = 'system'): void {
  const opp = getOpportunity(ctx, opportunityId);
  if (opp.pipeline_state !== 'SOURCE_COMPLIANT') throw new WorkflowError('INVALID_STATE', opp.pipeline_state);
  const l = lead(ctx, opp.lead_id);
  if (expired(ctx, l)) {
    transition(ctx, opportunityId, 'CANCELLED', actor, 'Ausschreibung/Anfrage abgelaufen');
    throw new WorkflowError('LEAD_EXPIRED');
  }
  if (l.intent_verified !== 1) {
    ctx.audit.record({ type: 'lead.intent_unverified', actor, subjectType: 'opportunity', subjectId: opportunityId, testMode: ctx.config.testMode });
    throw new WorkflowError('INTENT_NOT_VERIFIED', 'Kaufabsicht nicht durch strukturierte Quelle belegt.');
  }
  ctx.db.run(`UPDATE leads SET status = 'QUALIFIED' WHERE lead_id = ?`, l.lead_id);
  transition(ctx, opportunityId, 'QUALIFIED', actor, 'Kaufabsicht belegt');
  ctx.audit.record({ type: 'opportunity.qualified', actor, subjectType: 'opportunity', subjectId: opportunityId, testMode: ctx.config.testMode });
}

export type FeasibilityResult =
  | { status: 'APPROVED'; estimatedCostMinor: number }
  | { status: 'OPEN_POINTS'; openPoints: string[] }
  | { status: 'REJECTED'; state: 'OUT_OF_SCOPE' | 'LICENCE_RISK' | 'NO_CAPACITY'; reason: string };

/** QUALIFIED -> FEASIBILITY_APPROVED | Ablehnpfad. Unklarer Umfang bleibt mit offenen Punkten stehen (IE-021, IE-022, IE-025, IE-026, IE-042). */
export function assessFeasibility(ctx: AppContext, opportunityId: string, actor: 'system' | 'owner' | 'ai' = 'system'): FeasibilityResult {
  const opp = getOpportunity(ctx, opportunityId);
  if (opp.pipeline_state !== 'QUALIFIED') throw new WorkflowError('INVALID_STATE', opp.pipeline_state);
  const reject = (state: 'OUT_OF_SCOPE' | 'LICENCE_RISK' | 'NO_CAPACITY', reason: string): FeasibilityResult => {
    transition(ctx, opportunityId, state, actor, reason);
    return { status: 'REJECTED', state, reason };
  };
  if (!opp.capability_id) return { status: 'OPEN_POINTS', openPoints: ['Produktklasse nicht angegeben'] };
  const route = routeCapability(opp.capability_id);
  if (!route.ok) return reject('OUT_OF_SCOPE', route.reason);
  const allowed = decide(ctx, { action: 'capability.use', capabilityId: opp.capability_id }, actor, { type: 'opportunity', id: opportunityId });
  if (!allowed.allowed) return reject('OUT_OF_SCOPE', allowed.rule);
  const scope = parseJsonOr<unknown>(opp.scope_json, null);
  const legal = legalGate((scope ?? {}) as LegalScope);
  if (!legal.ok) return reject('LICENCE_RISK', legal.reason);
  const cap = route.capability;
  const openPoints = scope === null ? ['Leistungsumfang fehlt'] : validate(cap.inputs_schema, scope);
  if (openPoints.length > 0) {
    ctx.db.run('UPDATE opportunities SET open_points_json = ?, updated_at = ? WHERE opportunity_id = ?', JSON.stringify(openPoints), ctx.clock().toISOString(), opportunityId);
    ctx.audit.record({ type: 'feasibility.open_points', actor, subjectType: 'opportunity', subjectId: opportunityId, data: { openPoints }, testMode: ctx.config.testMode });
    return { status: 'OPEN_POINTS', openPoints };
  }
  if (cap.complexity(scope) > cap.max_complexity) return reject('NO_CAPACITY', `Komplexität ${cap.complexity(scope)} > ${cap.max_complexity}`);
  const cost = cap.estimatedCostMinor(scope);
  const currency = effectivePolicy(ctx)?.quote.currency ?? ctx.config.policy.quote.currency;
  ctx.db.run('UPDATE opportunities SET estimated_cost_minor = ?, currency = ?, open_points_json = NULL, updated_at = ? WHERE opportunity_id = ?', cost, currency, ctx.clock().toISOString(), opportunityId);
  transition(ctx, opportunityId, 'FEASIBILITY_APPROVED', actor, `Capability ${cap.capability_id}@${cap.version}`);
  return { status: 'APPROVED', estimatedCostMinor: cost };
}

export interface QuoteResult {
  quoteId: string;
  acceptanceToken: string;
  grossTotalMinor: number;
  currency: string;
}

/** FEASIBILITY_APPROVED -> QUOTED. Preis = Kosten + Mindestmarge, innerhalb der Policy (IE-003, IE-004, IE-023, IE-024). */
export function createQuote(ctx: AppContext, opportunityId: string, actor: 'system' | 'owner' | 'ai' = 'system', opts: { priceMinor?: number } = {}): QuoteResult {
  const opp = getOpportunity(ctx, opportunityId);
  if (opp.pipeline_state !== 'FEASIBILITY_APPROVED') throw new WorkflowError('INVALID_STATE', opp.pipeline_state);
  const l = lead(ctx, opp.lead_id);
  if (expired(ctx, l)) {
    transition(ctx, opportunityId, 'CANCELLED', actor, 'Ausschreibung/Anfrage abgelaufen');
    throw new WorkflowError('LEAD_EXPIRED');
  }
  const policy = effectivePolicy(ctx);
  if (!policy) throw new WorkflowError('NO_POLICY');
  const cost = opp.estimated_cost_minor ?? 0;
  const currency = opp.currency ?? policy.quote.currency;
  const price = opts.priceMinor ?? Math.max(priceFromCost(cost, policy.quote.minMarginBps), policy.quote.minMinor);
  const d = decide(ctx, { action: 'quote.issue', priceMinor: price, costMinor: cost, currency }, actor, { type: 'opportunity', id: opportunityId });
  if (!d.allowed) {
    if (d.rule === 'NEGATIVE_MARGIN' || d.rule === 'MARGIN_BELOW_MIN') transition(ctx, opportunityId, 'COST_LIMIT', actor, d.reason);
    else if (d.rule === 'QUOTE_ABOVE_MAX') transition(ctx, opportunityId, 'MANUAL_REVIEW', actor, d.reason);
    throw new WorkflowError('QUOTE_BLOCKED', `${d.rule}: ${d.reason}`);
  }
  const cap = getCapability(opp.capability_id ?? '');
  const token = randomToken(32);
  const quoteId = newId('quo');
  const now = ctx.clock();
  const validUntil = new Date(now.getTime() + QUOTE_VALIDITY_DAYS * 86_400_000).toISOString();
  const terms = {
    test_mode: ctx.config.testMode,
    capability: `${cap?.capability_id}@${cap?.version}`,
    delivery_criteria: cap?.qa_suite ?? [],
    delivery_deadline_days: 2,
    rights: 'Einfaches, zeitlich unbegrenztes Nutzungsrecht am gelieferten Artefakt (Entwurf – Rechtsprüfung M3).',
    refund_criteria: cap?.refund_criteria ?? '',
    withdrawal_notice: 'Widerrufs-/Verzichtshinweis für digitale Inhalte: Entwurf, rechtliche Prüfung vor Livebetrieb erforderlich.',
    privacy_notice: 'Datenverarbeitung ausschließlich zur Auftragsabwicklung (Entwurf).',
    notice: ctx.config.testMode ? 'TESTMODUS – kein verbindliches Vertragsangebot, keine echte Zahlung.' : '',
  };
  ctx.db.run(
    `INSERT INTO quotes (quote_id, opportunity_id, lead_id, description, scope, terms_json, gross_total_minor, cost_minor, currency, acceptance_token_hash, status, valid_until, test_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?)`,
    quoteId, opportunityId, opp.lead_id, `${cap?.capability_id ?? 'Leistung'} gemäß Anfrage`, opp.scope_json ?? '{}', JSON.stringify(terms), price, cost, currency,
    sha256Hex(token), validUntil, ctx.config.testMode ? 1 : 0, now.toISOString(),
  );
  transition(ctx, opportunityId, 'QUOTED', actor, `Angebot ${quoteId}`);
  ctx.audit.record({ type: 'quote.issued', actor, subjectType: 'opportunity', subjectId: opportunityId, data: { quote_id: quoteId, price, cost, currency }, testMode: ctx.config.testMode });
  return { quoteId, acceptanceToken: token, grossTotalMinor: price, currency };
}

export interface QuoteRow {
  quote_id: string;
  opportunity_id: string;
  lead_id: string;
  description: string;
  scope: string;
  terms_json: string;
  gross_total_minor: number;
  cost_minor: number;
  currency: string;
  acceptance_token_hash: string;
  status: 'ISSUED' | 'ACCEPTED' | 'EXPIRED' | 'WITHDRAWN';
  accepted: number;
  customer_acceptance_ref: string | null;
  accepted_at: string | null;
  valid_until: string;
  test_mode: number;
  created_at: string;
}

export function getQuote(ctx: AppContext, quoteId: string): QuoteRow {
  const q = ctx.db.get<QuoteRow>('SELECT * FROM quotes WHERE quote_id = ?', quoteId);
  if (!q) throw new WorkflowError('QUOTE_NOT_FOUND');
  return q;
}

export function verifyQuoteToken(q: QuoteRow, token: string | undefined | null): boolean {
  return !!token && safeEqual(sha256Hex(token), q.acceptance_token_hash);
}

export interface AcceptanceEvidence {
  termsAccepted: boolean;
  ipHash: string;
  buyer: { name: string; address: string; country: string; type: 'B2B' | 'B2C'; vatId: string | null };
  /** Verbraucher: ausdrückliche Zustimmung zur sofortigen Ausführung + Kenntnis vom Erlöschen des Widerrufsrechts. */
  consumerWaiver?: { immediatePerformance: boolean; acknowledgeLoss: boolean };
}

/** Fassung des Verzichtstextes (Entwurf bis Rechtsprüfung LA-07). */
export const CONSUMER_WAIVER_VERSION = 'v1-entwurf-2026-11-12';

export interface AcceptResult {
  orderId: string;
  customerId: string;
  customerAccessKey: string | null;
  duplicate: boolean;
}

/** Verbindliche Annahme nur mit Token + Zustimmung; doppelte Annahme erzeugt keinen zweiten Auftrag (IE-027..IE-029). */
export function acceptQuote(ctx: AppContext, quoteId: string, token: string | undefined | null, ev: AcceptanceEvidence): AcceptResult {
  const q = getQuote(ctx, quoteId);
  if (!verifyQuoteToken(q, token) || !ev.termsAccepted) {
    ctx.audit.record({ type: 'quote.acceptance_rejected', actor: 'customer', subjectType: 'quote', subjectId: quoteId, data: { reason: 'NO_ACCEPTANCE_PROOF' }, testMode: ctx.config.testMode });
    throw new WorkflowError('NO_ACCEPTANCE_PROOF', 'Kein gültiger Annahmenachweis.');
  }
  if (q.status === 'ACCEPTED') {
    const o = ctx.db.get<OrderRow>('SELECT * FROM orders WHERE quote_id = ?', quoteId);
    if (!o) throw new WorkflowError('ORDER_MISSING_FOR_ACCEPTED_QUOTE');
    ctx.audit.record({ type: 'quote.duplicate_acceptance', actor: 'customer', subjectType: 'quote', subjectId: quoteId, testMode: ctx.config.testMode });
    return { orderId: o.order_id, customerId: o.customer_id, customerAccessKey: null, duplicate: true };
  }
  if (q.status !== 'ISSUED') throw new WorkflowError('QUOTE_NOT_OPEN', q.status);
  if (new Date(q.valid_until).getTime() < ctx.clock().getTime()) {
    ctx.db.run(`UPDATE quotes SET status = 'EXPIRED' WHERE quote_id = ?`, quoteId);
    throw new WorkflowError('QUOTE_EXPIRED');
  }
  const b = ev.buyer;
  if (!b.name || !b.address || !/^[A-Z]{2}$/.test(b.country)) throw new WorkflowError('BUYER_DATA_INVALID');
  const market = marketAllows(ctx, b.country, b.type);
  if (!market.ok) {
    ctx.audit.record({ type: 'quote.acceptance_rejected', actor: 'customer', subjectType: 'quote', subjectId: quoteId, data: { reason: market.reason }, testMode: ctx.config.testMode });
    throw new WorkflowError('MARKET_NOT_ALLOWED', market.reason);
  }
  if (b.type === 'B2C' && !(ev.consumerWaiver?.immediatePerformance && ev.consumerWaiver.acknowledgeLoss)) {
    ctx.audit.record({ type: 'quote.acceptance_rejected', actor: 'customer', subjectType: 'quote', subjectId: quoteId, data: { reason: 'CONSUMER_WAIVER_MISSING' }, testMode: ctx.config.testMode });
    throw new WorkflowError('CONSUMER_WAIVER_MISSING', 'Verbraucher: Zustimmung zur sofortigen Ausführung und Kenntnis vom Erlöschen des Widerrufsrechts erforderlich.');
  }
  const now = ctx.clock().toISOString();
  const accessKey = randomToken(32);
  const result = ctx.db.tx(() => {
    const acceptanceRef = `acc:${quoteId}:${now}:${ev.ipHash}`;
    const waiverRef = b.type === 'B2C' ? `waiver:${CONSUMER_WAIVER_VERSION}:${now}:${ev.ipHash}` : null;
    ctx.db.run(`UPDATE quotes SET status = 'ACCEPTED', accepted = 1, customer_acceptance_ref = ?, accepted_at = ?, consumer_waiver_ref = ? WHERE quote_id = ? AND status = 'ISSUED'`, acceptanceRef, now, waiverRef, quoteId);
    const l = lead(ctx, q.lead_id);
    let customer = ctx.db.get<{ customer_id: string }>('SELECT customer_id FROM customers WHERE lead_id = ?', q.lead_id);
    if (customer) {
      ctx.db.run('UPDATE customers SET name = ?, address = ?, country = ?, buyer_type = ?, vat_id = ?, access_key_hash = ? WHERE customer_id = ?', b.name, b.address, b.country, b.type, b.vatId, sha256Hex(accessKey), customer.customer_id);
    } else {
      customer = { customer_id: newId('cus') };
      ctx.db.run(
        `INSERT INTO customers (customer_id, lead_id, name, email, address, country, buyer_type, vat_id, access_key_hash, test_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        customer.customer_id, q.lead_id, b.name, l.email, b.address, b.country, b.type, b.vatId, sha256Hex(accessKey), q.test_mode, now,
      );
    }
    const orderId = newId('ord');
    ctx.db.run(
      `INSERT INTO orders (order_id, quote_id, customer_id, opportunity_id, amount_minor, currency, payment_state, fulfillment_state, test_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'UNPAID', 'NOT_STARTED', ?, ?, ?)`,
      orderId, quoteId, customer.customer_id, q.opportunity_id, q.gross_total_minor, q.currency, q.test_mode, now, now,
    );
    transition(ctx, q.opportunity_id, 'CUSTOMER_ACCEPTED', 'customer', `Annahme ${acceptanceRef}`);
    ctx.audit.record({ type: 'quote.accepted', actor: 'customer', subjectType: 'order', subjectId: orderId, data: { quote_id: quoteId, acceptance_ref: acceptanceRef }, testMode: ctx.config.testMode });
    return { orderId, customerId: customer.customer_id, customerAccessKey: accessKey, duplicate: false };
  });
  // Vertragsbestätigung auf dauerhaftem Datenträger sofort nach Vertragsschluss (vor Zahlung/Bereitstellung).
  createConfirmation(ctx, result.orderId);
  return result;
}

/** Checkout-Sitzung anlegen. M0: Mock-Provider im Testmodus. Ein Redirect bestätigt NIE eine Zahlung (IE-034). */
/** Prüft, ob für die Bestellung eine Checkout-Sitzung angelegt werden darf (Zustand + Policy). */
export function checkoutPreflight(ctx: AppContext, orderId: string): OrderRow {
  const order = getOrder(ctx, orderId);
  if (order.payment_state !== 'UNPAID' && order.payment_state !== 'FAILED') throw new WorkflowError('CHECKOUT_NOT_ALLOWED', order.payment_state);
  const d = decide(ctx, { action: 'checkout.create', testMode: order.test_mode === 1 }, 'customer', { type: 'order', id: orderId });
  if (!d.allowed) throw new WorkflowError('CHECKOUT_BLOCKED', `${d.rule} – ${d.reason}`);
  return order;
}

/** Speichert die beim Provider angelegte Sitzung. Der Zahlungsstatus bleibt UNPAID bis zum Webhook. */
export function recordCheckoutSession(ctx: AppContext, order: OrderRow, sessionId: string, provider: 'mock' | 'stripe'): void {
  ctx.db.tx(() => {
    ctx.db.run('UPDATE orders SET checkout_session_id = ?, payment_provider = ?, payment_state = ?, updated_at = ? WHERE order_id = ?', sessionId, provider, 'UNPAID', ctx.clock().toISOString(), order.order_id);
    const opp = getOpportunity(ctx, order.opportunity_id);
    if (opp.pipeline_state === 'PAYMENT_FAILED') transition(ctx, opp.opportunity_id, 'CUSTOMER_ACCEPTED', 'customer', 'Neuer Zahlungsversuch');
  });
  ctx.audit.record({ type: 'checkout.created', actor: 'customer', subjectType: 'order', subjectId: order.order_id, data: { session_id: sessionId, provider }, testMode: ctx.config.testMode });
}

/** Synchroner Checkout mit dem Mock-Provider (Testmodus). Stripe: services/finance/src/checkout.ts. */
export function createCheckout(ctx: AppContext, orderId: string): { sessionId: string; checkoutUrl: string } {
  const order = checkoutPreflight(ctx, orderId);
  const sessionId = `cs_test_mock_${randomToken(16)}`;
  recordCheckoutSession(ctx, order, sessionId, 'mock');
  return { sessionId, checkoutUrl: `/checkout/mock/${sessionId}` };
}

export type AutoProcessResult =
  | { stage: 'QUOTED'; quote: QuoteResult }
  | { stage: 'OPEN_POINTS'; openPoints: string[] }
  | { stage: 'REJECTED'; reason: string };

/** Deterministischer Autopilot für Inbound-Anfragen: Qualifizierung -> Machbarkeit -> Standardangebot (Masterprompt §8 "darf automatisch"). */
export function autoProcessOpportunity(ctx: AppContext, opportunityId: string): AutoProcessResult {
  try {
    if (getOpportunity(ctx, opportunityId).pipeline_state === 'SOURCE_COMPLIANT') qualify(ctx, opportunityId, 'system');
    const f = assessFeasibility(ctx, opportunityId, 'system');
    if (f.status === 'OPEN_POINTS') return { stage: 'OPEN_POINTS', openPoints: f.openPoints };
    if (f.status === 'REJECTED') return { stage: 'REJECTED', reason: f.reason };
    return { stage: 'QUOTED', quote: createQuote(ctx, opportunityId, 'system') };
  } catch (e) {
    if (e instanceof WorkflowError) return { stage: 'REJECTED', reason: e.message };
    throw e;
  }
}
