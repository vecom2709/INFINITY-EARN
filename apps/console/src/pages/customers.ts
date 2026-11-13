import { rankOpportunities } from '../../../../services/acquisition/src/ranking.ts';
import { listSources } from '../../../../services/acquisition/src/sources.ts';
import { feedbackSummary } from '../../../../services/core-api/src/aftercare.ts';
import { buyerSignals, dataFreshness, followUpCandidates } from '../../../../services/finance/src/insights.ts';
import { effectivePolicy } from '../../../../services/core-api/src/policy-store.ts';
import { deliveryChannel, outboxSummary } from '../../../../services/core-api/src/outbox.ts';
import { channelStatus } from '../../../../services/core-api/src/channels.ts';
import { pipelineLabel } from '../labels.ts';
import { fmtDate, money } from '../model.ts';
import { action, e, explain, modeSwitch, panel, shell, table, tag, withMode } from '../ui.ts';
import type { PageCtx } from './types.ts';

const SOURCE_STATUS: Record<string, { text: string; tone: 'ok' | 'pending' | 'bad' | 'neutral' }> = {
  APPROVED: { text: 'Freigegeben', tone: 'ok' },
  PENDING_REVIEW: { text: 'Wartet auf deine Freigabe', tone: 'pending' },
  PAUSED_TOS_CHANGED: { text: 'Pausiert – Bedingungen geändert', tone: 'bad' },
  BLOCKED: { text: 'Gesperrt', tone: 'bad' },
};

const TICKET_KIND: Record<string, string> = { question: 'Frage', complaint: 'Reklamation', withdrawal: 'Widerruf', security: 'Sicherheit' };

/** 120/034 echte Rückmeldungen und Abnahmen – nichts erfunden, nichts automatisch veröffentlicht. */
function renderFeedbackPanel(pc: PageCtx): string {
  const s = feedbackSummary(pc.ctx, pc.mode === 'test');
  const rows = pc.ctx.db.all<{ rating: number; outcome: string; comment: string | null; consent_publish: number; created_at: string }>(
    'SELECT rating, outcome, comment, consent_publish, created_at FROM customer_feedback WHERE test_mode = ? ORDER BY created_at DESC LIMIT 10', pc.mode === 'test' ? 1 : 0,
  );
  const outcome: Record<string, string> = { IN_USE: 'Im Einsatz', NOT_YET: 'Noch nicht genutzt', NOT_USEFUL: 'Hilft nicht' };
  const head = s.count === 0 && s.accepted + s.defects === 0
    ? '<p class="muted" style="margin:4px 0 0">Noch keine Rückmeldungen. Kunden können nach der Lieferung im Portal abnehmen, einen Mangel melden und freiwillig bewerten.</p>'
    : `<p style="margin:4px 0 10px"><strong>${s.average === null ? '–' : String(s.average).replace('.', ',')}</strong> von 5 Sternen aus ${s.count} Bewertung${s.count === 1 ? '' : 'en'} · ${s.accepted} abgenommen · ${s.defects} Mangel gemeldet · ${s.inUse} im Einsatz</p>`;
  return panel({ id: 'rueckmeldungen', title: 'Rückmeldungen deiner Kunden', sub: 'Nur echte Angaben der Kunden – keine erfundenen Bewertungen', flush: true, body: `<div style="padding:0 24px">${head}</div>${rows.length ? table(
    [{ label: 'Datum' }, { label: 'Bewertung' }, { label: 'Nutzen' }, { label: 'Kommentar', full: true }],
    rows.map((r) => [e(fmtDate(r.created_at)), `${r.rating} / 5`, e(outcome[r.outcome] ?? r.outcome), `${e(r.comment ?? '–')}${r.consent_publish ? '<span class="sub">Darf ohne Namen gezeigt werden</span>' : '<span class="sub">Nur intern</span>'}`]),
    'Keine Bewertungen', 'Rückmeldungen') : ''}<p class="muted" style="font-size:13px;margin:8px 24px 16px">Kundenstimmen werden derzeit nirgends veröffentlicht. Eine Veröffentlichung wäre nur mit Einwilligung des Kunden zulässig.</p>` });
}

/** 051 Käufersignale und 058 mögliche Folgeangebote – nur Hinweise, es wird nichts versendet. */
function renderBuyerPanel(pc: PageCtx): string {
  const test = pc.mode === 'test';
  const s = buyerSignals(pc.ctx, test);
  const f = followUpCandidates(pc.ctx, test, effectivePolicy(pc.ctx)?.allowedCapabilities ?? []);
  const names: Record<string, string> = { 'b2b-calc-csv': 'Tabelle', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Paket' };
  return `<div class="grid2 even">
${panel({ title: 'Wer wirklich kauft', sub: 'Aus eigenen Vorgängen – keine Bewertung von Personen', body: kvTable([['Bezahlt', String(s.bezahlt)], ['Angenommen, noch nicht bezahlt', String(s.angenommen)], ['Angebot offen', String(s.angebot_offen)], ['Nur angefragt', String(s.nur_anfrage)]]) })}
${panel({ title: 'Mögliche Folgeangebote', sub: 'Zufriedene Kunden mit passender Ergänzung – es wird nichts automatisch verschickt', body: f.length
    ? `<ul class="feed">${f.map((x) => `<li><div><h3>${e(x.customerRef)}</h3><p>${e(Object.entries(names).reduce((t, [k, v]) => t.split(k).join(v), x.reason))}</p></div><span class="when">${x.contactAllowed ? tag('Kontakt erlaubt', 'ok') : tag('Keine Einwilligung', 'neutral')}</span></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:4px 0 0">Noch keine Kandidaten (Voraussetzung: abgenommen und mit mindestens 4 Sternen bewertet).</p>' })}
</div>`;
}

const TEMPLATE: Record<string, string> = { quote_ready: 'Angebot bereit', payment_confirmed: 'Zahlung bestätigt', delivery_ready: 'Datei bereit', not_deliverable: 'Nicht lieferfähig', followup_offer: 'Folgeangebot (Werbung)' };
const OUT_STATUS: Record<string, { text: string; tone: 'ok' | 'pending' | 'bad' | 'neutral' }> = {
  HELD: { text: 'Fertig – nicht gesendet', tone: 'pending' },
  SENT: { text: 'Gesendet', tone: 'ok' },
  BLOCKED: { text: 'Gesperrt – keine Grundlage', tone: 'bad' },
  SUPPRESSED: { text: 'Abgemeldet', tone: 'neutral' },
};

/** 004/097 automatischer Postausgang: fertig formuliert, aber ohne freigegebenen Versandkanal wird nichts gesendet. */
function renderOutboxPanel(pc: PageCtx): string {
  const test = pc.mode === 'test';
  const s = outboxSummary(pc.ctx, test);
  const ch = deliveryChannel(pc.ctx);
  const rows = pc.ctx.db.all<{ template: string; kind: string; recipient_masked: string; subject: string; status: string; reason: string | null; created_at: string }>(
    'SELECT template, kind, recipient_masked, subject, status, reason, created_at FROM outbox_messages WHERE test_mode = ? ORDER BY created_at DESC LIMIT 15', test ? 1 : 0,
  );
  return panel({ id: 'postausgang', title: 'Postausgang', sub: 'Kundennachrichten werden automatisch erstellt – Werbung nur mit Einwilligung', flush: true, body: `<div style="padding:0 24px"><p style="margin:4px 0 6px"><strong>${s.held}</strong> bereit · <strong>${s.sent}</strong> gesendet · <strong>${s.blocked}</strong> gesperrt · <strong>${s.suppressed}</strong> abgemeldet</p>
<p class="muted" style="margin:0 0 10px">${ch.ready ? 'Versandkanal aktiv.' : `Es wird nichts gesendet: ${e(ch.reasons.join(' '))}`}</p></div>${table(
    [{ label: 'Erstellt' }, { label: 'Nachricht' }, { label: 'An' }, { label: 'Status', full: true }],
    rows.map((r) => {
      const st = OUT_STATUS[r.status] ?? { text: r.status, tone: 'neutral' as const };
      return [e(fmtDate(r.created_at, true)), `<strong>${e(TEMPLATE[r.template] ?? r.template)}</strong><span class="sub">${e(r.subject)}</span>`, e(r.recipient_masked), `${tag(st.text, st.tone)}${r.status === 'BLOCKED' && r.reason ? `<span class="sub">${e(r.reason)}</span>` : ''}`];
    }), 'Noch keine Nachrichten', 'Postausgang')}${explain('Nachrichten zum eigenen Auftrag sind ohne Werbeeinwilligung erlaubt. Werbung geht nur an Kunden mit Einwilligung, enthält einen Abmeldelink und höchstens eine Nachricht in 90 Tagen. Ausschreibungs-Kontakte werden nie angeschrieben.')}` });
}

function kvTable(rows: [string, string][]): string {
  return `<dl class="kv">${rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>`;
}

function renderFreshnessPanel(pc: PageCtx): string {
  const f = dataFreshness(pc.ctx);
  const rows = f.sources.map((s) => [`<strong>${e(s.source)}</strong>`, s.lastRun ? `${e(fmtDate(s.lastRun, true))}<span class="sub">vor ${s.lastRunAgeDays} Tag(en)</span>` : '<span class="muted">nie</span>', s.termsAgeDays === null ? '–' : `vor ${s.termsAgeDays} Tag(en)`, s.warnings.length ? s.warnings.map((w) => tag(w, 'pending')).join(' ') : tag('Aktuell', 'ok')]);
  return panel({ id: 'aktualitaet', title: 'Aktualität der Daten', sub: 'Abgelaufene oder ungeprüfte Daten werden nicht als aktuell verwendet', flush: true, body: `${table([{ label: 'Quelle' }, { label: 'Letzter Abruf' }, { label: 'Bedingungen geprüft' }, { label: 'Hinweise', full: true }], rows, 'Keine externen Quellen', 'Aktualität der Quellen')}
<p class="muted" style="font-size:13px;margin:8px 24px 16px">${f.expiredOpen ? `${f.expiredOpen} abgelaufene Ausschreibung(en) sind noch offen – bitte nicht mehr anbieten.` : 'Keine abgelaufenen Ausschreibungen in Bearbeitung.'}</p>` });
}

export function renderCustomers(pc: PageCtx): string {
  const t = pc.mode === 'test' ? 1 : 0;
  const back = withMode('/dashboard/kunden', pc.mode);
  const inquiries = pc.ctx.db.all<{ lead_id: string; name: string | null; company: string | null; country: string | null; created_at: string; pipeline_state: string | null; legal: string; source: string }>(
    `SELECT l.lead_id, l.name, l.company, l.country, l.created_at, op.pipeline_state, l.contact_legal_basis AS legal, s.name AS source
     FROM leads l JOIN sources s ON s.source_id = l.source_id LEFT JOIN opportunities op ON op.lead_id = l.lead_id
     WHERE l.test_mode = ? AND l.erased_at IS NULL ORDER BY l.created_at DESC LIMIT 30`, t,
  );
  const buyers = pc.ctx.db.all<{ customer_id: string; name: string | null; country: string | null; buyer_type: string | null; orders: number; paid: number; currency: string | null; last: string | null }>(
    `SELECT c.customer_id, c.name, c.country, c.buyer_type, COUNT(o.order_id) AS orders,
            COALESCE(SUM(CASE WHEN o.payment_state = 'CONFIRMED' THEN o.amount_minor END), 0) AS paid, MAX(o.currency) AS currency, MAX(o.created_at) AS last
     FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE c.test_mode = ? AND c.erased_at IS NULL GROUP BY c.customer_id ORDER BY last DESC LIMIT 50`, t,
  );
  const tickets = pc.ctx.db.all<{ ticket_id: string; kind: string; message: string; status: string; created_at: string; order_id: string | null }>(
    'SELECT ticket_id, kind, message, status, created_at, order_id FROM support_tickets WHERE test_mode = ? ORDER BY created_at DESC LIMIT 30', t,
  );
  const consents = pc.ctx.db.get<{ granted: number; withdrawn: number }>(
    `SELECT COALESCE(SUM(CASE WHEN withdrawn_at IS NULL THEN 1 END), 0) AS granted, COALESCE(SUM(CASE WHEN withdrawn_at IS NOT NULL THEN 1 END), 0) AS withdrawn FROM consents WHERE purpose = 'marketing_email' AND test_mode = ?`, t,
  ) ?? { granted: 0, withdrawn: 0 };
  const sources = listSources(pc.ctx);
  const ranking = rankOpportunities(pc.ctx, 8).filter((r) => r.kind === 'tender');
  const drafts = pc.ctx.db.all<{ draft_id: string; status: string; price_minor: number | null; currency: string | null; created_at: string }>('SELECT draft_id, status, price_minor, currency, created_at FROM offer_drafts WHERE test_mode = ? ORDER BY created_at DESC LIMIT 10', t);

  const body = `
${panel({ title: 'Neue Kundenanfragen', sub: 'Nur freiwillig gestellte Anfragen und erlaubte öffentliche Ausschreibungen', flush: true, body: table(
    [{ label: 'Anfrage' }, { label: 'Herkunft' }, { label: 'Stand' }, { label: 'Kontakterlaubnis' }],
    inquiries.map((l) => {
      const st = l.pipeline_state ? pipelineLabel(l.pipeline_state) : { text: 'Eingegangen', tone: 'neutral' as const };
      return [`<strong>${e(l.company || l.name || 'Ohne Namen')}</strong><span class="sub">${e(l.country ?? '')} · ${e(fmtDate(l.created_at))}</span>`, e(l.source), tag(st.text, st.tone), l.legal === 'none' ? tag('Keine – kein Kontakt', 'bad') : tag(l.legal === 'consent' ? 'Einwilligung' : 'Selbst angefragt', 'ok')];
    }), 'Noch keine Anfragen', 'Kundenanfragen') })}
<div class="grid2">
${panel({ title: 'Aktive Käufer', sub: 'Kunden mit mindestens einem angenommenen Angebot', flush: true, body: table(
    [{ label: 'Kunde' }, { label: 'Art' }, { label: 'Aufträge' }, { label: 'Bezahlt', amount: true }],
    buyers.map((b) => [`<strong>${e(b.name ?? '—')}</strong><span class="sub">${e(b.country ?? '')}${b.last ? ` · zuletzt ${e(fmtDate(b.last))}` : ''}</span>`, e(b.buyer_type === 'B2C' ? 'Verbraucher' : b.buyer_type === 'B2B' ? 'Unternehmen' : '—'), String(b.orders), e(money(b.paid, b.currency ?? 'EUR'))]),
    'Noch keine Käufer', 'Aktive Käufer') })}
${panel({ title: 'Kontaktberechtigung', sub: 'Werbung nur mit Einwilligung', body: `<p style="margin:4px 0 6px"><strong>${consents.granted}</strong> aktive Einwilligung${consents.granted === 1 ? '' : 'en'} für E-Mail-Neuigkeiten · <strong>${consents.withdrawn}</strong> widerrufen</p>
<p class="muted" style="margin:0">${effectivePolicy(pc.ctx)?.autoMarketingOutreach ? 'Automatische Folgeangebote an Kunden mit Einwilligung sind eingeschaltet.' : 'Automatische Folgeangebote sind ausgeschaltet (AUTO_MARKETING_OUTREACH). Kunden erhalten nur Nachrichten zu ihrem eigenen Auftrag.'}</p>${explain('Eine Einwilligung gilt nur für den angegebenen Zweck und kann jederzeit widerrufen werden. Öffentliche Firmendaten allein erlauben keine Werbung.')}` })}
</div>
${panel({ id: 'kanaele', title: 'Kommunikationskanäle', sub: 'Verbunden ist nur, was wirklich angebunden ist', flush: true, body: table(
    [{ label: 'Kanal' }, { label: 'Richtung' }, { label: 'Status' }, { label: 'Was fehlt', full: true }],
    channelStatus(pc.ctx).map((c) => [`<strong>${e(c.name)}</strong><span class="sub">${e(c.detail)}</span>`, e(c.direction), c.state === 'CONNECTED' ? tag('Verbunden', 'ok') : c.state === 'READ_ONLY' ? tag('Nur lesend', 'ok') : tag('Nicht verbunden', 'neutral'), c.needs ? e(c.needs) : '<span class="muted">—</span>']),
    'Keine Kanäle', 'Kommunikationskanäle') })}
${renderOutboxPanel(pc)}
${renderFeedbackPanel(pc)}
${renderBuyerPanel(pc)}
${panel({ id: 'nachrichten', title: 'Nachrichtenverlauf', sub: 'Fragen, Reklamationen und Widerrufe aus dem Kundenportal', flush: true, body: table(
    [{ label: 'Eingang' }, { label: 'Art' }, { label: 'Nachricht', full: true }, { label: 'Status' }],
    tickets.map((tk) => [e(fmtDate(tk.created_at, true)), e(TICKET_KIND[tk.kind] ?? tk.kind), e(tk.message.slice(0, 220)), tk.status === 'OPEN' ? tag('Offen', 'pending') : tag('Erledigt', 'ok')]),
    'Keine Kundennachrichten', 'Kundennachrichten') })}
${renderFreshnessPanel(pc)}
${panel({ id: 'quellen', title: 'Woher Anfragen kommen dürfen', sub: 'Jede Quelle braucht deine Freigabe nach Prüfung ihrer Nutzungsbedingungen', flush: true, body: table(
    [{ label: 'Quelle' }, { label: 'Status' }, { label: 'Aktion', full: true }],
    sources.map((s) => {
      const st = SOURCE_STATUS[s.status] ?? { text: s.status, tone: 'neutral' as const };
      const act = s.source_id === 'src_inbound_form' ? '<span class="muted">Immer aktiv – eigenes Formular</span>'
        : s.status === 'APPROVED'
          ? action({ href: `/admin/sources/${s.source_id}/pause`, csrf: pc.csrf, label: 'Pausieren', variant: 'ghost', back, what: 'Es werden keine neuen Ausschreibungen mehr abgerufen. Keine Kosten.' })
          : `<form class="action" method="post" action="/admin/sources/${e(s.source_id)}/approve"><input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(back)}">
<label for="tl-${e(s.source_id)}">Geprüfte Fassung der Bedingungen</label><input id="tl-${e(s.source_id)}" type="text" name="terms_label" required value="Bedingungen geprüft am ${e(pc.ctx.clock().toISOString().slice(0, 10))}">
<button class="btn" type="submit">Quelle freigeben</button><span class="what">Erlaubt den täglichen automatischen Abruf öffentlicher Daten. Kostenlos; es wird niemand angeschrieben.</span></form>`;
      return [`<strong>${e(s.name)}</strong>${s.terms_url ? `<span class="sub"><a href="${e(s.terms_url)}" rel="noreferrer">Nutzungsbedingungen</a></span>` : ''}`, tag(st.text, st.tone), act];
    }), 'Keine Quellen', 'Quellen') })}
<div class="grid2">
${panel({ title: 'Passende Ausschreibungen', sub: 'Automatisch bewertet nach Passung, Nachweis und Risiko', flush: true, body: table(
    [{ label: 'Ausschreibung' }, { label: 'Frist' }, { label: 'Bewertung' }],
    ranking.map((r) => [`${r.url ? `<a href="${e(r.url)}" rel="noreferrer"><strong>${e(r.title)}</strong></a>` : `<strong>${e(r.title)}</strong>`}<span class="sub">${e(r.buyer ?? '')}</span>`, e(r.deadline ? fmtDate(r.deadline) : '—'), `${tag(`${r.total} Punkte`, r.relevant ? 'ok' : 'neutral')}${r.opportunityId ? action({ href: `/admin/opportunities/${r.opportunityId}/draft`, csrf: pc.csrf, label: 'Angebotsentwurf erstellen', variant: 'ghost', back, what: 'Erstellt nur einen Entwurf zur Prüfung. Nichts wird versendet.' }) : ''}`]),
    'Noch keine passenden Ausschreibungen', 'Ausschreibungen') })}
${panel({ title: 'Angebotsentwürfe', sub: 'Werden nie automatisch versendet', flush: true, body: table(
    [{ label: 'Entwurf' }, { label: 'Preis', amount: true }, { label: 'Entscheidung', full: true }],
    drafts.map((d) => [`<a href="/admin/drafts/${e(d.draft_id)}">${e(fmtDate(d.created_at))}</a>`, d.price_minor !== null && d.currency ? e(money(d.price_minor, d.currency)) : 'offen',
      d.status === 'DRAFT_FOR_REVIEW'
        ? `<div class="actions">${action({ href: `/admin/drafts/${d.draft_id}/review`, csrf: pc.csrf, label: 'Zur Einreichung freigeben', hidden: { decision: 'approve' }, back, what: 'Du reichst selbst manuell ein. Keine automatische Nachricht.' })}${action({ href: `/admin/drafts/${d.draft_id}/review`, csrf: pc.csrf, label: 'Verwerfen', variant: 'ghost', hidden: { decision: 'reject' }, back, what: 'Der Entwurf wird archiviert.' })}</div>`
        : tag(d.status === 'REJECTED' ? 'Verworfen' : 'Freigegeben zur manuellen Einreichung', d.status === 'REJECTED' ? 'neutral' : 'ok')]),
    'Keine Entwürfe', 'Angebotsentwürfe') })}
</div>`;
  return shell({ title: 'Kunden', eyebrow: 'Kunden', heading: 'Deine Kunden', lead: 'Anfragen, Käufer und Gespräche – übersichtlich an einem Ort. Kontakt nur mit erlaubter Grundlage.', active: 'kunden', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch('/dashboard/kunden', pc.mode), body, systemTestMode: pc.ctx.config.testMode });
}
