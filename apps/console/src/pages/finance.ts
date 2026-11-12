import { openCheckouts } from '../../../../services/core-api/src/trust.ts';
import { businessProfile } from '../../../../services/core-api/src/readiness.ts';
import { financeView, fmtDate, money, shortRef } from '../model.ts';
import { action, e, explain, metric, modeSwitch, panel, shell, table, tag, withMode } from '../ui.ts';
import type { PageCtx } from './types.ts';

const REFUND_STATUS: Record<string, { text: string; tone: 'ok' | 'pending' | 'bad' | 'neutral' }> = {
  PENDING_OWNER: { text: 'Wartet auf dich', tone: 'pending' },
  REQUESTED: { text: 'Beim Anbieter angefordert', tone: 'pending' },
  CONFIRMED: { text: 'Erstattet (bestätigt)', tone: 'ok' },
  REJECTED: { text: 'Abgelehnt', tone: 'neutral' },
  FAILED: { text: 'Fehlgeschlagen', tone: 'bad' },
};
const REFUND_ORIGIN: Record<string, string> = { customer_withdrawal: 'Widerruf des Kunden', complaint: 'Reklamation', qa_failure: 'Qualitätsmangel', owner: 'Deine Entscheidung' };

function renderBankPanel(pc: PageCtx, back: string): string {
  const test = pc.mode === 'test';
  const t = test ? 1 : 0;
  const statements = pc.ctx.db.all<{ statement_id: string; source_format: string; account_masked: string | null; entries: number; credits: number; matched: number; created_at: string }>(
    'SELECT statement_id, source_format, account_masked, entries, credits, matched, created_at FROM bank_statements WHERE test_mode = ? ORDER BY created_at DESC LIMIT 10', t,
  );
  const openPayouts = pc.ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM payouts WHERE test_mode = ? AND status = 'SENT' AND bank_credit_confirmed = 0`, t)?.n ?? 0;
  const reconciled = pc.ctx.db.all<{ order_id: string }>(
    `SELECT o.order_id FROM orders o JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE o.test_mode = 1 AND op.pipeline_state = 'LEDGER_RECONCILED'`,
  );
  const canMockPayout = test && pc.ctx.config.testMode && pc.ctx.config.payment.provider === 'mock' && reconciled.length > 0;
  if (!test) {
    return panel({ id: 'bankabgleich', title: 'Bankabgleich', sub: 'Bestätigt, dass Geld wirklich auf deinem Konto angekommen ist', body: `<p style="margin:4px 0 8px">${tag('Noch nicht verbunden', 'neutral')}</p>
<p class="muted" style="margin:0">Echte Kontoauszüge können erst importiert werden, wenn Zahlungsanbieter und Auszahlungskonto freigegeben sind (Live-Freigaben LA-03 und LA-04). Bis dahin wird kein Bankeingang angezeigt.</p>
${explain('Eine Auszahlungsmeldung des Zahlungsanbieters heißt nur „unterwegs“. Erst eine passende Gutschrift auf deinem Kontoauszug bestätigt den Bankeingang. Der Abgleich erfolgt nach festen Regeln: Auszahlungsnummer im Verwendungszweck oder eindeutiger Betrag im passenden Zeitraum.')}` });
  }
  const testTools = `<div class="actions" style="margin-top:14px">
${canMockPayout ? action({ href: '/admin/payouts/test', csrf: pc.csrf, label: `Testauszahlung melden (${reconciled.length})`, variant: 'ghost', back: `${back}#bankabgleich`, what: 'Simuliert eine signierte Auszahlungsmeldung des Test-Zahlungsanbieters für abgeglichene Testaufträge. Kein echtes Geld.' }) : ''}
${openPayouts ? `<div class="action"><a class="btn ghost" href="/admin/bank/test-statement">Test-Kontoauszug herunterladen (camt.053)</a><span class="what">Erzeugt einen als TEST gekennzeichneten Auszug mit ${openPayouts} Gutschrift${openPayouts === 1 ? '' : 'en'}. Danach unten einfügen.</span></div>` : ''}</div>`;
  return panel({ id: 'bankabgleich', title: 'Bankabgleich (Testbetrieb)', sub: 'Kontoauszug einfügen – Gutschriften werden mit gemeldeten Auszahlungen abgeglichen', body: `
<form class="action" method="post" action="/admin/bank/import"><input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(`${back}#bankabgleich`)}">
<label for="stmt">Kontoauszug (CSV aus dem Online-Banking oder camt.053-XML), max. 60 KB</label>
<textarea id="stmt" name="statement" required rows="6" placeholder="Buchungstag;Betrag;Währung;Verwendungszweck&#10;13.11.2026;51,23;EUR;Auszahlung po_…"></textarea>
<button class="btn" type="submit">Kontoauszug abgleichen</button><span class="what">Liest die Buchungen und bestätigt passende Auszahlungen. Im Testbetrieb nur Auszüge mit TEST-Kennzeichnung. Die Datei selbst wird nicht gespeichert, die IBAN nur gekürzt. Keine Kosten, keine Nachricht.</span></form>
${testTools}
<h3 style="margin:22px 0 4px;font-size:15px">Importierte Auszüge</h3>
${statements.length ? `<ul class="feed">${statements.map((s) => `<li><span class="badge">${s.matched ? '&#10003;' : '&#8226;'}</span><div><h3>${e(s.source_format === 'CAMT053' ? 'camt.053' : 'CSV')} · ${e(fmtDate(s.created_at, true))}</h3><p>${s.entries} Buchungen, ${s.credits} Gutschriften, <strong>${s.matched}</strong> Auszahlung${s.matched === 1 ? '' : 'en'} bestätigt${s.account_masked ? ` · Konto ${e(s.account_masked)}` : ''}</p></div></li>`).join('')}</ul>` : '<p class="muted" style="margin:4px 0 0">Noch kein Kontoauszug importiert – deshalb wird kein Bankeingang angezeigt.</p>'}` });
}

export function renderFinance(pc: PageCtx): string {
  const test = pc.mode === 'test';
  const t = test ? 1 : 0;
  const f = financeView(pc.ctx, test);
  const back = withMode('/dashboard/finanzen', pc.mode);
  const refunds = pc.ctx.db.all<{ refund_request_id: string; order_id: string; amount_minor: number; currency: string; origin: string; reason: string; status: string; created_at: string }>(
    'SELECT refund_request_id, order_id, amount_minor, currency, origin, reason, status, created_at FROM refund_requests WHERE test_mode = ? ORDER BY created_at DESC LIMIT 20', t,
  );
  const seatIt = businessProfile(pc.ctx).seat_country === 'IT';
  const invoices = pc.ctx.db.all<{ invoice_id: string; invoice_number: string; order_id: string; kind: string; status: string; gross_minor: number; currency: string; created_at: string }>(
    'SELECT invoice_id, invoice_number, order_id, kind, status, gross_minor, currency, created_at FROM invoices WHERE test_mode = ? ORDER BY created_at DESC LIMIT 20', t,
  );
  const payouts = pc.ctx.db.all<{ provider_payout_id: string; amount_minor: number; currency: string; status: string; bank_credit_confirmed: number; created_at: string }>(
    'SELECT provider_payout_id, amount_minor, currency, status, bank_credit_confirmed, created_at FROM payouts WHERE test_mode = ? ORDER BY created_at DESC LIMIT 20', t,
  );
  const recon = pc.ctx.db.get<{ status: string; created_at: string }>('SELECT status, created_at FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1');
  const provider = pc.ctx.config.payment.provider === 'stripe' ? 'Stripe (Testmodus)' : 'Testzahlung (ohne Anbieter)';

  const five = `<section class="metrics five" aria-label="Geldfluss in fünf getrennten Stufen">
${metric({ id: 'paid', label: 'Bestellungen bezahlt', value: money(f.paidMinor, f.currency), sub: 'Bestätigte Kundenzahlungen – kein Gewinn', icon: 'wallet' })}
${metric({ id: 'provider', label: 'Beim Zahlungsanbieter', value: money(f.atProviderMinor, f.currency), sub: 'Nach Gebühren und Erstattungen, noch nicht ausgezahlt', icon: 'receipt' })}
${metric({ id: 'transit', label: 'Auszahlung unterwegs', value: money(f.inTransitMinor, f.currency), sub: 'Ausgelöst, aber nicht als Bankeingang bestätigt', icon: 'clock' })}
${f.bankConnected
    ? metric({ id: 'bank', label: 'Auf Bank eingegangen', value: money(f.onBankMinor, f.currency), sub: 'Nur nach Bankabstimmung', icon: 'bank', accent: true })
    : metric({ id: 'bank', label: 'Auf Bank eingegangen', value: 'Noch nicht verbunden', sub: 'Kein Bankeingang verifizierbar', icon: 'bank', text: true })}
${metric({ id: 'reserve', label: 'Geschätzte Rücklage', value: f.reserveMinor === null ? 'Nicht eingerichtet' : money(f.reserveMinor, f.currency), sub: f.reserveMinor === null ? 'Steuerkontext fehlt – keine Schätzung' : 'Schätzung, keine Steuerberechnung', icon: 'shield', text: f.reserveMinor === null })}
</section>`;

  const body = `${five}
<div class="grid2">
${panel({ title: 'So fließt dein Geld', body: `<ol style="margin:4px 0 0;padding-left:20px;color:var(--ink-soft)">
<li style="margin-bottom:8px"><strong>Bezahlt:</strong> Der Zahlungsanbieter bestätigt die Kundenzahlung signiert. Erst dann wird gearbeitet.</li>
<li style="margin-bottom:8px"><strong>Beim Anbieter:</strong> Das Geld liegt beim Anbieter, abzüglich seiner tatsächlichen Gebühren (${e(money(Math.abs(f.feesMinor), f.currency))}) und Erstattungen (${e(money(Math.abs(f.refundsMinor), f.currency))}).</li>
<li style="margin-bottom:8px"><strong>Unterwegs:</strong> Der Anbieter hat eine Auszahlung gemeldet. Das heißt noch nicht, dass sie angekommen ist.</li>
<li><strong>Auf Bank:</strong> Zählt nur nach unabhängiger Bankbestätigung. ${f.bankConnected ? 'Abgleich über importierte Kontoauszüge (unten).' : 'Eine Bankanbindung ist noch nicht eingerichtet.'}</li></ol>
${explain('Umsatz ist nicht Gewinn. Gebühren, Erstattungen, Steuern und Kosten gehen noch ab. Die Rücklage ist nur eine vorsichtige Schätzung, solange keine geprüften Steuerregeln hinterlegt sind.')}` })}
${panel({ title: 'Zahlungsanbieter', body: `<p style="margin:4px 0 8px">${tag(provider, 'pending')}</p><p class="muted" style="margin:0">Zahlungen, Erstattungen und Gebühren werden nur nach einer signierten Bestätigung des Anbieters gebucht – nie aufgrund einer Weiterleitung im Browser.</p>
<p style="margin:14px 0 0">Letzter Zahlungsabgleich: ${recon ? `${recon.status === 'OK' ? tag('Stimmt überein', 'ok') : tag('Abweichung – bitte prüfen', 'bad')} <span class="muted">${e(fmtDate(recon.created_at, true))}</span>` : '<span class="muted">noch keiner</span>'}</p>` })}
</div>
${panel({ id: 'erstattungen', title: 'Rückerstattungen', sub: 'Es wird nur erstattet, wenn du zustimmst', flush: true, body: table(
    [{ label: 'Auftrag' }, { label: 'Anlass' }, { label: 'Betrag', amount: true }, { label: 'Status' }, { label: 'Entscheidung', full: true }],
    refunds.map((r) => [`<a href="${e(withMode(`/dashboard/auftraege/${r.order_id}`, pc.mode))}"><strong>${e(shortRef(r.order_id))}</strong></a><span class="sub">${e(fmtDate(r.created_at))}</span>`, `${e(REFUND_ORIGIN[r.origin] ?? r.origin)}<span class="sub">${e(r.reason.slice(0, 120))}</span>`, e(money(r.amount_minor, r.currency)),
      tag((REFUND_STATUS[r.status] ?? { text: r.status }).text, (REFUND_STATUS[r.status] ?? { tone: 'neutral' as const }).tone),
      r.status === 'PENDING_OWNER' ? `<div class="actions">${action({ href: `/admin/refunds/${r.refund_request_id}/approve`, csrf: pc.csrf, label: 'Erstatten', back, what: 'Fordert die Erstattung beim Zahlungsanbieter an. Gebucht wird erst nach dessen Bestätigung. Keine Zusatzkosten.' })}${action({ href: `/admin/refunds/${r.refund_request_id}/reject`, csrf: pc.csrf, label: 'Ablehnen', variant: 'ghost', hidden: { note: 'abgelehnt durch Eigentümer' }, back, what: 'Es fließt kein Geld zurück.' })}</div>` : '<span class="muted">—</span>']),
    'Keine Erstattungen', 'Rückerstattungen') })}
${panel({ id: 'offene-zahlungen', title: 'Angenommen, aber nicht bezahlt', sub: 'Abgebrochene oder fehlgeschlagene Zahlungen', flush: true, body: `${table(
    [{ label: 'Auftrag' }, { label: 'Zahlung' }, { label: 'Seit' }, { label: 'Betrag', amount: true }],
    openCheckouts(pc.ctx, test).map((oc) => [`<a href="${e(withMode(`/dashboard/auftraege/${oc.orderId}`, pc.mode))}"><strong>${e(shortRef(oc.orderId))}</strong></a>`, oc.paymentState === 'FAILED' ? tag('Fehlgeschlagen', 'bad') : tag('Offen', 'pending'), oc.ageHours < 48 ? `${oc.ageHours} Std.` : `${Math.floor(oc.ageHours / 24)} Tage`, e(money(oc.amountMinor, oc.currency))]),
    'Keine offenen Zahlungen', 'Offene Zahlungen')}<p class="muted" style="font-size:13px;margin:8px 24px 16px">Es werden keine automatischen Erinnerungen verschickt. Kunden können die Zahlung im Kundenportal selbst fortsetzen.</p>` })}
${renderBankPanel(pc, back)}
<div class="grid2 even">
${panel({ title: 'Belege', sub: test ? 'Testbelege – keine gültigen Rechnungen' : 'Rechnungen und Gutschriften', flush: true, body: table(
    [{ label: 'Nummer' }, { label: 'Auftrag' }, { label: 'Betrag', amount: true }],
    invoices.map((i) => [`<strong>${e(i.invoice_number)}</strong><span class="sub">${e(i.kind === 'CREDIT_NOTE' ? 'Gutschrift' : 'Beleg')} · ${e(fmtDate(i.created_at))}${seatIt ? ` · <a href="/admin/invoices/${e(i.invoice_id)}/fatturapa">FatturaPA (XML)</a>` : ''}</span>`, `<a href="${e(withMode(`/dashboard/auftraege/${i.order_id}`, pc.mode))}">${e(shortRef(i.order_id))}</a>`, e(money(i.gross_minor, i.currency))]),
    'Noch keine Belege', 'Belege') })}
${panel({ title: 'Auszahlungen', sub: 'Gemeldet vom Anbieter – Bankeingang separat', flush: true, body: table(
    [{ label: 'Datum' }, { label: 'Status' }, { label: 'Betrag', amount: true }],
    payouts.map((p) => [e(fmtDate(p.created_at)), p.status === 'FAILED' ? tag('Fehlgeschlagen', 'bad') : p.bank_credit_confirmed ? tag('Auf Bank angekommen', 'ok') : tag('Auszahlung unterwegs', 'pending'), e(money(p.amount_minor, p.currency))]),
    'Noch keine Auszahlungen', 'Auszahlungen') })}
</div>`;
  return shell({ title: 'Finanzen', eyebrow: 'Finanzen', heading: 'Deine Finanzen', lead: 'Bezahlt, beim Anbieter, unterwegs und auf der Bank – sauber getrennt. Nichts wird schöner dargestellt, als es ist.', active: 'finanzen', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch('/dashboard/finanzen', pc.mode), body, systemTestMode: pc.ctx.config.testMode });
}
