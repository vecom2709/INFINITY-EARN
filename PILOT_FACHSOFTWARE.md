# Pilot: erste echte Fachsoftware (Gesamtprompt §4, M3)

Stand 2026-11-13 · **Umfang vom Eigentümer bestätigt: Mini-Warenwirtschaft als Offline-Programm (Weg A).**

| Phase | Stand |
|---|---|
| **P1 Fachlogik** | ✅ fertig: `products/mini-ww/src` (Stammdaten, Lager, Verkauf, Rechnung/Gutschrift, Zahlungen/offene Posten/Mahnstufen, Rollen, Berichte, Sicherung, CSV), 13 Tests in `tests/products/mini-ww/domain.test.ts` |
| P2 Oberfläche | offen |
| P3 Fabrik-Anbindung | offen |
| P4 Admin-Vorschau, Verkaufsfreigabe | offen |

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
