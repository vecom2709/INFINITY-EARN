# INFINITY EARN 15.0 – Umsetzungsplan für 157 Funktionen (Universal-Produktion 156–165)

Stand: 2026-11-13 · Quelle: `docs/spec/v15-157/` (SHA-256 laut Manifest des Eigentümers geprüft) · Registry: [FEATURE_REGISTRY_157.json](FEATURE_REGISTRY_157.json)

## Freigabe

- **Beauftragt:** 1–47, 50–109, 111–140 und 146–165, zusammen 157 Funktionen.
- **Abgelehnt:** 48, 49 und 110.
- **Nicht freigegeben:** 141–145.
- **Neu:** 156–165, die zehn Universal-Produktions-/Freelancer-Module.
- Eine beauftragte Spezifikation ist **keine** fertige Funktion. Der Status richtet sich nur nach Code und Tests (per Test erzwungen).

## Ehrlicher Stand der zehn neuen Funktionen

| Nr. | Funktion | Stand | Was läuft (getestet) / was fehlt |
|---|---|---|---|
| 156 | Auftragsanforderung verstehen | **TEILWEISE** | Aus dem Kundentext wird eine Auftragsanforderung (AssignmentSpec) mit Produktart, Plattform, Lieferumfang, MUSS/SOLL/OPTIONAL, Abnahmekriterien, Rückfragen und Konflikten. Scope-Versionen mit Kundenbestätigung, Website-Anfragen automatisch (Admin → Aufträge → Anforderungen). Pflichttests PR-156-01…08 in `tests/integration/assignment.test.ts`. **Offen:** Sprach- und Dokumentanalyse (KI-Zugang mit Kostenfreigabe) und automatische Übernahme ins Angebot. |
| 157 | Programme mit Installer | GEPLANT | Die Mini-Warenwirtschaft ist ein Browser-Programm und wird **nicht** als native Anwendung ausgegeben. Erstes Windows-Programm mit Installer: P3. |
| 158 | Plattform-Testlabor | GEPLANT | Windows ist auf diesem Rechner testbar, Linux in kostenloser CI; macOS nicht ohne Mac. |
| 159 | Office- und Dokumentproduktion | **TEILWEISE** | Kalkulation als CSV und PDF mit automatischer Prüfung. **Offen:** bearbeitbare .xlsx/.docx/.pptx. |
| 160 | Grafik, 3D, Audio, Video | GESPERRT | Auf kostenloser Infrastruktur nicht zuverlässig herstellbar und prüfbar. |
| 161 | Kundendateien und Zugänge | **TEILWEISE** | Anfrage nur beim Kunden des Auftrags, sicherer Upload im Portal (Format, Magic Bytes, keine ausführbaren Dateien/Makros/Skripte/Zugangsdaten), Rechte-Pflicht, befristete widerrufbare Freigabe, Mandantentrennung, Versionen, Produktion pausiert bei fehlender Datei. Pflichttests PR-161-01…08 in `tests/integration/client-assets.test.ts`. **Offen:** vollständiger Virenscanner, E-Mail-Hinweis an den Kunden, Nutzung der Dateien in den Generatoren. |
| 162 | Angebote für Freelancer-Aufträge | GEPLANT | Nur mit Plattformkonto des Eigentümers und erlaubter Schnittstelle. |
| 163 | Abgestimmte Fachteams | GESPERRT | Autonome KI-Rollen brauchen eine kostenpflichtige KI-API (Eigentümer-Entscheidung L11). |
| 164 | Abnahme durch den Kunden | **TEILWEISE** | Admin-Vorschau, Kundenportal mit Besitzprüfung, Änderungswunsch als Zusatzauftrag. **Offen:** Abnahmesitzung vor der Übergabe. |
| 165 | Übergabe und Rechte | **TEILWEISE** | Lieferung erst nach Zahlung und QA, Prüfsumme, Download mit Ablaufzeit, Bankbeleg-Pflicht. **Offen:** Installer-Nachweis und Rechteübertragung als Dokument. |

## Werkzeug- und Kostenmatrix (geprüft auf diesem Rechner, 13.11.2026)

| Zielplattform | Werkzeug vorhanden? | Kosten | Test möglich? | Stand |
|---|---|---|---|---|
| Windows (.exe + Installer) | **Nein.** Nur die .NET-Laufzeit ist installiert, ohne SDK; kein Rust, kein Installer-Werkzeug. Kostenlos installierbar: Rust oder .NET SDK, dazu Inno Setup oder WiX. | 0 € für den Build. Code-Signatur kostet; ohne Signatur warnt SmartScreen, und das Programm wird als „unsigniert“ gekennzeichnet. | Ja, echte Installation auf diesem Windows 11 | P3, nach Installation der kostenlosen Werkzeuge |
| Linux (.deb/AppImage) | WSL ist vorhanden, aber ohne Distribution | 0 € (WSL oder GitHub Actions) | Ja, nur je benannter Distribution | später |
| macOS (.app/.dmg) | Nein | Mac-Hardware oder Build-Dienst plus Apple-Entwicklerkonto (99 $/Jahr) | Nein | `COST_APPROVAL_REQUIRED` |
| Android (APK) | Nein | Debug-Build 0 €, Play Store einmalig 25 $ | Emulator kostenlos | Freigabe nötig |
| iOS | Nein | Mac und Apple-Konto | Nein | `COST_APPROVAL_REQUIRED` |
| Excel/Word/PowerPoint | Offene Formate (OOXML) ohne kostenpflichtige Software erzeugbar; LibreOffice zur Gegenprüfung nicht installiert, aber kostenlos | 0 € | Ja (Datei-/Formelprüfung) | P3 |
| Grafik/3D/Audio/Video | – | Renderdienste kosten | unzuverlässig | gesperrt |

**Sprachwahl für P3 (Windows-Kleinprogramm):** Rust ist der Hauptkandidat:
- Es entsteht eine einzelne ausführbare Datei ohne Laufzeit-Installation.
- Der Speicherbedarf ist gering, und Rust bietet hohe Speichersicherheit.
- Für die Datenhaltung kommt SQLite eingebettet dazu.

Die Alternative ist .NET (WinForms/WPF). Damit geht die Oberfläche schneller, es braucht aber eine Laufzeit oder ein großes Self-Contained-Paket.

Entschieden wird beim Start von P3, nach Installation der kostenlosen Werkzeuge. Noch ist kein Rust-Code geschrieben.

## Reihenfolge (Anlage K2)

| Stufe | Inhalt | Stand |
|---|---|---|
| P0 | Repo-Audit, Registry 157, Spezifikation mit Prüfsummen, ehrliche Status | **erledigt** |
| P1a | 156 Auftragsanforderung (Schema, Rückfragen, Konflikte, Versionen, Bestätigung, Admin, Website-Anbindung) | **erledigt** (Teil: ohne KI-Sprach-/Dokumentanalyse) |
| P1b | 161 sicherer Upload und Zugriffsrechte im Kundenportal | **erledigt** (Teil: ohne vollständigen Virenscanner) |
| P2 | 162 Freelancer-Angebote mit Plattform-Gate (Plattformkonten des Eigentümers nötig) | wartet auf Konten |
| P3 | 157/158/159: ein installierbares Windows-Kleinprogramm mit Fachlogik und eine geprüfte .xlsx | wartet auf Installation kostenloser Werkzeuge |
| P4 | 160/163 nur mit verfügbaren Ressourcen bzw. Kostenfreigabe | gesperrt |
| P5 | 164/165: Abnahmesitzung vor Übergabe, Rechteübertragung, Installer-Nachweis | nach P3 |
| P6 | Produktionsbetrieb mit echter Zahlung | erst nach LA-01…12 und Stripe LIVE |

## Nicht ohne den Eigentümer

- Kostenpflichtige Werkzeuge, Signaturen, Entwicklerkonten und KI-API.
- Plattformkonten für Freelancer-Börsen.
- LA-Freigaben, Stripe LIVE und Produktfreigaben mit Preis.

Weitere geforderte Dokumente (`FREELANCER_ACQUISITION_POLICY.md`, `CROSS_PLATFORM_BUILD_MATRIX.md`, `OFFICE_CREATIVE_QA.md`, `CLIENT_ASSET_ACCESS.md`, `AGENT_COORDINATION.md`, `CUSTOMER_ACCEPTANCE_AND_RELEASE.md`) entstehen mit der jeweiligen Stufe aus echtem Code, nicht vorab als leere Hülle. Das Schema zu 156 steht in [UNIVERSAL_ASSIGNMENT_SCHEMA.md](UNIVERSAL_ASSIGNMENT_SCHEMA.md).
