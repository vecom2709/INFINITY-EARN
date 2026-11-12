# Staging-Betrieb (Cloudflare Workers, Free-Tarif)

**URL:** https://infinity-earn-staging.bikerman01.workers.dev · TESTMODUS · Owner-Passwort: `data/ZUGANG-STAGING.txt` (lokal, nicht teilen)

| Aufgabe | Befehl |
|---|---|
| Einmalig Geheimnisse erzeugen | `npm run staging:secrets` (legt `.dev.vars` + Staging-Passwort an) |
| Lokal im Cloudflare-Laufzeitsystem | `npx wrangler dev --port 8788 --persist-to <kurzer Pfad>` |
| Deployment (Tests → Deploy → Geheimnisse) | `npm run staging:deploy` |
| Rauch-/Sicherheitstest | `npm run staging:smoke -- https://infinity-earn-staging.bikerman01.workers.dev` |
| Backup herunterladen | Dashboard angemeldet → `/api/admin/backup` (JSON, enthält personenbezogene Daten) |
| Restore-Test | `npm run backup:restore-test -- <backup.json>` |
| Tägliche Sicherung | automatisch per Alarm nach Workers KV (verschlüsselt, 30 Tage) – Details: runbook.md „Staging: automatische tägliche Sicherung“ |
| Sicherung holen + prüfen | `npm run backup:pull` (neueste) bzw. `npm run backup:pull -- JJJJ-MM-TT` |
| Live-Logs | `npx wrangler tail` |
| Stripe-Testmodus für Staging (Webhook-Endpunkt + Geheimnisse) | `node scripts/staging-stripe.ts <STAGING_URL> acct_1UanTbQZB2KUWElL [--recreate]`, danach `PAYMENT_PROVIDER` in `wrangler.jsonc` = `stripe` und `npm run staging:deploy` |
| Zurück zu Mock | `PAYMENT_PROVIDER` = `mock` in `wrangler.jsonc`, `npm run staging:deploy` |
| Anmeldung (minimale Rechte) | `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write workers_tail:read` |

Notstopps, Freigaben und Policy wirken im Staging genauso wie lokal. Staging-Daten sind getrennt von der lokalen Datenbank.
