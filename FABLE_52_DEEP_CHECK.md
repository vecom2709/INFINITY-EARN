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
| M0 Grundlagen | 2 | offen |
| M2 Produktherstellung | 9 | offen |
| M3 Recht und Freigaben | 6 | offen |
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
