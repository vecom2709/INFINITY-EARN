# Plattform-Matrix (Funktionen 157/158)

Stand: 2026-11-13. Ein Eintrag gilt nur mit echtem Nachweis. Nicht getestet heißt **UNVERIFIED**, nie „bestanden“.

| Ziel | Ergebnis | Echte Testumgebung | Nachweis |
|---|---|---|---|
| Windows 11 x64 (25H2, Build 26200) | **PASS** | dieser Rechner | `tests/products/win-lager/install.test.ts` (lokal) |
| Windows Server (GitHub `windows-latest`) | **PASS** | GitHub Actions, Lauf vom 13.11.2026 (Commit 6b2bd3a) | Job `windows-program` in `.github/workflows/ci.yml` |
| Windows 10 | UNVERIFIED | – | Gleiche Laufzeit (.NET Framework 4.8 ist enthalten), aber ohne eigenen Test keine Zusage |
| macOS | UNVERIFIED / `COST_APPROVAL_REQUIRED` | – | Mac-Hardware und Apple-Entwicklerkonto nötig |
| Linux | nicht unterstützt | – | WinForms-Programm; für Linux wäre eine eigene Ausgabe nötig |
| ARM64-Windows | UNVERIFIED | – | AnyCPU-Programm, nicht auf ARM getestet |

## Was der Windows-Test wirklich prüft

1. **Build:** mit dem in Windows enthaltenen C#-Compiler (.NET Framework 4.x).
   - Vorher laufen 12 Fachtests; ohne bestandene Tests entsteht kein Installer.
   - Die Programmdatei ist eine echte Windows-Programmdatei (PE), keine HTML-Ansicht.
2. **Fehlende Voraussetzung (simuliert):** Exit-Code 3 mit klarer Meldung, nichts installiert.
3. **Installation pro Benutzer:**
   - Dateien, Startmenü-Verknüpfung und Eintrag unter „Apps & Features“ mit Version, Herausgeber und Deinstallationsbefehl werden angelegt.
   - Windows meldet den Signaturstatus `NotSigned`; das Manifest sagt `signed: false`.
4. **Start der installierten Datei:**
   - Die Oberfläche wird mit 3 Bereichen und über 40 Bedienelementen aufgebaut.
   - Ein Bildschirmfoto des laufenden Programms entsteht.
   - Die echte Windows-Version steht im Prüfbericht.
5. **Daten über Neustart:** Ein Prozess legt einen Artikel an, ein zweiter Prozess liest ihn.
6. **Gleichzeitige Zugriffe:** Drei Schreibvorgänge parallel verlieren nichts. Ein Fehler, den dieser Test gefunden hat, ist behoben.
7. **Laufendes Programm:** Update und Deinstallation brechen mit Exit-Code 4 ab, nichts wird verändert.
8. **Update 1.0.0 → 1.1.0:** Version im Eintrag aktualisiert, Kundendaten erhalten.
9. **Deinstallation:**
   - Entfernt werden Programm, Deinstallationsprogramm, Verknüpfung und Eintrag.
   - Eine fremde Datei im Programmordner bleibt unangetastet; die Kundendaten bleiben erhalten.
   - Ohne fremde Dateien verschwindet der Ordner vollständig.

## Anleitung und Freigabe

- **Anleitung:** Jede Kundenfassung erhält eine bebilderte Anleitung (PDF, DE/IT/EN) mit echten Bildschirmfotos des gebauten Programms.
  - Die Fotos entstehen mit `node scripts/build-win-lager-assets.ts`, nur auf Windows.
  - `tests/products/win-lager/manual.test.ts` prüft auf jedem System, dass Fotos und Texte zum aktuellen Programm gehören.
- **Rechnungen:** Pflichtangaben nach § 14 Abs. 4 UStG (AT § 11 UStG) sind umgesetzt und getestet. Die italienische Fassung erzeugt zusätzlich die FatturaPA (XML) zum Hochladen im SdI, geprüft gegen das eingebettete amtliche Schema (`products/win-lager/schema/`, FPR12 v1.2.3).
- **Freigabe:** Die Admin-Seite `/dashboard/produkte/win-lager` zeigt die Freigabe-Akte. Den Verkauf sperren noch zwei Punkte:
  - die echte Annahme der FatturaPA im SdI – sperrt die italienische Fassung;
  - der Bau je Auftrag.

## Werkzeug- und Kostenlage

- **Windows:**
  - Die Werkzeuge kosten 0 € und es gibt keine Downloads; Compiler und Laufzeit sind Teil von Windows.
  - Code-Signatur ist **nicht** vorhanden, denn das Zertifikat kostet. Ohne Signatur warnt Windows SmartScreen beim Download aus dem Internet. Das Programm ist deshalb überall als „unsigniert“ gekennzeichnet.
- **Sprachwahl:** C#/WinForms statt Rust, aus drei Gründen:
  - Rust bräuchte unter Windows die mehrere GB großen Visual-Studio-Build-Tools.
  - Die Rust-Oberfläche hätte zusätzliche Abhängigkeiten.
  - Der Vorteil wäre für ein 45-KB-Programm ohne rechenintensive Teile nicht messbar.

  Für rechenintensive Kundenprogramme bleibt Rust die erste Wahl.
