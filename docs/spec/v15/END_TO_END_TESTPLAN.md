# INFINITY EARN – End-to-End-Tests bis zur bestätigten Bankgutschrift

## A. Autorisierter DEMO-Test: fiktiv

1. Ein erfundener Kunde erstellt eine fiktive Anfrage: „Produktkalkulator“.
2. Der Test-Akquiseagent findet den Eingang über ein erlaubtes Formulardatenmodell.
3. Ein Angebot über 249,00 € wird im `DEMO`-Modus erstellt.
4. Die Test-Zahlung wird durch einen **simulierten**, korrekt signierten Provider-Event bestätigt.
5. Exakt **ein** Produktionsauftrag wird eingeplant.
6. Ein Beispielprodukt wird erstellt und ein QA-PASS protokolliert.
7. Lieferung wird als Demo-Artefakt mit Hash und Zeitstempel erfasst.
8. Rechnung wird als **Test-Rechnungsdatensatz ohne echte Rechnungswirkung** erzeugt.
9. Eine simulierte Anbietergebühr (z. B. 5,00 €) ergibt einen **fiktiven** Provider-Auszahlungsbetrag von 244,00 €.
10. Ein simulierter Bankdatensatz trifft ein. Erst dann darf in **DEMO** `BANK_CREDIT_VERIFIED` angezeigt werden.

**Wichtig:** Dieses Beispiel enthält ausdrücklich **kein echtes Geld, keine echte Rechnung und keine echte Bankverbindung**. Beispielhafte Steuerrücklagen dürfen nicht als bereits abgebucht dargestellt werden.

## B. Echte LIVE-Abnahme (nur nach rechtlicher/technischer Freigabe)

- Genehmigte Unternehmeridentität, Rechtsraum, Zahlungsempfänger-IBAN, Rechnungsregime und Pflichttexte sind rechtmäßig eingerichtet.
- Ein echter Käufer bestellt freiwillig und bezahlt die reale Leistung.
- Provider-Webhooks wurden serverseitig auf Signatur, Event-ID und Status geprüft.
- Produktleistung ist real prüfbar geliefert; erforderliche Rechnungsdaten wurden im richtigen Verfahren verarbeitet.
- Anbieter bestätigt Settlement und Bankauszahlung; Bankdatenabgleich bestätigt unabhängigen Geldeingang.
- Zwischenbestände, Steuerrücklagen, Gebühren und tatsächlicher Gewinn sind unterscheidbar.
- Datenschutz und Verträge sind dokumentiert; Kunden können bei Bedarf reklamieren und ihre Rechte wahrnehmen.

## C. Pflicht-Negativtests

1. Checkout-Redirect ohne signiertes Event: keine Leistung ausliefern.
2. Duplikat desselben Webhooks: nur ein Produktionsauftrag.
3. Signatur manipuliert: Event verwerfen.
4. Fehlende Kunden-Einwilligung: keine elektronische Werbenachricht.
5. Lizenz unklar: QA/Delivery-Sperre.
6. Rechnungspflichtdaten fehlen: `TAX_REVIEW`, nicht auto-versenden.
7. Provider-Payout zwar „sent“, aber keine Banktransaktion: Anzeige **Auszahlung unterwegs**, niemals **Auf Bank**.
8. Test-/Demo-Daten dürfen LIVE-KPI niemals erhöhen.
9. Kostenwunsch 1,00 € bei Nullkostenpolicy: `DENY`.
10. Claude-Kontingent aufgebraucht: Job bleibt wartend, keine kostenpflichtige API einschalten.
11. Nicht genehmigter zusätzlicher Verbraucherrechts-/Regulierungsfall: `LEGAL_REVIEW`.
12. Fiktiver Umsatz in Live-Oberfläche: UI-Abnahme schlägt fehl.
13. Doppelte Rechnungsausstellung: Idempotenzschranke verhindert zweite Nummer.
14. Kundenbezogene Exklusivsoftware in allgemeinem Verkaufsprodukt: IP-Sperre.
15. Bedienung in 320px-Ansicht unbrauchbar: keine UI-Freigabe.

## D. Aufzeichnungen je Test

`test_id`, `build_sha`, `mode`, `initial_state`, `input_event_hash`, `expected_state`, `actual_state`, `verified_by`, `timestamp`, `evidence_refs`, `cost_eur`.

Die 381 testspezifischen Anforderungen stehen in `04_TESTS/ABNAHME_381_MODULTESTS.md`. Die 200 früheren Testfälle liegen zusätzlich in `06_QUELLEN_ALT/`. Keine angeblich „bestandenen 581 Tests“ melden, solange sie nicht tatsächlich implementiert und ausgeführt wurden.
