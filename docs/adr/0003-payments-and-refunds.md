# ADR 0003 – Zahlungsanbieter, Gebühren, Rückerstattungen (M2)

- **Status:** angenommen (M2), Stand 12.11.2026

## Entscheidung
1. **Provider-Schnittstelle** (`services/finance/src/providers/`): `mock` (nur Testmodus) und `stripe` (nur Testmodus). Provider-Aufrufe setzen **nie** einen Zahlungsstatus; das tut ausschließlich der signierte Webhook.
2. **Stripe über REST, ohne SDK:** keine Laufzeitabhängigkeit, API-Version fest `2024-06-20`, Idempotency-Keys (`ie-checkout-…`, `ie-refund-…`), Antworten mit `livemode=true` oder `cs_live_…` werden verworfen, Start mit `sk_live_…` verweigert. Keine Kundendaten an Stripe; Checkout erfasst sie selbst.
3. **Zuordnung:** `metadata.order_id` an Checkout-Session und PaymentIntent; Disputes ohne Metadaten über `orders.provider_payment_ref` (PaymentIntent).
4. **Gebühren:** Stripe liefert die Gebühr nicht im Checkout-Event → Job `fee_sync` liest die Balance Transaction (`expand latest_charge.balance_transaction`) und bucht die bestätigte Gebühr exakt. Bis dahin bleibt die Reconciliation auf `REVIEW` (kein Auftrag wird ohne bestätigte Gebühr abgeglichen).
5. **Rückerstattungen:** `charge.refunded.amount_refunded` ist kumulativ → nur die Differenz zu bereits gebuchten Erstattungen wird gebucht. Vollständige Erstattung → `REFUNDED`, Download gesperrt, Gutschrift zum Testbeleg, Opportunity `CANCELLED`.
6. **Widerruf/Reklamation:** Kundenportal „Widerruf“ erzeugt einen Erstattungs**antrag** (`PENDING_OWNER`). Erstattet wird nur nach Eigentümerentscheidung (Policy `refund.initiate`: nur Owner, Betrag ≤ erstattbarer Rest; auch bei Notstopp möglich). Ob bei digitalen Inhalten ein Widerrufsrecht besteht, ist eine Rechtsfrage (LA-07) – die Software entscheidet das nicht.
7. **Einrichtung:** `npm run setup` (idempotent) erzeugt Schlüssel und Owner-Zugang; `--stripe` fragt Test-Schlüssel verdeckt ab und prüft sie lesend (`GET /v1/balance`, `livemode=false`) bevor gespeichert wird.

## Offen / bewusst nicht umgesetzt
- Zuordnung einer Stripe-Auszahlung (`payout.paid`) zu einzelnen Aufträgen über Balance Transactions – folgt mit echtem Testkonto (M3/M4). Der Mock-Provider deckt den Ablauf bereits ab.
- Asynchrone SEPA-Zahlarten sind im Event-Handler vorgesehen (`async_payment_succeeded/failed`), aber nicht mit echtem Stripe-Testkonto geprüft.
