import type { ProductCapability, QaCheckResult } from './types.ts';

/**
 * Verbindlicher Premium-Produktstandard (15.0). Jede verkaufbare Produktart braucht eine vollständige Standard-Akte:
 *  1 Zweck, Zielgruppe, Arbeitsabläufe   2 Referenzen (anerkannte Normen/Programme) → abgeleitete Anforderungen
 *  3 Gestaltungsregeln                    5 zugesagte Funktionen – jede mit einer automatischen Prüfung belegt
 *  7/8 getestete Benutzerabläufe, Barrierefreiheit/Sicherheit   11/12 Anleitung, Formate, Dokumentation
 * Ohne vollständige Akte ist die Produktart NICHT verkaufbar (routeCapability). Bei jeder Lieferung müssen alle
 * Abnahmekriterien vorhanden UND bestanden sein (acceptanceGate) – eine fehlende Prüfung zählt als nicht bestanden.
 * Erfundene Funktionen sind ausgeschlossen: Eine Zusage ohne zugeordnete, tatsächlich ausgeführte Prüfung gilt als Lücke.
 */
export interface Verified { text: string; verifiedBy: string }

export interface ProductStandard {
  capabilityId: string;
  purpose: string;
  audience: string;
  workflows: string[];
  references: { name: string; requirement: string }[];
  design: Verified[];
  features: Verified[];
  accessibilityAndSecurity: Verified[];
  /** manualPath: Hilfeseite (/hilfe/…) oder – bei Software mit Anleitung im Lieferpaket – die Musteranleitung im Admin; manualInPackage: Dateiname im Paket */
  deliverables: { formats: string[]; manualPath: string; manualInPackage?: string; documentation: string[] };
  userFlowTests: string[];
  notDeliverableWhen: string[];
}

const calcCommon = {
  audience: 'Handwerksbetriebe, Agenturen, Einkauf und Vertrieb kleiner Unternehmen (B2B), die Angebote oder Kosten nachvollziehbar aufstellen müssen.',
  workflows: ['Positionen mit Menge und Einzelpreis erfassen', 'Aufschlag festlegen', 'Ergebnis prüfen und an eigene Kunden oder die Buchhaltung weitergeben'],
  notDeliverableWhen: ['Mehr Positionen als die Kapazitätsgrenze', 'Automatische Prüfung schlägt nach der Wiederholung weiterhin fehl', 'Wunsch liegt außerhalb einer Kalkulation (z. B. Gestaltung, Software)'],
};

const STANDARDS: ProductStandard[] = [
  {
    capabilityId: 'b2b-calc-csv',
    purpose: 'Eine fehlerfreie, sofort weiterverarbeitbare Kalkulationstabelle, deren Summen nachgerechnet sind.',
    ...calcCommon,
    references: [
      { name: 'RFC 4180 (CSV)', requirement: 'Einheitliche Spalten, korrektes Quoting, eine Kopfzeile' },
      { name: 'Import in Excel und LibreOffice Calc', requirement: 'UTF-8, keine Formeln, die beim Öffnen ausgeführt werden (CSV-Injection)' },
    ],
    design: [{ text: 'Klare Struktur: Titel, Spaltenkopf, je Position eine Zeile, Summenblock am Ende', verifiedBy: 'format' }],
    features: [
      { text: 'Alle Positionen mit Menge × Einzelpreis', verifiedBy: 'format' },
      { text: 'Zwischensumme, Aufschlag und Gesamt korrekt nachgerechnet', verifiedBy: 'totals' },
      { text: 'Lesbar in gängigen Tabellenprogrammen (UTF-8)', verifiedBy: 'encoding' },
      { text: 'Unverändert ausgeliefert (Prüfsumme)', verifiedBy: 'checksum' },
    ],
    accessibilityAndSecurity: [{ text: 'Keine ausführbaren Formeln in Zellen', verifiedBy: 'formula_injection' }],
    deliverables: { formats: ['csv'], manualPath: '/hilfe/b2b-calc-csv', documentation: ['Anleitung im Kundenportal', 'Herkunftsnachweis /pruefen/<sha>', 'Rechnung'] },
    userFlowTests: ['tests/integration/production.test.ts', 'tests/e2e/pilot.test.ts', 'tests/integration/quality-standard.test.ts'],
  },
  {
    capabilityId: 'b2b-calc-pdf',
    purpose: 'Ein druckfertiges, seriös gestaltetes Kalkulationsdokument zum Weitergeben, mit nachgerechneten Summen.',
    ...calcCommon,
    references: [
      { name: 'PDF 1.4 (ISO 32000-Vorläufer)', requirement: 'Gültige Struktur, in jedem Standard-Reader zu öffnen, keine Skripte' },
      { name: 'Gängige Angebotsvorlagen in Buchhaltungsprogrammen', requirement: 'Titel oben, Positionen mit Menge und Preis, Summenblock, Hinweis zur Umsatzsteuer' },
    ],
    design: [
      { text: 'Titel als Überschrift, Netto-Hinweis und Herkunftsfußzeile gesetzt', verifiedBy: 'layout' },
      { text: 'Höchstens 20 Seiten, sauberer Umbruch', verifiedBy: 'pages' },
    ],
    features: [
      { text: 'Jede Position im Dokument enthalten', verifiedBy: 'items_complete' },
      { text: 'Gesamtsumme korrekt', verifiedBy: 'totals' },
      { text: 'Öffnet in jedem PDF-Reader', verifiedBy: 'pdf_structure' },
      { text: 'Unverändert ausgeliefert (Prüfsumme)', verifiedBy: 'checksum' },
    ],
    accessibilityAndSecurity: [{ text: 'Nur Standardschrift und Text, keine aktiven Inhalte', verifiedBy: 'encoding' }],
    deliverables: { formats: ['pdf'], manualPath: '/hilfe/b2b-calc-pdf', documentation: ['Anleitung im Kundenportal', 'Herkunftsnachweis /pruefen/<sha>', 'Rechnung'] },
    userFlowTests: ['tests/integration/m2-product-pdf.test.ts', 'tests/integration/quality-standard.test.ts'],
  },
  {
    capabilityId: 'b2b-calc-bundle',
    purpose: 'Tabelle und PDF derselben Kalkulation in einem Paket – zum Weiterrechnen und zum Weitergeben.',
    ...calcCommon,
    references: [{ name: 'ZIP-Format (PKWARE APPNOTE)', requirement: 'Mit Bordmitteln von Windows, macOS und Linux zu öffnen, CRC32 korrekt' }],
    design: [{ text: 'Genau zwei klar benannte Dateien im Paket', verifiedBy: 'zip_structure' }],
    features: [
      { text: 'Enthaltene Tabelle besteht alle Tabellenprüfungen', verifiedBy: 'csv_qa' },
      { text: 'Enthaltenes PDF besteht alle PDF-Prüfungen einschließlich Gestaltung', verifiedBy: 'pdf_qa' },
      { text: 'Unverändert ausgeliefert (Prüfsumme)', verifiedBy: 'checksum' },
    ],
    accessibilityAndSecurity: [{ text: 'Keine ausführbaren Dateien im Paket', verifiedBy: 'zip_structure' }],
    deliverables: { formats: ['zip', 'csv', 'pdf'], manualPath: '/hilfe/b2b-calc-bundle', documentation: ['Anleitung im Kundenportal', 'Herkunftsnachweis /pruefen/<sha>', 'Rechnung'] },
    userFlowTests: ['tests/integration/bundle-change-help.test.ts', 'tests/integration/quality-standard.test.ts'],
  },
  {
    capabilityId: 'mini-ww',
    purpose: 'Eine sofort nutzbare, offline laufende Warenwirtschaft im Design des Kunden: Artikel, Lager, Kunden, Angebote, Aufträge, Lieferungen, Rechnungen, Zahlungen, Gutschriften, Berichte und Datensicherung.',
    audience: 'Kleine Handels- und Handwerksbetriebe (1–5 Arbeitsplätze, ein Gerät je Bestand), die heute mit Tabellen oder Papier arbeiten.',
    workflows: ['Artikel anlegen und Wareneingang buchen', 'Angebot erstellen, festschreiben, annehmen', 'Auftrag liefern (auch teilweise)', 'Rechnung aus Lieferungen erstellen, festschreiben, Zahlung erfassen', 'Gutschrift mit Rückbuchung ins Lager', 'Berichte, Sicherung, CSV-Austausch'],
    references: [
      { name: 'GoBD-Grundsätze (Nachvollziehbarkeit, Unveränderbarkeit) – Orientierung, keine Zertifizierung', requirement: 'Festgeschriebene Belege unveränderbar, fortlaufende Nummernkreise ohne Lücken, Protokoll jeder Änderung, Storno nur per Gutschrift' },
      { name: 'Gängige Warenwirtschaften für Kleinbetriebe (Angebot → Auftrag → Lieferschein → Rechnung)', requirement: 'Belegkette mit Reservierung, Teillieferung, Rechnung nur aus Lieferungen, offene Posten und Mahnstufen' },
      { name: 'WCAG 2.1 AA', requirement: 'Kontrast mindestens 4,5:1 auch mit Kundenfarbe, jedes Feld beschriftet, bedienbar per Tastatur' },
      { name: 'Content Security Policy (W3C)', requirement: 'Keine Netzwerkverbindungen, keine fremden Skripte – Geschäftsdaten verlassen den Rechner nicht' },
    ],
    design: [
      { text: 'Firmenname, Farbe (automatisch auf AA-Kontrast angepasst), Logo und Sprache des Kunden', verifiedBy: 'branding' },
      { text: 'Keine funktionslosen Schaltflächen, jedes Feld beschriftet – auf allen Seiten und in beiden Rollen', verifiedBy: 'ui_actions' },
    ],
    features: [
      { text: 'Vollständiger Ablauf Angebot → Auftrag → Lieferung → Rechnung → Zahlung mit den Steuersätzen, Nummernkreisen und dem Zahlungsziel des Kunden', verifiedBy: 'domain_selftest' },
      { text: 'Ausgeliefert wird genau die gebaute und getestete Programmfassung', verifiedBy: 'program_integrity' },
      { text: 'Bebilderte Bedienungsanleitung (PDF) mit echten Screenshots, ein Kapitel je Arbeitsablauf, in der Sprache des Kunden', verifiedBy: 'manual_pdf' },
      { text: 'Paket mit Programm, Anleitung und LIESMICH samt Prüfsummen', verifiedBy: 'zip_structure' },
      { text: 'LIESMICH erklärt den Start; Prüfsummen stimmen', verifiedBy: 'readme' },
      { text: 'Unverändert ausgeliefert (Prüfsumme)', verifiedBy: 'checksum' },
    ],
    accessibilityAndSecurity: [{ text: 'Kein Netzwerkzugriff möglich (CSP default-src none, keine externen Quellen)', verifiedBy: 'no_network' }],
    deliverables: { formats: ['zip', 'html', 'pdf'], manualPath: '/admin/muster/mini-ww/anleitung.pdf', manualInPackage: 'bedienungsanleitung.pdf', documentation: ['Bebilderte Bedienungsanleitung im Paket', 'LIESMICH.txt mit Prüfsummen', 'Herkunftsnachweis /pruefen/<sha>', 'Rechnung'] },
    userFlowTests: ['tests/products/mini-ww/domain.test.ts', 'tests/products/mini-ww/ui.test.ts', 'tests/products/mini-ww/factory.test.ts'],
    notDeliverableWhen: ['Wunsch nach Mehrplatz-/Serverbetrieb, Online-Shop-Anbindung oder E-Rechnung (XRechnung/FatturaPA) – nicht Teil dieser Produktart', 'Automatische Prüfung schlägt nach der Wiederholung weiterhin fehl', 'Logo nicht als PNG/JPEG/WebP bis 200 KB lieferbar'],
  },
];

const BY_ID = new Map(STANDARDS.map((s) => [s.capabilityId, s]));

export function getStandard(capabilityId: string): ProductStandard | undefined {
  return BY_ID.get(capabilityId);
}

export function listStandards(): readonly ProductStandard[] {
  return STANDARDS;
}

/** Abnahmekriterien = alle Prüfungen, mit denen Gestaltung, Funktionen und Sicherheit belegt sind. */
export function acceptanceChecks(s: ProductStandard): string[] {
  return [...new Set([...s.design, ...s.features, ...s.accessibilityAndSecurity].map((v) => v.verifiedBy))];
}

/** Lücken der Standard-Akte. Leer = verkaufbar. */
export function standardGaps(cap: ProductCapability, s: ProductStandard | undefined = getStandard(cap.capability_id)): string[] {
  if (!s) return ['Keine Standard-Akte (Zweck, Referenzen, Gestaltung, Funktionen, Abnahme)'];
  const gaps: string[] = [];
  if (!s.purpose.trim() || !s.audience.trim() || s.workflows.length === 0) gaps.push('Zweck, Zielgruppe oder Arbeitsabläufe fehlen');
  if (s.references.length === 0) gaps.push('Keine Referenzen, aus denen Anforderungen abgeleitet sind');
  if (s.design.length === 0) gaps.push('Keine geprüften Gestaltungsregeln');
  if (s.features.length === 0) gaps.push('Keine zugesagten Funktionen');
  for (const v of [...s.design, ...s.features, ...s.accessibilityAndSecurity]) {
    if (!cap.qa_suite.includes(v.verifiedBy)) gaps.push(`Zusage ohne Prüfung: „${v.text}“ (${v.verifiedBy})`);
  }
  if (!s.deliverables.formats.includes(cap.output_schema.extension)) gaps.push(`Lieferformat ${cap.output_schema.extension} nicht in der Akte`);
  const manualOk = s.deliverables.manualPath.startsWith('/hilfe/') || (!!s.deliverables.manualInPackage && s.deliverables.manualPath.startsWith('/admin/muster/') && s.deliverables.formats.includes('pdf'));
  if (!manualOk) gaps.push('Keine Bedienungsanleitung');
  if (s.userFlowTests.length === 0) gaps.push('Keine getesteten Benutzerabläufe');
  if (s.notDeliverableWhen.length === 0) gaps.push('Keine Kriterien für „nicht lieferfähig“');
  return gaps;
}

/** Abnahme je Lieferung: jedes Kriterium muss ausgeführt UND bestanden sein. */
export function acceptanceGate(capabilityId: string, checks: readonly QaCheckResult[]): QaCheckResult {
  const s = getStandard(capabilityId);
  if (!s) return { check: 'standard_acceptance', passed: false, detail: 'Keine Standard-Akte' };
  const failed = acceptanceChecks(s).filter((name) => !checks.some((c) => c.check === name && c.passed));
  return { check: 'standard_acceptance', passed: failed.length === 0, detail: failed.length ? `nicht erfüllt: ${failed.join(', ')}` : `${acceptanceChecks(s).length} Abnahmekriterien erfüllt` };
}
