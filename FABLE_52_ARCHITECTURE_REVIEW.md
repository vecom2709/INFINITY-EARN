# FABLE 5.2 – Architektur-Review (17.0)

Stand 16.11.2026 · Eigenreview auf Basis von Code-Lesung und Messung.

## Kennzahlen (gemessen)
- 21.487 Zeilen TypeScript-Quelltext (ohne generierte Dateien), 6.992 Zeilen Tests, 396 Tests.
- **0 Laufzeit-Abhängigkeiten** (nur Entwicklungswerkzeuge: TypeScript, ESLint, Wrangler) – kein Lieferkettenrisiko im Betrieb; `npm audit`: 0 Schwachstellen.
- 15 Migrationen, 60 Tabellen, 56 Fremdschlüssel, 20 Indizes.
- Ein Cloudflare Worker und ein SQLite-Durable-Object als Transaktionskern, Takt per Alarm (60 s), Sicherung in Workers KV.

## Was trägt
1. **Ein konsistenter Transaktionskern** (Single-Thread-Durable-Object): keine verteilten Transaktionen, keine Wettläufe zwischen Zahlung, Produktion und Lieferung. Belegt: 60 parallele Aufträge ohne doppelte Lieferung oder doppelten Beleg.
2. **Plattformneutraler HTTP-Kern** mit zwei dünnen Adaptern (Node für Tests und lokal, Worker für Staging).
3. **Externe Arbeit als Bauauftrag** (Windows, KI): abholen, bauen, hochladen, unabhängige Abnahme im Worker. Schlüssel getrennt, keine Kundendaten in öffentlichen Protokollen.
4. **Policy-Engine vor jeder kritischen Aktion** (Produktion, Lieferung, Kosten) und Notstopps je Bereich.

## Schwächen und Risiken
| # | Befund | Auswirkung | Empfehlung |
|---|---|---|---|
| 1 | `services/core-api/src/http-core.ts` hat 1.233 Zeilen und 123 Routen in einer Funktion | schwer zu überblicken, Änderungen riskant | nach Bereichen in Routenmodule teilen (Anmeldung, Portal, Verwaltung, Agent) – reine Umstrukturierung, Tests vorhanden |
| 2 | Ein einziges Durable Object für alles | Obergrenze: ein Thread; bei vielen gleichzeitigen Kunden wird es der Engpass | für den Start ausreichend (lokal etwa 2–7 ms Rechenzeit je Seite); vor Wachstum Lasttest auf Staging |
| 3 | **Tests laufen mit anderem Speicheradapter als Staging** (Datei und Node-SQLite statt Durable-Object-SQLite) | Plattformfehler bleiben unentdeckt – in dieser Prüfung ein echter Fall (R-07) | weitere Tests mit `DoBlobStore`; mittelfristig ein lokaler Wrangler-Integrationstest (kostenlos) |
| 4 | Ratenbegrenzung und Login-Zähler nur im Arbeitsspeicher | gehen bei Neustart des Objekts verloren | genügt gegen Fluten; bei Bedarf in die Datenbank |
| 5 | Lieferdateien als BLOB in derselben Datenbank (Grenze 7 MB je Datei) | große Produkte (Video, große Installer) nicht speicherbar | bei Bedarf R2 – über dem Freikontingent kostenpflichtig, Freigabe nötig |
| 6 | GitHub-Zeitplan als einziger Auslöser externer Läufe | gemessen 3,7–7,3 Stunden Wartezeit | Sofort-Auslöser gebaut; braucht ein Token des Eigentümers |
| 7 | Externe Läufe hängen an GitHub (Verfügbarkeit, 60-Tage-Regel für Zeitpläne) | Ausfall verzögert Windows- und KI-Aufträge, nicht den Kern | Aufträge bleiben gespeichert und werden nach 3 Versuchen als nicht lieferfähig gemeldet |

## Tote oder doppelte Teile
- `/dashboard/experte` (ältere Detailansicht) existiert neben der neuen Konsole – bewusst als Fachansicht behalten, vom Crawler geprüft.
- Kein toter Bedienpfad gefunden (Crawler). Unbenutzte Exporte im Code wurden in dieser Sitzung nicht systematisch gesucht.

## Nicht geprüft
Rechenzeit- und Speichergrenzen des Cloudflare-Free-Tarifs unter echter Last; Verhalten bei sehr großer Datenbank.
