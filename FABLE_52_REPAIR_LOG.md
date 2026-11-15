# FABLE 5.2 – Reparaturprotokoll (17.0)

Jede Zeile: Ursache → Nachweis des Fehlers → Änderung → Regressionstest → Ergebnis. Stand 16.11.2026.

## R-01 · Flutschutz für öffentliche Formulare (P0)
- **Ursache:** `/anfrage`, `/api/leads`, `/berater` und die Kundenwege nahmen beliebig viele POSTs je Absender an; nur der Admin-Login war begrenzt.
- **Nachweis:** Suche nach Begrenzungen in `http-core.ts` und `leads.ts` fand nur das Login-Limit.
- **Änderung:** `publicPostLimited()` in `services/core-api/src/http-core.ts` – 12 Einsendungen je IP in 10 Minuten für Anfragen, 40 für Kundenwege; Antwort 429 mit `Retry-After`; Abweisung im Audit (`security.public_post_rate_limited`). Zähler im Arbeitsspeicher (kein Datenbankwachstum).
- **Test:** `tests/security/flood.test.ts` (2) – 13. Anfrage 429, höchstens 12 Leads gespeichert, andere IP/Wege unberührt.
- **Grenze:** Zähler gehen bei Neustart des Durable Objects verloren; verteilte Angriffe mit vielen IPs begrenzt das nicht.

## R-02 · Herkunftsprüfung für POSTs (P0)
- **Ursache:** Kunden-POSTs haben kein CSRF-Token; Schutz bestand nur aus `SameSite=Lax`.
- **Änderung:** `crossSitePost()` – POST mit `Origin`, dessen Host nicht der aufgerufene Host ist, wird mit 403 abgelehnt und protokolliert. Aufrufe ohne `Origin` (Stripe-Webhook, Bau-Agent) bleiben über Signatur bzw. Schlüssel geschützt.
- **Test:** `tests/security/tenant-isolation.test.ts` – fremder Origin 403 und kein Erstattungsantrag; eigener Origin funktioniert.

## R-03 · Falsche Lieferzeit-Zusage (P1)
- **Ursache:** Annahme, GitHub starte den 15-Minuten-Zeitplan pünktlich.
- **Nachweis:** 9 geplante Läufe 14.–15.11.2026, Abstand min 221, Median 384, max 439 Minuten (`gh run list`).
- **Änderung:** Texte in Admin, Freigabe-Akte, Workflows korrigiert; `estimated_duration_minutes` 30 → 480 für `win-lager` und `ai-texte`; neuer Sofort-Auslöser `services/product-factory/src/dispatch.ts` (Worker stößt `workflow_dispatch` an, höchstens alle 10 Minuten, nur wenn etwas wartet, ohne Kundendaten). Aktiv erst mit `GITHUB_DISPATCH_TOKEN` + `GITHUB_REPOSITORY` (Token legt der Eigentümer an).
- **Test:** `tests/integration/dispatch.test.ts` (3) – ohne Token kein Aufruf; mit Token ein Anstoß je Fenster; Fehler von GitHub protokolliert, Auftrag bleibt wartend.
- **Offen:** echter Anstoß ungeprüft (kein Token).

## R-04 · Testseite für Suchmaschinen freigegeben (P1)
- **Nachweis:** Staging-Antworten ohne `noindex`, `robots.txt` „Allow: /“, Seite im Testbetrieb ohne Anbieterangaben.
- **Änderung:** Im Testbetrieb trägt jede Antwort `X-Robots-Tag: noindex, nofollow`.
- **Test:** `tests/security/https.test.ts`.

## R-05 · Fehlende systematische Prüfungen (P2)
- **Neu:** `tests/integration/no-prototype.test.ts` (4) – Crawler als Besucher, Kunde, Eigentümer; mit Selbsttest, der einen toten Link, ein Formular ins Leere und einen Knopf ohne Funktion findet.
- **Neu:** `tests/security/tenant-isolation.test.ts` (4).
- **Ergebnis:** keine toten Bedienelemente, keine Durchlässigkeit zwischen Kunden gefunden.

## R-06 · Fester Testschlüssel im neuen Messskript
- **Nachweis:** Der Repository-Geheimnis-Scan schlug beim Matrix-Lauf an (`scripts/perf-check.ts`).
- **Änderung:** Schlüssel und Passwort werden zur Laufzeit zufällig erzeugt. Scan wieder grün.

## R-07 · Zweiter Probebau wäre auf Cloudflare gescheitert (P1, Plattformunterschied)
- **Ursache:** Probeergebnisse wurden immer unter demselben Pfad gespeichert. Der lokale Dateispeicher überschreibt, der Cloudflare-Speicher (`DoBlobStore`, Einfügen ohne Ersetzen) wirft bei doppeltem Schlüssel einen Fehler. Der zweite Probebau auf Staging hätte mit einem Serverfehler geendet. Lokale Tests konnten das nicht zeigen.
- **Nachweis:** Code-Lesung `packages/storage/src/do-db.ts` (put) gegen `external-build.ts` (fester Pfad); auf Staging lief bisher genau ein Probebau.
- **Änderung:** eindeutiger Pfad je Probe, die vorherige Probedatei wird gelöscht (kein Anwachsen des Speichers).
- **Test:** `tests/products/win-lager/external-build.test.ts` – zwei Probebauten mit dem Cloudflare-Speicheradapter; alte Datei entfernt, neue vorhanden.
- **Lehre:** Tests laufen lokal mit einem anderen Speicheradapter als Staging; weitere Unterschiede sind möglich (Architektur-Review, Punkt 3).

## Nicht repariert (bewusst)
- JSON-LD/Open Graph, individuelle Web-App-Produktion – siehe `FABLE_52_PRODUCTION_READINESS.md`.

## Nachtrag 16.11.2026 – Excel-Kalkulation mit Formeln (Szenario A)
- **Lücke:** Geliefert wurde nur CSV/PDF, keine Arbeitsmappe mit Formeln.
- **Änderung:** Produktart `b2b-calc-xlsx` (`services/product-factory/src/capabilities/b2b-calc-xlsx.ts`), erzeugt ohne Fremdbibliothek und ohne installierte Programme. Eigene Rechenmaschine `services/product-factory/src/sheet-eval.ts` rechnet in der Abnahme die tatsächlichen Formeln der Datei nach und vergleicht mit der Fachberechnung.
- **Test:** `tests/products/b2b-calc-xlsx/xlsx.test.ts` (6 Tests): Aufbau, Formeln, Rundungsfälle, Manipulation fällt durch, Kundentext wird nie Formel, ganzer Ablauf bis Download.
- **Einmalige Fremdprüfung:** Dieselbe Musterdatei wurde am 16.11.2026 einmal in Microsoft Excel 16 geöffnet (ohne Reparaturhinweis; Gesamt 954,09, nach Menge 10→20: 1482,84). Diese Werte stehen als feste Vergleichswerte im Test. Excel ist kein Teil des Ablaufs; das Hilfsskript wurde wieder entfernt.
- **Nicht geprüft:** LibreOffice, Excel für Mac/Web, Numbers. Keine Diagramme.
- **Offen (Eigentümer):** Produktart freigeben und Preis festlegen – bis dahin nicht bestellbar.
