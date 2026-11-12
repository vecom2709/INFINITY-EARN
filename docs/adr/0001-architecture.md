# ADR 0001 – Architektur des Transaktionskerns (M0)

- **Status:** angenommen (M0), Stand 12.11.2026
- **Kontext:** INFINITY-EARN-5.0-Spezifikation (`docs/spec/`), Meilenstein M0 „Projektgrundlage“.

## Entscheidung

### 1. Zwei Ebenen, Kern ohne KI
Der **Transaktionskern** (Leads, Angebote, Bestellungen, Zahlungsstatus, Produktion, QA, Lieferung, Belege, Ledger, Reconciliation) ist rein deterministisch und läuft **ohne** Claude-Aufruf. Die KI-Ebene (AI CEO, Agenten) darf nur Jobs in die Queue legen bzw. Vorschläge machen, die immer durch die Policy-Engine laufen (`services/ai-orchestrator/src/untrusted.ts`).

**Begründung:** Das Claude-Abo ist keine API und hat Nutzungslimits. Bestellungen, Webhooks und Auslieferungen dürfen davon nicht abhängen (IE-010).

### 2. Sprache und Laufzeit: TypeScript auf Node 24, kein Rust
- Node 24 führt TypeScript direkt aus (Type-Stripping) und bringt `node:sqlite` mit → **keine Laufzeitabhängigkeiten**, nur 5 Dev-Abhängigkeiten (typescript, @types/node, eslint, @eslint/js, typescript-eslint; alle MIT/Apache-2.0).
- Zielplattform Cloudflare Workers/D1 ist TS-nativ; dasselbe SQL läuft auf SQLite und D1.
- **Rust geprüft und verworfen für M0:** kein CPU-Engpass (I/O- und Regel-Logik, Einzelanfragen im ms-Bereich), Wasm-Bridge würde Komplexität/Debugging verschlechtern, kein Sicherheitsgewinn gegenüber typisiertem TS + DB-Invarianten. Neu bewerten, falls später rechenintensive Produkt-Worker (z. B. große Datenprodukte) entstehen.

### 3. Speicher: SQLite lokal, D1-kompatibles Schema
- `db/migrations/0001_init.sql`, Prüfsummen gegen nachträgliche Änderung.
- **Invarianten in der DB, nicht nur im Code:** append-only Ledger/Audit/Zahlungsereignisse/Statushistorie (Trigger), `UNIQUE(provider, provider_event_id)`, `UNIQUE(series, invoice_number)`, `UNIQUE(orders.quote_id)`, `UNIQUE(deliveries.order_id)`, unveränderliche Rechnungsbeträge, Live-Zeilen per Trigger gesperrt solange `system_mode.live_enabled = 0`, `system_mode` selbst gesperrt (Freischaltung nur per eigener Migration nach M3).
- Geld ausschließlich als Integer-Minor-Units.

### 4. Policy-Engine außerhalb jedes Prompts
`packages/policies` – reine Funktion `evaluate(action, {policy, stops, actor})`. Wirksame Policy = **strengste Kombination** aus freigegebener DB-Policy und Env. Lockern erfordert beide Quellen + Eigentümerfreigabe (IE-008). Keine Policy → alles blockiert (IE-002). Absolute Verbote (Überweisungen, Änderung Auszahlungskonto) sind unabhängig von jeder Policy.

Startwerte (`.env.example`): `MAX_NEW_MONTHLY_FIXED_COST_EUR=0`, `ALLOW_PAID_APIS=false`, `LIVE_SALES_ENABLED=false`, `AUTO_MARKETING_OUTREACH=false`, `ALLOW_UNREVIEWED_DEPLOY=false` (+ `ALLOW_AUTO_UPGRADE/PAID_ADS/NEW_FINANCIAL_COMMITMENTS=false`). Nur der exakte Wert `true` schaltet frei.

### 5. Zahlungen nur über signierte Webhooks
HMAC-SHA256 im Stripe-kompatiblen Header-Schema `t=…,v1=…`, 300 s Toleranz (Replay-Schutz), konstante Vergleichszeit, Idempotenz über DB-Unique. Ein Frontend-Redirect kann keinen Status setzen (IE-034). M0 nutzt einen **Mock-Provider nur im Testmodus**, der denselben Verifikationspfad durchläuft. Stripe-Testmodus folgt in M2.

### 6. Dashboard serverseitig gerendert
Kein React/Vite in M0: weniger Abhängigkeiten, keine Client-Skripte (strikte CSP `default-src 'none'`), Escaping zentral. LIVE- und TEST-Kennzahlen strikt getrennt. React/Vite kann später für das Kundenportal ergänzt werden, falls Interaktivität nötig wird.

### 7. Erster Produktions-Use-Case: `b2b-calc-csv`
Deterministische B2B-Kalkulationstabelle aus strukturierten Positionen, mit QA (Encoding, Struktur, nachgerechnete Summen, Formel-Injection, Prüfsumme). Kostenlos herstellbar, keine Fremd-Assets, keine KI. Andere Produktklassen sind in der Capability-Matrix **deaktiviert mit Begründung**.

## Infrastruktur-Freigrenzen (zu verifizieren vor Staging)

| Dienst | Annahme für M0 | Status |
|---|---|---|
| Lokaler Betrieb (Node + SQLite) | 0 € | **aktiv**, keine externen Dienste |
| Cloudflare Workers Free | kurze Requests, begrenzte CPU-Zeit pro Aufruf, Tageslimit an Requests, Cron Trigger | **nicht verifiziert** – vor Staging gegen https://developers.cloudflare.com/workers/platform/limits/ prüfen |
| Cloudflare D1 Free | begrenzte Lese-/Schreibzeilen pro Tag, Speicher | **nicht verifiziert** |
| GitHub Actions | Free-Kontingent je nach Kontotyp | **nicht verifiziert**, CI-Datei vorhanden |
| Zahlungsanbieter | keine Grundgebühr angenommen, aber **Transaktionsgebühren** | Kosten ≠ 0; vor M3 tarifgenau prüfen |

Free-Tier-Verbrauch wird lokal gezählt (`usage_counters`); ab `FREE_TIER_THROTTLE_AT_BPS` (Standard 80 %) drosselt die Queue (IE-095). Kein Code bucht automatisch höhere Tarife.

## Konsequenzen
- Für Cloudflare-Deployment wird ein Adapter benötigt (Workers-Fetch-Handler statt `node:http`, D1-Binding statt `node:sqlite`, R2/KV o. ä. statt lokalem Dateisystem für Artefakte). Die Domänenlogik ist darauf vorbereitet (synchroner DB-Wrapper muss für D1 auf async umgestellt werden – bewusster Folgeaufwand, dokumentiert als offener Punkt).
- Die KI-Ebene erzeugt in M0 keine Jobs automatisch (`AI_DAILY_TASK_LIMIT=0`).
