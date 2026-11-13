import { addDays, audit, computeTotals, type Ctx, day, DomainError, iso, nextId, requirePositiveInt, requireRole, takeNumber, transact, user } from './core.ts';
import { book } from './inventory.ts';
import type { Invoice, Line, Payment, Store } from './model.ts';

/**
 * Rechnungen, Gutschriften, Zahlungen, offene Posten, Mahnstufen.
 * Nummern werden erst bei der Festschreibung vergeben (lückenlos); festgeschriebene Belege sind unveränderlich –
 * Korrektur nur per Gutschrift. Die Software prüft keine Steuerpflichten (siehe Anleitung).
 */

export function invoice(s: Store, id: string): Invoice {
  const i = s.invoices.find((x) => x.id === id);
  if (!i) throw new DomainError('INVOICE_NOT_FOUND', 'Beleg nicht gefunden.');
  return i;
}

/** Rechnungsentwurf aus einer oder mehreren Lieferungen desselben Kunden; Preise aus dem Auftrag. */
export function draftInvoice(store: Store, ctx: Ctx, deliveryIds: string[]): { store: Store; result: Invoice } {
  return transact(store, (s) => {
    user(s, ctx);
    if (!deliveryIds.length) throw new DomainError('NO_DELIVERIES', 'Mindestens eine Lieferung auswählen.');
    const dels = deliveryIds.map((id) => {
      const d = s.deliveries.find((x) => x.id === id);
      if (!d) throw new DomainError('DELIVERY_NOT_FOUND', 'Lieferung nicht gefunden.');
      if (d.invoiceId) throw new DomainError('ALREADY_INVOICED', `Lieferung ${d.number} ist bereits abgerechnet.`);
      return d;
    });
    if (new Set(dels.map((d) => d.customerId)).size > 1) throw new DomainError('MIXED_CUSTOMERS', 'Lieferungen verschiedener Kunden können nicht auf eine Rechnung.');
    const map = new Map<string, Line>();
    for (const d of dels) {
      const o = s.orders.find((x) => x.id === d.orderId);
      if (!o) throw new DomainError('ORDER_NOT_FOUND', 'Auftrag zur Lieferung fehlt.');
      for (const dl of d.lines) {
        const ol = o.lines.find((x) => x.articleId === dl.articleId);
        if (!ol) throw new DomainError('NOT_IN_ORDER', 'Lieferposition ohne Auftragsposition.');
        const key = `${dl.articleId}|${ol.priceMinor}|${ol.taxBps}`;
        const cur = map.get(key);
        if (cur) cur.qty += dl.qty;
        else map.set(key, { articleId: dl.articleId, name: ol.name, qty: dl.qty, priceMinor: ol.priceMinor, taxBps: ol.taxBps });
      }
    }
    const lines = [...map.values()];
    const inv: Invoice = { id: nextId(s, 'inv'), number: null, kind: 'INVOICE', customerId: dels[0]?.customerId ?? '', deliveryIds: [...deliveryIds], refInvoiceId: null, lines, totals: computeTotals(lines), status: 'DRAFT', createdAt: iso(ctx.now), finalizedAt: null, dueDate: null, restock: false, reason: null };
    for (const d of dels) d.invoiceId = inv.id;
    s.invoices.push(inv);
    audit(s, ctx, 'invoice.drafted', inv.id, { deliveries: dels.map((d) => d.number) });
    return inv;
  });
}

/** Entwurf verwerfen (hat noch keine Nummer – daher keine Lücke). */
export function discardDraft(store: Store, ctx: Ctx, invoiceId: string): { store: Store; result: true } {
  return transact(store, (s) => {
    user(s, ctx);
    const inv = invoice(s, invoiceId);
    if (inv.status !== 'DRAFT') throw new DomainError('IMMUTABLE', 'Festgeschriebene Belege können nicht gelöscht werden – bitte Gutschrift erstellen.');
    for (const d of s.deliveries) if (d.invoiceId === inv.id) d.invoiceId = null;
    s.invoices = s.invoices.filter((x) => x.id !== inv.id);
    audit(s, ctx, 'invoice.discarded', invoiceId);
    return true as const;
  });
}

/** Festschreiben: nur Inhaber; vergibt die Nummer, Summen werden nachgerechnet, danach unveränderlich. */
export function finalize(store: Store, ctx: Ctx, invoiceId: string): { store: Store; result: Invoice } {
  return transact(store, (s) => {
    requireRole(s, ctx, 'OWNER', 'Belege festschreiben');
    const inv = invoice(s, invoiceId);
    if (inv.status !== 'DRAFT') throw new DomainError('IMMUTABLE', 'Beleg ist bereits festgeschrieben.');
    inv.totals = computeTotals(inv.lines);
    inv.number = takeNumber(s, inv.kind === 'INVOICE' ? 'invoice' : 'credit');
    inv.status = 'FINAL';
    inv.finalizedAt = iso(ctx.now);
    inv.dueDate = inv.kind === 'INVOICE' ? addDays(day(ctx.now), s.settings.paymentTermDays) : null;
    if (inv.kind === 'CREDIT_NOTE' && inv.restock) for (const l of inv.lines) book(s, ctx, 'RETURN', l.articleId, l.qty, inv.number, inv.reason);
    audit(s, ctx, inv.kind === 'INVOICE' ? 'invoice.finalized' : 'credit.finalized', inv.id, { number: inv.number, gross: inv.totals.grossMinor });
    return inv;
  });
}

/** Bereits gutgeschriebene Mengen je Artikel (Entwürfe zählen mit, damit nichts doppelt gutgeschrieben wird). */
function creditedQty(s: Store, invoiceId: string, articleId: string): number {
  return s.invoices.filter((x) => x.kind === 'CREDIT_NOTE' && x.refInvoiceId === invoiceId).flatMap((x) => x.lines).filter((l) => l.articleId === articleId).reduce((a, l) => a + l.qty, 0);
}

/** Gutschrift (statt Storno) zu einer festgeschriebenen Rechnung; optional Rücknahme ins Lager. */
export function createCreditNote(store: Store, ctx: Ctx, input: { invoiceId: string; lines: { articleId: string; qty: number }[]; reason: string; restock: boolean }): { store: Store; result: Invoice } {
  return transact(store, (s) => {
    requireRole(s, ctx, 'OWNER', 'Gutschriften erstellen');
    const ref = invoice(s, input.invoiceId);
    if (ref.kind !== 'INVOICE' || ref.status !== 'FINAL') throw new DomainError('INVALID_STATE', 'Gutschriften nur zu festgeschriebenen Rechnungen.');
    if (input.reason.trim().length < 3) throw new DomainError('REASON_REQUIRED', 'Für eine Gutschrift ist ein Grund nötig.');
    if (!input.lines.length) throw new DomainError('NO_LINES', 'Mindestens eine Position gutschreiben.');
    const lines: Line[] = input.lines.map((l) => {
      requirePositiveInt(l.qty, 'Gutschriftsmenge');
      const rl = ref.lines.find((x) => x.articleId === l.articleId);
      if (!rl) throw new DomainError('NOT_IN_INVOICE', 'Artikel ist nicht Teil der Rechnung.');
      if (creditedQty(s, ref.id, l.articleId) + l.qty > rl.qty) throw new DomainError('OVER_CREDIT', `${rl.name}: höchstens ${rl.qty - creditedQty(s, ref.id, l.articleId)} gutschreibbar.`);
      return { ...rl, qty: l.qty };
    });
    const cn: Invoice = { id: nextId(s, 'inv'), number: null, kind: 'CREDIT_NOTE', customerId: ref.customerId, deliveryIds: [], refInvoiceId: ref.id, lines, totals: computeTotals(lines), status: 'DRAFT', createdAt: iso(ctx.now), finalizedAt: null, dueDate: null, restock: input.restock, reason: input.reason.trim() };
    s.invoices.push(cn);
    audit(s, ctx, 'credit.drafted', cn.id, { ref: ref.number });
    return cn;
  });
}

export function paidAmount(s: Store, invoiceId: string): number {
  return s.payments.filter((p) => p.invoiceId === invoiceId).reduce((a, p) => a + p.amountMinor, 0);
}

export function creditedAmount(s: Store, invoiceId: string): number {
  return s.invoices.filter((x) => x.kind === 'CREDIT_NOTE' && x.status === 'FINAL' && x.refInvoiceId === invoiceId).reduce((a, x) => a + x.totals.grossMinor, 0);
}

/** Offener Betrag: Brutto − Zahlungen − festgeschriebene Gutschriften. Negativ = Guthaben des Kunden (Erstattung fällig). */
export function openAmount(s: Store, invoiceId: string): number {
  const inv = invoice(s, invoiceId);
  if (inv.kind !== 'INVOICE' || inv.status !== 'FINAL') return 0;
  return inv.totals.grossMinor - paidAmount(s, invoiceId) - creditedAmount(s, invoiceId);
}

export function recordPayment(store: Store, ctx: Ctx, input: { invoiceId: string; amountMinor: number; method?: string; note?: string }): { store: Store; result: Payment } {
  return transact(store, (s) => {
    user(s, ctx);
    const inv = invoice(s, input.invoiceId);
    if (inv.kind !== 'INVOICE' || inv.status !== 'FINAL') throw new DomainError('INVALID_STATE', 'Zahlungen nur auf festgeschriebene Rechnungen.');
    requirePositiveInt(input.amountMinor, 'Zahlbetrag');
    const open = openAmount(s, inv.id);
    if (input.amountMinor > open) throw new DomainError('OVERPAYMENT', `Offen sind nur ${open} Cent – Überzahlung bitte als Guthaben klären.`);
    const p: Payment = { id: nextId(s, 'pay'), invoiceId: inv.id, amountMinor: input.amountMinor, at: iso(ctx.now), method: input.method?.trim() || 'Überweisung', note: input.note?.trim() || null, userId: ctx.userId };
    s.payments.push(p);
    audit(s, ctx, 'payment.recorded', inv.id, { amount: p.amountMinor });
    return p;
  });
}

/** Mahnstufe 0–3 aus Fälligkeit, heutigem Datum und den eingestellten Fristen. */
export function dunningLevel(s: Store, dueDate: string | null, today: string): 0 | 1 | 2 | 3 {
  if (!dueDate || today <= dueDate) return 0;
  const overdue = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
  const [a, b, c] = s.settings.dunningDays;
  return overdue >= c ? 3 : overdue >= b ? 2 : overdue >= a ? 1 : 0;
}

export interface OpenItem { invoiceId: string; number: string; customerId: string; grossMinor: number; openMinor: number; dueDate: string | null; dunning: 0 | 1 | 2 | 3 }

export function openItems(s: Store, today: string): OpenItem[] {
  return s.invoices
    .filter((i) => i.kind === 'INVOICE' && i.status === 'FINAL')
    .map((i) => ({ invoiceId: i.id, number: i.number ?? '', customerId: i.customerId, grossMinor: i.totals.grossMinor, openMinor: openAmount(s, i.id), dueDate: i.dueDate, dunning: dunningLevel(s, i.dueDate, today) }))
    .filter((x) => x.openMinor !== 0)
    .map((x) => (x.openMinor < 0 ? { ...x, dunning: 0 as const } : x));
}
