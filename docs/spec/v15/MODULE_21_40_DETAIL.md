# INFINITY EARN 6.0 – Technische Einzel-Spezifikation der Erweiterungen 21–40

**Status:** verbindliche Umsetzungsanforderungen. Nichts davon ist durch dieses Dokument bereits implementiert. Alle 20 Punkte wurden mit JA bestätigt. Version 5.0 (Module 01–20, M0–M6 und Tests IE-001–100) bleibt vollständig erhalten.

## Technische Grundkonventionen

- Jedes Modul erhält `src/modules/mXX`, `README`, `ports`, `adapters`, `policy`, `schemas`, `unit`, `integration`, `e2e`, Metriken und ein dokumentiertes Fehlerverhalten.
- Jeder externe Effekt besitzt idempotente Kommando-ID, Authorisierungs-/Kostenentscheidung und append-only Audit-Eintrag.
- Der AI CEO erstellt Pläne und schlägt Befehle vor; eine deterministische Policy Engine entscheidet über Ausführung.
- `LIVE_ENABLED=false` sowie `PAID_APIS_ALLOWED=false` als Defaults; keine stillschweigende Live-Aktivierung.
- Vorgänge mit unklarem Rechts-, Steuer-, Quellen- oder Lizenzstatus landen in REVIEW und nicht in LIVE.
- Jeder Event trägt `event_id`, `event_type`, `aggregate_id`, `correlation_id`, `occurred_at`, `schema_version`, `test_mode`, `policy_version`, `source_ref`.

## Module

### 21 – Autonomous Demand Hunter

**Ziel:** Kaufbereite Nachfrage entdecken statt wahllos Produkte produzieren.

**Eingangsdaten:** Zugelassene öffentliche Ausschreibungen/Feeds, eingehende Formularanfragen, opt-in-Partneranfragen.

**Technischer Ablauf:** Quellen-Adapter mit Allowlist; robots/ToS/API-Lizenz-Version und Aktualität prüfen; explizite Kaufabsicht von bloßem Interesse trennen; Duplikate über Quell-ID und Text-Hash zusammenführen; Belege sichern; Quelle bei Regeländerung deaktivieren.

**Ausgabeartefakte:** `Opportunity(status=VERIFIED|UNVERIFIED|BLOCKED, evidence_refs, source_expiry, customer_intent, permitted_contact).`

**Domain-Events:** `source.checked, opportunity.discovered, opportunity.verified, opportunity.rejected`

**Hard Gate:** Kein Scraping gegen Nutzungsbedingungen; keine Kontaktdaten als Versandgenehmigung interpretieren.

**Messgrößen:** Anteil nachgewiesener kaufbereiter Anfragen; Quellenfehlerquote.

**Fünf verpflichtende Testfälle:**

- **IE6-21-01:** Berechtigter Feed mit echter Ausschreibung erzeugt VERIFIED mit Nachweis.
- **IE6-21-02:** Robots-/ToS-Sperre beendet Adapter vor Datenerfassung.
- **IE6-21-03:** Unverbindlicher Blogkommentar erzeugt keine Kaufbestätigung.
- **IE6-21-04:** Duplikat aus zwei Feeds erzeugt nur eine Opportunity mit Quellenliste.
- **IE6-21-05:** Abgelaufene Ausschreibung kann nicht in Angebot überführt werden.

### 22 – Customer-First Production

**Ziel:** Erst Auftrag und Zahlung sichern, dann individuell produzieren.

**Eingangsdaten:** Verified Opportunity, Scope, Capability, Angebot, nachgewiesene Kundenannahme und Zahlungsstatus.

**Technischer Ablauf:** State Machine DISCOVERED→SCOPE_CONFIRMED→OFFERED→ACCEPTED→PAYMENT_CONFIRMED→PRODUCTION→QA→DELIVERED; idempotente Transitionen; vor Produktion Kapazität und Rechte noch einmal prüfen; bei Dispute/Refund Produktion anhalten.

**Ausgabeartefakte:** `Order, ProductionJob und nachprüfbare Auslieferungsbelege.`

**Domain-Events:** `quote.accepted, payment.confirmed, production.started, qa.passed, delivery.completed`

**Hard Gate:** Ohne signierte Zahlungserkennung kein Produktionsstart; Zahlungsredirect reicht nicht.

**Messgrößen:** Unbezahlte Produktionsminuten, Auslieferungsquote, Deckungsbeitrag.

**Fünf verpflichtende Testfälle:**

- **IE6-22-01:** Zahlung bestätigt und Scope klar: genau ein Job wird eingereiht.
- **IE6-22-02:** Unbezahlte Bestellung: kein Produktionsjob.
- **IE6-22-03:** Nur Checkout-Redirect ohne Webhook: Auftrag bleibt PENDING.
- **IE6-22-04:** Doppelter Payment-Event: genau ein Produktionsjob.
- **IE6-22-05:** Rückbuchung vor Arbeitsbeginn blockiert Job und setzt REVIEW.

### 23 – AI Business Opportunity Predictor

**Ziel:** Neue Geschäftsfelder nach belegbarer Nachfrage und kleinen Tests priorisieren.

**Eingangsdaten:** Opportunity-Backlog, Wettbewerbsangebote mit Quellen, Klick-/Kaufdaten, Kosten- und Kapazitätsdaten.

**Technischer Ablauf:** Score = gewichtete Evidenz, Zahlbereitschaft, realistische Marge, Lieferrisiko und Wettbewerb; Prognosen als Hypothese mit Konfidenzintervall markieren; Experiment vor Skalierung registrieren; keine fiktiven Nachfragedaten.

**Ausgabeartefakte:** `Hypothesis, Experiment und nachvollziehbarer Ranking-Report.`

**Domain-Events:** `hypothesis.created, experiment.started, experiment.completed, business.case.rejected`

**Hard Gate:** Kein Geld für ungeprüfte Experimente; Score ist keine Erfolgsgarantie.

**Messgrößen:** Experimentkosten, bestätigte Kaufintentionen, Anteil profitabler Tests.

**Fünf verpflichtende Testfälle:**

- **IE6-23-01:** Echte bestätigte Nachfrage erhält höheren Evidenzwert als Suchtrend.
- **IE6-23-02:** Fehlende Daten führen zu UNKNOWN, nicht zu 100% Erfolg.
- **IE6-23-03:** Unprofitable Hypothese erhält STOP trotz hoher Klickrate.
- **IE6-23-04:** A/B-Test mit kleiner Stichprobe wird nicht als sicherer Sieger markiert.
- **IE6-23-05:** Experiment mit Ausgabenwunsch > 0 wird in Nullkostenmodus blockiert.

### 24 – Autonomous Acquisition Network

**Ziel:** Rechtssichere, mehrkanalige Kundengewinnung ohne tägliche Handarbeit.

**Eingangsdaten:** Inbound-Leads, öffentlich erlaubte Bewerbungs-/Ausschreibungskanäle, Opt-in-Datensätze, SEO-Inhalte.

**Technischer Ablauf:** Kanäle als Plugins mit Policy: allowed_action, Zweck, Rechtsgrundlage, Versandrate, Opt-out; Quellenregeln speichern; Marketingstatus und Consent versionieren; keine plattformwidrigen Bots; qualifizierte Leads zu Angebotsmotor.

**Ausgabeartefakte:** `Auditierter AcquisitionAction-Datensatz, qualifizierte Leads und Attribution.`

**Domain-Events:** `acquisition.allowed, outreach.sent, acquisition.blocked, consent.withdrawn`

**Hard Gate:** Elektronische Direktwerbung nur bei geprüfter Rechtsgrundlage; unterdrückte Empfänger niemals anschreiben.

**Messgrößen:** Qualifizierte Leads pro Kanal, Kosten pro zulässiger Anfrage, Beschwerden.

**Fünf verpflichtende Testfälle:**

- **IE6-24-01:** Opt-in mit Zweck und Ablauf erlaubt passenden Kontakt.
- **IE6-24-02:** Keine gültige Rechtsgrundlage führt zu DENY.
- **IE6-24-03:** Opt-out blockiert jede weitere Marketingnachricht sofort.
- **IE6-24-04:** Plattform untersagt Automationsgebote: kein autonomes Angebot.
- **IE6-24-05:** Doppelte Kontaktanfrage führt nicht zu Doppelversand.

### 25 – AI-to-AI Commerce

**Ziel:** Produkte über dokumentierte APIs an andere zulässige KI-Systeme verkaufen.

**Eingangsdaten:** API-Katalog, dokumentierter Preis, autentifizierte Kundentokens, bestätigte Payment-Events.

**Technischer Ablauf:** OpenAPI-Vertrag und Test-Sandbox bereitstellen; pro Abruf Zugriff nach abgeschlossener Zahlung oder gültiger Quote prüfen; usage metering idempotent; begrenzte Rate und Retouren; x402 optional nur nach Zahlungs-/Regulierungsprüfung.

**Ausgabeartefakte:** `Versionierter API-Katalog, UsageRecord und Abrechnungseintrag.`

**Domain-Events:** `api.product.published, machine.checkout.completed, usage.metered, api.access.denied`

**Hard Gate:** Keine Dienstleistung ohne nachgewiesenen Zahlungsschutz, keine inoffiziellen Wallet-Zugriffe.

**Messgrößen:** Bezahlte Aufrufe, Ausfallrate, Deckungsbeitrag je API.

**Fünf verpflichtende Testfälle:**

- **IE6-25-01:** Gültig bezahlter API-Key erhält versionierte Antwort.
- **IE6-25-02:** Unbezahlter Key erhält 402/403 ohne Daten.
- **IE6-25-03:** Doppelter Usage-Event wird nur einmal abgerechnet.
- **IE6-25-04:** API-Quotenüberschreitung antwortet 429.
- **IE6-25-05:** Deaktivierter Zahlungsadapter verhindert kostenpflichtige API-Freischaltung.

### 26 – Self-Building Microbusinesses

**Ziel:** Aus validierten Nischen eigenständige Produktlinien ohne neue Rechtspersonen eröffnen.

**Eingangsdaten:** Experiment mit Nachfragebeleg, freigegebener Capability, Domain-/Branding-Policy und Kostengrenzen.

**Technischer Ablauf:** BusinessUnit als logische Einheit innerhalb registrierten Rechtsträgers; eigene Landingpage, Produktkatalog und Support-Routing; Templating statt neue Infrastruktur pro Einheit; Health/Profit-Checks; autonomes Schließen ohne Belegverlust.

**Ausgabeartefakte:** `Versionierter BusinessUnit-Record und öffentliches Angebot nach Launch-Gate.`

**Domain-Events:** `businessunit.proposed, businessunit.launched, businessunit.paused, businessunit.retired`

**Hard Gate:** Keine automatische Gründung juristischer Gesellschaften, keine neue kostenpflichtige Domain.

**Messgrößen:** Nettoergebnis je Produktlinie und Zeit bis erstem echten Kauf.

**Fünf verpflichtende Testfälle:**

- **IE6-26-01:** Validierte Nische erzeugt BusinessUnit im STAGING.
- **IE6-26-02:** Nische ohne Kaufbelege wird nicht LIVE.
- **IE6-26-03:** Neue Domain mit Gebühren wird verweigert.
- **IE6-26-04:** Shutdown erhält Steuerbelege und Kundenansprüche.
- **IE6-26-05:** Getrennte Geschäftseinheiten können keine Kundendaten gegenseitig lesen.

### 27 – Intelligent Marketplace Integration

**Ziel:** Verkaufs- und Auftragsplattformen über offizielle zulässige Schnittstellen anbinden.

**Eingangsdaten:** Marketplace-Katalog, verfügbare offizielle API, OAuth-Berechtigungen, Verkäuferkonto.

**Technischer Ablauf:** Adapter Capability Discovery und ToS-Snapshot; minimal benötigte Scopes; Event-Replay-Schutz; Bewerbung nur bei erlaubter Automatisierung; fehlende API = manuelle Freigabe oder Kanal aus; kein Browser-Bypass.

**Ausgabeartefakte:** `MarketplaceListing/Proposal und Status mit externen IDs.`

**Domain-Events:** `marketplace.connected, listing.published, marketplace.offer.submitted, marketplace.disabled`

**Hard Gate:** Keine Bot-Umgehung, keine Plattformaccounts unter falscher Identität.

**Messgrößen:** Conversion je Plattform, Policy-Verstöße=0, Adapter-Stabilität.

**Fünf verpflichtende Testfälle:**

- **IE6-27-01:** Offizielle API und Scopes vorhanden erlauben Listing.
- **IE6-27-02:** Automation in ToS untersagt führt zu BLOCK.
- **IE6-27-03:** Abgelaufener Token stoppt Sendung ohne Speicherung im Klartext.
- **IE6-27-04:** Änderung der API-Version führt zur sicheren Deaktivierung.
- **IE6-27-05:** Doppelter Submit erzeugt keinen zweiten Plattformauftrag.

### 28 – Autonomous Negotiation Pro

**Ziel:** Standardangebote und Verhandlungen nach genehmigten Rahmenbedingungen führen.

**Eingangsdaten:** Kundenscope, kalkulierte Kosten, Preisgrenzen, Vertragsbausteine, Lieferkapazität.

**Technischer Ablauf:** Verhandlung als begrenzte State Machine; nur freigegebene Vertragsbausteine; Preisuntergrenze = variable Kosten + Risikopuffer + Zielmarge; Änderung an Haftung/IP/Recht/Gerichtsstand eskalieren; Annahme rechtssicher nachweisen.

**Ausgabeartefakte:** `QuoteVersion, NegotiationTranscript, AcceptanceProof.`

**Domain-Events:** `quote.proposed, quote.countered, quote.accepted, quote.rejected`

**Hard Gate:** Keine falschen Versprechen, keine Vertragsklauseln außerhalb Owner-Policy.

**Messgrößen:** Annahmequote, Marge, Eskalationsquote.

**Fünf verpflichtende Testfälle:**

- **IE6-28-01:** Gegenangebot innerhalb Preis- und Scope-Rahmen angenommen.
- **IE6-28-02:** Preis unter Mindestmarge wird abgelehnt.
- **IE6-28-03:** Haftungsfreistellung außerhalb Vorlagen an REVIEW.
- **IE6-28-04:** Fehlender Kundenannahmebeleg verhindert Auftrag.
- **IE6-28-05:** Nach Fristablauf kann das Angebot nicht mehr angenommen werden.

### 29 – Universal Product Fusion

**Ziel:** Mehrere Produktverfahren zu einem vollständigen, testbaren Paket kombinieren.

**Eingangsdaten:** Kundenanforderungen, Capability Registry, Ressourcenbudget, Lizenz-/Assetnachweise.

**Technischer Ablauf:** Produkt als DAG aus Teilaufgaben modellieren: Text→Design→Software→QA; jede Aufgabe mit Ein-/Ausgabevertrag; Zwischenartefakte versionieren; Rollback bei QA-Fehler; nicht verfügbare Medien-Engines transparent ausschließen.

**Ausgabeartefakte:** `CompositeArtifact mit Manifest, Hashes, QA-Bericht, Lizenzliste.`

**Domain-Events:** `product.workflow.planned, step.completed, product.qa.failed, artifact.released`

**Hard Gate:** Keine fremden Assets ohne Rechte, keine ungetesteten Gesamtprodukte ausliefern.

**Messgrößen:** End-to-End-QA-Passrate, Nacharbeitsaufwand, Produktionskosten.

**Fünf verpflichtende Testfälle:**

- **IE6-29-01:** Mehrstufiger Auftrag erzeugt DAG in korrekter Reihenfolge.
- **IE6-29-02:** Fehlende Video-Engine stoppt Zusage vor Bestellung.
- **IE6-29-03:** Teilprodukt mit Lizenzkonflikt blockiert Gesamtauslieferung.
- **IE6-29-04:** Crash und Retry erzeugen keine doppelten Endartefakte.
- **IE6-29-05:** Composite-Manifest enthält Hash/Lizenz/Quelle für jedes Teil.

### 30 – Global Sales & Localization

**Ziel:** Angebote und Dienstleistungen verständlich und regelkonform in mehreren Märkten anbieten.

**Eingangsdaten:** Zielmarkt, Sprache, Produktkategorie, Zahlungs-/Steuerregelprofil, freigegebene Texte.

**Technischer Ablauf:** Locale Packs für DE/IT/EN und weitere; Währung mit Minor-Units; Prüfregeln für digitale Verbraucherrechte, Impressum, Datenschutz, Steuer-/Rechnungsland; Kultur- und Sprach-QA; kein automatischer Verkauf bei nicht geprüfter Jurisdiktion.

**Ausgabeartefakte:** `LocalizedOffer mit legal_profile_version und Textprüfung.`

**Domain-Events:** `locale.verified, market.activated, market.blocked, translation.review.requested`

**Hard Gate:** Keine pauschale Steuerbehandlung oder ungeprüfte rechtliche Übersetzung.

**Messgrößen:** Lokalisierungsfehlerquote, Conversion je Markt, steuerliche Exceptions.

**Fünf verpflichtende Testfälle:**

- **IE6-30-01:** DE/IT-Ansicht zeigt Preise in korrekter Währung.
- **IE6-30-02:** Ungeprüfte Zieljurisdiktion blockiert LIVE-Angebot.
- **IE6-30-03:** Fehlende rechtliche Pflichtseite verhindert Veröffentlichung.
- **IE6-30-04:** Locale-Fallback behauptet keine verifizierte Übersetzung.
- **IE6-30-05:** Refund-Hinweise bleiben in jeder Sprache sachlich gleich.

### 31 – Product Recycling & Licensing

**Ziel:** Aus eigenen rechtlich wiederverwendbaren Ergebnissen standardisierte Produkte ableiten.

**Eingangsdaten:** Artifact-Lizenzkette, Kundenverträge, Produktperformanz, Rechtekontext.

**Technischer Ablauf:** Rechte-Graph prüft Eigentum, Nutzungsrechte, Exklusivität, Persönlichkeits- und Datenschutzrechte; Auskopplung nur bei erlaubten Komponenten; anonymisieren, redigieren, QA; Lizenztext an Verwendungszweck anpassen.

**Ausgabeartefakte:** `ReusableProduct, LicenseGrant, RightsProof.`

**Domain-Events:** `reuse.checked, reuse.approved, reuse.denied, license.issued`

**Hard Gate:** Kunden-IP oder vertrauliche Daten niemals ungeprüft weiterverkaufen.

**Messgrößen:** Wiederverwendungsertrag, Rechteverletzungen=0, Wiederverwendbarkeitsquote.

**Fünf verpflichtende Testfälle:**

- **IE6-31-01:** Eigene generische Vorlage mit Nutzungsrecht kann lizenziert werden.
- **IE6-31-02:** Exklusiver Kundenauftrag darf nicht ins Sortiment.
- **IE6-31-03:** Vertrauliche Daten in Artefakt führen zu DENY.
- **IE6-31-04:** Lizenzbedingungen folgen dem ausgelieferten Artefakt.
- **IE6-31-05:** Widerrufene oder geänderte Assetrechte stoppen Neulizenzierung.

### 32 – Autonomous Subscription Builder

**Ziel:** Wiederkehrende digitale Dienste mit rechtlich sauberer Anmeldung und Kündigung betreiben.

**Eingangsdaten:** Nachgewiesene wiederkehrende Nachfrage, Service-Kapazität, Preis, Vertrags- und Kündigungsbedingungen.

**Technischer Ablauf:** Billing-Adapter im Testmodus; status ACTIVE nur nach verifiziertem Zahlungsevent und Produktbereitstellung; Dunning durch offiziellen Provider; Kundenportal zur Kündigung; Kündigung/Refund/Proration nach Konfiguration; Ausfälle führen zum Supportflow.

**Ausgabeartefakte:** `Subscription, Entitlement, BillingEvidence, CancellationProof.`

**Domain-Events:** `subscription.activated, invoice.payment_succeeded, invoice.payment_failed, subscription.cancelled`

**Hard Gate:** Keine versteckten Abos, unklare Verlängerung oder automatische Kosten ohne Kundenakzeptanz.

**Messgrößen:** Netto-MRR, Churn, Zahlungsausfälle, Supportquote.

**Fünf verpflichtende Testfälle:**

- **IE6-32-01:** Erfolgreiche erste Abrechnung aktiviert Leistung.
- **IE6-32-02:** Zahlungsausfall entzieht Zugriff nach konfigurierten Regeln.
- **IE6-32-03:** Kündigung erzeugt dokumentierten Status/Termin.
- **IE6-32-04:** Doppelter Billing-Webhook erzeugt keine doppelte Forderung.
- **IE6-32-05:** Fehlende Pflichtangaben blockieren Abo-Publikation.

### 33 – Self-Optimizing Sales Funnel

**Ziel:** Verkaufsprozesse anhand echter Käufe statt manipulativer Metriken verbessern.

**Eingangsdaten:** Landingpage-Varianten, Consent-gerechte Analytics, echte Checkout-/Refund-Events.

**Technischer Ablauf:** Randomisierte Tests mit Consent-Minimierung; vorab Erfolgsmetrik definieren; Mindestdaten/konfidenz prüfen; kleine schrittweise Ausrollung; keine Dark Patterns, Fake-Verknappung oder manipulativen Countdown.

**Ausgabeartefakte:** `ExperimentReport, WinnerDecision, VersionedFunnel.`

**Domain-Events:** `funnel.test.started, funnel.test.inconclusive, funnel.winner.verified, funnel.rollback`

**Hard Gate:** Kein Gewinner allein aufgrund zufälliger Kleinstichprobe oder erfundener Käufe.

**Messgrößen:** Netto-Conversion, Refund-adjustierter Deckungsbeitrag.

**Fünf verpflichtende Testfälle:**

- **IE6-33-01:** Ausreichende reale Käufe erlauben regelkonforme Variantenentscheidung.
- **IE6-33-02:** Klickrate ohne Umsatzbeleg gilt nicht als Gewinn.
- **IE6-33-03:** Kleinstichprobe führt zu INCONCLUSIVE.
- **IE6-33-04:** Anstieg Refunds führt zu automatisch gestopptem Rollout.
- **IE6-33-05:** Tracking ohne zulässige Rechtsgrundlage wird deaktiviert.

### 34 – Customer Trust & Reputation Engine

**Ziel:** Echte Qualität und authentisches Kundenfeedback sichtbar machen.

**Eingangsdaten:** Verifizierte Bestellungen, freiwillige Bewertungen, Zustell-/Supportkennzahlen.

**Technischer Ablauf:** Bewertungsanfrage nur auf erlaubtem Kanal; Kaufnachweis und Veröffentlichungszustimmung verbinden; Feedbackmodifikation nur mit Kennzeichnung; Streitfall-Workflow und Moderation nach transparenten Regeln.

**Ausgabeartefakte:** `VerifiedReview mit ConsentRef, Qualitätsreport, SupportQualityMetric.`

**Domain-Events:** `review.requested, review.submitted, review.verified, review.removed`

**Hard Gate:** Keine erfundenen Testimonials, keine bezahlten Scheinbewertungen.

**Messgrößen:** Verifizierte Zufriedenheit, Reklamationsquote, Reaktionszeit.

**Fünf verpflichtende Testfälle:**

- **IE6-34-01:** Echter Käufer mit Freigabe veröffentlicht Feedback.
- **IE6-34-02:** Ohne Kaufnachweis erscheint kein Verified-Badge.
- **IE6-34-03:** Erfundene KI-Bewertung wird blockiert.
- **IE6-34-04:** Einwilligungswiderruf entfernt öffentliche Bewertung soweit rechtlich geboten.
- **IE6-34-05:** Negatives echtes Feedback wird nicht automatisch gelöscht.

### 35 – Autonomous Fraud & Risk Shield

**Ziel:** Betrug, Disputes und schädliche Aufträge früh erkennen.

**Eingangsdaten:** Signierte Zahlungsereignisse, Auftragssignale, Device-/Fraud-Scores nur aus rechtmäßigen Quellen.

**Technischer Ablauf:** Regelbasierte Limits plus optionales Modell; hohe Risiken prüfen statt pauschal diskriminieren; Fraud-Signal nicht als bewiesene Tat deklarieren; Signal-Minimierung, Monitoring von Chargebacks.

**Ausgabeartefakte:** `RiskAssessment mit begründeter Entscheidung ALLOW|REVIEW|BLOCK.`

**Domain-Events:** `fraud.signal.detected, risk.review.required, order.blocked, chargeback.opened`

**Hard Gate:** Keine unzulässigen sensiblen Profile; keine selbständigen Strafanzeigen.

**Messgrößen:** Chargeback-Rate, False-Positive-Rate, blockierter Verlust.

**Fünf verpflichtende Testfälle:**

- **IE6-35-01:** Signaturgültige Niedrigrisiko-Zahlung darf passieren.
- **IE6-35-02:** Falsche Webhook-Signatur wird vor Fraud-Bewertung abgewiesen.
- **IE6-35-03:** Extremer Anomaliewert verschiebt Auftrag auf REVIEW.
- **IE6-35-04:** Unbelegte Sensitivitätsmerkmale dürfen nicht in Score eingehen.
- **IE6-35-05:** Refund/Dispute blockiert unzulässige automatische Folgeleistungen.

### 36 – Revenue Protection & Recovery

**Ziel:** Offene Zahlungsfälle, abgebrochene Bestellungen und Abos rechtmäßig bearbeiten.

**Eingangsdaten:** Provider-Payment-Events, Rechnungsstatus, Supportfälle, zulässige Erinnerungspräferenzen.

**Technischer Ablauf:** Dunning nur über offizielle zulässige Kanäle; Kalender und Fristen pro Markt; keine doppelte Belastung; Refunds als negative Ledger-Einträge; Eskalation bei Inkasso-/Rechtsfragen.

**Ausgabeartefakte:** `RecoveryCase, ReminderAudit, ReconciliationException.`

**Domain-Events:** `payment.failed, retry.scheduled, recovery.resolved, debt.review.required`

**Hard Gate:** Keine eigenmächtigen Inkassodrohungen, keine Doppelabbuchungen.

**Messgrößen:** Eingezogene berechtigte Forderungen, Doppelabbuchungen=0, Disputequote.

**Fünf verpflichtende Testfälle:**

- **IE6-36-01:** Fehlzahlung erzeugt exakt einen RecoveryCase.
- **IE6-36-02:** Doppelter Retry-Event löst keine doppelte Abbuchung aus.
- **IE6-36-03:** Opt-out für Werbemails stoppt Marketing, gesetzliche Transaktionsnachricht bleibt getrennt bewertet.
- **IE6-36-04:** Unberechtigte Forderung wird auf REVIEW gesetzt.
- **IE6-36-05:** Reconciliation schließt Fall erst bei bestätigtem Zahlungseingang.

### 37 – Zero-Cost Resource Intelligence

**Ziel:** Jede Aufgabe innerhalb Null-Zusatzkostenpolicy und Claude-Limits ausführen.

**Eingangsdaten:** Plan-Kontingente, Task-Kostenprofil, Hostinglimits, externe Gebührenprofile, Policy-Version.

**Technischer Ablauf:** QuotaBudget mit Reservierung vor Jobstart; forecast/free-tier-Warnungen; Overflow-Queue; Paid API, Pay-as-you-go-Upgrade und Kreditkarte strikt disabled; keine Nutzung inoffizieller Claude-Sessions; Task bei Kapazitätsmangel BLOCKED_CAPACITY.

**Ausgabeartefakte:** `ResourcePlan, QuotaSnapshot, BudgetDecision, QueueState.`

**Domain-Events:** `quota.reserved, quota.exhausted, budget.denied, task.deferred`

**Hard Gate:** Zero-Fixkosten bedeutet nicht Null-Transaktionskosten oder keine Betriebspflichten.

**Messgrößen:** Unfreigegebene Ausgaben=0, planbare Betriebskosten, erfolgreiche Jobs pro Freikontingent.

**Fünf verpflichtende Testfälle:**

- **IE6-37-01:** Kostenfreie kurze Aufgabe wird innerhalb Quote ausgeführt.
- **IE6-37-02:** Neue API mit monatlicher Gebühr >0 wird blockiert.
- **IE6-37-03:** Claude-Limit erreicht: Aufgabe wartet ohne Ersatz-API-Aufruf.
- **IE6-37-04:** R2/Worker-Kontingent nahe Grenze stoppt nichtkritische Aktionen.
- **IE6-37-05:** Unbekannte Preisstruktur wird konservativ abgewiesen.

### 38 – Autonomous Business Recovery

**Ziel:** Ausfälle sicher beheben, ohne unzulässige Wiederholungen oder Doppelbuchungen.

**Eingangsdaten:** Healthchecks, DLQ, Jobstatus, Provider-Fehler, signierte Events und Audit-Trail.

**Technischer Ablauf:** Retry mit Exponential Backoff und max Attempts; Dead-Letter und Runbooks; Recovery aus dauerhaftem Zustand; Circuit Breaker je Provider; Canary/rollback auf freigegebene Version; nie selbst Policy ändern.

**Ausgabeartefakte:** `Incident, RecoveryAttempt, OwnerAlert, ReplayProof.`

**Domain-Events:** `incident.detected, job.retrying, circuit.opened, incident.resolved`

**Hard Gate:** Reparatur darf keine doppelten Zahlungen oder unsicheren Deploys verursachen.

**Messgrößen:** Wiederanlaufzeit, doppelte Nebenwirkungen=0, fehlgeschlagene Jobs.

**Fünf verpflichtende Testfälle:**

- **IE6-38-01:** Temporärer 503 führt zu begrenztem Retry und Erfolg.
- **IE6-38-02:** Dauerfehler geht in DLQ nach Maximalanzahl.
- **IE6-38-03:** Replay eines Zahlungsereignisses bleibt idempotent.
- **IE6-38-04:** Recovery verlangt Policy Lockerung: wird verweigert.
- **IE6-38-05:** Falscher Software-Release rollt auf letzte geprüfte Version zurück.

### 39 – Financial & Tax Evidence Vault

**Ziel:** Steuerlich und betriebswirtschaftlich relevante Belege nachvollziehbar archivieren.

**Eingangsdaten:** Bestellungen, Invoice XML/PDF, Provider-Belege, Ledger, Auszahlungen, Stornos und Steuerkontext.

**Technischer Ablauf:** Append-only Dokumenthistorie, SHA-256, Schlüsselrotation, sichere Backups, Aufbewahrungs-/Löschmatrix pro Land, Monatsabschluss, Export ZIP/CSV/JSON/PDF; SdI-Status getrennt von PDF-Entwurf.

**Ausgabeartefakte:** `EvidencePackage mit Hashmanifest, monatlichem Abstimmungsbericht, fehlenden Belegen.`

**Domain-Events:** `invoice.issued, sdi.accepted, evidence.archived, period.closed`

**Hard Gate:** Technische Speicherung ersetzt keine gesetzeskonforme elektronische Aufbewahrung; Fachprüfung nötig.

**Messgrößen:** Belegabdeckung, ungeklärte Zahlungen, Exportvollständigkeit.

**Fünf verpflichtende Testfälle:**

- **IE6-39-01:** Jede echte Zahlung ist mit mindestens einem Beleg verknüpft.
- **IE6-39-02:** Veränderte Rechnung verletzt Hashprüfung.
- **IE6-39-03:** PDF allein wird nicht als SdI-konform bestätigt.
- **IE6-39-04:** Monatsabschluss meldet fehlende Providergebühr als Ausnahme.
- **IE6-39-05:** Aufbewahrungspflicht verhindert unzulässige Komplettlöschung.

### 40 – Verified Profit Autopilot

**Ziel:** Nur anhand nachgewiesener Deckungsbeiträge skalieren.

**Eingangsdaten:** Ledger, Providergebühren, belegte Variable/anteilige Kosten, Refunds, Steuerreserve als Schätzung, Experimentdaten.

**Technischer Ablauf:** GrossRevenue, NetRevenue, ContributionMargin und verfügbare Auszahlungen strikt trennen; keine Hochrechnung als Ist; Portfolio-Rebalancing auf Basis realer Kaufdaten; nur reversible niedrig-riskante Skalierung ohne neue Fixkosten.

**Ausgabeartefakte:** `ProfitProof mit Herkunft aller Zahlen, Scale|Hold|Stop und Konfidenz.`

**Domain-Events:** `profit.verified, profit.insufficient, business.scale.approved, business.stop`

**Hard Gate:** Keine Erfolgsversprechen; nicht eingegangene Gelder sind kein Bankguthaben.

**Messgrößen:** Verifizierter Deckungsbeitrag, Rückerstattungsquote, reale Auszahlungen.

**Fünf verpflichtende Testfälle:**

- **IE6-40-01:** Verifizierte Zahlung abzüglich Gebühren/Refunds ergibt korrekten Deckungsbeitrag.
- **IE6-40-02:** Nur Checkout-Redirect zählt nicht als Umsatz.
- **IE6-40-03:** Unbekannte Infrastrukturkosten verursachen HOLD statt SCALE.
- **IE6-40-04:** Negativer Deckungsbeitrag erzwingt STOP für Experiment.
- **IE6-40-05:** Payout-Status SENT wird nicht als auf Bankkonto gutgeschrieben ausgegeben.
