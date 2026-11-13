import { toMinor } from '../../../packages/contracts/src/money.ts';
import { STOP_NAMES, type StopName } from '../../../packages/policies/src/engine.ts';
import { log } from '../../../packages/events/src/logger.ts';
import { sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { renderDashboard, renderLogin } from '../../../apps/dashboard/src/render.ts';
import { renderConsole, safeBack, statusReport, withFlash } from '../../../apps/console/src/index.ts';
import {
  renderAdvisor, renderCheckoutReturn, renderHome, renderInquiryForm, renderInquiryResult, renderMockCheckout, renderHelp, renderPortal, renderProvenance, renderQuote, renderTrust,
} from '../../../apps/customer-portal/src/pages.ts';
import { acquireFromTed } from '../../acquisition/src/connectors/ted.ts';
import { submitInboundLead, validateInboundLead } from '../../acquisition/src/leads.ts';
import { rankOpportunities } from '../../acquisition/src/ranking.ts';
import { approveSource, pauseSource } from '../../acquisition/src/sources.ts';
import { generateOfferDraft, getOfferDraft, reviewOfferDraft } from './offers.ts';
import { businessProfile, listActivationItems, readinessSummary, setSeatCountry, updateActivationItem } from './readiness.ts';
import { buildFatturaPA, fatturaInputFromInvoice } from '../../finance/src/fatturapa.ts';
import { exportBackup } from './backup.ts';
import { backupStatus } from './backup-offsite.ts';
import { downloadConfirmation } from './contract-confirmation.ts';
import { recordAcceptance, recordFeedback } from './aftercare.ts';
import { requestChange } from './change-requests.ts';
import { assertCanResume, offerCatalog, trustFacts } from './trust.ts';
import { dailyReport } from './daily-report.ts';
import { queueQuoteReady, unsubscribe } from './outbox.ts';
import { understand } from './advisor.ts';
import { pickLang, tr } from '../../../apps/customer-portal/src/i18n-pages.ts';
import type { Lang } from '../../../apps/customer-portal/src/home-i18n.ts';
import { decisions as consoleDecisions } from '../../../apps/console/src/model.ts';
import { verifyProvenance } from '../../product-factory/src/provenance.ts';
import { downloadInvoice } from '../../finance/src/invoice-pdf.ts';
import { startCheckout } from '../../finance/src/checkout.ts';
import { providerFor } from '../../finance/src/providers/index.ts';
import { approveRefundRequest, createRefundRequest, rejectRefundRequest } from '../../finance/src/refunds.ts';
import { incrementUsage } from '../../ai-orchestrator/src/quota.ts';
import { computeKpis } from '../../finance/src/kpis.ts';
import { mockPay, mockPayout } from '../../finance/src/mock-provider.ts';
import { buildTestCamt053, importBankStatement } from '../../finance/src/bank-statement.ts';
import { buildMonthlyExport } from '../../finance/src/monthly-export.ts';
import { handlePaymentWebhook, WebhookRejected } from '../../finance/src/payments.ts';
import { downloadArtifact } from '../../product-factory/src/delivery.ts';
import { csrfValid, login, logout, sessionFromToken, type OwnerSession } from './auth.ts';
import { autopilotTick } from './autopilot.ts';
import type { AppContext } from './context.ts';
import { createSupportTicket, customerByKey, exportPersonalData } from './customers.ts';
import { WorkflowError } from './errors.ts';
import { findOrder } from './orders.ts';
import { effectivePolicy, setStop } from './policy-store.ts';
import { routeCapability } from '../../product-factory/src/registry.ts';
import { acceptQuote, autoProcessOpportunity, getQuote, verifyQuoteToken } from './workflow.ts';

/**
 * Plattformneutraler HTTP-Kern (alle Routen). Adapter: server.ts (Node) und apps/worker (Cloudflare).
 */
export interface HttpRequest {
  method: string;
  /** Pfad inkl. Query, z. B. "/angebot/x?t=…" */
  url: string;
  headers: Record<string, string | undefined>;
  body: string;
  ip: string;
}

interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: string;
  cookies: Record<string, string>;
  ip: string;
  params: Record<string, string>;
}

export interface Res {
  status: number;
  headers?: Record<string, string | string[]>;
  body?: string | Uint8Array;
}

type Handler = (req: Req) => Res | Promise<Res>;

export const MAX_BODY = 64 * 1024;
const OWNER_COOKIE = 'ie_owner';
const CUSTOMER_COOKIE = 'ie_customer';
/** Nur die gewählte Sprache (de/it/en) – kein Tracking, keine personenbezogenen Daten. */
const LANG_COOKIE = 'ie_lang';

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

const html = (body: string, status = 200, headers: Record<string, string | string[]> = {}): Res => ({ status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body });
const json = (data: unknown, status = 200): Res => ({ status, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(data, null, 2) });
const redirect = (to: string, headers: Record<string, string | string[]> = {}): Res => ({ status: 303, headers: { location: to, ...headers } });
const form = (req: Req): URLSearchParams => new URLSearchParams(req.body);

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(ctx: AppContext, name: string, value: string, maxAgeSec: number, sameSite: 'Strict' | 'Lax' = 'Strict'): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=${maxAgeSec}${ctx.config.secureCookies ? '; Secure' : ''}`;
}

/** Formular-Positionen "Bezeichnung;Menge;Einzelkosten" -> strukturierter Scope. */
const ITEM_ERR = {
  de: { line: 'Zeile', three: (s: string) => `(„${s}“): bitte genau drei Angaben mit Semikolon trennen – Bezeichnung;Menge;Einzelpreis, z. B. Montage;10;45.00`, name: 'Bezeichnung fehlt oder ist zu lang', qty: (q: string) => `Menge muss eine ganze Zahl ab 1 sein (gefunden: „${q}“)`, price: (p: string) => `Einzelpreis ungültig (gefunden: „${p}“, erlaubt z. B. 45.00 oder 45,00)`, none: 'Mindestens eine Position angeben.' },
  it: { line: 'Riga', three: (s: string) => `(«${s}»): indicare esattamente tre dati separati da punto e virgola – Descrizione;Quantità;Prezzo unitario, es. Montaggio;10;45.00`, name: 'Descrizione mancante o troppo lunga', qty: (q: string) => `La quantità deve essere un numero intero da 1 (trovato: «${q}»)`, price: (p: string) => `Prezzo unitario non valido (trovato: «${p}», consentito es. 45.00 o 45,00)`, none: 'Indicare almeno una voce.' },
  en: { line: 'Line', three: (s: string) => `(“${s}”): please give exactly three values separated by semicolons – Description;Quantity;Unit price, e.g. Installation;10;45.00`, name: 'Description missing or too long', qty: (q: string) => `Quantity must be a whole number from 1 (found: “${q}”)`, price: (p: string) => `Unit price invalid (found: “${p}”, allowed e.g. 45.00 or 45,00)`, none: 'Enter at least one item.' },
} as const;

export function parseItemsText(text: string, currency: string, lang: Lang = 'de'): { items: { name: string; quantity: number; unit_cost_minor: number }[]; errors: string[] } {
  const items: { name: string; quantity: number; unit_cost_minor: number }[] = [];
  const errors: string[] = [];
  const M = ITEM_ERR[lang];
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, idx) => {
    // Erlaubte Trenner: Semikolon, Tabulator (Copy & Paste aus Tabellen) oder senkrechter Strich.
    const parts = line.split(/[;\t|]/).map((p) => p.trim());
    const shown = line.length > 60 ? `${line.slice(0, 60)}…` : line;
    if (parts.length !== 3) {
      errors.push(`${M.line} ${idx + 1} ${M.three(shown)}`);
      return;
    }
    const [name, qty, rawCost] = parts as [string, string, string];
    const quantity = Number(qty.replace(/\s/g, ''));
    const cost = rawCost.replace(/€|EUR|\s/gi, '');
    let unit: number;
    try {
      unit = toMinor(cost, currency);
    } catch {
      unit = -1;
    }
    if (!name || name.length > 200) errors.push(`${M.line} ${idx + 1}: ${M.name}`);
    else if (!Number.isInteger(quantity) || quantity < 1) errors.push(`${M.line} ${idx + 1}: ${M.qty(qty)}`);
    else if (unit < 0) errors.push(`${M.line} ${idx + 1}: ${M.price(rawCost)}`);
    else items.push({ name, quantity, unit_cost_minor: unit });
  });
  if (items.length === 0 && errors.length === 0) errors.push(M.none);
  return { items, errors };
}

export function createHandler(ctx: AppContext): (r: HttpRequest) => Promise<Res> {
  const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];
  const route = (method: string, path: string, handler: Handler): void => {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:([a-zA-Z]+)/g, (_m, k: string) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, pattern, keys, handler });
  };

  const owner = (req: Req): OwnerSession | null => sessionFromToken(ctx, req.cookies[OWNER_COOKIE]);
  const ownerGuard = (handler: (req: Req, s: OwnerSession) => Res | Promise<Res>, opts: { csrf?: boolean } = {}): Handler => (req) => {
    const s = owner(req);
    if (!s) {
      ctx.audit.record({ type: 'security.unauthenticated', actor: 'anonymous', subjectType: 'route', subjectId: req.path, testMode: ctx.config.testMode });
      return req.path.startsWith('/api/') ? json({ error: 'UNAUTHORIZED' }, 401) : redirect('/login');
    }
    if (opts.csrf && !csrfValid(s, form(req).get('_csrf') ?? (req.headers['x-csrf-token'] as string | undefined))) {
      ctx.audit.record({ type: 'security.csrf_rejected', actor: 'owner', subjectType: 'route', subjectId: req.path, testMode: ctx.config.testMode });
      return json({ error: 'CSRF' }, 403);
    }
    return handler(req, s);
  };
  const ipHash = (req: Req): string => sha256Hex(`ip:${req.ip}`).slice(0, 16);
  /** Sprache der Kundenseiten: ?lang= > Cookie > Browsersprache > Deutsch. */
  const L = (req: Req): Lang => pickLang(req.query.get('lang'), req.cookies[LANG_COOKIE], req.headers['accept-language'] as string | undefined);

  // --- Öffentlich ---------------------------------------------------------
  const origin = (): string => ctx.config.publicOrigin.replace(/\/$/, '');
  route('GET', '/', () => html(renderHome(offeredFormats(), 'de', origin())));
  route('GET', '/it', () => html(renderHome(offeredFormats(), 'it', origin())));
  route('GET', '/en', () => html(renderHome(offeredFormats(), 'en', origin())));
  // Technische Suchmaschinen-Grundlagen: interne Bereiche werden nicht indexiert.
  route('GET', '/robots.txt', () => ({ status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /portal\nDisallow: /angebot/\nDisallow: /api/\nSitemap: ${origin()}/sitemap.xml\n` }));
  route('GET', '/sitemap.xml', () => {
    const paths = ['/', '/it', '/en', '/berater', '/anfrage', '/vertrauen', ...offeredFormats().map((id) => `/hilfe/${id}`)];
    return { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8' }, body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${origin()}${p}</loc></url>`).join('')}</urlset>\n` };
  });
  route('GET', '/health', () => json({ status: 'ok', mode: ctx.config.testMode ? 'TEST' : 'LIVE', live_sales_enabled: false, environment: ctx.config.environment, payment_provider: ctx.config.payment.provider }));
  const offeredFormats = (): string[] => effectivePolicy(ctx)?.allowedCapabilities.filter((id) => routeCapability(id).ok) ?? [];
  route('GET', '/anfrage', (req) => html(renderInquiryForm([], {}, offeredFormats(), undefined, L(req))));
  // Produktberater: Wunsch in eigenen Worten → vorausgefüllte Anfrage (nichts wird gesendet, bevor der Kunde abschickt).
  route('GET', '/berater', (req) => html(renderAdvisor(undefined, undefined, L(req))));
  route('POST', '/berater', (req) => {
    const text = (form(req).get('wunsch') ?? '').slice(0, 5000);
    if (!text.trim()) return html(renderAdvisor('', 'Bitte beschreiben Sie kurz, was Sie brauchen.', L(req)), 400);
    const a = understand(text, offeredFormats(), L(req));
    if (a.outOfScope) return html(renderInquiryResult('Derzeit nicht lieferbar', a.outOfScope, { href: '/berater', label: 'Anderen Wunsch beschreiben' }, L(req)));
    return html(renderInquiryForm([], { title: a.title, items: a.items.join('\n'), margin: a.marginPct === null ? '' : String(a.marginPct).replace('.', ','), format: a.format ?? undefined, message: text.slice(0, 2000) }, offeredFormats(), { understood: a.understood, questions: a.questions }, L(req)));
  });

  const handleInquiry = (raw: Record<string, unknown>, req: Req): { status: number; result: Record<string, unknown> } => {
    const v = validateInboundLead(raw);
    if (!v.ok) return { status: 400, result: { errors: v.errors } };
    const r = submitInboundLead(ctx, v.value, { ipHash: ipHash(req) });
    const auto = autoProcessOpportunity(ctx, r.opportunityId);
    if (auto.stage === 'QUOTED') queueQuoteReady(ctx, auto.quote.quoteId);
    return { status: 200, result: { leadId: r.leadId, opportunityId: r.opportunityId, duplicate: r.duplicate, auto } };
  };

  route('POST', '/anfrage', (req) => {
    const f = form(req);
    const currency = ctx.config.policy.quote.currency;
    const parsed = parseItemsText(f.get('items') ?? '', currency, L(req));
    const marginPct = Number((f.get('margin') ?? '0').replace(',', '.'));
    const errors = [...parsed.errors];
    if (!Number.isFinite(marginPct) || marginPct < 0 || marginPct > 90) errors.push('Aufschlag: 0–90 %');
    const values = Object.fromEntries(['name', 'email', 'company', 'country', 'title', 'items', 'margin', 'message', 'marketing', 'format'].map((k) => [k, (f.get(k) ?? '').slice(0, 5000)]));
    const formats = offeredFormats();
    const capabilityId = f.get('format') || 'b2b-calc-csv';
    if (!formats.includes(capabilityId)) errors.push('Dieses Lieferformat ist derzeit nicht verfügbar.');
    if (errors.length) return html(renderInquiryForm(errors, values, formats, undefined, L(req)), 400);
    try {
      const { status, result } = handleInquiry(
        {
          name: f.get('name'), email: f.get('email'), company: f.get('company'), country: f.get('country'), message: f.get('message'),
          privacyAccepted: f.get('privacy') === '1', marketingConsent: f.get('marketing') === '1',
          request: { capabilityId, scope: { title: (f.get('title') ?? '').trim(), currency, items: parsed.items, margin_bps: Math.round(marginPct * 100), language: 'de' } },
        },
        req,
      );
      if (status !== 200) return html(renderInquiryForm(result.errors as string[], values, formats, undefined, L(req)), status);
      const auto = result.auto as ReturnType<typeof autoProcessOpportunity>;
      if (auto.stage === 'QUOTED') return redirect(`/angebot/${auto.quote.quoteId}?t=${encodeURIComponent(auto.quote.acceptanceToken)}`);
      if (auto.stage === 'OPEN_POINTS') return html(renderInquiryResult('Anfrage erhalten – offene Punkte', `${tr(L(req), 'Wir benötigen noch Angaben:')} ${auto.openPoints.join('; ')}`, undefined, L(req)));
      return html(renderInquiryResult('Anfrage erhalten – manuelle Prüfung', 'Ihre Anfrage kann nicht automatisch angeboten werden und wird geprüft.', undefined, L(req)));
    } catch (e) {
      if (e instanceof WorkflowError && e.code === 'ACQUISITION_PAUSED') return html(renderInquiryResult('Vorübergehend pausiert', 'Neue Anfragen werden derzeit nicht angenommen.', undefined, L(req)), 503);
      throw e;
    }
  });

  route('POST', '/api/leads', (req) => {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return json({ error: 'INVALID_JSON' }, 400);
    }
    try {
      const { status, result } = handleInquiry(raw, req);
      return json(result, status);
    } catch (e) {
      if (e instanceof WorkflowError && e.code === 'ACQUISITION_PAUSED') return json({ error: e.code }, 503);
      throw e;
    }
  });

  route('GET', '/angebot/:id', (req) => {
    const token = req.query.get('t') ?? '';
    let q;
    try {
      q = getQuote(ctx, req.params.id ?? '');
    } catch {
      return html(renderInquiryResult('Nicht gefunden', 'Angebot nicht gefunden.', undefined, L(req)), 404);
    }
    if (!verifyQuoteToken(q, token)) return html(renderInquiryResult('Kein Zugriff', 'Der Angebotslink ist ungültig.', undefined, L(req)), 403);
    return html(renderQuote(q, token, L(req)));
  });

  route('POST', '/angebot/:id/annehmen', async (req) => {
    const f = form(req);
    const buyerType = f.get('buyer_type') === 'B2C' ? 'B2C' : 'B2B';
    try {
      const r = acceptQuote(ctx, req.params.id ?? '', f.get('t'), {
        termsAccepted: f.get('terms') === '1',
        ipHash: ipHash(req),
        buyer: {
          name: (f.get('buyer_name') ?? '').trim().slice(0, 200),
          address: (f.get('buyer_address') ?? '').trim().slice(0, 300),
          country: (f.get('buyer_country') ?? '').trim().toUpperCase(),
          type: buyerType,
          vatId: (f.get('vat_id') ?? '').trim().slice(0, 20) || null,
        },
        consumerWaiver: { immediatePerformance: f.get('waiver_immediate') === '1', acknowledgeLoss: f.get('waiver_loss') === '1' },
      });
      const headers: Record<string, string | string[]> = r.customerAccessKey ? { 'set-cookie': cookie(ctx, CUSTOMER_COOKIE, r.customerAccessKey, 90 * 86400, 'Lax') } : {};
      const order = findOrder(ctx, r.orderId);
      if (order && (order.payment_state === 'UNPAID' || order.payment_state === 'FAILED') && !order.checkout_session_id) {
        const c = await startCheckout(ctx, r.orderId, providerFor(ctx));
        return redirect(c.url, headers);
      }
      return redirect('/portal', headers);
    } catch (e) {
      if (e instanceof WorkflowError) return html(renderInquiryResult('Annahme nicht möglich', e.message, undefined, L(req)), 400);
      throw e;
    }
  });

  const orderBySession = (sessionId: string) => ctx.db.get<{ order_id: string }>('SELECT order_id FROM orders WHERE checkout_session_id = ?', sessionId);

  const mockOnly = (): Res | null => (ctx.config.payment.provider === 'mock' ? null : json({ error: 'NOT_FOUND' }, 404));

  route('GET', '/checkout/mock/:session', (req) => {
    const blocked = mockOnly();
    if (blocked) return blocked;
    const ref = orderBySession(req.params.session ?? '');
    const order = ref ? findOrder(ctx, ref.order_id) : undefined;
    if (!order) return html(renderInquiryResult('Nicht gefunden', 'Checkout-Sitzung unbekannt.', undefined, L(req)), 404);
    return html(renderMockCheckout(order, L(req)));
  });

  route('POST', '/checkout/mock/:session/pay', (req) => {
    const blocked = mockOnly();
    if (blocked) return blocked;
    const ref = orderBySession(req.params.session ?? '');
    const order = ref ? findOrder(ctx, ref.order_id) : undefined;
    const customer = customerByKey(ctx, req.cookies[CUSTOMER_COOKIE]);
    if (!order || !customer || customer.customer_id !== order.customer_id) return html(renderInquiryResult('Kein Zugriff', 'Nur der bestellende Kunde kann die Testzahlung auslösen.', undefined, L(req)), 403);
    const outcome = form(req).get('outcome');
    mockPay(ctx, order, { outcome: outcome === 'pending' ? 'pending' : outcome === 'failed' ? 'failed' : 'paid' });
    return redirect(`/checkout/erfolg?order=${encodeURIComponent(order.order_id)}`);
  });

  // Rückleitung vom Checkout: ändert NIEMALS den Zahlungsstatus (IE-034).
  route('GET', '/checkout/erfolg', (req) => html(renderCheckoutReturn(findOrder(ctx, req.query.get('order') ?? ''), L(req))));

  route('POST', '/webhooks/payments', (req) => {
    try {
      const r = handlePaymentWebhook(ctx, req.body, req.headers['stripe-signature'] as string | undefined, ctx.config.payment.provider);
      return json({ received: true, status: r.status, detail: r.detail ?? null });
    } catch (e) {
      if (e instanceof WebhookRejected) return json({ received: false, error: e.code }, 400);
      throw e;
    }
  });

  const PORTAL_MSG: Record<string, string> = {
    '1': 'Ihre Nachricht wurde übermittelt.',
    abnahme: 'Danke – Ihre Abnahme ist gespeichert.',
    mangel: 'Danke – Ihre Mangelmeldung ist eingegangen. Wir melden uns mit einer Nachbesserung oder Erstattung.',
    bewertung: 'Danke für Ihre Rückmeldung.',
  };
  route('GET', '/portal', (req) => html(renderPortal(ctx, customerByKey(ctx, req.cookies[CUSTOMER_COOKIE]), PORTAL_MSG[req.query.get('ok') ?? ''] ?? (req.query.get('fehler') ? `${tr(L(req), 'Nicht gespeichert:')} ${tr(L(req), PORTAL_ERR[req.query.get('fehler') ?? ''] ?? 'Bitte Eingaben prüfen.')}` : undefined), L(req))));
  const PORTAL_ERR: Record<string, string> = {
    DEFECT_NEEDS_DESCRIPTION: 'Bitte beschreiben Sie den Mangel kurz.', ALREADY_DECIDED: 'Für diesen Auftrag wurde bereits entschieden.', ALREADY_RATED: 'Sie haben diesen Auftrag bereits bewertet.',
    INVALID_RATING: 'Bitte 1 bis 5 Sterne wählen.', NOT_DELIVERED: 'Erst nach der Lieferung möglich.', FORBIDDEN: 'Kein Zugriff auf diesen Auftrag.',
    ORIGINAL_NOT_PAID: 'Nachträge sind zu bezahlten Aufträgen möglich.', NOTHING_TO_RESUME: 'Für diesen Auftrag ist keine Zahlung offen.', CHECKOUT_BLOCKED: 'Zahlungen sind gerade pausiert.', NO_ITEMS: 'Bitte mindestens eine zusätzliche Position angeben.',
  };
  const portalError = (e: unknown): Res => {
    if (e instanceof WorkflowError) return redirect(`/portal?fehler=${encodeURIComponent(e.code)}`);
    throw e;
  };
  route('POST', '/portal/abnahme', (req) => {
    const f = form(req);
    try {
      const defect = f.get('decision') === 'defect';
      recordAcceptance(ctx, req.cookies[CUSTOMER_COOKIE], f.get('order_id') ?? '', defect ? 'DEFECT_REPORTED' : 'ACCEPTED', f.get('note') ?? '');
      return redirect(`/portal?ok=${defect ? 'mangel' : 'abnahme'}`);
    } catch (e) {
      return portalError(e);
    }
  });
  route('POST', '/portal/rueckmeldung', (req) => {
    const f = form(req);
    try {
      recordFeedback(ctx, req.cookies[CUSTOMER_COOKIE], f.get('order_id') ?? '', { rating: Number(f.get('rating') ?? 0), outcome: f.get('outcome') ?? '', comment: f.get('comment') ?? '', consentPublish: f.get('consent_publish') === '1' });
      return redirect('/portal?ok=bewertung');
    } catch (e) {
      return portalError(e);
    }
  });
  route('POST', '/portal/nachtrag', (req) => {
    const f = form(req);
    const parsed = parseItemsText(f.get('items') ?? '', ctx.config.policy.quote.currency, L(req));
    if (parsed.errors.length) return html(renderInquiryResult('Nachtrag nicht erstellt', `${tr(L(req), 'Bitte die Positionen prüfen:')} ${parsed.errors.slice(0, 3).join(' · ')}`, { href: '/portal', label: 'Zurück zum Kundenportal' }, L(req)), 400);
    try {
      const r = requestChange(ctx, req.cookies[CUSTOMER_COOKIE], f.get('order_id') ?? '', parsed.items, f.get('note') ?? '');
      if (r.quote) return redirect(`/angebot/${r.quote.quoteId}?t=${encodeURIComponent(r.quote.acceptanceToken)}`);
      return html(renderInquiryResult('Nachtrag erhalten', 'Ihr Wunsch wird geprüft. Sie erhalten ein Angebot, sobald es kalkuliert ist – beauftragt ist dadurch noch nichts.', { href: '/portal', label: 'Zum Kundenportal' }, L(req)));
    } catch (e) {
      if (e instanceof WorkflowError && (e.code === 'ACQUISITION_PAUSED')) return html(renderInquiryResult('Vorübergehend pausiert', 'Neue Anfragen werden derzeit nicht angenommen.', undefined, L(req)), 503);
      return portalError(e);
    }
  });
  route('GET', '/vertrauen', () => html(renderTrust(trustFacts(ctx))));
  // Abmeldung aus Werbenachrichten: ein Klick genügt, keine Anmeldung nötig. Ungültige Links verraten nichts.
  route('GET', '/abmelden/:token', (req) => {
    const ok = unsubscribe(ctx, req.params.token ?? '');
    return html(renderInquiryResult(ok ? 'Abgemeldet' : 'Link ungültig', ok ? 'Sie erhalten keine Werbenachrichten mehr. Nachrichten zu laufenden Aufträgen bleiben davon unberührt.' : 'Dieser Abmeldelink ist ungültig oder abgelaufen.', undefined, L(req)), ok ? 200 : 404);
  });
  route('GET', '/.well-known/infinity-earn.json', () => json(trustFacts(ctx)));
  route('GET', '/api/katalog', () => json(offerCatalog(ctx)));
  route('POST', '/portal/zahlung', async (req) => {
    const orderId = form(req).get('order_id') ?? '';
    try {
      assertCanResume(ctx, req.cookies[CUSTOMER_COOKIE], orderId);
      const c = await startCheckout(ctx, orderId, providerFor(ctx));
      return redirect(c.url);
    } catch (e) {
      return portalError(e);
    }
  });
  route('GET', '/hilfe/:product', (req) => {
    const page = renderHelp(req.params.product ?? '');
    return page ? html(page) : json({ error: 'NOT_FOUND' }, 404);
  });
  route('GET', '/pruefen', (req) => {
    const h = (req.query.get('hash') ?? '').trim();
    return h ? redirect(`/pruefen/${encodeURIComponent(h.toLowerCase())}`) : html(renderProvenance(null, ''));
  });
  route('GET', '/pruefen/:sha', (req) => {
    const r = verifyProvenance(ctx, req.params.sha ?? '');
    return html(renderProvenance(r.found ? r : null, req.params.sha ?? ''), r.found ? 200 : 404);
  });

  route('POST', '/portal/support', (req) => {
    const f = form(req);
    const kind = f.get('kind');
    try {
      const orderId = f.get('order_id') ?? '';
      const ticketId = createSupportTicket(ctx, req.cookies[CUSTOMER_COOKIE], orderId, kind === 'complaint' || kind === 'withdrawal' ? kind : 'question', f.get('message') ?? '');
      if (kind === 'withdrawal') {
        // Widerruf erzeugt einen Erstattungsantrag zur Eigentümerentscheidung – keine automatische Erstattung.
        try {
          createRefundRequest(ctx, orderId, 'customer_withdrawal', (f.get('message') ?? '').slice(0, 1000), ticketId);
        } catch (e) {
          if (!(e instanceof WorkflowError)) throw e;
        }
      }
      return redirect('/portal?ok=1');
    } catch (e) {
      if (e instanceof WorkflowError) return html(renderInquiryResult('Nicht möglich', e.code, undefined, L(req)), e.code === 'FORBIDDEN' ? 403 : 400);
      throw e;
    }
  });

  route('GET', '/portal/datenexport', (req) => {
    try {
      return { ...json(exportPersonalData(ctx, req.cookies[CUSTOMER_COOKIE])), headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="meine-daten.json"' } };
    } catch (e) {
      if (e instanceof WorkflowError) return json({ error: 'FORBIDDEN' }, 403);
      throw e;
    }
  });

  route('GET', '/portal/vertrag/:order', (req) => {
    const r = downloadConfirmation(ctx, req.cookies[CUSTOMER_COOKIE], req.params.order ?? '');
    if (!r.ok) return json({ error: r.reason }, r.status);
    return { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${r.filename}"` }, body: r.bytes };
  });

  route('GET', '/portal/beleg/:invoice', (req) => {
    const r = downloadInvoice(ctx, req.cookies[CUSTOMER_COOKIE], req.params.invoice ?? '');
    if (!r.ok) return json({ error: r.reason }, r.status);
    return { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${r.filename}"` }, body: r.bytes };
  });

  route('GET', '/download/:token', (req) => {
    const r = downloadArtifact(ctx, req.params.token ?? '', req.cookies[CUSTOMER_COOKIE]);
    if (!r.ok) return json({ error: r.reason }, r.status);
    return { status: 200, headers: { 'content-type': r.mediaType, 'content-disposition': `attachment; filename="${r.filename}"` }, body: r.bytes };
  });

  // --- Eigentümer ---------------------------------------------------------
  route('GET', '/login', () => html(renderLogin(ctx.config.ownerPasswordHash ? undefined : 'Owner-Login deaktiviert: OWNER_PASSWORD_HASH setzen (npm run owner:password).')));
  route('POST', '/auth/login', (req) => {
    const r = login(ctx, form(req).get('password') ?? '', req.ip);
    if (!r.ok) {
      const msg = r.reason === 'RATE_LIMITED' ? 'Zu viele Fehlversuche – bitte später erneut.' : r.reason === 'DISABLED' ? 'Login deaktiviert.' : 'Anmeldung fehlgeschlagen.';
      return html(renderLogin(msg), r.reason === 'RATE_LIMITED' ? 429 : 401);
    }
    return redirect('/dashboard', { 'set-cookie': cookie(ctx, OWNER_COOKIE, r.token, ctx.config.sessionTtlMinutes * 60) });
  });
  route('POST', '/auth/logout', ownerGuard((req) => {
    logout(ctx, req.cookies[OWNER_COOKIE]);
    return redirect('/login', { 'set-cookie': cookie(ctx, OWNER_COOKIE, '', 0) });
  }, { csrf: true }));

  // --- 15.0 Business-Konsole (sechs Bereiche) + Detailansicht für Fachleute ---------
  route('GET', '/dashboard/experte', ownerGuard((req, s) => html(renderDashboard(ctx, s.csrf_token, req.query.get('msg') ?? undefined))));
  const consolePage: Handler = ownerGuard((req, s) => {
    const page = renderConsole(ctx, req.path, req.query, s.csrf_token, req.query.get('msg') ?? undefined);
    return page ? html(page) : json({ error: 'NOT_FOUND' }, 404);
  });
  // Admin-Zugang über /admin: angemeldet → Konsole, sonst Passwort-Anmeldung (Prüfung serverseitig in ownerGuard).
  route('GET', '/admin', ownerGuard(() => redirect('/dashboard')));
  route('GET', '/dashboard', consolePage);
  route('GET', '/dashboard/:area', consolePage);
  route('GET', '/dashboard/:area/:id', consolePage);
  route('GET', '/api/status', ownerGuard(() => json(statusReport(ctx))));
  route('GET', '/api/bericht/tag', ownerGuard((req) => { const test = req.query.get('modus') === 'test'; return json(dailyReport(ctx, test, consoleDecisions(ctx, test).length)); }));
  /** Nach Owner-Aktionen zurück auf die Konsolenseite, von der die Aktion kam (nur interne Pfade). */
  const back = (req: Req, msg: string): Res => redirect(withFlash(safeBack(form(req).get('_back')), msg));
  const STOP_LABEL: Record<string, string> = { PAUSE_ACQUISITION: 'Kundensuche', PAUSE_PRODUCTION: 'Produktion', PAUSE_PAYMENTS: 'Neue Zahlungen', STOP_ALL_JOBS: 'Alle Tätigkeiten' };
  route('POST', '/admin/stops', ownerGuard((req) => {
    const f = form(req);
    const stop = f.get('stop') ?? '';
    if (!(STOP_NAMES as readonly string[]).includes(stop)) return json({ error: 'UNKNOWN_STOP' }, 400);
    setStop(ctx, stop as StopName, f.get('active') === '1', 'owner');
    return back(req, `${STOP_LABEL[stop] ?? stop}: ${f.get('active') === '1' ? 'pausiert' : 'läuft wieder'}`);
  }, { csrf: true }));
  route('POST', '/admin/tick', ownerGuard((req) => {
    const t = autopilotTick(ctx);
    const msg = `Takt: ${t.production.processed} Produktionsjob(s), ${t.invoices.length} Beleg(e), Reconciliation ${t.reconciliation?.status ?? 'nicht nötig'}${t.errors.length ? `, Fehler: ${t.errors.join('; ')}` : ''}`;
    return back(req, msg);
  }, { csrf: true }));
  // --- M1: Quellen, Abruf, Ranking, Angebotsentwürfe -----------------------
  const wfError = (req: Req, e: unknown): Res => {
    if (e instanceof WorkflowError) return back(req, e.message);
    throw e;
  };
  route('POST', '/admin/sources/:id/approve', ownerGuard((req) => {
    try {
      approveSource(ctx, req.params.id ?? '', form(req).get('terms_label') ?? '', 'owner');
      return back(req, `Quelle ${req.params.id} freigegeben`);
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  route('POST', '/admin/sources/:id/pause', ownerGuard((req) => {
    try {
      pauseSource(ctx, req.params.id ?? '', 'owner', 'Eigentümer pausiert');
      return back(req, `Quelle ${req.params.id} pausiert`);
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  route('POST', '/admin/acquire', ownerGuard(async (req) => {
    const preview = form(req).get('mode') === 'preview';
    const r = await acquireFromTed(ctx, { mode: preview ? 'PREVIEW' : 'PERSIST', actor: 'owner' });
    return back(req, r.status === 'OK'
      ? `TED-${preview ? 'Vorschau' : 'Abruf'}: ${r.seen} Bekanntmachungen, ${r.relevant} relevant, ${r.leadsCreated} neue Leads`
      : `TED-Abruf ${r.status}: ${r.reason ?? ''}`);
  }, { csrf: true }));
  route('POST', '/admin/opportunities/:id/draft', ownerGuard((req) => {
    try {
      const d = generateOfferDraft(ctx, req.params.id ?? '');
      return back(req, `Angebotsentwurf ${d.draft_id} erstellt (nicht versendet)`);
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  route('GET', '/admin/drafts/:id', ownerGuard((req) => {
    try {
      return { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: getOfferDraft(ctx, req.params.id ?? '').content_md };
    } catch (e) {
      if (e instanceof WorkflowError) return json({ error: e.code }, 404);
      throw e;
    }
  }));
  route('POST', '/admin/drafts/:id/review', ownerGuard((req) => {
    const f = form(req);
    try {
      reviewOfferDraft(ctx, req.params.id ?? '', f.get('decision') === 'approve' ? 'APPROVED_FOR_MANUAL_SUBMISSION' : 'REJECTED', 'owner', f.get('note') ?? '');
      return back(req, 'Entwurf geprüft');
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  // --- M3: Live-Freigaben -------------------------------------------------------
  route('POST', '/admin/readiness/:id', ownerGuard((req) => {
    const f = form(req);
    try {
      updateActivationItem(ctx, req.params.id ?? '', f.get('status') ?? '', f.get('evidence') ?? '', f.get('note') ?? '', 'owner');
      return back(req, `${req.params.id} aktualisiert`);
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  route('POST', '/admin/business/seat', ownerGuard((req) => {
    try {
      setSeatCountry(ctx, form(req).get('country') ?? '', 'owner');
      return back(req, `Sitzland gespeichert. LA-01 steht auf „In Arbeit“ – Freigabe nach schriftlicher Bestätigung der Steuerberatung.`);
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  route('GET', '/admin/invoices/:id/fatturapa', ownerGuard((req) => {
    const inv = ctx.db.get<{ invoice_id: string; invoice_number: string; kind: string; created_at: string; buyer_json: string; lines_json: string; test_mode: number }>('SELECT invoice_id, invoice_number, kind, created_at, buyer_json, lines_json, test_mode FROM invoices WHERE invoice_id = ?', req.params.id ?? '');
    if (!inv) return json({ error: 'NOT_FOUND' }, 404);
    const s = ctx.config.seller;
    const r = fatturaInputFromInvoice(inv, { name: s.name, vatId: s.taxId, fiscalCode: s.fiscalCode, address: s.address, cap: s.postcode, city: s.city, province: s.province, regime: s.regime }, sha256Hex(inv.invoice_id).replace(/[^a-z0-9]/g, '').slice(0, 5));
    if (!r.ok) return { status: 409, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: `FatturaPA kann noch nicht erzeugt werden. Es fehlt:\n- ${r.missing.join('\n- ')}\n\nEs wird keine Datei mit Platzhaltern erzeugt.` };
    ctx.audit.record({ type: 'invoice.fatturapa_exported', actor: 'owner', subjectType: 'invoice', subjectId: inv.invoice_id, data: { test: inv.test_mode === 1, proposal: true }, testMode: ctx.config.testMode });
    return { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="${inv.test_mode ? 'TEST_' : ''}IT${s.taxId}_${r.input.progressivo}.xml"` }, body: buildFatturaPA(r.input) };
  }));
  route('GET', '/api/admin/backup', ownerGuard(() => ({
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="infinity-earn-backup-${ctx.clock().toISOString().slice(0, 10)}.json"` },
    body: JSON.stringify(exportBackup(ctx)),
  })));
  route('GET', '/api/readiness', ownerGuard(() => json({ summary: readinessSummary(ctx), profile: businessProfile(ctx), items: listActivationItems(ctx), backup: backupStatus(ctx) })));
  route('GET', '/api/backup/status', ownerGuard(() => json(backupStatus(ctx))));

  // --- M2: Rückerstattungen ---------------------------------------------------
  route('POST', '/admin/orders/:id/refund', ownerGuard((req) => {
    try {
      createRefundRequest(ctx, req.params.id ?? '', 'owner', form(req).get('reason') || 'Eigentümer-Entscheidung');
      return back(req, 'Erstattungsantrag angelegt – bitte unten genehmigen oder ablehnen');
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  route('POST', '/admin/refunds/:id/approve', ownerGuard(async (req) => {
    try {
      const r = await approveRefundRequest(ctx, req.params.id ?? '', 'owner', providerFor(ctx), form(req).get('note') ?? '');
      return back(req, `Erstattung beim Provider angefordert (Status ${r.status}). Buchung erfolgt nach Bestätigung per Webhook.`);
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  route('POST', '/admin/refunds/:id/reject', ownerGuard((req) => {
    try {
      rejectRefundRequest(ctx, req.params.id ?? '', 'owner', form(req).get('note') || 'abgelehnt');
      return back(req, 'Erstattungsantrag abgelehnt');
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));

  // --- 15.0 M1: Bankabgleich (gesonderter Kontoauszug bestätigt den Bankeingang) -------------
  route('POST', '/admin/bank/import', ownerGuard((req) => {
    try {
      const r = importBankStatement(ctx, form(req).get('statement') ?? '', 'owner');
      const parts = [`Kontoauszug gelesen: ${r.entries} Buchungen, ${r.matched.length} Auszahlung(en) als Bankeingang bestätigt`];
      if (r.closedOrders.length) parts.push(`${r.closedOrders.length} Auftrag/Aufträge abgeschlossen`);
      if (r.review.length) parts.push(`Bitte prüfen: ${r.review.slice(0, 2).join(' · ')}`);
      return back(req, parts.join('. '));
    } catch (e) {
      return wfError(req, e);
    }
  }, { csrf: true }));
  route('GET', '/admin/bank/test-statement', ownerGuard(() => {
    if (!ctx.config.testMode) return json({ error: 'TEST_ONLY' }, 403);
    ctx.audit.record({ type: 'bank.test_statement_generated', actor: 'owner', subjectType: 'bank_statement', subjectId: 'test', testMode: true });
    return { status: 200, headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="test-kontoauszug-${ctx.clock().toISOString().slice(0, 10)}.xml"` }, body: buildTestCamt053(ctx) };
  }));
  route('POST', '/admin/payouts/test', ownerGuard((req) => {
    if (!ctx.config.testMode || ctx.config.payment.provider !== 'mock') return back(req, 'Testauszahlungen gibt es nur mit dem Test-Zahlungsanbieter. Bei Stripe kommen Auszahlungen als signierte Meldung von Stripe.');
    const orders = ctx.db.all<{ order_id: string; currency: string; net: number }>(
      `SELECT o.order_id, o.currency, (SELECT COALESCE(SUM(l.amount_minor), 0) FROM ledger_entries l WHERE l.order_id = o.order_id AND l.account IN ('customer_payments','provider_fees','refunds','disputes')) AS net
       FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE o.test_mode = 1 AND op.pipeline_state = 'LEDGER_RECONCILED'`,
    );
    let n = 0;
    for (const o of orders) if (o.net > 0 && mockPayout(ctx, [o.order_id], o.net, o.currency).detail === 'PAYOUT_SENT') n++;
    return back(req, `${n} Testauszahlung(en) gemeldet – jetzt „unterwegs“, bis ein Kontoauszug den Eingang bestätigt`);
  }, { csrf: true }));

  route('GET', '/api/opportunities/ranking', ownerGuard(() => json(rankOpportunities(ctx, 50))));

  route('GET', '/api/reports/summary', ownerGuard(() => json({ live: computeKpis(ctx, false), test: computeKpis(ctx, true) })));
  route('GET', '/api/reports/monthly', ownerGuard((req) => {
    try {
      const exp = buildMonthlyExport(ctx, req.query.get('month') ?? '');
      ctx.audit.record({ type: 'report.viewed', actor: 'owner', subjectType: 'report', subjectId: exp.month, testMode: ctx.config.testMode });
      return json(exp);
    } catch (e) {
      if (e instanceof WorkflowError) return json({ error: e.code }, 400);
      throw e;
    }
  }));
  route('GET', '/api/audit', ownerGuard((req) => json(ctx.audit.list(Math.min(500, Number(req.query.get('limit') ?? 100) || 100), req.query.get('subject') ?? undefined))));

  return async (r) => {
    const url = new URL(r.url || '/', 'http://local');
    const req: Req = {
      method: r.method,
      path: url.pathname,
      query: url.searchParams,
      headers: r.headers,
      body: r.body,
      cookies: parseCookies(r.headers.cookie),
      ip: r.ip,
      params: {},
    };
    let res: Res;
    try {
      if (r.body.length > MAX_BODY) res = json({ error: 'PAYLOAD_TOO_LARGE' }, 413);
      else {
        incrementUsage(ctx, 'platform_requests');
        const match = routes.find((x) => x.method === req.method && x.pattern.test(req.path));
        if (!match) res = json({ error: 'NOT_FOUND' }, 404);
        else {
          const m = match.pattern.exec(req.path) as RegExpExecArray;
          match.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1] ?? '')));
          res = await match.handler(req);
        }
      }
    } catch (e) {
      log('error', 'request_failed', { path: req.path, error: e });
      res = json({ error: 'INTERNAL_ERROR' }, 500);
    }
    // Sprachwahl merken: ausdrücklich per ?lang= oder über die Startseiten /, /it, /en.
    const q = req.query.get('lang');
    const chosen = q === 'de' || q === 'it' || q === 'en' ? q : req.method === 'GET' ? ({ '/': 'de', '/it': 'it', '/en': 'en' } as Record<string, string>)[req.path] : undefined;
    if (chosen && req.cookies[LANG_COOKIE] !== chosen && res.status < 400) {
      const c = `${LANG_COOKIE}=${chosen}; Path=/; Max-Age=31536000; SameSite=Lax${ctx.config.secureCookies ? '; Secure' : ''}`;
      const prev = res.headers?.['set-cookie'];
      res = { ...res, headers: { ...(res.headers ?? {}), 'set-cookie': prev === undefined ? c : [...(Array.isArray(prev) ? prev : [prev]), c] } };
    }
    return { ...res, headers: { ...SECURITY_HEADERS, ...(res.headers ?? {}) } };
  };
}
