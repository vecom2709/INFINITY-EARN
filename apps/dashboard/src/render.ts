import { formatMinor } from '../../../packages/contracts/src/money.ts';
import { STOP_NAMES } from '../../../packages/policies/src/engine.ts';
import type { AppContext } from '../../../services/core-api/src/context.ts';
import { activeStops, effectivePolicy } from '../../../services/core-api/src/policy-store.ts';
import { computeKpis, type Kpis } from '../../../services/finance/src/kpis.ts';
import { listCapabilities } from '../../../services/product-factory/src/registry.ts';
import { rankOpportunities } from '../../../services/acquisition/src/ranking.ts';
import { listSources } from '../../../services/acquisition/src/sources.ts';
import { businessProfile, listActivationItems, readinessSummary } from '../../../services/core-api/src/readiness.ts';
import { e, page } from '../../shared/layout.ts';

function renderReadiness(ctx: AppContext, csrf: string): string {
  const hidden = `<input type="hidden" name="_csrf" value="${e(csrf)}">`;
  const s = readinessSummary(ctx);
  const p = businessProfile(ctx);
  const items = listActivationItems(ctx);
  const opt = (v: string, cur: string, label: string): string => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
  return `
<h2>M3 – Live-Freigaben (${s.done}/${s.total})</h2>
<div class="card"><strong>Unternehmensprofil:</strong> Sitzland <span class="tag">${e(p.seat_country ?? '?')}</span> · Rechtsform ${e(p.legal_entity ?? '?')} · Kunden ${e(p.customer_types ?? '?')} · Märkte ${e(p.markets ?? '?')}
<div class="muted">${e(s.message)} Unterlagen: docs/compliance/ (Entscheidungsvorlage, Entwürfe).</div></div>
<div class="card table-wrap"><table><tr><th>Punkt</th><th>Verantwortlich</th><th>Status / Nachweis</th><th>Aktualisieren</th></tr>
${items.map((i) => `<tr><td><strong>${e(i.item_id)}</strong> ${e(i.title)}</td><td class="muted">${e(i.responsible)}</td>
<td><span class="tag ${i.status === 'APPROVED' ? 'ok' : ''}">${e(i.status)}</span>${i.evidence_ref ? `<div class="muted">Nachweis: ${e(i.evidence_ref)}</div>` : ''}</td>
<td><form method="post" action="/admin/readiness/${e(i.item_id)}">${hidden}
<select name="status" aria-label="Status ${e(i.item_id)}">${opt('OPEN', i.status, 'offen')}${opt('IN_PROGRESS', i.status, 'in Arbeit')}${opt('APPROVED', i.status, 'freigegeben')}${opt('NOT_APPLICABLE', i.status, 'nicht zutreffend')}</select>
<input type="text" name="evidence" placeholder="Nachweis (Pflicht bei Freigabe)" aria-label="Nachweis ${e(i.item_id)}" value="${e(i.evidence_ref ?? '')}">
<button class="secondary">Speichern</button></form></td></tr>`).join('')}
</table></div>`;
}

function money(k: Kpis, v: number): string {
  return `${formatMinor(v, k.currency)} ${k.currency}`;
}

function kpiGrid(k: Kpis): string {
  const tiles: [string, string][] = [
    ['Brutto-Einnahmen', money(k, k.grossReceiptsMinor)],
    ['Rückerstattungen', money(k, k.refundsMinor)],
    ['Gebühren (Provider)', money(k, k.feesMinor)],
    ['Disputes', money(k, k.disputesMinor)],
    ['Sonstige Betriebskosten', money(k, k.otherCostsMinor)],
    ['Deckungsbeitrag', money(k, k.contributionMinor)],
    ['Steuerrücklage', k.taxReserve.estimateMinor === null ? 'nicht konfiguriert' : `${money(k, k.taxReserve.estimateMinor)} (Schätzung)`],
    ['Auszahlungen (Provider gemeldet)', money(k, k.providerReportedPayoutsMinor)],
    ['Bankeingang bestätigt', money(k, k.bankCreditConfirmedMinor)],
    ['Offene Aufträge', String(k.openOrders)],
    ['QA-Fehler', String(k.qaFailures)],
    ['Gescheiterte Auszahlungen', String(k.failedPayouts)],
  ];
  return `<div class="grid">${tiles.map(([l, v]) => `<div class="card kpi"><div class="l">${e(l)}</div><div class="v">${e(v)}</div></div>`).join('')}</div>`;
}

export function renderDashboard(ctx: AppContext, csrf: string, flash?: string): string {
  const live = computeKpis(ctx, false);
  const test = computeKpis(ctx, true);
  const stops = activeStops(ctx);
  const policy = effectivePolicy(ctx);
  const readiness = readinessSummary(ctx);
  const reviews = ctx.db.all<{ opportunity_id: string; pipeline_state: string; state_reason: string | null; updated_at: string }>(
    `SELECT opportunity_id, pipeline_state, state_reason, updated_at FROM opportunities WHERE pipeline_state IN ('MANUAL_REVIEW','TAX_REVIEW','DISPUTE','REFUND_PENDING','NO_CAPACITY') ORDER BY updated_at DESC LIMIT 20`,
  );
  const dead = ctx.db.all<{ job_id: string; kind: string; last_error: string | null }>(`SELECT job_id, kind, last_error FROM jobs WHERE state IN ('DEAD_LETTER','HUMAN_REVIEW') LIMIT 20`);
  const recon = ctx.db.get<{ status: string; created_at: string; details_json: string }>('SELECT status, created_at, details_json FROM reconciliation_runs ORDER BY created_at DESC LIMIT 1');
  const orders = ctx.db.all<{ order_id: string; amount_minor: number; currency: string; payment_state: string; fulfillment_state: string; pipeline_state: string; test_mode: number }>(
    `SELECT o.order_id, o.amount_minor, o.currency, o.payment_state, o.fulfillment_state, op.pipeline_state, o.test_mode FROM orders o
     JOIN opportunities op ON op.opportunity_id = o.opportunity_id ORDER BY o.created_at DESC LIMIT 15`,
  );
  const audit = ctx.audit.list(25);

  const ownerActions = [
    ...reviews.map((r) => `<li>Opportunity <span class="mono">${e(r.opportunity_id)}</span>: <span class="tag">${e(r.pipeline_state)}</span> ${e(r.state_reason ?? '')}</li>`),
    ...dead.map((d) => `<li>Job <span class="mono">${e(d.job_id)}</span> (${e(d.kind)}) benötigt Prüfung: ${e(d.last_error ?? '')}</li>`),
    ...(recon && recon.status === 'REVIEW' ? [`<li>Letzte Reconciliation verlangt Prüfung (${e(recon.created_at)})</li>`] : []),  ];

  const body = `
<div class="row" style="justify-content:space-between"><h1>INFINITY EARN · Eigentümer-Dashboard</h1>
<form method="post" action="/auth/logout"><input type="hidden" name="_csrf" value="${e(csrf)}"><button class="secondary">Abmelden</button></form></div>
${flash ? `<div class="card">${e(flash)}</div>` : ''}
<div class="card"><strong>Betriebsmodus:</strong> <span class="tag">TEST</span> · Live-Verkäufe: <span class="tag bad">GESPERRT</span>
 · Offene Live-Freigaben: <strong>${readiness.total - readiness.done}</strong> von ${readiness.total} (Abschnitt „M3 – Live-Freigaben“)</div>

<h2>Echte Daten (LIVE)</h2>
<p class="muted">Ausschließlich provider-bestätigte Live-Buchungen. Solange keine echte Zahlung existiert, sind alle Werte 0.</p>
${kpiGrid(live)}

<h2>Testdaten (TEST – kein echtes Geld)</h2>
${kpiGrid(test)}

<h2>Eigentümeraktion erforderlich</h2>
<div class="card">${ownerActions.length ? `<ul>${ownerActions.join('')}</ul>` : '<span class="muted">Keine Ausnahmen offen.</span>'}</div>

<h2>Notstopps</h2>
<div class="card row">${STOP_NAMES.map((s) => {
    const on = stops.has(s);
    return `<form method="post" action="/admin/stops"><input type="hidden" name="_csrf" value="${e(csrf)}"><input type="hidden" name="stop" value="${s}"><input type="hidden" name="active" value="${on ? '0' : '1'}">
<button class="${on ? '' : 'secondary'}">${on ? 'AKTIV: ' : ''}${s}${on ? ' lösen' : ' aktivieren'}</button></form>`;
  }).join('')}</div>

<h2>Betrieb</h2>
<div class="card row">
<form method="post" action="/admin/tick"><input type="hidden" name="_csrf" value="${e(csrf)}"><button>Autopilot-Takt jetzt ausführen</button></form>
<a href="/api/reports/summary">KPIs (JSON)</a> · <a href="/api/reports/monthly?month=${ctx.clock().toISOString().slice(0, 7)}">Monatsexport (JSON)</a> · <a href="/api/audit">Audit (JSON)</a>
</div>
${renderReadiness(ctx, csrf)}

${renderRefunds(ctx, csrf)}

${renderAcquisition(ctx, csrf)}

<h2>Letzte Aufträge</h2>
<div class="card table-wrap"><table><tr><th>Auftrag</th><th>Betrag</th><th>Zahlung</th><th>Fulfillment</th><th>Pipeline</th><th>Modus</th></tr>
${orders.map((o) => `<tr><td class="mono">${e(o.order_id)}</td><td>${e(formatMinor(o.amount_minor, o.currency))} ${e(o.currency)}</td><td>${e(o.payment_state)}</td><td>${e(o.fulfillment_state)}</td><td>${e(o.pipeline_state)}</td><td>${o.test_mode ? '<span class="tag">TEST</span>' : '<span class="tag ok">LIVE</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Keine Aufträge.</td></tr>'}
</table></div>

<h2>Policy (wirksam)</h2>
<div class="card table-wrap"><table>${policy ? Object.entries({
    MAX_NEW_MONTHLY_FIXED_COST_EUR: policy.maxNewMonthlyFixedCostEur,
    ALLOW_PAID_APIS: policy.allowPaidApis,
    LIVE_SALES_ENABLED: policy.liveSalesEnabled,
    AUTO_MARKETING_OUTREACH: policy.autoMarketingOutreach,
    ALLOW_UNREVIEWED_DEPLOY: policy.allowUnreviewedDeploy,
    ALLOW_NEW_FINANCIAL_COMMITMENTS: policy.allowNewFinancialCommitments,
    'Angebotsspanne': `${policy.quote.minMinor}–${policy.quote.maxMinor} ${policy.quote.currency} (Minor), Mindestmarge ${policy.quote.minMarginBps / 100}%`,
    'Freigegebene Produktklassen': policy.allowedCapabilities.join(', '),
  }).map(([k, v]) => `<tr><th>${e(k)}</th><td class="mono">${e(String(v))}</td></tr>`).join('') : '<tr><td class="err">KEINE POLICY – alle Aktionen blockiert</td></tr>'}</table></div>

<h2>Capability-Matrix</h2>
<div class="card table-wrap"><table><tr><th>Produktklasse</th><th>Status</th><th>Grund</th></tr>
${listCapabilities().map((c) => `<tr><td class="mono">${e(c.id)}</td><td>${c.enabled ? '<span class="tag ok">aktiv</span>' : '<span class="tag bad">deaktiviert</span>'}</td><td>${e(c.disabled_reason ?? '')}</td></tr>`).join('')}
</table></div>

<h2>Audit-Trail (neueste 25)</h2>
<div class="card table-wrap"><table><tr><th>Zeit</th><th>Ereignis</th><th>Akteur</th><th>Bezug</th></tr>
${audit.map((a) => `<tr><td class="mono">${e(a.created_at)}</td><td>${e(a.event_type)}</td><td>${e(a.actor)}</td><td class="mono">${e(a.subject_id ?? '')}</td></tr>`).join('')}
</table></div>`;
  return page('INFINITY EARN – Dashboard', body, { testMode: ctx.config.testMode });
}

function renderRefunds(ctx: AppContext, csrf: string): string {
  const hidden = `<input type="hidden" name="_csrf" value="${e(csrf)}">`;
  const reqs = ctx.db.all<{ refund_request_id: string; order_id: string; amount_minor: number; currency: string; origin: string; reason: string; status: string; provider_refund_id: string | null; created_at: string }>(
    'SELECT refund_request_id, order_id, amount_minor, currency, origin, reason, status, provider_refund_id, created_at FROM refund_requests ORDER BY created_at DESC LIMIT 15',
  );
  const paid = ctx.db.all<{ order_id: string; amount_minor: number; currency: string }>(
    `SELECT o.order_id, o.amount_minor, o.currency FROM orders o WHERE o.payment_state = 'CONFIRMED'
     AND NOT EXISTS (SELECT 1 FROM refund_requests r WHERE r.order_id = o.order_id AND r.status IN ('PENDING_OWNER','REQUESTED')) ORDER BY o.created_at DESC LIMIT 10`,
  );
  return `
<h2>Zahlungen &amp; Rückerstattungen</h2>
<div class="card"><strong>Zahlungsanbieter:</strong> ${ctx.config.payment.provider === 'stripe' ? '<span class="tag">Stripe TESTMODUS</span>' : '<span class="tag">Mock (Test)</span>'}
 <span class="muted">· Zahlungsstatus, Erstattungen und Gebühren werden nur nach signiertem Provider-Webhook gebucht.</span></div>
<div class="card table-wrap"><table><tr><th>Antrag</th><th>Auftrag</th><th>Betrag</th><th>Herkunft / Grund</th><th>Status</th><th>Aktion</th></tr>
${reqs.map((r) => `<tr><td class="mono">${e(r.refund_request_id)}<div class="muted">${e(r.created_at)}</div></td><td class="mono">${e(r.order_id)}</td>
<td>${e(formatMinor(r.amount_minor, r.currency))} ${e(r.currency)}</td><td>${e(r.origin)}<div class="muted">${e(r.reason.slice(0, 160))}</div></td>
<td>${e(r.status)}${r.provider_refund_id ? `<div class="mono muted">${e(r.provider_refund_id)}</div>` : ''}</td>
<td>${r.status === 'PENDING_OWNER' ? `<div class="row"><form method="post" action="/admin/refunds/${e(r.refund_request_id)}/approve">${hidden}<button>Erstatten</button></form>
<form method="post" action="/admin/refunds/${e(r.refund_request_id)}/reject">${hidden}<input type="hidden" name="note" value="abgelehnt durch Eigentümer"><button class="secondary">Ablehnen</button></form></div>` : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Keine Erstattungsanträge.</td></tr>'}
</table>
${paid.length ? `<div class="row" style="margin-top:8px">${paid.map((o) => `<form method="post" action="/admin/orders/${e(o.order_id)}/refund">${hidden}<button class="secondary">Erstattung anlegen: ${e(o.order_id.slice(0, 16))}… (${e(formatMinor(o.amount_minor, o.currency))} ${e(o.currency)})</button></form>`).join('')}</div>` : ''}
</div>`;
}

function renderAcquisition(ctx: AppContext, csrf: string): string {
  const hidden = `<input type="hidden" name="_csrf" value="${e(csrf)}">`;
  const sources = listSources(ctx);
  const lastRun = ctx.db.get<{ mode: string; status: string; items_seen: number; items_relevant: number; leads_created: number; error: string | null; finished_at: string }>(
    'SELECT mode, status, items_seen, items_relevant, leads_created, error, finished_at FROM source_fetch_runs ORDER BY finished_at DESC LIMIT 1',
  );
  const realLeads = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM leads WHERE source_id <> 'src_inbound_form'`)?.n ?? 0;
  const ranking = rankOpportunities(ctx, 15);
  const drafts = ctx.db.all<{ draft_id: string; opportunity_id: string; status: string; price_minor: number | null; currency: string | null; created_at: string }>(
    'SELECT draft_id, opportunity_id, status, price_minor, currency, created_at FROM offer_drafts ORDER BY created_at DESC LIMIT 10',
  );
  const tag = (s: string): string => `<span class="tag ${s === 'APPROVED' ? 'ok' : s === 'BLOCKED' || s === 'PAUSED_TOS_CHANGED' ? 'bad' : ''}">${e(s)}</span>`;
  return `
<h2>Akquise – Quellen</h2>
<div class="card table-wrap"><table><tr><th>Quelle</th><th>Status</th><th>Lizenz / Bedingungen</th><th>Aktion</th></tr>
${sources.map((s) => `<tr><td>${e(s.name)}<div class="mono muted">${e(s.source_id)}</div></td><td>${tag(s.status)}${s.approved_by ? `<div class="muted">frei: ${e(s.approved_by)}, ToS: ${e(s.terms_hash ?? '')}</div>` : ''}</td>
<td>${e(s.source_license)}${s.terms_url ? ` <a href="${e(s.terms_url)}" rel="noreferrer">Bedingungen</a>` : ''}</td>
<td>${s.source_id === 'src_inbound_form' ? '–' : s.status === 'APPROVED'
    ? `<form method="post" action="/admin/sources/${e(s.source_id)}/pause">${hidden}<button class="secondary">Pausieren</button></form>`
    : `<form method="post" action="/admin/sources/${e(s.source_id)}/approve">${hidden}<label for="tl-${e(s.source_id)}">Geprüfte Fassung der Bedingungen</label><input id="tl-${e(s.source_id)}" type="text" name="terms_label" value="TED legal notice geprüft ${ctx.clock().toISOString().slice(0, 10)}" required><p><button>Quelle freigeben</button></p></form>`}</td></tr>`).join('')}
</table>
<div class="row" style="margin-top:8px">
<form method="post" action="/admin/acquire">${hidden}<input type="hidden" name="mode" value="persist"><button>TED jetzt abrufen</button></form>
<form method="post" action="/admin/acquire">${hidden}<input type="hidden" name="mode" value="preview"><button class="secondary">Vorschau (nichts speichern)</button></form>
<span class="muted">Letzter Lauf: ${lastRun ? `${e(lastRun.finished_at)} · ${e(lastRun.mode)} · ${e(lastRun.status)} · ${lastRun.items_seen} gesehen, ${lastRun.items_relevant} relevant, ${lastRun.leads_created} Leads${lastRun.error ? ` · ${e(lastRun.error)}` : ''}` : 'noch keiner'}</span>
</div></div>
<div class="card"><strong>Echte Leads aus externen Quellen: ${realLeads}</strong> <span class="muted">(ehrlicher Zählerstand – nur strukturiert belegte, offene Ausschreibungen mit passender Produktklasse)</span></div>

<h2>Opportunity-Ranking</h2>
<div class="card table-wrap"><table><tr><th>Punkte</th><th>Art</th><th>Titel</th><th>Frist</th><th>Begründung</th><th>Aktion</th></tr>
${ranking.map((r) => `<tr><td><strong>${r.total}</strong>${r.relevant ? ' <span class="tag ok">relevant</span>' : ''}<div class="muted">Fit ${r.fit} · Nachweis ${r.evidence} · Risiko ${r.risk}</div></td>
<td>${r.kind === 'tender' ? 'Ausschreibung' : 'Inbound'}</td><td>${r.url ? `<a href="${e(r.url)}" rel="noreferrer">${e(r.title)}</a>` : e(r.title)}<div class="muted">${e(r.buyer ?? '')}</div></td>
<td>${e(r.deadline?.slice(0, 10) ?? '–')}</td><td class="muted">${e(r.reasons.join(' · '))}</td>
<td>${r.opportunityId ? `<form method="post" action="/admin/opportunities/${e(r.opportunityId)}/draft">${hidden}<button class="secondary">Angebotsentwurf</button></form>` : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Noch keine Opportunities.</td></tr>'}
</table></div>

<h2>Angebotsentwürfe (werden nie automatisch versendet)</h2>
<div class="card table-wrap"><table><tr><th>Entwurf</th><th>Status</th><th>Preis</th><th>Aktion</th></tr>
${drafts.map((d) => `<tr><td><a href="/admin/drafts/${e(d.draft_id)}">${e(d.draft_id)}</a><div class="muted">${e(d.created_at)}</div></td><td>${e(d.status)}</td>
<td>${d.price_minor !== null && d.currency ? `${e(formatMinor(d.price_minor, d.currency))} ${e(d.currency)}` : 'offen'}</td>
<td>${d.status === 'DRAFT_FOR_REVIEW' ? `<div class="row"><form method="post" action="/admin/drafts/${e(d.draft_id)}/review">${hidden}<input type="hidden" name="decision" value="approve"><button>Zur manuellen Einreichung freigeben</button></form>
<form method="post" action="/admin/drafts/${e(d.draft_id)}/review">${hidden}<input type="hidden" name="decision" value="reject"><button class="secondary">Verwerfen</button></form></div>` : '–'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Keine Entwürfe.</td></tr>'}
</table></div>`;
}

export function renderLogin(error?: string): string {
  return page(
    'INFINITY EARN – Anmeldung',
    `<h1>Eigentümer-Anmeldung</h1><div class="card" style="max-width:420px">
${error ? `<p class="err">${e(error)}</p>` : ''}
<form method="post" action="/auth/login"><label for="pw">Passwort</label><input id="pw" type="password" name="password" autocomplete="current-password" required>
<p><button>Anmelden</button></p></form></div>`,
  );
}
