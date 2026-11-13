# Systemarchitektur

## Laufzeit

- **Sprache:** TypeScript (Node 24, Typ-Stripping), ohne Build-Schritt für den Server.
- **Betrieb:** Cloudflare Worker mit einem SQLite-Durable-Object als zentralem Kern (Free-Tarif). Staging: `https://infinity-earn-staging.bikerman01.workers.dev`.
- **Lokal:** derselbe HTTP-Kern (`services/core-api/src/http-core.ts`) über Node, Datenbank SQLite, Dateien im Dateisystem.
- **Taktgeber:** Alarm des Durable Objects ruft `autopilotTick` auf: Produktion → Belege → Abgleich → Postausgang. Täglich laufen außerdem der TED-Abruf und die verschlüsselte Sicherung in Workers KV.
- **GitHub:** CI (Typecheck, Lint, Tests, E2E, Dry-Run) und GitHub Pages (statische Startseite DE/IT/EN).

## Kern und Schichten

| Schicht | Ort |
|---|---|
| Policy-Engine (strengste aus DB- und Umgebungspolicy, Notstopps, Kostenlimit 0 €) | `packages/policies`, `services/core-api/src/policy-store.ts` |
| Workflow und Zustände | `services/core-api/src/workflow.ts`, `opportunities.ts` |
| Akquise (Formular, Berater, TED) | `services/acquisition`, `services/core-api/src/advisor.ts` |
| Produktfabrik, Qualität, Lieferung, Live-Vorschau | `services/product-factory` |
| Finanzen (Zahlungen, Stripe, Belege, FatturaPA, Bankabgleich, Erstattungen) | `services/finance` |
| Kommunikation (Postausgang, Kanalstatus, Einwilligungen) | `services/core-api/src/outbox.ts`, `channels.ts`, `services/acquisition/src/consent.ts` |
| Oberflächen | `apps/customer-portal`, `apps/console`, `apps/shared` |

## Zustandsmaschine (Gesamtprompt §10)

| Gesamtprompt | Im System |
|---|---|
| LEAD_FOUND / CONTACT_PERMITTED / SCOPE_VALIDATED | DISCOVERED / SOURCE_COMPLIANT / QUALIFIED, FEASIBILITY_APPROVED |
| OFFER_SENT / ACCEPTED | QUOTED / CUSTOMER_ACCEPTED |
| PAYMENT_VERIFIED | PAYMENT_CONFIRMED (nur durch signierten Webhook) |
| PRODUCTION_QUEUED / BUILT / QA_PASSED | PRODUCTION_QUEUED / IN_PRODUCTION / QA_PASSED (Abnahme-Gate) |
| DELIVERY_CONFIRMED / INVOICE_RECORDED | DELIVERED / INVOICE_RECORDED |
| PROVIDER_SETTLEMENT / PROVIDER_PAYOUT_SENT / BANK_CREDIT_VERIFIED | LEDGER_RECONCILED / PAYOUT_RECORDED / CLOSED mit `bank_credit_confirmed` nur über Kontoauszug |
| Fehlerzustände | PAYMENT_FAILED, QA_FAILED, NO_CAPACITY, REFUND_PENDING, TAX_REVIEW, MANUAL_REVIEW, DISPUTE |

## Stripe

- **Gebaut:** Checkout-Sessions serverseitig, Webhooks mit Signaturprüfung über den unveränderten Body, Event-IDs idempotent.
- **Freigabe:** Die Produktion startet nur nach `production.start`-Freigabe durch die Policy, nie wegen eines Redirects. Erstattungen führt Stripe erst nach Freigabe durch den Eigentümer aus.
- **Status:** Live ist technisch gesperrt (`LIVE_SALES_ENABLED=true` wird abgelehnt), bis LA-01 bis LA-12 erfüllt sind. Das entspricht `LIVE_NOT_READY`.
- **Noch offen:** Abos, nutzungsbasierte Preise und das Stripe-Kundenportal.

## Sicherheit

- **Admin:**
  - Anmeldung nur per Passwort (scrypt), auf Entscheidung des Eigentümers vom 13.11.2026, ohne MFA.
  - Sperre nach 5 Fehlversuchen, Sitzungen auf dem Server, CSRF-Schutz, Audit.
- **Kunden:** eigener Kundenschlüssel; Besitzprüfung bei Dokumenten und Downloads.
- **Webseiten:** CSP `default-src 'none'`, keine Skripte.
- **Geheimnisse:** nur in `wrangler secret` bzw. `.dev.vars`, nie im Git.

## Grenzen

- Ein Claude-Abo ist keine API. Eine KI-Schicht rund um die Uhr braucht eine kostenpflichtige API und damit eine Freigabe.
- Free-Tier-Tageslimit mit Drosselung („keine Kapazität“ statt Upgrade).
- Der Worker hat keinen Rechenplatz für Video, 3D oder große Builds.
