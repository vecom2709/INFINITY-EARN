# ADR 0005 – INFINITY EARN 15.0: Premium-Konsole und 127er-Registry

**Status:** angenommen · 2026-11-12 · Meilenstein 15.0-M0

## Kontext

Das 15.0-Paket (`docs/spec/v15/`) macht Premium-Design zur Abnahmebedingung. Gefordert sind sechs verständliche Bereiche, ehrliche Finanzanzeige in fünf Stufen, Test/Live-Trennung und keine KI-Optik. Außerdem sollen exakt 127 freigegebene Funktionen umgesetzt werden (abgelehnt: 048, 049, 110).

Das bestehende System (5.0, M0–M3) hat einen getesteten Transaktionskern: Anfrage → Angebot → Stripe-Testzahlung → Produktion → QA → Lieferung → Beleg → Abgleich. Dazu kommen das Staging auf Cloudflare und die Vertragsbestätigung als PDF.

## Entscheidungen

1. **Weiterentwicklung statt Neubau.** 15.0 baut auf dem bestehenden, unabhängigen Monorepo auf. Der Kern bleibt unverändert, siehe globale Regel „funktionierende Komponenten nicht neu schreiben“. Die 15.0-Meilensteine M1–M3 überschneiden sich größtenteils mit Vorhandenem. Das hält die Registry im Feld `status` je Funktion fest.
2. **Serverseitig gerenderte Oberfläche ohne JavaScript, kein React/Vite.** Das Design-System erlaubt ausdrücklich „gleichwertige freie Technologie“. Gründe:
   - Die strikte CSP (`default-src 'none'`) bleibt erhalten.
   - Es gibt keine neuen Abhängigkeiten und keinen Build-Schritt.
   - Derselbe Code läuft in Node und im Cloudflare Worker.
   - Die Oberfläche funktioniert ohne Skripte, was für die Barrierefreiheit robust ist.
   - Menüs nutzen `<details>`, Filter sind Links.
   - Wiederverwendbare Bausteine liegen in `apps/console/src/ui.ts`, die Tokens zentral in `apps/console/src/tokens.ts`.
3. **Read-only-Registry.**
   - `packages/registry/src/registry-127.json` ist eine byte-identische Kopie, deren SHA-256 dem Paket-Manifest entspricht.
   - Beim Laden wird validiert: exakt 127 Funktionen, 048/049/110 fehlen, Budget 0 €, `live_enabled` steht auf false.
   - Alle Objekte sind eingefroren.
4. **Ehrlicher Funktionsstand.**
   - `packages/registry/src/status.ts` ordnet jede Funktion einem der sechs Bereiche zu und vergibt einen von vier Status: UMGESETZT, TEILWEISE, GEPLANT oder GESPERRT.
   - Ein Test erzwingt, dass UMGESETZT/TEILWEISE nur mit existierender Testdatei als Nachweis gelten und dass GEPLANT keinen Erfolg behauptet.
5. **Fünf getrennte Geldstufen:** bezahlt → beim Anbieter → unterwegs → auf Bank → Rücklage.
   - „Auf Bank“ wird nie als Zahl gezeigt, solange keine Bankabstimmung existiert (`BANK_CONNECTED = false`). Stattdessen steht dort „Noch nicht verbunden – kein Bankeingang verifizierbar“.
6. **Test/Live-Trennung in der Oberfläche.**
   - Standardansicht sind die echten Daten (aktuell leer → ehrliche leere Zustände).
   - Testdaten gibt es nur über „Testdaten“ (`?modus=test`), mit dauerhaftem Hinweis und Screenreader-Text.
7. **Detailansicht für Fachleute.** Die bisherige technische Konsole bleibt unter `/dashboard/experte` erreichbar (Profilmenü), ist aber nicht die Standardansicht.

## Folgen

- Owner-Aktionen leiten auf die Ausgangsseite zurück (`_back`, per Allowlist auf `/dashboard…` begrenzt).
- Die Kundenseiten (Portal, Anfrage, Angebot) nutzen noch das alte Layout. Die Umstellung auf das Design-System ist der nächste UI-Schritt.
- Neue Funktionen aus der Registry ändern ihren Status erst, wenn Code und Tests es belegen.
