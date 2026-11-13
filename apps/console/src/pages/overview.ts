import { activeStops } from '../../../../services/core-api/src/policy-store.ts';
import { autopilotStatus, type JobStatus } from '../../../../services/ai-orchestrator/src/director.ts';
import { readinessSummary } from '../../../../services/core-api/src/readiness.ts';
import { dailyReport } from '../../../../services/core-api/src/daily-report.ts';
import { icon } from '../icons.ts';
import { paymentLabel, pipelineLabel } from '../labels.ts';
import { activity, decisions, financeView, fmtDate, fmtWhen, greeting, money, monthlyPaid, orderRows, shortRef } from '../model.ts';
import { e, empty, explain, metric, modeSwitch, panel, shell, table, tag, withMode } from '../ui.ts';
import type { PageCtx } from './types.ts';

/** Autopilot kennt nur vier sichtbare Zustände (Design-System §6). */
export function autopilotState(pc: PageCtx): { text: 'Testbetrieb' | 'Freigegeben' | 'Pausiert' | 'Prüfung erforderlich'; explain: string } {
  const stops = activeStops(pc.ctx);
  if (stops.size > 0) return { text: 'Pausiert', explain: 'Mindestens ein Stopp-Schalter ist aktiv. Betroffene Tätigkeiten ruhen, bis du ihn löst.' };
  // Zur gewählten Ansicht passend: Testvorgänge lösen in der Echt-Ansicht keine „Prüfung erforderlich“ aus.
  if (decisions(pc.ctx, pc.mode === 'test').length > 0) return { text: 'Prüfung erforderlich', explain: 'Ein oder mehrere Vorgänge warten auf deine Entscheidung. Alles andere läuft weiter.' };
  if (pc.ctx.config.testMode) return { text: 'Testbetrieb', explain: 'Alle Abläufe laufen automatisch – aber nur mit Testzahlungen. Echte Verkäufe sind gesperrt, bis alle Live-Freigaben erteilt sind.' };
  return { text: 'Freigegeben', explain: 'Der Echtbetrieb ist freigegeben und läuft innerhalb deiner Grenzen.' };
}

const JOB_LABEL: Record<JobStatus, string> = {
  WAITING: 'Wartet', READY: 'Bereit', RUNNING: 'Läuft', QA_PENDING: 'In Prüfung', COMPLETED: 'Erledigt (24 Std.)', FAILED: 'Gescheitert (24 Std.)',
  RETRY_SCHEDULED: 'Neuer Versuch geplant', AI_QUOTA_BLOCKED: 'Wartet auf KI', RESOURCE_BLOCKED: 'Ohne Ressource', OWNER_APPROVAL_REQUIRED: 'Wartet auf dich',
};

/** 16.0 Autopilot-Leitstand: nur gemessene Werte (letzter Takt, Job-Zustände, Umgebungen) – keine vorgetäuschte Aktivität. */
function commandCenter(pc: PageCtx): string {
  const s = autopilotStatus(pc.ctx);
  const tone = s.state === 'AKTIV' ? 'ok' : s.state === 'FEHLER' ? 'bad' : s.state === 'ANGEHALTEN' ? 'neutral' : 'pending';
  const tick = s.tickAgeSeconds === null ? 'noch nie' : s.tickAgeSeconds < 90 ? `vor ${s.tickAgeSeconds} s` : `vor ${Math.round(s.tickAgeSeconds / 60)} min`;
  const counts = (Object.entries(s.jobs) as [JobStatus, number][]).filter(([k, n]) => n > 0 || k === 'READY' || k === 'WAITING');
  const body = `<p style="margin:4px 0 8px">${tag(s.state, tone)} <span class="muted">Letzter Takt ${e(tick)} · läuft auch bei ausgeschaltetem PC (Cloudflare)</span></p>
<ul style="margin:0 0 10px;padding-left:18px">${s.reasons.map((r) => `<li>${e(r)}</li>`).join('')}</ul>
${table([{ label: 'Jobs' }, { label: 'Anzahl', amount: true }], counts.map(([k, n]) => [e(JOB_LABEL[k]), String(n)]), 'Keine Jobs', 'Jobs nach Zustand')}
${table([{ label: 'Ausführungsumgebung' }, { label: 'Stand' }, { label: 'Kosten' }], s.environments.map((x) => [`<strong>${e(x.label)}</strong><span class="sub">${e(x.reason)}</span>`, tag(x.available ? 'Verfügbar' : 'Nicht verfügbar', x.available ? 'ok' : 'neutral'), e(x.cost)]), 'Keine Umgebungen', 'Ausführungsumgebungen')}
<p style="margin:10px 0 0"><a href="${e(withMode('/dashboard/einstellungen', pc.mode))}#autopilot">Stopp-Schalter</a> · <a href="/admin/autopilot.json">Rohdaten (JSON)</a></p>`;
  return panel({ id: 'leitstand', title: 'Autopilot-Leitstand', sub: 'Gemessen, nicht geschätzt: Takt, Warteschlange und Ausführungsumgebungen', body });
}

export function renderOverview(pc: PageCtx): string {
  const test = pc.mode === 'test';
  const now = pc.ctx.clock();
  const g = greeting(now);
  const f = financeView(pc.ctx, test);
  const dec = decisions(pc.ctx, test);
  const acts = activity(pc.ctx, test, 5);
  const orders = orderRows(pc.ctx, test, 5);
  const months = monthlyPaid(pc.ctx, test, now);
  const readiness = readinessSummary(pc.ctx);
  const ap = autopilotState(pc);
  const testOrders = test ? 0 : (pc.ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE test_mode = 1')?.n ?? 0);

  const liveNotice = !test && !f.hasSales
    ? `<div class="notice info" role="note">${icon('info', 'sm')}<span><strong>Noch keine Verkäufe im Echtbetrieb.</strong> Echte Verkäufe sind gesperrt, bis alle Live-Freigaben erteilt sind (${readiness.done} von ${readiness.total}). <a href="${withMode('/dashboard/einstellungen', pc.mode)}#freigaben">Freigaben ansehen</a>${testOrders ? ` · Im Testbetrieb gibt es ${testOrders} Testauftr${testOrders === 1 ? 'ag' : 'äge'}: <a href="${withMode('/dashboard', 'test')}">Testdaten ansehen</a>` : ''}</span></div>`
    : '';

  const metrics = `<section class="metrics" aria-label="Wichtigste Zahlen">
${metric({ id: 'paid', label: 'Kunden haben bezahlt', value: money(f.paidMinor, f.currency), sub: f.hasSales ? `Vom Zahlungsanbieter bestätigt${test ? ' · Testgeld' : ''} – noch kein Gewinn` : 'Noch keine bestätigten Verkäufe', icon: 'wallet' })}
${f.bankConnected
    ? metric({ id: 'bank', label: 'Auf Bank eingegangen', value: money(f.onBankMinor, f.currency), sub: 'Nur bankseitig bestätigte Eingänge', icon: 'bank', accent: true })
    : metric({ id: 'bank', label: 'Auf Bank eingegangen', value: 'Noch nicht verbunden', sub: 'Kein Bankeingang verifizierbar', icon: 'bank', text: true })}
${metric({ id: 'transit', label: 'Auszahlung unterwegs', value: money(f.inTransitMinor, f.currency), sub: 'Vom Anbieter gemeldet, nicht auf Bank bestätigt', icon: 'clock' })}
${metric({ id: 'decisions', label: 'Benötigt deine Entscheidung', value: String(dec.length), sub: dec.length ? 'Siehe „Braucht deinen Blick“' : 'Aktuell keine wichtigen Ausnahmen', icon: 'check' })}
</section>`;

  const max = Math.max(...months.map((m) => m.minor), 0);
  const chart = max === 0
    ? empty('Noch keine bezahlten Bestellungen', test ? 'Sobald Testzahlungen bestätigt sind, erscheint hier der Verlauf.' : 'Hier erscheint der Verlauf, sobald echte Zahlungen vom Zahlungsanbieter bestätigt wurden.', 'chart')
    : `<div class="bars" role="img" aria-label="Bezahlte Bestellungen der letzten 12 Monate: ${e(months.map((m) => `${m.label} ${money(m.minor, f.currency)}`).join(', '))}">${months.map((m, i) => `<span class="bar${m.minor === 0 ? ' zero' : ''}${i === months.length - 1 ? ' now' : ''}" style="height:${m.minor === 0 ? 2 : Math.max(4, Math.round((m.minor / max) * 100))}%"></span>`).join('')}</div>
<div class="months" aria-hidden="true">${months.map((m) => `<span>${e(m.label)}</span>`).join('')}</div>`;

  const feed = acts.length
    ? `<ul class="feed">${acts.map((a) => `<li><span class="badge${a.tone ? ` ${a.tone}` : ''}">${icon(a.icon, 'sm')}</span><div><h3>${e(a.title)}</h3><p>${e(a.text)}</p></div><span class="when"><time datetime="${e(a.at)}">${e(fmtWhen(a.at, now))}</time></span></li>`).join('')}</ul>`
    : empty('Noch keine Aktivitäten', test ? 'Im Testbetrieb ist noch nichts passiert.' : 'Hier erscheint, was dein Unternehmen im Hintergrund erledigt – sobald echte Vorgänge stattfinden.');

  const decisionsBody = dec.length
    ? `<ul class="feed">${dec.slice(0, 6).map((d) => `<li><span class="badge ${d.tone === 'bad' ? 'bad' : 'warn'}">${icon('alert', 'sm')}</span><div><h3><a href="${e(withMode(d.href, pc.mode))}">${e(d.title)}</a></h3><p>${e(d.text)}</p></div></li>`).join('')}</ul>`
    : empty('Keine offenen Punkte', 'Es gibt nichts, das deine Entscheidung braucht.', 'checkCircle');

  const ordersTable = table(
    [{ label: 'Auftrag' }, { label: 'Kunde' }, { label: 'Status' }, { label: 'Betrag', amount: true }],
    orders.map((o) => {
      const l = pipelineLabel(o.pipelineState);
      return [`<a href="${e(withMode(`/dashboard/auftraege/${o.orderId}`, pc.mode))}"><strong>${e(shortRef(o.orderId))}</strong></a><span class="sub">${e(o.title)}</span>`, e(o.customer), `${tag(l.text, l.tone)}<span class="sub">${e(paymentLabel(o.paymentState).text)} · ${e(fmtDate(o.createdAt))}</span>`, e(money(o.amountMinor, o.currency))];
    }),
    test ? 'Noch keine Testaufträge' : 'Noch keine Verkäufe',
    'Letzte Aufträge',
  );

  const daily = dailyReport(pc.ctx, test, dec.length);
  const dailyNotice = `<div class="notice flash" role="note">${icon('doc', 'sm')}<span><strong>Tagesbericht (letzte 24 Std.):</strong> ${e(daily.summary)}</span></div>`;
  const body = `${liveNotice}${dailyNotice}${metrics}
<div class="grid2">
${panel({ title: 'Wie dein Unternehmen läuft', sub: `Bezahlte Bestellungen der letzten 12 Monate${test ? ' · Testgeld' : ''}`, action: { href: withMode('/dashboard/berichte', pc.mode), label: 'Berichte' }, body: `${chart}<p class="muted" style="font-size:13px;margin:14px 0 0">Zahlungen zählen erst nach signierter Bestätigung des Zahlungsanbieters.</p>` })}
${panel({ title: 'Was gerade passiert', sub: 'Im Hintergrund, automatisch organisiert', action: { href: withMode('/dashboard/aktivitaeten', pc.mode), label: 'Alle' }, body: feed })}
</div>
<div class="grid2">
${panel({ title: 'Braucht deinen Blick', sub: 'Nur echte Ausnahmen – alles andere läuft automatisch', body: decisionsBody })}
${panel({ title: 'Dein Unternehmen arbeitet', sub: 'Status des Autopiloten', body: `<p style="margin:4px 0 8px">${tag(ap.text, ap.text === 'Pausiert' || ap.text === 'Prüfung erforderlich' ? 'pending' : ap.text === 'Freigegeben' ? 'ok' : 'neutral')}</p><p class="muted" style="margin:0">${e(ap.explain)}</p>
<p style="margin:14px 0 6px;font-weight:600">Live-Freigaben: ${readiness.done} von ${readiness.total}</p><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${readiness.total}" aria-valuenow="${readiness.done}" aria-label="Erteilte Live-Freigaben"><span style="width:${Math.round((readiness.done / Math.max(1, readiness.total)) * 100)}%"></span></div>
<p class="muted" style="font-size:13px;margin:10px 0 0">Zusätzliche Software-Fixkosten: <strong>0 €</strong> freigegeben. Kostenpflichtige Dienste sind technisch gesperrt.</p>
${explain('Der Echtbetrieb wird erst möglich, wenn du alle zwölf Live-Freigaben (Unternehmen, Steuer, Zahlungsanbieter, Rechtstexte, Datenschutz) mit Nachweis erteilt hast. Bis dahin laufen alle Abläufe nur mit Testzahlungen.')}` })}
</div>
${commandCenter(pc)}
${panel({ title: 'Letzte Aufträge', sub: 'Von der Bestellung bis zur Auszahlung – jederzeit nachvollziehbar', action: { href: withMode('/dashboard/auftraege', pc.mode), label: 'Alle Aufträge' }, body: ordersTable, flush: true })}`;

  return shell({
    title: 'Übersicht', eyebrow: 'Unternehmensübersicht', heading: 'Dein Geschäft. Klar im Blick.',
    lead: `${g.hello} Heute ist ${g.date}. Hier siehst du, was passiert ist, was wirklich bezahlt wurde und was auf deinem Konto angekommen ist.`,
    active: 'uebersicht', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch('/dashboard', pc.mode), body, systemTestMode: pc.ctx.config.testMode,
  });
}
