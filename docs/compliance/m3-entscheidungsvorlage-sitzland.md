# Entscheidungsvorlage: Sitzland Italien oder Deutschland (M3, LA-01/LA-02/LA-05/LA-06)

> **Orientierung für das Gespräch mit Steuer- und Rechtsberatung – keine Steuer- oder Rechtsberatung.**
> Schwellenwerte und Regeln entsprechen dem Kenntnisstand vom 12.11.2026 und **müssen von der Beratung bestätigt werden**. Maßgeblich für den steuerlichen Sitz ist in der Regel, wo Sie wohnen und von wo aus Sie das Geschäft tatsächlich führen – das Sitzland ist daher meist keine freie Wahl.

**Festgelegt (Eigentümer, 12.11.2026):** neues, eigenständiges Unternehmen · Kunden B2B **und** B2C · Kunden in der **EU** · Produkt: digitale Kalkulationstabelle (digitaler Inhalt/elektronisch erbrachte Leistung).

## 1. Gegenüberstellung

| Thema | Italien | Deutschland |
|---|---|---|
| Registrierung | Partita IVA bei der Agenzia delle Entrate (ATECO-Code wählen), je nach Tätigkeit Eintragung im Registro Imprese (ComUnica/Handelskammer) und INPS-Anmeldung | Gewerbeanmeldung beim Gewerbeamt, „Fragebogen zur steuerlichen Erfassung“ über ELSTER, IHK-Mitgliedschaft |
| Vereinfachtes Regime | **Regime forfettario**: Umsatzgrenze 85.000 €/Jahr, pauschale Ersatzsteuer (15 %, unter Bedingungen 5 % in den ersten Jahren) auf pauschal ermittelten Gewinn; Rechnungen **ohne IVA** mit Pflichthinweis | **Kleinunternehmerregelung (§ 19 UStG)**: Vorjahresumsatz ≤ 25.000 €, laufendes Jahr ≤ 100.000 €; Rechnungen **ohne USt** mit Hinweis |
| E-Rechnung | **Pflicht über SdI (FatturaPA-XML) für praktisch alle Rechnungen**, seit 2024 auch im forfettario; reiner PDF-Versand genügt nicht | Empfang von E-Rechnungen im B2B seit 2025 Pflicht; Ausstellungspflicht B2B stufenweise ab 2027/2028 (Kleinunternehmer ausgenommen); B2C weiterhin PDF/Papier möglich |
| Sonstige Formalien | Stempelsteuer (marca da bollo) auf Rechnungen ohne IVA über einem Kleinbetrag; Sozialversicherungsbeiträge INPS | Gewerbesteuer (Freibetrag für Einzelunternehmen), Beiträge IHK |
| Technischer Aufwand für INFINITY EARN | **Hoch**: XML-Erzeugung + Übermittlung über zugelassenen Kanal (Intermediär/Software) oder manuell über das kostenlose Portal der Agenzia | **Mittel**: PDF-Rechnung (B2C), später XRechnung/ZUGFeRD für B2B |
| Kostenfreie Variante möglich? | Portal der Agenzia (manuell) kostenlos; **automatisierte** Übermittlung meist kostenpflichtig → Freigabe nötig (0-€-Policy) | PDF kostenlos; E-Rechnung mit freien Bibliotheken erzeugbar |

## 2. Gilt in beiden Ländern (EU-Verkauf)

- **B2B in andere EU-Länder:** Reverse-Charge (Steuerschuld des Kunden) – gültige USt-IdNr. des Kunden über VIES prüfen und auf der Rechnung angeben. *Technisch vorbereitbar: kostenlose VIES-Prüfung.*
- **B2C in andere EU-Länder (digitale Leistungen):** EU-weite Schwelle **10.000 €/Jahr** für grenzüberschreitende B2C-Umsätze. Darüber gilt die USt des Kundenlandes, Abrechnung über **OSS**. Wechselwirkung mit forfettario bzw. Kleinunternehmerregelung **unbedingt mit der Beratung klären** (Sonderfälle, ggf. Verlust des vereinfachten Regimes für diese Umsätze).
- **Verbraucher (B2C), digitale Inhalte:** 14 Tage Widerrufsrecht; erlischt bei sofortiger Bereitstellung **nur** mit ausdrücklicher Zustimmung + Bestätigung der Kenntnis (bereits technisch umgesetzt, Textfassung `v1-entwurf` prüfen lassen) und Bestätigung auf dauerhaftem Datenträger (PDF-Vertragsbestätigung **technisch umgesetzt**; ob Download genügt oder E-Mail nötig ist → LA-07).
- **Preisangaben B2C:** Endpreise inkl. USt (bzw. Hinweis auf Steuerbefreiung).
- **Impressum, AGB, Datenschutzerklärung:** Pflicht; Entwürfe unter `docs/compliance/entwuerfe/`.

## 3. Fragen an die Beratung (mitnehmen)

1. Wo bin ich steuerlich ansässig, und wo liegt die Betriebsstätte für INFINITY EARN?
2. Welches Regime passt (forfettario / Kleinunternehmer / Regelbesteuerung) bei geplanten Umsätzen unter bzw. über 10.000 € EU-B2C?
3. Wie werden B2C-Verkäufe an Verbraucher in anderen EU-Ländern im gewählten Regime behandelt (OSS ja/nein)?
4. Welcher ATECO-Code bzw. welche Gewerbebezeichnung passt zu „Erstellung digitaler Kalkulationstabellen aus Kundendaten“?
5. (Italien) Welcher kostenlose oder günstigste Weg zur SdI-Übermittlung ist zulässig – manuell über das Portal oder Intermediär?
6. Reichen die Entwürfe für AGB, Widerruf/Verzicht, Datenschutz und Impressum, oder was fehlt?
7. Aufbewahrungsfristen für Rechnungen und Buchungsbelege vs. DSGVO-Löschung?
8. Brauche ich eine Berufshaftpflicht oder Produkthaftungsabsicherung für fehlerhafte Kalkulationen?

## 4. Was danach technisch folgt (je nach Entscheidung)

| Entscheidung | Technische Folgearbeit |
|---|---|
| Italien | FatturaPA-XML-Generator + Validierung, Übermittlungskanal (manueller Export für das Portal = 0 €), Pflichthinweis forfettario, Stempelsteuer-Logik |
| Deutschland | PDF-Rechnung mit Pflichtangaben, Hinweis § 19 UStG falls zutreffend, später XRechnung/ZUGFeRD für B2B |
| Beide | VIES-Prüfung der USt-IdNr., Reverse-Charge-Hinweis, OSS-Umsatzzähler mit Warnschwelle, Bestätigungs-E-Mail/PDF des Vertrags und Widerrufsverzichts, freigegebene Steuerregeln in `services/finance/src/tax.ts` |
