# M3-Bericht – Business Readiness

**Datum:** 12.11.2026 · **Status:** technisch vorbereitet. **Fachlich offen:** alle 12 Freigaben (Eigentümer + Beratung). **LIVE bleibt gesperrt.**

> M3 ist laut Spezifikation überwiegend Eigentümer- und Beratungsarbeit („fachlich validiert und dokumentiert“). Software kann Registrierung, KYC, Steuerentscheidungen und Rechtsprüfung nicht ersetzen.

## Eigentümer-Entscheidungen (Fragebogen 12.11.2026)
| Frage | Entscheidung |
|---|---|
| Sitzland | **offen** → Entscheidungsvorlage erstellt |
| Rechtsform | **neues, eigenständiges Unternehmen** |
| Kunden | **B2B und B2C** |
| Märkte | **EU** |

## Implementiert
| Bereich | Umsetzung |
|---|---|
| Freigabe-Verwaltung LA-01 … LA-12 | Migration `0004`: Tabelle `live_activation_items` + append-only Historie; nur Eigentümer, Freigabe nur mit Nachweis (DB-CHECK + Code); Dashboard-Abschnitt „M3 – Live-Freigaben“; `GET /api/readiness` |
| Sperre bleibt hart | Auch bei 12/12 Freigaben: `LIVE_MODE_IMPLEMENTED=false`, Trigger auf `system_mode` – Freischaltung nur per eigener, geprüfter Migration |
| Unternehmensprofil | Tabelle `business_profile` mit den vier Entscheidungen, im Dashboard sichtbar |
| EU-Marktbeschränkung | Annahme nur für Kunden mit EU-Land; sonst `MARKET_NOT_ALLOWED` (fail-closed bei unbekannter Einstellung) |
| Verbraucher, digitale Inhalte | B2C-Annahme nur mit beiden Pflicht-Kästchen (sofortige Bereitstellung verlangt + Kenntnis vom Erlöschen des Widerrufsrechts); Nachweis `quotes.consumer_waiver_ref` mit Textfassung `v1-entwurf-2026-11-12` |
| Unterlagen | `docs/compliance/m3-entscheidungsvorlage-sitzland.md` (Italien vs. Deutschland, EU-Regeln, Fragen an die Beratung, technische Folgearbeiten); Entwürfe Impressum, AGB, Widerruf + Muster-Formular, Datenschutzerklärung unter `docs/compliance/entwuerfe/` |

## Getestet
| Prüfung | Ergebnis |
|---|---|
| `npm run verify` | ✅ 145 Tests + E2E, Lint, Typecheck, Build (6 neue M3-Tests) |
| Neu abgedeckt | Freigaben nur durch Eigentümer, Nachweispflicht, Historie unveränderlich, DB verweigert Freigabe ohne Owner, 12/12 ≠ LIVE, EU-Beschränkung, B2C-Verzicht Pflicht + Nachweis, B2B ohne Verzicht |

## Ihre Aufgaben für M3 (Reihenfolge-Vorschlag)
1. **Beratungstermin** (Steuer + Recht) mit der Entscheidungsvorlage → **LA-01** Sitzland, **LA-06** Steuerregeln.
2. **LA-02** Registrierung des neuen Unternehmens.
3. **LA-07/08/09** Entwürfe anwaltlich prüfen und anpassen lassen.
4. **LA-03/04** Stripe-Live-Konto „INFINITY EARN“ aktivieren (Identitätsprüfung, Bankkonto – nur Sie, im Stripe-UI).
5. **LA-05** offizielle Rechnungslösung festlegen (bei Italien: SdI-Kanal).
6. Jeden erledigten Punkt im Dashboard mit Nachweis auf „freigegeben“ setzen.

Technische Punkte, die ich parallel umsetzen kann: **LA-11** (Staging-Deployment), **LA-10** Rest (Live-Keys getrennt im Secret-Store – erst wenn ein Staging/Live-Host existiert), sowie nach der Sitzland-Entscheidung die Rechnungs-/Steuer-Folgearbeiten (FatturaPA-XML bzw. PDF/XRechnung, VIES-Prüfung, OSS-Zähler, Vertragsbestätigung per E-Mail/PDF).

## Nicht verfügbar / offen
- **LA-11 Staging:** technisch erledigt – Deployment, Sicherheits-Rauchtest (21/21), Backup/Restore-Test und seit 2026-11-12 **automatische tägliche verschlüsselte Sicherung** (Workers KV, 30 Tage, Restore auf Staging nachgewiesen; siehe ADR 0004, runbook). Freigabe durch den Eigentümer im Dashboard steht aus.
- ~~**Vertragsbestätigung auf dauerhaftem Datenträger**~~ – **technisch umgesetzt (2026-11-12):** Bei jeder Angebotsannahme entsteht automatisch eine unveränderliche PDF-Vertragsbestätigung (Migration 0005, SHA-256 bei jedem Abruf geprüft, Lösch-/Änderungsschutz per Trigger, Abrufe protokolliert). B2C-PDF enthält Widerrufsbelehrung, den dokumentierten Verzicht (Nachweis-Referenz) und das Muster-Widerrufsformular; ohne Bestätigung blockiert die Lieferung an Verbraucher (→ Eigentümerprüfung). Abruf nur durch den bestellenden Kunden (`/portal/vertrag/<auftrag>`, Link auch auf der Zahlungs-Rückkehrseite). Auf Staging verifiziert (Rauchtest 21/21). **Offen für LA-07 (Rechtsprüfung):** ob ein Download-Angebot als „zur Verfügung gestellt“ genügt oder zusätzlich E-Mail-Versand nötig ist (kostenloser Kanal + Freigabe erforderlich); Anbieterangaben folgen nach LA-02.
- Keine Steuerregel im Code freigegeben (bewusst; erst nach LA-06).
- VIES-Prüfung der USt-IdNr. noch nicht implementiert.

## Risiken
- Rechtliche Angaben in der Entscheidungsvorlage sind Orientierung (Kenntnisstand), keine Beratung; Schwellenwerte können sich ändern.
- B2C-Verkauf in mehrere EU-Länder erhöht den steuerlichen Aufwand (OSS) erheblich; ein Start „zuerst nur B2B“ wäre einfacher – Entscheidung bleibt beim Eigentümer.
