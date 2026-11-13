import { stockOf } from './inventory.ts';
import type { Store } from './model.ts';
import { openItems } from './billing.ts';

/** Berichte – ausschließlich aus Journal und festgeschriebenen Belegen berechnet. */

export interface Revenue { netMinor: number; taxMinor: number; grossMinor: number; invoices: number; credits: number }

/** Umsatz eines Zeitraums (inklusive Grenzen, JJJJ-MM-TT): Rechnungen minus Gutschriften, nach Festschreibungsdatum. */
export function revenue(s: Store, from: string, to: string): Revenue {
  const r: Revenue = { netMinor: 0, taxMinor: 0, grossMinor: 0, invoices: 0, credits: 0 };
  for (const i of s.invoices) {
    if (i.status !== 'FINAL' || !i.finalizedAt) continue;
    const d = i.finalizedAt.slice(0, 10);
    if (d < from || d > to) continue;
    const sign = i.kind === 'INVOICE' ? 1 : -1;
    r.netMinor += sign * i.totals.netMinor;
    r.taxMinor += sign * i.totals.taxMinor;
    r.grossMinor += sign * i.totals.grossMinor;
    if (sign > 0) r.invoices++;
    else r.credits++;
  }
  return r;
}

export interface StockRow { articleId: string; sku: string; name: string; onHand: number; reserved: number; available: number; valueMinor: number }

/** Lagerbestand und Lagerwert zum Einkaufspreis. */
export function stockReport(s: Store): { rows: StockRow[]; totalValueMinor: number } {
  const rows = s.articles.map((a) => {
    const st = stockOf(s, a.id);
    return { articleId: a.id, sku: a.sku, name: a.name, ...st, valueMinor: st.onHand * a.costMinor };
  });
  return { rows, totalValueMinor: rows.reduce((x, r) => x + r.valueMinor, 0) };
}

export function openItemsReport(s: Store, today: string): { totalOpenMinor: number; customerCreditMinor: number; overdue: number; items: ReturnType<typeof openItems> } {
  const items = openItems(s, today);
  return {
    totalOpenMinor: items.filter((i) => i.openMinor > 0).reduce((a, i) => a + i.openMinor, 0),
    customerCreditMinor: -items.filter((i) => i.openMinor < 0).reduce((a, i) => a + i.openMinor, 0),
    overdue: items.filter((i) => i.dunning > 0).length,
    items,
  };
}

/** Bewegungen eines Artikels mit laufendem Bestand – zum Nachvollziehen jeder Buchung. */
export function movementHistory(s: Store, articleId: string): { seq: number; at: string; type: string; qty: number; ref: string; reason: string | null; onHandAfter: number }[] {
  let onHand = 0;
  return s.movements.filter((m) => m.articleId === articleId).map((m) => {
    if (m.type === 'RECEIPT' || m.type === 'RETURN' || m.type === 'ADJUST') onHand += m.qty;
    else if (m.type === 'ISSUE') onHand -= m.qty;
    return { seq: m.seq, at: m.at, type: m.type, qty: m.qty, ref: m.ref, reason: m.reason, onHandAfter: onHand };
  });
}
