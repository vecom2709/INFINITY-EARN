# Stripe-Testmodus einrichten (Eigentümer, ca. 10 Minuten, kostenlos)

Diese Schritte kann nur der Eigentümer ausführen (Konto, Identität, Schlüssel). Im Testmodus fließt kein Geld.

1. Stripe-Konto anlegen bzw. anmelden: https://dashboard.stripe.com – oben „Testmodus“ einschalten.
2. Entwickler → API-Schlüssel → **Geheimer Schlüssel (Test)** kopieren (`sk_test_…`). Besser: eingeschränkten Schlüssel (`rk_test_…`) mit Schreibrechten nur für Checkout Sessions und Refunds sowie Leserechten für PaymentIntents/Balance anlegen.
3. Webhook-Secret besorgen – eine der beiden Varianten:
   - **Lokal (empfohlen):** Stripe CLI installieren (https://docs.stripe.com/stripe-cli), dann
     ```bash
     stripe login
     stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,payment_intent.payment_failed,charge.refunded,charge.dispute.created,payout.paid,payout.failed --forward-to localhost:8787/webhooks/payments
     ```
     Die CLI zeigt ein `whsec_…` an (laufen lassen, solange getestet wird).
   - **Öffentlicher Test-Endpunkt:** nur mit Staging-Deployment möglich (noch nicht vorhanden).
4. Im Projektordner:
   ```bash
   npm run setup -- --stripe
   ```
   Schlüssel und Secret verdeckt einfügen. Das Skript prüft den Schlüssel lesend (muss `livemode=false` sein) und trägt ihn in `.env` ein. Live-Schlüssel werden abgelehnt.
5. Server neu starten (`npm run dev`), dann `/anfrage` → Angebot annehmen → Weiterleitung zu Stripe Checkout → Testkarte `4242 4242 4242 4242`, beliebiges künftiges Datum, beliebige Prüfziffer.
6. Ergebnis prüfen: Dashboard → Auftrag `CONFIRMED`, nach wenigen Minuten Gebühr gebucht, Lieferung + Testbeleg, Reconciliation OK. Erstattung testen: „Erstattung anlegen“ → „Erstatten“.

Zurück zum Mock-Provider: in `.env` `PAYMENT_PROVIDER=mock` setzen.
