# FABLE 5.2 – Produktionsreife (17.0)

Stand 16.11.2026 · **Keine globale Produktionsreife.** Diese Übersicht beruht auf einer Teilprüfung (Eigenreview); nicht geprüfte Bereiche sind so benannt.

## Gesamtabnahme

| Bereich | Tatsächlich geprüft | Produktionsbereit | Blockiert durch |
|---|---|---|---|
| 157 Funktionen | 305 Nachweistests ausgeführt (`FABLE_52_FEATURE_MATRIX.json`) | **Nein** – 26 VERIFIED, 86 IMPLEMENTED, 42 SPECIFIED, 3 BLOCKED | 42 nur beschrieben; keine Tiefenprüfung je Funktion |
| Cloudflare 24/7 | Takt, Wiederanlauf, Duplikate, Kontingent, 60 parallele Aufträge (lokal), Sicherung | Im Testbetrieb ja | Live-Freigaben; kein Lasttest auf Staging |
| Claude-KI-Ausführung | Ablauf ohne Token getestet; 9 geplante Läufe ohne Arbeit | **Nein** | Abo-Token des Eigentümers; echter Lauf nie ausgeführt |
| Kundengewinnung | Eingangsformular, TED-Anbindung (nur nach Freigabe), Flutschutz | **Nein** | kein freigegebener Versandkanal; keine Freelancer-Plattform angebunden; in dieser Sitzung nicht tief geprüft |
| Landingpage | alle Links und Formulare, Antwortzeit, Grundgerüst, Mehrsprachigkeit | Technisch ja | Rechtstexte ungeprüft; kein Browser-Durchgang; JSON-LD fehlt |
| B2B/B2C-Vertrieb | Angebot, Annahme, Verbraucher-Widerrufsverzicht (bestehende Tests) | **Nein** | LA-06, LA-07 |
| Freelancer-Aufträge | Szenario A | **Nein** | keine XLSX mit Formeln, keine Plattformanbindung |
| Kundenkommunikation | Postausgang erzeugt Nachrichten, versendet nicht | **Nein** | Versandkanal nicht freigegeben |
| Stripe LIVE | Testmodus vollständig (echte Sandbox) | **Nein** | LA-03, LA-04: Live-Konto mit Verifizierung fehlt |
| Desktopsoftware | Windows 11 real, Bau je Auftrag | Windows: technisch ja, nicht freigegeben | Festpreis und Freigabe-Weg; unsigniert; Windows 10, macOS, Linux ungeprüft |
| Web- und Mobile-Apps | Mini-Warenwirtschaft (Browser) | Nur dieses eine Produkt | individuelle Apps und Mobile nicht herstellbar |
| Office- und Medienproduktion | CSV, PDF | **Nein** | XLSX, DOCX, PPTX, Grafik, Audio, Video nicht vorhanden |
| Admin-Live-Vorschau | Dateien und Browser-Programm (bestehende Tests) | Teilweise | Windows-Programm nur als Download |
| Kundenportal | Crawler, Mandantentrennung | Technisch ja | Live-Freigaben |
| Automatische Lieferung | signierte, kundengebundene Downloads | Technisch ja | Live-Freigaben |
| Rechnungen und Finanzen | Belege, Erstattung nur als Vorschlag, Bank-Testabgleich (bestehende Tests) | **Nein** | LA-02, LA-05, LA-06; in dieser Sitzung nicht tief geprüft |
| Sicherheit | `FABLE_52_SECURITY_AUDIT.md` | Keine kritische Lücke bekannt | zweiter Faktor nicht eingeschaltet; keine Fremdprüfung |
| Performance | lokal gemessen, Staging-Antwortzeiten | Für den Start ausreichend | kein Lasttest auf Staging |

## Freigabe-Tore (Abschnitt 21) für den Echtbetrieb

| Tor | Stand |
|---|---|
| A Funktionsumfang | nicht erfüllt (42 Funktionen nur beschrieben) |
| B Echte Ausführungstests der kritischen Funktionen | erfüllt für den Kern im Testbetrieb |
| C Daten speichern und wiederherstellen | erfüllt (Wiederherstellung in lokale Datenbank) |
| D Keine bekannten kritischen Lücken | erfüllt (Stand der Prüfung) |
| E Rechte und Mandantentrennung | erfüllt |
| F Oberflächen bedienbar | erfüllt (maschinell); Browser-Durchgang offen |
| G Zielsysteme | nur Windows 11 und Browser belegt |
| H Installations- und Lieferdateien | erfüllt für die sechs Produktarten |
| I Fehlerfälle | erfüllt für den Kern |
| **J Rechtliche und externe Freigaben** | **nicht erfüllt – 0 von 12** |
| K Keine ungefragten Kosten | erfüllt (0 €) |
| L Nachvollziehbare Nachweise | erfüllt |

**Ergebnis: Echtbetrieb bleibt gesperrt.**

## Was nur der Eigentümer tun kann
1. LA-01 bis LA-12 mit Nachweisen (Unternehmen, Steuer, Stripe-Live mit Verifizierung, Bank, Rechtstexte nach anwaltlicher Prüfung).
2. Zweiten Faktor einschalten: Admin → Einstellungen → Sicherheit.
3. `CLAUDE_CODE_OAUTH_TOKEN` hinterlegen (KI-Texte).
4. Optional `GITHUB_DISPATCH_TOKEN` (Start externer Läufe in Minuten statt Stunden).
5. Festpreise und Verkaufsfreigaben.

## Was als Nächstes gebaut werden kann (ohne Kosten, ohne Freigabe)
1. XLSX-Kalkulation mit echten Formeln (schließt Szenario A).
2. Freigabe-Weg für extern gebaute Produkte (Windows, KI-Texte) über den bestandenen Probebau.
3. JSON-LD und Open-Graph-Angaben.
4. Bereichsweise Tiefenprüfung der 86 teilweise umgesetzten Funktionen.
5. Aufteilung von `http-core.ts`.
