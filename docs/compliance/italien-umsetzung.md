# LA-01 Sitzland: Italien – Umsetzungsstand und Fragen an die Steuerberatung

**Entscheidung des Eigentümers (Chat, 2026-11-12):** Sitz und steuerlicher Wohnsitz in **Italien**.
LA-01 wird in der Konsole mit „Sitzland speichern“ auf **In Arbeit** gesetzt. Die **Freigabe** erteilst du erst mit der schriftlichen Bestätigung der Steuerberatung als Nachweis.

## Was technisch bereits vorbereitet ist

| Thema | Stand | Wo |
|---|---|---|
| Sitzland festhalten | Eigentümer-Aktion in Einstellungen → setzt LA-01 auf „In Arbeit“, protokolliert | `services/core-api/src/readiness.ts` (`setSeatCountry`) |
| Elektronische Rechnung | FatturaPA-XML (FPR12, Spezifikation 1.2.2) aus jedem Beleg; strenge Prüfung; **keine Datei mit Platzhaltern** – fehlende Angaben werden aufgelistet | `services/finance/src/fatturapa.ts`, Finanzen → Belege → „FatturaPA (XML)“ |
| Steuerbehandlung | Nur **Vorschlag** je Regime/Kunde (forfettario N2.2; ordinario 22 %; EU-B2B N2.1 Reverse Charge); OSS-Verbraucher ohne Vorschlag | `proposeItalianTax` – Freigabe LA-06 |
| Stempelsteuer | 2 € „bollo virtuale“ bei steuerfreien Beträgen über 77,47 € | automatisch im XML |
| Übermittlung | **Nicht automatisch.** Kostenlos manuell über das Portal „Fatture e Corrispettivi“ der Agenzia delle Entrate, bis ein Kanal freigegeben ist | `SDI_CHANNEL_CONFIGURED` bleibt `false` |
| Testbelege | Causale „TESTBELEG – NICHT AN DAS SDI ÜBERMITTELN“ | im XML |

## Einzutragende Angaben (nach Registrierung, LA-02)

Als Geheimnisse bzw. Variablen für Staging/Live – erst wenn echt vorhanden:

| Variable | Inhalt |
|---|---|
| `SELLER_NAME` | Firma/Name laut Registrierung |
| `SELLER_TAX_ID` | Partita IVA (11 Ziffern) |
| `SELLER_FISCAL_CODE` | Codice Fiscale |
| `SELLER_ADDRESS`, `SELLER_POSTCODE`, `SELLER_CITY`, `SELLER_PROVINCE` | Sitzadresse |
| `SELLER_COUNTRY` | `IT` |
| `SELLER_REGIME` | `RF19` (forfettario) oder `RF01` (ordinario) – **mit Steuerberatung festlegen** |

## Fragen an die Steuerberatung (bitte schriftlich beantworten lassen)

1. **Regime:** forfettario (RF19, 5 %/15 % Ersatzsteuer, keine IVA auf Rechnungen) oder ordinario (RF01)? Sind die Voraussetzungen erfüllt?
2. **ATECO-Code** für automatisiert erstellte digitale Kalkulationen (z. B. 62.01 oder 63.11)?
3. **Sozialversicherung (INPS):** Gestione separata oder commercianti?
4. **EU-Verbraucher (B2C):** OSS-Registrierung nötig? Welcher Satz gilt je Kundenland für digitale Dienstleistungen, und braucht es dafür eine FatturaPA?
5. **EU-Unternehmen (B2B):** Ist Natura N2.1 mit Hinweis auf Art. 7-ter und Reverse Charge korrekt? Ist die VIES-Prüfung der USt-IdNr. Pflicht?
6. **Italienische Verbraucher:** Muss der Codice Fiscale erhoben werden (derzeit nicht erfasst)?
7. **Übermittlung und Archiv:** Reicht das kostenlose AdE-Portal für Übermittlung und Archivierung (conservazione), oder braucht es einen Intermediär (Kosten nur nach deiner Freigabe)?
8. **Rechtstexte:** Genügen AGB und Widerrufsbelehrung nach Codice del Consumo, oder wird eine italienische Fassung benötigt? (LA-07)

## Was danach folgt

- Antworten 1–5 → Steuerregeln als freigegebene Konfiguration hinterlegen (LA-06); bis dahin bleibt jeder Beleg ein Vorschlag bzw. geht in die Steuerprüfung.
- Registrierung (LA-02) → Verkäuferangaben eintragen → echte FatturaPA-Dateien.
- Antwort 6 → Codice-Fiscale-Feld im Annahmeformular für italienische Verbraucher.
