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
| L6 | **§12 Status-Vokabular** SPECIFIED/IMPLEMENTED/TESTED/LIVE_VERIFIED/BLOCKED | Ja | Abbildung der heutigen Status, `FEATURE_REGISTRY_127.json` erzeugen |
| L7 | **§13 Dokumente** DESIGN_SYSTEM, SYSTEM_ARCHITECTURE, COMMUNICATION_AND_DELIVERY, PRODUCT_FACTORY_REAL_SOFTWARE, ADMIN_LIVE_PREVIEW, TEST_MATRIX | Ja | aus dem echten Stand erzeugen |
| L8 | **§4 echte Fachsoftware** (ERP/CRM/Warenwirtschaft) als Produkt | Teilweise: braucht je Auftrag Entwicklungsarbeit; dauerhaft autonom nur mit KI-API (kostenpflichtig) | erst eine kleine, vollständig getestete Fachanwendung als Pilot (M3), keine Zusage großer ERP-Projekte |
| L9 | **§8 Stripe LIVE**, Abos, Kundenportal von Stripe | Code ja; Aktivierung nur mit KYC, Live-Schlüsseln, Freigabe | Eigentümer (LA-03/04) |
| L10 | **§3 WhatsApp Business, E-Mail-Versand, Telefonie** | Nein – Konten/Anbieter nötig | Eigentümer wählt Anbieter |
| L11 | **§9 autonome KI-Agenten rund um die Uhr** | Nein – Claude-Abo ist keine API; KI-API kostet | deterministischer Kern läuft; KI-Schicht erst mit Kostenfreigabe |

## Reihenfolge (ohne neue Kosten)

1. L1 Admin Live-Vorschau · 2. L2 `/konto` · 3. L4 Kanalstatus · 4. L5 FAQ/Preise · 5. L6 + L7 Registry-Export und Dokumente · 6. L8 Pilot-Fachanwendung (nur nach Bestätigung des Umfangs).

Eigentümer-Entscheidungen: L3 (MFA ja/nein), L9 (Stripe LIVE), L10 (Kanäle), L11 (KI-API-Kosten).
