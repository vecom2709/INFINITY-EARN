import { audit, type Ctx, DomainError, iso, nextId, requireMoney, requirePositiveInt, requireRole, transact, user } from './core.ts';
import type { Article, MovementType, Party, Store } from './model.ts';

/** Stammdaten (Artikel, Kunden, Lieferanten) und Lager. Der Bestand wird nie gespeichert, sondern aus dem Journal berechnet. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function article(s: Store, id: string): Article {
  const a = s.articles.find((x) => x.id === id);
  if (!a) throw new DomainError('ARTICLE_NOT_FOUND', 'Artikel nicht gefunden.');
  return a;
}

export function customer(s: Store, id: string): Party {
  const c = s.customers.find((x) => x.id === id);
  if (!c) throw new DomainError('CUSTOMER_NOT_FOUND', 'Kunde nicht gefunden.');
  return c;
}

export interface ArticleInput { sku: string; name: string; unit?: string; priceMinor: number; costMinor?: number; taxRateId?: string }

export function validateArticle(s: Store, a: ArticleInput, exceptId?: string): void {
  const sku = a.sku.trim();
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(sku)) throw new DomainError('INVALID_SKU', 'Artikelnummer: 1–40 Zeichen, nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich.');
  if (s.articles.some((x) => x.id !== exceptId && x.sku.toLowerCase() === sku.toLowerCase())) throw new DomainError('DUPLICATE_SKU', `Artikelnummer ${sku} gibt es bereits.`);
  if (!a.name.trim() || a.name.length > 200) throw new DomainError('INVALID_NAME', 'Bezeichnung fehlt oder ist zu lang.');
  requireMoney(a.priceMinor, 'Verkaufspreis');
  requireMoney(a.costMinor ?? 0, 'Einkaufspreis');
  if (!s.settings.taxRates.some((t) => t.id === (a.taxRateId ?? 'std'))) throw new DomainError('UNKNOWN_TAX_RATE', 'Unbekannter Steuersatz.');
}

export function addArticle(store: Store, ctx: Ctx, a: ArticleInput): { store: Store; result: Article } {
  return transact(store, (s) => {
    user(s, ctx);
    validateArticle(s, a);
    const row: Article = { id: nextId(s, 'art'), sku: a.sku.trim(), name: a.name.trim(), unit: (a.unit ?? 'Stk').trim() || 'Stk', priceMinor: a.priceMinor, costMinor: a.costMinor ?? 0, taxRateId: a.taxRateId ?? 'std', active: true };
    s.articles.push(row);
    audit(s, ctx, 'article.created', row.id, { sku: row.sku });
    return row;
  });
}

export function updateArticle(store: Store, ctx: Ctx, id: string, patch: Partial<ArticleInput> & { active?: boolean }): { store: Store; result: Article } {
  return transact(store, (s) => {
    user(s, ctx);
    const a = article(s, id);
    const next = { sku: patch.sku ?? a.sku, name: patch.name ?? a.name, unit: patch.unit ?? a.unit, priceMinor: patch.priceMinor ?? a.priceMinor, costMinor: patch.costMinor ?? a.costMinor, taxRateId: patch.taxRateId ?? a.taxRateId };
    validateArticle(s, next, id);
    Object.assign(a, next, patch.active === undefined ? {} : { active: patch.active });
    audit(s, ctx, 'article.updated', id, patch as Record<string, unknown>);
    return a;
  });
}

export interface PartyInput { name: string; email?: string | null; address?: string | null; vatId?: string | null }

function addParty(store: Store, ctx: Ctx, kind: 'customers' | 'suppliers', p: PartyInput): { store: Store; result: Party } {
  return transact(store, (s) => {
    user(s, ctx);
    if (!p.name.trim() || p.name.length > 200) throw new DomainError('INVALID_NAME', 'Name fehlt oder ist zu lang.');
    if (p.email && !EMAIL.test(p.email)) throw new DomainError('INVALID_EMAIL', 'E-Mail-Adresse ist ungültig.');
    const list = s[kind];
    const row: Party = { id: nextId(s, kind === 'customers' ? 'cus' : 'sup'), number: `${kind === 'customers' ? 'K' : 'L'}-${String(list.length + 1).padStart(4, '0')}`, name: p.name.trim(), email: p.email?.trim() || null, address: p.address?.trim() || null, vatId: p.vatId?.trim() || null, active: true };
    list.push(row);
    audit(s, ctx, `${kind === 'customers' ? 'customer' : 'supplier'}.created`, row.id, { number: row.number });
    return row;
  });
}

export const addCustomer = (store: Store, ctx: Ctx, p: PartyInput): { store: Store; result: Party } => addParty(store, ctx, 'customers', p);
export const addSupplier = (store: Store, ctx: Ctx, p: PartyInput): { store: Store; result: Party } => addParty(store, ctx, 'suppliers', p);

export interface StockLevel { onHand: number; reserved: number; available: number }

export function stockOf(s: Store, articleId: string): StockLevel {
  let onHand = 0;
  let reserved = 0;
  for (const m of s.movements) {
    if (m.articleId !== articleId) continue;
    if (m.type === 'RECEIPT' || m.type === 'RETURN' || m.type === 'ADJUST') onHand += m.qty;
    else if (m.type === 'ISSUE') onHand -= m.qty;
    else if (m.type === 'RESERVE') reserved += m.qty;
    else if (m.type === 'RELEASE') reserved -= m.qty;
  }
  return { onHand, reserved, available: onHand - reserved };
}

/** Interne Buchung ins Journal (nur aus fachlichen Operationen heraus aufgerufen). */
export function book(s: Store, ctx: Ctx, type: MovementType, articleId: string, qty: number, ref: string, reason: string | null = null): void {
  s.seq += 1;
  s.movements.push({ seq: s.seq, at: iso(ctx.now), type, articleId, qty, ref, reason, userId: ctx.userId });
}

export function receive(store: Store, ctx: Ctx, input: { articleId: string; qty: number; supplierId?: string; ref?: string }): { store: Store; result: StockLevel } {
  return transact(store, (s) => {
    user(s, ctx);
    article(s, input.articleId);
    requirePositiveInt(input.qty, 'Zugangsmenge');
    if (input.supplierId && !s.suppliers.some((x) => x.id === input.supplierId)) throw new DomainError('SUPPLIER_NOT_FOUND', 'Lieferant nicht gefunden.');
    book(s, ctx, 'RECEIPT', input.articleId, input.qty, input.ref?.trim() || 'Wareneingang');
    audit(s, ctx, 'stock.received', input.articleId, { qty: input.qty, supplierId: input.supplierId ?? null });
    return stockOf(s, input.articleId);
  });
}

/** Korrekturbuchung (Inventur, Bruch, Schwund): nur Inhaber, nur mit Grund, nie unter die reservierte Menge. */
export function adjust(store: Store, ctx: Ctx, input: { articleId: string; delta: number; reason: string }): { store: Store; result: StockLevel } {
  return transact(store, (s) => {
    requireRole(s, ctx, 'OWNER', 'Bestandskorrekturen buchen');
    article(s, input.articleId);
    if (!Number.isSafeInteger(input.delta) || input.delta === 0) throw new DomainError('INVALID_QUANTITY', 'Korrekturmenge muss eine ganze Zahl ungleich 0 sein.');
    if (input.reason.trim().length < 3) throw new DomainError('REASON_REQUIRED', 'Für eine Korrektur ist ein Grund nötig.');
    const before = stockOf(s, input.articleId);
    if (before.onHand + input.delta < 0) throw new DomainError('NEGATIVE_STOCK', `Bestand würde negativ (${before.onHand + input.delta}).`);
    if (before.onHand + input.delta < before.reserved) throw new DomainError('BELOW_RESERVED', `${before.reserved} Stück sind für Aufträge reserviert.`);
    book(s, ctx, 'ADJUST', input.articleId, input.delta, 'Korrektur', input.reason.trim());
    audit(s, ctx, 'stock.adjusted', input.articleId, { delta: input.delta, reason: input.reason.trim() });
    return stockOf(s, input.articleId);
  });
}
