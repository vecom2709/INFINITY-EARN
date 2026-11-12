# INFINITY EARN

Deterministischer Transaktionskern für ein eigentümergeführtes digitales Geschäft: Anfrage → Angebot → Annahme → verifizierte Zahlung → Produktion → QA → Lieferung → Beleg → Ledger-Abgleich → Auszahlung.

> **Stand: Meilenstein M0 – nur Test-/Offline-Modus.** Keine Live-Verkäufe, keine echten Zahlungen, keine gültigen Rechnungen. Alle Umsätze im Dashboard unter „LIVE“ sind 0, solange keine echte, provider-bestätigte Zahlung existiert. Keine Einkommens-, Rechts- oder Steuerzusage.

## Schnellstart
```bash
npm install
npm run setup       # .env, Schlüssel, Owner-Zugang (data/ZUGANG-OWNER.txt), Datenbank
                    # optional: -- --approve-ted  (TED-Quelle freigeben)  -- --stripe (Stripe-Testmodus)
npm run verify      # Typecheck, Lint, Tests, E2E, Testmatrix, Build
npm run dryrun      # kompletter Durchlauf mit Wegwerf-DB
npm run dev         # http://localhost:8787 (siehe docs/operations/runbook.md)
```
Voraussetzung: Node.js ≥ 24. Keine Laufzeitabhängigkeiten, keine externen Dienste, keine Kosten.

## Struktur
```
apps/dashboard/          Eigentümer-Dashboard (serverseitig gerendert)
apps/customer-portal/    Anfrage, Angebot, Testzahlung, Downloads, Support, DSGVO-Export
services/core-api/       HTTP, Workflow, Zustandsmaschine, Auth, Autopilot
services/acquisition/    Inbound-Leads, Quellen-Compliance, Einwilligungen
services/ai-orchestrator/Job-Queue, Admission, Kontingente, Untrusted-Handling
services/product-factory/Capability-Registry, b2b-calc-csv, QA, Artefakte, Lieferung
services/finance/        Webhooks, Ledger, Belege, Steuerkontext, Reconciliation, KPIs, Export
packages/contracts/      JSON-Schemas, Zustände, Geld (Minor Units)
packages/policies/       Policy-Engine (ohne LLM)
packages/events/         Audit-Log, Redaktion, Logger
packages/storage/        SQLite/D1-Wrapper, Migrationen
db/migrations/           Schema inkl. DB-Invarianten
tests/                   unit, integration, security, e2e (+ open-cases.json)
docs/                    adr, compliance, operations, spec, TESTMATRIX.md, M0-BERICHT.md
```

## Wichtige Dokumente
- [docs/adr/0004-staging-cloudflare.md](docs/adr/0004-staging-cloudflare.md) – Staging auf Cloudflare (LA-11-Nachweis) · [docs/operations/staging.md](docs/operations/staging.md)
- [docs/M3-BERICHT.md](docs/M3-BERICHT.md) – Ergebnis M3: Live-Freigaben, EU/B2C-Regeln, Ihre Aufgaben
- [docs/compliance/m3-entscheidungsvorlage-sitzland.md](docs/compliance/m3-entscheidungsvorlage-sitzland.md) – Italien vs. Deutschland, Fragen an die Beratung
- [docs/compliance/entwuerfe/](docs/compliance/entwuerfe/README.md) – Entwürfe Impressum, AGB, Widerruf, Datenschutz
- [docs/M2-BERICHT.md](docs/M2-BERICHT.md) – Ergebnis M2: Stripe-Testmodus, Gebühren, Rückerstattungen, Einrichtung
- [docs/operations/stripe-testmodus.md](docs/operations/stripe-testmodus.md) – Stripe-Testkonto anbinden (Eigentümer)
- [docs/M1-BERICHT.md](docs/M1-BERICHT.md) – Ergebnis M1: legale Quellen (Inbound + TED), Ranking, Angebotsentwürfe
- [docs/adr/0002-legal-sources-and-ranking.md](docs/adr/0002-legal-sources-and-ranking.md) – Quellen, Erlaubnisse, Relevanzregeln
- [docs/M0-BERICHT.md](docs/M0-BERICHT.md) – Ergebnis M0: implementiert, getestet, blockiert, Risiken
- [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md) – Architekturentscheidungen, Freigrenzen
- [docs/compliance/live-activation-checklist.md](docs/compliance/live-activation-checklist.md) – Sperrbedingung für LIVE
- [docs/TESTMATRIX.md](docs/TESTMATRIX.md) – Abdeckung IE-001 … IE-100
- [docs/operations/runbook.md](docs/operations/runbook.md) – Betrieb
