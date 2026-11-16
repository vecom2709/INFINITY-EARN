import { REGISTRY } from '../../../../packages/registry/src/registry.ts';
import { modulesWithStatus } from '../../../../packages/registry/src/status.ts';
import { activeRelease } from '../../../../services/core-api/src/releases.ts';
import { getCapability, listCapabilities } from '../../../../services/product-factory/src/registry.ts';
import { acceptanceChecks, getStandard, standardGaps } from '../../../../services/product-factory/src/quality-standard.ts';
import { KIND_INFO, listRebuildRequests } from '../../../../services/core-api/src/rebuild-requests.ts';
import { productLifecycle } from '../../../../services/finance/src/insights.ts';
import { e, explain, metric, modeSwitch, panel, shell, table, tag, withMode } from '../ui.ts';
import { statusTag } from './reports.ts';
import type { PageCtx } from './types.ts';

const CAPABILITY_TEXT: Record<string, { name: string; text: string }> = {
  'b2b-calc-xlsx': { name: 'Kalkulation als Excel-Datei (XLSX)', text: 'Echte Excel-Arbeitsmappe mit lebenden Formeln: Ändert der Kunde Menge, Preis oder Aufschlag, rechnet die Datei neu. Die Formeln prüft unsere eigene Rechenmaschine bei jeder Herstellung.' },
  'b2b-calc-csv': { name: 'Kalkulationstabelle (CSV)', text: 'Aus Positionen, Mengen und Preisen entsteht automatisch eine geprüfte, in Excel bearbeitbare Kalkulation mit Aufschlag und Summen.' },
  'b2b-calc-bundle': { name: 'Kalkulationspaket (Tabelle + PDF)', text: 'Beide Dateien in einem ZIP. Jede Datei wird mit der Prüfung ihrer eigenen Produktart kontrolliert; der Preis ergibt sich aus dem tatsächlichen Mehraufwand.' },
  'mini-ww': { name: 'Mini-Warenwirtschaft (Offline-Programm)', text: 'Programm im Design des Kunden mit bebilderter Bedienungsanleitung (PDF) als ZIP. Vorschau und Verkaufsfreigabe: /dashboard/produkte/mini-ww' },
  'b2b-calc-pdf': { name: 'Kalkulation als PDF', text: 'Dieselbe Kalkulation als druckfertiges PDF. Geprüft werden Dateistruktur, Seitenzahl, Vollständigkeit aller Positionen und die nachgerechnete Summe.' },
};

/** Anfragen „Programm nach Vorlage“: jede wartet auf die Entscheidung des Eigentümers. Hergestellt wird auf dem eigenen PC mit REA. */
function rebuildPanel(pc: PageCtx): string {
  const rows = listRebuildRequests(pc.ctx, pc.mode === 'test');
  const back = withMode('/dashboard/produkte', pc.mode) + '#programm-nach-vorlage';
  const STATE: Record<string, [string, 'ok' | 'bad' | 'neutral']> = { OWNER_APPROVAL_REQUIRED: ['Wartet auf dich', 'neutral'], ACCEPTED: ['Angenommen', 'ok'], DECLINED: ['Abgelehnt', 'bad'] };
  const decide = (id: string): string => `<form class="action" method="post" action="/admin/programm-nach-vorlage/${e(id)}/entscheiden" style="display:grid;gap:6px;max-width:520px"><input type="hidden" name="_csrf" value="${e(pc.csrf)}"><input type="hidden" name="_back" value="${e(back)}"><label for="n-${e(id)}">Hinweis an den Kunden (bei Ablehnung Pflicht)</label><input id="n-${e(id)}" type="text" name="notiz" maxlength="1000"><span><button class="btn" type="submit" name="entscheidung" value="annehmen">Annehmen</button> <button class="btn danger" type="submit" name="entscheidung" value="ablehnen">Ablehnen</button></span><span class="what">Annehmen ist keine Preiszusage und startet keine Herstellung. Der Kunde sieht nur den neuen Stand.</span></form>`;
  return panel({ id: 'programm-nach-vorlage', title: 'Programm nach Vorlage (mit REA)', sub: 'Kunden lassen ein vorhandenes Programm untersuchen und neu bauen – nur mit Rechte-Erklärung und deiner Entscheidung je Anfrage', action: { href: '/programm-nach-vorlage', label: 'Kundenformular ansehen' }, flush: true, body: `<p style="margin:4px 16px 12px">Hergestellt wird nicht automatisch: Die Untersuchung läuft in einer Claude-Sitzung auf deinem PC mit dem Werkzeug REA. Prüfe bei jeder Anfrage, ob die Berechtigung glaubhaft ist – Programme fremder Hersteller ohne Erlaubnis lehnst du ab.</p>${table(
    [{ label: 'Anfrage' }, { label: 'Berechtigung' }, { label: 'Stand' }, { label: 'Entscheidung', full: true }],
    rows.map((r) => [
      `<strong>${e(r.program_name)}</strong><span class="sub">${e(r.company)} · ${e(r.contact_email)} · ${e(r.created_at.slice(0, 10))}</span><span class="sub">${e(KIND_INFO[r.program_kind].label)}${KIND_INFO[r.program_kind].analysable ? '' : ' – derzeit nicht analysierbar'}</span><span class="sub">${e(r.description.slice(0, 300))}</span>`,
      `${e(r.rights_basis === 'OWN_SOFTWARE' ? 'Eigene Software' : 'Lizenz erlaubt Analyse')}<span class="sub">${e(r.rights_detail)}</span><span class="sub">Erklärung vom ${e(r.rights_confirmed_at.slice(0, 10))}, Fassung ${e(r.rights_text_version)}</span>`,
      tag(STATE[r.state]?.[0] ?? r.state, STATE[r.state]?.[1] ?? 'neutral'),
      r.state === 'OWNER_APPROVAL_REQUIRED' ? decide(r.request_id) : `${e(r.decided_at?.slice(0, 10) ?? '')}${r.owner_note ? `<span class="sub">${e(r.owner_note)}</span>` : ''}`,
    ]),
    'Noch keine Anfragen', 'Programm nach Vorlage')}` });
}

export function renderProducts(pc: PageCtx): string {
  const t = pc.mode === 'test' ? 1 : 0;
  const caps = listCapabilities();
  const qa = pc.ctx.db.get<{ passed: number; failed: number }>(
    'SELECT COALESCE(SUM(q.passed), 0) AS passed, COALESCE(SUM(1 - q.passed), 0) AS failed FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.test_mode = ?', t,
  ) ?? { passed: 0, failed: 0 };
  const delivered = pc.ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliveries WHERE test_mode = ? AND revoked_at IS NULL', t)?.n ?? 0;
  const quarantined = pc.ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM artifacts WHERE test_mode = ? AND quarantined_at IS NOT NULL', t)?.n ?? 0;
  const roadmap = modulesWithStatus().filter((m) => m.area === 'produkte');

  const body = `<section class="metrics" aria-label="Produktkennzahlen">
${metric({ label: 'Aktive Produktarten', value: String(caps.filter((c) => c.enabled).length), sub: 'Nur nachweislich automatisch herstellbar', icon: 'package' })}
${metric({ label: 'Qualitätsprüfungen bestanden', value: String(qa.passed), sub: qa.failed ? `${qa.failed} nicht bestanden – nicht ausgeliefert` : 'Keine fehlgeschlagene Prüfung', icon: 'checkCircle' })}
${metric({ label: 'Ausgelieferte Produkte', value: String(delivered), sub: 'Mit Prüfprotokoll und Prüfsumme', icon: 'download' })}
${metric({ label: 'Gesperrte Dateien', value: String(quarantined), sub: quarantined ? 'Wegen Integritätsproblem zurückgehalten' : 'Keine', icon: 'shield' })}
</section>
${panel({ title: 'Aktive Angebote', sub: 'Was dein Unternehmen heute tatsächlich herstellen und liefern kann', flush: true, body: table(
    [{ label: 'Produkt' }, { label: 'Status' }, { label: 'Beschreibung', full: true }],
    caps.map((c) => [`<strong>${e(CAPABILITY_TEXT[c.id]?.name ?? c.id)}</strong><span class="sub">Version ${c.version}</span>`, c.enabled ? tag('Aktiv', 'ok') : tag('Deaktiviert', 'neutral'), e(c.enabled ? (CAPABILITY_TEXT[c.id]?.text ?? '') : (c.disabled_reason ?? ''))]),
    'Keine Produktarten', 'Produktarten') })}
${panel({ title: 'Lebenszyklus deiner Produkte', sub: 'Aus echten Lieferungen, Prüfungen und Mangelmeldungen – Empfehlung, keine automatische Änderung', flush: true, body: table(
    [{ label: 'Produkt' }, { label: 'Lieferungen' }, { label: 'Probleme' }, { label: 'Einschätzung', full: true }],
    productLifecycle(pc.ctx, pc.mode === 'test', caps).map((r) => [`<strong>${e(CAPABILITY_TEXT[r.product]?.name ?? r.product)}</strong><span class="sub">Version ${r.version}${r.lastSale ? ` · zuletzt verkauft ${e(r.lastSale.slice(0, 10))}` : ''}</span>`, String(r.delivered), `${r.qaFailed} Prüffehler · ${r.defects} Mängel`, `${tag(r.status, r.status === 'prüfen' ? 'bad' : r.status === 'stabil' ? 'ok' : 'neutral')}<span class="sub">${e(r.reason)}</span>`]),
    'Keine aktiven Produkte', 'Lebenszyklus') })}
${panel({ id: 'fachsoftware', title: 'Fachsoftware: Warenwirtschaft', sub: activeRelease(pc.ctx, 'mini-ww') ? 'Zum Verkauf freigegeben' : 'Fertig gebaut und geprüft – Verkauf wartet auf deine Freigabe', action: { href: '/dashboard/produkte/mini-ww', label: 'Vorschau und Freigabe' }, body: '<p style="margin:4px 0 0">Programm ausprobieren, bebilderte Anleitung und Musterpaket ansehen, Abnahmeprüfung live ausführen und Festpreis festlegen.</p>' })}
${panel({ id: 'excel-muster', title: 'Excel-Kalkulation mit Formeln', sub: 'Echte Arbeitsmappe (XLSX) – Formeln bei jeder Herstellung nachgerechnet', action: { href: '/admin/muster/b2b-calc-xlsx/muster.xlsx', label: 'Muster herunterladen' }, body: '<p style="margin:4px 0 0">Zum Ausprobieren in Excel: Menge, Preis oder Aufschlag ändern – die Summen rechnen neu. Bestellbar wird die Produktart erst, wenn du sie in deinen erlaubten Produktarten freigibst.</p>' })}
${panel({ id: 'windows-programm', title: 'Windows-Programm: Lager & Rechnung', sub: 'Gebaut und auf Windows getestet – Verkauf gesperrt, bis die offenen Punkte erledigt sind', action: { href: '/dashboard/produkte/win-lager', label: 'Anleitung und Freigabe-Akte' }, body: '<p style="margin:4px 0 0">Bebilderte Anleitung in drei Sprachen ansehen und prüfen, was bis zur Verkaufsfreigabe noch fehlt.</p>' })}
${rebuildPanel(pc)}
${panel({ id: 'live-vorschau', title: 'Live-Vorschauen', sub: 'Jedes produzierte Kundenprodukt mit echtem Stand und echter Ansicht', action: { href: withMode('/dashboard/produkte/vorschau', pc.mode), label: 'Alle ansehen' }, body: `<p style="margin:4px 0 0">${pc.ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM artifacts WHERE test_mode = ?', pc.mode === 'test' ? 1 : 0)?.n ?? 0} produzierte Datei(en) in dieser Ansicht. Tabellen, PDFs und Pakete lassen sich direkt öffnen; Version, Prüfprotokoll und Lieferstatus stehen daneben.</p>` })}
${panel({ id: 'standard', title: 'Premium-Produktstandard', sub: 'Verkauft und geliefert wird nur, was alle Abnahmekriterien erfüllt', flush: true, body: `${table(
    [{ label: 'Produkt' }, { label: 'Zweck' }, { label: 'Abnahmekriterien' }, { label: 'Stand', full: true }],
    listCapabilities().filter((c) => c.enabled || getStandard(c.id)).map((c) => {
      const s = getStandard(c.id);
      const cap = getCapability(c.id);
      const gaps = cap ? standardGaps(cap) : ['unbekannt'];
      return [`<strong>${e(CAPABILITY_TEXT[c.id]?.name ?? c.id)}</strong>${s ? `<span class="sub"><a href="${e(s.deliverables.manualPath)}">Anleitung</a> · ${e(s.deliverables.formats.join(', ').toUpperCase())}</span>` : ''}`, e(s?.purpose ?? '–'), s ? `${acceptanceChecks(s).length} automatische Prüfungen<span class="sub">${e(s.references.map((r) => r.name).join(' · '))}</span>` : '–', gaps.length ? `${tag('Nicht verkaufbar', 'bad')}<span class="sub">${e(gaps.join('; '))}</span>` : !c.enabled ? `${tag('Akte vollständig – Verkauf gesperrt', 'neutral')}<span class="sub">${e(c.disabled_reason ?? '')}</span>` : tag('Standard erfüllt', 'ok')];
    }), 'Keine Produkte', 'Produktstandard')}${explain('Jede Zusage an den Kunden ist mit einer automatischen Prüfung belegt. Fehlt eine Prüfung oder schlägt sie wiederholt fehl, wird nichts ausgeliefert: Der Auftrag wird als nicht lieferfähig markiert, dir wird eine Erstattung zur Freigabe vorgeschlagen und der Kunde erhält eine ehrliche Nachricht.')}` })}
<div class="grid2 even">
${panel({ title: 'Qualität und Lizenzen', body: `<p style="margin:4px 0 8px">Jede Datei wird vor der Lieferung automatisch geprüft: Zeichenkodierung, Format, Summen, Schutz vor Formel-Einschleusung und Prüfsumme. Fällt eine Prüfung durch, wird nichts ausgeliefert.</p>
<p class="muted" style="margin:0">Zu jeder Datei wird gespeichert, wer sie erzeugt hat und welche Nutzungsrechte der Kunde erhält (eigene Arbeit, keine fremden Inhalte).</p>${explain('Der Lizenztext ist ein Entwurf und wird vor dem Echtbetrieb rechtlich geprüft (Live-Freigabe LA-09).')}` })}
${panel({ title: 'Neue Produktarten', body: `<p style="margin:4px 0 8px">Neue Produktarten werden erst freigeschaltet, wenn sie nachweislich automatisch, kostenlos und in geprüfter Qualität herstellbar sind.</p>
<p class="muted" style="margin:0">Video, 3D und Audio bleiben gesperrt, solange keine kostenlose, dauerhaft verfügbare Rechenleistung nachgewiesen ist.</p>` })}
</div>
${panel({ title: 'Geplante Funktionen in diesem Bereich', sub: `Ehrlicher Stand aus dem Funktionskatalog (${REGISTRY.modules.length} freigegebene Funktionen)`, flush: true, body: table(
    [{ label: 'Nr.' }, { label: 'Funktion' }, { label: 'Stand' }],
    roadmap.map((m) => [String(m.n).padStart(3, '0'), `<strong>${e(m.titleDe)}</strong><span class="sub">${e(m.umgesetzt ?? m.offen ?? '')}</span>`, statusTag(m.status)]),
    'Keine Funktionen', 'Funktionen Produkte') })}`;
  return shell({ title: 'Produkte', eyebrow: 'Produkte', heading: 'Deine Produkte', lead: 'Alle digitalen Produkte – klar beschrieben, geprüft und mit geklärten Nutzungsrechten.', active: 'produkte', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch('/dashboard/produkte', pc.mode), body, systemTestMode: pc.ctx.config.testMode });
}
