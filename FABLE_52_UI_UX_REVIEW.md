# FABLE 5.2 – Prüfung von Oberfläche, Landingpage und Auffindbarkeit (17.0)

Stand 16.11.2026. **Einschränkung:** In dieser Sitzung fand kein Durchgang im echten Browser statt (kein Blick auf Gestaltung, mobile Darstellung, Tastaturbedienung). Geprüft wurde, was sich maschinell belegen lässt.

## Maschinell belegt

| Prüfung | Ergebnis | Nachweis |
|---|---|---|
| Jeder Link, jedes Formular, jeder Knopf (Besucher, Kunde, Eigentümer) | 101 Seiten, etwa 1.900 Links, 47 Formulare, 150 Knöpfe – 0 tote Elemente | `tests/integration/no-prototype.test.ts` |
| Antwortzeit Staging | Startseite 0,18–0,44 s, übrige Seiten 0,17–0,25 s | curl, 5 Messungen je Seite |
| Seitengröße Startseite | 37 KB HTML, keine externen Skripte oder Schriften | Staging-Antwort |
| Sprache und Grundgerüst | `lang` gesetzt, genau eine Hauptüberschrift, Viewport-Angabe, Sprunglink „Zum Inhalt“ | Staging-HTML |
| Mehrsprachigkeit | DE/IT/EN mit `hreflang` (7 Verweise), ein Canonical | Staging-HTML, `tests/integration/i18n-pages.test.ts` |
| Sitemap und robots.txt | 12 Adressen; Verwaltung, Portal, Angebote, API ausgeschlossen | Staging |
| Farbwelt Luxury Turquoise | Farbwerte #18C8C1, #087F82, #0E1D25, #F7FAF9, #DCEBEA im Stylesheet | Seitenquelltext |
| Keine erfundenen Zahlen oder Bewertungen | Vertrauensseite zeigt nur echte Prüfzahlen; Testbewertungen erscheinen nie öffentlich | `tests/integration/trust-recovery.test.ts` |
| Kaufweg | Anfrage → Angebot → Annahme → Stripe-Testkasse → Erfolgsseite → Portal | echter Durchlauf mit Stripe-Sandbox, 13.11.2026 |

## Befunde

| # | Befund | Stand |
|---|---|---|
| 1 | Testseite war für Suchmaschinen freigegeben | **behoben:** `noindex` im Testbetrieb. Folge: Die Auffindbarkeit bei Google lässt sich erst im Echtbetrieb prüfen. |
| 2 | Keine strukturierten Daten (JSON-LD) auf der Startseite | offen |
| 3 | Keine Open-Graph-/Vorschau-Angaben für geteilte Links | offen |
| 4 | Admin „Sicherheit“ ist nur über Einstellungen erreichbar (kein eigener Navigationspunkt, Grenze von 6 Bereichen eingehalten) | in Ordnung |
| 5 | Zwei Verwaltungsoberflächen (`/dashboard` und ältere `/dashboard/experte`) | bewusst; für Nichtprogrammierer ist nur die neue Konsole gedacht |

## Nicht geprüft (braucht einen Browser-Durchgang)
- Gestaltungsqualität, Typografie, Bildsprache, Storyscrolling.
- Mobile Darstellung und Bedienung mit dem Finger.
- Tastaturbedienung, Kontraste im gerenderten Zustand, Screenreader.
- Core Web Vitals (Messung im Browser), tatsächliche Indexierung.
- Passkey-Fenster (Windows Hello) im echten Browser.

## Conversion-Messung
Die Kette Besucher → Anfrage → Angebot → Bestellung → Zahlung wird aus echten Ereignissen gezählt (Wachstumsbereich im Admin). Im Testbetrieb gibt es keine echten Besucherzahlen; es werden keine Werte geschätzt oder erfunden.
