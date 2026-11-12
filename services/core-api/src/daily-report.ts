import type { AppContext } from './context.ts';
import { readinessSummary } from './readiness.ts';

/**
 * 001 Täglicher Eigentümerbericht – deterministisch aus gespeicherten Ereignissen der letzten 24 Stunden (keine KI,
 * keine Schätzung). LIVE und TEST getrennt. Grundlage für „Was ist heute passiert?“ (Design-System §1).
 */
export interface DailyReport {
  mode: 'LIVE' | 'TEST';
  from: string;
  to: string;
  inquiries: number;
  quotes: number;
  accepted: number;
  paidOrders: number;
  paidMinor: number;
  delivered: number;
  refundsMinor: number;
  bankConfirmedMinor: number;
  openDecisions: number;
  liveApprovals: { done: number; total: number };
  summary: string;
}

export function dailyReport(ctx: AppContext, test: boolean, openDecisions: number): DailyReport {
  const t = test ? 1 : 0;
  const to = ctx.clock();
  const from = new Date(to.getTime() - 86_400_000).toISOString();
  const ev = (type: string): number => ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_events WHERE test_mode = ? AND event_type = ? AND created_at >= ?', t, type, from)?.n ?? 0;
  const sum = (account: string): number => ctx.db.get<{ s: number }>('SELECT COALESCE(SUM(amount_minor),0) AS s FROM ledger_entries WHERE test_mode = ? AND account = ? AND created_at >= ?', t, account, from)?.s ?? 0;
  const bank = ctx.db.get<{ s: number }>('SELECT COALESCE(SUM(amount_minor),0) AS s FROM payouts WHERE test_mode = ? AND bank_credit_confirmed = 1 AND bank_verified_at >= ?', t, from)?.s ?? 0;
  const rs = readinessSummary(ctx);
  const r = {
    inquiries: ev('lead.received') + ev('lead.ingested'), quotes: ev('quote.issued'), accepted: ev('quote.accepted'), paidOrders: ev('payment.confirmed'),
    paidMinor: sum('customer_payments'), delivered: ev('delivery.completed'), refundsMinor: -sum('refunds'), bankConfirmedMinor: bank,
  };
  const eur = (m: number): string => `${(m / 100).toFixed(2).replace('.', ',')} €`;
  const parts: string[] = [];
  if (!test && rs.done < rs.total) parts.push(`Echtbetrieb gesperrt (${rs.done} von ${rs.total} Freigaben).`);
  parts.push(r.inquiries || r.quotes || r.paidOrders || r.delivered
    ? `${r.inquiries} Anfrage(n), ${r.quotes} Angebot(e), ${r.accepted} angenommen, ${r.paidOrders} bezahlt (${eur(r.paidMinor)}), ${r.delivered} geliefert.`
    : 'Keine neuen Vorgänge in den letzten 24 Stunden.');
  if (r.bankConfirmedMinor) parts.push(`${eur(r.bankConfirmedMinor)} als Bankeingang bestätigt.`);
  parts.push(openDecisions ? `${openDecisions} Punkt(e) brauchen deine Entscheidung.` : 'Nichts braucht deine Entscheidung.');
  return { mode: test ? 'TEST' : 'LIVE', from, to: to.toISOString(), ...r, openDecisions, liveApprovals: { done: rs.done, total: rs.total }, summary: parts.join(' ') };
}
