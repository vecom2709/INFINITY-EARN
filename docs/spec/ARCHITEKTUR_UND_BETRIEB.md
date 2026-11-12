# ARCHITEKTUR & BETRIEB — INFINITY EARN 5.0

## Leitidee
Die Software darf **auch ohne aktiven Claude-Aufruf Bestellungen entgegennehmen, sichere Webhooks verarbeiten, vorhandene Produkte ausliefern und Zahlungsvorgänge dokumentieren**. Claude ist die begrenzte Intelligenzschicht, nicht die einzige Sicherung für Verkäufe und Buchhaltung.

## Komponenten
| Komponente | Zweck | Ausfallverhalten |
|---|---|---|
| Owner-Portal | Live/Tests, Reports, Notstopp | nur Lese-/Owner-Aktionen |
| Lead Collector | zulässige öffentliche Quellen + Einwilligung | keine unerlaubte Kontaktaufnahme |
| AI CEO Scheduler | priorisierte, limitierte KI-Jobs | Job wartet auf Abo-Kontingent |
| Policy Engine | Ausgaben, Compliance, Preise, Marketing | verweigert unsichere Aktion |
| Product Factory | versionierte Fähigkeiten pro Produktklasse | unmachbare Aufgabe ablehnen |
| Payment Gateway | verifizierte Checkout-Events | kein Liefertrigger ohne validiertes Event |
| QA Service | automatisierte Freigabetests | kein Download vor bestandenem Gate |
| Delivery | signierte zeitlich begrenzte Links | keine offene Dateifreigabe |
| Invoice / Tax | Belege, SdI-Adapter nach Prüfung, Export | Status TAX_REVIEW bei unklarer Regel |
| Ledger | unveränderliche Zahlungshistorie | doppelte Events ignorieren |
| Payout Import | vom Provider bestätigte Auszahlungen | nicht als 'auf Konto' markieren ohne Beleg |
| Recovery | Dead-letter, retry, Alarme | Fehler isolieren, nicht verstecken |

## Job-Objekt
```
job_id, order_id?, kind, state, priority, created_at, due_at,
budget_eur, estimated_tokens, allowed_tools, retry_count,
requires_policy, stage, qa_status, artifact_refs, audit_refs
```

## Regelbeispiele
- `production.start`: erlaubt nur bei `PAYMENT_CONFIRMED` plus Feasibility + gültiger Kundenlizenz/Scope.
- `lead.contact`: erlaubt nur bei erfasstem gültigem Kommunikationskanal plus rechtskonformer Grundlage.
- `payout`: nur Provider-konfigurierter Auszahlungsplan, keine KI-initiierten Fremdkonten.
- `invoice.issue`: nur gültiger Nummernkreis, Rechnungssteller, korrekter Steuerkontext und freigegebener Ausgabekanal.
- `self_improve.deploy`: automatische Tests, Staging, kein Sicherheitsrisiko, keine finanziellen Berechtigungsänderungen; LIVE nur gemäß Eigentümer-Policy.

## Sorgfalt mit Ressourcen
Free-Worker eignet sich für kurze Events und Cron-Prüfungen, nicht für Rendering, Videobearbeitung oder stundenlange KI-Agenten. Bei fehlender Kapazität: `BLOCKED_CAPACITY`. Ein geplanter Task darf nicht blind neue Agenten-Spawns erzeugen. Quoten bei KI, API, Speicher, GitHub-Aktionen und Hosting müssen gemessen werden.

## Observability / Wiederanlauf
- strukturierte, datensparsame Events; keine Tokens/Passwörter in Logs.
- Audit-Trail für Quote -> Payment -> QA -> Invoice -> Payout.
- Circuit Breaker für Providerstörungen.
- Wiederaufnahme pro Auftrag dank idempotentem Step-State.
- Spätere Backups/Löschfristen mit rechtlichen Aufbewahrungsanforderungen vereinbaren.
- Owner-Notstopps: `PAUSE_ACQUISITION`, `PAUSE_PRODUCTION`, `PAUSE_PAYMENTS`, `STOP_ALL_JOBS`; gesetzlich gebotene Aufbewahrung/Belegpflichten bleiben berücksichtigt.

## Produktionsfähigkeit je Kategorie
| Kategorie | Erste Ausbaustufe | Kostenfreie Realisierbarkeit |
|---|---|---|
| Daten-/CSV-/Kalkulationsprodukt | Pilot | hoch, sofern Quelle rechtmäßig |
| Text/Dokumente | Pilot | abhängig von Claude-Limits und QA |
| Kleine Webseiten/Tools/APIs | Pilot | je nach Komplexität |
| Bilder/Logo/Design | später | spezielle Engine/Lizenz notwendig |
| 3D, Film, Video, Audio | später | Compute/Qualität/Kosten erst belegen |
| Hochrisiko-Fachgutachten | ausgeschlossen bis Fachprüfung | nicht ungesehen verkaufen |

## Beispiel einer sicheren ersten Geschäftslinie
Ein kleines B2B-Kalkulationstool aus einer realen, dokumentierten Anfrage. Quelle rechtlich freigegeben -> Preis/Scope -> Auftrag + Zahlung -> Template-Engine/kleine Code-Generation -> Unit-Tests -> Download -> Rechnungssystem -> Ledger -> Payout-Verifikation. Keine direkten Kalt-E-Mails nötig.
