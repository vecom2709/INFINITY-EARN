import { UI_STRINGS } from './generated/manual-assets.ts';
import { buildWinManual, type WinLang } from './manual.ts';

/**
 * Freigabe-Akte „Lager & Rechnung für Windows“ (Funktion 157/158). Die Verkaufsfreigabe ist Sache des Eigentümers;
 * diese Akte sagt ehrlich, was belegt ist und was noch fehlt. Solange ein Punkt „blockiert“ ist, gibt es keinen
 * Freigabeknopf – die Produktart ist nicht im Produktkatalog und nicht bestellbar.
 *
 * Status: PASS (belegt) · BLOCKED (sperrt den Verkauf) · OWNER (Entscheidung des Eigentümers) · OPEN (offen, sperrt nicht).
 * live = true: wird bei jedem Öffnen der Admin-Seite echt geprüft (nicht nur behauptet).
 */
export type GateStatus = 'PASS' | 'BLOCKED' | 'OWNER' | 'OPEN';
export interface ReleaseGate { id: string; title: string; status: GateStatus; live: boolean; evidence: string; next?: string }

/** Echte Prüfung der Anleitung: je Sprache bauen, Seiten/Abbildungen zählen. */
export function manualCheck(): { ok: boolean; detail: string } {
  const parts: string[] = [];
  let ok = true;
  for (const lang of ['de', 'it', 'en'] as WinLang[]) {
    try {
      const r = buildWinManual({ company: 'Musterfirma', color: '#1F5FA8', lang, country: lang === 'it' ? 'IT' : 'DE', productId: 'win-lager', version: '1.0.0', created: new Date('2026-11-13T00:00:00Z') });
      const good = r.meta.images === 3 && r.meta.pages >= 6 && r.meta.chapters.length === 8;
      ok &&= good;
      parts.push(`${lang.toUpperCase()}: ${r.meta.pages} Seiten, ${r.meta.images} Abbildungen, ${Math.round(r.bytes.length / 1024)} KB`);
    } catch (err) {
      ok = false;
      parts.push(`${lang.toUpperCase()}: Fehler ${(err as Error).message}`);
    }
  }
  return { ok, detail: parts.join(' · ') };
}

/** Echte Prüfung der Programmtexte: jeder Text in allen drei Sprachen vorhanden. */
export function textsCheck(): { ok: boolean; detail: string } {
  const keys = Object.keys(UI_STRINGS.de);
  const missing = keys.filter((k) => !UI_STRINGS.it[k] || !UI_STRINGS.en[k]);
  return { ok: missing.length === 0 && keys.length > 50, detail: missing.length ? `Fehlt: ${missing.join(', ')}` : `${keys.length} Texte je Sprache (Oberfläche, Meldungen der Fachregeln)` };
}

export function winReleaseGates(): ReleaseGate[] {
  const manual = manualCheck();
  const texts = textsCheck();
  return [
    { id: 'build', title: 'Programm und Installer gebaut, 12 Fachtests', status: 'PASS', live: false, evidence: 'Windows-eigener C#-Compiler, ohne Downloads. Ohne bestandene Fachtests entsteht kein Installer. Nachweis: GitHub-Prüflauf, Job „windows-program“.' },
    { id: 'install', title: 'Echter Installationstest auf Windows', status: 'PASS', live: false, evidence: 'Windows 11 (dieser Rechner) und Windows Server (GitHub CI): Installation, Start, Daten über Neustart, gleichzeitige Zugriffe, Update mit Daten, laufendes Programm, Deinstallation ohne fremde Dateien.' },
    { id: 'manual', title: 'Bebilderte Anleitung DE/IT/EN', status: manual.ok ? 'PASS' : 'BLOCKED', live: true, evidence: manual.detail, next: manual.ok ? undefined : 'Anleitung neu erzeugen: node scripts/build-win-lager-assets.ts' },
    { id: 'texts', title: 'Oberfläche, Meldungen und Installer in DE/IT/EN', status: texts.ok ? 'PASS' : 'BLOCKED', live: true, evidence: texts.detail },
    { id: 'legal-invoice', title: 'Rechnungen rechtlich vollständig', status: 'BLOCKED', live: false,
      evidence: 'Die Rechnung enthält Firma, Kunde, Nummer, Datum, Positionen und Steuer. Es fehlen Pflichtangaben wie Anschrift des Verkäufers und des Kunden, Steuernummer oder USt-IdNr. und Leistungsdatum (Deutschland: § 14 UStG). In Italien gelten Rechnungen nur als elektronische Rechnung (FatturaPA) über das SdI.',
      next: 'Entscheidung: Pflichtangaben und FatturaPA-Export ergänzen, oder das Programm nur als Lager mit Lieferschein/Beleg ohne Rechnungsfunktion verkaufen.' },
    { id: 'delivery', title: 'Lieferweg je Auftrag', status: 'BLOCKED', live: false,
      evidence: 'Cloudflare kann keine Windows-Programme übersetzen. Ein Auftrag kann deshalb noch nicht automatisch zu einem Kundeninstaller werden.',
      next: 'Bau auf einem Windows-Rechner (dieser Rechner oder GitHub-Windows-Server) mit Übergabe an die Auslieferung anbinden.' },
    { id: 'win10', title: 'Windows 10 geprüft', status: 'OPEN', live: false, evidence: 'Gleiche Laufzeit wie Windows 11, aber ohne eigenen Test. Die Anleitung sagt daher nur „vorgesehen“.' },
    { id: 'signing', title: 'Code-Signatur', status: 'OWNER', live: false, evidence: 'Nicht signiert (Windows meldet „NotSigned“). Beim Download warnt SmartScreen; die Anleitung erklärt das. Ein Zertifikat kostet Geld und braucht deine Freigabe.' },
    { id: 'price', title: 'Festpreis', status: 'OWNER', live: false, evidence: 'Legst du bei der Freigabe fest, innerhalb der Preisgrenzen der Policy.' },
  ];
}

export function releaseSummary(gates: ReleaseGate[]): { sellable: boolean; blocked: number; owner: number } {
  return { sellable: !gates.some((g) => g.status === 'BLOCKED'), blocked: gates.filter((g) => g.status === 'BLOCKED').length, owner: gates.filter((g) => g.status === 'OWNER').length };
}
