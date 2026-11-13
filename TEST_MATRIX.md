# Testmatrix – Pflichtfälle aus Gesamtprompt §12

Alle Tests laufen mit `npm run verify` (lokal) und in der GitHub-CI. Stand 2026-11-13: 271 Tests plus 1 E2E, alle bestanden.

| # | Pflichtfall | Status | Nachweis |
|---|---|---|---|
| 1 | Beide Vertriebswege → dieselbe Kundenakte und Pipeline | ✅ getestet | `tests/integration/m1-acquisition.test.ts`, `tests/integration/advisor.test.ts` |
| 2 | Antworten konsistent im Verlauf, Kontaktpolicy prüft Versand | ✅ teilweise | Portal-Tickets und Postausgang: `tests/integration/outbox.test.ts`. Chat- und E-Mail-Kanal nicht angebunden. |
| 3 | Dialogisch geklärter Bedarf → Scope, Angebot, Annahme | ✅ getestet | `tests/integration/advisor.test.ts`, `tests/e2e/pilot.test.ts` |
| 4 | Stripe serverseitig, negative Webhook-, Doppel- und Fehlerfälle | ✅ getestet (Sandbox) | `tests/integration/payments.test.ts`, `tests/integration/m2-payments.test.ts`. Live: `LIVE_NOT_READY` |
| 5 | Produktion erst nach bestätigter Zahlung | ✅ getestet | `tests/integration/production.test.ts` (IE-059) |
| 6 | Bestelltes ERP ist echte Fachsoftware | ⛔ nicht anwendbar | Produktart gesperrt, bis Pilot, Standard-Akte und Prüfungen existieren ([PRODUCT_FACTORY_REAL_SOFTWARE.md](PRODUCT_FACTORY_REAL_SOFTWARE.md)) |
| 7 | Admin-Produktkarte und echter Build-/Vorschau-Status je Auftrag | ✅ getestet | `tests/integration/live-preview.test.ts` |
| 8 | Interaktive Vorschau für ausführbare Webprodukte | ⛔ nicht anwendbar | Keine ausführbaren Produkte. Für Tabelle, PDF und ZIP gibt es echte Viewer; sonst „Noch keine Live-Vorschau verfügbar“ |
| 9 | Luxury Turquoise auf allen Oberflächen, Storyscrolling barrierearm | ✅ getestet | `tests/unit/console-ui.test.ts` (Kontrast), `tests/integration/landing.test.ts` |
| 10 | Rechnung/Steuer passt zu verifizierten Stammdaten, sonst Blocker | ✅ getestet | `tests/integration/italy.test.ts`, `tests/integration/finance.test.ts` |
| 11 | Live-Finanzen nur aus echten Objekten und Bankbestätigung; keine DEMO-Daten in LIVE | ✅ getestet | `tests/integration/bank-statement.test.ts`, `tests/integration/finance.test.ts` |
| 12 | Keine unautorisierten Ausgaben, Nachrichten, Transaktionen, Deploys | ✅ getestet | `tests/integration/governance.test.ts`, `tests/integration/outbox.test.ts` |
| 13 | 147 Nummern (1–47, 50–109, 111–140, 146–155) in Registry, Status, Plan; 48/49/110 und 141–145 nicht eingeführt | ✅ getestet | `tests/unit/registry.test.ts`, [FEATURE_REGISTRY_147.json](FEATURE_REGISTRY_147.json) |
| 14 | Jede Lieferung nutzbar, vollständig, sicher im Portal | ✅ getestet | `tests/integration/quality-standard.test.ts`, `tests/integration/portal-documents.test.ts` |
| 15 | Negative, Ausfall-, Erstattungs-, Rollen-, Datensicherheits-, Doppel-Event- und Kapazitätsfälle | ✅ getestet | `tests/integration/production.test.ts`, `tests/security/security.test.ts`, `tests/integration/ops.test.ts` |

**Status je Funktion** (SPECIFIED, IMPLEMENTED, TESTED, LIVE_VERIFIED, BLOCKED): siehe [FEATURE_REGISTRY_147.json](FEATURE_REGISTRY_147.json). `LIVE_VERIFIED` wird erst nach einer echten, freigegebenen Live-Transaktion mit Bankbestätigung vergeben.
