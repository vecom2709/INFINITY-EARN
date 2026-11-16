# INFINITY EARN – Tiefenprüfung der teilweise umgesetzten Funktionen

Eigenreview durch Claude Fable 5.2. Geprüft wird bereichsweise, was die 86 als „teilweise umgesetzt“ geführten
Funktionen im umgesetzten Teil wirklich leisten. Methode: Durchgang im echten Browser gegen einen lokalen Prüfserver
(`scripts/serve-deepcheck.ts`: frische Test-Datenbank, simulierte Zahlung, Autopilot-Takt alle 2 Sekunden), ergänzt
durch die vorhandenen automatischen Tests. Keine Funktion wird dadurch „produktionsreif“; der Status in der
Funktionsmatrix ändert sich nur, wenn der offene Rest einer Funktion wegfällt.

## Stand

| Bereich | Funktionen | Stand |
|---|---|---|
| M1 Kunde, Auftrag, Abrechnung | 18 | **Durchgang 1 erledigt (16.11.2026)** – 7 im Browser begangen, 11 nur über automatische Tests |
| M0 Grundlagen | 2 | **Durchgang 3 erledigt (16.11.2026)** – 1 im Browser begangen, 1 nur über automatische Tests |
| M2 Produktherstellung | 9 | **Durchgang 2 erledigt (16.11.2026)** – 3 an echten Dateien geprüft, 6 nur über automatische Tests |
| M3 Recht und Freigaben | 6 | **Durchgang 3 erledigt (16.11.2026)** – 5 mit Grenzfällen und im Browser geprüft, 1 nur über automatische Tests |
| M4 Steuerung, Markt, Marketing | 19 | offen |
| M5 | 9 | offen |
| M6 | 23 | offen |

## Durchgang 1 – M1 (16.11.2026)

**Begangener Weg im Browser:** Anfrage mit Excel-Format → Angebot → Annahme mit Rechnungsangaben → Testzahlung →
Herstellung und Lieferung (nach etwa 6 Sekunden im Portal) → Reklamation gesendet → Abnahme bestätigt →
Eigentümer-Anmeldung → Übersicht, Kunden, Aufträge, Produkte, Finanzen, Berichte, Einstellungen, Aktivitäten.

| Nr. | Funktion | Im Browser begangen | Ergebnis |
|---|---|---|---|
| 12 | Kundenservice und Rückgaben | Reklamation über das Portal, erscheint in Übersicht und Kunden | bestanden; Widerruf und Erstattungsfreigabe nicht begangen |
| 16 | Belege und Steuer | Beleg TEST-2026-000001 im Portal und unter Finanzen sichtbar | Link vorhanden; PDF nicht geöffnet, FatturaPA nicht begangen |
| 68 | Lieferplanung | Lieferfrist im Angebot („2 Tage nach Zahlungseingang“), Lieferung über Warteschlange | bestanden |
| 73 | Vorkasse | Herstellung erst nach bestätigter Testzahlung | bestanden |
| 75 | Lizenzen und Zugänge | Signierter Download-Link im Portal | Link vorhanden; Datei nicht heruntergeladen |
| 103 | Machbarkeit vor dem Verkauf | Nur freigegebene Formate wählbar | bestanden |
| 133 | Käufer prüfen | Anfrage führt automatisch zum Angebot | bestanden |
| 35, 38, 39, 40, 59, 60, 79, 80, 122, 123, 137 | Betrugsschutz, Wiederanlauf, Belegarchiv, Gewinnübersicht, Kapazität, Prüfspur, Gewinnschutz, Bankeingang, Kontingente, regulierte Tätigkeiten, Kontaktregeln | nein | nur durch automatische Tests belegt |

### Funde und Reparaturen

| Fund | Schwere | Stand |
|---|---|---|
| Alle Formulare wurden in echten Browsern abgewiesen (Referrer-Policy + Fremdseiten-Schutz) | P1 | behoben (Commit 4a63984), siehe Reparaturprotokoll |
| Angebot zeigte technische Kürzel („xlsx_formulas, formula_injection“) als Lieferkriterien | P3 | behoben – verständliche Namen in DE/IT/EN, auch in der Vertragsbestätigung |
| Angebot zeigte „Gültig gültig bis …“ | P4 | behoben |
| Portal nannte die Excel-Datei „Ihre Kalkulation (CSV)“ | P3 | behoben |
| Feld „Nachricht“ im Anfrageformular ist Pflicht, obwohl die Kalkulation schon alle Angaben enthält | P4 | **offen** – Entscheidung des Eigentümers, ob Pflicht bleiben soll |
| Datumsangaben für Kunden im Format 2026-11-26 statt 26.11.2026 | P4 | **offen** |

Regressionstests: `tests/integration/deepcheck-customer.test.ts`, `tests/security/tenant-isolation.test.ts`.

### Nicht geprüft in diesem Durchgang

- Herunterladen und Öffnen der gelieferten Datei, des Belegs und der Vertragsbestätigung im Browser.
- Fehlgeschlagene und ausstehende Zahlung, Widerruf, Nachtrag, Datenexport.
- Italienische und englische Fassung des ganzen Wegs (nur die Angebotsseite auf Englisch per Test).
- Verwaltungsformulare (Freigaben, Stopps, Entscheidungen) im Browser.
- Staging: dort wurde nur das Berater-Formular im Browser abgeschickt; Zahlungen löse ich auf Staging nicht aus.

## Durchgang 2 – M2 Produktherstellung (16.11.2026)

**Methode:** Alle vier Kalkulationsformate (CSV, Excel, PDF, Paket) mit schwierigen Eingaben hergestellt – Umlaute,
Anführungszeichen, Semikolon, Formel-Anfänge (=, +, -, @), Zeilenumbruch und Tabulator in der Bezeichnung, Höchstbetrag,
griechische und japanische Zeichen, Emoji, 95 Positionen über zwei Seiten – und die Dateien angesehen (PDF als Bild).

| Nr. | Funktion | Geprüft | Ergebnis |
|---|---|---|---|
| 6 | Produktherstellung | alle vier Formate mit harten Eingaben | bestanden nach Reparatur (siehe Funde) |
| 115 | Bearbeitbare Lieferergebnisse | CSV-Inhalt Zeile für Zeile, Excel-Formeln | bestanden; neben CSV gibt es jetzt die Excel-Datei |
| 57 | Liefergarantie | Lieferkriterien im Angebot (jetzt verständlich benannt) | bestanden; Gewährleistungsablauf nicht begangen |
| 36, 44, 46, 55, 77, 154 | Erstattungen/Disputes, Produktionsplanung, Rechtenachweis, Fähigkeitsmatrix, Streitfälle, Stripe-Sandbox | nein | nur durch automatische Tests belegt |

### Funde und Reparaturen

| Fund | Schwere | Stand |
|---|---|---|
| PDF ersetzte nicht darstellbare Zeichen (Griechisch, Japanisch, Emoji) stillschweigend durch „?“; die Abnahme meldete „bestanden“ | P2 | behoben – solche Eingaben werden vor dem Angebot als offener Punkt gemeldet, PDF und Paket lehnen sie ab; Excel und CSV liefern sie unverändert |
| Beträge im deutschen und italienischen PDF mit Punkt statt Komma (45.00 statt 45,00), ohne Tausendertrennung | P3 | behoben – Schreibweise folgt der Dokumentsprache |
| Seitenangabe im italienischen und englischen PDF auf Deutsch („Seite 1 von 2“) | P3 | behoben |
| Bezeichnung mit Zeilenumbruch wurde im PDF mitten in der Position umbrochen | P4 | behoben |
| PDF ist eine einfache Zeilenliste, keine Tabelle mit Spalten | P3 | **offen** – Gestaltung, kein Fehler |
| CSV öffnet sich in deutschem Excel per Doppelklick nicht in Spalten (Komma als Trennzeichen) | P3 | **offen** – in der Anleitung beschrieben; die Excel-Datei ist die Antwort darauf |

PDF und Paket tragen wegen der geänderten Ausgabe die Version 2. Regressionstests: `tests/products/deepcheck-production.test.ts`.

### Nicht geprüft in diesem Durchgang

- Dateien in den echten Programmen geöffnet (Excel, Adobe Reader, LibreOffice) – das PDF wurde nur als Bild angesehen.
- Warenwirtschaft, Windows-Programm und KI-Texte (eigene Produktarten mit eigenen Prüfungen).
- Erstattung, Dispute und Stripe-Sandbox im Browser.

## Durchgang 3 – M3 Recht und Freigaben, M0 Grundlagen (16.11.2026)

**Methode:** Annahme eines Angebots mit 17 Grenzfällen angegriffen (Länder außerhalb der EU, falsche Ländercodes,
Verbraucher ohne Zustimmungen, unbekannter Käufertyp, fehlende Angaben, falscher Link, unsinnige USt-ID, doppelte
Annahme). Im Browser: Annahme als Verbraucher ohne Zustimmung, Rückweg zum Angebot, Demo der Warenwirtschaft,
Live-Freigabe ohne Nachweis in der Verwaltung.

| Nr. | Funktion | Geprüft | Ergebnis |
|---|---|---|---|
| 17 | Rechtliche Absicherung | Verbraucherverzicht, Käufertyp, Live-Freigaben | bestanden nach Reparatur (Käufertyp) |
| 30 | Verkauf in mehreren Ländern | US, CH, GB abgelehnt; DE, IT angenommen; Kleinschreibung und Leerzeichen toleriert | bestanden |
| 42 | Vertragsabschluss | Annahme nur mit Link und Zustimmung; doppelte Annahme erzeugt keinen zweiten Auftrag | bestanden; Vertrags-PDF nicht geöffnet |
| 100 | Meilensteine | Freigabe LA-07 ohne Nachweis im Browser versucht: abgelehnt, weiter 0 von 12 | bestanden |
| 152 | Produkt ausprobieren | Demo der Warenwirtschaft im Browser geladen, keine Skriptfehler | geladen; Funktionen der Demo nicht einzeln bedient |
| 85 | Ehrliche Werbeaussagen | Ansicht „Echte Daten“ in Durchgang 1 ohne Testzahlen | bestanden |
| 69, 96 | Steuer- und Länderprüfung, Barrierefreiheit | nein | nur durch automatische Tests belegt |

### Funde und Reparaturen

| Fund | Schwere | Stand |
|---|---|---|
| Ein fehlender oder unbekannter Käufertyp galt stillschweigend als „Unternehmen“ – der Verbraucherverzicht wurde dann nicht verlangt | P2 | behoben – solche Annahmen werden abgelehnt |
| USt-ID wurde ungeprüft gespeichert (auch „<script>“) und wäre so auf Vertragsbestätigung und Beleg gelandet | P3 | behoben – Formatprüfung; die Gültigkeit bei der Behörde wird weiterhin nicht geprüft |
| Abgelehnte Annahme zeigte dem Kunden interne Kürzel („BUYER_DATA_INVALID“, „MARKET_NOT_ALLOWED“) ohne Rückweg | P3 | behoben – verständliche Meldungen in DE/IT/EN mit Link zurück zum Angebot |
| Verwaltung zeigt bei Fehlern das Kürzel vor der Meldung („EVIDENCE_REQUIRED: …“) | P4 | **offen** – nur für den Eigentümer sichtbar |
| Wer als Verbraucher „Unternehmen“ auswählt, umgeht den Verzicht | – | **kein Softwarefehler** – nur rechtlich zu lösen (Bedingungen, LA-07) |

Regressionstests: `tests/integration/deepcheck-legal.test.ts`.

### Nicht geprüft in diesem Durchgang

- Steuervorschläge für den Sitz Italien und die FatturaPA im Browser.
- Barrierefreiheit mit Tastatur und Screenreader.
- Die Bedienung der Warenwirtschafts-Demo im Einzelnen.
