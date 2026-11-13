import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { detectInjectionHints } from '../../ai-orchestrator/src/untrusted.ts';
import { getCapability } from '../../product-factory/src/registry.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';
import { isSellable } from './releases.ts';

/**
 * Funktion 156 – Universal Assignment Intelligence (Gesamtprompt 157, Anlage J).
 * Macht aus einem Kundenwunsch eine prüfbare Auftragsanforderung statt einer Chat-Zusammenfassung:
 * Fachbereich, Lieferumfang je Produktart, Zielplattform, Formate, MUSS/SOLL/OPTIONAL, Abnahmekriterien, Abhängigkeiten,
 * Rückfragen und Konflikte. Regelbasiert und nachvollziehbar (keine kostenpflichtige KI-API).
 *
 * Grenzen (per Test erzwungen):
 *  - Fehlende Zielplattform → Rückfrage, Status ASSIGNMENT_AMBIGUOUS, nie READY_FOR_QUOTE (PR-156-03).
 *  - Widersprüche → Konflikt (PR-156-04). Unbekannte Aufgabenart → REVIEW statt erfundener Machbarkeit (PR-156-08).
 *  - Anhänge sind nur Daten: Sie liefern keine Rechte, Preise, Status oder Tests. Anweisungsähnlicher Text → REVIEW (PR-156-05).
 *  - Die Anforderung enthält keinen Preis. Preise kommen nur aus Policy und Eigentümer-Freigabe.
 */

export type Domain =
  | 'software-native' | 'software-mobile' | 'software-web' | 'office-excel' | 'office-word' | 'office-slides' | 'office-calc'
  | 'media-video' | 'media-audio' | 'media-3d' | 'media-graphics' | 'api-integration' | 'research' | 'unknown';
export type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'browser';
export type Level = 'MUSS' | 'SOLL' | 'OPTIONAL';
export type AssignmentStatus = 'ASSIGNMENT_AMBIGUOUS' | 'REVIEW' | 'CAPABILITY_PENDING' | 'COST_APPROVAL_REQUIRED' | 'CAPABILITY_BLOCKED' | 'READY_FOR_QUOTE';
type Lang = 'de' | 'it' | 'en';

export interface Requirement { level: Level; text: string; origin: 'customer' | 'product_type' }
export interface Attachment { name: string; text: string }

export interface AssignmentSpec {
  domain: Domain;
  secondaryDomains: Domain[];
  businessAreas: string[];
  platforms: Platform[];
  architectures: string[];
  formats: string[];
  language: Lang;
  deadline: string | null;
  requirements: Requirement[];
  deliverables: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
  licences: string[];
  questions: string[];
  conflicts: string[];
  reviewFlags: string[];
  capability: { id: string | null; status: AssignmentStatus; reason: string };
  status: AssignmentStatus;
  attachments: { name: string; sha256: string; bytes: number; injectionHints: number }[];
}

const has = (t: string, re: RegExp): boolean => re.test(t);

/** Reihenfolge = Priorität des Hauptbereichs. */
const DOMAIN_RULES: [Domain, RegExp][] = [
  ['software-mobile', /\b(android|ios|iphone|ipad|apk|aab|app ?store|play ?store|handy-?app|smartphone-?app|mobile app|app mobile)\b/],
  ['software-native', /\b(\.?exe|\.?msi|msix|installer|installation|installierbar|setup|desktop|desktop-?(programm|anwendung|software)|windows-?(programm|anwendung|software|tool)|programm für windows|mac-?app|\.app|\.dmg|\.pkg|\.deb|\.rpm|appimage|programma (per )?windows|installabile|native)\b/],
  ['software-web', /\b(web-?app|webanwendung|web-?anwendung|saas|im browser|browser-?basiert|online-?(portal|software|plattform)|applicazione web|web application|kundenportal)\b/],
  ['office-excel', /\b(excel|xlsx|xlsm|tabellenkalkulation|spreadsheet|foglio (di calcolo|excel)|formeln?|formule|formula|pivot|sverweis|vlookup|cerca\.vert)\b/],
  ['office-word', /\b(word-?(datei|dokument|vorlage)?|docx|dokumentvorlage|briefvorlage|documento word|modello word)\b/],
  ['office-slides', /\b(powerpoint|pptx|präsentation|praesentation|presentazione|presentation|folien|slides|keynote)\b/],
  ['office-calc', /\b(kalkulation|kostenvoranschlag|angebotskalkulation|preiskalkulation|calcolo|preventivo|quotation sheet|cost calculation)\b/],
  ['media-video', /\b(video|film|clip|imagefilm|erklärvideo|spot|reel|mp4|mov|montaggio video)\b/],
  ['media-audio', /\b(audio|podcast|jingle|sounddesign|hörbuch|voice-?over|mp3|wav|musik|musica)\b/],
  ['media-3d', /\b(3d|blender|rendering|render|modellierung|glb|gltf|fbx|stl)\b/],
  ['media-graphics', /\b(logo|grafik|illustration|banner|flyer|plakat|poster|icon|corporate design|grafica|immagine coordinata)\b/],
  ['api-integration', /\b(api|schnittstelle|webhook|plugin|add-?on|automation|automatisierung|integrazione|zapier|make\.com)\b/],
  ['research', /\b(recherche|marktanalyse|marktforschung|ricerca|analisi di mercato|market research|wettbewerbsanalyse|studie)\b/],
];

const BUSINESS_RULES: [string, RegExp][] = [
  ['Warenwirtschaft/Lager', /\b(warenwirtschaft|lager|lagerverwaltung|bestand|bestände|inventar|inventory|magazzino|giacenz\w*|artikelverwaltung)\b/],
  ['Rechnungen/Angebote', /\b(rechnung\w*|angebot\w*|fattur\w*|preventiv\w*|invoice\w*|quote\w*|beleg\w*)\b/],
  ['Buchhaltung', /\b(buchhaltung|buchführung|fibu|contabilità|accounting|bookkeeping)\b/],
  ['Kundenverwaltung (CRM)', /\b(crm|kundenverwaltung|kundendaten|gestione clienti|customer management)\b/],
  ['ERP', /\b(erp|unternehmenssoftware|gestionale|lexware-?artig|wie lexware)\b/],
];

const PLATFORM_RULES: [Platform, RegExp][] = [
  ['windows', /\b(windows|win ?1[01]|win32|win64|\.exe|\.msi|msix)\b/],
  ['macos', /\b(macos|mac ?os|os ?x|macbook|imac|mac-?app|\.dmg|\.pkg|für (den )?mac|per mac|for mac)\b/],
  ['linux', /\b(linux|ubuntu|debian|fedora|red ?hat|\.deb|\.rpm|appimage)\b/],
  ['android', /\b(android|apk|aab|play ?store)\b/],
  ['ios', /\b(ios|iphone|ipad|app ?store)\b/],
  ['browser', /\b(browser|web-?app|webanwendung|saas|online|chrome|firefox|edge)\b/],
];

const FORMAT_RE = /\.?\b(xlsx|xlsm|xls|csv|docx|doc|pptx|pdf|odt|ods|exe|msi|msix|dmg|pkg|deb|rpm|appimage|apk|aab|mp4|mov|mp3|wav|png|svg|jpg|glb|gltf|fbx|stl|json|xml)\b/g;

const Q: Record<Lang, Record<'platform' | 'roles' | 'formulas' | 'scope' | 'conflict' | 'deadline', string>> = {
  de: {
    platform: 'Auf welchem Betriebssystem soll das Programm laufen (Windows, macOS, Linux, Android, iOS oder im Browser) – und welche Versionen?',
    roles: 'Wie viele Personen arbeiten damit, und braucht es unterschiedliche Rollen (z. B. Verwaltung, Lager, nur Lesen)?',
    formulas: 'Welche Berechnungen sollen die Formeln liefern? Bitte Beispieldaten mit dem erwarteten Ergebnis beilegen.',
    scope: 'Welches Ergebnis brauchen Sie genau – welche Datei oder welches Programm, und wofür wird es eingesetzt?',
    conflict: 'Ihre Angaben widersprechen sich – bitte klären Sie:',
    deadline: 'Bis wann brauchen Sie das Ergebnis?',
  },
  it: {
    platform: 'Su quale sistema operativo deve funzionare il programma (Windows, macOS, Linux, Android, iOS o nel browser) – e quali versioni?',
    roles: 'Quante persone lo useranno e servono ruoli diversi (es. amministrazione, magazzino, sola lettura)?',
    formulas: 'Quali calcoli devono fornire le formule? Allegate dati di esempio con il risultato atteso.',
    scope: 'Quale risultato vi serve esattamente – quale file o programma e per quale uso?',
    conflict: 'Le indicazioni sono in contraddizione – chiarite per favore:',
    deadline: 'Entro quando vi serve il risultato?',
  },
  en: {
    platform: 'Which operating system should the program run on (Windows, macOS, Linux, Android, iOS or in the browser) – and which versions?',
    roles: 'How many people will use it, and do you need different roles (e.g. admin, warehouse, read-only)?',
    formulas: 'Which results should the formulas calculate? Please attach sample data with the expected result.',
    scope: 'What exactly do you need – which file or program, and what is it used for?',
    conflict: 'Your requirements contradict each other – please clarify:',
    deadline: 'By when do you need the result?',
  },
};

function detectLang(t: string): Lang {
  const it = (t.match(/\b(il|la|per|che|con|una|vorrei|abbiamo|magazzino|programma|fattur\w*)\b/g) ?? []).length;
  const en = (t.match(/\b(the|and|for|with|we|need|should|would|our|please)\b/g) ?? []).length;
  const de = (t.match(/\b(der|die|das|und|für|mit|wir|brauchen|soll|unsere|bitte|ein|eine)\b/g) ?? []).length;
  if (it > de && it > en) return 'it';
  if (en > de && en > it) return 'en';
  return 'de';
}

function levelOf(line: string): Level | null {
  if (/\b(optional|wäre schön|waere schoen|nice to have|facoltativ\w*|eventuell|gern auch)\b/.test(line)) return 'OPTIONAL';
  if (/\b(muss|müssen|muessen|unbedingt|zwingend|must|required|deve|devono|obbligatori\w*|necessari\w*)\b/.test(line)) return 'MUSS';
  if (/\b(soll|sollte|sollen|should|dovrebbe|dovrebbero|wünschenswert)\b/.test(line)) return 'SOLL';
  return null;
}

/** Typische Lieferumfänge je Produktart (Anlage I: echter Liefernachweis, kein Mockup). */
function productTypeRequirements(domain: Domain, business: string[], platforms: Platform[]): { req: string[]; deliverables: string[]; acceptance: string[]; licences: string[] } {
  const pl = platforms.length ? platforms.join(', ') : 'Zielplattform offen';
  switch (domain) {
    case 'software-native':
    case 'software-mobile': {
      const req = [
        `Datenmodell: ${business.length ? business.join(', ') : 'fachliche Objekte'} mit persistenter Speicherung (übersteht Neustart)`,
        'Rollen und Berechtigungen gemäß Kundenangabe',
        domain === 'software-mobile' ? 'Installierbares Build nach Plattformvorgaben (APK/AAB bzw. erlaubte iOS-Verteilung)' : 'Installer mit funktionierender Deinstallation, ohne fremde Nutzerdaten zu beschädigen',
        `Tests je Zielplattform (${pl}): Installation, Start, fachlicher Ablauf, Update, Deinstallation`,
        'Bedienungsanleitung mit echten Screenshots',
      ];
      return {
        req,
        deliverables: [domain === 'software-mobile' ? 'App-Build für die vereinbarten Geräte' : 'Ausführbares Programm mit Installer', 'Prüfbericht je Plattform', 'Bedienungsanleitung (PDF)', 'Lizenzliste der verwendeten Bibliotheken'],
        acceptance: [`Programm installiert und startet auf ${pl} (echter Test, kein Screenshot)`, 'Fachablauf mit Beispieldaten fehlerfrei', 'Daten bleiben nach Neustart erhalten', 'Deinstallation entfernt nur eigene Dateien'],
        licences: ['Lizenzliste (SBOM) aller Abhängigkeiten', 'Signatur: signiert/unsigniert exakt gekennzeichnet'],
      };
    }
    case 'software-web':
      return {
        req: [`Datenmodell: ${business.length ? business.join(', ') : 'fachliche Objekte'} mit persistenter Datenbank`, 'Benutzerrollen und Anmeldung', 'Serverseitige Geschäftslogik mit Validierung', 'Tests der Kernabläufe (positiv, negativ, Datenintegrität)'],
        deliverables: ['Lauffähige Webanwendung', 'Prüfbericht', 'Bedienungsanleitung (PDF)'],
        acceptance: ['Kernabläufe mit Testdaten im Browser bedienbar', 'Ungültige Eingaben werden abgewiesen', 'Rollen sehen nur ihre Daten'],
        licences: ['Lizenzliste der verwendeten Bibliotheken'],
      };
    case 'office-excel':
      return {
        req: ['Bearbeitbare Excel-Datei (.xlsx) mit echten Formeln statt fester Werte', 'Zellbezüge und Formate gemäß Vorgabe', 'Formeln mit Referenzwerten geprüft, inkl. negativer, leerer und großer Werte', 'Datei öffnet ohne Reparaturdialog in Excel und LibreOffice'],
        deliverables: ['Bearbeitbare .xlsx-Datei', 'Formel-Prüfbericht mit Referenzwerten'],
        acceptance: ['Zellprüfung: Eingabezellen, Ergebniszellen und Formate wie vereinbart', 'Formelprüfung: Ergebnisse stimmen mit Referenzwerten überein', 'Dateiprüfung: öffnet und lässt sich bearbeiten, keine fremden Metadaten'],
        licences: [],
      };
    case 'office-word':
      return { req: ['Bearbeitbare .docx mit Formatvorlagen', 'Öffnet ohne Reparaturdialog', 'Private Metadaten entfernt'], deliverables: ['Bearbeitbare .docx', 'PDF-Export zusätzlich'], acceptance: ['Dokument öffnet und ist bearbeitbar', 'PDF stimmt inhaltlich mit dem Original überein'], licences: ['Schriftlizenzen geprüft'] };
    case 'office-slides':
      return { req: ['Bearbeitbare .pptx mit Masterfolien', 'Keine überlaufenden Textbereiche'], deliverables: ['Bearbeitbare .pptx', 'PDF-Export zusätzlich'], acceptance: ['Alle Folien ohne Überlauf', 'Bilder mit geklärten Rechten'], licences: ['Bild- und Schriftrechte geprüft'] };
    case 'office-calc':
      return { req: ['Positionen mit Menge, Einzelpreis und Aufschlag', 'Summen und Rundung geprüft'], deliverables: ['Kalkulation als Tabelle und/oder PDF'], acceptance: ['Summen stimmen mit den Positionen überein'], licences: [] };
    case 'media-video':
    case 'media-audio':
    case 'media-3d':
    case 'media-graphics':
      return { req: ['Vereinbarte Ausgabeformate und Original-/Projektdateien', 'Technische Prüfung (Format, Auflösung, Codec bzw. Pegel)', 'Nutzungsrechte für alle verwendeten Inhalte'], deliverables: ['Ausgabedateien im vereinbarten Format', 'Bearbeitbare Projektdateien', 'Rechtenachweis'], acceptance: ['Datei im Zielformat abspielbar bzw. öffnet', 'Rechte für kommerzielle Nutzung belegt'], licences: ['Rechtenachweis je verwendetem Inhalt'] };
    case 'api-integration':
      return { req: ['Dokumentierter Datenvertrag', 'Fehlerbehandlung und Berechtigungen', 'Versionierung'], deliverables: ['Nutzbares Paket oder Endpunkt', 'Schnittstellen-Dokumentation'], acceptance: ['Echte Aufrufe mit Testdaten erfolgreich', 'Fehlerfälle liefern definierte Antworten'], licences: [] };
    case 'research':
      return { req: ['Vereinbarte Struktur', 'Verifizierte Quellen für jede Tatsachenbehauptung'], deliverables: ['Bericht im bearbeitbaren Format', 'Quellenverzeichnis'], acceptance: ['Jede Tatsache mit prüfbarer Quelle'], licences: ['Zitat- und Nutzungsrechte geprüft'] };
    default:
      return { req: [], deliverables: [], acceptance: [], licences: [] };
  }
}

/** Machbarkeit gegen den echten Stand der Produktfabrik – nichts wird als lieferbar ausgegeben, was nicht hergestellt und geprüft werden kann. */
function capabilityFor(ctx: AppContext | null, domain: Domain, platforms: Platform[], business: string[], requested: string | null): AssignmentSpec['capability'] {
  const sellable = (id: string): boolean => (ctx ? isSellable(ctx, id) : false);
  if (requested && getCapability(requested)) {
    return sellable(requested) ? { id: requested, status: 'READY_FOR_QUOTE', reason: `Produktart ${requested} ist freigegeben.` } : { id: requested, status: 'CAPABILITY_PENDING', reason: `Produktart ${requested} ist derzeit nicht bestellbar.` };
  }
  if (platforms.includes('macos') || platforms.includes('ios')) return { id: null, status: 'COST_APPROVAL_REQUIRED', reason: 'macOS/iOS braucht Mac-Hardware und ein Apple-Entwicklerkonto (kostenpflichtig) – nur mit Freigabe des Eigentümers.' };
  if (domain.startsWith('media-')) return { id: null, status: 'CAPABILITY_BLOCKED', reason: 'Grafik, 3D, Audio und Video sind derzeit gesperrt (Funktion 160), bis ein echter Fähigkeitsnachweis vorliegt.' };
  if (domain === 'office-calc') return sellable('b2b-calc-csv') ? { id: 'b2b-calc-csv', status: 'READY_FOR_QUOTE', reason: 'Kalkulation als Tabelle ist freigegeben.' } : { id: 'b2b-calc-csv', status: 'CAPABILITY_PENDING', reason: 'Kalkulation ist derzeit nicht bestellbar.' };
  if (domain === 'software-web' && business.includes('Warenwirtschaft/Lager')) {
    return sellable('mini-ww') ? { id: 'mini-ww', status: 'READY_FOR_QUOTE', reason: 'Mini-Warenwirtschaft (Browser-Programm) ist freigegeben – Umfang mit der Anforderung abgleichen.' } : { id: 'mini-ww', status: 'CAPABILITY_PENDING', reason: 'Mini-Warenwirtschaft ist noch nicht zum Verkauf freigegeben.' };
  }
  if (domain === 'software-native') return { id: null, status: 'CAPABILITY_PENDING', reason: 'Native Programme mit Installer (Funktion 157) sind noch nicht freigeschaltet; Windows ist auf diesem Rechner testbar, Linux in kostenloser CI.' };
  if (domain === 'office-excel' || domain === 'office-word' || domain === 'office-slides') return { id: null, status: 'CAPABILITY_PENDING', reason: 'Bearbeitbare Office-Dateien (Funktion 159) sind noch nicht freigeschaltet – derzeit nur Kalkulation als CSV/PDF.' };
  return { id: null, status: 'CAPABILITY_PENDING', reason: 'Für diese Produktart gibt es noch keine Standard-Akte mit automatischer Prüfung.' };
}

/** Reine Analyse (ohne Datenbank). Mit ctx wird zusätzlich die echte Bestellbarkeit geprüft. */
export function analyzeAssignment(text: string, attachments: readonly Attachment[] = [], opts: { ctx?: AppContext; requestedCapability?: string | null } = {}): AssignmentSpec {
  const raw = text.slice(0, 20000);
  const t = raw.toLowerCase();
  const language = detectLang(t);
  // Anhänge: nur Datennachweis (Name, Prüfsumme, Größe, Hinweise). Ihr Text steuert weder Bereich, Status, Preis noch Tests.
  const att = attachments.slice(0, 20).map((a) => ({ name: a.name.replace(/[^\w .()-]/g, '_').slice(0, 120), sha256: sha256Hex(a.text), bytes: new TextEncoder().encode(a.text).length, injectionHints: detectInjectionHints(a.text).length }));
  const reviewFlags: string[] = [];
  if (detectInjectionHints(raw).length) reviewFlags.push('Kundentext enthält anweisungsähnliche Formulierungen – nur als Daten behandelt, manuelle Prüfung.');
  for (const a of att) if (a.injectionHints) reviewFlags.push(`Anhang „${a.name}“ enthält anweisungsähnliche Formulierungen – ignoriert, manuelle Prüfung.`);

  const domains = DOMAIN_RULES.filter(([, re]) => has(t, re)).map(([d]) => d);
  const requestedDomain: Domain | null = opts.requestedCapability?.startsWith('b2b-calc') ? 'office-calc' : opts.requestedCapability === 'mini-ww' ? 'software-web' : null;
  const business = BUSINESS_RULES.filter(([, re]) => has(t, re)).map(([b]) => b);
  const platforms = PLATFORM_RULES.filter(([, re]) => has(t, re)).map(([p]) => p);
  // Geschäftssoftware ohne erkennbare Produktart (z. B. „ERP für unser Lager“) ist Software – Plattform offen.
  const softwareWord = /\b(programm\w*|software|anwendung|tool|app|applicazione|application)\b/.test(t);
  const nativePlatform = platforms.some((p) => p !== 'browser');
  let domain: Domain = requestedDomain ?? domains[0] ?? (business.length || (softwareWord && nativePlatform) ? 'software-native' : 'unknown');
  if (!requestedDomain && domains[0] === 'office-calc' && business.length && /\b(software|programm|programma|tool|anwendung|app)\b/.test(t)) domain = 'software-native';
  if (!requestedDomain && domain === 'software-native' && !domains.includes('software-native') && platforms.includes('browser')) domain = 'software-web';
  const secondaryDomains = domains.filter((d) => d !== domain);
  const architectures = [...new Set((t.match(/\b(x64|x86|arm64|aarch64|apple silicon|intel)\b/g) ?? []))];
  const formats = [...new Set([...t.matchAll(FORMAT_RE)].map((m) => m[1] ?? ''))].filter(Boolean);
  const deadline = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/.exec(t)?.[0] ?? /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t)?.[0] ?? null;

  const q = Q[language];
  const questions: string[] = [];
  const conflicts: string[] = [];
  const isSoftware = domain === 'software-native' || domain === 'software-mobile' || domain === 'software-web';
  if ((domain === 'software-native' || domain === 'software-mobile') && !platforms.some((p) => p !== 'browser')) questions.push(q.platform);
  if (isSoftware && business.length && !/\b(rolle\w*|benutzer\w*|mitarbeiter\w*|nutzer\w*|ruol\w*|utent\w*|user\w*|roles?|einzelplatz|mehrbenutzer|personen|persone)\b/.test(t)) questions.push(q.roles);
  if (domain === 'office-excel' && !/\d/.test(t) && !att.length) questions.push(q.formulas);
  if (domain === 'unknown') questions.push(q.scope);

  const only = /\b(nur|ausschließlich|only|solo|soltanto)\s+(für\s+|per\s+|for\s+|auf\s+|su\s+|on\s+)?(windows|mac|macos|linux|android|ios)\b/.exec(t);
  if (only) {
    const want = only[3] === 'mac' ? 'macos' : (only[3] as Platform);
    const others = platforms.filter((p) => p !== want && p !== 'browser');
    if (others.length) conflicts.push(`„nur ${only[3]}“, aber auch ${others.join(', ')} genannt`);
  }
  if (/\b(offline|ohne internet|senza internet|without internet|kein internet)\b/.test(t) && /\b(cloud|online-?zugriff|von überall|da remoto|remote access|mehrere standorte|più sedi|multiple locations)\b/.test(t)) conflicts.push('offline/ohne Internet, aber Cloud- bzw. Fernzugriff verlangt');
  if (/\b(einzelplatz|single-?user|un solo utente)\b/.test(t) && /\b(mehrbenutzer|mehrere benutzer|multi-?user|più utenti|gleichzeitig)\b/.test(t)) conflicts.push('Einzelplatz, aber mehrere gleichzeitige Benutzer verlangt');
  if (/\b(ohne installation|keine installation|senza installazione|no installation|nicht installieren)\b/.test(t) && /\b(installer|setup|\.msi|\.exe|installierbar|installabile)\b/.test(t)) conflicts.push('ohne Installation, aber Installer verlangt');
  if (conflicts.length) questions.push(`${q.conflict} ${conflicts.join('; ')}`);

  const typed = productTypeRequirements(domain, business, platforms);
  const requirements: Requirement[] = [];
  for (const line of raw.split(/\r?\n|(?<=[.!?;])\s+/).map((l) => l.trim()).filter((l) => l.length >= 6).slice(0, 60)) {
    const level = levelOf(line.toLowerCase());
    if (level) requirements.push({ level, text: line.slice(0, 300), origin: 'customer' });
  }
  for (const r of typed.req) requirements.push({ level: 'MUSS', text: r, origin: 'product_type' });

  const dependencies: string[] = [];
  if (/\b(kundendaten|personenbezogen\w*|dsgvo|gdpr|datenschutz|dati personali|personal data)\b/.test(t)) dependencies.push('Personenbezogene Daten: Auftragsverarbeitung und Datenschutz klären');
  if (/\b(logo|corporate design|markenfarben|brand|vorlage|template|bestehende daten|import|altdaten|migration)\b/.test(t)) dependencies.push('Kundendateien nötig (z. B. Logo, Vorlagen, Altdaten) – Anforderung über sicheren Upload (Funktion 161)');
  if (/\b(datev|lexware|sevdesk|shopify|woocommerce|sap|stripe|paypal|amazon)\b/.test(t)) dependencies.push('Anbindung an Fremdsystem – Zugang, Schnittstelle und Kosten vor Zusage prüfen');
  if (platforms.includes('macos') || platforms.includes('ios')) dependencies.push('Apple-Signatur/Notarisierung und Mac-Testumgebung (kostenpflichtig)');

  const capability = capabilityFor(opts.ctx ?? null, domain, platforms, business, opts.requestedCapability ?? null);
  let status: AssignmentStatus;
  if (conflicts.length) status = 'ASSIGNMENT_AMBIGUOUS';
  else if (domain === 'unknown') status = 'REVIEW';
  else if (questions.length) status = 'ASSIGNMENT_AMBIGUOUS';
  else if (reviewFlags.length && capability.status === 'READY_FOR_QUOTE') status = 'REVIEW';
  else status = capability.status;

  return {
    domain, secondaryDomains, businessAreas: business, platforms, architectures, formats, language, deadline,
    requirements, deliverables: typed.deliverables, acceptanceCriteria: typed.acceptance, dependencies, licences: typed.licences,
    questions, conflicts, reviewFlags, capability, status, attachments: att,
  };
}

// ---------------------------------------------------------------- Persistenz (append-only)

export interface AssignmentRow { scope_id: string; revision: number; lead_id: string | null; channel: string; source_text: string; source_sha256: string; domain: string; status: AssignmentStatus; spec_json: string; actor: string; created_at: string }
export interface Confirmation { confirmation_id: string; scope_id: string; revision: number; source_sha256: string; confirmed_by: 'customer' | 'owner_recorded'; evidence: string; confirmed_at: string }

/** Nach einem Löschantrag (DSGVO) ist nur noch der Nachweis übrig: kein Text, keine Analyse. */
export const ERASED_TEXT = '[gelöscht]';
function parseSpec(json: string): AssignmentSpec {
  const p = JSON.parse(json) as AssignmentSpec & { erased?: boolean };
  if (!p.erased) return p;
  return { domain: 'unknown', secondaryDomains: [], businessAreas: [], platforms: [], architectures: [], formats: [], language: 'de', deadline: null, requirements: [], deliverables: [], acceptanceCriteria: [], dependencies: [], licences: [], questions: [], conflicts: [], reviewFlags: ['Inhalt auf Löschantrag entfernt'], capability: { id: null, status: 'REVIEW', reason: 'Inhalt gelöscht' }, status: 'REVIEW', attachments: [] };
}

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

export interface CreateInput { text: string; channel: string; leadId?: string | null; customerKey?: string | null; attachments?: Attachment[]; requestedCapability?: string | null; actor?: string }

/** Legt Revision 1 an. Derselbe Wunsch vom selben Kunden über denselben oder einen weiteren Kanal ergibt keine zweite Anforderung. */
export function createAssignment(ctx: AppContext, input: CreateInput): { scopeId: string; revision: number; created: boolean; spec: AssignmentSpec } {
  const text = input.text.trim();
  if (text.length < 3) throw new WorkflowError('ASSIGNMENT_TEXT_TOO_SHORT');
  const channel = input.channel.replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'unknown';
  const who = input.leadId ?? input.customerKey ?? 'anon';
  const dedupeKey = sha256Hex(`${who}|${normalize(text)}`);
  const existing = ctx.db.get<AssignmentRow>('SELECT * FROM assignment_specs WHERE dedupe_key = ? AND revision = 1', dedupeKey);
  if (existing) return { scopeId: existing.scope_id, revision: latestRevision(ctx, existing.scope_id), created: false, spec: parseSpec(existing.spec_json) };
  const spec = analyzeAssignment(text, input.attachments ?? [], { ctx, requestedCapability: input.requestedCapability ?? null });
  const scopeId = newId('asg');
  insertRevision(ctx, { scopeId, revision: 1, leadId: input.leadId ?? null, channel, dedupeKey, text, spec, actor: input.actor ?? 'system' });
  ctx.audit.record({ type: 'assignment.created', actor: input.actor ?? 'system', subjectType: 'assignment', subjectId: scopeId, data: { channel, domain: spec.domain, status: spec.status, questions: spec.questions.length, conflicts: spec.conflicts.length }, testMode: ctx.config.testMode });
  return { scopeId, revision: 1, created: true, spec };
}

function insertRevision(ctx: AppContext, r: { scopeId: string; revision: number; leadId: string | null; channel: string; dedupeKey: string; text: string; spec: AssignmentSpec; actor: string }): void {
  ctx.db.run(
    `INSERT INTO assignment_specs (scope_id, revision, lead_id, channel, dedupe_key, source_text, source_sha256, attachments_json, domain, status, spec_json, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.scopeId, r.revision, r.leadId, r.channel, r.dedupeKey, r.text, sha256Hex(r.text), JSON.stringify(r.spec.attachments), r.spec.domain, r.spec.status, JSON.stringify(r.spec), r.actor, ctx.clock().toISOString(),
  );
}

function latestRevision(ctx: AppContext, scopeId: string): number {
  return ctx.db.get<{ r: number | null }>('SELECT MAX(revision) AS r FROM assignment_specs WHERE scope_id = ?', scopeId)?.r ?? 0;
}

/**
 * Neue Scope-Version (z. B. nach Antwort auf Rückfragen oder Änderungswunsch). Frühere Versionen und ihr Originaltext bleiben unverändert.
 * War die vorige Version bereits vom Kunden bestätigt, ist das ein Änderungsauftrag (Funktion 92): neue Preisprüfung nötig.
 */
export function reviseAssignment(ctx: AppContext, scopeId: string, text: string, actor: string, attachments: Attachment[] = []): { revision: number; spec: AssignmentSpec; changeOrderRequired: boolean } {
  const prev = ctx.db.get<AssignmentRow>('SELECT * FROM assignment_specs WHERE scope_id = ? ORDER BY revision DESC LIMIT 1', scopeId);
  if (!prev) throw new WorkflowError('ASSIGNMENT_NOT_FOUND');
  if (prev.source_text === ERASED_TEXT) throw new WorkflowError('ASSIGNMENT_ERASED');
  const clean = text.trim();
  if (clean.length < 3) throw new WorkflowError('ASSIGNMENT_TEXT_TOO_SHORT');
  if (normalize(clean) === normalize(prev.source_text)) return { revision: prev.revision, spec: parseSpec(prev.spec_json), changeOrderRequired: false };
  const prevSpec = parseSpec(prev.spec_json);
  const spec = analyzeAssignment(clean, attachments, { ctx, requestedCapability: prevSpec.capability.id && getCapability(prevSpec.capability.id) && prev.channel !== 'owner-entry' ? prevSpec.capability.id : null });
  const revision = prev.revision + 1;
  const changeOrderRequired = confirmationOf(ctx, scopeId, prev.revision) !== null;
  insertRevision(ctx, { scopeId, revision, leadId: prev.lead_id, channel: prev.channel, dedupeKey: `${scopeId}:${revision}`, text: clean, spec, actor });
  ctx.audit.record({ type: 'assignment.revised', actor, subjectType: 'assignment', subjectId: scopeId, data: { revision, status: spec.status, change_order_required: changeOrderRequired }, testMode: ctx.config.testMode });
  return { revision, spec, changeOrderRequired };
}

/** Kundenbestätigung genau einer (der neuesten) Version mit Beleg. Mehrdeutige oder ungeprüfte Versionen können nicht bestätigt werden. */
export function confirmAssignment(ctx: AppContext, scopeId: string, revision: number, by: 'customer' | 'owner_recorded', evidence: string): Confirmation {
  const row = ctx.db.get<AssignmentRow>('SELECT * FROM assignment_specs WHERE scope_id = ? AND revision = ?', scopeId, revision);
  if (!row) throw new WorkflowError('ASSIGNMENT_NOT_FOUND');
  if (row.source_text === ERASED_TEXT) throw new WorkflowError('ASSIGNMENT_ERASED');
  if (revision !== latestRevision(ctx, scopeId)) throw new WorkflowError('ASSIGNMENT_NOT_LATEST', 'Nur die neueste Version kann bestätigt werden.');
  if (row.status === 'ASSIGNMENT_AMBIGUOUS' || row.status === 'REVIEW') throw new WorkflowError('ASSIGNMENT_NOT_CONFIRMABLE', 'Erst Rückfragen, Konflikte oder Prüfung klären.');
  const ev = evidence.trim();
  if (ev.length < 3) throw new WorkflowError('EVIDENCE_REQUIRED', 'Beleg der Bestätigung angeben (z. B. Nachricht vom …).');
  const existing = confirmationOf(ctx, scopeId, revision);
  if (existing) return existing;
  const c: Confirmation = { confirmation_id: newId('acf'), scope_id: scopeId, revision, source_sha256: row.source_sha256, confirmed_by: by, evidence: ev.slice(0, 500), confirmed_at: ctx.clock().toISOString() };
  ctx.db.run('INSERT INTO assignment_confirmations (confirmation_id, scope_id, revision, source_sha256, confirmed_by, evidence, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?)', c.confirmation_id, c.scope_id, c.revision, c.source_sha256, c.confirmed_by, c.evidence, c.confirmed_at);
  ctx.audit.record({ type: 'assignment.confirmed', actor: by === 'customer' ? 'customer' : 'owner', subjectType: 'assignment', subjectId: scopeId, data: { revision, source_sha256: row.source_sha256 }, testMode: ctx.config.testMode });
  return c;
}

export function confirmationOf(ctx: AppContext, scopeId: string, revision: number): Confirmation | null {
  return ctx.db.get<Confirmation>('SELECT * FROM assignment_confirmations WHERE scope_id = ? AND revision = ?', scopeId, revision) ?? null;
}

/** Alle Versionen mit Originaltext, Prüfsumme und Bestätigung – rückverfolgbar (PR-156-07). */
export function assignmentHistory(ctx: AppContext, scopeId: string): { row: AssignmentRow; spec: AssignmentSpec; confirmation: Confirmation | null }[] {
  return ctx.db.all<AssignmentRow>('SELECT * FROM assignment_specs WHERE scope_id = ? ORDER BY revision DESC', scopeId).map((row) => ({ row, spec: parseSpec(row.spec_json), confirmation: confirmationOf(ctx, scopeId, row.revision) }));
}

/** Neueste Version je Anforderung, neueste zuerst. */
export function listAssignments(ctx: AppContext, limit = 50): (AssignmentRow & { confirmed: number })[] {
  return ctx.db.all<AssignmentRow & { confirmed: number }>(
    `SELECT a.*, (SELECT COUNT(*) FROM assignment_confirmations c WHERE c.scope_id = a.scope_id AND c.revision = a.revision) AS confirmed
     FROM assignment_specs a WHERE a.revision = (SELECT MAX(b.revision) FROM assignment_specs b WHERE b.scope_id = a.scope_id)
     ORDER BY a.created_at DESC LIMIT ?`,
    limit,
  );
}

/** Eingabe für das Angebot (134/162): nur Umfang und Produktart – nie ein Preis aus dem Kundentext. */
export function quoteInput(ctx: AppContext, scopeId: string): { scopeId: string; revision: number; capabilityId: string; deliverables: string[]; acceptanceCriteria: string[]; platforms: Platform[] } | null {
  const row = ctx.db.get<AssignmentRow>('SELECT * FROM assignment_specs WHERE scope_id = ? ORDER BY revision DESC LIMIT 1', scopeId);
  if (!row || row.status !== 'READY_FOR_QUOTE' || !confirmationOf(ctx, scopeId, row.revision)) return null;
  const spec = parseSpec(row.spec_json);
  if (!spec.capability.id || !isSellable(ctx, spec.capability.id)) return null;
  return { scopeId, revision: row.revision, capabilityId: spec.capability.id, deliverables: spec.deliverables, acceptanceCriteria: spec.acceptanceCriteria, platforms: spec.platforms };
}
