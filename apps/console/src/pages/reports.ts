import { REGISTRY } from '../../../../packages/registry/src/registry.ts';
import { AREA_LABEL, modulesWithStatus, STATUS_LABEL, statusCounts, type ImplStatus } from '../../../../packages/registry/src/status.ts';
import { effectivePolicy } from '../../../../services/core-api/src/policy-store.ts';
import { readinessSummary } from '../../../../services/core-api/src/readiness.ts';
import { buyerJourney, cashForecast, customerConcentration, priceAcceptance, productConcentration, productPortfolio, refundReserve, revenueAttribution, salesDiagnosis } from '../../../../services/finance/src/insights.ts';
import { financeView, money } from '../model.ts';
import { e, explain, kv, metric, modeSwitch, panel, shell, table, tag, withMode, type Tone } from '../ui.ts';
import type { PageCtx } from './types.ts';

const STATUS_TONE: Record<ImplStatus, Tone> = { UMGESETZT: 'ok', TEILWEISE: 'pending', GEPLANT: 'neutral', GESPERRT: 'bad' };

export function statusTag(s: ImplStatus): string {
  return tag(STATUS_LABEL[s], STATUS_TONE[s]);
}

const fmtDay = (iso: string): string => iso.split('-').reverse().join('.');

/** Auswertungen 088/098/099 – nur aus echten Daten, ohne erfundene Prognosen. */
function renderInsights(pc: PageCtx): string {
  const test = pc.mode === 'test';
  const rs = readinessSummary(pc.ctx);
  const d = salesDiagnosis(pc.ctx, test, rs.total - rs.done);
  const cf = cashForecast(pc.ctx, test);
  const cc = customerConcentration(pc.ctx, test);
  const rr = refundReserve(pc.ctx, test);
  const pa = priceAcceptance(pc.ctx, test);
  const pf = productPortfolio(pc.ctx, test);
  const max = Math.max(1, ...d.funnel.map((f) => f.count));
  const funnel = `<ul class="feed">${d.funnel.map((f) => `<li><div style="flex:1"><h3>${e(f.label)} <span class="muted" style="font-weight:500">· ${f.count}</span></h3><div class="progress" role="img" aria-label="${e(f.label)}: ${f.count}"><span style="width:${Math.round((f.count / max) * 100)}%"></span></div></div></li>`).join('')}</ul>`;
  const diag = d.bottleneck
    ? `<p style="margin:12px 0 4px">${tag('Hier hängt es', 'pending')} <strong>${e(d.bottleneck.reason)}</strong></p><p class="muted" style="margin:0">Nächster Schritt: ${e(d.bottleneck.nextStep)}</p>`
    : `<p style="margin:12px 0 0">${tag('Kein Engpass erkennbar', 'ok')}</p>`;
  const tech = d.technical.length
    ? `<p style="margin:14px 0 4px;font-weight:600">Technische Hinweise aus den Daten</p><ul style="margin:0;padding-left:20px;color:var(--ink-soft)">${d.technical.map((x) => `<li>${e(x.label)}: <strong>${x.count}</strong></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:14px 0 0;font-size:14px">Keine technischen Störungen erfasst.</p>';
  const attr = revenueAttribution(pc.ctx, test);
  const journey = buyerJourney(pc.ctx, test);
  const fmtH = (h: number | null): string => (h === null ? '—' : h < 1 ? 'unter 1 Std.' : h < 48 ? `${String(h).replace('.', ',')} Std.` : `${String(Math.round(h / 24 * 10) / 10).replace('.', ',')} Tage`);
  const pcs = productConcentration(pc.ctx, test);
  const prodLine = pcs.length
    ? `<p style="margin:12px 0 0"><strong>Nach Produktart:</strong> ${pcs.map((p) => `${e(({ 'b2b-calc-csv': 'Tabelle', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Paket' } as Record<string, string>)[p.product] ?? p.product)} ${String(p.sharePct).replace('.', ',')} %`).join(' · ')}${pcs.length === 1 ? ' – der gesamte Umsatz hängt an einer Produktart.' : ''}</p><p class="muted" style="margin:4px 0 0">Marktplätze: keine angebunden – keine Abhängigkeit von Plattformen.</p>`
    : '';
  const conc = cc.level === 'none'
    ? `<p class="muted" style="margin:4px 0 0">${e(cc.explain)}</p>`
    : `${kv(cc.top.map((t) => [t.label, `${e(money(t.minor, cf.currency))} · ${String(t.sharePct).replace('.', ',')} %`]))}<p style="margin:12px 0 4px">${tag(cc.level === 'high' ? 'Hohe Abhängigkeit' : cc.level === 'watch' ? 'Beobachten' : 'Gut verteilt', cc.level === 'ok' ? 'ok' : 'pending')}</p><p class="muted" style="margin:0">${e(cc.explain)} (${cc.customers} zahlende Kunden; Namen bewusst ausgeblendet)</p>`;
  return `<div class="grid2 even">
${panel({ title: 'Warum (noch) kein Verkauf?', sub: `Vom ersten Kontakt bis zur Lieferung${test ? ' · Testdaten' : ''}`, body: `${funnel}${diag}${tech}` })}
${panel({ title: 'Was in nächster Zeit ankommt', sub: 'Nur aus bekannten Beträgen – keine erfundene Umsatzprognose', body: `${kv([
    ['Beim Zahlungsanbieter', e(money(cf.atProviderMinor, cf.currency))],
    ['Auszahlung unterwegs', e(money(cf.inTransitMinor, cf.currency))],
    ['Mögliche Erstattungen', e(money(-cf.pendingRefundsMinor, cf.currency))],
    ['Erwartbar auf der Bank', `<strong>${e(money(cf.expectedBankMinor, cf.currency))}</strong> <span class="muted">ohne neue Verkäufe</span>`],
    ['Angenommen, noch unbezahlt', `${e(money(cf.unpaidAcceptedMinor, cf.currency))} <span class="muted">nicht eingerechnet</span>`],
    ['Steuerrücklage (Schätzung)', cf.taxReserveMinor === null ? '<span class="muted">nicht eingerichtet</span>' : e(money(-cf.taxReserveMinor, cf.currency))],
    ['Erstattungsrücklage', e(money(-cf.refundReserveMinor, cf.currency))],
    ['Frei nach Rücklagen', `<strong>${e(money(cf.freeAfterReservesMinor, cf.currency))}</strong> <span class="muted">Schätzung, kein Gewinn</span>`],
    ['Frühestes Auszahlungsdatum', cf.earliestPayoutDay ? e(fmtDay(cf.earliestPayoutDay)) : '<span class="muted">nicht vorhergesagt (Frist nicht eingetragen)</span>'],
  ])}${cf.notes.length ? explain(cf.notes.join(' ')) : ''}` })}
</div>
<div class="grid2 even">
${panel({ title: 'Woher kamen die Käufer?', sub: 'Nach Herkunft der Anfrage – ohne Tracking und Cookies', flush: true, body: `${table(
    [{ label: 'Herkunft' }, { label: 'Anfragen' }, { label: 'Bezahlt' }, { label: 'Umsatz', amount: true }],
    attr.channels.map((c) => [`<strong>${e(c.source)}</strong>`, String(c.leads), `${c.paidOrders}${c.conversionPct !== null ? ` <span class="sub">${String(c.conversionPct).replace('.', ',')} %</span>` : ''}`, e(money(c.paidMinor, cf.currency))]),
    'Noch keine Anfragen', 'Herkunft der Käufer')}<p class="muted" style="font-size:13px;margin:10px 24px 16px">${e(attr.note)} Kosten je Kanal: 0 € (keine bezahlten Kanäle freigegeben).</p>` })}
${panel({ title: 'Wie lange der Kaufweg dauert', sub: 'Typische Wartezeit zwischen zwei Schritten (Median)', flush: true, body: table(
    [{ label: 'Schritt' }, { label: 'Fälle' }, { label: 'Typische Dauer' }],
    journey.map((j) => [`${e(j.from)} → ${e(j.to)}`, String(j.cases), e(fmtH(j.medianHours))]),
    'Noch keine Daten', 'Kaufweg') })}
</div>
${panel({ title: 'Portfolio: Was sich lohnt', sub: 'Deckungsbeitrag je Produktart aus dem Hauptbuch', flush: true, body: table(
    [{ label: 'Produktart' }, { label: 'Bezahlt' }, { label: 'Ø Positionen' }, { label: 'Deckungsbeitrag', amount: true }],
    pf.map((r) => [`<strong>${e(({ 'b2b-calc-csv': 'Kalkulationstabelle', 'b2b-calc-pdf': 'Kalkulation als PDF', 'b2b-calc-bundle': 'Kalkulationspaket' } as Record<string, string>)[r.product] ?? r.product)}</strong><span class="sub">Umsatz ${e(money(r.revenueMinor, cf.currency))} − Gebühren ${e(money(r.feesMinor, cf.currency))} − Erstattungen ${e(money(r.refundsMinor, cf.currency))}</span>`, String(r.paidOrders), String(r.avgItems).replace('.', ','), e(money(r.contributionMinor, cf.currency))]),
    'Noch keine Aufträge', 'Portfolio') })}
${panel({ title: 'Angebote und Annahme nach Preisspanne', sub: 'Aus echten Angeboten – kein „Gewinner“ bei zu kleinen Zahlen', flush: true, body: `${table(
    [{ label: 'Preisspanne' }, { label: 'Angebote' }, { label: 'Angenommen' }, { label: 'Bezahlt' }],
    pa.bands.map((b) => [`<strong>${e(b.label)}</strong>`, String(b.quotes), `${b.accepted}${b.acceptancePct !== null ? ` <span class="sub">${String(b.acceptancePct).replace('.', ',')} %${b.enoughData ? '' : ' · zu wenige Daten'}</span>` : ''}`, String(b.paid)]),
    'Noch keine Angebote', 'Annahme nach Preisspanne')}<p class="muted" style="font-size:13px;margin:8px 24px 16px">${e(pa.hint)}</p>` })}
<div class="grid2 even">
${panel({ title: 'Abhängigkeit von einzelnen Kunden', sub: 'Anteil der größten Kunden und Produktarten am bezahlten Umsatz', body: conc + prodLine })}
${panel({ title: 'Rücklage für Erstattungen', sub: 'Empfehlung – kein auszahlbarer Gewinn, keine Buchung', body: `${kv([
    ['Bezahlt in den letzten 90 Tagen', e(money(rr.recentPaidMinor, cf.currency))],
    ['Erstattungsquote', `${String(rr.refundRatePct).replace('.', ',')} % <span class="muted">${rr.basis === 'history' ? 'aus deinen Daten' : 'Mindestwert'}</span>`],
    ['Offene Erstattungsanträge', e(money(rr.pendingRequestsMinor, cf.currency))],
    ['Empfohlene Rücklage', `<strong>${e(money(rr.reserveMinor, cf.currency))}</strong>`],
  ])}${explain(rr.explain)}` })}
</div>`;
}

export function renderReports(pc: PageCtx, statusFilter: string | null): string {
  const test = pc.mode === 'test';
  const f = financeView(pc.ctx, test);
  const policy = effectivePolicy(pc.ctx);
  const month = pc.ctx.clock().toISOString().slice(0, 7);
  const counts = statusCounts();
  const filter = (['UMGESETZT', 'TEILWEISE', 'GEPLANT', 'GESPERRT'] as const).find((s) => s === statusFilter) ?? null;
  const mods = modulesWithStatus().filter((m) => !filter || m.status === filter);

  const profit = kv([
    ['Bestellungen bezahlt', e(money(f.paidMinor, f.currency))],
    ['Erstattungen', e(money(f.refundsMinor, f.currency))],
    ['Gebühren des Zahlungsanbieters', e(money(f.feesMinor, f.currency))],
    ['Angefochtene Zahlungen', e(money(f.disputesMinor, f.currency))],
    ['Deckungsbeitrag', `<strong>${e(money(f.contributionMinor, f.currency))}</strong> <span class="muted">vor Steuern und eigenen Kosten</span>`],
  ]);
  const costs = kv([
    ['Zusätzliche Software-Fixkosten', `${tag(`${policy?.maxNewMonthlyFixedCostEur ?? 0} € pro Monat freigegeben`, 'ok')}`],
    ['Kostenpflichtige Dienste / APIs', policy?.allowPaidApis ? tag('Erlaubt', 'bad') : tag('Technisch gesperrt', 'ok')],
    ['Automatische Upgrades', tag('Gesperrt', 'ok')],
    ['Bezahlte Werbung', tag('Gesperrt', 'ok')],
    ['Neue finanzielle Verpflichtungen', policy?.allowNewFinancialCommitments ? tag('Erlaubt', 'bad') : tag('Gesperrt', 'ok')],
    ['Was trotzdem real anfallen kann', '<span class="muted">Zahlungsgebühren pro Verkauf, Steuern, Registrierungs- und Beratungskosten.</span>'],
  ]);
  const chip = (s: ImplStatus | null, label: string, n: number): string => `<a href="${e(withMode(s ? `/dashboard/berichte?stand=${s}#funktionsstand` : '/dashboard/berichte#funktionsstand', pc.mode))}"${filter === s ? ' aria-current="true"' : ''}>${e(label)} (${n})</a>`;

  const body = `<section class="metrics" aria-label="Funktionsstand">
${metric({ label: 'Freigegebene Funktionen', value: String(REGISTRY.modules.length), sub: '048, 049 und 110 bewusst abgelehnt', icon: 'list' })}
${metric({ label: STATUS_LABEL.UMGESETZT, value: String(counts.UMGESETZT), sub: 'Automatisiert getestet', icon: 'checkCircle' })}
${metric({ label: STATUS_LABEL.TEILWEISE, value: String(counts.TEILWEISE), sub: 'Teil läuft, Rest klar benannt', icon: 'clock' })}
${metric({ label: 'Noch offen', value: String(counts.GEPLANT + counts.GESPERRT), sub: `${counts.GEPLANT} geplant · ${counts.GESPERRT} bewusst gesperrt`, icon: 'info' })}
</section>
<div class="grid2 even">
${panel({ title: 'Gewinnübersicht', sub: `${test ? 'Testgeld' : 'Echtbetrieb'} · Umsatz ist nicht Gewinn`, body: `${profit}${explain('Der Deckungsbeitrag ist der Betrag nach Erstattungen, Anbietergebühren und Anfechtungen. Steuern und eigene Kosten sind noch nicht abgezogen. Eine verbindliche Gewinnermittlung macht deine Steuerberatung.')}` })}
${panel({ title: 'Kostenkontrolle', sub: 'Deine 0-€-Grenze ist technisch erzwungen', body: costs })}
</div>
${renderInsights(pc)}
${panel({ title: 'Unterlagen und Exporte', sub: 'Für dich und deine Steuerberatung', body: `<div class="actions">
<a class="btn ghost" href="/api/reports/monthly?month=${e(month)}">Monatsübersicht ${e(month)} (JSON)</a>
<a class="btn ghost" href="/api/reports/summary">Kennzahlen (JSON)</a>
<a class="btn ghost" href="/api/status">Technischer Statusbericht (JSON)</a>
<a class="btn ghost" href="/api/admin/backup">Datensicherung herunterladen</a></div>
<p class="muted" style="font-size:13px;margin:12px 0 0">Die Datensicherung enthält personenbezogene Daten. Jeder Abruf wird protokolliert.</p>` })}
${panel({ id: 'wachstum', title: 'Wachstum ohne Werbebudget', sub: 'Funnel bis zur Bank, Antwort-Warteschlange, Bedarfsseiten, Ratgeber, Partner und erste Kunden', action: { href: withMode('/dashboard/wachstum', pc.mode), label: 'Öffnen' }, body: '<p style="margin:4px 0 0">Nur echte Daten: Impressionen erst mit Search Console, Geld nur mit Zahlungsereignis, „auf der Bank“ nur mit Kontoauszug.</p>' })}
${panel({ id: 'funktionsstand', title: 'Funktionsstand – alle 147 freigegebenen Funktionen', sub: 'Ehrlich: Was läuft, was teilweise läuft, was noch nicht gebaut ist', flush: true, body: `<div style="padding:4px 24px 12px"><nav class="segmented" aria-label="Nach Stand filtern" style="flex-wrap:wrap">${chip(null, 'Alle', REGISTRY.modules.length)}${(['UMGESETZT', 'TEILWEISE', 'GEPLANT', 'GESPERRT'] as const).map((s) => chip(s, STATUS_LABEL[s], counts[s])).join('')}</nav></div>
${table(
    [{ label: 'Nr.' }, { label: 'Funktion' }, { label: 'Bereich' }, { label: 'Stand' }, { label: 'Was läuft / was fehlt', full: true }],
    mods.map((m) => [String(m.n).padStart(3, '0'), `<strong>${e(m.titleDe)}</strong>`, e(AREA_LABEL[m.area]), statusTag(m.status), `${m.umgesetzt ? `${e(m.umgesetzt)}` : ''}${m.offen ? `<span class="sub">${m.umgesetzt ? 'Offen: ' : ''}${e(m.offen)} (${e(m.milestone)})</span>` : ''}`]),
    'Keine Funktionen in diesem Filter', 'Funktionsstand')}` })}`;
  return shell({ title: 'Berichte', eyebrow: 'Berichte', heading: 'Deine Berichte', lead: 'Verständliche Auswertungen für dein Geschäft, deine Steuerunterlagen und den ehrlichen Entwicklungsstand.', active: 'berichte', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch('/dashboard/berichte', pc.mode), body, systemTestMode: pc.ctx.config.testMode });
}
