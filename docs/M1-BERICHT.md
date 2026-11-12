# M1-Bericht – Demand → Offer

**Datum:** 12.11.2026 · **Ergebnis:** technisch umgesetzt. **Echte externe Leads: 0** (ehrlicher Stand, siehe Live-Abruf).

## Implementiert
| Anforderung (Masterprompt M1) | Umsetzung |
|---|---|
| 1–2 legale Quellen mit dokumentierter Erlaubnis | Eigenes Anfrageformular (aus M0) + **TED Search-API v3** mit belegten Wiederverwendungs- und Zugriffsbedingungen (`docs/adr/0002-legal-sources-and-ranking.md`); Freigabe nur durch den Eigentümer |
| Opportunity-Ranking | `services/acquisition/src/scoring.ts`, `ranking.ts` – Fit/Nachweis/Risiko mit Begründungstexten, Inbound + Ausschreibungen in einer Liste, Dashboard + `GET /api/opportunities/ranking` |
| Angebotsgenerator | Inbound: automatisches Standardangebot (M0). Ausschreibungen: Angebotsentwürfe zur Prüfung (`services/core-api/src/offers.ts`), nie automatisch versendet, ohne Umfang kein Preis |
| Menschlich überprüfbare Nachweise | Jede Bekanntmachung mit Rohdaten, SHA-256, Abruflauf, Link zur Originalbekanntmachung; Lauf-Protokoll `source_fetch_runs`; Audit-Events |
| Kundenformular | `/anfrage` (aus M0) mit strukturiertem Umfang, Datenschutz- und freiwilliger Werbeeinwilligung |
| Erster Produktions-Use-Case | `b2b-calc-csv` bestätigt |
| Automatisierung | Täglicher TED-Abruf im Serverprozess (nur bei Freigabe, idempotent), Dashboard-Buttons, CLI `npm run acquire [-- --preview]` |
| Datenbank | Migration `0002_m1_acquisition.sql` (Quellenfreigabe, Abrufläufe, Nachweise, Entwürfe) |

## Getestet
| Prüfung | Ergebnis |
|---|---|
| `npm run verify` (Typecheck, Lint, Tests, E2E, Testmatrix, Build) | ✅ 129 Tests + E2E bestanden (davon 13 neue M1-Tests, ohne Netzwerk per Fixture) |
| `npm run dryrun` | ✅ unverändert erfolgreich |
| Live-Vorschau gegen TED (nur lesen, keine Leads) | ✅ Status OK: 757 Bekanntmachungen (30 Tage, ausgewählte CPV), 100 abgerufen, **0 relevant**. Bericht `data/acquisition/ted-preview-*.json` |

Neu abgedeckt: Sperre ohne Freigabe (kein Netzwerkzugriff), Freigabe nur durch Eigentümer, 90-Tage-ToS-Frist, Notstopp, HTTP-Fehler/429, Paginierung mit Pause, Idempotenz, kein Kontaktkanal für Ausschreibungs-Leads, Prompt-Injection/HTML im Titel escaped, unveränderliche Entwürfe.

## Live-Befund und Korrektur
Der erste echte Abruf (14 Tage) markierte 15 Bekanntmachungen als „relevant“, darunter Elektrobusse und eine SAP-Einführung, weil ein CPV-Treffer genügte. **Korrigiert:** Relevant ist nur noch, was zusätzlich einen produktspezifischen Begriff im Titel trägt. Danach 0 relevante. Mit Regressionstest abgesichert.

## Nicht verfügbar
- **Kein echter Lead.** Öffentliche Ausschreibungen passen kaum zu einem kleinen Standardprodukt. Das ist ein Marktbefund, kein Fehler.
- Keine automatisierte Einreichung bei Vergabeportalen (bewusst: formelle Verfahren, Eignungsnachweise, rechtliche Verantwortung).
- Nicht alle Treffer werden geprüft: pro Lauf höchstens 2 Seiten à 50 bei täglichem Abruf; bei 757 Treffern/30 Tagen deckt der tägliche Rhythmus (≈ 25/Tag) das neue Volumen ab.
- Schlüsselwörter nur DE/EN/IT; Titel in anderen Originalsprachen können durchrutschen.

## Blockiert
- **TED-Freigabe durch Sie** (Dashboard → Akquise – Quellen → „Quelle freigeben“). Bis dahin läuft kein automatischer Abruf.
- Live-Verkauf weiterhin gesperrt (LA-01 … LA-12).

## Nächste Schritte
1. TED freigeben, wenn gewünscht → tägliche Marktbeobachtung mit Nachweisen.
2. **Realistischer Nachfragekanal für `b2b-calc-csv`: Inbound** – öffentliche Landingpage + kostenloses Gratis-Rechentool (M5-Vorgriff), sobald ein kostenloses Hosting freigegeben ist.
3. M2: Stripe-Testmodus statt Mock.

## Risiken
- TED-Feldnamen/Antwortformat stammen aus Live-Abfragen, nicht aus einer lesbaren Schema-Doku (Swagger lädt per JavaScript). Änderungen der API führen zu `ERROR`-Läufen, nicht zu Falschdaten.
- Die Fair-Use-Grenze ist für die Website dokumentiert; ihre Geltung für die API ist nicht ausdrücklich bestätigt. Die Abrufrate liegt weit darunter (≤ 5 Anfragen/Lauf).
