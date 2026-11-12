# ADR 0004 – Staging auf Cloudflare Workers + SQLite-Durable-Object (LA-11)

- **Status:** angenommen, deployt 12.11.2026 · **URL:** https://infinity-earn-staging.bikerman01.workers.dev (TESTMODUS)

## Entscheidung
- **Ein SQLite-Durable-Object** (`InfinityCore`) hält den gesamten Transaktionskern. Die DO-SQL-API ist synchron → Domänenlogik unverändert; Single-Thread-Konsistenz ersetzt Datenbank-Locks. Free-Tarif: nur SQLite-DOs verfügbar (Doku 2026-11).
- **Plattformneutraler Kern:** `SqlDb`/`BlobStore`-Schnittstellen (`packages/storage/src/types.ts`), HTTP-Kern `services/core-api/src/http-core.ts`; Adapter Node (`server.ts`, `context-node.ts`, `db.ts`, `blob-fs.ts`) und Cloudflare (`apps/worker/src/index.ts`, `do-db.ts`).
- **Artefakte als BLOB** in derselben SQLite-DB (Limit 8 MB/Wert) – kein R2, keine Zahlungsdaten nötig.
- **Migrationen eingebettet** (`migrations.generated.ts`, Test erzwingt Gleichheit mit `db/migrations`).
- **Zeitsteuerung:** DO-Alarm alle 60 s (Produktion, Belege, Abgleich, Gebühren; TED 1×/Tag nur bei Freigabe). ≈ 1.440 Alarm-Aufrufe/Tag ≪ 100.000 Free-Anfragen.
- **Geheimnisse** nur per `wrangler secret bulk` (temporäre Datei, sofort gelöscht); `wrangler.jsonc` enthält keine Geheimnisse. Staging hat eigenes Owner-Passwort (`data/ZUGANG-STAGING.txt`).
- **wrangler-Login mit minimalen Rechten:** account:read, user:read, workers:write, workers_scripts:write, workers_tail:read (statt der Standard-Vollrechte).

## Befunde aus dem echten Betrieb
1. `cursor.rowsWritten` zählt Index-Schreibvorgänge → als „geänderte Zeilen“ unbrauchbar (Job-Reservierung schlug still fehl). Behoben mit `SELECT changes()`; Regressionstest `tests/unit/do-db.test.ts`.
2. `wrangler dev` unter Windows scheitert bei sehr tiefen Projektpfaden (`SQLITE_CANTOPEN`, 260-Zeichen-Grenze) → `--persist-to` mit kürzerem Pfad.
3. Das Free-CPU-Limit blockierte das scrypt-Passwort-Hashing beim Login **nicht** (Login im Staging erfolgreich).

## Nachweis LA-11 (12.11.2026)
| Prüfung | Ergebnis |
|---|---|
| Rauch-/Sicherheitstest gegen Staging (`npm run staging:smoke -- <URL>`) | 20/20: Health, Sicherheitsheader, Login-Sperre, 401 ohne Session, Fake-Webhook abgelehnt, Anfrage→Angebot→Annahme→Zahlung→Produktion→Beleg→Abgleich, Download + fremder Zugriff 403, Cookies HttpOnly + **Secure**, CSRF, LIVE gesperrt |
| Backup-Export (Owner) + Restore-Test (`npm run backup:restore-test -- <datei>`) | RESTORE OK: Prüfsumme, Zeilenzahlen, Fremdschlüssel, Artefakt-Prüfsumme |
| Always-On ohne Anfragen (`scripts/staging-alarm-check.ts`) | 4 Takte in 3,1 min (Alarm läuft selbstständig) |
| Regressionssuite lokal | 149/149 + E2E |

## Stripe auf Staging (12.11.2026)
- `scripts/staging-stripe.ts`: prüft Testschlüssel + Sandbox-Konto `acct_1UanTbQZB2KUWElL`, legt Webhook-Endpunkt `we_1UaoHKQZB2KUWElLwrDFEIWq` → `/webhooks/payments` mit 8 Events an, überträgt `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` per `wrangler secret bulk` (nie ausgegeben).
- `PAYMENT_PROVIDER=stripe` in `wrangler.jsonc`; Rauchtest im Stripe-Modus 18/18 (Weiterleitung zu checkout.stripe.com, Mock-Checkout gesperrt, kein Download ohne bestätigte Zahlung).
- Testkauf mit Testkarte auf Staging: Kartenzahlung durch den Eigentümer (auf gehosteten Umgebungen gibt der Assistent keine Kartennummern ein); Anfrage/Annahme automatisiert.

### Nachweis echter Stripe-Testkauf auf Staging (12.11.2026, 04:11 MEZ) – `scripts/staging-order-check.ts`
| Schritt | Ergebnis |
|---|---|
| Stripe-Webhook (signiert, Endpunkt `we_1UaoHK…`) | `evt_1UaoQGQZB2KUWElL42zlVfKn` → Auftrag `ord_ec783d38…` CONFIRMED (52,86 €) |
| Produktion + QA (Alarm-Takt in der Cloud) | Artefakt `art_a71dac38…`, QA bestanden, 20 s nach Zahlung |
| Lieferung | `dlv_f9afa87f…` freigegeben |
| Testbeleg | `TEST-2026-000002` (DRAFT) |
| Stripe-Gebühr (Balance Transaction) | 1,92 € aus `txn_3UaoQFQZB2KUWElL217jdqhU` |
| Abgleich | LEDGER_RECONCILED (nächster Takt nach Gebührenbuchung) |
| Kennzahlen | LIVE-Umsatz 0,00 € · TEST-Umsatz getrennt ausgewiesen |

Zusätzlicher Befund: Die Anfrage des ersten Versuchs scheiterte am Format der Positionszeilen und das Formular verlor dabei Eingaben → behoben (Eingaben bleiben erhalten, zeilengenaue Fehler, tolerante Trenner/Komma-Preise; `tests/unit/inquiry-form.test.ts`).

## Offen / Grenzen
- ~~Kein automatisches Backup in der Cloud~~ → **umgesetzt (2026-11-12):** täglich per Alarm nach Workers KV (`infinity-earn-backups`, Free-Tarif), gzip + AES-256-GCM, 30 Tage Aufbewahrung, Status als JSON unter `/api/backup/status` (Owner). Nachweis auf Staging: `backup/2026-11-12` (32 KB verschlüsselt) per `npm run backup:pull` geholt, entschlüsselt, Restore-Test „RESTORE OK: 341 Zeilen, 2 Artefakte mit gültiger Prüfsumme“. Point-in-Time-Recovery des DO bleibt ungenutzt (zusätzliche Reserve).
- Free-Tarif-Grenzen werden lokal gezählt (`usage_counters`) und gedrosselt; Cloudflare-seitige Werte nicht automatisch abgefragt.
