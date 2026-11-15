# FABLE 5.2 – Prüfung der Produktfabrik (17.0)

Stand 16.11.2026. Maßstab: Als lieferbar gilt nur, was tatsächlich hergestellt, automatisch abgenommen und in einem Test bis zur Lieferung gebracht wurde.

## Was wirklich hergestellt werden kann

| Produktart | Herstellung | Abnahmeprüfungen | Stand | Grenze |
|---|---|---|---|---|
| Kalkulation CSV | Worker, sofort | Struktur, nachgerechnete Summen, Zeichensatz, Formelschutz, Prüfsumme | VERIFIED | reine Wertetabelle, **keine Formeln** |
| Kalkulation PDF | Worker, sofort | PDF-Struktur, Summen, Gestaltung, Prüfsumme | VERIFIED | — |
| Kalkulation Paket (CSV + PDF) | Worker, sofort | beide oben | VERIFIED | — |
| Mini-Warenwirtschaft (Browser-Programm) | Worker, sofort | Programmintegrität, Branding, kein Netzwerk, Fachselbsttest, Bedienelemente, Anleitung, LIESMICH | VERIFIED (nicht freigegeben) | Einzelplatz, kein E-Rechnungsversand |
| Lager & Rechnung für Windows | GitHub-Windows-Server | Bauprotokoll, 24 Fachtests, echtes Windows-Programm, Branding, Anleitung, LIESMICH | VERIFIED (nicht freigegeben) | festes Programm, nur Firma/Farbe/Sprache/Land je Kunde; unsigniert; Windows 10 ungeprüft; FatturaPA-Annahme im SdI ungeprüft |
| KI-Texte | Claude über GitHub | Struktur, Länge, Sprache, Briefing, Werbeversprechen, Sicherheit, Darstellung | IMPLEMENTED – **echter KI-Lauf nie ausgeführt** | Token fehlt |

## Was beauftragt, aber NICHT herstellbar ist

| Gewünscht (Auftrag 17.0, Abschnitt 6–8) | Stand | Grund |
|---|---|---|
| Excel (XLSX) mit Formeln, Validierung, Diagrammen | **nicht vorhanden** | nur CSV; XLSX-Erzeugung ist ohne Zusatzkosten machbar (ZIP + XML), aber nicht gebaut |
| Word (DOCX), PowerPoint (PPTX) | nicht vorhanden | keine Erzeugung gebaut |
| Individuelle Software nach Kundenwunsch (ERP, CRM, Portal, API) | **BLOCKED** | bräuchte KI-Programmierung mit isolierter Test- und Ausführungsumgebung; nicht vorhanden |
| Individuelle Websites, Shops, Webdesign | BLOCKED | wie oben |
| macOS-, Linux-Desktop-Programme | BLOCKED | kein Build- und Testweg eingerichtet (macOS: GitHub-Runner wären für öffentliche Repos kostenlos, aber unsigniert und ungetestet) |
| Android, iOS | BLOCKED | Apple-Entwicklerkonto kostenpflichtig; Android-Build nicht eingerichtet |
| Grafik, 3D, Animation, Audio, Video | BLOCKED | keine lizenzierte Engine, keine Abnahmeprüfung |
| Übersetzungen | nicht vorhanden | wäre als KI-Produkt nach dem Muster der KI-Texte machbar |

**Folgerung:** Der Anspruch „sämtliche technisch machbaren digitalen Aufträge“ ist nicht erfüllt. Hergestellt werden sechs feste Produktarten. Der Router (`services/ai-orchestrator/src/director.ts`) sagt für alles andere ehrlich „nicht machbar“ – es wird nichts zugesagt, was nicht hergestellt werden kann.

## Prüfung „kein Formular statt Programm“
- Mini-Warenwirtschaft: durchgängiger Ablauf Angebot → Auftrag → Teillieferung → Rechnung → Zahlung → Gutschrift mit echten gespeicherten Daten (`tests/products/mini-ww/domain.test.ts`, `ui.test.ts`).
- Windows-Programm: Artikel → Lager → Kunden → Rechnung mit Pflichtangaben → FatturaPA gegen amtliches Schema; echte Installation, Update, Deinstallation (`tests/products/win-lager/install.test.ts`).
- Beide sind echte Programme mit Fachlogik, keine Eingabemasken.

## Verkaufsfreigaben
Keine der Fachsoftware-Produktarten ist zum Verkauf freigegeben (Festpreis und Freigabe durch den Eigentümer fehlen). Für `win-lager` und `ai-texte` fehlt zudem der Freigabe-Weg im Admin (die vorhandene Freigabe erzeugt ein Musterpaket im Worker, was bei extern gebauten Produkten nicht geht).
