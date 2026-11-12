# Live-Aktivierungs-Checkliste (Sperrbedingung)

> **LIVE ist gesperrt.** Kein Live-Verkauf, keine Live-Rechnung, keine Live-Zahlung, bevor **jeder** Punkt durch eine verantwortliche Person (Eigentümer bzw. Steuer-/Rechtsberatung) mit Nachweis freigegeben ist. Claude/KI kann keinen Punkt freigeben.

## Technische Sperren, die zusätzlich gelten

1. `LIVE_MODE_IMPLEMENTED = false` in `services/core-api/src/config.ts` → `ENVIRONMENT=live` oder `LIVE_SALES_ENABLED=true` verweigert den Start.
2. Live-Zahlungsschlüssel (`sk_live_…`) in Nicht-Live-Umgebung → Start verweigert.
3. DB-Trigger `*_live_guard` verweigern jede Zeile mit `test_mode = 0` bzw. `livemode = 1`, solange `system_mode.live_enabled = 0`.
4. `system_mode` ist per Trigger unveränderlich; Freischaltung nur über eine neue, geprüfte Migration nach vollständiger Freigabe.
5. Verbindlicher Stand: Tabelle `live_activation_items` (Migration 0004) – im Dashboard unter „M3 – Live-Freigaben“ pflegbar, nur durch den Eigentümer, Freigabe nur mit Nachweis, Historie append-only. Alle Punkte freigegeben ≠ LIVE: die Freischaltung bleibt eine eigene, geprüfte Migration.

## Freigabepunkte

| ID | Punkt | Wer | Nachweis |
|---|---|---|---|
| LA-01 | Betriebsland / steuerlicher Sitz / Betriebsstätte festgelegt | Eigentümer + Steuerberatung | schriftliche Festlegung |
| LA-02 | Rechtsform, Gewerbe- und Steuerregistrierung (z. B. Partita IVA / USt-IdNr.) | Eigentümer | Registrierungsnachweis |
| LA-03 | Zahlungsanbieter-Vertrag und KYC **durch den Eigentümer im Provider-UI** | Eigentümer | Provider-Bestätigung |
| LA-04 | Auszahlungskonto (SEPA) im Provider-UI hinterlegt – nie im Projekt/Chat | Eigentümer | Provider-Bestätigung |
| LA-05 | Offizielle Rechnungslösung je Sitz/Kundenland (z. B. SdI/FatturaPA über zugelassenen Kanal; E-Rechnungspflichten) geprüft | Steuerberatung | Konzept + Testübermittlung |
| LA-06 | USt/OSS-Regeln je Produkt/Kundenland/B2B-B2C fachlich freigegeben; erst dann Steuerregeln im Code | Steuerberatung | Regelwerk mit Freigabe |
| LA-07 | AGB, Widerrufsbelehrung inkl. Verzicht bei digitalen Inhalten, Impressum | Rechtsberatung | geprüfte Texte |
| LA-08 | Datenschutzerklärung, Verarbeitungsverzeichnis, Aufbewahrungs-/Löschfristen (steuerliche Aufbewahrung vs. DSGVO-Löschung) | Rechtsberatung/DSB | Dokumente |
| LA-09 | Produkt- und Lizenzbedingungen `b2b-calc-csv` (Nutzungsrechte, Haftung, Rückerstattungskriterien) | Rechtsberatung | geprüfte Texte |
| LA-10 | Stripe-Testmodus End-to-End bestanden (M2); Live-Keys getrennt im Secret-Store | Technik + Eigentümer | Testprotokoll |
| LA-11 | Staging-Deployment mit Sicherheitsprüfung, Backup/Restore-Test, Monitoring | Technik | Protokoll |
| LA-12 | Eigentümer-Freigabe der Live-Policy (Preisgrenzen, Budget = 0, zulässige Märkte, Notstopps getestet) | Eigentümer | signierte Policy-Version |

## Akquise-Regeln (gelten schon vor LIVE)
- Kein Kontakt ohne Rechtsgrundlage; Marketing nur mit dokumentierter Einwilligung und Opt-out.
- Keine gekauften Listen, keine Kaltakquise-Automation, keine Plattform-Automation gegen ToS.
- Fremdquellen erst nach Eigentümerfreigabe (Lizenz, ToS-Hash, Automatisierung erlaubt); ToS-Änderung pausiert die Quelle automatisch.
