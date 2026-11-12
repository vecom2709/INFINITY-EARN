import { getAcceptance, getFeedback, preContractRisk } from '../../../../services/core-api/src/aftercare.ts';
import { changesForOrder } from '../../../../services/core-api/src/change-requests.ts';
import { PHASES, paymentLabel, phaseOf, pipelineLabel } from '../labels.ts';
import { fmtDate, friendlyTitle, money, orderRows, plainReason, shortRef } from '../model.ts';
import { action, e, empty, explain, kv, modeSwitch, panel, shell, steps, table, tag, withMode } from '../ui.ts';
import type { PageCtx } from './types.ts';

const GROUPS: { key: string; label: string; states: string[] }[] = [
  { key: 'offen', label: 'Angeboten', states: ['QUOTED', 'CUSTOMER_ACCEPTED'] },
  { key: 'arbeit', label: 'Bezahlt / in Arbeit', states: ['PAYMENT_CONFIRMED', 'PRODUCTION_QUEUED', 'IN_PRODUCTION', 'QA_PASSED'] },
  { key: 'geliefert', label: 'Geliefert', states: ['DELIVERED', 'INVOICE_RECORDED', 'LEDGER_RECONCILED', 'PAYOUT_RECORDED', 'TAX_REVIEW'] },
  { key: 'fertig', label: 'Abgeschlossen', states: ['CLOSED', 'CANCELLED'] },
  { key: 'pruefen', label: 'Braucht Prüfung', states: ['MANUAL_REVIEW', 'QA_FAILED', 'NO_CAPACITY', 'REFUND_PENDING', 'DISPUTE', 'PAYMENT_FAILED'] },
];

export function renderOrders(pc: PageCtx, filter: string | null): string {
  const test = pc.mode === 'test';
  const all = orderRows(pc.ctx, test, 200);
  const group = GROUPS.find((g) => g.key === filter);
  const rows = group ? all.filter((o) => group.states.includes(o.pipelineState)) : all;
  const chip = (key: string | null, label: string, n: number): string => {
    const href = withMode(key ? `/dashboard/auftraege?phase=${key}` : '/dashboard/auftraege', pc.mode);
    return `<a href="${e(href)}"${(filter ?? null) === key ? ' aria-current="true"' : ''}>${e(label)} (${n})</a>`;
  };
  const filters = `<nav class="segmented" aria-label="Aufträge filtern" style="flex-wrap:wrap;margin-bottom:16px">${chip(null, 'Alle', all.length)}${GROUPS.map((g) => chip(g.key, g.label, all.filter((o) => g.states.includes(o.pipelineState)).length)).join('')}</nav>`;
  const body = `${filters}${panel({
    title: group ? group.label : 'Alle Aufträge', sub: 'Gefunden → angeboten → bezahlt → in Arbeit → geliefert → abgeschlossen', flush: true,
    body: table(
      [{ label: 'Auftrag' }, { label: 'Kunde' }, { label: 'Status' }, { label: 'Zahlung' }, { label: 'Betrag', amount: true }],
      rows.map((o) => {
        const l = pipelineLabel(o.pipelineState);
        const p = paymentLabel(o.paymentState);
        return [`<a href="${e(withMode(`/dashboard/auftraege/${o.orderId}`, pc.mode))}"><strong>${e(shortRef(o.orderId))}</strong></a><span class="sub">${e(o.title)} · ${e(fmtDate(o.createdAt))}</span>`, e(o.customer), tag(l.text, l.tone), tag(p.text, p.tone), e(money(o.amountMinor, o.currency))];
      }),
      test ? 'Keine Testaufträge in dieser Ansicht' : 'Noch keine Verkäufe',
      'Aufträge',
    ),
  })}`;
  return shell({ title: 'Aufträge', eyebrow: 'Aufträge', heading: 'Deine Aufträge', lead: 'Vom Angebot bis zur Lieferung. Du siehst auf einen Blick, was erledigt ist und wo etwas wartet.', active: 'auftraege', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch('/dashboard/auftraege', pc.mode), body, systemTestMode: pc.ctx.config.testMode });
}

interface OrderDetail {
  order_id: string; quote_id: string; amount_minor: number; currency: string; payment_state: string; fulfillment_state: string; test_mode: number; created_at: string;
  description: string; terms_json: string; valid_until: string; accepted_at: string | null; pipeline_state: string; state_reason: string | null; opportunity_id: string;
  name: string | null; country: string | null; buyer_type: string | null;
}

export function renderOrderDetail(pc: PageCtx, orderId: string): string | null {
  const o = pc.ctx.db.get<OrderDetail>(
    `SELECT o.order_id, o.quote_id, o.amount_minor, o.currency, o.payment_state, o.fulfillment_state, o.test_mode, o.created_at,
            q.description, q.terms_json, q.valid_until, q.accepted_at, op.pipeline_state, op.state_reason, op.opportunity_id, c.name, c.country, c.buyer_type
     FROM orders o JOIN quotes q ON q.quote_id = o.quote_id JOIN opportunities op ON op.opportunity_id = o.opportunity_id JOIN customers c ON c.customer_id = o.customer_id
     WHERE o.order_id = ?`, orderId,
  );
  if (!o) return null;
  const mode = o.test_mode === 1 ? 'test' : 'live';
  const bank = !!pc.ctx.db.get(`SELECT 1 AS x FROM payouts WHERE bank_credit_confirmed = 1 AND order_ids_json LIKE ?`, `%${orderId}%`);
  const l = pipelineLabel(o.pipeline_state);
  const ph = phaseOf(o.pipeline_state, bank);
  const stepList = PHASES.map((label, i) => ({ label: i === 6 && ph.index === 6 && !ph.waiting ? 'Auf Bank angekommen' : label, state: (i < ph.index ? 'done' : i === ph.index ? (ph.waiting ? 'wait' : o.pipeline_state === 'CLOSED' ? 'done' : 'now') : 'todo') as 'done' | 'now' | 'todo' | 'wait' }));
  const delivery = pc.ctx.db.get<{ released_at: string; download_count: number; revoked_at: string | null }>('SELECT released_at, download_count, revoked_at FROM deliveries WHERE order_id = ?', orderId);
  const qa = pc.ctx.db.get<{ passed: number; created_at: string }>('SELECT q.passed, q.created_at FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.order_id = ? ORDER BY q.created_at DESC LIMIT 1', orderId);
  const invoices = pc.ctx.db.all<{ invoice_number: string; kind: string; status: string; gross_minor: number; currency: string; created_at: string }>('SELECT invoice_number, kind, status, gross_minor, currency, created_at FROM invoices WHERE order_id = ? ORDER BY created_at', orderId);
  const contract = pc.ctx.db.get<{ created_at: string; download_count: number; buyer_type: string }>('SELECT created_at, download_count, buyer_type FROM contract_confirmations WHERE order_id = ?', orderId);
  const history = pc.ctx.db.all<{ to_state: string; actor: string; reason: string | null; created_at: string }>('SELECT to_state, actor, reason, created_at FROM state_transitions WHERE opportunity_id = ? ORDER BY id', o.opportunity_id);
  const refundOpen = pc.ctx.db.get(`SELECT 1 AS x FROM refund_requests WHERE order_id = ? AND status IN ('PENDING_OWNER','REQUESTED')`, orderId);
  const acceptance = getAcceptance(pc.ctx, orderId);
  const feedback = getFeedback(pc.ctx, orderId);
  const risk = preContractRisk(pc.ctx, orderId);
  const changes = changesForOrder(pc.ctx, orderId);
  const actor = (a: string): string => ({ system: 'Automatisch', owner: 'Du', customer: 'Kunde', provider: 'Zahlungsanbieter', ai: 'KI-Vorschlag' } as Record<string, string>)[a] ?? a;

  const summary = kv([
    ['Leistung', e(friendlyTitle(o.description))],
    ['Kunde', `${e(o.name ?? '—')}${o.country ? ` · ${e(o.country)}` : ''}${o.buyer_type ? ` · ${o.buyer_type === 'B2C' ? 'Verbraucher' : 'Unternehmen'}` : ''}`],
    ['Betrag', `${e(money(o.amount_minor, o.currency))} <span class="muted">(Steuer noch nicht berechnet – Steuerkontext fehlt)</span>`],
    ['Zahlung', `${tag(paymentLabel(o.payment_state).text, paymentLabel(o.payment_state).tone)} <span class="muted">${e(paymentLabel(o.payment_state).explain)}</span>`],
    ['Angenommen', o.accepted_at ? e(fmtDate(o.accepted_at, true)) : '—'],
    ['Vertragsbestätigung', contract ? `PDF erstellt am ${e(fmtDate(contract.created_at, true))} · vom Kunden ${contract.download_count}× abgerufen` : '<span class="muted">nicht vorhanden</span>'],
    ['Qualitätsprüfung', qa ? (qa.passed ? tag('Bestanden', 'ok') : tag('Nicht bestanden', 'bad')) : '<span class="muted">noch nicht geprüft</span>'],
    ['Lieferung', delivery ? (delivery.revoked_at ? tag('Zurückgezogen', 'bad') : `${tag('Bereitgestellt', 'ok')} <span class="muted">${delivery.download_count}× heruntergeladen</span>`) : '<span class="muted">noch nicht geliefert</span>'],
    ['Belege', invoices.length ? invoices.map((i) => `${e(i.kind === 'CREDIT_NOTE' ? 'Gutschrift' : 'Beleg')} ${e(i.invoice_number)} · ${e(money(i.gross_minor, i.currency))}${o.test_mode ? ' <span class="muted">(Testbeleg – keine gültige Rechnung)</span>' : ''}`).join('<br>') : '<span class="muted">noch keiner</span>'],
    ['Bankeingang', bank ? tag('Auf Bank bestätigt', 'ok') : '<span class="muted">Noch nicht bestätigt – kein Bankeingang verifizierbar</span>'],
    ['Abnahme durch Kunden', acceptance ? (acceptance.decision === 'ACCEPTED' ? tag('Abgenommen', 'ok') : `${tag('Mangel gemeldet', 'bad')} <span class="muted">${e(acceptance.note ?? '')}</span>`) : '<span class="muted">noch offen – keine automatische Abnahme</span>'],
    ['Rückmeldung', feedback ? `${feedback.rating} von 5 Sternen · ${e(({ IN_USE: 'im Einsatz', NOT_YET: 'noch nicht genutzt', NOT_USEFUL: 'hilft nicht' } as Record<string, string>)[feedback.outcome] ?? feedback.outcome)}` : '<span class="muted">keine</span>'],
    ['Nachträge', changes.length ? changes.map((ch) => `${e(ch.description)} – ${tag(ch.paid ? 'bezahlt' : pipelineLabel(ch.state).text, ch.paid ? 'ok' : 'pending')}${ch.amountMinor !== null ? ` <span class="muted">${e(money(ch.amountMinor, o.currency))}</span>` : ''}`).join('<br>') : '<span class="muted">keine</span>'],
    ['Risiko vor Vertragsschluss', `${tag(risk.level, risk.level === 'erhöht' ? 'bad' : risk.level === 'mittel' ? 'pending' : 'ok')}<ul style="margin:6px 0 0;padding-left:18px">${risk.reasons.map((r) => `<li>${e(r)}</li>`).join('')}</ul><span class="sub">${e(risk.disclaimer)}</span>`],
  ]);
  const timeline = history.length
    ? table([{ label: 'Zeitpunkt' }, { label: 'Schritt' }, { label: 'Durch' }, { label: 'Hinweis', full: true }], history.map((h) => [e(fmtDate(h.created_at, true)), e(pipelineLabel(h.to_state).text), e(actor(h.actor)), e(plainReason(h.reason ?? ''))]), 'Noch keine Schritte', 'Verlauf')
    : empty('Noch keine Schritte', 'Der Verlauf erscheint, sobald der Auftrag weiterläuft.');
  const refund = o.payment_state === 'CONFIRMED' && !refundOpen
    ? panel({ title: 'Erstattung', sub: 'Nur bei berechtigtem Anlass', body: action({ href: `/admin/orders/${orderId}/refund`, csrf: pc.csrf, label: 'Erstattung beantragen', variant: 'ghost', back: `/dashboard/auftraege/${orderId}${mode === 'test' ? '?modus=test' : ''}`, what: 'Legt einen Antrag an. Es fließt noch kein Geld – du entscheidest danach unter Finanzen, ob erstattet wird. Keine Kundennachricht.' }) })
    : '';
  const body = `<div style="margin-bottom:20px">${steps(stepList)}</div>
<div class="grid2">${panel({ title: 'Auftragsdetails', body: `${summary}${explain(l.explain, `Was bedeutet „${l.text}“?`)}` })}
<div class="stack">${panel({ title: 'Aktueller Stand', body: `<p style="margin:4px 0 8px">${tag(l.text, l.tone)}</p><p class="muted" style="margin:0">${e(o.state_reason ? plainReason(o.state_reason) : l.explain)}</p>` })}${refund}</div></div>
${panel({ title: 'Verlauf', sub: 'Jeder Schritt mit Zeitpunkt – unveränderlich protokolliert', body: timeline, flush: true })}`;
  return shell({ title: `Auftrag ${shortRef(orderId)}`, eyebrow: `Aufträge · ${mode === 'test' ? 'Testauftrag' : 'Echtauftrag'}`, heading: `Auftrag ${shortRef(orderId)}`, lead: friendlyTitle(o.description), active: 'auftraege', mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: `<a class="btn ghost" href="${e(withMode('/dashboard/auftraege', mode))}">Alle Aufträge</a>`, body, systemTestMode: pc.ctx.config.testMode });
}
