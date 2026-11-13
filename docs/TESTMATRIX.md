# Abnahmematrix IE-001 … IE-100

Automatisch erzeugt von `npm run test:matrix` am 2026-11-13.

**98 von 100** Abnahmefällen sind als ausführbare Tests abgebildet; die übrigen sind mit Begründung und Ziel-Meilenstein als offen markiert.

| ID | Fall | Status | Nachweis |
|---|---|---|---|
| IE-001 | Owner-Policy geladen | automatisiert | tests/unit/policy.test.ts |
| IE-002 | Keine Policy vorhanden | automatisiert | tests/integration/governance.test.ts, tests/unit/policy.test.ts |
| IE-003 | Preis innerhalb Grenzwerten | automatisiert | tests/integration/opportunity.test.ts, tests/unit/policy.test.ts |
| IE-004 | Preis über Maximalwert | automatisiert | tests/integration/opportunity.test.ts, tests/unit/policy.test.ts |
| IE-005 | Notstopp aktiviert | automatisiert | tests/integration/governance.test.ts, tests/integration/m1-acquisition.test.ts, tests/unit/policy.test.ts |
| IE-006 | AI fordert Fremdüberweisung | automatisiert | tests/integration/governance.test.ts, tests/unit/policy.test.ts |
| IE-007 | AI will kostenpflichtige API aktivieren | automatisiert | tests/integration/governance.test.ts, tests/unit/policy.test.ts |
| IE-008 | Policy Versionswechsel | automatisiert | tests/integration/governance.test.ts |
| IE-009 | Ausgeschöpftes Claude-Limit | automatisiert | tests/integration/governance.test.ts |
| IE-010 | Offline-KI während Checkout | automatisiert | tests/integration/governance.test.ts |
| IE-011 | Erlaubte öffentliche Quelle | automatisiert | tests/integration/acquisition.test.ts, tests/integration/m1-acquisition.test.ts |
| IE-012 | Quelle verbietet Bots | automatisiert | tests/integration/acquisition.test.ts, tests/integration/m1-acquisition.test.ts |
| IE-013 | Inbound-Anfrage | automatisiert | tests/integration/acquisition.test.ts |
| IE-014 | E-Mail mit Opt-in | automatisiert | tests/integration/acquisition.test.ts |
| IE-015 | Fehlende Einwilligung | automatisiert | tests/integration/acquisition.test.ts |
| IE-016 | Abmeldung | automatisiert | tests/integration/acquisition.test.ts |
| IE-017 | Doppelte Leads | automatisiert | tests/integration/acquisition.test.ts |
| IE-018 | Ausschreibung abgelaufen | automatisiert | tests/integration/acquisition.test.ts, tests/integration/m1-acquisition.test.ts |
| IE-019 | Geänderte Plattform-ToS | automatisiert | tests/integration/acquisition.test.ts, tests/integration/m1-acquisition.test.ts |
| IE-020 | Erfundene Kaufabsicht im Quelltext | automatisiert | tests/integration/acquisition.test.ts, tests/integration/m1-acquisition.test.ts |
| IE-021 | Echter Scope vorhanden | automatisiert | tests/integration/opportunity.test.ts |
| IE-022 | Unklarer Umfang | automatisiert | tests/integration/m1-acquisition.test.ts, tests/integration/opportunity.test.ts |
| IE-023 | Rentabler Auftrag | automatisiert | tests/integration/opportunity.test.ts, tests/unit/core.test.ts |
| IE-024 | Negativer Deckungsbeitrag | automatisiert | tests/integration/opportunity.test.ts, tests/unit/policy.test.ts |
| IE-025 | Fehlende Lieferressourcen | automatisiert | tests/integration/opportunity.test.ts |
| IE-026 | Unerlaubtes Produkt | automatisiert | tests/integration/opportunity.test.ts |
| IE-027 | Kunde akzeptiert nachvollziehbar | automatisiert | tests/integration/opportunity.test.ts |
| IE-028 | Kein Akzeptanznachweis | automatisiert | tests/integration/opportunity.test.ts |
| IE-029 | Doppelte Akzeptanznachricht | automatisiert | tests/integration/opportunity.test.ts |
| IE-030 | Währung ungewöhnlich | automatisiert | tests/unit/core.test.ts |
| IE-031 | Gültiger Checkout-Testevent | automatisiert | tests/integration/m2-payments.test.ts, tests/integration/payments.test.ts |
| IE-032 | Gefälschte Webhook-Signatur | automatisiert | tests/integration/payments.test.ts, tests/unit/core.test.ts |
| IE-033 | Doppelter Provider-Event | automatisiert | tests/integration/payments.test.ts |
| IE-034 | Frontend Redirect ohne Webhook | automatisiert | tests/e2e/pilot.test.ts, tests/integration/payments.test.ts |
| IE-035 | Asynchrone Zahlung pending | automatisiert | tests/integration/payments.test.ts |
| IE-036 | Zahlung fehlgeschlagen | automatisiert | tests/integration/payments.test.ts |
| IE-037 | Zahlung bestätigt | automatisiert | tests/integration/payments.test.ts |
| IE-038 | Chargeback erhalten | automatisiert | tests/integration/m2-payments.test.ts, tests/integration/payments.test.ts |
| IE-039 | Refund bestätigt | automatisiert | tests/integration/m2-payments.test.ts, tests/integration/payments.test.ts |
| IE-040 | Verschiedene Test-/Live-Keys | automatisiert | tests/integration/m2-payments.test.ts, tests/integration/payments.test.ts, tests/unit/core.test.ts |
| IE-041 | Capability vorhanden und freigegeben | automatisiert | tests/integration/production.test.ts |
| IE-042 | Capability nicht verfügbar | automatisiert | tests/integration/opportunity.test.ts |
| IE-043 | Lizenzfreie Eigenarbeit | automatisiert | tests/integration/production.test.ts |
| IE-044 | Fremde urheberrechtliche Assets | automatisiert | tests/integration/production.test.ts |
| IE-045 | CPU-/Speichergrenze erreicht | automatisiert | tests/integration/production.test.ts |
| IE-046 | Produktgeneration innerhalb Limits | automatisiert | tests/integration/production.test.ts, tests/unit/core.test.ts |
| IE-047 | Produktgenerierung schlägt fehl | automatisiert | tests/integration/production.test.ts |
| IE-048 | Ungeprüfte Bibliothek verlangt Kosten | automatisiert | tests/unit/policy.test.ts |
| IE-049 | Agent erhält Prompt-Injection in Kundendaten | automatisiert | tests/integration/m1-acquisition.test.ts, tests/integration/production.test.ts |
| IE-050 | Kundendaten anderer Auftrag | automatisiert | tests/integration/production.test.ts |
| IE-051 | Alle QA-Checks erfolgreich | automatisiert | tests/integration/production.test.ts |
| IE-052 | QA-Check fehlgeschlagen | automatisiert | tests/integration/production.test.ts |
| IE-053 | Beschädigtes Artefakt | automatisiert | tests/integration/production.test.ts |
| IE-054 | Downloadlink läuft ab | automatisiert | tests/integration/production.test.ts |
| IE-055 | Fremder Kunde greift zu | automatisiert | tests/integration/production.test.ts |
| IE-056 | Doppelte Delivery-Events | automatisiert | tests/integration/production.test.ts |
| IE-057 | Falsches Dateiformat | automatisiert | tests/unit/core.test.ts |
| IE-058 | Kundenfeedback Reklamation | automatisiert | tests/integration/production.test.ts |
| IE-059 | Lieferung ohne Payment | automatisiert | tests/integration/production.test.ts |
| IE-060 | Sicherheitslücke im Lieferprodukt | automatisiert | tests/integration/production.test.ts |
| IE-061 | Gültige Pflichtdaten im Test | automatisiert | tests/integration/finance.test.ts |
| IE-062 | Pflichtdaten fehlen | automatisiert | tests/integration/finance.test.ts |
| IE-063 | Gleiche Rechnungsnummer zweimal | automatisiert | tests/integration/finance.test.ts |
| IE-064 | Italienischer SdI-Fall ohne Kanal | automatisiert | tests/integration/finance.test.ts |
| IE-065 | PDF allein bei erforderlichem XML | automatisiert | tests/unit/core.test.ts |
| IE-066 | Steuerkontext unklar | automatisiert | tests/unit/core.test.ts |
| IE-067 | Gutschrift für Refund | automatisiert | tests/integration/finance.test.ts, tests/integration/m2-payments.test.ts |
| IE-068 | Rechnung storniert | automatisiert | tests/integration/finance.test.ts |
| IE-069 | OSS-Fall unbekannt | automatisiert | tests/integration/finance.test.ts |
| IE-070 | Monatsbericht | automatisiert | tests/integration/finance.test.ts |
| IE-071 | Gebühren vom Provider bestätigt | automatisiert | tests/integration/m2-payments.test.ts, tests/integration/payments.test.ts |
| IE-072 | Unbekannte Buchung | automatisiert | tests/integration/finance.test.ts |
| IE-073 | Payout vom Provider bestätigt | automatisiert | tests/integration/finance.test.ts |
| IE-074 | Bankeingang noch nicht bestätigt | automatisiert | tests/integration/finance.test.ts |
| IE-075 | Zahlung doppelt | automatisiert | tests/integration/payments.test.ts |
| IE-076 | Negative Marge | automatisiert | tests/unit/policy.test.ts |
| IE-077 | Steuerreserve Schätzung | automatisiert | tests/integration/finance.test.ts |
| IE-078 | Neue Auszahlungsempfänger-IBAN | automatisiert | tests/unit/policy.test.ts |
| IE-079 | Payout gescheitert | automatisiert | tests/integration/finance.test.ts |
| IE-080 | Kosten > 0 ohne Freigabe | automatisiert | tests/integration/ops.test.ts, tests/unit/policy.test.ts |
| IE-081 | Gültige Owner Session | automatisiert | tests/security/security.test.ts |
| IE-082 | Unauthentifizierter Zugriff | automatisiert | tests/security/security.test.ts |
| IE-083 | Cross-tenant Auftrag | automatisiert | tests/integration/production.test.ts |
| IE-084 | Webhook Replay | automatisiert | tests/security/security.test.ts, tests/unit/core.test.ts |
| IE-085 | Secret im Debuglog | automatisiert | tests/unit/core.test.ts |
| IE-086 | Datenauskunft nach Identitätsprüfung | automatisiert | tests/security/security.test.ts |
| IE-087 | Löschantrag mit Aufbewahrungspflicht | automatisiert | tests/security/security.test.ts |
| IE-088 | SQL/HTML Injection im Lead | automatisiert | tests/integration/m1-acquisition.test.ts, tests/security/security.test.ts |
| IE-089 | Dependency Schwachstelle | offen | Teilweise: CI-Schritt `npm audit --audit-level=critical` in .github/workflows/ci.yml blockiert kritische Releases. Kein lokaler Test, da Netzwerkzugriff nötig; Nachweis erst mit erstem GitHub-Actions-Lauf (kein Git/GitHub-Repo in dieser Umgebung). |
| IE-090 | Datenexport ohne Berechtigung | automatisiert | tests/security/security.test.ts |
| IE-091 | Cron erfolgreich | automatisiert | tests/integration/ops.test.ts |
| IE-092 | Cron doppelt ausgelöst | automatisiert | tests/integration/ops.test.ts |
| IE-093 | Queue Worker abgestürzt | automatisiert | tests/integration/ops.test.ts |
| IE-094 | Dead-letter erreicht | automatisiert | tests/integration/ops.test.ts |
| IE-095 | Free-Quota nähert sich Limit | automatisiert | tests/integration/ops.test.ts |
| IE-096 | Claude-Task nicht verfügbar | automatisiert | tests/integration/governance.test.ts |
| IE-097 | Codeverbesserung im Sandbox-Test | offen | Offen (M6): Sandbox-Codeverbesserung -> PR benötigt Git + GitHub-Repository. Policy-Gates für Deploy (IE-098/IE-099) sind bereits automatisiert. |
| IE-098 | AI will ungeprüften Code live deployen | automatisiert | tests/unit/policy.test.ts |
| IE-099 | Tests nach Codeänderung rot | automatisiert | tests/unit/policy.test.ts |
| IE-100 | Kompletter Pilot-E2E im Testmode | automatisiert | tests/e2e/pilot.test.ts |
