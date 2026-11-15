# FABLE 5.2 – Ergebnisse der Ende-zu-Ende-Szenarien (17.0)

Stand 16.11.2026. Alle Zahlungen sind Testzahlungen. Kein Szenario wurde durch eine Demo ersetzt; was nicht geht, steht als nicht bestanden oder blockiert da.

## Szenario A – Freelancer-Auftrag „Excel-Kalkulation“ · **TEILWEISE ERFÜLLT** (Nachtrag 16.11.2026: Excel-Datei gebaut)

| Schritt | Ergebnis |
|---|---|
| Erlaubte Anfrage entdecken | nur eingehende Anfragen über das eigene Formular und freigegebene Quellen (TED); keine Freelancer-Plattform angebunden |
| Anforderungen verstehen, Machbarkeit, Angebot | bestanden (deterministisch, feste Preisregeln) |
| Testauftrag, Zahlung, Beleg | bestanden |
| **Excel-Datei mit Formeln** | **bestanden (lokal)** – Produktart `b2b-calc-xlsx`: echte Arbeitsmappe mit Formeln für Zeilensumme, Zwischensumme, Aufschlag, Gesamt; Eingabeprüfung, fixierte Kopfzeile. Formeln werden bei jeder Herstellung von der eigenen Rechenmaschine nachgerechnet (`sheet-eval.ts`). Keine Diagramme. Verkaufbar erst nach Eigentümer-Freigabe der Produktart. |
| Datei im Admin ansehen, sichere Lieferung | bestanden (CSV/PDF/XLSX; Muster unter Admin → Produkte) |

Nachweis: `tests/integration/production.test.ts`, `m2-product-pdf.test.ts`, `autopilot-247.test.ts`. Negativtests: falsche Summen und leere Positionen werden nicht geliefert.

## Szenario B – Windows-Lagerverwaltung · **BESTANDEN mit Einschränkung**

| Schritt | Ergebnis |
|---|---|
| Echte EXE und Installer, auf Windows gebaut | bestanden (lokal Windows 11, GitHub Windows Server) |
| Installation, Start, Daten über Neustart, Update mit Datenerhalt, Deinstallation | bestanden (`tests/products/win-lager/install.test.ts`) |
| Arbeitsabläufe, Rechnung mit Pflichtangaben, FatturaPA gegen amtliches Schema | bestanden (24 Fachtests im Build) |
| Bau je Auftrag bis Lieferung | bestanden (`external-build.test.ts`, echter Probebau 13.11.) |
| Admin-Prüffassung | Probebau als Download; **keine Ausführung im Browser** (Windows-Programm) |
| Lieferpaket mit Anleitung | bestanden |
| **Fachanforderungen klären, Datenmodell je Kunde erzeugen** | **nicht erfüllt** – es ist ein festes Programm; je Kunde ändern sich nur Firma, Farbe, Sprache, Land |

Negativtests: falsches Paket (anderer Firmenname) abgelehnt, drei Fehlversuche führen zu „nicht lieferfähig“, abgelaufene Übernahme wird neu vergeben.

## Szenario C – B2B-Kundenportal als individuelle Web-App · **BLOCKED**
Es gibt keine Herstellung individueller Webanwendungen. Der Router meldet für „individuelle Software“ ehrlich `AI_QUOTA_BLOCKED` bzw. „keine geprüfte Produktart“ (`autopilot-247.test.ts`). Voraussetzung wäre KI-Programmierung mit isolierter Ausführung und eigener Abnahme – nicht vorhanden.

## Szenario D – 24/7-Autopilot bei ausgeschaltetem PC · **BESTANDEN**

| Schritt | Ergebnis | Nachweis |
|---|---|---|
| Eingang, Persistenz, Job-Erstellung, Verarbeitung ohne lokalen PC | bestanden | `autopilot-247.test.ts` „1–4, 16“; Staging-Takt |
| Externe Build-Ausführung | bestanden | Probebau über GitHub |
| Wiederanlauf | bestanden | „12“ |
| Pause bei KI-Limit | bestanden | „5–6“, `ai-texte.test.ts` |
| Keine Doppelverarbeitung | bestanden | „7“, Lasttest 60 Aufträge |
| Statusmeldungen | bestanden | Leitstand aus Messwerten |

Einschränkung: Startzeit externer Läufe gemessen 3,7–7,3 Stunden (ohne Sofort-Auslöser).

## Szenario E – Stripe-Testkauf · **BESTANDEN (lokal mit echter Stripe-Sandbox)**

Durchlauf am 13.11.2026 mit `scripts/stripe-e2e-local.ts`: Angebot 57,15 € → Stripe-Checkout (Sandbox) → Zahlung mit Stripe-Testkarte → signierter Webhook über die Stripe-CLI → Produktion → Abnahme → Lieferung → Download → Beleg. In Stripe gegengeprüft: `payment_status: paid`, `livemode: false`.

| Schritt | Ergebnis |
|---|---|
| Angebot, Bestätigung, Test-Checkout, verifizierter Webhook, Auftrag, Produktion, QA, Lieferung, Beleg | bestanden |
| Auszahlungsstatus und Bank-Testabgleich | bestanden in Tests mit Testauszahlung und Test-Kontoauszug (`tests/integration/finance.test.ts`, `bank-statement.test.ts`); eine Stripe-Auszahlungsmeldung gilt nicht als Bankeingang |
| Bezahlte Testzahlung direkt auf Staging | **nicht ausgeführt** (Zahlungen auf Staging löst nur der Eigentümer aus) |

Negativtests: gefälschte Signatur, doppelter und veralteter Webhook, falscher Betrag (`payments.test.ts`, `m2-payments.test.ts`, `security.test.ts`).

## Gesamtlauf
`npm run verify` am 16.11.2026: 402 Tests und 1 E2E bestanden, 0 übersprungen. Lasttest lokal: 60 Aufträge, 60 Lieferungen, 60 Belege, 0 doppelt, 0 Fehler.
