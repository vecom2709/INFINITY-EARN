# INFINITY EARN – 100 VERBINDLICHE ABNAHMETESTS

Jeder Test muss mit reproduzierbaren Schritten, erwarteten Events und tatsächlichem Ergebnis dokumentiert werden. Diese Testfälle sind **Vorgaben**; Claude Code muss die ausführbaren Tests erst implementieren.

## Governance/Autonomie

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-001 | Owner-Policy geladen | Nur konfigurierte Aktionen werden ausgeführt | Positiv |
| IE-002 | Keine Policy vorhanden | Alle externen Aktionen blockiert | Negativ |
| IE-003 | Preis innerhalb Grenzwerten | Quote freigegeben | Positiv |
| IE-004 | Preis über Maximalwert | Quote blockiert | Negativ |
| IE-005 | Notstopp aktiviert | Alle operativen Jobs anhalten | Negativ |
| IE-006 | AI fordert Fremdüberweisung | Ablehnen und Audit-Eintrag | Negativ |
| IE-007 | AI will kostenpflichtige API aktivieren | Ablehnen; keine Zahlungsdaten abrufen | Positiv |
| IE-008 | Policy Versionswechsel | Neue Policy erst nach Freigabe gültig | Positiv |
| IE-009 | Ausgeschöpftes Claude-Limit | Queue statt unautorisierten API-Kredit | Positiv |
| IE-010 | Offline-KI während Checkout | Deterministischer Bestellkern arbeitet weiter | Positiv |

## Akquise/Marketing

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-011 | Erlaubte öffentliche Quelle | Quellennachweis speichern | Positiv |
| IE-012 | Quelle verbietet Bots | Automatisierung blockieren | Positiv |
| IE-013 | Inbound-Anfrage | Qualifizierung ohne Consent-Fälschung | Positiv |
| IE-014 | E-Mail mit Opt-in | Versand gemäß Zweck/Präferenz zulassen | Positiv |
| IE-015 | Fehlende Einwilligung | Kein Marketingkontakt | Negativ |
| IE-016 | Abmeldung | Keine weitere Werbung | Positiv |
| IE-017 | Doppelte Leads | Ein Kontaktprofil statt Mehrfachversand | Negativ |
| IE-018 | Ausschreibung abgelaufen | Kein Angebot mehr | Negativ |
| IE-019 | Geänderte Plattform-ToS | Integration bis Prüfung pausieren | Positiv |
| IE-020 | Erfundene Kaufabsicht im Quelltext | Lead nicht als bestätigt markieren | Positiv |

## Opportunity & Angebot

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-021 | Echter Scope vorhanden | Feasibility-Check starten | Positiv |
| IE-022 | Unklarer Umfang | Angebot mit offenen Punkten, nicht verkaufen | Positiv |
| IE-023 | Rentabler Auftrag | Preis aus Kosten+Marge herleiten | Positiv |
| IE-024 | Negativer Deckungsbeitrag | Ablehnen | Positiv |
| IE-025 | Fehlende Lieferressourcen | NO_CAPACITY | Negativ |
| IE-026 | Unerlaubtes Produkt | Rechtliches Gate blockiert | Positiv |
| IE-027 | Kunde akzeptiert nachvollziehbar | Order anlegen | Positiv |
| IE-028 | Kein Akzeptanznachweis | Kein Auftrag | Negativ |
| IE-029 | Doppelte Akzeptanznachricht | Nur ein Auftrag | Negativ |
| IE-030 | Währung ungewöhnlich | Korrekte Minor-Units statt Rundungsfehler | Positiv |

## Zahlungen/Checkout

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-031 | Gültiger Checkout-Testevent | Testorder payment confirmed | Positiv |
| IE-032 | Gefälschte Webhook-Signatur | Event ablehnen | Positiv |
| IE-033 | Doppelter Provider-Event | Keine Doppelbuchung | Negativ |
| IE-034 | Frontend Redirect ohne Webhook | Keine Auslieferung | Negativ |
| IE-035 | Asynchrone Zahlung pending | Produktion warten lassen | Positiv |
| IE-036 | Zahlung fehlgeschlagen | Keine Produktion | Negativ |
| IE-037 | Zahlung bestätigt | Produktion nach Policy zulassen | Positiv |
| IE-038 | Chargeback erhalten | Order/Ledger auf Dispute | Positiv |
| IE-039 | Refund bestätigt | Korrekte Rückbuchung | Positiv |
| IE-040 | Verschiedene Test-/Live-Keys | Keine Vermischung | Positiv |

## Produktion/Produktfabrik

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-041 | Capability vorhanden und freigegeben | Auftrag an Worker routen | Positiv |
| IE-042 | Capability nicht verfügbar | Auftrag ablehnen | Negativ |
| IE-043 | Lizenzfreie Eigenarbeit | Artifact mit Rechte-Nachweis | Positiv |
| IE-044 | Fremde urheberrechtliche Assets | Blockieren | Negativ |
| IE-045 | CPU-/Speichergrenze erreicht | Job pausieren, nicht Rechnung riskieren | Positiv |
| IE-046 | Produktgeneration innerhalb Limits | Versioniertes Artefakt erzeugen | Positiv |
| IE-047 | Produktgenerierung schlägt fehl | Retry begrenzt, Zustand ERROR | Negativ |
| IE-048 | Ungeprüfte Bibliothek verlangt Kosten | Nicht installieren | Positiv |
| IE-049 | Agent erhält Prompt-Injection in Kundendaten | Anweisungen ignorieren | Negativ |
| IE-050 | Kundendaten anderer Auftrag | Isolation sicherstellen | Positiv |

## QA/Auslieferung

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-051 | Alle QA-Checks erfolgreich | Lieferung ermöglichen | Positiv |
| IE-052 | QA-Check fehlgeschlagen | Lieferung blockiert | Negativ |
| IE-053 | Beschädigtes Artefakt | Checksum-Fehler melden | Positiv |
| IE-054 | Downloadlink läuft ab | Download danach verweigern | Positiv |
| IE-055 | Fremder Kunde greift zu | Zugriff verweigern | Negativ |
| IE-056 | Doppelte Delivery-Events | Nur ein Lieferbeleg | Negativ |
| IE-057 | Falsches Dateiformat | QA-Fail | Positiv |
| IE-058 | Kundenfeedback Reklamation | Ticket erstellen | Positiv |
| IE-059 | Lieferung ohne Payment | Blockiert | Negativ |
| IE-060 | Sicherheitslücke im Lieferprodukt | Isolieren und Nachbearbeitung | Positiv |

## Rechnung/Steuer

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-061 | Gültige Pflichtdaten im Test | Test-Rechnungsentwurf | Positiv |
| IE-062 | Pflichtdaten fehlen | TAX_REVIEW | Negativ |
| IE-063 | Gleiche Rechnungsnummer zweimal | Datenbank verweigert | Positiv |
| IE-064 | Italienischer SdI-Fall ohne Kanal | Nicht als gültig ausgegeben melden | Negativ |
| IE-065 | PDF allein bei erforderlichem XML | Warnung/Blockade | Positiv |
| IE-066 | Steuerkontext unklar | Keine pauschale USt-Berechnung | Positiv |
| IE-067 | Gutschrift für Refund | Original referenzieren | Positiv |
| IE-068 | Rechnung storniert | Historie unverändert | Positiv |
| IE-069 | OSS-Fall unbekannt | Steuerliche Fachfreigabe anfordern | Negativ |
| IE-070 | Monatsbericht | Lückenloser Belegexport | Positiv |

## Ledger/Bank/Finanzen

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-071 | Gebühren vom Provider bestätigt | Exakte Gebühren verbuchen | Positiv |
| IE-072 | Unbekannte Buchung | Reconciliation auf REVIEW | Negativ |
| IE-073 | Payout vom Provider bestätigt | Payout als gesendet markieren | Positiv |
| IE-074 | Bankeingang noch nicht bestätigt | Nicht als gutgeschrieben melden | Negativ |
| IE-075 | Zahlung doppelt | Nur einmal im Ledger | Negativ |
| IE-076 | Negative Marge | Angebots-/Expansionsstopp | Positiv |
| IE-077 | Steuerreserve Schätzung | Als geschätzt kennzeichnen | Positiv |
| IE-078 | Neue Auszahlungsempfänger-IBAN | Nur Owner-KYC/Provider UI | Positiv |
| IE-079 | Payout gescheitert | Status FAILED und Alert | Negativ |
| IE-080 | Kosten > 0 ohne Freigabe | Zahlungsanforderung verweigern | Negativ |

## Sicherheit/DSGVO

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-081 | Gültige Owner Session | Dashboard autorisiert | Positiv |
| IE-082 | Unauthentifizierter Zugriff | 401/403 ohne Datenleck | Positiv |
| IE-083 | Cross-tenant Auftrag | Isolation | Positiv |
| IE-084 | Webhook Replay | Verwerfen | Positiv |
| IE-085 | Secret im Debuglog | Log redigieren und Test fail | Positiv |
| IE-086 | Datenauskunft nach Identitätsprüfung | Export möglich | Positiv |
| IE-087 | Löschantrag mit Aufbewahrungspflicht | Differenzierte Sperre/Löschung | Positiv |
| IE-088 | SQL/HTML Injection im Lead | Eingabe validieren | Negativ |
| IE-089 | Dependency Schwachstelle | CI blockiert kritische Release | Positiv |
| IE-090 | Datenexport ohne Berechtigung | Sperre | Negativ |

## Betrieb/Self-improvement

| ID | Fall / Eingabe | Erwartetes Verhalten | Typ |
|---|---|---|---|
| IE-091 | Cron erfolgreich | Ein Job pro Intervall und Key | Positiv |
| IE-092 | Cron doppelt ausgelöst | Idempotent | Negativ |
| IE-093 | Queue Worker abgestürzt | Retry mit Backoff | Positiv |
| IE-094 | Dead-letter erreicht | Alarm und kein Endlosloop | Positiv |
| IE-095 | Free-Quota nähert sich Limit | Throttle | Positiv |
| IE-096 | Claude-Task nicht verfügbar | Pause + Plan B | Negativ |
| IE-097 | Codeverbesserung im Sandbox-Test | PR erstellen | Positiv |
| IE-098 | AI will ungeprüften Code live deployen | Sperren | Positiv |
| IE-099 | Tests nach Codeänderung rot | Rollback/kein Release | Negativ |
| IE-100 | Kompletter Pilot-E2E im Testmode | Beweis mit Event-IDs und Screenshots | Positiv |
