# M0-Bericht – Projektgrundlage

**Datum:** 12.11.2026 · **Status M0:** technisch abgeschlossen im Test-/Offline-Modus. LIVE bleibt gesperrt.

## Ausgangslage (Current State)
Kein bestehendes Repository vorhanden; das Paket `INFINITY_EARN_5_Claude_Code_Paket` enthielt nur Spezifikation (`"status": "SPECIFICATION_ONLY"`). Neues, eigenständiges Projekt angelegt (keine Abhängigkeit zu anderen Projekten). Spezifikation unverändert unter `docs/spec/` abgelegt.

## Implementiert
| Bereich | Ergebnis | Ort |
|---|---|---|
| Repo-Skeleton | Struktur gemäß Masterprompt §12, TypeScript strict, ESLint, Build | Projektwurzel |
| Datenbank | Schema + Migrationsrunner mit Prüfsumme; DB-Invarianten (append-only, Unique-Event-IDs, Nummernkreise, Live-Sperre per Trigger) | `db/migrations/0001_init.sql`, `packages/storage` |
| Policy-Engine | ohne LLM; 0-€-Startwerte; strengste Kombination Env ∩ freigegebene DB-Policy; Versionierung mit Eigentümerfreigabe; Notstopps | `packages/policies`, `services/core-api/src/policy-store.ts` |
| Zustandsmaschine | alle 15 Pipeline- und 13 Sonderzustände, geprüfte Übergänge, Historie append-only; Zahlungsbestätigung nur durch Provider | `packages/contracts/src/states.ts` |
| Akquise | Inbound-Formular (ohne Consent-Fälschung), Einwilligungen + Widerruf, Quellenregister mit ToS-Hash-Überwachung, Kaufabsicht nur über strukturierte Nachweise | `services/acquisition` |
| Angebot | Machbarkeit (Capability-Matrix, Rechts-Gate, Kapazität, offene Punkte), Preis = Kosten + Mindestmarge innerhalb Policy, tokenbasierte Annahme, idempotente Order | `services/core-api/src/workflow.ts` |
| Zahlung | HMAC-Webhook (Stripe-kompatibles Schema, Replay-Schutz), Idempotenz, Pending/Failed/Refund/Dispute/Payout; **Mock-Provider nur im Testmodus** | `services/finance/src/payments.ts`, `mock-provider.ts` |
| Produktfabrik | Plugin-Vertrag; erster echter Use-Case `b2b-calc-csv` (deterministisch, Formel-Injection-Schutz); QA-Suite; versionierte Artefakte mit SHA-256 und Rechte-Nachweis | `services/product-factory` |
| Lieferung | signierte, ablaufende, kundengebundene Download-Links; Prüfsumme bei jedem Abruf; Widerruf bei Refund/Dispute/Sicherheitsfund | `services/product-factory/src/delivery.ts` |
| Belege | Test-Rechnungsentwürfe (klar als TESTBELEG markiert), Nummernkreise, Gutschriften mit Referenz, unveränderliche Historie, Steuerkontext ohne Pauschal-USt (SdI/OSS → TAX_REVIEW) | `services/finance/src/invoice.ts`, `tax.ts` |
| Ledger/Abgleich | append-only Ledger, exakte Provider-Gebühren, Reconciliation (unbekannte Buchung → REVIEW), Monatsexport JSON/CSV mit Lückenprüfung | `services/finance` |
| Job-Queue | Admission (Notstopp, Policy, KI-Kontingent, Free-Tier-Drosselung), Backoff, Dead-Letter + Alarm, idempotente Cron-Ticks | `services/ai-orchestrator` |
| KI-Sicherheit | Agentenvorschläge nur über Allowlist + Policy-Engine; Untrusted-Rahmung für Kundendaten | `services/ai-orchestrator/src/untrusted.ts` |
| HTTP/Web | Anfrage, Angebot, Testzahlung, Kundenportal, DSGVO-Export, Support; Owner-Login (scrypt, Sessions, CSRF, Ratenlimit), strikte Security-Header/CSP | `services/core-api/src/server.ts`, `apps/` |
| Dashboard | LIVE und TEST strikt getrennt; LIVE = 0 ohne echte Zahlung; Steuerrücklage nur als „Schätzung“; Bankeingang nur wenn bestätigt; „Eigentümeraktion erforderlich“; Notstopps; Capability-Matrix; Audit | `apps/dashboard` |
| Autopilot | 30-s-Takt ohne KI: Produktion → Beleg → Reconciliation | `services/core-api/src/autopilot.ts` |
| CI | GitHub-Actions-Workflow inkl. `npm audit --audit-level=critical` | `.github/workflows/ci.yml` |
| Doku | ADR, Live-Aktivierungs-Checkliste (+ maschinenlesbar), Betriebshandbuch, Testmatrix | `docs/`, `config/live-activation.json` |

## Getestet (lokal ausgeführt, 12.11.2026)
| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | ✅ fehlerfrei |
| `npm run lint` | ✅ fehlerfrei |
| `npm test` (unit, integration, security) | ✅ 116/116 bestanden |
| `npm run test:e2e` (IE-100 über echten HTTP-Server) | ✅ 1/1 bestanden, Beleg `data/e2e/IE-100-evidence.json` + `IE-100-dashboard.html` |
| `npm run test:matrix` | ✅ 98/100 Abnahmefälle automatisiert, 2 begründet offen (`docs/TESTMATRIX.md`) |
| `npm run build` | ✅ |
| `npm run dryrun` | ✅ Lead → Angebot → Annahme → Mock-Payment → Produktion/QA → Lieferung → Testbeleg → Reconciliation → Mock-Auszahlung → `CLOSED`; LIVE-Umsatz 0,00 €; 38 Audit-Events; Bericht in `data/dryrun/` |
| `npm run check:env` | ✅ Policy 0 €/false; `.env.example` ohne Geheimnisse |
| `npm audit --audit-level=critical` | ✅ keine kritischen; 10 „moderate“ nur in ESLint-Dev-Abhängigkeiten |

## Nicht verfügbar / bewusst nicht gebaut
- **Echte Zahlungen** – nur Mock-Provider im Testmodus (Stripe-Testmodus = M2).
- **Echte Akquisequellen** – Quellenregister + Compliance-Logik vorhanden, aber keine reale Quelle angebunden (M1; braucht Eigentümerfreigabe je Quelle).
- **E-Mail-Versand** – nicht implementiert (kein kostenloser, rechtlich geprüfter Kanal festgelegt). Lieferung erfolgt über das Kundenportal.
- **KI-Jobs** – Queue/Admission fertig, aber `AI_DAILY_TASK_LIMIT=0`: kein automatischer Claude-Aufruf. Das Abo bietet keine offizielle Restkontingent-API; KI-Arbeit erfolgt über vom Eigentümer gestartete Claude-Code-Sitzungen/Routinen.
- **Cloudflare-Deployment** – nicht erfolgt; Domänenlogik ist D1-kompatibel, aber ein Workers-Adapter (async DB, Fetch-Handler, Objektspeicher für Artefakte) fehlt.
- **Screenshots** pro Hauptpfad – nicht automatisiert (kein Playwright installiert, um Downloads/Abhängigkeiten gering zu halten). Ersatz: gerendertes Dashboard-HTML + Datensätze + Audit-Event-IDs im E2E-Beleg.

## Blockiert (für die erste Echtgeld-Transaktion)
Alle Punkte LA-01 … LA-12 in `docs/compliance/live-activation-checklist.md`, insbesondere:
1. Betriebsland/steuerlicher Sitz, Rechtsform, Steuerregistrierung (Eigentümer + Steuerberatung).
2. Zahlungsanbieter-Vertrag, KYC und Auszahlungskonto – nur durch den Eigentümer im Provider-UI.
3. Offizielle Rechnungslösung (z. B. SdI/FatturaPA bei Italien-Bezug) und fachlich freigegebene USt/OSS-Regeln.
4. Geprüfte AGB, Widerrufs-/Verzichtstexte für digitale Inhalte, Datenschutzerklärung, Löschfristen.
5. M2 (Stripe-Testmodus E2E) und Staging-Deployment mit Sicherheits- und Backup-Test.
Technisch zusätzlich hart gesperrt (Config + DB-Trigger) – Freischaltung erst per neuer, geprüfter Migration.

## Nächste Schritte
1. **M1:** 1–2 legale Quellen mit dokumentierter Erlaubnis auswählen (Eigentümer entscheidet), Opportunity-Ranking, menschlich prüfbare Nachweise. Ergebnis ehrlich als „0 echte Leads“, falls keine kommt.
2. **M2:** Stripe-Testmodus (Testkeys vom Eigentümer, kostenlos) statt Mock; Webhook-Endpoint mit Stripe-CLI testen.
3. Cloudflare-Free-Limits verifizieren und Workers/D1-Adapter bauen; Staging-Deployment.
4. Git-Repository + GitHub anlegen, damit CI (inkl. IE-089) tatsächlich läuft.

## Risiken
- **Kein Umsatz garantiert.** Ohne echte, legal gewonnene Nachfrage bleibt der Status `NO_SALES`.
- Rechtstexte, Nutzungsrechte und Steuerlogik sind **Entwürfe/Platzhalter**, bis Fachleute freigeben.
- Free-Tier-Limits können sich ändern; Zähler und Drosselung sind lokal, nicht providerseitig verifiziert.
- Mock-Gebühr (1,5 % + 0,25 €) dient nur der Buchungsprüfung, ist keine Tarifangabe.
- Synchroner DB-Wrapper muss für D1 asynchron werden (bekannter Umbauaufwand).
- 10 „moderate“ Audit-Befunde in Dev-Tooling (ESLint) – beobachten, bei Fix-Release aktualisieren.
