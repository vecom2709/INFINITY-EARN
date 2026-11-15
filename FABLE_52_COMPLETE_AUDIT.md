# FABLE 5.2 – Gesamtaudit INFINITY EARN (17.0)

Stand: 16.11.2026 · Modell: Claude Fable 5.2 (`claude-fable-5-2`) · Art: **Eigenreview** (kein unabhängiger zweiter Prüfer) · Umfang: **Teilprüfung**, siehe „Nicht geprüft“.

## 1. Ergebnis in einem Satz

Der deterministische Kern (Anfrage → Angebot → Zahlung im Testmodus → Produktion → Abnahme → Lieferung → Beleg) funktioniert nachweislich und läuft ohne privaten PC; **eine globale Produktionsreife liegt nicht vor**: 0 von 12 Live-Freigaben, nur 26 von 157 Funktionen vollständig belegt, mehrere beauftragte Produktarten (Excel mit Formeln, individuelle Web-Apps, Mobile, Medien) sind nicht herstellbar.

## 2. IST-Zustand (belegt)

| Punkt | Befund | Nachweis |
|---|---|---|
| Repository | `main` sauber, ein Zweig, 4985b8c vor dem Audit | `git status`, `git log` |
| Tests vor dem Audit | 381 + 1 E2E bestanden | `npm run verify` |
| Tests nach dem Audit | **396 + 1 E2E bestanden**, 0 übersprungen (Windows 11) | `npm run verify`, 16.11.2026 |
| CI | Linux + Windows grün für 4985b8c | GitHub Actions |
| Staging | erreichbar, Testbetrieb, Stripe-Sandbox, Rauchtest 27/27 | `scripts/smoke-http.ts` |
| Funktionen | 26 VERIFIED · 86 IMPLEMENTED · 42 SPECIFIED · 3 BLOCKED | `FABLE_52_FEATURE_MATRIX.json` (305 Nachweistests ausgeführt) |
| Bedienelemente | 101 Seiten, ~1.900 Links, 47 Formulare, 150 Knöpfe: 0 tote Elemente | `tests/integration/no-prototype.test.ts` |
| Mandantentrennung | Kunde A erreicht nichts von Kunde B (8 Lese-, 8 Schreibwege) | `tests/security/tenant-isolation.test.ts` |
| Last (lokal) | 60 Aufträge: 60 Lieferungen, 60 Belege, 0 doppelt; Seiten p50 31–140 ms bei 20 parallel, 0 Fehler | `scripts/perf-check.ts` |
| Staging-Antwortzeit | 0,17–0,44 s je Seite (5 Messungen) | curl, 16.11.2026 |

## 3. Gefundene Mängel in dieser Prüfung (Details: `FABLE_52_REPAIR_LOG.md`)

| # | Priorität | Mangel | Stand |
|---|---|---|---|
| 1 | P0 | Öffentliche Formulare ohne Begrenzung je Absender (Fluten der Datenbank/des Kontingents möglich) | **behoben** |
| 2 | P0 | Kunden-POSTs nur durch SameSite-Cookie gegen fremdgesteuerte Formulare geschützt | **behoben** (Herkunftsprüfung) |
| 3 | P1 | Falsche Zusage „Windows-Bau/KI-Text startet in bis zu 30 Minuten“ – gemessen 3,7–7,3 Stunden | **korrigiert**, Sofort-Auslöser gebaut (braucht Token des Eigentümers) |
| 4 | P1 | Test-Seite ohne Impressum war für Suchmaschinen freigegeben | **behoben** (noindex im Testbetrieb) |
| 5 | P2 | Kein systematischer Test auf tote Links/Knöpfe und auf Mandantentrennung über alle Wege | **behoben** (zwei neue Prüfwerkzeuge) |
| 6 | P3 | Szenario A (Excel mit Formeln): es gibt nur CSV/PDF, keine XLSX-Erzeugung | **offen** |
| 7 | P3 | Szenario C (individuelle B2B-Web-App): keine Produktionsfähigkeit | **offen/BLOCKED** |
| 8 | P4 | Startseite ohne strukturierte Daten (JSON-LD) und ohne Open-Graph-Angaben | **offen** |
| 9 | P2 | Echter KI-Lauf (Claude-Abo) nie ausgeführt – Token fehlt | **BLOCKED** (Eigentümer) |
| 10 | P2 | Passkey-Anmeldung nie in einem echten Browser ausprobiert | **UNVERIFIED** |

## 4. Nicht geprüft (ehrlich)

- Fachliche Tiefenprüfung jeder einzelnen der 157 Funktionen – die Matrix führt nur die vorhandenen Nachweistests aus.
- Visuelle Gestaltung, mobile Darstellung und Barrierefreiheit im echten Browser (kein Bildschirm-Durchgang in dieser Sitzung).
- Lasttest gegen Staging (bewusst nicht, um das kostenlose Kontingent nicht zu verbrauchen) – nur lokal.
- Wiederherstellung einer Sicherung in das laufende Durable Object (nur in lokale Datenbank, 13.11.2026).
- Windows 10, macOS, Linux-Desktop, Android, iOS: keine Testmöglichkeit vorhanden.
- Rechtliche und steuerliche Richtigkeit (keine Rechtsberatung).

## 5. Wiederaufnahme

Offene Arbeit in dieser Reihenfolge: (1) XLSX-Kalkulation mit echten Formeln als Produktart, (2) JSON-LD/Open Graph, (3) Tiefenprüfung der 86 IMPLEMENTED-Funktionen bereichsweise (Finanzen → Akquise → Wachstum), (4) Browser-Durchgang Landingpage/Admin/Passkey, (5) KI-Probe nach Token. Befehle: `npm run verify`, `node scripts/fable-feature-matrix.ts`, `node scripts/perf-check.ts`.
