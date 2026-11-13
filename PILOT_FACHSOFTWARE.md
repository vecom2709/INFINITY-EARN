# Pilot: erste echte Fachsoftware (Gesamtprompt §4, M3)

Stand 2026-11-13 · **Umfang vom Eigentümer bestätigt: Mini-Warenwirtschaft als Offline-Programm (Weg A).**

| Phase | Stand |
|---|---|
| **P1 Fachlogik** | ✅ fertig: `products/mini-ww/src` (Stammdaten, Lager, Verkauf, Rechnung/Gutschrift, Zahlungen/offene Posten/Mahnstufen, Rollen, Berichte, Sicherung, CSV), 13 Tests in `tests/products/mini-ww/domain.test.ts` |
| **P2 Oberfläche** | ✅ fertig: `products/mini-ww/ui` – Offline-Programm als **eine HTML-Datei** (ca. 104 KB), DE/IT/EN, Einsteiger/Profi, Kundendesign mit automatischer Kontrastanpassung, Druckansicht für Angebote/Rechnungen (Browser-Druck → PDF), Sicherung/Wiederherstellung, CSV. CSP verbietet jeden Netzwerkzugriff. 8 Tests in `tests/products/mini-ww/ui.test.ts`; im echten Browser durchgespielt (Artikel → Rechnung → Zahlung, Neuladen, Druck, Mobil 375 px). **Demo:** https://vecom2709.github.io/INFINITY-EARN/mini-ww-demo/ |
| **P3 Fabrik-Anbindung** | ✅ fertig: Produktart `mini-ww` (`services/product-factory/src/capabilities/mini-ww.ts`). Je Auftrag: Firmenname, Farbe, Logo, Sprache und **Einrichtung** (Steuersätze, Nummernkreise, Zahlungsziel – `products/mini-ww/src/setup.ts`). Lieferpaket (ZIP): `warenwirtschaft.html`, **bebilderte Bedienungsanleitung** `bedienungsanleitung.pdf` (13 Seiten, 10 echte Screenshots, ein Kapitel je Arbeitsablauf, DE/IT/EN) und `LIESMICH.txt` mit Prüfsummen. Abnahme je Lieferung: 9 Prüfungen, Standard-Akte vollständig. **Verkauf gesperrt bis P4.** 10 Tests in `tests/products/mini-ww/factory.test.ts` |
| P4 Admin-Vorschau, Verkaufsfreigabe | offen – Muster schon heute für den Eigentümer: `/admin/muster/mini-ww/anleitung.pdf` (`?lang=it`/`en`) und `/admin/muster/mini-ww/paket.zip` |

**P3 – wie die Fabrik das Programm herstellt:**
- **Vorab gebaut, im Worker zusammengesetzt:** Der Worker hat weder Compiler noch Browser. `node scripts/build-mini-ww-assets.ts` bündelt den Programmcode (`products/mini-ww/generated/bundle.ts`, SHA-256) und erzeugt die Screenshots. Ein Test schlägt fehl, sobald der gebündelte Code nicht mehr zu den Quellen passt.
- **Echte Screenshots:** Microsoft Edge (lokal, headless, kostenlos) fotografiert das gebaute Programm mit einem Beispielbestand, der nur über die echten Knopf-Aktionen entsteht (`products/mini-ww/seed.ts`). Verkleinert als JPEG (je ca. 30 KB, gesamt ca. 1 MB) in `products/mini-ww/manual/shots/`. Der Beispielbestand kommt **nie** in eine Kundenauslieferung; die Abnahme prüft das.
- **Anleitung:** `products/mini-ww/manual.ts` mit eigenem PDF-Baustein `packages/shared/src/pdf-doc.ts` (echte Helvetica-Laufweiten, eingebettete JPEGs, byte-genaue Verweistabelle). Deckblatt in der Kundenfarbe mit Firmenname, Seite „Ihre Einrichtung“, 10 Kapitel. Jede genannte Knopfbezeichnung wird aus den Texten des Programms übernommen – ein Test verhindert Bezeichnungen, die es im Programm nicht gibt. Hinweis im PDF: Abbildungen zeigen das Standarddesign mit Beispieldaten.
- **Abnahmeprüfungen je Lieferung:** `zip_structure`, `program_integrity` (ausgelieferter Code = getestete Fassung), `branding` (Kontrast ≥ 4,5:1, sicheres Logo, keine Beispieldaten), `no_network` (CSP, keine externen Quellen, keine Netzwerkaufrufe), `domain_selftest` (Angebot → Auftrag → Lieferung → Rechnung → Zahlung mit den Nummernkreisen und Steuersätzen des Kunden, Fehlbedienung abgewiesen), `ui_actions` (keine Schaltfläche ohne Funktion, jedes Feld beschriftet – 22 Seiten in zwei Rollen), `manual_pdf` (Struktur, Verweise, Seiten, 10 Bilder, 10 Kapitel, Sprache, keine aktiven Inhalte), `readme`, `checksum`.
- **Grenzen (ehrlich):** Die Screenshots zeigen das Standarddesign, nicht die Farbe des Kunden (Edge läuft nicht im Worker). Ein Kunden-Logo erscheint im PDF nur, wenn es als JPEG geliefert wird. **Italien:** B2B-Rechnungen müssen elektronisch über das SdI (FatturaPA) laufen – das Programm erstellt druckbare Belege, keine FatturaPA. Das steht in der Akte unter „nicht lieferfähig“ und muss vor der Freigabe auf der Produktseite stehen.

**P1 – wie die Fachlogik arbeitet:**
- **Atomar:** Jede Operation läuft auf einer Kopie und wird nur bei Erfolg übernommen; ein abgelehnter Vorgang ändert nichts.
- **Bestand aus dem Journal:** Er wird immer aus dem Bewegungsjournal berechnet und nie separat gespeichert.
- **Lückenlose Nummern:** Rechnungs- und Gutschriftnummern werden erst beim Festschreiben vergeben.
- **Prüfbare Sicherung:** Sie trägt eine Prüfsumme; beim Wiederherstellen wird der gesamte Bestand gegen sein eigenes Journal geprüft. `verifyStore` prüft alle Invarianten.
- **Browsertauglich:** reines TypeScript ohne Node-Abhängigkeiten, ein Test erzwingt das.
- **Grenze:** Mengen sind ganze Einheiten. Dezimalmengen (m², Stunden) kommen erst mit einer späteren Erweiterung.

## Ziel

Ein vollständiges, kleines Fachprogramm, das INFINITY EARN als **neue Produktart** verkaufen und automatisch, geprüft ausliefern kann. Es ist der Beweis für „echte Software statt Formulare“:
- echte Datenhaltung und Fachlogik,
- echte Abläufe mit Fehlerfällen,
- eigenes Design je Kunde,
- Anleitung, Live-Vorschau im Admin und Abnahme-Gate.

Erst danach wird die Komplexität schrittweise erhöht.

## Vorschlag: „Mini-Warenwirtschaft für Kleinbetriebe“

Das ist das Beispiel aus §4, auf einen realistischen Umfang zugeschnitten.

**Durchgängiger Ablauf:**
1. Artikel anlegen, Bestand initialisieren.
2. Kunde anlegen, Angebot erstellen, Annahme durch den Kunden.
3. Auftrag anlegen, Bestand reservieren.
4. Warenausgang buchen, Rechnung erzeugen.
5. Zahlung erfassen, offenen Posten ausgleichen.
6. Berichte ansehen.

### Funktionsmatrix und Abnahmekriterien

| Bereich | Funktion | Abnahmekriterium (automatisch geprüft) |
|---|---|---|
| Stammdaten | Kunden, Lieferanten, Artikel (Nummer, Einheit, Preis, Steuersatz) | Pflichtfelder, eindeutige Nummern, Suche und Filter |
| Lager | Bestand, Zugang, Reservierung, Warenausgang, Korrekturbuchung mit Grund | **kein negativer Bestand**; jede Bewegung im Journal; Korrektur statt Löschen |
| Verkauf | Angebot → Annahme → Auftrag → Teil- und Vollauslieferung | Statusmaschine erzwingt die Reihenfolge; keine Doppelauslieferung |
| Rechnung | Rechnung aus Lieferung, fortlaufende Nummern, Gutschrift statt Storno | lückenlose Nummernkreise; festgeschriebene Rechnungen unveränderlich; Summen und Steuern nachgerechnet |
| Zahlungen | Zahlungseingang, Teilzahlung, offene Posten, Mahnstufe | Ausgleich korrekt; keine Überzahlung ohne Gutschrift |
| Berichte | Umsatz, offene Posten, Lagerwert, Bewegungen | Werte stimmen mit dem Journal überein |
| Daten | Export CSV/JSON, Import Artikel/Kunden (CSV), Sicherung und Wiederherstellung | Rundreise Export → Import ohne Verlust |
| Bedienung | DE/IT/EN, Tastaturbedienung, verständliche Fehler, Einsteiger- und Profiansicht | Barrierefreiheit (Kontrast, Beschriftungen), keine funktionslosen Schaltflächen |
| Design | eigenes Erscheinungsbild je Kunde (Firmenname, Farben, Logo) | Kontrasttest mit den Kundenfarben; ungültige Farbwahl wird angepasst |

**Rollen:** Inhaber und Mitarbeiter mit unterschiedlichen Rechten, zum Beispiel darf nur der Inhaber Rechnungen festschreiben und Korrekturen buchen. In der Offline-Fassung (siehe unten) ist das eine Ablaufregel, **kein Sicherheitsschutz**. Das wird dem Kunden ehrlich so gesagt.

### Bewusst nicht enthalten

- Keine elektronische Rechnung an das SdI (FatturaPA-Versand), keine Finanzbuchhaltung oder DATEV-Export, keine Lohnabrechnung.
- **Steuerlich sensibel:** Rechnungsvorlagen und Steuersätze sind einstellbar, die Software prüft aber keine Steuerpflichten. Laut §4 wird eine steuersensible Software nur nach fachlicher Prüfung als „steuerlich geprüft“ beworben. Bis dahin steht in der Anleitung klar: „Belege vor Verwendung von der Steuerberatung prüfen lassen.“
- Keine Mehrplatz- oder Cloud-Version im Pilot (siehe Auslieferung).

## Auslieferung: zwei Wege, Empfehlung A

| | **A – Offline-Programm (empfohlen für den Pilot)** | B – Gehostete Mehrplatz-Version |
|---|---|---|
| Was der Kunde bekommt | ZIP mit lauffähigem Programm (eine HTML-Anwendung, läuft im Browser ohne Internet), Daten lokal im Browser-Speicher, Sicherungsdatei | Zugang zu einer Online-Instanz |
| Kosten für uns | 0 € | Hosting, Datenschutzvertrag mit dem Kunden (Auftragsverarbeitung), Betrieb, Haftung |
| Rollen und Sicherheit | Ablaufregeln auf einem Gerät | echte Benutzerkonten und Rechte |
| Risiko | gering | hoch (Kundendaten bei uns) |
| Admin-Live-Vorschau | **echt interaktiv**: dieselbe Datei läuft isoliert mit Testdaten im Admin | Preview-Deployment nötig |

B kommt erst nach einem erfolgreichen Pilot und mit deiner Freigabe der Kosten und Pflichten.

## Technik

- **Sprache:** TypeScript für Programm und Fachlogik. Eine eigene, getestete Domänenschicht (Buchungen, Nummernkreise, Statusmaschinen) liegt getrennt von der Oberfläche.
- **Rust-Prüfung** (Regel 2): Die Fachlogik als Rust → WebAssembly brächte Typsicherheit, aber eine zweite Werkzeugkette und mehr Aufwand bei der Fehlersuche. Bei den Datenmengen eines Kleinbetriebs gibt es keinen messbaren Geschwindigkeitsvorteil. **Entscheidung: TypeScript.** Bei einer späteren Mehrplatz-Version (B) wird Rust für den Server neu geprüft.
- **Herstellung:** Die Produktfabrik setzt je Auftrag Firmenname, Farben, Logo, Sprache, Steuersätze und Nummernkreise ein. Daraus baut sie das Programm, prüft es und packt es als ZIP.
- **Qualitätsfreigabe** (Abnahme-Gate im Produktstandard):
  1. Fachtests der Domänenschicht.
  2. Ende-zu-Ende-Lauf des gesamten Ablaufs mit Fehlerfällen im gebauten Programm.
  3. Kontrast mit den Kundenfarben.
  4. Prüfung, dass keine Schaltfläche ohne Funktion bleibt.
  5. Prüfsumme.

## Pflicht-Testfälle (Auszug)

- **Negativer Bestand:** Auslieferung über den Bestand hinaus wird abgelehnt.
- **Doppelte Buchungen:** Dieselbe Lieferung zweimal buchen wird erkannt.
- **Gutschrift:** Eine Gutschrift auf eine festgeschriebene Rechnung gleicht offene Posten und Bestand korrekt aus.
- **Rechte:** Ein Mitarbeiter darf nicht festschreiben.
- **Korrekturen:** Eine Korrekturbuchung braucht einen Grund und bleibt im Journal sichtbar.
- **Nummernkreise:** fortlaufend und ohne Lücken, auch nach Wiederherstellung einer Sicherung.
- **Datenrundreise:** Export und Import führen zu identischen Berichten.
- **Kundendesign:** Unlesbare Kundenfarben werden auf ausreichenden Kontrast angepasst.

## Phasen

| Phase | Ergebnis |
|---|---|
| P1 | Domänenschicht mit allen Fachtests |
| P2 | Oberfläche in DE/IT/EN mit Einsteiger- und Profiansicht, Kundendesign |
| P3 | Fabrik-Anbindung: Konfiguration aus dem Auftrag, Build, Abnahme-Gate, ZIP, Anleitung, Standard-Akte |
| P4 | Admin-Live-Vorschau interaktiv (Programm mit Testdaten), Produktseite mit Preis, Freigabe zum Verkauf durch dich |

Jede Phase wird einzeln getestet und ausgerollt. Verkauft wird erst nach P4 und deiner Freigabe der Produktart. Der Echtverkauf setzt zusätzlich die LA-Freigaben voraus.

## Entscheidungen

1. Pilotprogramm: **Mini-Warenwirtschaft** (Eigentümer, 13.11.2026).
2. Auslieferung: **A – Offline-Programm** (Eigentümer, 13.11.2026). Eine Mehrplatz-Version kommt erst nach Kostenfreigabe.
