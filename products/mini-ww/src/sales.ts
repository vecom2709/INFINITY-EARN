import { addDays, audit, type Ctx, day, DomainError, iso, nextId, requireMoney, requirePositiveInt, takeNumber, transact, user } from './core.ts';
import { article, book, customer, stockOf } from './inventory.ts';
import type { Delivery, Line, Order, Quote, Store } from './model.ts';

/** Verkauf: Angebot → Annahme → Auftrag (Reservierung) → Lieferung (Warenausgang). Statusmaschine erzwingt die Reihenfolge. */

export interface LineInput { articleId: string; qty: number; priceMinor?: number }

function buildLines(s: Store, input: LineInput[]): Line[] {
  if (!input.length) throw new DomainError('NO_LINES', 'Mindestens eine Position angeben.');
  const seen = new Set<string>();
  return input.map((l) => {
    const a = article(s, l.articleId);
    if (!a.active) throw new DomainError('ARTICLE_INACTIVE', `${a.name} ist nicht mehr aktiv.`);
    if (seen.has(a.id)) throw new DomainError('DUPLICATE_LINE', `${a.name} steht doppelt – bitte Menge zusammenfassen.`);
    seen.add(a.id);
    requirePositiveInt(l.qty, `Menge für ${a.name}`);
    const price = l.priceMinor ?? a.priceMinor;
    requireMoney(price, `Preis für ${a.name}`);
    const rate = s.settings.taxRates.find((t) => t.id === a.taxRateId);
    if (!rate) throw new DomainError('UNKNOWN_TAX_RATE', `Steuersatz von ${a.name} fehlt.`);
    return { articleId: a.id, name: a.name, qty: l.qty, priceMinor: price, taxBps: rate.bps };
  });
}

export function quote(s: Store, id: string): Quote {
  const q = s.quotes.find((x) => x.id === id);
  if (!q) throw new DomainError('QUOTE_NOT_FOUND', 'Angebot nicht gefunden.');
  return q;
}

export function order(s: Store, id: string): Order {
  const o = s.orders.find((x) => x.id === id);
  if (!o) throw new DomainError('ORDER_NOT_FOUND', 'Auftrag nicht gefunden.');
  return o;
}

export function createQuote(store: Store, ctx: Ctx, input: { customerId: string; lines: LineInput[]; validDays?: number }): { store: Store; result: Quote } {
  return transact(store, (s) => {
    user(s, ctx);
    customer(s, input.customerId);
    const valid = input.validDays ?? 30;
    requirePositiveInt(valid, 'Gültigkeit in Tagen');
    const q: Quote = { id: nextId(s, 'quo'), number: null, customerId: input.customerId, lines: buildLines(s, input.lines), status: 'DRAFT', validUntil: addDays(day(ctx.now), valid), createdAt: iso(ctx.now) };
    s.quotes.push(q);
    audit(s, ctx, 'quote.created', q.id);
    return q;
  });
}

/** Versenden = festschreiben: Nummer wird vergeben, Inhalt ist danach unveränderlich. */
export function sendQuote(store: Store, ctx: Ctx, quoteId: string): { store: Store; result: Quote } {
  return transact(store, (s) => {
    user(s, ctx);
    const q = quote(s, quoteId);
    if (q.status !== 'DRAFT') throw new DomainError('INVALID_STATE', 'Nur Entwürfe können versendet werden.');
    q.number = takeNumber(s, 'quote');
    q.status = 'SENT';
    audit(s, ctx, 'quote.sent', q.id, { number: q.number });
    return q;
  });
}

function reserveAll(s: Store, ctx: Ctx, lines: Line[], ref: string): void {
  for (const l of lines) {
    const st = stockOf(s, l.articleId);
    if (st.available < l.qty) throw new DomainError('INSUFFICIENT_STOCK', `${l.name}: verfügbar ${st.available}, benötigt ${l.qty}.`);
  }
  for (const l of lines) book(s, ctx, 'RESERVE', l.articleId, l.qty, ref);
}

function newOrder(s: Store, ctx: Ctx, customerId: string, lines: Line[], quoteId: string | null): Order {
  const o: Order = { id: nextId(s, 'ord'), number: takeNumber(s, 'order'), quoteId, customerId, lines: lines.map((l) => ({ ...l, delivered: 0 })), status: 'OPEN', createdAt: iso(ctx.now) };
  reserveAll(s, ctx, lines, o.number);
  s.orders.push(o);
  audit(s, ctx, 'order.created', o.id, { number: o.number, quoteId });
  return o;
}

/** Annahme durch den Kunden: nur versendete, gültige Angebote; erzeugt den Auftrag und reserviert den Bestand. */
export function acceptQuote(store: Store, ctx: Ctx, quoteId: string): { store: Store; result: Order } {
  return transact(store, (s) => {
    user(s, ctx);
    const q = quote(s, quoteId);
    if (q.status !== 'SENT') throw new DomainError('INVALID_STATE', q.status === 'ACCEPTED' ? 'Angebot ist bereits angenommen.' : 'Nur versendete Angebote können angenommen werden.');
    if (day(ctx.now) > q.validUntil) throw new DomainError('QUOTE_EXPIRED', `Angebot war gültig bis ${q.validUntil}.`);
    q.status = 'ACCEPTED';
    audit(s, ctx, 'quote.accepted', q.id);
    return newOrder(s, ctx, q.customerId, q.lines, q.id);
  });
}

export function rejectQuote(store: Store, ctx: Ctx, quoteId: string): { store: Store; result: Quote } {
  return transact(store, (s) => {
    user(s, ctx);
    const q = quote(s, quoteId);
    if (q.status !== 'SENT') throw new DomainError('INVALID_STATE', 'Nur versendete Angebote können abgelehnt werden.');
    q.status = 'REJECTED';
    audit(s, ctx, 'quote.rejected', q.id);
    return q;
  });
}

/** Direkter Auftrag ohne Angebot (z. B. telefonische Bestellung). */
export function createOrder(store: Store, ctx: Ctx, input: { customerId: string; lines: LineInput[] }): { store: Store; result: Order } {
  return transact(store, (s) => {
    user(s, ctx);
    customer(s, input.customerId);
    return newOrder(s, ctx, input.customerId, buildLines(s, input.lines), null);
  });
}

/**
 * Lieferung (Warenausgang): nur offene Restmengen, Reservierung wird aufgelöst und Bestand abgebucht.
 * `clientRef` macht die Buchung idempotent – dieselbe Lieferung zweimal zu buchen wird erkannt.
 */
export function deliver(store: Store, ctx: Ctx, input: { orderId: string; lines: { articleId: string; qty: number }[]; clientRef: string }): { store: Store; result: Delivery } {
  return transact(store, (s) => {
    user(s, ctx);
    const ref = input.clientRef.trim();
    if (!ref) throw new DomainError('REF_REQUIRED', 'Lieferreferenz fehlt.');
    if (s.deliveries.some((d) => d.clientRef === ref)) throw new DomainError('DUPLICATE_BOOKING', `Lieferung „${ref}“ ist bereits gebucht.`);
    const o = order(s, input.orderId);
    if (o.status === 'CANCELLED' || o.status === 'DELIVERED') throw new DomainError('INVALID_STATE', 'Auftrag ist abgeschlossen.');
    if (!input.lines.length) throw new DomainError('NO_LINES', 'Mindestens eine Position liefern.');
    const seen = new Set<string>();
    for (const l of input.lines) {
      if (seen.has(l.articleId)) throw new DomainError('DUPLICATE_LINE', 'Artikel doppelt in der Lieferung.');
      seen.add(l.articleId);
      requirePositiveInt(l.qty, 'Liefermenge');
      const ol = o.lines.find((x) => x.articleId === l.articleId);
      if (!ol) throw new DomainError('NOT_IN_ORDER', 'Artikel ist nicht Teil des Auftrags.');
      if (ol.delivered + l.qty > ol.qty) throw new DomainError('OVER_DELIVERY', `${ol.name}: offen ${ol.qty - ol.delivered}, geliefert werden sollen ${l.qty}.`);
      if (stockOf(s, l.articleId).onHand < l.qty) throw new DomainError('NEGATIVE_STOCK', `${ol.name}: nicht genug Bestand.`);
    }
    const d: Delivery = { id: nextId(s, 'del'), number: takeNumber(s, 'delivery'), orderId: o.id, customerId: o.customerId, lines: input.lines.map((l) => ({ articleId: l.articleId, qty: l.qty })), at: iso(ctx.now), clientRef: ref, invoiceId: null };
    for (const l of input.lines) {
      const ol = o.lines.find((x) => x.articleId === l.articleId) as Order['lines'][number];
      book(s, ctx, 'RELEASE', l.articleId, l.qty, d.number);
      book(s, ctx, 'ISSUE', l.articleId, l.qty, d.number);
      ol.delivered += l.qty;
    }
    o.status = o.lines.every((l) => l.delivered === l.qty) ? 'DELIVERED' : 'PARTIAL';
    s.deliveries.push(d);
    audit(s, ctx, 'order.delivered', o.id, { delivery: d.number });
    return d;
  });
}

/** Rest stornieren: noch nicht gelieferte Mengen werden freigegeben. Gelieferte Ware bleibt gebucht. */
export function cancelRemaining(store: Store, ctx: Ctx, orderId: string, reason: string): { store: Store; result: Order } {
  return transact(store, (s) => {
    user(s, ctx);
    const o = order(s, orderId);
    if (o.status === 'CANCELLED' || o.status === 'DELIVERED') throw new DomainError('INVALID_STATE', 'Auftrag ist bereits abgeschlossen.');
    if (reason.trim().length < 3) throw new DomainError('REASON_REQUIRED', 'Bitte einen Grund angeben.');
    for (const l of o.lines) if (l.qty > l.delivered) book(s, ctx, 'RELEASE', l.articleId, l.qty - l.delivered, `${o.number} storniert`, reason.trim());
    const anyDelivered = o.lines.some((l) => l.delivered > 0);
    for (const l of o.lines) l.qty = l.delivered;
    o.status = anyDelivered ? 'DELIVERED' : 'CANCELLED';
    audit(s, ctx, 'order.cancelled', o.id, { reason: reason.trim() });
    return o;
  });
}
