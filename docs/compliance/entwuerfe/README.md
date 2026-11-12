# Entwürfe Rechtstexte (M3, LA-07/LA-08/LA-09)

> **ENTWURF – keine Rechtsberatung.** Diese Texte sind Arbeitsgrundlage für die anwaltliche Prüfung. Sie sind **nicht** veröffentlicht und dürfen erst nach Prüfung und Anpassung an das Sitzland verwendet werden. Platzhalter stehen in `[eckigen Klammern]`.

| Datei | Zweck | Freigabepunkt |
|---|---|---|
| `impressum.md` | Anbieterkennzeichnung | LA-07 |
| `agb.md` | Vertragsbedingungen B2B + B2C inkl. Nutzungsrechte, Haftung, Erstattung | LA-07, LA-09 |
| `widerruf.md` | Widerrufsbelehrung, Muster-Widerrufsformular, Verzichtstext digitale Inhalte (identisch zur technischen Fassung `v1-entwurf-2026-11-12`) | LA-07 |
| `datenschutz.md` | Datenschutzerklärung (Anfrage, Bestellung, Zahlung über Stripe, Logs, Rechte) | LA-08 |

Bei Änderungen am Verzichtstext: `CONSUMER_WAIVER_VERSION` in `services/core-api/src/workflow.ts` und den Text im Annahmeformular (`apps/customer-portal/src/pages.ts`) gemeinsam ändern.
