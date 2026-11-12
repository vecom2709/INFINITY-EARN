# INFINITY EARN 15.0 – PREMIUM UI / UX DESIGN SYSTEM

## VERBINDLICH – Design ist Teil der Produktabnahme

Die Nutzeroberfläche darf **nicht aussehen wie ein KI-Tool, ein Science-Fiction-Cockpit oder ein Entwickler-Dashboard**. Sie soll den Qualitätsstandard einer modernen Finanz-, Banking- oder Premium-Business-Software erreichen: menschlich, ruhig, freundlich, extrem gut verständlich, übersichtlich und vertrauenswürdig. **127 Module arbeiten im Hintergrund; der Benutzer soll keine 127 Module bedienen müssen.**

Der Eigentümer möchte **nur zuschauen** und in Sekunden verstehen: *Was ist heute passiert? Was ist tatsächlich verdient? Was ist aufs Bankkonto eingegangen? Gibt es etwas Wichtiges zu erledigen?*

### Designziel in einem Satz

**Die Ruhe einer hochwertigen Banking-App, die Klarheit einer modernen Buchhaltungssoftware und die Leichtigkeit einer guten Smartphone-App – ohne sichtbare KI-Spielereien.**

## 1. Verbotene Gestaltungsmuster

- Keine Roboterköpfe, Gehirngrafiken, Sterne/Glitzer, Neon-Glow, Matrix-/Cyber-Hintergründe, künstliche 3D-Hologramme oder animierte KI-Avatare.
- Keine generischen „AI Generated“-Illustrationen als primäre Markenidentität; keine überladenen Gradients.
- Keine riesigen Datenwände mit 100 KPIs, keine irrelevanten Fachbegriffe, keine Endlos-Chats als Hauptnavigation.
- Keine Fake-Reviews, Fake-Logos von Kunden, Fake-Umsätze, unbelegte „100 % automatisch“-Siegel.
- Keine rote Warnfarbe zur Dekoration; Warnfarben nur bei realen, wichtigen Statusmeldungen.
- Keine vorgetäuschte Bank- oder Finanzanbindung; „DEMO“ muss jederzeit eindeutig sichtbar sein.

## 2. Visuelle Identität

**Stil:** Elegant, editorial, hochwertiges SaaS, präzise Zahlen, viel Weißraum, sanfte Oberflächen, feine Linien, diskrete Schatten, professionelle Icons.

**Farbsystem (Tokens):**

| Token | Wert | Einsatz |
|---|---|---|
| `--canvas` | `#F7F8F5` | Leicht warmes Seitenweiß |
| `--surface` | `#FFFFFF` | Karten, Tabellen, Panels |
| `--ink` | `#172826` | Primärtext, seriös und sehr gut lesbar |
| `--muted` | `#6C7773` | Sekundärinformationen |
| `--accent` | `#126D59` | Primäre Aktion, ruhiges tiefes Grün |
| `--accent-soft` | `#E4F1EA` | Erfolgreicher Status, aktive Navigation |
| `--border` | `#E6EBE7` | Feine Trennlinien |
| `--warning` | `#9D6100` | Echte Prüfausnahmen |
| `--danger` | `#B44343` | Echte Fehler, Zahlungssperren |

**Typografie:** Systemfont-Stack `Inter` (falls lokal vorhanden), alternativ `Arial`, `system-ui`. Keine kostenpflichtigen Fonts, keine externen CDN-Abhängigkeiten. Fließtext mindestens 15–16 px; Primärzahlen 28–40 px; kleine Labels mindestens 12–13 px; Tabellen `font-variant-numeric: tabular-nums`.

**Radien:** Hauptkarten 16–20 px, Inputs/Buttons 10–12 px, maximal 2 dezente Schattenebenen. **Abstände:** 4, 8, 12, 16, 24, 32 px. **Touch-Ziele:** mindestens 44 × 44 CSS-Pixel. **Maximale Content-Breite:** etwa 1440 px.

## 3. Informationsarchitektur – nur sechs sichtbare Bereiche

1. **Übersicht** – Heute passiert, tatsächlich bezahlt, auf Konto angekommen, offene Ausnahmen.
2. **Kunden** – Eingehende Anfragen, aktive Käufer, Nachrichtenverlauf, Kontaktberechtigung.
3. **Aufträge** – Gefunden, angeboten, bezahlt, in Arbeit, geliefert, abgeschlossen.
4. **Produkte** – Aktive Angebote, eigene Produkte, Varianten, Lizenzen, Qualität.
5. **Finanzen** – Umsätze, Gebühren, Rechnungen, Rückerstattungen, Auszahlungen, Bankabgleich.
6. **Berichte** – Gewinnübersicht, Belege, Export für Steuerberatung, Entscheidungen der Firma.

**Einstellungen** sind hinter einem unaufdringlichen Profilmenü erreichbar: Kontoverbindungen, Stop-Schalter, erlaubte Geschäftsbereiche, Budgetgrenzen, Integrationen, Datenschutz. Ein komplexer Expertenbereich ist ausschließlich optional.

### Übersetzung technischer Sprache in verständliche Begriffe

| Interner Name | Sichtbarer Benutzertext |
|---|---|
| `AI CEO` | „Dein Unternehmen arbeitet“ |
| `Opportunity Pipeline` | „Neue Kundenanfragen“ |
| `Production Queue` | „In Arbeit“ |
| `Revenue Attribution` | „Woher kamen die Käufer?“ |
| `Webhook Reconciliation` | „Zahlungen abgeglichen“ |
| `Manual Review` | „Hier wird deine Entscheidung benötigt“ |
| `BLOCKED_CAPACITY` | „Vorübergehend pausiert: kein kostenloses Kontingent frei“ |
| `PAYOUT_PENDING` | „Auszahlung unterwegs“ |
| `BANK_VERIFIED` | „Auf deinem Bankkonto eingegangen“ |

## 4. Übersicht – die wichtigste Seite

**Desktop (Skizze):**

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ infinity earn                                   [Testbetrieb]      [Profil]  │
├────────────────────┬─────────────────────────────────────────────────────────┤
│ Übersicht          │ Guten Morgen. Hier ist dein Unternehmensüberblick.     │
│ Kunden             │                                                         │
│ Aufträge           │ [Umsatz bezahlt] [Auszahlung unterwegs] [Auf Bank]      │
│ Produkte           │                                                         │
│ Finanzen           │ Was heute passiert ist              Braucht dein Blick   │
│ Berichte           │ • Anfrage eingegangen              Keine offenen Punkte│
│                    │ • Angebot vorbereitet                                 │
│                    │                                                         │
│                    │ Letzte Vorgänge                                         │
│                    │ Datum   Auftrag       Betrag          Status            │
└────────────────────┴─────────────────────────────────────────────────────────┘
```

**Mobile:** Nur die wichtigsten 3 Kennzahlen sichtbar, Navigation als übersichtliches Menü oder 4 Haupttabs plus „Mehr“. Tabellen werden Karten, niemals horizontal unlesbar. Kernaktionen mit einem Daumen erreichbar. Kein Pop-up-Zwang.

## 5. Finanz-Anzeige – Wahrheit statt schöner Zahlen

Unbedingt 5 getrennte Werte vorsehen:

- **Bestellungen bezahlt:** bestätigte Kundenzahlungen, **nicht** Gewinn.
- **Beim Zahlungsanbieter:** noch nicht auf Bank überwiesene verfügbare/gebundene Mittel.
- **Auszahlung unterwegs:** beim Anbieter ausgelöst, aber noch nicht auf Bank verbucht.
- **Auf Bank eingegangen:** nur nach vertrauenswürdiger Bankabstimmung.
- **Geschätzte Rücklagen / verfügbar:** konservative Kalkulation; keine verbindliche Steuerberechnung ohne geprüften Steuerkontext.

Bei fehlender Bankanbindung statt „Bankgutschrift“ anzeigen: **„Noch nicht verbunden – kein Bankeingang verifizierbar“**. Bei fehlendem Umsatz: „Noch keine Verkäufe“; **niemals fiktive 1.440 €** im Live-Dashboard.

## 6. Interaktionsdesign

- Jede Hauptaktion erklärt in einem Satz, **was** passieren wird und **ob** dadurch Kosten oder Kundennachrichten entstehen.
- Einfache, erkennbare Aktionen: „Angebot ansehen“, „Beleg öffnen“, „Zahlung prüfen“, „Alle Tätigkeiten pausieren“.
- Fortschritte als sachliche Statusphasen: „Anfrage → Angebot → Bezahlt → Erstellung → Geprüft → Geliefert → Auszahlung“.
- Berichte in normaler Sprache; jeder Status hat `Was bedeutet das?` mit kurzer Erklärung.
- **Autopilot** kennt nur `Testbetrieb`, `Freigegeben`, `Pausiert`, `Prüfung erforderlich`. Keine „Godmode“- oder Technik-Labels in der Oberfläche.
- Keine versteckten Folgen durch Aktionen; keine automatische kostenpflichtige Freischaltung.
- Profil und persönliche Daten nie ohne Grund wiederholt in großen Karten anzeigen.
- Eigene KI-Maßnahmen sind im Hintergrund dokumentiert; nur bei Bedarf aufklappbar unter „Aktivitäten“.

## 7. Benutzerführung beim ersten Start

1. Eine einzige Willkommensseite erklärt in zwei Sätzen das Produkt.
2. Prüfen, ob für Livegeschäfte Unternehmensregistrierung, Land, Zahlungsdienst, Identität, rechtliche Informationen und Steuerparameter vorliegen.
3. Bank-/Zahlungsanbieter nur über offizielle sichere Autorisierung verbinden; keine Passwörter im Programm erfragen.
4. Die KI-Autonomie und ein **0-€-Limit für zusätzliche Software-Fixkosten** klar anzeigen.
5. Im Testbetrieb vorführen, wie ein Kundenauftrag bis zum Bankabgleich aussehen würde, mit dauerhaft sichtbarem Demo-Label.
6. LIVE nur freigeben, wenn alle echten gesetzlichen, Zahlungs- und Sicherheitsvoraussetzungen dokumentiert erfüllt sind.

**Keine Kontoeröffnung, KYC oder Steuerregistrierung durch bloßes KI-Vortäuschen erledigen.**

## 8. Barrierefreiheit und Benutzerfreundlichkeit

- WCAG 2.2 AA soweit anwendbar; Farbkontrast regulärer Text mindestens 4,5:1 und große Texte mindestens 3:1.
- Tastaturnavigation, sichtbarer Fokus, sinnvolle Screenreader-Labels, kein ausschließlich farbcodierter Status.
- Betrieb ohne Animationen; `prefers-reduced-motion` respektieren.
- Fehlermeldungen erklären Ursache und nächste mögliche Aktion in einfacher Sprache.
- UX-Test auf kleinen Android-Geräten, iPhone, Tablet und Desktop; mindestens 320 px Breite ohne abgeschnittene Kernaktionen.
- Maximal 6 zentrale Navigationseinträge; keine dreistufigen Untermenüs für normale Nutzung.

## 9. Verbindliche Design-Abnahmetests

| Test | Muss erfüllt sein |
|---|---|
| UI-01 | Neue Nutzer erkennen innerhalb von 10 Sekunden „Auf Bank angekommen“ versus „Auszahlung unterwegs“. |
| UI-02 | Ein unverbundener Zahlungsanbieter erzeugt ehrlich einen leeren Zustand, keinen Musterumsatz. |
| UI-03 | Test- und Live-Daten sind auch visuell und per Screenreader unterscheidbar. |
| UI-04 | Alle normalen Tätigkeiten sind über die sechs Navigationsbereiche erreichbar. |
| UI-05 | Auf dem Smartphone bleiben Kernzahlen, Status und das Menü ohne horizontales Scrollen nutzbar. |
| UI-06 | Kontrast, Tastaturfokus, Textskalierung und Reduced Motion bestehen die Prüfungen. |
| UI-07 | Kein KI-, Roboter-, Neon-, Sci-Fi- oder Glitzer-Designmuster vorhanden. |
| UI-08 | Ein Auftrag ist in maximal drei Interaktionen bis zum Lieferstatus auffindbar. |
| UI-09 | Ein Kunde findet seine Rechnung ohne Chat-Eingabe. |
| UI-10 | Kostenpflichtige Vorgänge sind ohne Freigabe technisch und visuell gesperrt. |
| UI-11 | Kein allgemeiner Fehler wird als vermeintlicher „Erfolg“ oder bereits erfolgte Auszahlung angezeigt. |
| UI-12 | Design besteht realen Screenshotvergleich auf Desktop und Mobile. |

## 10. Technische UI-Umsetzung

- Ein responsives Frontend in React/TypeScript oder gleichwertiger freier Technologie, mit hochwertigem, einheitlichem Komponentensystem.
- Icon-Set einheitlich (z. B. Open-Source Lucide unter passender Lizenz), keine Material-/Pixel-Mischung.
- Tokens für Farbe, Typografie, Spacing, Schatten, Radien, Zustände und responsive Breakpoints zentral definieren.
- Keine Pflichtabhängigkeit von bezahlten UI-Kits, Fonts oder Design-Abos.
- Eigene Screenshots gegen die mitgelieferte `DEMO_DASHBOARD.html` und die PNG-Vorschauen halten; die Demo ist die **visuelle Richtung**, kein fertig integriertes Backend.
- Storybook oder vergleichbare freie Komponentenansicht optional; Playwright-Screenshot-Tests und Accessibility-Checks bevorzugen.

**Stop-Gate:** Ein technisch funktionierendes Produkt mit unübersichtlicher oder typischer KI-Oberfläche darf nicht als „fertig“ abgenommen werden. UX ist eine gleichwertige Produktanforderung.
