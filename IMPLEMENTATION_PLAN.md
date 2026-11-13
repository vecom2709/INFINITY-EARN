# INFINITY EARN 15.0 – Umsetzungsplan zum konsolidierten Gesamtprompt

Stand: 2026-11-13 · Grundlage: `INFINITY_EARN_15_GESAMTPROMPT_ALLES_IN_EINEM.md` (Stand 13.11.2026), abgeglichen mit dem vorhandenen Code. Details zu jedem Baustein stehen in [PROGRESS.md](PROGRESS.md).

## Was übereinstimmt (bereits gebaut und getestet)

| Gesamtprompt | Stand im Repository |
|---|---|
| §0 127 Funktionen 1–47, 50–109, 111–130; 48/49/110 ausgeschlossen | Registry deckungsgleich (`packages/registry`), Test erzwingt Nachweis je Status |
| §0 0 € Fixkosten, TEST/DEMO/LIVE getrennt, nichts erfunden | Policy-Engine, Live technisch gesperrt, Testgeld nie als Umsatz |
| §2 zwei Kundenzugänge, ein Prozess | Website/Berater und TED-Ausschreibungen laufen in dieselbe Lead → Angebot → Auftrag → Zahlung → Lieferung → Beleg → Abgleich-Kette |
| §3 Postausgang, Einwilligung, keine Kaltakquise | Postausgang mit Sperrliste, Abmeldelink, Mengenlimit; Versand bis Kanal + LA-02 aus |
| §4 Abnahmestopp gegen Attrappen | Premium-Produktstandard: Akte je Produkt, Abnahme-Gate, „nicht lieferfähig“ mit Erstattungsvorschlag |
| §6 Landingpage `/`, Admin `/admin` | vorhanden; Kundenportal unter `/portal` |
| §7 Luxury Turquoise + Storyscrolling | umgesetzt, Kontraste AA geprüft, reduzierte Bewegung, DE/IT/EN |
| §8 Stripe | Checkout (Sandbox), signierte Webhooks, Idempotenz, Erstattungen, Abgleich, 5 Geldstufen, Bankbeleg-Pflicht; Live = gesperrt |
| §10 Zustandsmaschine bis `BANK_CREDIT_VERIFIED` | vorhanden (eigene Zustandsnamen, gleiche Reihenfolge) |

## Lücken zum Gesamtprompt

| # | Anforderung | Machbar ohne Kosten/Konten? | Plan |
|---|---|---|---|
| L1 | **§5 Admin Live-Vorschau** aller Kundenprodukte (Galerie, Version, Prüfsumme, Tests, Lieferhistorie, echter Viewer) | Ja, für die heutigen Produkte: Tabelle als Tabelle, PDF im Browser-Viewer, ZIP-Inhalt | als Nächstes bauen |
| L2 | **§6 `/konto`** als Kundenportal-Pfad | Ja | Alias `/konto` → Portal |
| L3 | **§6/§10 MFA für Admin** | Ja (TOTP, kostenlos) | **Eigentümer-Entscheidung 13.11.2026 (nach Vorlage des Gesamtprompts bestätigt): nur Passwort.** Bleibt: scrypt, Sperre nach 5 Fehlversuchen, serverseitige Sitzungen, CSRF, Audit. Abweichung zu §6/§10 bewusst dokumentiert. |
| L4 | **§3 Kanalstatus** Website-Chat, E-Mail, WhatsApp, Plattformen je „Nicht verbunden“ | Ja (Anzeige) | Kanalübersicht im Admin |
| L5 | **§7 Landingpage** Schritt 8: Preis-/Kontakttransparenz, FAQ, Pflichtinformationen | Ja (FAQ/Preise); Impressum braucht LA-02 | ergänzen |
| L6 | **§12 Status-Vokabular** SPECIFIED/IMPLEMENTED/TESTED/LIVE_VERIFIED/BLOCKED | Ja | Abbildung der heutigen Status, `FEATURE_REGISTRY_157.json` erzeugen |
| L7 | **§13 Dokumente** DESIGN_SYSTEM, SYSTEM_ARCHITECTURE, COMMUNICATION_AND_DELIVERY, PRODUCT_FACTORY_REAL_SOFTWARE, ADMIN_LIVE_PREVIEW, TEST_MATRIX | Ja | aus dem echten Stand erzeugen |
| L8 | **§4 echte Fachsoftware** (ERP/CRM/Warenwirtschaft) als Produkt | Teilweise: braucht je Auftrag Entwicklungsarbeit; dauerhaft autonom nur mit KI-API (kostenpflichtig) | erst eine kleine, vollständig getestete Fachanwendung als Pilot (M3), keine Zusage großer ERP-Projekte |
| L9 | **§8 Stripe LIVE**, Abos, Kundenportal von Stripe | Code ja; Aktivierung nur mit KYC, Live-Schlüsseln, Freigabe | Eigentümer (LA-03/04) |
| L10 | **§3 WhatsApp Business, E-Mail-Versand, Telefonie** | Nein – Konten/Anbieter nötig | Eigentümer wählt Anbieter |
| L11 | **§9 autonome KI-Agenten rund um die Uhr** | Nein – Claude-Abo ist keine API; KI-API kostet | deterministischer Kern läuft; KI-Schicht erst mit Kostenfreigabe |

## Update 13.11.2026: Gesamtprompt mit 147 Funktionen und Freelancer-Direktive

Quelle mit Prüfsummen: `docs/spec/v15-147/`. Registry: 127 ursprüngliche (unverändert) + 20 beauftragte (131–140, 146–155); 141–145 nicht freigegeben. Export: [FEATURE_REGISTRY_157.json](FEATURE_REGISTRY_157.json).

**Stand der 20 neuen Funktionen:** 10 teilweise, jeweils mit vorhandenem, getestetem Code:
- 131 TED-Radar
- 133 Qualifizierung
- 134 Angebote
- 136 Berater und Demo
- 137 Kontaktregeln
- 146 robots/Sitemap/hreflang
- 150 Auszeichnung und Katalog
- 152 Demo
- 153 Vertrauensseite
- 154 Angebot bis Checkout

10 sind geplant: 132, 135, 138, 139, 140, 147, 148, 149, 151, 155.

**Freelancer-Direktive (B2B/B2C-Produktion):**

| Anforderung | Ohne Kosten/Konten machbar? | Plan |
|---|---|---|
| Bebilderte PDF-Bedienungsanleitung zu jeder Auslieferung | Ja | Pilot P3: echte Screenshots des gebauten Programms, Kapitel je Arbeitsablauf, als PDF ins Lieferpaket |
| Webanwendungen, ERP/Warenwirtschaft | Ja, als Pilot bewiesen (Offline-Programm) | weitere Produktarten nur mit Standard-Akte und Tests |
| Excel mit Formeln, Word/PDF/PowerPoint | Ja (offene Formate ohne kostenpflichtige Software) | je Produktart Standard-Akte + automatische Prüfung, dann freischalten |
| Windows-EXE mit Installer | Bauen ja, auf diesem Windows-Rechner testbar; **ohne Code-Signatur-Zertifikat (kostet) warnt Windows SmartScreen** | Entscheidung zum Zertifikat beim Eigentümer |
| macOS-Programme | Nein ohne Mac-Hardware oder kostenpflichtigen Mac-Build-Dienst; Signatur/Notarisierung braucht Apple-Entwicklerkonto (99 $/Jahr) | Eigentümer-Freigabe nötig |
| Linux-Programme | Bauen/Testen möglich (z. B. in kostenloser CI) | später |
| Android | Debug-Build kostenlos möglich; Play Store braucht Entwicklerkonto (einmalig 25 $) | Eigentümer-Freigabe |
| iOS | Braucht Mac + Apple-Entwicklerkonto | Eigentümer-Freigabe |
| Grafik, 3D, Audio, Video | Nicht zuverlässig auf kostenloser Infrastruktur | bleibt gesperrt bis nachgewiesen |
| Kundengewinnung auf Projektbörsen/Plattformen | Nur mit Konto und erlaubter Schnittstelle; keine Bots/Spam | Eigentümer legt Konten an; Kontakt nur über 137 |
| Universelle autonome Produktion jeder Art | Nein ohne kostenpflichtige KI-API (Claude-Abo ist keine API) | Freigabe der API-Kosten beim Eigentümer |

## Update 13.11.2026 (Abend): P4 und die zehn geplanten Funktionen

- **P4 erledigt:** Admin → Produkte → Warenwirtschaft mit interaktiver Vorschau (DE/IT/EN), Anleitung, Musterpaket und Live-Abnahmeprüfung. Verkaufsfreigabe mit Festpreis durch den Eigentümer (append-only `product_releases`, Musterpaket muss alle Prüfungen bestehen); Widerruf jederzeit. Öffentliche Produktseite `/produkte/warenwirtschaft` mit echten Screenshots, Demo `/demo/warenwirtschaft` und Bestellformular (Steuersätze IT/DE/AT, Zahlungsziel, Firmenfarbe) – bestellbar erst nach Freigabe.
- **132, 135, 138, 139, 140, 147, 148, 149, 151, 155:** jetzt TEILWEISE mit getestetem Code (`services/growth/`, Admin → Berichte → Wachstum). Offen bleibt jeweils nur, was ein Konto des Eigentümers braucht (Search Console, Social-Kanäle, E-Mail-Anbieter) oder echte Live-Verkäufe (LA-Freigaben).
- **Bildquelle Startseite:** kie.ai, 1 Bild, vom Eigentümer beauftragt.

## Reihenfolge (ohne neue Kosten)

1. L1 Admin Live-Vorschau · 2. L2 `/konto` · 3. L4 Kanalstatus · 4. L5 FAQ/Preise · 5. L6 + L7 Registry-Export und Dokumente · 6. L8 Pilot-Fachanwendung (nur nach Bestätigung des Umfangs).

Eigentümer-Entscheidungen: L3 (MFA ja/nein), L9 (Stripe LIVE), L10 (Kanäle), L11 (KI-API-Kosten).

## Update 13.11.2026 (Nacht): Gesamtprompt 157 – Universal-Produktion 156–165

- **Quelle und Registry:**
  - Die Quelle liegt in `docs/spec/v15-157/`; die Prüfsummen stimmen mit dem Original-Manifest des Eigentümers überein.
  - Die Registry hat jetzt 157 Einträge: 147 bisherige plus 156–165 (`packages/registry/src/registry-extension-157.json`).
  - 141–145 und 48/49/110 bleiben ausgeschlossen (per Test erzwungen).
- **156 Auftragsanforderung:** jetzt TEILWEISE mit getestetem Code. Details in [IMPLEMENTATION_PLAN_157.md](IMPLEMENTATION_PLAN_157.md) und [UNIVERSAL_ASSIGNMENT_SCHEMA.md](UNIVERSAL_ASSIGNMENT_SCHEMA.md).
- **Stand der übrigen neuen Funktionen:**
  - Teilweise belegt durch vorhandenen Code: 159, 164, 165.
  - Geplant: 157, 158, 161, 162.
  - Gesperrt, weil Kosten nötig sind: 160, 163.
