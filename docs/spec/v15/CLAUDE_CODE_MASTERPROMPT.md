# CLAUDE CODE – VERBINDLICHER MASTERAUFTRAG

## PROJEKT: INFINITY EARN 15.0 – AUTONOMOUS BUSINESS / PREMIUM EDITION

Du bist leitender Softwarearchitekt, Produktdesigner, Qualitätssicherer und Entwicklungskoordinator. Erstelle **echte Software** für das eigenständige Projekt **INFINITY EARN**. Verwende alle Dateien dieses Pakets als Spezifikation. Dieses Projekt hat **keinerlei technische oder organisatorische Abhängigkeit** von Trendo OS, Vecom Design oder Studio Breve.

**Exakt 127 vom Eigentümer bestätigte Funktionen** sind umzusetzen: 001–047, 050–109, 111–130. **Abgelehnt und als neue Spezialmodule verboten:** 048, 049, 110. `01_SPEC/REGISTRY_127.json` ist die maschinenlesbare Entscheidungsquelle; `01_SPEC/ALLE_127_FUNKTIONEN.md` beschreibt den Geschäftszweck jeder Funktion. Module 21–40 zusätzlich anhand `01_SPEC/MODULE_21_40_DETAIL.md` spezifizieren.

## OBERSTE PRIORITÄT – PREMIUM DESIGN, KEINE KI-OPTIK

Lies **zuerst** `03_DESIGN/PREMIUM_UI_DESIGN_SYSTEM.md`, bevor du UI-Code produzierst.

Das Design muss **sehr schön, zeitgemäß, hochwertig und leicht verständlich** sein. Orientiere dich eher an der Ruhe einer Premium-Banking-App und einem durchdachten modernen Unternehmens-Dashboard als an typischen KI-Oberflächen. Keine Roboter, kein Cyberpunk, keine Neon-Effekte, keine glühenden Gehirne, keine überladenen Chats, keine 127 Schaltflächen für 127 Module. Elegant, aufgeräumt, diskret, klare Informationen, warme helle Oberfläche, moderne Typografie, exzellentes Responsive Design.

Die 127 Funktionen werden in **sechs leicht verständlichen Bereichen** gebündelt: `Übersicht`, `Kunden`, `Aufträge`, `Produkte`, `Finanzen`, `Berichte`. Auf der Startseite stehen **tatsächlich bezahlter Umsatz**, **Auszahlung unterwegs**, **auf Bank bestätigt**, **offene Ausnahmen** und **kurzer verständlicher Status** im Vordergrund. Jeder Vorgang muss in normalem Deutsch erklärt sein. Für das Expertenniveau ein optionales Detailmenü, nicht die Standardansicht.

**Die mitgelieferte `03_DESIGN/DEMO_DASHBOARD.html` ist nur eine visuelle Orientierung (DEMO). Entwickle daraus ein echtes, gut zugängliches Produkt mit wiederverwendbarem Designsystem und besserer UX, nicht nur eine Kopie.**

UI-Abnahme ist genauso verbindlich wie funktionale Abnahme: Desktop/Mobile-Screenshots, Sichtprüfung, Barrierefreiheit, keine irreführenden Finanzangaben, nachvollziehbare Nutzerwege. Liefere keine fertige Version ab, solange UI/UX chaotisch, typisch „AI-generated“ oder schwer zu verstehen ist.

## GESCHÄFTSZIEL

Eine KI-gestützte, möglichst eigenständige Unternehmensorganisation entwickelt rechtmäßige, bezahlbare **digitale Produkte und Dienstleistungen aus verschiedenen Bereichen**. Sie erkennt reale Nachfrage, sucht Kunden über erlaubte Kanäle, kalkuliert und verhandelt Angebote, nimmt verifizierte Zahlungen an, produziert mit geeigneten Werkzeugen, prüft Qualität und Nutzungsrechte, liefert aus, erzeugt erforderliche Rechnungsvorgänge, reconciliert Zahlungen und verifiziert tatsächliche Bankauszahlungen. Nutzer soll möglichst wenig Tagesarbeit haben und nur relevante Ausnahmeentscheidungen sehen.

Wichtige Unterscheidung:
- **Customer-first bei Individualaufträgen:** echte Nachfrage → Auftrag → Zahlungssicherung → Produktion.
- **Produktgeschäft:** Nachfrage belegen → schlanken Piloten → echten Kauf messen → mehrfach verkaufbares Produkt ausbauen.
- **Abonnement und APIs:** transparente regelmäßige/nutzungsbasierte Zahlungen nur bei dauerhaft funktionsfähiger Infrastruktur.

**Keine Garantie für Käufer, Gewinn, Erfolg oder Bankgutschriften.**

## HARTE, NICHT ÜBERSCHREIBBARE GRENZEN

1. Zusätzliche monatliche Software-Fixkosten standardmäßig **0 €**. Keine bezahlten APIs, Hosting-Upgrades, KI-Abos, Tool-Lizenzen oder automatischen Gebühren ohne ausdrückliche Freigabe.
2. Verwende die regulären, offiziell nutzbaren Möglichkeiten des vorhandenen Claude-Abos. Behaupte niemals, ein normales Abo sei eine unbegrenzte, kostenlose, serverseitig verfügbare API. Bei Quoten: sichere Warteschlange/Pause.
3. Keine Live-Käufe, Auszahlungen, Werbung oder Kundennachrichten vor erfolgreicher rechtlicher/steuerlicher/technischer Konfiguration und eindeutigen Owner-Freigaben.
4. KI-Entscheidungen sind Vorschläge; deterministische Regeln führen externe Nebenwirkungen nur nach vollständiger Prüfung aus.
5. Keine illegalen Akquise-Bots, unerwünschten elektronischen Massennachrichten, fingierten Kunden, Fake-Rechnungen, Markenpiraterie oder unerlaubte Verarbeitung von Kundendaten.
6. Keine beliebigen Banküberweisungen durch Agenten; Auszahlungen nur über verifizierten Anbieter auf rechtmäßig hinterlegtes Konto.
7. Jeder LIVE-Finanzstatus muss anhand unabhängiger Belege nachweisbar sein. Demo/TEST/LIVE strikt getrennt.
8. Keine automatischen rechtlich regulierten Tätigkeiten ohne erforderliche Fachfreigaben. Steuer-, Vertrags- und Rechtskontexte müssen dokumentiert sein.
9. Grundlegende Informationssicherheit, Zugriffsschutz und gesetzliche Aufbewahrung bleiben Pflicht; das ist **keine** Wiedereinführung der ausdrücklich abgelehnten zusätzlichen Module 48 und 49.
10. Bei Inkompatibilität, Ressourcenmangel, Providerstörung oder unklarem Recht: transparent `BLOCKED`/`REVIEW`, niemals Erfolg erfinden.

## TECHNISCHE SPEZIFIKATION

Implementiere anhand der Dateien:
- `01_SPEC/REGISTRY_127.json` – Module, genehmigte Ziele, Gates.
- `01_SPEC/ALLE_127_FUNKTIONEN.md` – alle 127 Einzelfunktionen.
- `01_SPEC/MODULE_21_40_DETAIL.md` – detaillierte Alt-Spezifikation.
- `02_ARCHITEKTUR/SYSTEM_DESIGN.md` – Zustandssystem, Datendomänen, Zahlungs-/Rechnungspfad, Audits, Idempotenz, Deployment.
- `02_ARCHITEKTUR/KOSTEN_RECHT_REALITAET.md` – Kosten-/Rechtsprüfung.
- `03_DESIGN/PREMIUM_UI_DESIGN_SYSTEM.md` – verbindliche Ästhetik und Bedienung.
- `04_TESTS/ABNAHME_381_MODULTESTS.md`, `04_TESTS/END_TO_END_TESTPLAN.md` – Abnahmetests.
- `06_QUELLEN_ALT/` – bisher bestätigte Tests (200 weitere Spezifikationen).
- `05_DEMO/` – ausführbares **Referenzbeispiel** für Testtransaktionen; nicht blind als Produktionsbackend übernehmen.

Jedes Modul implementiert einen typisierten Vertrag, eine dokumentierte Berechtigungs-/Kostenprüfung, Versionierung, Daten- und Dateinachweise, eine wohldefinierte Fehlerbehandlung und automatisierte Unit-/Integrationstests. Bewahre Module in einer gemeinsamen Registry, aber halte Geschäftslogik getrennt und für spätere Erweiterungen kompatibel.

### Verbindliche erste Implementierungsschritte

**M0 – Design und Fundament:**
- eigenständiges Monorepo erstellen; keine Nutzung von Dateien/Assets anderer Nutzerprojekte;
- alle 127 Genehmigungen als read-only Registry importieren und Rejected-IDs prüfen;
- Design-Tokens, responsive Navigation, sechs verständliche Bereiche, professionelles Dashboard, Empty States;
- Test/LIVE-Trennung, Kostengate und technische Statusberichte implementieren;
- echten Screenshot-Vergleich Desktop und Mobile durchführen, Zugänglichkeit prüfen;
- bei offenen Fragen nachweislich sichere Defaults wählen, mit gezielten TODOs statt Täuschung.

**M1 – Echter Transaktionskern im Testmodus:**
- Kundenanfrage → Angebot → Annahme → signiert verifizierter Payment-Test-Event → Produktionsjob → QA → sichere Auslieferung → Rechnungsdatensatz → Settlement → Auszahlungsstatus → verifizierter Bank-Test-Beleg;
- doppelte Webhooks, Ausfälle und Refunds testen; Rechnungs-/Geldstatus niemals beschönigen;
- testgetriebene Umsetzung mit stabilen IDs, schemas, Eventlog und Fehlerfällen.

**M2 – Produktherstellung mit Beweisen:**
- erst ein begrenztes digitales Produkt (z. B. kleiner B2B-Kalkulator), das tatsächlich automatisiert erstellbar, testbar und lieferbar ist;
- danach weitere Produktfähigkeiten nach Beweis der technischen Herstellbarkeit schrittweise freischalten;
- bei Video/3D/Audio fehlende Rechenleistung ehrlich dokumentieren statt „fertig“ zu behaupten.

**M3 – Reale Geschäftsbereitschaft:**
- Rechts-/Steuerstatus des tatsächlichen Landes, Unternehmensdaten, KYC, Zahlungsanbieter, Bankverknüpfung und Rechnungswege **vor** jeder Aktivierung prüfen;
- echte Umsatz-/Bankprüfung erst nach ausdrücklich erlaubtem Live-Pilot durchführen;
- bei fehlendem echten Käufer transparent „Noch kein Verkauf“ melden.

**M4 – Akquise und Produkte skalieren:**
- zuerst erlaubte Inbound-, Ausschreibungs- und Marktkanäle;
- nur nach realer Profitabilität auf weitere Geschäftsmodelle und die restlichen bestätigten Module erweitern.

## ERFOLGSNACHWEIS / NICHT ERLAUBT

**Erforderlich:** Sourcecode, Tests, dokumentierte Architektur, aktualisierte Module, signierte Event-Nachweise, Screenshots, verifizierbare Kostenübersicht, verständliches Dashboard.

**Nicht erlaubt:** Ein UI-Mockup oder eine KI-Simulation als live laufende Geldmaschine ausgeben; Demo-Bankbeträge als echte Auszahlung ausweisen; unkontrollierte „Godmode“-Autonomie behaupten; zusätzliche monatliche Kosten verursachen.

## BERICHTSFORMAT NACH JEDEM MEILENSTEIN

Erstelle `PROGRESS.md` mit:
- Implementiert (Dateien und Prüfungen)
- Automatisch getestet (Testbefehl + Resultat)
- Optisch geprüft (Screenshots Desktop/Mobile)
- Noch Simulation/Mockup (klar markieren)
- Betriebsrelevante Blocker (Recht, API, Konto, Quellen)
- Echte oder mögliche Kosten
- Was als Nächstes real umgesetzt wird

**Starte ohne Rückfrage mit M0; baue die ruhige, Premium-Oberfläche als Erstes und dokumentiere jeden tatsächlich nachgewiesenen Schritt.**
