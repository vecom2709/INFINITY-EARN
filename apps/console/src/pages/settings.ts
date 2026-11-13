import { STOP_NAMES } from '../../../../packages/policies/src/engine.ts';
import { activeStops, effectivePolicy } from '../../../../services/core-api/src/policy-store.ts';
import { businessProfile, listActivationItems, readinessSummary } from '../../../../services/core-api/src/readiness.ts';
import { ACTIVITY } from '../labels.ts';
import { EU_COUNTRIES } from '../../../../services/finance/src/tax.ts';
import { backupState, fmtDate } from '../model.ts';
import { action, e, explain, kv, panel, shell, table, tag, withMode } from '../ui.ts';
import type { PageCtx } from './types.ts';

const STOP_TEXT: Record<string, { name: string; what: string }> = {
  PAUSE_ACQUISITION: { name: 'Kundensuche pausieren', what: 'Es werden keine neuen Anfragen aus Quellen abgerufen.' },
  PAUSE_PRODUCTION: { name: 'Produktion pausieren', what: 'Bezahlte Aufträge warten, bis du den Stopp löst.' },
  PAUSE_PAYMENTS: { name: 'Neue Zahlungen pausieren', what: 'Kunden können vorübergehend nicht bezahlen.' },
  STOP_ALL_JOBS: { name: 'Alle Tätigkeiten anhalten', what: 'Der Autopilot ruht vollständig.' },
};

const LA_STATUS: Record<string, { text: string; tone: 'ok' | 'pending' | 'neutral' }> = {
  OPEN: { text: 'Offen', tone: 'neutral' },
  IN_PROGRESS: { text: 'In Arbeit', tone: 'pending' },
  APPROVED: { text: 'Freigegeben', tone: 'ok' },
  NOT_APPLICABLE: { text: 'Nicht zutreffend', tone: 'ok' },
};

const COUNTRY_NAMES: Record<string, string> = { AT: 'Österreich', BE: 'Belgien', BG: 'Bulgarien', CY: 'Zypern', CZ: 'Tschechien', DE: 'Deutschland', DK: 'Dänemark', EE: 'Estland', ES: 'Spanien', FI: 'Finnland', FR: 'Frankreich', GR: 'Griechenland', HR: 'Kroatien', HU: 'Ungarn', IE: 'Irland', IT: 'Italien', LT: 'Litauen', LU: 'Luxemburg', LV: 'Lettland', MT: 'Malta', NL: 'Niederlande', PL: 'Polen', PT: 'Portugal', RO: 'Rumänien', SE: 'Schweden', SI: 'Slowenien', SK: 'Slowakei' };
const PROFILE_TEXT: Record<string, string> = { ...COUNTRY_NAMES, OPEN: 'noch offen', NEW_INDEPENDENT_ENTITY: 'Neues, eigenständiges Unternehmen', 'B2B,B2C': 'Unternehmen und Verbraucher', EU: 'Europäische Union' };

export function renderSettings(pc: PageCtx): string {
  const back = withMode('/dashboard/einstellungen', pc.mode);
  const stops = activeStops(pc.ctx);
  const policy = effectivePolicy(pc.ctx);
  const items = listActivationItems(pc.ctx);
  const rs = readinessSummary(pc.ctx);
  const profile = businessProfile(pc.ctx);
  const b = backupState(pc.ctx);
  const opt = (v: string, cur: string, label: string): string => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;

  const stopRows = STOP_NAMES.map((s) => {
    const on = stops.has(s);
    const st = STOP_TEXT[s] ?? { name: s, what: '' };
    return [`<strong>${e(st.name)}</strong><span class="sub">${e(st.what)}</span>`, on ? tag('Aktiv – pausiert', 'pending') : tag('Aus – läuft', 'ok'),
      action({ href: '/admin/stops', csrf: pc.csrf, hidden: { stop: s, active: on ? '0' : '1' }, label: on ? 'Wieder starten' : 'Pausieren', variant: on ? 'primary' : 'danger', back, what: on ? 'Die Tätigkeit läuft danach automatisch weiter. Keine Kosten.' : `${st.what} Keine Kosten, keine Kundennachricht.` })];
  });

  const laRows = items.map((i) => {
    const st = LA_STATUS[i.status] ?? { text: i.status, tone: 'neutral' as const };
    return [`<strong>${e(i.item_id)}</strong> ${e(i.title)}<span class="sub">Verantwortlich: ${e(i.responsible)}</span>`, `${tag(st.text, st.tone)}${i.evidence_ref ? `<span class="sub">Nachweis: ${e(i.evidence_ref)}</span>` : ''}`,
      `<form class="inline-form" method="post" action="/admin/readiness/${e(i.item_id)}"><input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(`${back}#freigaben`)}">
<select name="status" aria-label="Status ${e(i.item_id)}">${opt('OPEN', i.status, 'Offen')}${opt('IN_PROGRESS', i.status, 'In Arbeit')}${opt('APPROVED', i.status, 'Freigegeben')}${opt('NOT_APPLICABLE', i.status, 'Nicht zutreffend')}</select>
<input type="text" name="evidence" aria-label="Nachweis ${e(i.item_id)}" placeholder="Nachweis (Pflicht bei Freigabe)" value="${e(i.evidence_ref ?? '')}"><button class="btn ghost" type="submit">Speichern</button></form>`];
  });

  const body = `
${panel({ id: 'sicherheit', title: 'Anmeldung absichern', sub: 'Zweiter Faktor per Passkey – Windows Hello oder Handy, ohne App', action: { href: '/dashboard/sicherheit', label: 'Sicherheit öffnen' }, body: '<p style="margin:4px 0 0">Schützt die Verwaltung, auch wenn jemand dein Passwort kennt. Vor dem Echtbetrieb einschalten.</p>' })}
${panel({ id: 'autopilot', title: 'Stopp-Schalter', sub: 'Du kannst jede Tätigkeit jederzeit sofort anhalten', flush: true, body: table([{ label: 'Tätigkeit' }, { label: 'Zustand' }, { label: 'Aktion', full: true }], stopRows, 'Keine Schalter', 'Stopp-Schalter') })}
${panel({ id: 'freigaben', title: `Live-Freigaben (${rs.done} von ${rs.total})`, sub: 'Erst wenn alle Punkte mit Nachweis freigegeben sind, kann der Echtbetrieb vorbereitet werden', flush: true, body: `${table([{ label: 'Punkt' }, { label: 'Stand' }, { label: 'Aktualisieren', full: true }], laRows, 'Keine Freigabepunkte', 'Live-Freigaben')}
<div style="padding:0 24px 18px">${explain('Freigaben kannst nur du erteilen – mit einem Nachweis (z. B. Registrierungsnummer, Bestätigung des Zahlungsanbieters, geprüfte Texte). Das System erteilt keine Freigabe selbst. Auch nach allen Freigaben bleibt der Echtbetrieb gesperrt, bis er bewusst technisch eingeschaltet wird.')}</div>` })}
<div class="grid2 even">
${panel({ title: 'Erlaubte Geschäftsbereiche', body: `${kv([
    ['Sitzland', e(PROFILE_TEXT[profile.seat_country ?? ''] ?? profile.seat_country ?? '—')],
    ['Unternehmen', e(PROFILE_TEXT[profile.legal_entity ?? ''] ?? profile.legal_entity ?? '—')],
    ['Kunden', e(PROFILE_TEXT[profile.customer_types ?? ''] ?? profile.customer_types ?? '—')],
    ['Märkte', e(PROFILE_TEXT[profile.markets ?? ''] ?? profile.markets ?? '—')],
    ['Freigegebene Produktarten', e(policy?.allowedCapabilities.join(', ') ?? '—')],
  ])}
<form class="action" method="post" action="/admin/business/seat" style="margin-top:14px"><input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(`${back}#freigaben`)}">
<label for="seat">Sitzland festlegen (LA-01)</label><select id="seat" name="country">${[...EU_COUNTRIES].sort().map((c) => `<option value="${c}"${profile.seat_country === c ? ' selected' : ''}>${e(COUNTRY_NAMES[c] ?? c)}</option>`).join('')}</select>
<button class="btn ghost" type="submit">Sitzland speichern</button><span class="what">Setzt LA-01 auf „In Arbeit“. Die Freigabe erteilst du danach mit der schriftlichen Bestätigung deiner Steuerberatung als Nachweis. Keine Kosten, keine Außenwirkung.</span></form>` })}
${panel({ title: 'Budgetgrenzen', body: kv([
    ['Zusätzliche Fixkosten', `${tag(`${policy?.maxNewMonthlyFixedCostEur ?? 0} € / Monat`, 'ok')}`],
    ['Kostenpflichtige Dienste', policy?.allowPaidApis ? tag('Erlaubt', 'bad') : tag('Gesperrt', 'ok')],
    ['Automatische Kundenwerbung', policy?.autoMarketingOutreach ? tag('An', 'bad') : tag('Aus', 'ok')],
    ['Angebotsspanne', policy ? e(`${(policy.quote.minMinor / 100).toFixed(2)} – ${(policy.quote.maxMinor / 100).toFixed(2)} ${policy.quote.currency}, Mindestmarge ${policy.quote.minMarginBps / 100} %`) : '—'],
  ]) + explain('Diese Grenzen sind fest im System verankert. Eine Änderung braucht eine neue, von dir bestätigte Richtlinien-Version – die KI kann sie nicht lockern.') })}
</div>
<div class="grid2 even">
${panel({ id: 'sicherung', title: 'Datensicherung', body: `<p style="margin:4px 0 8px">${b.health === 'ok' ? tag('Aktuell', 'ok') : b.health === 'bad' ? tag('Bitte prüfen', 'bad') : tag('Noch keine automatische Sicherung', 'neutral')}</p>
<p class="muted" style="margin:0">${b.storedAt ? `Letzte Sicherung: ${e(fmtDate(b.storedAt, true))} – verschlüsselt, 30 Tage aufbewahrt.` : 'Auf dem Testserver wird täglich automatisch verschlüsselt gesichert. Lokal kannst du jederzeit eine Sicherung herunterladen.'}${b.failedSince ? ` Fehlgeschlagen seit ${e(fmtDate(b.failedSince, true))}.` : ''}</p>
<p style="margin:14px 0 0"><a class="btn ghost" href="/api/admin/backup">Sicherung herunterladen</a></p>` })}
${panel({ title: 'Kontoverbindungen und Datenschutz', body: kv([
    ['Zahlungsanbieter', pc.ctx.config.payment.provider === 'stripe' ? `${tag('Stripe – Testmodus', 'pending')}` : tag('Testzahlung', 'pending')],
    ['Bankkonto', '<span class="muted">Noch nicht verbunden. Wird nur über die offizielle, sichere Autorisierung deines Anbieters verbunden – nie mit Passwort im Programm.</span>'],
    ['Datenschutz', '<span class="muted">Kunden können ihre Daten im Portal selbst exportieren. Löschung nach gesetzlichen Fristen (Live-Freigabe LA-08).</span>'],
  ]) })}
</div>`;
  return shell({ title: 'Einstellungen', eyebrow: 'Einstellungen', heading: 'Einstellungen & Freigaben', lead: 'Deine Grenzen, Stopp-Schalter und Live-Freigaben. Hier ändert sich nur etwas, wenn du es bestätigst.', active: 'einstellungen', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, body, systemTestMode: pc.ctx.config.testMode });
}

const ACTOR: Record<string, string> = { system: 'Automatisch', owner: 'Du', customer: 'Kunde', provider: 'Zahlungsanbieter', anonymous: 'Unbekannt', ai: 'KI-Vorschlag' };

export function renderActivities(pc: PageCtx): string {
  const t = pc.mode === 'test' ? 1 : 0;
  const rows = pc.ctx.db.all<{ event_type: string; actor: string; created_at: string }>('SELECT event_type, actor, created_at FROM audit_events WHERE test_mode = ? ORDER BY seq DESC LIMIT 150', t);
  const body = panel({ title: 'Protokoll', sub: 'Unveränderlich gespeichert – die neuesten 150 Einträge', flush: true, body: table(
    [{ label: 'Zeitpunkt' }, { label: 'Ereignis' }, { label: 'Durch' }],
    rows.map((r) => {
      const a = ACTIVITY[r.event_type];
      return [e(fmtDate(r.created_at, true)), a ? `<strong>${e(a.title)}</strong><span class="sub">${e(a.text)}</span>` : `<span class="mono">${e(r.event_type)}</span>`, e(ACTOR[r.actor] ?? r.actor)];
    }), 'Noch keine Einträge', 'Protokoll') });
  return shell({ title: 'Aktivitäten', eyebrow: 'Aktivitäten', heading: 'Was dein Unternehmen getan hat', lead: 'Jede Entscheidung und jeder automatische Schritt wird nachvollziehbar protokolliert.', active: 'aktivitaeten', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, body, systemTestMode: pc.ctx.config.testMode });
}
