import { modulesWithStatus } from '../../../../packages/registry/src/status.ts';
import { getCapability, listCapabilities } from '../../../../services/product-factory/src/registry.ts';
import { acceptanceChecks, getStandard, standardGaps } from '../../../../services/product-factory/src/quality-standard.ts';
import { productLifecycle } from '../../../../services/finance/src/insights.ts';
import { e, explain, metric, modeSwitch, panel, shell, table, tag, withMode } from '../ui.ts';
import { statusTag } from './reports.ts';
import type { PageCtx } from './types.ts';

const CAPABILITY_TEXT: Record<string, { name: string; text: string }> = {
  'b2b-calc-csv': { name: 'Kalkulationstabelle (CSV)', text: 'Aus Positionen, Mengen und Preisen entsteht automatisch eine geprüfte, in Excel bearbeitbare Kalkulation mit Aufschlag und Summen.' },
  'b2b-calc-bundle': { name: 'Kalkulationspaket (Tabelle + PDF)', text: 'Beide Dateien in einem ZIP. Jede Datei wird mit der Prüfung ihrer eigenen Produktart kontrolliert; der Preis ergibt sich aus dem tatsächlichen Mehraufwand.' },
  'b2b-calc-pdf': { name: 'Kalkulation als PDF', text: 'Dieselbe Kalkulation als druckfertiges PDF. Geprüft werden Dateistruktur, Seitenzahl, Vollständigkeit aller Positionen und die nachgerechnete Summe.' },
};

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
${panel({ id: 'live-vorschau', title: 'Live-Vorschauen', sub: 'Jedes produzierte Kundenprodukt mit echtem Stand und echter Ansicht', action: { href: withMode('/dashboard/produkte/vorschau', pc.mode), label: 'Alle ansehen' }, body: `<p style="margin:4px 0 0">${pc.ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM artifacts WHERE test_mode = ?', pc.mode === 'test' ? 1 : 0)?.n ?? 0} produzierte Datei(en) in dieser Ansicht. Tabellen, PDFs und Pakete lassen sich direkt öffnen; Version, Prüfprotokoll und Lieferstatus stehen daneben.</p>` })}
${panel({ id: 'standard', title: 'Premium-Produktstandard', sub: 'Verkauft und geliefert wird nur, was alle Abnahmekriterien erfüllt', flush: true, body: `${table(
    [{ label: 'Produkt' }, { label: 'Zweck' }, { label: 'Abnahmekriterien' }, { label: 'Stand', full: true }],
    listCapabilities().filter((c) => c.enabled || getStandard(c.id)).map((c) => {
      const s = getStandard(c.id);
      const cap = getCapability(c.id);
      const gaps = cap ? standardGaps(cap) : ['unbekannt'];
      return [`<strong>${e(CAPABILITY_TEXT[c.id]?.name ?? c.id)}</strong>${s ? `<span class="sub"><a href="${e(s.deliverables.manualPath)}">Anleitung</a> · ${e(s.deliverables.formats.join(', ').toUpperCase())}</span>` : ''}`, e(s?.purpose ?? '–'), s ? `${acceptanceChecks(s).length} automatische Prüfungen<span class="sub">${e(s.references.map((r) => r.name).join(' · '))}</span>` : '–', gaps.length ? `${tag('Nicht verkaufbar', 'bad')}<span class="sub">${e(gaps.join('; '))}</span>` : tag('Standard erfüllt', 'ok')];
    }), 'Keine Produkte', 'Produktstandard')}${explain('Jede Zusage an den Kunden ist mit einer automatischen Prüfung belegt. Fehlt eine Prüfung oder schlägt sie wiederholt fehl, wird nichts ausgeliefert: Der Auftrag wird als nicht lieferfähig markiert, dir wird eine Erstattung zur Freigabe vorgeschlagen und der Kunde erhält eine ehrliche Nachricht.')}` })}
<div class="grid2 even">
${panel({ title: 'Qualität und Lizenzen', body: `<p style="margin:4px 0 8px">Jede Datei wird vor der Lieferung automatisch geprüft: Zeichenkodierung, Format, Summen, Schutz vor Formel-Einschleusung und Prüfsumme. Fällt eine Prüfung durch, wird nichts ausgeliefert.</p>
<p class="muted" style="margin:0">Zu jeder Datei wird gespeichert, wer sie erzeugt hat und welche Nutzungsrechte der Kunde erhält (eigene Arbeit, keine fremden Inhalte).</p>${explain('Der Lizenztext ist ein Entwurf und wird vor dem Echtbetrieb rechtlich geprüft (Live-Freigabe LA-09).')}` })}
${panel({ title: 'Neue Produktarten', body: `<p style="margin:4px 0 8px">Neue Produktarten werden erst freigeschaltet, wenn sie nachweislich automatisch, kostenlos und in geprüfter Qualität herstellbar sind.</p>
<p class="muted" style="margin:0">Video, 3D und Audio bleiben gesperrt, solange keine kostenlose, dauerhaft verfügbare Rechenleistung nachgewiesen ist.</p>` })}
</div>
${panel({ title: 'Geplante Funktionen in diesem Bereich', sub: 'Ehrlicher Stand aus dem Funktionskatalog (147 freigegebene Funktionen)', flush: true, body: table(
    [{ label: 'Nr.' }, { label: 'Funktion' }, { label: 'Stand' }],
    roadmap.map((m) => [String(m.n).padStart(3, '0'), `<strong>${e(m.titleDe)}</strong><span class="sub">${e(m.umgesetzt ?? m.offen ?? '')}</span>`, statusTag(m.status)]),
    'Keine Funktionen', 'Funktionen Produkte') })}`;
  return shell({ title: 'Produkte', eyebrow: 'Produkte', heading: 'Deine Produkte', lead: 'Alle digitalen Produkte – klar beschrieben, geprüft und mit geklärten Nutzungsrechten.', active: 'produkte', mode: pc.mode, csrf: pc.csrf, path: pc.path, flash: pc.flash, heroAside: modeSwitch('/dashboard/produkte', pc.mode), body, systemTestMode: pc.ctx.config.testMode });
}
