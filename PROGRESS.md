# INFINITY EARN 15.0 – Fortschrittsbericht

Stand: 2026-11-12

| Meilenstein | Stand |
|---|---|
| M0 Design und Fundament | abgeschlossen |
| M1 Echter Transaktionskern im Testmodus | abgeschlossen |
| M2 Produktherstellung mit Beweisen | zweite Produktart (PDF) mit eigener QA fertig; Verkauf nach deiner Policy-Freigabe |
| M3 Reale Geschäftsbereitschaft | wartet auf Eigentümer- und Beraterentscheidungen (LA-01 bis LA-12) |
| M4 Akquise und Produkte skalieren | offen |

Grundlage: das 15.0-Paket (`docs/spec/v15/`, Prüfsummen laut Manifest geprüft). Entscheidungen: [ADR 0005 Konsole](docs/adr/0005-v15-premium-console.md), [ADR 0006 Bankabgleich](docs/adr/0006-bank-reconciliation.md).

---

## Pilot-Fachsoftware P2: Oberfläche der Mini-Warenwirtschaft (2026-11-13)

- **Offline-Programm als eine HTML-Datei:** Der TypeScript-Compiler übersetzt den Code, ein kleiner Modullader bündelt ihn; es gibt keine neue Abhängigkeit.
  - Die Daten liegen im Browser des Kunden.
  - Die eingebettete Sicherheitsrichtlinie (CSP) verbietet jeden Netzwerkzugriff.
- **Bereiche:** Übersicht (Umsatz, offene Posten, Lagerwert, letzte Sicherung, Aufgaben), Artikel, Kunden, Angebote, Aufträge, Rechnungen mit Gutschrift und Zahlung, Berichte, Daten (Sicherung, CSV, Integritätsprüfung), Einstellungen (Firma, Benutzer, Ansicht, Sprache).
  - Druckansicht für Belege.
  - DE/IT/EN einschließlich aller Fehlermeldungen der Fachlogik.
  - Einsteiger- und Profiansicht.
  - Kundenfarben werden automatisch auf lesbaren Kontrast gebracht.
  - Auf dem Handy werden Tabellen zu Karten.
- **Tests:** 8 neue Tests, darunter keine Schaltfläche ohne Funktion, jedes Feld beschriftet, Doppelklick-Schutz bei Lieferungen und eine gebaute Datei ohne Netzwerkzugriff. `npm run verify` → **292/292**.
- **Browserprüfung:** Ablauf von Artikel bis bezahlter Rechnung, Neuladen ohne Datenverlust, Druckansicht und Mobilansicht ohne Überlauf.
- **Demo:** https://vecom2709.github.io/INFINITY-EARN/mini-ww-demo/ (auch `/it/` und `/en/`).

---

## Pilot-Fachsoftware P1: Fachlogik der Mini-Warenwirtschaft (2026-11-13)

- **Neues Paket** `products/mini-ww`: Stammdaten, Lager, Verkauf (Angebot → Annahme → Auftrag mit Reservierung → Teil- und Restlieferung), Rechnung und Gutschrift, Zahlungen, offene Posten, Mahnstufen, Rollen (Inhaber/Mitarbeiter), Berichte, Sicherung mit Prüfsumme und Konsistenzprüfung, CSV-Import und -Export. Plan und Stand: [PILOT_FACHSOFTWARE.md](PILOT_FACHSOFTWARE.md).
- **Pflichtfälle getestet:**
  - negativer Bestand und Reservierung
  - Doppelbuchung, Überlieferung, Doppelabrechnung
  - Gutschrift mit Rücknahme und Kundenguthaben
  - Rechte, Korrektur nur mit Grund
  - lückenlose Nummern auch nach Wiederherstellung
  - manipulierte Sicherung wird abgelehnt
  - CSV alles-oder-nichts mit Formelschutz
  - abgelaufene Angebote, Steuerrundung, Mahnstufen
- **Tests:** 13 neue Tests. `npm run verify` → **284/284**.
- **Noch nicht für Kunden sichtbar:** Oberfläche (P2), Fabrik-Anbindung (P3) und Verkaufsfreigabe (P4) fehlen.

---

## Konsolidierter Gesamtprompt (2026-11-13)

Grundlage: `INFINITY_EARN_15_GESAMTPROMPT_ALLES_IN_EINEM.md`. Abgleich und Plan: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Die Nummerierung der 127 Funktionen stimmt überein.

- **Admin-Live-Vorschau (§5):** unter Produkte → Live-Vorschauen sowie auf jeder Auftragsdetailseite.
  - **Galerie:** aller produzierten Kundenprodukte mit Version, Prüfsumme, Prüfprotokoll, Lieferstatus und Suche.
  - **Echte Ansicht:** Tabelle aus der Datei, PDF im Browser-Viewer, ZIP-Inhalt mit CRC.
  - **Daneben:** Zusagen mit Prüfergebnis und Versionen.
  - **Ehrlich:** Manipulierte Dateien werden nicht angezeigt; ohne Viewer steht dort „Noch keine Live-Vorschau verfügbar“. Eine Sperr-Aktion zieht die Lieferung zurück. Siehe [ADMIN_LIVE_PREVIEW.md](ADMIN_LIVE_PREVIEW.md).
- **`/konto` (§6):** zeigt das Kundenportal. `robots.txt` sperrt den Pfad für Suchmaschinen.
- **Kommunikationskanäle (§3):** Übersicht unter Kunden. Verbunden sind nur Website und Portal; TED ist nur lesend; E-Mail, WhatsApp, Plattformen und Telefonie stehen auf „Nicht verbunden“, jeweils mit dem, was fehlt.
- **Landingpage (§7):** neues Kapitel „Preise & Fragen“ mit echtem Preisrahmen aus der Preisregel, 4 Fragen, Kontaktweg und ehrlichen Pflichtangaben (Testbetrieb, Impressum folgt nach Registrierung). Der Abschluss ist jetzt Kapitel 9. In DE/IT/EN.
- **Registry-Export (§12/§13):** [FEATURE_REGISTRY_127.json](FEATURE_REGISTRY_127.json) mit 127 JA und 3 NEIN.
  - **Stand:** 26 TESTED vollständig, 59 TESTED teilweise, 41 SPECIFIED, 1 BLOCKED, 0 LIVE_VERIFIED.
  - **Aktualität:** Ein Test prüft, dass die Datei aktuell ist und jeder Status TESTED einen existierenden Testnachweis hat.
- **Dokumente (§13):** [DESIGN_SYSTEM_LUXURY_TURQUOISE.md](DESIGN_SYSTEM_LUXURY_TURQUOISE.md), [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [COMMUNICATION_AND_DELIVERY.md](COMMUNICATION_AND_DELIVERY.md), [PRODUCT_FACTORY_REAL_SOFTWARE.md](PRODUCT_FACTORY_REAL_SOFTWARE.md), [ADMIN_LIVE_PREVIEW.md](ADMIN_LIVE_PREVIEW.md), [TEST_MATRIX.md](TEST_MATRIX.md).
- **Bewusste Abweichung:** keine MFA für den Admin. Das ist eine Entscheidung des Eigentümers vom 13.11.2026, nach Vorlage des Gesamtprompts bestätigt.
- **Tests:** 4 neue Tests in `live-preview.test.ts`, 5 in `gesamtprompt.test.ts`. `npm run verify` → **271/271**. Screenshots der Vorschau bei 1440 und 390 px unter `docs/screenshots/m0/`.
- **Offen:**
  - echte Fachsoftware als Pilot (Umfang mit dem Eigentümer abstimmen)
  - interaktive Vorschau ausführbarer Produkte
  - Kommentare und Korrekturjobs aus der Vorschau
  - Stripe-Abos und Stripe-Kundenportal
  - nur mit Konten oder Freigaben des Eigentümers: E-Mail, WhatsApp, Stripe LIVE, KI-API

---

## Admin-Zugang, drei Sprachen, Produktberater (2026-11-13)

- **`/admin`:** Angemeldet geht es direkt zur Konsole, sonst zur Passwort-Anmeldung. Die Prüfung erfolgt auf dem Server; ein Kunden-Cookie öffnet nichts.
  - **Keine Zwei-Faktor-Anmeldung** – auf ausdrücklichen Wunsch des Eigentümers. Es gelten das Passwort (scrypt), die Sperre nach 5 Fehlversuchen, Sitzungen auf dem Server und der CSRF-Schutz.
- **Startseite auf Deutsch, Italienisch und Englisch** (`/`, `/it`, `/en`):
  - übersetzter Seitenrahmen, Sprachumschalter, `hreflang` mit `x-default`, Canonical
  - gleiche, nachgerechnete Beispielzahlen in allen Sprachen
- **Suchmaschinen:** `robots.txt` sperrt Konsole, Admin, Portal, Angebote und API. `sitemap.xml` enthält nur öffentliche Seiten.
- **Produktberater `/berater`:**
  - **Versteht** Wünsche in eigenen Worten (DE/IT/EN), zum Beispiel „Fliesen 24 m² à 38 €“, „2 x Montaggio a 45 €“, „travel lump sum 35“ oder Zeilen aus Excel. Er erkennt Aufschlag und Format.
  - **Fragt nur nach, was fehlt,** und füllt die Anfrage vor. Gesendet wird erst, wenn der Kunde abschickt; danach läuft alles über dieselbe Angebotskette wie das Formular.
  - **Ehrlich:** Nicht lieferbare Wünsche (Website, Logo, Video …) und nicht freigegebene Formate lehnt er ab.
  - **Kostenlos:** Er arbeitet regelbasiert, ohne kostenpflichtige KI-API.
- **GitHub Pages:** Startseite in allen drei Sprachen (`/`, `/it/`, `/en/`); der Sprachwechsel bleibt innerhalb von Pages.
- **Tests:** 4 neue Tests in `advisor.test.ts`, 2 in `landing.test.ts`, 1 in `security.test.ts`. `npm run verify` → **258/258**.
- **Kundenseiten auf DE/IT/EN (Nachtrag 2026-11-13):** Berater, Anfrage, Angebot, Testzahlung, Zahlungsstatus, Kundenportal mit Abnahme, Bewertung und Nachtrag sowie die Ergebnis- und Fehlerseiten sind übersetzt.
  - **Sprachwahl:** `?lang=` vor Cookie `ie_lang` vor Browsersprache, sonst Deutsch. Das Cookie speichert nur die Sprache und ist kein Tracking. Jede Seite hat einen Umschalter.
  - **Auch übersetzt:** Positionsfehler, Formularprüfung, Antworten des Beraters, Produkttitel und Status.
  - **Bewusst deutsch:** die Rechtstexte im Angebot (Nutzungsrechte, Erstattung, Widerruf, Datenschutz). Sie sind als deutsch gekennzeichnet, mit dem Hinweis „maßgeblich ist die deutsche Fassung“, bis sie rechtlich geprüft und offiziell übersetzt sind.
  - **Noch deutsch:** Produktanleitungen, `/vertrauen`, `/pruefen`, Vertrags- und Beleg-PDF, Kundennachrichten im Postausgang.
  - **Tests:** 4 neue Tests in `tests/integration/i18n-pages.test.ts`, darunter einer, der für jeden verwendeten Text eine IT- und EN-Fassung verlangt. `npm run verify` → **262/262**.

---

## LUXURY TURQUOISE – gemeinsames Designsystem und Startseite mit Storyscrolling (2026-11-13)

- **Farben (Eigentümer-Vorgabe):** Ivory #F7FAF9 als Seitengrund, Dark Ocean #0E1D25 für Text und dunkle Kapitel, Petrol #087F82 für Schaltflächen und Links, Soft Mist #DCEBEA für Status und aktive Navigation.
- **Türkis #18C8C1 nur als Markenlicht:** Logo, feine Linien, Lichtakzente und Text auf Dark Ocean. Auf hellem Grund erreicht Türkis nur etwa 2:1 Kontrast und wird dort nie für Text verwendet. Ein Test erzwingt das.
- **Gilt überall:** Admin-Konsole, Kundenportal, Anfrage, Angebot und Startseite nutzen dieselben Tokens (`apps/console/src/tokens.ts`). Alle Text-Hintergrund-Paare erfüllen WCAG 2.2 AA (automatischer Kontrasttest).
- **Startseite:** 8 Kapitel: Hero, Bedarf, Beratung, Produkte, Qualität, Bezahlung mit Stripe, Lieferung, Abschluss.
  - Scroll-Reveal, Fortschrittslinie und dezentes Parallax laufen nur mit CSS, ohne JavaScript; die Sicherheitsrichtlinie (CSP) bleibt unverändert.
  - Bewegung nur bei erlaubter Bewegung und unterstütztem Browser, Parallax nur ab 900 px Breite. Ohne Unterstützung ist alles sofort sichtbar, und es gibt keinen Scroll-Zwang.
  - Inhalte nur echt: Produkte laut Freigabe, Prüfanzahl aus dem Produktstandard. Die Beispielkalkulation kommt vom echten Rechenkern und ist als Beispiel gekennzeichnet. Keine Referenzen, keine Bewertungen, keine Verkaufszahlen.
- **Geprüft:** Desktop 1440 px und Mobil 375 px ohne horizontalen Überlauf. Echte Screenshots unter `docs/screenshots/m0/`.
- **Tests:** 2 neue Tests in `tests/integration/landing.test.ts`, Kontrasttest erweitert. `npm run verify` → **251/251**.
- **Offen:**
  - Italienische und englische Fassung der Startseite.
  - Admin-Route `/admin` mit Zwei-Faktor-Anmeldung (heute `/dashboard`).
  - Produktberater als Dialog (heute ein Formular mit Fehlerhinweisen).

---

## Premium-Produktstandard (Erweiterung von 009, gilt für alle Produktarten)

- **Standard-Akte je Produktart** (`services/product-factory/src/quality-standard.ts`) mit:
  - Zweck, Zielgruppe und Arbeitsabläufen
  - Referenzen mit abgeleiteten Anforderungen (RFC 4180 und Excel/LibreOffice-Import, PDF 1.4 und übliche Angebotsvorlagen, ZIP APPNOTE)
  - Gestaltungsregeln, zugesagten Funktionen, Sicherheit
  - Anleitung, Formaten und getesteten Benutzerabläufen
- **Keine Zusage ohne Prüfung:** Jede Gestaltungsregel und jede zugesagte Funktion ist einer automatischen Prüfung zugeordnet. Eine Zusage ohne ausgeführte Prüfung gilt als Lücke.
- **Verkaufssperre:** Eine Produktart mit Lücke in der Akte ist **nicht verkaufbar**.
- **Abnahme-Gate je Lieferung:** Alle Abnahmekriterien müssen ausgeführt **und** bestanden sein. Eine fehlende Prüfung zählt als durchgefallen.
- **Neue Gestaltungsprüfung PDF:** Titel, Netto-Hinweis und Herkunftsfußzeile müssen gesetzt sein.
- **Nicht lieferfähig:** Wenn die Qualitätsprüfung nach der Wiederholung weiter fehlschlägt, das Produkt nicht herstellbar ist oder die Akte unvollständig ist, passiert Folgendes:
  - Es wird nichts ausgeliefert, und der Auftrag wird gekennzeichnet.
  - Eine volle Erstattung wird dir **zur Freigabe vorgeschlagen**. Sie wird nie automatisch ausgelöst.
  - Der Kunde bekommt eine ehrliche Nachricht im Postausgang.
- **Konsole:** Produkte → „Premium-Produktstandard“. Alle 3 aktiven Produkte erfüllen den Standard.
- **Grenze:** Software, Websites, Grafik, 3D und Medien bleiben gesperrt. Der Standard ist dafür vorbereitet, aber eine Produktart wird erst freigeschaltet, wenn ihre Akte und echte Prüfungen existieren. Nichts davon wird als bestellbar vorgetäuscht.
- **Tests:** 6 neue Tests in `tests/integration/quality-standard.test.ts`. `npm run verify` → **249/249**.

---

## Automatische Kundennachrichten – Postausgang (004, 058, 097)

- **Automatisch erstellt (Rechtsgrundlage Vertrag):** „Angebot bereit“ bei jeder Anfrage, „Zahlung bestätigt“ und „Datei bereit“ im Autopilot-Takt. Idempotent, je Auftrag genau einmal.
- **Werbung / Folgeangebote nur mit Einwilligung:** nur zufriedene Kunden (abgenommen, ≥ 4 Sterne) mit aktiver E-Mail-Einwilligung. Die Datenbank verweigert Werbeentwürfe ohne Einwilligung (Trigger `MARKETING_REQUIRES_CONSENT`). Max. eine Werbenachricht je Kunde in 90 Tagen, Tageslimit 50. Jede enthält einen signierten Ein-Klick-Abmeldelink (`/abmelden/…`); danach wird nie wieder Werbung erzeugt.
- **Keine Kaltakquise:** Ausschreibungs-Kontakte (ohne Rechtsgrundlage) werden nie angeschrieben.
- **Datenschutz:** Empfänger im Postausgang nur maskiert; der geheime Angebotsschlüssel wird nicht gespeichert, sondern erst beim Versand neu ausgestellt.
- **Versand: aus.** Alle Nachrichten stehen im Status „Fertig – nicht gesendet“. „Gesendet“ ist technisch nur mit Versandbestätigung eines Anbieters möglich. Es fehlen:
  1. ein E-Mail-Versanddienst, den du auswählst und anlegst (kostenlose Stufe möglich),
  2. die Anbieterangaben für die Pflichtangaben jeder Nachricht (Partita IVA, LA-02),
  3. für Folgeangebote zusätzlich `AUTO_MARKETING_OUTREACH=true`.
- **Konsole:** Kunden → „Postausgang“.
- **Staging-Fund behoben:** Der erste echte TED-Abruf lieferte Fristen wie „2026-12-01+01:00“; die Kunden-Seite brach daran ab. Die Datumsanzeige liest das Format jetzt und stürzt bei unbekannten Werten nie mehr ab.
- **Tests:** 5 neue Tests in `tests/integration/outbox.test.ts`. `npm run verify` → **243/243**.

---

## LA-01 Sitzland: Italien (Entscheidung des Eigentümers, 2026-11-12)

- **Konsole:** Einstellungen → „Sitzland festlegen (LA-01)“. Speichert Italien und setzt LA-01 auf **In Arbeit**. Die Freigabe erteilst du erst mit der schriftlichen Bestätigung der Steuerberatung als Nachweis.
- **FatturaPA:** XML im Format FPR12 aus jedem Beleg (Finanzen → Belege → „FatturaPA (XML)“).
  - Strenge Prüfung: Partita IVA, CAP, Codice Destinatario, Natura bei 0 %, Regime, Summen, Stempelsteuer ab 77,47 €.
  - **Keine Datei mit Platzhaltern:** Fehlen Angaben, listet das System sie auf.
- **Steuer:** Satz und Befreiungsgrund nur als **Vorschlag** (forfettario, ordinario, EU-Unternehmen mit Reverse Charge). Für EU-Verbraucher (OSS) gibt es bewusst keinen Vorschlag. Die Freigabe macht die Steuerberatung (LA-06).
- **Übermittlung:** keine automatische Übermittlung ans SdI. Bis ein Kanal freigegeben ist, kostenlos manuell über das Portal der Agenzia delle Entrate.
- **Fragen an die Steuerberatung und einzutragende Angaben:** [docs/compliance/italien-umsetzung.md](docs/compliance/italien-umsetzung.md)
- **Tests:** 6 neue Tests in `tests/integration/italy.test.ts`. `npm run verify` → **235/235**, Dry-Run erfolgreich, Staging 27/27.

---

## Aktueller Gesamtstand

**229/229 Tests · E2E 1/1 · Dry-Run erfolgreich · Staging-Rauchtest 27/27**

| Status | Anzahl |
|---|---|
| Läuft im Testbetrieb | 26 |
| Teilweise | 59 |
| Noch nicht gebaut | 41 |
| Bewusst gesperrt | 1 |

Zuletzt vervollständigt (Tests in `tests/integration/completion.test.ts`):
- **107** – abgelaufene Daten sind im ganzen Ablauf gesperrt, jetzt auch für Angebotsentwürfe.
- **098** – Prognose mit Steuer- und Erstattungsrücklage; ein Auszahlungsdatum gibt es nur mit eingetragener Frist `PAYOUT_DELAY_DAYS`.
- **099** – Abhängigkeit auch je Produktart.
- **120** – schlechte Rückmeldungen erzeugen eine Qualitätsmaßnahme zur Entscheidung.
- **001** – Tagesbericht in der Übersicht und unter `/api/bericht/tag`; die KI-Planung bleibt offen.

Davor ergänzt:
- **Auswertungen:** 014/033 Annahme je Preisspanne (kein Gewinner unter 30 Angeboten) · 050 Portfolio nach Deckungsbeitrag · 051 zahlende vs. unverbindliche Käufer · 058 mögliche Folgeangebote (nichts wird versendet) · 087 Produkt-Lebenszyklus.
- **Schnittstellen und Pflege:** 071 Angebotskatalog `/api/katalog` · 128 Altlastenbericht `npm run tech-debt` → `docs/tech-debt.md`.
- **Mit bestehenden Tests belegt:** 013, 029, 082, 083, 105.

### Warum die übrigen 41 Funktionen noch nicht gebaut sind

Alle 41 hängen an etwas, das nicht ohne dich, deine Berater oder echte Geschäftsdaten zulässig bzw. sinnvoll ist:

| Blocker | Funktionen | Was es braucht |
|---|---|---|
| **Echte Verkäufe zuerst** – ohne reale Daten wären Ergebnisse erfunden | 018, 023, 026, 031, 056, 063, 064, 070, 081, 109, 116, 127, 130 | Live-Freigaben → echte Kunden und Umsätze |
| **Externe Plattformen, Partner oder Kanäle** | 024, 025, 027, 041, 052, 065, 066, 076, 091, 104, 111, 113, 117, 126 | Deine Freigabe je Kanal/Plattform (Nutzungsbedingungen, Werberecht, ggf. Verträge) |
| **KI-Kontingent oder Rechenleistung** | 007, 020, 045, 053, 102 | Tarifkonformer, freigegebener KI-Zugang für Produktionsjobs (kein Abo als API) |
| **Abo- und Nutzungsabrechnung** | 011, 032, 067, 074, 129 | Rechtlich geprüfte Abo-/Kündigungsbedingungen (LA-07), Steuerregeln (LA-06) |
| **Rechtliche oder geschäftliche Rahmen** | 028, 089, 112, 121 | Von dir freigegebener Verhandlungsrahmen, Quellen für Rechtsänderungen, Pilot- und Vertragsbedingungen |

---

## Vertrauen und abgebrochene Zahlungen (118, 125, 119)

| Funktion | Umsetzung | Grenze laut Registry, eingehalten durch |
|---|---|---|
| 118 Vertrauensseite | Öffentlich unter `/vertrauen`: Anbieterstatus, Bezahlung, Qualität, Echtheitsprüfung, Anleitungen, Bewertungen, Rechtsstatus | Keine erfundenen Partner/Zertifikate (Test); Anbieter ehrlich „noch nicht verifiziert“; Testbewertungen nie öffentlich |
| 125 Maschinenlesbarer Pass | `/.well-known/infinity-earn.json` mit denselben Fakten | Keine personenbezogenen oder Auftragsdaten (Test), keine Geheimnisse |
| 119 Abgebrochene Zahlungen | Konsole listet offene/fehlgeschlagene Zahlungen; Kunde setzt im Portal selbst fort (neue Zahlungssitzung, Besitzprüfung) | Keine Werbeerinnerungen – es wird nichts verschickt |

**Tests:** 4 neue Tests in `tests/integration/trust-recovery.test.ts`. `npm run verify` → **218/218**, E2E 1/1, Dry-Run erfolgreich, Staging 27/27.

**Funktionsstand jetzt:**

| Status | Anzahl |
|---|---|
| Läuft im Testbetrieb | 22 |
| Teilweise | 50 |
| Noch nicht gebaut | 54 |
| Bewusst gesperrt | 1 |

---

## Paket, Nachträge und Anleitungen (093, 092, 124)

| Funktion | Umsetzung | Grenze laut Registry, eingehalten durch |
|---|---|---|
| 093 Produktpaket | Tabelle + PDF als ZIP (eigener ZIP-Baustein mit CRC32, ohne Fremdbibliothek); jede Datei mit der QA ihrer Produktart geprüft | Preis aus tatsächlichem Mehraufwand – kein Scheinrabatt; Verkauf erst nach deiner Policy-Freigabe |
| 092 Nachtragsangebot | Im Portal „Erweiterung anfragen“ → eigenes Angebot mit gleicher Produktart und gleichem Aufschlag, nur für die neuen Positionen | Beauftragt erst nach Annahme und Zahlung; Original-Auftrag unverändert (Test) |
| 124 Anleitung je Produkt | `/hilfe/<produkt>` mit Inhalt, Schritten und Grenzen – inkl. ehrlichem Hinweis zu Punkt-Dezimalzahlen in deutschem Excel | Test vergleicht die Anleitung mit der tatsächlich erzeugten Datei; keine Anleitung für nicht angebotene Produkte |

**Tests:** 6 neue Tests in `tests/integration/bundle-change-help.test.ts`. `npm run verify` → **214/214**, E2E 1/1, Dry-Run erfolgreich, Staging 27/27. Migration `0008_change_requests.sql`.

**Funktionsstand jetzt:**

| Status | Anzahl |
|---|---|
| Läuft im Testbetrieb | 21 |
| Teilweise | 48 |
| Noch nicht gebaut | 57 |
| Bewusst gesperrt | 1 |

---

## Nach der Lieferung, Vertrauen und Vorsorge (043, 084, 047, 120, 034, 106, 107, 108, 114)

| Funktion | Umsetzung | Grenze laut Registry, eingehalten durch |
|---|---|---|
| 043 Vorschau | Angebot zeigt die Kalkulation aus den eigenen Daten des Kunden (max. 8 Positionen + Summen) | Datei erst nach bestätigter Zahlung, keine fremden Daten |
| 084/047 Abnahme | Kunde bestätigt im Portal „passt“ oder meldet einen Mangel → Reklamation | Keine automatische Abnahme durch Fristablauf; Entscheidung endgültig (DB) |
| 120/034 Rückmeldung | Freiwillige Bewertung 1–5 und Nutzen; Einwilligung zur Veröffentlichung getrennt | Nur nach Lieferung (DB-Trigger), eine je Auftrag, unveränderlich, derzeit nirgends veröffentlicht |
| 106 Risiko | Erklärte Hinweise im Auftragsdetail (Verbraucher, Wert, Land, Umfang, frühere Erstattungen) | Ausdrücklich keine Rechtsbewertung oder Vorhersage |
| 107 Datenaktualität | Quellen mit letztem Abruf und Alter der Bedingungen; abgelaufene offene Ausschreibungen | Warnungen statt stiller Weiterverwendung |
| 108 Herkunftsnachweis | Öffentliche Prüfseite `/pruefen/<SHA-256>`: Produktart, Version, Prüfprotokoll, Rechte, KI-Werkzeuge (keine) | Keine Kunden- oder Auftragsdaten; Warnungen bei unvollständigem Nachweis |
| 114 Erstattungsrücklage | Aus tatsächlicher Erstattungsquote (mind. 10 % bei wenig Daten) plus offene Anträge | Empfehlung, nie als auszahlbarer Gewinn |

**Tests:** 8 neue Tests in `tests/integration/aftercare.test.ts`. `npm run verify` → **208/208**, E2E 1/1, Dry-Run erfolgreich, Staging 27/27. Migration `0007_aftercare.sql`.

**Funktionsstand jetzt:**

| Status | Anzahl |
|---|---|
| Läuft im Testbetrieb | 19 |
| Teilweise | 48 |
| Noch nicht gebaut | 59 |
| Bewusst gesperrt | 1 |

---

## M2 – Produktherstellung mit Beweisen + erste M4-Auswertungen

### Implementiert

| Bereich | Dateien | Inhalt |
|---|---|---|
| Zweite Produktart | `services/product-factory/src/capabilities/b2b-calc-pdf.ts` | Kalkulation als druckfertiges PDF aus denselben Positionsdaten. Reproduzierbar (gleiche Eingabe → gleiche Prüfsumme), eigene QA: Kodierung, PDF-Struktur mit exakten Byte-Positionen, Seitenlimit, alle Positionen vorhanden, Summe nachgerechnet, Prüfsumme |
| Freigabe | `services/core-api/src/http-core.ts`, `apps/customer-portal/src/pages.ts` | Das Anfrageformular zeigt nur Formate, die die Policy erlaubt. Standard: nur CSV. Das PDF wird erst angeboten, wenn du `ALLOWED_CAPABILITIES=b2b-calc-csv,b2b-calc-pdf` setzt bzw. die Policy freigibst |
| Lieferung | `services/product-factory/src/delivery.ts` | Richtige Dateiendung (.pdf) und richtiger Dateityp |
| Auswertungen | `services/finance/src/insights.ts`, Bereich Berichte | 088 „Warum (noch) kein Verkauf?“ (Trichter, technische Fehlerdaten, Engpass, nächster Schritt) · 095 „Woher kamen die Käufer?“ (je erlaubter Herkunft, ohne Tracking, mit Messunsicherheit) · 098 „Was in nächster Zeit ankommt“ (nur bekannte Beträge, Auszahlung nie als Bankguthaben) · 099 Abhängigkeit von einzelnen Kunden (anonymisiert) · 101 Dauer des Kaufwegs (Median aus echten Zeitstempeln) |

### Automatisch getestet

`npm run verify` → **Exit 0** · **200/200 Tests**. Neu sind 11 Tests in `tests/integration/m2-product-pdf.test.ts` und `tests/integration/insights.test.ts`:
- **PDF-Produktart:** reproduzierbares PDF; QA erkennt Manipulation, fehlende Positionen und falsche Summen; 200 Positionen bleiben unter dem Seitenlimit.
- **Policy-Tor:** ohne Freigabe kein PDF-Angebot, mit Freigabe kompletter Ablauf bis zur PDF-Lieferung.
- **Auswertungen:** Diagnose (einschließlich technischer Ursachen), Herkunft, Prognose, Kundenkonzentration und Kaufweg aus echten Datensätzen.

**Funktionsstand nach diesem Schritt:**

| Status | Anzahl |
|---|---|
| Läuft im Testbetrieb | 15 |
| Teilweise | 45 |
| Noch nicht gebaut | 66 |
| Bewusst gesperrt | 1 |

Außerdem: E2E 1/1, Dry-Run erfolgreich, Staging-Rauchtest 27/27.

---

## M1 – Echter Transaktionskern im Testmodus

Die geforderte Kette läuft jetzt vollständig und automatisch getestet:

**Anfrage → Angebot → Annahme → signiert verifiziertes Zahlungsereignis → Produktionsjob → QA → sichere Auslieferung → Belegdatensatz → Abgleich → Auszahlungsmeldung („unterwegs“) → verifizierter Bank-Testbeleg → abgeschlossen**

### Implementiert

| Bereich | Dateien | Inhalt |
|---|---|---|
| Bankabgleich | `services/finance/src/bank-statement.ts`, `db/migrations/0006_bank_statements.sql` | CSV- und camt.053-Import, feste Abgleichregeln R1/R2, Mehrdeutigkeit → Prüfung, DB-Schutz (Nachweispflicht, endgültig, unveränderlich, keine Live-Zeilen), IBAN maskiert, XXE-sicher |
| Abschlussregel | `services/finance/src/payments.ts` | Auszahlungsmeldung schließt nicht mehr ab, erst der Bankbeleg |
| Beleg-PDF | `services/finance/src/invoice-pdf.ts` → `GET /portal/beleg/:id` | Nur für den bestellenden Kunden; Belege in Steuerprüfung werden nicht ausgegeben; im Testbetrieb deutlich als ungültig gekennzeichnet |
| Kundenseiten | `apps/shared/layout.ts`, `apps/customer-portal/src/pages.ts` | Premium-Design mit denselben Tokens: Startseite, Anfrage, Angebot mit Fortschritt, Zahlungsstatus, Portal mit allen Dokumenten je Auftrag |
| Konsole | `apps/console/src/pages/finance.ts` | Bereich „Bankabgleich“. Im Testbetrieb: Testauszahlung melden, Test-Kontoauszug herunterladen, Auszug einfügen. Im Echtbetrieb ehrlich „Noch nicht verbunden“ |
| Routen | `services/core-api/src/http-core.ts` | `/admin/bank/import`, `/admin/bank/test-statement`, `/admin/payouts/test` (Owner, CSRF, nur Testbetrieb) |

### Automatisch getestet

`npm run verify` → **Exit 0**
- **189/189 Tests bestanden.** Neu sind 12 Tests in `tests/integration/bank-statement.test.ts` und `tests/integration/portal-documents.test.ts`:
  - Gesamtkette bis Bankbestätigung
  - Beide Formate und beide Abgleichregeln
  - Mehrdeutigkeit, falscher Betrag, Lastschrift, Zeitfenster
  - Duplikat, fehlende TEST-Kennzeichnung, XXE, Größe, Echtbetrieb gesperrt
  - Datenbankschutz
  - HTTP-Ablauf
  - Beleg-PDF nur für den eigenen Kunden
  - Barrierefreiheits-Struktur der Kundenseiten
- **E2E-Pilot 1/1:** über die echte HTTP-Schnittstelle bis Beleg-PDF, Auszahlung, Bank-Testbeleg und `CLOSED`.
- **Dry-Run:** komplette Kette inklusive Bank-Testbeleg erfolgreich.
- **Testmatrix:** 98/100 automatisiert.
- **Staging-Rauchtest:** 27/27 (https://infinity-earn-staging.bikerman01.workers.dev).

Pflicht-Negativtests aus `END_TO_END_TESTPLAN.md`, die jetzt automatisiert abgedeckt sind:

| Nr. | Fall |
|---|---|
| 1 | Redirect ohne Webhook |
| 2 | Doppelter Webhook |
| 3 | Manipulierte Signatur |
| 6 | Pflichtdaten fehlen → `TAX_REVIEW` |
| 7 | Payout „sent“ ohne Banktransaktion → nie „auf Bank“ |
| 8 | Testdaten erhöhen keine Live-Kennzahlen |
| 9 | Kostenwunsch bei 0-€-Policy |
| 12 | Kein fiktiver Umsatz in der Live-Oberfläche |
| 13 | Doppelte Rechnungsnummer |
| 15 | Bedienung bei 320 px |

### Optisch geprüft

- Neue Screenshots in `docs/screenshots/m0/`: `kunde-start`, `kunde-angebot`, `kunde-portal` (Desktop), `kunde-portal` und `kunde-anfrage` (390 px), `finanzen-test` mit Bankabgleich.
- Gemessen: **14 Seiten × 4 Breiten (320/390/768/1440)** ohne horizontales Scrollen. Alle Klickziele sind mindestens 24 px groß; Checkboxen erreichen das über ihre klickbare Beschriftung.

### Noch Simulation / Test

- Alle Zahlungen, Auszahlungen und Kontoauszüge sind **Testdaten**: Test-Zahlungsanbieter bzw. Stripe-Sandbox, Test-Auszüge mit TEST-Kennzeichnung.
- Kein echter Kunde, kein echtes Geld, keine echte Bankgutschrift.

---

## M0 – Design und Fundament (Zusammenfassung)

- **Registry:** schreibgeschützte Registry der 127 Funktionen (Prüfsumme = Manifest, 048/049/110 technisch verboten), deutsche Anzeigenamen.
- **Konsole:** Premium-Konsole mit sechs Bereichen, Design-Tokens, eigenen Icons, ehrlichen leeren Zuständen, fünf Geldstufen und Test/Live-Trennung.
- **Status und Kosten:** technischer Statusbericht unter `/api/status`, Kostengate 0 € sichtbar.
- Details: [ADR 0005](docs/adr/0005-v15-premium-console.md).

## Funktionsstand (127 freigegebene Funktionen)

Laufend aktuell in der Konsole unter **Berichte → Funktionsstand**. Jede Funktion mit „läuft“ oder „teilweise“ ist mit einer Testdatei belegt; das prüft ein Test.

## Betriebsrelevante Blocker (nur durch Eigentümer/Beratung lösbar)

- **Live-Freigaben:** LA-01 bis LA-12, aktuell 0 von 12 erteilt. Der wichtigste Punkt ist LA-01 Sitzland, denn davon hängen Steuer, Rechnungsweg und Rechtstexte ab.
- **Bankabgleich mit echten Auszügen:** erst nach LA-03 (Zahlungsanbieter-KYC) und LA-04 (Auszahlungskonto).
- **Video, 3D und Audio:** keine kostenlose, dauerhaft verfügbare Rechenleistung nachgewiesen.

## Echte oder mögliche Kosten

- Zusätzliche Software-Fixkosten: **0 €**. Cloudflare Workers Free, Stripe-Sandbox, lokaler Edge für Screenshots; Kontoauszug-Import ohne Bank-API.
- Im Echtbetrieb fallen später real an: Zahlungsgebühren pro Verkauf, Steuern, Registrierungs- und Beratungskosten.

## Als Nächstes real umsetzbar (ohne Eigentümer-Freigabe)

1. **M2:**
   - Zweite Produktart mit Herstellbarkeitsnachweis (z. B. Angebots-PDF oder XLSX-Kalkulation), mit eigener QA.
   - „Teilweise“-Funktionen aus dem Bereich Produkte vervollständigen.
2. **M4-Vorarbeiten ohne Außenwirkung:**
   - Diagnose bei ausbleibenden Verkäufen (088).
   - Liquiditäts- und Auszahlungsprognose aus echten Daten (098).
   - Abhängigkeit von Großkunden (099).
3. **Nach LA-01:** Rechnungsformat und Umsatzsteuerprüfung je Sitzland.
