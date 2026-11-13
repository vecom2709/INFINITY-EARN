import { activeRelease, releaseHistory, sampleQa } from '../../../../services/core-api/src/releases.ts';
import { effectivePolicy } from '../../../../services/core-api/src/policy-store.ts';
import { evaluateExperiments, funnel, partnerOverview, responseQueue, timingSignals, type Measured } from '../../../../services/growth/src/sales-growth.ts';
import { contentStatus, distributionStatus, intentClusters, landingStatus } from '../../../../services/growth/src/visibility.ts';
import { getCapability } from '../../../../services/product-factory/src/registry.ts';
import { getStandard } from '../../../../services/product-factory/src/quality-standard.ts';
import { money as formatMoney } from '../model.ts';
import { action, e, explain, metric, modeSwitch, panel, shell, table, tag } from '../ui.ts';
import type { PageCtx } from './types.ts';

/** Admin → Wachstum: Sichtbarkeit, Anfragen, Partner, erste Kunden und der Weg bis zur Bank – nur echte Daten. */

const form = (pc: PageCtx, href: string, back: string, fields: string, button: string, what: string): string =>
  `<form class="action" method="post" action="${e(href)}" style="display:grid;gap:8px;max-width:640px"><input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(back)}">${fields}
<p style="margin:4px 0 0"><button class="btn" type="submit">${e(button)}</button> <span class="what">${e(what)}</span></p></form>`;
const field = (id: string, label: string, name: string, attrs = ''): string => `<label for="${id}">${e(label)}</label><input id="${id}" type="text" name="${name}" ${attrs}>`;
const measured = (m: Measured): string => ('value' in m ? String(m.value) : `<span class="muted" title="${e(m.unavailable)}">nicht gemessen</span>`);
const STATE_TONE: Record<string, 'ok' | 'pending' | 'bad' | 'neutral'> = { PUBLISHED: 'ok', SENT: 'ok', PREPARED: 'ok', MAPPED: 'ok', RUNNING: 'pending', QUEUED: 'pending', PLANNED: 'pending', FIRST_PAID_ORDER_VERIFIED: 'ok', SCALE_ELIGIBLE: 'ok', QA_BLOCKED: 'neutral', NOT_CONNECTED: 'neutral', REVIEW_BLOCKED: 'bad', POLICY_BLOCKED: 'bad', BLOCKED: 'bad', NO_DEMAND: 'bad', FAILED: 'bad', EXPIRED: 'neutral', STOPPED: 'neutral', QUOTA_BLOCKED: 'pending', NEEDS_REVIEW: 'pending', UNDER_REVIEW: 'pending' };
const st = (s: string): string => tag(s, STATE_TONE[s] ?? 'neutral');

export function renderGrowth(pc: PageCtx): string {
  const test = pc.mode === 'test';
  const back = `/dashboard/wachstum${test ? '?modus=test' : ''}`;
  const f = funnel(pc.ctx, test);
  const queue = responseQueue(pc.ctx, test);
  const timing = timingSignals(pc.ctx, test);
  const partners = partnerOverview(pc.ctx, test);
  const experiments = evaluateExperiments(pc.ctx);
  const landing = landingStatus(pc.ctx);
  const content = contentStatus(pc.ctx);
  const intents = intentClusters(pc.ctx, test);
  const dist = distributionStatus(pc.ctx);
  const money = (m: number): string => formatMoney(m, f.currency);
  const totalLeads = f.rows.reduce((s, r) => s + r.leads, 0);
  const totalPaid = f.rows.reduce((s, r) => s + r.paidOrders, 0);

  const body = `<section class="metrics" aria-label="Wachstumskennzahlen">
${metric({ label: 'Anfragen', value: String(totalLeads), sub: 'Aus allen Kanälen in dieser Ansicht', icon: 'inbox' })}
${metric({ label: 'Bezahlte Aufträge', value: String(totalPaid), sub: 'Nur mit bestätigtem Zahlungsereignis', icon: 'checkCircle' })}
${metric({ label: 'Auf der Bank bestätigt', value: money(f.bankVerifiedMinor), sub: `Auszahlungen gemeldet: ${money(f.payoutsMinor)}`, icon: 'bank' })}
${metric({ label: 'Veröffentlichte Seiten', value: String(landing.filter((l) => l.status === 'PUBLISHED').length + content.filter((c) => c.status === 'PUBLISHED').length), sub: 'Bedarfsseiten und Ratgeber nach bestandener Prüfung', icon: 'doc' })}
</section>
${panel({ id: 'funnel', title: 'Von der Suche bis zur Bank (155)', sub: f.note, flush: true, body: `${table(
    [{ label: 'Kanal' }, { label: 'Impressionen' }, { label: 'Klicks' }, { label: 'Anfragen' }, { label: 'Angebote' }, { label: 'Bezahlt' }, { label: 'Geliefert' }, { label: 'Netto', amount: true }],
    f.rows.map((r) => [`<strong>${e(r.channel === 'unattributed' ? 'nicht zuordenbar' : r.channel)}</strong>`, measured(r.impressions), measured(r.clicks), String(r.leads), String(r.quotes), String(r.paidOrders), String(r.delivered), `${e(money(r.netMinor))}<span class="sub">Zahlungen ${e(money(r.paymentsMinor))} − Gebühren ${e(money(r.feesMinor))} − Erstattungen ${e(money(r.refundsMinor))}</span>`]),
    'Noch keine Anfragen in dieser Ansicht', 'Funnel')}${explain('Impressionen und Klicks werden erst angezeigt, wenn die Google Search Console mit deinem Konto verbunden ist – bis dahin steht dort ehrlich „nicht gemessen“. Ohne Kanalangabe bleibt eine Anfrage „nicht zuordenbar“. Geld zählt nur mit bestätigtem Zahlungsereignis; „auf der Bank“ nur mit Kontoauszug.')}` })}
${panel({ id: 'antworten', title: 'Antwort-Warteschlange (138)', sub: 'Echte Zeitstempel: Eingang → Angebot → Nachricht. Kontaktregeln gehen immer vor.', flush: true, body: table(
    [{ label: 'Eingang' }, { label: 'Status' }, { label: 'Erste Antwort' }, { label: 'Grund und nächster Schritt', full: true }],
    queue.slice(0, 30).map((q) => [e(q.receivedAt.slice(0, 16).replace('T', ' ')), st(q.state), q.firstResponseMinutes === null ? '–' : `${q.firstResponseMinutes} min`, `${e(q.reason)}<span class="sub">${e(q.next)}</span>`]),
    'Keine eingegangenen Anfragen', 'Antworten') })}
${panel({ id: 'zeitpunkt', title: 'Zeitpunkt-Signale aus Ausschreibungen (132)', sub: 'Gründe statt Prozentwerte. Ereignisse sind Hinweise, keine sichere Kaufabsicht.', flush: true, body: table(
    [{ label: 'Ausschreibung' }, { label: 'Frist' }, { label: 'Bestes Zeitfenster' }, { label: 'Sicherheit' }, { label: 'Gründe', full: true }],
    timing.slice(0, 25).map((s) => [e(s.title || s.opportunityId), e(s.eventDate ?? '–'), s.bestContactWindow ? `${e(s.bestContactWindow.from)} bis ${e(s.bestContactWindow.to)}` : '–', st(s.confidenceBand), e(s.reasonCodes.join(', '))]),
    'Keine Ausschreibungen in dieser Ansicht', 'Zeitpunkt') })}
${panel({ id: 'seiten', title: 'Bedarfsseiten (135/151)', sub: 'Eine Seite je echter Leistung. Veröffentlicht nur, wenn die Leistung freigegeben ist und alle Prüfungen bestehen.', flush: true, body: table(
    [{ label: 'Seite' }, { label: 'Status' }, { label: 'Prüfungen', full: true }],
    landing.map((l) => [`<a href="/loesungen/${e(l.slug)}">/loesungen/${e(l.slug)}</a><span class="sub">${e(getCapability(l.capability) ? l.capability : '?')}</span>`, st(l.status), l.qa.map((q) => `${q.passed ? '✓' : '✗'} ${e(q.check)}: ${e(q.detail)}`).join('<br>')]),
    'Keine Seiten', 'Bedarfsseiten') })}
${panel({ id: 'ratgeber', title: 'Ratgeber (148)', sub: 'Aus der Bedienungsanleitung des gelieferten Programms; wird bei jeder Programmänderung neu geprüft.', flush: true, body: `${table(
    [{ label: 'Artikel' }, { label: 'Sprache' }, { label: 'Status' }, { label: 'Prüfung', full: true }],
    content.map((c) => [`<a href="/ratgeber/${e(c.slug)}${c.lang === 'de' ? '' : `?lang=${e(c.lang)}`}">/ratgeber/${e(c.slug)}</a>`, e(c.lang.toUpperCase()), st(c.status), c.review.map((q) => `${q.passed ? '✓' : '✗'} ${e(q.check)}`).join(' · ')]),
    'Keine Artikel', 'Ratgeber')}` })}
${panel({ id: 'verbreitung', title: 'Verbreitung über eigene Kanäle (149)', sub: 'Nur über Kanäle, die du mit eigenem Konto verbindest. Keine Direktnachrichten, keine gekauften Reichweiten.', body: `${dist.length ? table(
    [{ label: 'Kanal' }, { label: 'Inhalt' }, { label: 'Status' }, { label: 'Link mit Kampagnenkennung', full: true }],
    dist.map((d) => [e(d.channel), e(d.content), st(d.status), `<span class="mono">${e(d.link)}</span><span class="sub">${e(d.reason ?? '')}</span>`]), 'Noch nichts geplant', 'Verbreitung') : '<p class="muted">Noch nichts geplant.</p>'}
${action({ href: '/admin/verbreitung', csrf: pc.csrf, back: `${back}#verbreitung`, label: 'Ratgeber-Verbreitung planen', what: 'Erzeugt Beiträge mit Kampagnenlinks. Nicht verbundene Kanäle bleiben „nicht verbunden“ – es wird nichts veröffentlicht oder gesendet.', hidden: { slug: 'angebot-bis-rechnung' } })}` })}
${panel({ id: 'absichten', title: 'Suchabsichten aus echten Anfragen (147)', sub: 'Keine erfundenen Suchvolumen. Quelle: deine eingegangenen Anfragen (ohne Kontaktdaten).', flush: true, body: table(
    [{ label: 'Leistung' }, { label: 'Absicht' }, { label: 'Anzahl' }, { label: 'Zuletzt' }, { label: 'Beispiele', full: true }],
    intents.slice(0, 20).map((i) => [e(i.capability ?? 'keine passende Leistung – Machbarkeit prüfen'), st(i.intentClass), String(i.count), e(i.lastSeen.slice(0, 10)), e(i.examples.join(' · '))]),
    'Noch keine Anfragen ausgewertet', 'Suchabsichten') })}
${panel({ id: 'partner', title: 'Partner und Empfehlungen (139)', sub: 'Nur mit ausdrücklicher Teilnahme und Vertrag. Provision nur aus bestätigten Zahlungen, Auszahlung nur nach deiner Freigabe.', body: `${partners.length ? table(
    [{ label: 'Partner' }, { label: 'Status' }, { label: 'Empfehlungen' }, { label: 'Bezahlt' }, { label: 'Provision offen / freigegeben', amount: true }],
    partners.map((p) => [`<strong>${e(p.partner.name)}</strong><span class="sub">Code ${e(p.partner.referral_code)} · ${e(p.partner.territory)} · ${(p.partner.commission_bps / 100).toFixed(1).replace('.', ',')} %</span>`, st(p.partner.status), String(p.referrals), String(p.paidOrders), `${e(money(p.pendingMinor))} / ${e(money(p.approvedMinor))}`]), 'Keine Partner', 'Partner') : '<p class="muted">Noch keine Partner.</p>'}
${form(pc, '/admin/partner', `${back}#partner`, `${field('p-name', 'Name des Partners', 'name', 'required maxlength="120"')}${field('p-consent', 'Nachweis der Teilnahme (z. B. E-Mail vom …)', 'consent', 'required maxlength="200"')}${field('p-contract', 'Vertrag (Referenz)', 'contract', 'required maxlength="200"')}${field('p-terr', 'Länder (ISO, z. B. IT,DE)', 'territory', 'required maxlength="40"')}${field('p-caps', 'Produktarten (kommagetrennt)', 'capabilities', 'maxlength="200"')}${field('p-com', 'Provision in %', 'commission', 'required inputmode="decimal" maxlength="5"')}`, 'Partner anlegen', 'Kein Versand, keine Zahlung. Der Partner erhält einen Empfehlungslink, den du ihm selbst gibst.')}` })}
${panel({ id: 'erste-kunden', title: 'Erste Kunden (140)', sub: 'Kleine Experimente mit 0 € Budget. Entscheidung nur aus echten bezahlten Aufträgen.', body: `${experiments.length ? table(
    [{ label: 'Experiment' }, { label: 'Entscheidung' }, { label: 'Anfragen' }, { label: 'Bezahlt (echt / Test)' }],
    experiments.map((x) => [e(x.id), st(x.decision), String(x.inquiries), `${x.livePaid} / ${x.testPaid}`]), 'Keine Experimente', 'Experimente') : '<p class="muted">Noch keine Experimente.</p>'}
${form(pc, '/admin/experimente', `${back}#erste-kunden`, `${field('x-cap', 'Produktart', 'capability', 'required value="mini-ww" maxlength="60"')}${field('x-hyp', 'Annahme (z. B. „Handwerksbetriebe in Südtirol bestellen die Warenwirtschaft über die Bedarfsseite“)', 'hypothesis', 'required maxlength="300"')}${field('x-ch', 'Kanäle (1–3, z. B. landing,content)', 'channels', 'required maxlength="80"')}${field('x-days', 'Dauer in Tagen (7–90)', 'days', 'required inputmode="numeric" maxlength="2" value="30"')}`, 'Experiment starten', 'Budget fest 0 €. Es wird nichts gesendet; gemessen werden nur echte Anfragen und Zahlungen.')}` })}`;
  return shell({ title: 'Wachstum', eyebrow: 'Wachstum', heading: 'Wachstum ohne Werbebudget', lead: 'Sichtbarkeit, Anfragen, Partner und erste Kunden – nur echte Daten, unbekannte Werte bleiben unbekannt.', active: 'berichte', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch('/dashboard/wachstum', pc.mode), body, systemTestMode: pc.ctx.config.testMode });
}

/** P4: Vorschau und Verkaufsfreigabe einer Fachsoftware. */
export function renderProductRelease(pc: PageCtx, capabilityId: string): string | null {
  const cap = getCapability(capabilityId);
  const std = getStandard(capabilityId);
  if (!cap || !std) return null;
  const rel = activeRelease(pc.ctx, capabilityId);
  const history = releaseHistory(pc.ctx, capabilityId);
  const policy = effectivePolicy(pc.ctx);
  const qa = sampleQa(capabilityId);
  const back = `/dashboard/produkte/${capabilityId}`;
  const ceiling = pc.ctx.config.policy.allowedCapabilities.includes(capabilityId);
  const body = `<section class="metrics" aria-label="Freigabestand">
${metric({ label: 'Verkauf', value: rel ? 'Freigegeben' : 'Gesperrt', sub: rel ? `seit ${rel.created_at.slice(0, 10)}` : 'Erst nach deiner Freigabe bestellbar', icon: rel ? 'checkCircle' : 'lock', text: true })}
${metric({ label: 'Festpreis', value: rel?.price_minor ? formatMoney(rel.price_minor, rel.currency ?? 'EUR') : '–', sub: policy ? `Erlaubt: ${formatMoney(policy.quote.minMinor, policy.quote.currency)} bis ${formatMoney(policy.quote.maxMinor, policy.quote.currency)}` : 'Keine Policy', icon: 'wallet' })}
${metric({ label: 'Musterprüfung jetzt', value: qa.passed ? 'Bestanden' : 'Nicht bestanden', sub: `${qa.checks.filter((c) => c.passed).length} von ${qa.checks.length} Prüfungen`, icon: 'shield', text: true })}
${metric({ label: 'Programmversion', value: String(cap.version), sub: `Paket ${Math.round(qa.bytes / 1024)} KB · ${qa.sha256.slice(0, 12)}`, icon: 'package' })}
</section>
${panel({ id: 'vorschau', title: 'Live-Vorschau', sub: 'Das echte, gebaute Programm – genau so, wie der Kunde es bekommt (hier mit Beispieldaten)', body: `<p class="row" style="display:flex;gap:10px;flex-wrap:wrap">
<a class="btn" href="/demo/warenwirtschaft" target="_blank" rel="noopener">Programm öffnen (DE)</a><a class="btn ghost" href="/demo/warenwirtschaft?lang=it" target="_blank" rel="noopener">Italienisch</a><a class="btn ghost" href="/demo/warenwirtschaft?lang=en" target="_blank" rel="noopener">Englisch</a>
<a class="btn ghost" href="/admin/muster/mini-ww/anleitung.pdf">Anleitung (PDF)</a><a class="btn ghost" href="/admin/muster/mini-ww/paket.zip">Musterpaket (ZIP)</a><a class="btn ghost" href="/produkte/warenwirtschaft" target="_blank" rel="noopener">Produktseite</a></p>
${explain('Die Vorschau läuft vollständig in deinem Browser, ohne Netzwerkzugriff. Beispieldaten sind als solche gekennzeichnet und werden nie an Kunden ausgeliefert.')}` })}
${panel({ id: 'pruefung', title: 'Abnahmeprüfung des Musterpakets', sub: 'Wird bei jedem Öffnen dieser Seite und bei der Freigabe neu ausgeführt', flush: true, body: table(
    [{ label: 'Prüfung' }, { label: 'Ergebnis' }, { label: 'Details', full: true }],
    qa.checks.map((c) => [e(c.check), c.passed ? tag('Bestanden', 'ok') : tag('Nicht bestanden', 'bad'), e(c.detail ?? '')]), 'Keine Prüfungen', 'Musterprüfung') })}
${panel({ id: 'freigabe', title: rel ? 'Verkauf stoppen' : 'Zum Verkauf freigeben', sub: rel ? 'Neue Bestellungen werden sofort gesperrt; laufende Aufträge werden normal geliefert.' : 'Mit deiner Freigabe wird die Produktseite bestellbar. Der Preis gilt für jede Bestellung.', body: `${!ceiling ? `<p class="err">Hinweis: Die Umgebungskonfiguration (ALLOWED_CAPABILITIES) erlaubt diese Produktart noch nicht – auch nach der Freigabe bleibt sie bis dahin nicht bestellbar.</p>` : ''}${rel
    ? form(pc, `/admin/produkte/${capabilityId}/zurueckziehen`, back, field('r-reason', 'Grund', 'reason', 'required maxlength="300"'), 'Verkauf stoppen', 'Kein Kunde wird benachrichtigt; nur neue Bestellungen werden gesperrt.')
    : qa.passed
      ? form(pc, `/admin/produkte/${capabilityId}/freigeben`, back, field('r-price', `Festpreis in ${policy?.quote.currency ?? 'EUR'} (z. B. 490,00)`, 'price', 'required inputmode="decimal" maxlength="10"'), 'Prüfen und freigeben', 'Das Musterpaket wird neu erzeugt und geprüft. Nur wenn alles besteht, wird freigegeben. Testbetrieb: keine echten Zahlungen.')
      : '<p class="err">Freigabe nicht möglich, solange eine Prüfung nicht besteht.</p>'}` })}
${panel({ id: 'verlauf', title: 'Verlauf', flush: true, body: table(
    [{ label: 'Zeitpunkt' }, { label: 'Entscheidung' }, { label: 'Preis', amount: true }, { label: 'Grund', full: true }],
    history.map((h) => [e(h.created_at.slice(0, 16).replace('T', ' ')), h.action === 'RELEASED' ? tag('Freigegeben', 'ok') : tag('Gestoppt', 'neutral'), h.price_minor ? e(formatMoney(h.price_minor, h.currency ?? 'EUR')) : '–', e(h.reason ?? `Version ${h.capability_version}`)]),
    'Noch keine Entscheidung', 'Verlauf') })}`;
  return shell({ title: 'Warenwirtschaft – Freigabe', eyebrow: 'Produkte', heading: 'Warenwirtschaft: Vorschau und Freigabe', lead: std.purpose, active: 'produkte', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, body, systemTestMode: pc.ctx.config.testMode });
}
