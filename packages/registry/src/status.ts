import { REGISTRY, type RegistryModule } from './registry.ts';
import { TITLES_DE } from './titles-de.ts';

/**
 * Ehrlicher Umsetzungsstand jeder der 127 Funktionen – Grundlage für „Berichte → Funktionsstand“ und PROGRESS.md.
 *
 *  UMGESETZT  Kernfunktion läuft im Testbetrieb und ist automatisiert getestet (Nachweis = Testdatei).
 *  TEILWEISE  Ein klar benannter Teil läuft und ist getestet; der Rest ist offen (Feld `offen`).
 *  GEPLANT    Noch nicht gebaut. Kein Code, keine Anzeige als „aktiv“. Meilenstein angegeben.
 *  GESPERRT   Bewusst blockiert (fehlende kostenlose Rechenleistung, Recht, Konto) – nicht „bald fertig“.
 *
 * Regel (per Test erzwungen): UMGESETZT/TEILWEISE nur mit existierender Testdatei als Nachweis.
 * Dieser Stand wird nur geändert, wenn Code und Tests es belegen.
 */
export type Area = 'uebersicht' | 'kunden' | 'auftraege' | 'produkte' | 'finanzen' | 'berichte';
export type ImplStatus = 'UMGESETZT' | 'TEILWEISE' | 'GEPLANT' | 'GESPERRT';
export type Milestone = 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';

export interface ModuleStatus {
  n: number;
  area: Area;
  status: ImplStatus;
  /** Was tatsächlich läuft (nur bei UMGESETZT/TEILWEISE). */
  umgesetzt?: string;
  /** Was fehlt bzw. warum gesperrt. */
  offen?: string;
  evidence: string[];
  milestone: Milestone;
}

const T = {
  gov: 'tests/integration/governance.test.ts',
  pol: 'tests/unit/policy.test.ts',
  acq: 'tests/integration/acquisition.test.ts',
  m1: 'tests/integration/m1-acquisition.test.ts',
  m2: 'tests/integration/m2-payments.test.ts',
  m3: 'tests/integration/m3-readiness.test.ts',
  opp: 'tests/integration/opportunity.test.ts',
  pay: 'tests/integration/payments.test.ts',
  prod: 'tests/integration/production.test.ts',
  fin: 'tests/integration/finance.test.ts',
  ops: 'tests/integration/ops.test.ts',
  sec: 'tests/security/security.test.ts',
  e2e: 'tests/e2e/pilot.test.ts',
  cc: 'tests/integration/contract-confirmation.test.ts',
  bak: 'tests/integration/backup-offsite.test.ts',
  core: 'tests/unit/core.test.ts',
  form: 'tests/unit/inquiry-form.test.ts',
  ui: 'tests/unit/console-ui.test.ts',
  reg: 'tests/unit/registry.test.ts',
  bank: 'tests/integration/bank-statement.test.ts',
  docs: 'tests/integration/portal-documents.test.ts',
  pdf: 'tests/integration/m2-product-pdf.test.ts',
  ins: 'tests/integration/insights.test.ts',
  out: 'tests/integration/outbox.test.ts',
  p4: 'tests/integration/p4-release.test.ts',
  grow: 'tests/integration/growth.test.ts',
  qs: 'tests/integration/quality-standard.test.ts',
  adv: 'tests/integration/advisor.test.ts',
  land: 'tests/integration/landing.test.ts',
  care: 'tests/integration/aftercare.test.ts',
  bch: 'tests/integration/bundle-change-help.test.ts',
  trust: 'tests/integration/trust-recovery.test.ts',
  plc: 'tests/integration/pricing-lifecycle.test.ts',
  pfb: 'tests/integration/portfolio-buyers.test.ts',
  done: 'tests/integration/completion.test.ts',
  it: 'tests/integration/italy.test.ts',
  gp: 'tests/integration/gesamtprompt.test.ts',
  mwui: 'tests/products/mini-ww/ui.test.ts',
  asg: 'tests/integration/assignment.test.ts',
  ast: 'tests/integration/client-assets.test.ts',
  win: 'tests/products/win-lager/install.test.ts',
  winManual: 'tests/products/win-lager/manual.test.ts',
} as const;

type Row = [n: number, area: Area, status: ImplStatus, milestone: Milestone, umgesetzt: string, offen: string, evidence: string[]];

const ROWS: Row[] = [
  [1, 'uebersicht', 'TEILWEISE', 'M4', 'Autopilot-Takt unter deterministischer Policy, Notstopps und täglicher Eigentümerbericht aus echten Ereignissen (Konsole und /api/bericht/tag).', 'KI-gestützte Tagesplanung und Priorisierung (freigegebener KI-Zugang nötig).', [T.gov, T.ops, T.done]],
  [2, 'kunden', 'TEILWEISE', 'M4', 'Öffentliche EU-Ausschreibungen (TED) als freigegebene Quelle mit Lizenzprüfung.', 'Weitere legale Marktquellen.', [T.acq, T.m1]],
  [3, 'kunden', 'UMGESETZT', 'M1', 'Bewertung nach Passung, Nachweis und Risiko; Pflicht-Produktbezug; Rangliste.', '', [T.m1, T.opp]],
  [4, 'kunden', 'TEILWEISE', 'M4', 'Inbound-Anfragen mit Einwilligung, Ausschreibungs-Leads, Angebotsentwürfe nur zur manuellen Einreichung. Automatischer Postausgang: Auftragsnachrichten (Angebot, Zahlung, Lieferung) und Folgeangebote nur mit Einwilligung, Abmeldelink, Sperrliste, Mengenlimit.', 'Echter Versand erst mit E-Mail-Dienst des Eigentümers und Anbieterangaben (LA-02); Kaltakquise bleibt gesperrt.', [T.acq, T.m1, T.out]],
  [5, 'auftraege', 'TEILWEISE', 'M4', 'Automatische Angebotskalkulation mit Mindestmarge und Preisgrenzen; Produktberater versteht Wünsche in eigenen Worten (DE/IT/EN), fragt Fehlendes nach und lehnt Nicht-Lieferbares ehrlich ab.', 'Verhandlung/Gegenangebote.', [T.opp, T.core, T.adv]],
  [6, 'produkte', 'TEILWEISE', 'M2', 'Versionierte Produktionsadapter mit eigener QA: Kalkulation als CSV (freigegeben), als PDF und als Paket (technisch fertig, Verkauf nach Policy-Freigabe).', 'Weitere Produktklassen erst nach Herstellbarkeitsnachweis.', [T.prod, T.pdf]],
  [7, 'produkte', 'GEPLANT', 'M5', '', 'Software-/Web-/API-Produkte.', []],
  [8, 'produkte', 'GESPERRT', 'M5', '', 'Video/3D/Audio: keine kostenlose, dauerhaft verfügbare Rechenleistung nachgewiesen; Lizenzfragen.', []],
  [9, 'produkte', 'UMGESETZT', 'M2', 'Automatische Qualitätsprüfung (Kodierung, Format, Summen, Formel-Injektion, Gestaltung, Prüfsumme) vor jeder Lieferung; Premium-Produktstandard: Standard-Akte je Produkt (Zweck, Referenzen, Gestaltung, Zusagen mit Prüfung, Anleitung), Abnahme-Gate je Lieferung, „nicht lieferfähig“ mit Erstattungsvorschlag an den Eigentümer.', '', [T.prod, T.qs]],
  [10, 'auftraege', 'UMGESETZT', 'M1', 'Auftragsführung mit Zustandsmaschine von Anfrage bis Abschluss, Idempotenz.', '', [T.e2e, T.opp]],
  [11, 'finanzen', 'GEPLANT', 'M5', '', 'Abonnements.', []],
  [12, 'kunden', 'TEILWEISE', 'M1', 'Kundenportal: Support, Reklamation, Widerruf; Erstattung nur nach Eigentümerfreigabe.', 'Automatische Antwortvorschläge.', [T.m2, T.form]],
  [13, 'berichte', 'TEILWEISE', 'M4', 'Wirkung der erlaubten Kanäle auf echte bezahlte Verkäufe (Herkunft, Umwandlung, Messunsicherheit).', 'Auswertung von SEO- und Marketingmaßnahmen, sobald solche freigegeben sind.', [T.ins]],
  [14, 'finanzen', 'TEILWEISE', 'M4', 'Annahme- und Kaufquote je Preisspanne aus echten Angeboten; Hinweis erst ab 30 Angeboten je Spanne, keine automatische Preisänderung.', 'Begrenzte, dokumentierte Preisexperimente (nach Freigabe).', [T.plc]],
  [15, 'finanzen', 'UMGESETZT', 'M1', 'Hauptbuch, Kennzahlen LIVE/TEST getrennt, Abgleich mit Anbieter und Kontoauszug, Monatsexport.', '', [T.fin, T.m2, T.bank]],
  [16, 'finanzen', 'TEILWEISE', 'M1', 'Testbelege mit fortlaufender Nummer, unveränderlich, als PDF im Portal; FatturaPA-XML (FPR12) für Sitz Italien mit strenger Prüfung, ohne Platzhalter.', 'Freigegebene Steuerregeln (LA-06), Registrierungsdaten (LA-02) und Übermittlungsweg ans SdI.', [T.fin, T.docs, T.it]],
  [17, 'berichte', 'TEILWEISE', 'M3', 'Live-Sperre, EU-Marktregel, Verbraucherverzicht mit Nachweis, Freigabeliste LA-01…12.', 'Rechtsprüfung der Texte (LA-07…09).', [T.m3, T.gov]],
  [18, 'berichte', 'GEPLANT', 'M6', '', 'Erweiterung in neue Geschäftsbereiche.', []],
  [19, 'berichte', 'UMGESETZT', 'M1', 'Warteschlange mit Backoff und Dead-Letter, Cron-Idempotenz, tägliche verschlüsselte Sicherung.', '', [T.ops, T.bak]],
  [20, 'berichte', 'GEPLANT', 'M6', '', 'Kontrollierte Selbstverbesserung.', []],
  [21, 'kunden', 'TEILWEISE', 'M4', 'Nachfragesuche in öffentlichen Ausschreibungen.', 'Weitere Nachfragequellen.', [T.m1]],
  [22, 'auftraege', 'UMGESETZT', 'M1', 'Produktion startet ausschließlich nach bestätigter Zahlung.', '', [T.prod, T.gov]],
  [23, 'berichte', 'GEPLANT', 'M6', '', 'Prognose von Geschäftschancen.', []],
  [24, 'kunden', 'GEPLANT', 'M4', '', 'Partner-/Akquisenetzwerk.', []],
  [25, 'auftraege', 'GEPLANT', 'M6', '', 'Handel zwischen Agenten.', []],
  [26, 'produkte', 'GEPLANT', 'M6', '', 'Kleine eigenständige Geschäftsbereiche.', []],
  [27, 'produkte', 'GEPLANT', 'M5', '', 'Marktplatz-Anbindungen.', []],
  [28, 'auftraege', 'GEPLANT', 'M4', '', 'Erweiterte Verhandlung.', []],
  [29, 'produkte', 'TEILWEISE', 'M6', 'Zwei Produktverfahren (Tabelle, PDF) als ein testbares Paket kombiniert; jede Datei mit eigener QA geprüft.', 'Kombinationen weiterer Verfahren, sobald belegt.', [T.bch]],
  [30, 'kunden', 'TEILWEISE', 'M3', 'Verkauf nur an Kunden mit Sitz in der EU (technisch erzwungen); Startseite auf Deutsch, Italienisch und Englisch mit hreflang und Sitemap.', 'Übersetzung von Anfrage, Angebot und Portal; Länderspezifika.', [T.m3, T.land]],
  [31, 'produkte', 'GEPLANT', 'M5', '', 'Wiederverwertung und Lizenzierung.', []],
  [32, 'finanzen', 'GEPLANT', 'M5', '', 'Abonnement-Aufbau.', []],
  [33, 'berichte', 'TEILWEISE', 'M4', 'Trichter und Umwandlung je Stufe aus echten Käufen (Anfrage → Lieferung, je Preisspanne); kein Gewinner aus kleinen Stichproben.', 'Verbesserungen am Verkaufsweg als begrenzte Versuche.', [T.ins, T.plc]],
  [34, 'kunden', 'TEILWEISE', 'M4', 'Echte Bewertungen nur vom Kunden selbst, nur nach Lieferung, eine je Auftrag, unveränderlich; ehrliche Zusammenfassung.', 'Veröffentlichung von Kundenstimmen (nur mit Einwilligung).', [T.care]],
  [35, 'finanzen', 'TEILWEISE', 'M1', 'Webhook-Signatur, Replay-Schutz, gefälschte Ereignisse abgelehnt, Eingaben als nicht vertrauenswürdig behandelt.', 'Betrugsmuster-Erkennung.', [T.sec, T.pay]],
  [36, 'finanzen', 'TEILWEISE', 'M2', 'Erstattungen und Disputes korrekt gebucht (kumulierte Deltas).', 'Zahlungsrückgewinnung.', [T.m2]],
  [37, 'berichte', 'UMGESETZT', 'M0', 'Kostengate 0 €: bezahlte Dienste, Upgrades, Werbung technisch gesperrt; Free-Tier-Drossel.', '', [T.gov, T.pol]],
  [38, 'berichte', 'TEILWEISE', 'M1', 'Sicherung und Wiederherstellungstest.', 'Automatischer Wiederanlauf-Plan.', [T.bak, T.ops]],
  [39, 'finanzen', 'TEILWEISE', 'M1', 'Unveränderliches Audit-Log, Belege, Vertragsbestätigungen mit Prüfsumme, unveränderliche Bankbuchungen, Monatsexport.', 'Steuerliche Aufbewahrungsregeln (LA-08).', [T.fin, T.cc, T.bank]],
  [40, 'finanzen', 'TEILWEISE', 'M1', 'Trennung bezahlt / Gebühren / Auszahlung / Bankeingang; Bankeingang nur mit Kontoauszug-Nachweis.', 'Echte Bankabstimmung erst im Live-Pilot.', [T.fin, T.bank]],
  [41, 'kunden', 'GEPLANT', 'M4', '', 'Käufernetzwerk.', []],
  [42, 'auftraege', 'TEILWEISE', 'M3', 'Verbindliche Annahme mit Nachweis und PDF-Vertragsbestätigung.', 'Rechtsprüfung (LA-07).', [T.cc, T.m3]],
  [43, 'produkte', 'UMGESETZT', 'M5', 'Vorschau der Kalkulation im Angebot aus den eigenen Daten des Kunden (max. 8 Positionen), Datei erst nach bestätigter Zahlung.', '', [T.care]],
  [44, 'produkte', 'TEILWEISE', 'M2', 'Komplexitäts- und Kapazitätsgrenzen, „keine Kapazität“ statt Risiko.', 'Lernende Produktionsplanung.', [T.prod]],
  [45, 'berichte', 'GEPLANT', 'M6', '', 'Entscheidungsrat mehrerer Agenten.', []],
  [46, 'produkte', 'TEILWEISE', 'M2', 'Rechtenachweis je Artefakt (Herkunft, Generator, Lizenz).', 'Prüfung fremder Inhalte.', [T.prod]],
  [47, 'kunden', 'TEILWEISE', 'M4', 'Abnahme durch den Kunden; Mangelmeldung wird zur Reklamation mit Nachbesserung/Erstattung durch den Eigentümer.', 'Automatische Nachbesserungsläufe.', [T.care]],
  [50, 'berichte', 'TEILWEISE', 'M6', 'Deckungsbeitrag je Produktart aus dem Hauptbuch (Zahlungen − Gebühren − Erstattungen) mit Aufwandsindikator.', 'Ressourcenbedarf je Bereich und Priorisierungsvorschläge.', [T.pfb]],
  [51, 'kunden', 'TEILWEISE', 'M4', 'Trennt nachweisbar zahlende Käufer von Interessenten ausschließlich aus eigenen Vorgängen (Anfrage → Angebot → Annahme → Zahlung).', 'Zahlungssignale externer, freigegebener Quellen.', [T.pfb]],
  [52, 'kunden', 'GEPLANT', 'M4', '', 'Kundeninterviews.', []],
  [53, 'auftraege', 'GEPLANT', 'M6', '', 'Ausführungs-Compiler.', []],
  [54, 'finanzen', 'UMGESETZT', 'M1', 'Geldfluss-Hauptbuch aus provider-bestätigten Ereignissen, LIVE/TEST getrennt.', '', [T.fin, T.m2]],
  [55, 'produkte', 'TEILWEISE', 'M2', 'Fähigkeitsmatrix mit Freischaltgrund; Freigabe zum Verkauf nur über die Policy.', 'Automatische Werkzeugsuche mit Lizenzprüfung.', [T.prod, T.pdf]],
  [56, 'produkte', 'GEPLANT', 'M5', '', 'Monetarisierungsmodelle.', []],
  [57, 'auftraege', 'TEILWEISE', 'M2', 'Lieferkriterien im Angebot, Rückerstattung bei Mangel nach Freigabe.', 'Gewährleistungsablauf.', [T.m2]],
  [58, 'kunden', 'TEILWEISE', 'M4', 'Erkennt zufriedene Kunden (abgenommen, ≥ 4 Sterne) mit passender freigegebener Ergänzung; Kontakt nur mit Einwilligung markiert. Zusatzangebote werden automatisch fertig formuliert (Einwilligung per DB erzwungen, max. 1 je 90 Tage, Abmeldelink).', 'Versand nach Freigabe des Kanals und AUTO_MARKETING_OUTREACH=true durch den Eigentümer.', [T.pfb, T.out]],
  [59, 'auftraege', 'TEILWEISE', 'M1', 'Mindestmarge und Kapazitätsprüfung vor Annahme.', 'Gewinnorientierte Kapazitätsplanung.', [T.opp, T.prod]],
  [60, 'berichte', 'TEILWEISE', 'M1', 'Vollständige Prüfspur aller Entscheidungen.', 'Unabhängiger Prüfbericht.', [T.gov]],
  [61, 'kunden', 'TEILWEISE', 'M4', 'Bezahlte Ausschreibungen aus TED.', 'Weitere Quellen.', [T.m1]],
  [62, 'kunden', 'TEILWEISE', 'M4', 'Angebotsentwürfe zu Ausschreibungen, nie automatisch versendet.', 'Vollständige Angebotsunterlagen.', [T.m1]],
  [63, 'kunden', 'GEPLANT', 'M6', '', 'Gebündelte Nachfrage.', []],
  [64, 'produkte', 'GEPLANT', 'M6', '', 'Individual zu SaaS.', []],
  [65, 'produkte', 'GEPLANT', 'M6', '', 'White-Label.', []],
  [66, 'produkte', 'GEPLANT', 'M5', '', 'Integrationen.', []],
  [67, 'finanzen', 'GEPLANT', 'M5', '', 'Nutzungsabrechnung.', []],
  [68, 'auftraege', 'TEILWEISE', 'M1', 'Lieferfrist im Angebot, Jobwarteschlange.', 'Terminplanung.', [T.ops]],
  [69, 'finanzen', 'TEILWEISE', 'M3', 'EU-Marktprüfung, B2B/B2C-Unterscheidung; Steuervorschläge für Sitz Italien (forfettario, ordinario, EU-B2B Reverse Charge), OSS-Fälle ohne Vorschlag.', 'Freigabe der Steuerregeln durch die Steuerberatung (LA-06).', [T.m3, T.it]],
  [70, 'berichte', 'GEPLANT', 'M6', '', 'Wachstumsexperimente.', []],
  [71, 'auftraege', 'TEILWEISE', 'M6', 'Maschinenlesbarer Angebotskatalog unter /api/katalog (Produkte, Eingabeschema, Preisregeln, Bestellweg über /api/leads), Testbetrieb gekennzeichnet.', 'Eigene Testzugänge für Einkaufssysteme.', [T.pfb]],
  [72, 'auftraege', 'UMGESETZT', 'M1', 'Durchgehende Kette Anfrage → Zahlung → Produktion → Lieferung → Beleg → Abgleich → Auszahlung → Bank-Testbeleg → Abschluss.', '', [T.e2e, T.bank]],
  [73, 'finanzen', 'TEILWEISE', 'M1', 'Vorkasse vor Produktion.', 'Meilensteinzahlungen.', [T.gov]],
  [74, 'kunden', 'GEPLANT', 'M5', '', 'Kundenarbeitsbereiche.', []],
  [75, 'produkte', 'TEILWEISE', 'M1', 'Signierte, kundengebundene Download-Berechtigungen, Lizenztext.', 'Lizenzverwaltung.', [T.prod, T.sec]],
  [76, 'kunden', 'GEPLANT', 'M6', '', 'Empfehlungsprogramm.', []],
  [77, 'kunden', 'TEILWEISE', 'M2', 'Dispute-Status und Buchung.', 'Klärungsablauf.', [T.m2]],
  [78, 'auftraege', 'UMGESETZT', 'M1', 'Ausnahmen gehen zur Eigentümerprüfung statt abzustürzen (blockierte Lieferung, Dead-Letter).', '', [T.prod, T.cc]],
  [79, 'finanzen', 'TEILWEISE', 'M1', 'Deckungsbeitrag nach Erstattungen, Gebühren, Disputes.', 'Echtzeit-Gewinnschutz.', [T.fin]],
  [80, 'finanzen', 'TEILWEISE', 'M1', 'Bankeingang nur mit gesondertem Kontoauszug (CSV/camt.053), feste Abgleichregeln, Abschluss erst danach – im Testbetrieb nachgewiesen.', 'Echter erster Euro erst im freigegebenen Live-Pilot (LA-03/LA-04).', [T.fin, T.bank]],
  [81, 'berichte', 'GEPLANT', 'M6', '', 'Nachfrage-Wissensgraph.', []],
  [82, 'produkte', 'TEILWEISE', 'M5', 'Eigene getestete Bausteine werden wiederverwendet: PDF-Erzeugung, ZIP, CSV mit Formelschutz, Design-System der Oberflächen.', 'Katalog der Bausteine mit Versionierung.', [T.cc, T.bch, T.ui]],
  [83, 'produkte', 'TEILWEISE', 'M5', 'Reproduzierbare Prüfungen: Kontrast, Beschriftungen, Struktur, keine internen Kennungen im Text, Breiten 320–1440 px.', 'Nutzungstests mit echten Personen.', [T.ui, T.docs]],
  [84, 'auftraege', 'UMGESETZT', 'M1', 'Lieferkriterien aus dem Angebot werden zu automatischen Prüfungen; Abnahme oder Mangel durch den Kunden; vollständige Nachweiskette (QA, Prüfsumme, Herkunftsnachweis). Keine automatische Abnahme.', '', [T.opp, T.care]],
  [85, 'berichte', 'TEILWEISE', 'M0', 'Oberfläche zeigt keine fiktiven Umsätze; Test/Live getrennt, per Test geprüft.', 'Prüfung von Werbeaussagen.', [T.ui]],
  [86, 'kunden', 'UMGESETZT', 'M1', 'Kundenportal: Aufträge mit Fortschritt, Vertragsbestätigung, Beleg-PDF, Download, Datenexport, Support.', '', [T.e2e, T.cc, T.docs]],
  [87, 'produkte', 'TEILWEISE', 'M5', 'Lebenszyklus je Produktart aus Lieferungen, Prüffehlern und Mängeln mit Einschätzung neu/stabil/prüfen; Version sichtbar.', 'Geplante Versionspflege und Ablösung mit Migrationsprüfung.', [T.plc]],
  [88, 'berichte', 'UMGESETZT', 'M4', 'Trichter aus echten Datensätzen und technischen Fehlerdaten (Zahlungsabbrüche, abgelehnte Annahmen, QA, angehaltene Aufgaben); benennt Engpass und nächsten Schritt; Null-Umsatz ehrlich.', '', [T.ins]],
  [89, 'berichte', 'GEPLANT', 'M6', '', 'Beobachtung von Rechtsänderungen.', []],
  [90, 'berichte', 'UMGESETZT', 'M0', 'Eigentümer-Grenzen einmalig: Policy, Notstopps, Freigaben mit Nachweis.', '', [T.gov, T.m3]],
  [91, 'kunden', 'GEPLANT', 'M6', '', 'Unternehmensbeschaffung.', []],
  [92, 'auftraege', 'UMGESETZT', 'M5', 'Erweiterungswunsch im Portal wird zum eigenen Nachtragsangebot (gleiche Produktart und Aufschlag, nur neue Positionen); beauftragt erst nach Annahme und Zahlung, Original unverändert.', '', [T.bch]],
  [93, 'produkte', 'TEILWEISE', 'M5', 'Paket Tabelle + PDF (ZIP) mit Prüfung jeder enthaltenen Datei; Preis aus tatsächlichem Mehraufwand, kein Scheinrabatt; Verkauf nach Policy-Freigabe.', 'Weitere Pakete, sobald weitere Produktarten belegt sind.', [T.bch]],
  [94, 'produkte', 'UMGESETZT', 'M2', 'Lieferung nur mit bestandenem Prüfprotokoll und Prüfsumme – für jede Produktart eigene Prüfungen.', '', [T.prod, T.pdf]],
  [95, 'berichte', 'TEILWEISE', 'M4', 'Bezahlter Umsatz je erlaubter Herkunft (eigenes Formular, freigegebene Ausschreibungen) ohne Tracking, mit Hinweis auf Messunsicherheit.', 'Kosten je Kanal, sobald bezahlte Kanäle freigegeben sind.', [T.ins]],
  [96, 'produkte', 'TEILWEISE', 'M0', 'Zeichenkodierung im Produkt geprüft; Kontrast/Struktur von Konsole und Kundenseiten per Test.', 'Lokalisierung.', [T.prod, T.ui, T.docs]],
  [97, 'kunden', 'UMGESETZT', 'M1', 'Einwilligungen mit Zweck und Widerruf; ohne Einwilligung keine Werbenachricht; Ein-Klick-Abmeldung /abmelden mit signiertem Link.', '', [T.acq, T.out]],
  [98, 'finanzen', 'UMGESETZT', 'M4', 'Erwartbarer Bankeingang aus bekannten Beträgen abzüglich offener Erstattungen, Erstattungs- und Steuerrücklage; Auszahlungsdatum nur mit eingetragener Anbieterfrist; Auszahlung nie als Bankguthaben.', '', [T.ins, T.done]],
  [99, 'berichte', 'UMGESETZT', 'M4', 'Abhängigkeit von einzelnen Kunden (anonymisiert) und Produktarten am bezahlten Umsatz mit Einstufung; Marktplätze: keine angebunden.', '', [T.ins, T.done]],
  [100, 'berichte', 'TEILWEISE', 'M3', 'Meilenstein-Freigaben LA-01…12 mit Nachweispflicht.', 'Automatische Meilensteinsteuerung.', [T.m3]],
  [101, 'kunden', 'TEILWEISE', 'M4', 'Typische Wartezeit zwischen Anfrage, Angebot, Annahme, Zahlung und Lieferung aus echten Zeitstempeln, ohne Tracking.', 'Priorisierte Verbesserungsvorschläge je Hindernis.', [T.ins]],
  [102, 'kunden', 'GEPLANT', 'M6', '', 'Multimodales Verständnis.', []],
  [103, 'auftraege', 'TEILWEISE', 'M1', 'Machbarkeitsprüfung der Produktklasse vor dem Angebot.', 'Vorab-Prototyp.', [T.opp]],
  [104, 'produkte', 'GEPLANT', 'M6', '', 'Produktvergleich.', []],
  [105, 'produkte', 'TEILWEISE', 'M6', 'Kunde wählt Lieferformat (Tabelle, PDF, Paket – soweit freigegeben); Preis und Umfang werden automatisch berechnet.', 'Weitere kombinierbare Funktionsbausteine.', [T.pdf, T.bch]],
  [106, 'auftraege', 'TEILWEISE', 'M5', 'Erklärte Risikohinweise je Auftrag (Verbraucher, Auftragswert, Land, Umfang, frühere Erstattungen), ausdrücklich keine Rechtsbewertung.', 'Szenarien für Verspätung und Haftung.', [T.care]],
  [107, 'berichte', 'UMGESETZT', 'M5', 'Aktualität der Quellen und abgelaufene Ausschreibungen werden gemeldet; abgelaufene Daten sind im Ablauf gesperrt (Qualifizierung, Angebot, Annahme, Angebotsentwurf).', '', [T.care, T.done]],
  [108, 'produkte', 'UMGESETZT', 'M2', 'Öffentlicher Herkunftsnachweis je Datei über die Prüfsumme: Produktart, Version, Prüfprotokoll, Rechte, KI-Werkzeuge (keine); Warnungen bei unvollständigem Nachweis; ohne Kundendaten.', '', [T.prod, T.care]],
  [109, 'berichte', 'GEPLANT', 'M6', '', 'Ursachenanalyse Wachstum.', []],
  [111, 'kunden', 'GEPLANT', 'M6', '', 'Nachfrage-Ereignisse.', []],
  [112, 'auftraege', 'GEPLANT', 'M3', '', 'Bezahlter Pilot.', []],
  [113, 'produkte', 'GEPLANT', 'M5', '', 'Bereitstellung beim Kunden.', []],
  [114, 'finanzen', 'UMGESETZT', 'M4', 'Rücklage aus der tatsächlichen Erstattungsquote (bei wenig Daten mindestens 10 %) plus offene Anträge; als Empfehlung, nie als auszahlbarer Gewinn.', '', [T.care]],
  [115, 'produkte', 'TEILWEISE', 'M2', 'Bearbeitbare CSV-Kalkulation (Excel-kompatibel).', 'Weitere bearbeitbare Formate.', [T.prod]],
  [116, 'produkte', 'GEPLANT', 'M6', '', 'Branchen-Editionen.', []],
  [117, 'produkte', 'GEPLANT', 'M6', '', 'Migration von Altsystemen.', []],
  [118, 'kunden', 'TEILWEISE', 'M5', 'Öffentliche Seite „Vertrauen & Fakten“ nur mit überprüfbaren Systemdaten: Anbieterstatus, Bezahlung, Qualität, Echtheitsprüfung, Anleitungen, echte Bewertungen (nie aus dem Testbetrieb).', 'Verifizierte Anbieterangaben und geprüfte Rechtstexte (LA-02, LA-07).', [T.trust]],
  [119, 'auftraege', 'UMGESETZT', 'M4', 'Abgebrochene/fehlgeschlagene Zahlungen werden erkannt; der Kunde setzt sie im Portal selbst fort (neue Zahlungssitzung, Besitzprüfung). Keine Werbeerinnerungen.', '', [T.trust]],
  [120, 'berichte', 'UMGESETZT', 'M5', 'Freiwillige Nutzenrückmeldung nach Lieferung; schlechte Ergebnisse erzeugen eine Qualitätsmaßnahme zur Entscheidung; Einwilligung zur Veröffentlichung getrennt.', '', [T.care, T.done]],
  [121, 'auftraege', 'GEPLANT', 'M6', '', 'Ergebnisbasierte Verträge.', []],
  [122, 'berichte', 'TEILWEISE', 'M1', 'Free-Tier-Tageslimit mit Drossel, „keine Kapazität“ statt Upgrade.', 'Übergreifende Kontingentsteuerung.', [T.gov, T.ops]],
  [123, 'produkte', 'TEILWEISE', 'M1', 'Nur freigegebene Produktklassen; regulierte Tätigkeiten nicht freischaltbar.', 'Expertenfreigaben.', [T.gov]],
  [124, 'uebersicht', 'UMGESETZT', 'M0', 'Anleitung je gelieferter Produktart (Inhalt, Schritte, ehrliche Grenzen – geprüft gegen die echte Datei) und Erste Schritte für den Eigentümer.', '', [T.ui, T.bch]],
  [125, 'berichte', 'TEILWEISE', 'M6', 'Maschinenlesbarer Pass unter /.well-known/infinity-earn.json mit denselben überprüfbaren Fakten; Anbieterdaten ehrlich als unverifiziert.', 'Verifizierte Anbieterangaben und Vertragsunterlagen (LA-02, LA-07).', [T.trust]],
  [126, 'kunden', 'GEPLANT', 'M6', '', 'Übertragbare Reputation.', []],
  [127, 'finanzen', 'GEPLANT', 'M5', '', 'Preisexperimente.', []],
  [128, 'berichte', 'TEILWEISE', 'M6', 'Bericht docs/tech-debt.md (npm run tech-debt): priorisiert nach Dateigröße, offenen Markierungen und fehlendem Testbezug; Releases nur nach npm run verify.', 'Defekt- und Änderungskosten in die Priorisierung einbeziehen.', [T.plc]],
  [129, 'finanzen', 'GEPLANT', 'M5', '', 'Abo-Wert und Kündigungen.', []],
  [130, 'produkte', 'GEPLANT', 'M6', '', 'Ungenutzte Produkte wiederbeleben.', []],
  // --- Erweiterung 147 (Eigentümer, 13.11.2026): beauftragt, nur Vorhandenes ist als TEILWEISE belegt ---
  [131, 'kunden', 'TEILWEISE', 'M4', 'Quellenregister mit Nutzungsbedingungen-Freigabe; öffentliche EU-Ausschreibungen (TED) täglich mit Original-URL, Frist und Bewertung; nicht freigegebene Quellen bleiben aus.', 'Weitere lizenzierte Quellen und Plattform-Adapter; Duplikat-Zusammenführung über Quellen hinweg.', [T.m1, T.acq]],
  [132, 'kunden', 'TEILWEISE', 'M6', 'Zeitpunkt-Signale aus Ausschreibungsfristen: bestes Zeitfenster, Gründe, Belege, Sicherheitsband; ohne Frist TIMING_UNCERTAIN, kein Prozentwert (Admin → Wachstum).', 'Weitere belegte Ereignisarten (Standorteröffnung, Migration) aus lizenzierten Quellen.', [T.grow]],
  [133, 'kunden', 'TEILWEISE', 'M1', 'Qualifizierung und Machbarkeitsprüfung je Anfrage (Quelle, Kontaktgrundlage, Produktklasse, Umfang) mit Gründen.', 'Budget-/Betrugs-/Wirtschaftlichkeitsprüfung als eigene Entscheidung mit Belegen.', [T.opp, T.m1]],
  [134, 'auftraege', 'TEILWEISE', 'M4', 'Automatisches Festpreis-Angebot mit Lieferkriterien; Angebotsentwürfe für Ausschreibungen nur zur manuellen Einreichung.', 'Versionierte Angebotseinreichung mit Versandquittung über erlaubte Plattformen.', [T.opp, T.m1, T.adv]],
  [135, 'produkte', 'TEILWEISE', 'M6', 'Bedarfsseiten /loesungen/… nur für echte Leistungen: inhaltliche QA (echtes Angebot, keine Duplikate, keine Fake-Claims, DE/IT/EN), Zustände QA_BLOCKED/PUBLISHED/UNDER_REVIEW, Sitemap nur veröffentlichte.', 'Ansichten/Anfragen je Seite aus Search Console; weitere Cluster erst bei belegtem Bedarf.', [T.grow]],
  [136, 'kunden', 'TEILWEISE', 'M4', 'Produktberater (DE/IT/EN) mit Rückfragen und ehrlicher Ablehnung; Angebotsvorschau aus den eigenen Positionen; bedienbare Demo der Mini-Warenwirtschaft mit Beispieldaten unter /demo/warenwirtschaft.', 'Automatische Mini-Vorschau je Anfrage in isolierter Sandbox.', [T.adv, T.mwui, T.p4]],
  [137, 'kunden', 'TEILWEISE', 'M1', 'Jede Kundennachricht läuft durch die Kontaktentscheidung (Einwilligung, Opt-out, Werbeschalter); Kanalstatus ehrlich; Ausschreibungs-Kontakte werden nie angeschrieben.', 'Kanal-/Rechtsraum-Policies je Plattform mit Versandquittung.', [T.out, T.acq, T.gp]],
  [138, 'kunden', 'TEILWEISE', 'M6', 'Antwort-Warteschlange aus echten Zeitstempeln (Eingang → Angebot → Nachricht) mit Priorität nach Frist, Zuständen QUEUED/PREPARED/SENT/POLICY_BLOCKED/QUOTA_BLOCKED/EXPIRED und Kontaktregel vor Versand.', 'Versand über echten Adapter mit Retry/Backoff, sobald ein E-Mail-Anbieter verbunden ist.', [T.grow, T.out]],
  [139, 'kunden', 'TEILWEISE', 'M6', 'Partner nur mit Zustimmung und Vertrag, Empfehlungscode (First-Touch), Provision nur aus bestätigtem Zahlungsereignis, Verfall bei Erstattung, Freigabe durch den Eigentümer.', 'Partneransicht mit eigenem Zugang; Auszahlung bleibt außerhalb des Systems.', [T.grow]],
  [140, 'berichte', 'TEILWEISE', 'M6', 'Erste-Kunden-Experimente mit festem Budget 0 € (Datenbankregel), 1–3 eigenen Kanälen, Entscheidung nur aus echten bezahlten Aufträgen; Testzahlungen zählen nicht.', 'Erster echter Live-Auftrag (erst nach LA-Freigaben möglich).', [T.grow]],
  [146, 'berichte', 'TEILWEISE', 'M5', 'robots.txt (interne Bereiche gesperrt), sitemap.xml, Canonical und hreflang für DE/IT/EN.', 'Eigene Domain und Search Console (Eigentümerverifikation), technischer Prüfbericht im Admin.', [T.land, T.gp]],
  [147, 'berichte', 'TEILWEISE', 'M6', 'Suchabsichten aus echten Anfragen (ohne Kontaktdaten): Kauf/Vergleich/Information, Zuordnung zu existierender Leistung oder Machbarkeitsprüfung, Quelle und Datum je Eintrag, kein Suchvolumen.', 'Search-Console-Daten nach Domain-Verifikation durch den Eigentümer.', [T.grow]],
  [148, 'berichte', 'TEILWEISE', 'M6', 'Ratgeber /ratgeber/angebot-bis-rechnung (DE/IT/EN) aus der Anleitung des gelieferten Programms; Prüfung auf echte Funktion, erfundene Berichte, Nutzen, Aktualität; Wiedervorlage bei Programmänderung.', 'Weitere Artikel erst mit neuen getesteten Funktionen.', [T.grow]],
  [149, 'berichte', 'TEILWEISE', 'M6', 'Verbreitungsplan mit datensparsamen Kampagnenlinks; nicht verbundene Kanäle NOT_CONNECTED, Direktnachrichten gesperrt, „veröffentlicht“ nur mit Kanalquittung, idempotent.', 'Kanäle (LinkedIn, Instagram, YouTube, Newsletter) verbindet der Eigentümer mit eigenem Konto.', [T.grow]],
  [150, 'berichte', 'TEILWEISE', 'M5', 'Serverseitig lesbare Seiten mit Titeln, Beschreibungen, Canonical/hreflang; maschinenlesbarer Katalog (/api/katalog) und Vertrauenspass (/.well-known/infinity-earn.json).', 'JSON-LD (Organization/Service) nach Validierung, Open Graph.', [T.land, T.trust]],
  [151, 'kunden', 'TEILWEISE', 'M6', 'Bedarfsseite Lagerverwaltung führt nur nach Freigabe zur echten Produktseite, sonst ehrlich zum Berater; Sprache und Ziel bleiben beim Sprachwechsel gleich; keine Personalisierung, keine Fake-Knappheit.', 'Weitere Bedarfsseiten nur mit eigenständigem Angebot.', [T.grow, T.p4]],
  [152, 'produkte', 'TEILWEISE', 'M3', 'Demo der Mini-Warenwirtschaft mit Beispieldaten (eigene CSP, kein Netzwerk, noindex), Produktseite mit echten Screenshots als Bilder gekennzeichnet, gleicher Funktionsumfang wie die Standard-Akte, Kaufweg nach Freigabe.', 'Ressourcenlimit je Sitzung ist durch reine Browser-Ausführung gegeben; weitere Produkte folgen.', [T.mwui, T.p4]],
  [153, 'kunden', 'TEILWEISE', 'M5', 'Seite „Vertrauen & Fakten“ nur mit überprüfbaren Daten, Echtheitsprüfung je Datei, ehrliche Pflichtangaben.', 'Verifizierte Anbieterangaben (LA-02) und freigegebene echte Bewertungen.', [T.trust, T.gp]],
  [154, 'auftraege', 'TEILWEISE', 'M2', 'Berater → Angebot → Annahme → Stripe Checkout (Sandbox) → signierter Webhook → Auftrag; Zahlung fortsetzen im Portal.', 'Stripe LIVE nach LA-Freigaben.', [T.e2e, T.adv, T.trust]],
  [155, 'berichte', 'TEILWEISE', 'M6', 'Funnel je Kanal: Anfragen → Angebote → bezahlte Aufträge (nur mit Zahlungsereignis) → Lieferungen → Netto (Zahlung − Gebühren − Erstattung); Auszahlung und bankbestätigt getrennt; „nicht zuordenbar“ erlaubt; Optimierung pausiert bei zu wenig Daten.', 'Impressionen/Klicks erst mit verbundener Search Console.', [T.grow]],
  // --- Erweiterung 157 (Eigentümer, 13.11.2026): Universal-Produktion 156–165 – nur Belegtes ist TEILWEISE ---
  [156, 'auftraege', 'TEILWEISE', 'M6', 'Auftragsanforderung aus dem Kundentext (DE/IT/EN): Fachbereich, Lieferumfang je Produktart (z. B. Windows-ERP → Datenmodell, Rollen, Installer, Tests; Excel → Zell-/Formel-/Dateiprüfung), Zielplattform, Formate, MUSS/SOLL/OPTIONAL, Abnahmekriterien; Rückfrage bei fehlender Plattform, Konflikte bei Widersprüchen, REVIEW bei Unbekanntem; Anhänge nur als Daten; Duplikate idempotent; Scope-Versionen mit Originaltext und Kundenbestätigung (Admin → Aufträge → Anforderungen).', 'Sprach- und Dokumentanalyse (braucht KI-Zugang mit Kostenfreigabe); automatische Übernahme in Angebot 134/162.', [T.asg]],
  [157, 'produkte', 'TEILWEISE', 'M6', 'Echtes Windows-Programm „Lager & Rechnung“ (C#/WinForms, .NET Framework 4.x aus Windows, 59 KB) mit Artikeln, Lagerbewegungen ohne negativen Bestand, Rechnungen mit lückenlosen Nummern und Steuer, CSV-/HTML-Export, atomarer Speicherung mit Sicherung, DE/IT/EN, Firmenname/-farbe/Steuersätze je Kunde; Installer pro Benutzer ohne Adminrechte mit Startmenü, Apps-&-Features-Eintrag, Update und Deinstallation, die nur eigene Dateien entfernt und Kundendaten behält; ehrlich als unsigniert gekennzeichnet (Windows meldet NotSigned); Meldungen und Installer in DE/IT/EN; bebilderte Anleitung DE/IT/EN mit echten Bildschirmfotos je Kundenfassung; Freigabe-Akte im Admin.', 'Rechnungen mit Pflichtangaben (§ 14 UStG / AT § 11), Kunden- und Firmenstamm, FatturaPA-Export für Italien. Verkauf gesperrt: FatturaPA amtlich ungeprüft (XSD, SdI-Annahme – UNVERIFIED) und kein Bau je Auftrag aus der Cloud-Produktion (braucht Windows-Build-Rechner); Code-Signatur (kostenpflichtig); Festpreis. macOS/iOS BLOCKED (Mac + Apple-Konto, Kostenfreigabe).', [T.win, T.winManual]],
  [158, 'produkte', 'TEILWEISE', 'M6', 'Echter Windows-Test je Build (lokal Windows 11 und in der GitHub-CI auf Windows Server): Installation, Start mit aufgebauter Oberfläche und Bildschirmfoto, Daten über Neustart, gleichzeitige Zugriffe ohne Datenverlust, Update mit erhaltenen Daten, laufendes Programm blockiert Update/Deinstallation, fehlende Voraussetzung, Deinstallation ohne fremde Dateien; Signaturstatus von Windows abgefragt; auf anderen Systemen ehrlich übersprungen.', 'macOS UNVERIFIED (keine Hardware), Linux nicht unterstützt; Tests für hohe Bildschirmskalierung und Tastaturbedienung; Ressourcen-Grenzwerte je Vertrag.', [T.win]],
  [159, 'produkte', 'TEILWEISE', 'M6', 'Kalkulationen als Tabelle (CSV) und PDF mit automatischer Prüfung von Summen, Rundung, Sonderzeichen und Layout gegen die echte Datei; PDF zusätzlich zur bearbeitbaren Tabelle.', 'Bearbeitbare .xlsx/.docx/.pptx mit Formeln, Diagrammen und Metadaten-Bereinigung.', [T.qs, T.pdf]],
  [160, 'produkte', 'GESPERRT', 'M6', '', 'Grafik, 3D, Audio und Video sind auf kostenloser Infrastruktur nicht zuverlässig herstellbar und prüfbar; gesperrt bis zum echten Fähigkeitsnachweis (keine kostenpflichtigen Render-Dienste ohne Freigabe).', []],
  [161, 'kunden', 'TEILWEISE', 'M6', 'Datei-/Zugangsanfrage nur beim Kunden des Auftrags (Admin → Auftrag → Dateien); sicherer Upload im Portal ohne JavaScript (Größe, erlaubte Endung, Magic Bytes, keine ausführbaren Dateien, Makros, PDF-Skripte, EICAR, Zugangsdaten); abgelehnte Dateien werden nicht gespeichert; Nutzungsrechte-Pflicht; befristete, widerrufbare, auftragsbezogene Freigabe an die Produktion mit Protokoll; Mandantentrennung; Dubletten versioniert; Zugänge nur per Einladung (keine Passwörter); Produktion pausiert bei fehlender Datei; Löschantrag löscht Dateien.', 'Vollständiger Virenscanner (kostenlos im Worker nicht verfügbar); E-Mail-Benachrichtigung erst mit verbundenem Versandkanal; Verwendung der Dateien in den Generatoren (z. B. Logo im Programm).', [T.ast]],
  [162, 'kunden', 'GEPLANT', 'M6', '', 'Freelancer-Angebote nur auf Plattformen mit Konto des Eigentümers und erlaubter Schnittstelle; baut auf 134 (Angebote) und 137 (Kontaktregeln) auf; kein automatischer Versand, wo Bots untersagt sind.', []],
  [163, 'produkte', 'GESPERRT', 'M6', '', 'Autonome KI-Fachrollen brauchen eine KI-API (kostenpflichtig, Eigentümer-Entscheidung L11); ohne Freigabe arbeitet nur der deterministische Kern mit Warteschlange.', []],
  [164, 'auftraege', 'TEILWEISE', 'M6', 'Admin-Vorschau des echten Produkts (Warenwirtschaft interaktiv), Kundenportal mit Besitzprüfung, Änderungswünsche nach Lieferung als eigener Zusatzauftrag mit Preis und Zahlung.', 'Abnahmesitzung vor der Übergabe mit Feedback je Version und dokumentierter Abnahme.', [T.p4, T.bch, T.docs]],
  [165, 'auftraege', 'TEILWEISE', 'M6', 'Lieferung erst nach Zahlung und bestandener Prüfung, Prüfsumme und Version je Artefakt, Download nur für den berechtigten Kunden mit Ablaufzeit, Anleitung je Produktart; Bankeingang nur mit Bankbeleg, nie aus Stripe-Auszahlung allein.', 'Installer-Nachweis, Lizenz-/Rechteübertragung als Vertragsdokument, Supportfenster.', [T.prod, T.docs, T.bank]],
];

export const MODULE_STATUS: readonly ModuleStatus[] = Object.freeze(
  ROWS.map(([n, area, status, milestone, umgesetzt, offen, evidence]) =>
    Object.freeze({ n, area, status, milestone, ...(umgesetzt ? { umgesetzt } : {}), ...(offen ? { offen } : {}), evidence: Object.freeze([...evidence]) as string[] }),
  ),
);

export function statusOf(n: number): ModuleStatus | undefined {
  return MODULE_STATUS.find((s) => s.n === n);
}

export function statusCounts(): Record<ImplStatus, number> {
  const c: Record<ImplStatus, number> = { UMGESETZT: 0, TEILWEISE: 0, GEPLANT: 0, GESPERRT: 0 };
  for (const s of MODULE_STATUS) c[s.status]++;
  return c;
}

export function modulesWithStatus(): (RegistryModule & ModuleStatus & { titleDe: string })[] {
  return REGISTRY.modules.map((m) => ({ ...m, ...(statusOf(m.n) as ModuleStatus), titleDe: TITLES_DE[m.n] ?? m.title }));
}

export const AREA_LABEL: Record<Area, string> = {
  uebersicht: 'Übersicht',
  kunden: 'Kunden',
  auftraege: 'Aufträge',
  produkte: 'Produkte',
  finanzen: 'Finanzen',
  berichte: 'Berichte',
};

export const STATUS_LABEL: Record<ImplStatus, string> = {
  UMGESETZT: 'Läuft im Testbetrieb',
  TEILWEISE: 'Teilweise umgesetzt',
  GEPLANT: 'Noch nicht gebaut',
  GESPERRT: 'Bewusst gesperrt',
};
