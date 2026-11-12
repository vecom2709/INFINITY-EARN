# M2-Bericht – Payment → Fulfillment

**Datum:** 12.11.2026 · **Ergebnis:** implementiert, automatisiert getestet **und mit echter Stripe-Testtransaktion nachgewiesen** (Sandbox „INFINITY EARN“, getrennt von Vecom Design).

## Echter Stripe-Testkauf (12.11.2026, 03:23 MEZ)
| Schritt | Nachweis |
|---|---|
| Stripe-Konto | eigenes Konto „INFINITY EARN“, CLI nur für Sandbox `acct_1UanTbQZB2KUWElL` autorisiert (kein Live-Konto, nichts von vecom-design) |
| Anfrage → Angebot | `/anfrage` → automatisches Angebot `quo_07254bff…` über 54,29 € |
| Checkout | echte Stripe-Checkout-Sitzung `cs_test_a0g6…`, Testkarte 4242… |
| Zahlung | signierter Webhook `evt_1UanfgQZB2KUWElLDG47FBpt` (`checkout.session.completed`) → HTTP 200 → `CONFIRMED` |
| Produktion/QA/Lieferung | QA 5/5 bestanden (encoding, format, totals, formula_injection, checksum), Lieferung `dlv_0acb23db…`, Download im Kundenportal |
| Beleg | `TEST-2026-000001` (DRAFT, `TEST_NO_TAX_CALCULATION`) |
| Gebühr | zuerst Reconciliation `REVIEW` (`FEE_UNCONFIRMED`), dann echte Stripe-Gebühr **1,96 €** aus Balance Transaction `txn_3UanffQZB2KUWElL1W0DsrTt` gebucht |
| Abgleich | Reconciliation `OK` → Pipeline `LEDGER_RECONCILED` |

Befunde dabei: (1) Der Browser-Bereich der App bricht die Weiterleitung von localhost zu checkout.stripe.com ab (`ERR_ABORTED`) – Werkzeug `npm run checkout:url` liefert die Bezahl-URL. In normalen Browsern tritt das nicht auf. (2) Die Stripe CLI ≥ 1.55 speichert Schlüssel im Windows-Anmeldeinformationsspeicher; der Testschlüssel wird deshalb einmalig verdeckt per `npm run setup -- --stripe` eingegeben, das Webhook-Secret holt das Skript automatisch. (3) `stripe listen` verlangt in dieser Version eine Event-Liste (`--events …`, siehe Anleitung).

## Implementiert
| Anforderung (Masterprompt M2) | Umsetzung |
|---|---|
| Stripe Testmodus | REST-Adapter ohne SDK (`services/finance/src/providers/stripe.ts`): Checkout Session, Refund, Gebührenabfrage; nur Test-Schlüssel, Live-Antworten verworfen |
| Webhookprüfung | Stripe-Signaturschema (seit M0), jetzt mit Provider-Kennung; Zuordnung über Metadaten bzw. PaymentIntent |
| Idempotenz | Event-ID unique (DB), Idempotency-Keys bei Stripe-Schreibaufrufen, kumulative Erstattungen als Differenz |
| Order-Ledger | Zahlung, exakte Provider-Gebühr (Balance Transaction via Job `fee_sync`), Erstattung, Dispute; Reconciliation wartet auf bestätigte Gebühr |
| Digitale Lieferstrecke + QA | aus M0 (Produktion, QA, signierter Download), jetzt auch nach Stripe-Zahlung getestet |
| Fehlerpfade | Provider-Fehler/401/402, Live-Sitzung, fehlende Gebühr (Retry), Teilerstattung, Dispute ohne Metadaten, doppelte Events |
| Widerruf/Refund-Flows | Portal-Widerruf → Erstattungsantrag → Eigentümer genehmigt/lehnt ab → Provider → Webhook → Ledger, Gutschrift, Download gesperrt |
| Einrichtung | `npm run setup` (Schlüssel, Owner-Zugang, DB, optional TED-Freigabe und Stripe), `npm run stripe:check`, Anleitung `docs/operations/stripe-testmodus.md` |

## Getestet
| Prüfung | Ergebnis |
|---|---|
| `npm run verify` | ✅ 139 Tests + E2E (10 neue M2-Tests mit nachgebildeter Stripe-API, ohne Netzwerk) |
| `npm run dryrun` | ✅ |
| `npm run setup -- --approve-ted` | ✅ ausgeführt: Schlüssel + Owner-Zugang erzeugt, DB migriert (0001–0003), TED freigegeben |
| Server-Start | ✅ läuft auf http://localhost:8787; erster echter TED-Abruf automatisch: 100 Bekanntmachungen gespeichert, 0 relevant |

## Nicht verfügbar / blockiert
- **Echte Stripe-Testzahlung** – braucht Ihr Stripe-Testkonto und `npm run setup -- --stripe` (Konto anlegen und Schlüssel eintragen darf Claude nicht).
- **Öffentlicher Webhook-Endpunkt** – lokal nur über Stripe CLI (`stripe listen`); öffentlich erst mit Staging-Deployment.
- Auszahlungszuordnung Stripe-Payout → Aufträge (siehe ADR 0003).
- Widerrufsrecht für digitale Inhalte: rechtliche Bewertung offen (LA-07); die Software entscheidet nicht automatisch.

## Nächste Schritte
1. Stripe-Testmodus einrichten (Anleitung) und echten Testkauf mit Karte 4242… durchführen → Nachweis IE-031 mit echtem Provider.
2. M3 ist Eigentümer-/Beratungsarbeit (Registrierung, KYC, Steuern, Rechtstexte); technisch parallel möglich: Staging-Deployment (Cloudflare-Adapter).

## Risiken
- Stripe-Antwortfelder sind aus der bekannten API-Struktur implementiert und mit nachgebildeten Antworten getestet, nicht gegen ein echtes Konto – Abweichungen zeigen sich als Fehler-/Retry-Zustände, nicht als Falschbuchungen.
- Gebühren-Abgleich hängt an der Verfügbarkeit der Balance Transaction (bis zu 8 Retries mit Backoff, danach Dead-Letter + Alarm).
