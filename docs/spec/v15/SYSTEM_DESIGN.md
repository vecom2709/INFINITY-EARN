# INFINITY EARN – Technische Zielarchitektur 15.0

## Zweck

Entwickle ein **eigenständiges** digitales, weitgehend autonomes Unternehmen mit realer Nachfrageprüfung, erlaubter Akquise, Produktentwicklung, Bezahlung, Auslieferung, Rechnungsführung und belegtem Bankabgleich. Baue keinen Chatbot, der einen Geschäftsführer nur imitiert. Der Eigentümer gibt Grenzen einmalig vor; automatisierte Komponenten halten die Prozesse innerhalb dieser Grenzen am Laufen.

## Architekturentscheidung: zwei Systeme statt „ein Claude macht alles“

**A. Deterministischer Kern (dauerhaft innerhalb tatsächlicher Ressourcen)**: Kundenanfragen, CRM, Produkte, Angebote, Bestellungen, Zahlungs-Webhooks, Quotenprüfungen, Jobwarteschlange, Lieferservice, Belege, Kontenabgleich, Support, Rechteverwaltung, Auditlog. Teile müssen ohne permanenten LLM-Aufruf arbeiten.

**B. Begrenzt verfügbare KI-Schicht:** KI hilft bei Recherche, Auswertung, Angebotstexten, Software-/Produktentwicklung, Testgenerierung, Support und Verbesserungen. Sie meldet `QUOTA_BLOCKED`, `MISSING_TOOL`, `LICENSE_REVIEW` oder `HUMAN_REVIEW` statt automatisch fremde bezahlte APIs zu aktivieren. Eine Claude-Code-Sitzung bzw. ein persönliches Abo ist **kein** beliebig aufrufbarer, unbegrenzt kostenloser Produktions-Endpunkt.

### Fachliche Komponenten

| Bereich | Kernfunktion | Verbindliche Grenze |
|---|---|---|
| Owner-Dashboard | Status, nachvollziehbare Zahlungen, Ausnahmen | Keine Mockzahlen in LIVE |
| Lead Intake | Inbound, erlaubte Ausschreibungen, Partner | Quellenrecht und Consent |
| Demand Engine | Kunde/Auftrag vor Produktion | Belege realer Nachfrage |
| Offer Engine | Preis, Scope, Bedingungen, Gültigkeit | Vertrag/Steuern geprüft |
| Payment | Provider Checkout & signierte Webhooks | Keine Client-Redirect-Freigabe |
| Job Queue | persistente, idempotente Jobs | Quoten und Deadline-Grenzen |
| Product Factory | produktartspezifische Adapter | Capability/QA/Lizenz geprüft |
| Delivery | geschützte Inhalte oder Zugänge | Kundenzuordnung und Audit |
| Accounting | Rechnung, Ledger, Gebühren, Belege | Nummernkreise, Steuern, Refunds |
| Reconciliation | Provider Settlement und Bankgutschrift | Zwei getrennte Bestätigungen |
| AI Orchestration | Agenten und Werkzeuge | Policy entscheidet Nebenwirkungen |
| Compliance | Rechtenachweis, Werberecht, Datenschutz | Stop bei Unklarheit |

## Payout: korrekte Zustandsmaschine

```text
LEAD_FOUND
  → CONTACT_PERMITTED
  → SCOPE_APPROVED
  → QUOTE_SENT
  → QUOTE_ACCEPTED
  → PAYMENT_VERIFIED            (nur signierte, serverseitig geprüfte Zahlung)
  → JOB_QUEUED
  → PRODUCTION_COMPLETED
  → QA_PASSED
  → DELIVERED
  → INVOICE_RECORDED            (falls gesetzlich erforderlich in vorgeschriebenem Format)
  → PROVIDER_SETTLEMENT_KNOWN
  → PROVIDER_PAYOUT_SENT
  → BANK_CREDIT_VERIFIED        (nur bei bestätigter Bankbewegung)
  → CLOSED
```

**Sonderzustände:** `CONSENT_MISSING`, `NO_CAPACITY`, `PRODUCTION_BLOCKED`, `PAYMENT_FAILED`, `DISPUTED`, `REFUND_PENDING`, `QA_FAILED`, `TAX_REVIEW`, `LEGAL_REVIEW`, `BANK_NOT_CONNECTED`, `REVIEW_REQUIRED`. Keine negative oder fehlende Bestätigung darf als Erfolg ausgegeben werden.

### Zustandsübergänge und Belege

- Leads haben Quelle, Datum, Nutzungsrecht, Kontakterlaubnis und Ablaufdatum.
- Angebote speichern `scope_hash`, signierte Bestätigung, vereinbarte Lieferkriterien und verifizierte Annahme.
- Zahlungen benötigen Server-to-Server-Signaturprüfung, Provider-ID, Idempotency-Key, Währung und tatsächlichen Status.
- Produktion hat `capability_id`, Input-/Output-Schemas, Kostenbudget, Quotenbudget und QA-Nachweis.
- Rechnungen benötigen erlaubte Nummerierung, korrekte Rechnungsstellerdaten und geprüfte Steuerbehandlung.
- Rechnungs- und Stornodatensätze sollen nicht einfach stillschweigend überschrieben werden.
- Auszahlungen unterscheiden `settled_with_provider`, `payout_sent`, `bank_transaction_verified`.
- Steuerreserve ist ein getrennter, rechnerischer Wert; sie wird nicht automatisch als tatsächlich abgebucht dargestellt.

## Datenmodelle (Minimum)

```text
Opportunity(id, source, permitted_channel, buyer_intent, evidence_refs, expires_at, state)
Customer(id, legal_entity_data, consent, jurisdiction, data_retention_policy)
Quote(id, customer_id, scope_hash, amount, currency, expiry, acceptance_ref, state)
Order(id, quote_id, payment_id, capability_id, policy_version, state)
Payment(id, provider, event_id, verified_at, gross_amount, fee_amount, currency, state)
ProductionJob(id, order_id, capability, status, budget, evidence_refs, retry_count)
Delivery(id, order_id, artifact_ref, content_hash, delivered_at, acceptance_ref)
Invoice(id, order_id, number, issuer, recipient, tax_regime_ref, schema_version, status)
Payout(id, provider, amount, provider_ref, sent_at, bank_ref, bank_verified_at)
AuditEvent(id, correlation_id, actor, action, decision, evidence_hash, test_mode, timestamp)
```

## Konsistenz

- Jede Außenwirkung ist per `correlation_id` und `idempotency_key` wiederholbar ohne doppelte Ausführung.
- Datenbanktransaktionen, Outbox-Pattern, Event-Audit und Zustandsmaschinen-Guards nutzen.
- Webhooks prüfen Signatur, Replay-Schutz, Gültigkeit und Objektzuordnung.
- Belege beweissicher speichern, Zugriff und Löschung mit anwendbarem Recht vereinbaren.
- Keine Passwörter, API-Schlüssel oder vollständigen Zahlungsdaten in Logs.
- Berechtigungen auf Produkt-/Auftrags-/Kundenebene trennen.

## Freigabegrenzen

1. `LIVE_ENABLED=false` und `PAID_SERVICES_ALLOWED=false` sind Default.
2. Jeder KI-Vorschlag durchläuft eine deterministische Policy-Engine.
3. Keine Überweisung auf frei gewählte Konten, keine Kredite und keine beliebigen Ausgaben durch autonome Agenten.
4. Entscheidungen zu juristisch regulierten Leistungen, ungeklärten Steuersätzen, strittigen Kundenforderungen oder neuen kostenpflichtigen Tools werden pausiert.
5. Zahlungen, Rechnungen, Refunds und Payouts sind besonders zu schützen.
6. Abgelehnte Sondermodule 48, 49 und 110 bleiben ausgeschlossen; notwendige grundlegende Sicherheitskontrollen sind nicht abgeschaltet.

## Möglicher MVP-Stack (nach Prüfung der aktuellen Limits)

- **Webfrontend:** React + TypeScript + Vite (frei), Tokens und Komponenten aus Designsystem.
- **Kern:** TypeScript, ein Node-/Edge-Backend mit dauerhafter Datenspeicherung, kostenfreie Kontingente soweit tatsächlich nutzbar.
- **Daten:** D1/SQLite oder vergleichbarer günstiger/gedeckelter Datenspeicher; Migrationskonzept und saubere Datenexporte.
- **Tests:** Vitest, Playwright; der im Paket enthaltene Python-Kern dient nur als lehrreiches Minimalbeispiel.
- **Zahlungsanbieter:** optional nach realer Verifizierung; echte Gebühren beachten.
- **KI:** Claude Code als Entwicklungsumgebung und KI-Jobs nur über offiziell bereitstehende, tarifkonforme Möglichkeiten; nie private Login-Cookies als API zweckentfremden.
- **Rechenintensive Video-/3D-Produktion:** deaktiviert, bis kostenlose Ressourcen, Lizenz und Qualität im Pilot nachgewiesen sind.

## Umsetzungsreihenfolge

**M0 – Reality Check und UI-Design:** Repo, 127er Registry, Style Tokens, Premium-Dashboard, Test/LIVE-Trennung, Kosten- und Rechtsmatrix.

**M1 – Erster echter Nachweisfluss (lokaler TEST):** Lead → Angebot → bestätigter Test-Payment-Event → Auftrag → Produkt → QA → Delivery → Rechnungsschema → Providerauszahlung → `BANK_CREDIT_VERIFIED` ausschließlich mit gesondertem Testbeleg.

**M2 – Legal/Account Readiness:** Geschäftsdaten, rechtliche Freigaben, KYC, Konto, steuerlicher Rechnungsweg, Privacy, Consent. Ohne Nachweise kein LIVE.

**M3 – Erster echter Verkauf:** ausdrücklich freigegebener, bezahlter Pilot; reale Transaktion und dokumentierte tatsächliche Bankgutschrift. Ohne echten Käufer: Status `NO_SALES_YET`.

**M4 – Akquise und Qualität skalieren:** Nur erlaubte Quellen, Marketing, Scope-Management, Support, Abnahme.

**M5 – Produktklassen:** Templates, Kalkulatoren, kleine Webapps/APIs zuerst; komplexe Medien später nach Ressourcen-Nachweis.

**M6 – Restliche genehmigte 127 Module:** entlang von Abhängigkeiten, eine integrierte Schnittstelle, nur nach Tests und verifizierter Leistungsfähigkeit.

## Fortschrittsbericht nach jeder Phase

`Umgesetzt | Automatisch getestet | Manuell geprüft | Nur Simulation | Blockiert | Echte Kosten | Offene Rechtsfragen | Nächste Arbeit`.

**Niemals den fertigen Betrieb behaupten, wenn das Ergebnis nur ein Mockup, ein Prompt oder eine Simulation ist.**
