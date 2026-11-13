import * as W from '../src/index.ts';
import type { Store } from '../src/index.ts';
import { tr, type Lang } from './i18n.ts';

/**
 * Aktionen der Oberfläche – reine Funktionen (ohne DOM): Formularwerte rein, neuer Zustand und Meldung raus.
 * Dadurch ist jeder Knopf der Oberfläche ohne Browser testbar; die DOM-Anbindung (main.ts) ruft nur `handle` auf.
 */
export type ViewMode = 'basic' | 'pro';
export interface Session { userId: string; lang: Lang; mode: ViewMode; lastBackup: string | null }
export interface AppState { store: Store; session: Session }
export interface Outcome { state: AppState; flash: { kind: 'ok' | 'error'; text: string }; route?: string }

export type Form = Record<string, string>;

const num = (v: string | undefined): number => (v && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);

/** Positionen aus Formularzeilen line_article_N / line_qty_N; leere Zeilen werden ignoriert. */
export function linesFrom(f: Form): { articleId: string; qty: number }[] {
  const out: { articleId: string; qty: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const a = f[`line_article_${i}`];
    const q = f[`line_qty_${i}`];
    if (a && q?.trim()) out.push({ articleId: a, qty: num(q) });
  }
  return out;
}

/** Mengen je Artikel aus Feldern qty_<articleId>; 0/leer wird ignoriert. */
function qtyMap(f: Form): { articleId: string; qty: number }[] {
  return Object.entries(f).filter(([k, v]) => k.startsWith('qty_') && v.trim() && v.trim() !== '0').map(([k, v]) => ({ articleId: k.slice(4), qty: num(v) }));
}

type Handler = (s: AppState, f: Form, ctx: W.Ctx) => { store?: Store; session?: Partial<Session>; ok: string; route?: string };

const HANDLERS: Record<string, Handler> = {
  'article.add': (s, f, c) => {
    const price = W.parseMoney(f.price ?? '');
    const cost = f.cost?.trim() ? W.parseMoney(f.cost) : 0;
    if (price < 0) throw new W.DomainError('INVALID_AMOUNT', 'Verkaufspreis ungültig (z. B. 12,50).');
    if (cost < 0) throw new W.DomainError('INVALID_AMOUNT', 'Einkaufspreis ungültig (z. B. 7,00).');
    return { store: W.addArticle(s.store, c, { sku: f.sku ?? '', name: f.name ?? '', unit: f.unit, priceMinor: price, costMinor: cost, taxRateId: f.tax || 'std' }).store, ok: 'Artikel angelegt.' };
  },
  'article.receive': (s, f, c) => ({ store: W.receive(s.store, c, { articleId: f.articleId ?? '', qty: num(f.qty), ref: f.ref }).store, ok: 'Wareneingang gebucht.' }),
  'article.adjust': (s, f, c) => ({ store: W.adjust(s.store, c, { articleId: f.articleId ?? '', delta: num(f.delta), reason: f.reason ?? '' }).store, ok: 'Korrektur gebucht.' }),
  'customer.add': (s, f, c) => ({ store: W.addCustomer(s.store, c, { name: f.name ?? '', email: f.email || null, address: f.address || null, vatId: f.vatId || null }).store, ok: 'Kunde angelegt.' }),
  'quote.create': (s, f, c) => ({ store: W.createQuote(s.store, c, { customerId: f.customerId ?? '', lines: linesFrom(f), validDays: f.validDays ? num(f.validDays) : 30 }).store, ok: 'Angebot als Entwurf gespeichert.' }),
  'quote.send': (s, f, c) => ({ store: W.sendQuote(s.store, c, f.id ?? '').store, ok: 'Angebot festgeschrieben und nummeriert.' }),
  'quote.accept': (s, f, c) => ({ store: W.acceptQuote(s.store, c, f.id ?? '').store, ok: 'Angebot angenommen – Auftrag angelegt, Ware reserviert.', route: '#/auftraege' }),
  'quote.reject': (s, f, c) => ({ store: W.rejectQuote(s.store, c, f.id ?? '').store, ok: 'Angebot als abgelehnt markiert.' }),
  'order.create': (s, f, c) => ({ store: W.createOrder(s.store, c, { customerId: f.customerId ?? '', lines: linesFrom(f) }).store, ok: 'Auftrag angelegt, Ware reserviert.' }),
  'order.deliver': (s, f, c) => ({ store: W.deliver(s.store, c, { orderId: f.id ?? '', lines: qtyMap(f), clientRef: f.token ?? '' }).store, ok: 'Lieferung gebucht.' }),
  'order.cancel': (s, f, c) => ({ store: W.cancelRemaining(s.store, c, f.id ?? '', f.reason ?? '').store, ok: 'Restmenge storniert.' }),
  'invoice.draft': (s, f, c) => ({ store: W.draftInvoice(s.store, c, Object.keys(f).filter((k) => k.startsWith('del_')).map((k) => k.slice(4))).store, ok: 'Rechnungsentwurf erstellt.' }),
  'invoice.discard': (s, f, c) => ({ store: W.discardDraft(s.store, c, f.id ?? '').store, ok: 'Entwurf verworfen.' }),
  'invoice.finalize': (s, f, c) => ({ store: W.finalize(s.store, c, f.id ?? '').store, ok: 'Beleg festgeschrieben und nummeriert.' }),
  'credit.create': (s, f, c) => ({ store: W.createCreditNote(s.store, c, { invoiceId: f.id ?? '', lines: qtyMap(f), reason: f.reason ?? '', restock: f.restock === '1' }).store, ok: 'Gutschrift als Entwurf erstellt – bitte festschreiben.' }),
  'payment.record': (s, f, c) => {
    const amount = W.parseMoney(f.amount ?? '');
    if (amount <= 0) throw new W.DomainError('INVALID_AMOUNT', 'Betrag ungültig (z. B. 61,00).');
    return { store: W.recordPayment(s.store, c, { invoiceId: f.id ?? '', amountMinor: amount, method: f.method }).store, ok: 'Zahlung erfasst.' };
  },
  'settings.save': (s, f, c) => ({ store: W.updateSettings(s.store, c, { company: f.company, paymentTermDays: f.paymentTermDays ? num(f.paymentTermDays) : undefined }).store, ok: 'Einstellungen gespeichert.' }),
  'user.add': (s, f, c) => ({ store: W.addUser(s.store, c, { name: f.name ?? '', role: f.role === 'OWNER' ? 'OWNER' : 'STAFF' }).store, ok: 'Benutzer angelegt.' }),
  'session.user': (s, f) => {
    if (!s.store.users.some((u) => u.id === f.userId)) throw new W.DomainError('UNKNOWN_USER', 'Unbekannter Benutzer.');
    return { session: { userId: f.userId ?? '' }, ok: 'Benutzer gewechselt.' };
  },
  'session.lang': (_s, f) => ({ session: { lang: f.lang === 'it' || f.lang === 'en' ? f.lang : 'de' }, ok: 'Sprache gewechselt.' }),
  'session.mode': (_s, f) => ({ session: { mode: f.mode === 'pro' ? 'pro' : 'basic' }, ok: 'Ansicht gewechselt.' }),
};

export const ACTIONS: readonly string[] = Object.keys(HANDLERS);

/** Führt eine Aktion aus. Fachfehler werden zu verständlichen Meldungen; der Zustand bleibt dann unverändert. */
export function handle(state: AppState, action: string, form: Form, now: Date): Outcome {
  const h = HANDLERS[action];
  const lang = state.session.lang;
  if (!h) return { state, flash: { kind: 'error', text: tr(lang, 'Unbekannte Aktion.') } };
  try {
    const r = h(state, form, { userId: state.session.userId, now });
    const session = { ...state.session, ...(r.session ?? {}) };
    return { state: { store: r.store ?? state.store, session }, flash: { kind: 'ok', text: tr(session.lang, r.ok) }, route: r.route };
  } catch (e) {
    if (e instanceof W.DomainError) return { state, flash: { kind: 'error', text: errorText(lang, e) } };
    throw e;
  }
}

// --- Dateiaktionen (reine Logik; Lesen/Schreiben der Datei macht main.ts) -------------------------

export function backupFile(state: AppState, now: Date): { name: string; content: string; state: AppState } {
  return { name: `sicherung-${now.toISOString().slice(0, 10)}.json`, content: W.exportBackup(state.store), state: { ...state, session: { ...state.session, lastBackup: now.toISOString() } } };
}

export function restoreFrom(state: AppState, text: string): Outcome {
  try {
    const store = W.restoreBackup(text);
    if (!store.users.some((u) => u.id === state.session.userId)) return { state: { store, session: { ...state.session, userId: store.users[0]?.id ?? 'u1' } }, flash: { kind: 'ok', text: tr(state.session.lang, 'Sicherung wiederhergestellt.') } };
    return { state: { ...state, store }, flash: { kind: 'ok', text: tr(state.session.lang, 'Sicherung wiederhergestellt.') } };
  } catch (e) {
    if (e instanceof W.DomainError) return { state, flash: { kind: 'error', text: errorText(state.session.lang, e) } };
    throw e;
  }
}

export function importCsv(state: AppState, kind: string, text: string, now: Date): Outcome {
  try {
    const ctx = { userId: state.session.userId, now };
    const r = kind === 'customers' ? W.importCustomersCsv(state.store, ctx, text) : W.importArticlesCsv(state.store, ctx, text);
    return { state: { ...state, store: r.store }, flash: { kind: 'ok', text: `${tr(state.session.lang, 'Import abgeschlossen.')} (${r.result.imported})` } };
  } catch (e) {
    if (e instanceof W.DomainError) return { state, flash: { kind: 'error', text: errorText(state.session.lang, e) } };
    throw e;
  }
}

export function csvFile(state: AppState, kind: string): { name: string; content: string } {
  const k = kind === 'customers' || kind === 'invoices' ? kind : 'articles';
  return { name: `${k}.csv`, content: `\uFEFF${W.exportCsv(state.store, k)}` };
}

/** Erststart: leerer Datenbestand mit dem Firmennamen aus dem Kundendesign. */
export function initialState(company: string, lang: Lang): AppState {
  return { store: W.emptyStore(company, { id: 'u1', name: tr(lang, 'Inhaber') }), session: { userId: 'u1', lang, mode: 'basic', lastBackup: null } };
}

/** Fachfehler in der Sprache des Benutzers: Deutsch mit Details, IT/EN als verständlicher Text je Fehlercode. */
export function errorText(lang: Lang, e: W.DomainError): string {
  if (lang === 'de') return e.message.replace(/^[A-Z_]+: /, '');
  const key = `ERR_${e.code}`;
  const t = tr(lang, key);
  return t === key ? tr(lang, 'Vorgang nicht möglich – bitte Eingaben prüfen.') : t;
}
