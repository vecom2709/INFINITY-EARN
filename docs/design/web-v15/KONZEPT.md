# Website, Kundenportal und Admin-Zentrale – Konzept und Umsetzungsplan

Stand 2026-11-12. Entwürfe: [entwuerfe.html](entwuerfe.html). Lokal ansehen mit `node scripts/serve-design.ts` → http://127.0.0.1:4320.

Grundsatz: Alles wird in die **bestehende** Plattform eingebaut, also denselben Worker, dieselbe Datenbank und dieselben 127 Funktionen. Es entsteht keine neue Anwendung. Beide Vertriebswege führen in dieselbe Kunden-, Angebots-, Auftrags- und Zahlungskette. Doppelte Kunden verhindert schon heute der eindeutige E-Mail-Hash, doppelte Zahlungen die idempotenten Webhooks.

## Was echt umsetzbar ist – und was nicht ohne dich

| Anforderung | Umsetzung | Grenze |
|---|---|---|
| Premium-Landingpage DE/IT/EN, SEO, Sitemap, hreflang, strukturierte Daten | voll umsetzbar, kostenlos | – |
| Produktkatalog mit Produktseiten | voll umsetzbar | **Bestellbar sind nur die 3 Produkte, die wir nachweislich herstellen und prüfen** (Tabelle, PDF, Paket). Software, Websites, Grafik, Video, 3D und Abos erscheinen als „In Vorbereitung“ oder „Auf Anfrage“, nie als bestellbar ohne eigene Qualitätsprüfung. |
| KI-Produktberater | Geführter Berater (DE/IT/EN): versteht strukturierte Wünsche, fragt nach, prüft die Machbarkeit, rechnet den Preis aus, erstellt Angebot und Vorschau. Er läuft regelbasiert auf dem Server, kostenlos und nachvollziehbar. | Freie natürliche Sprache mit einem Sprachmodell braucht eine **kostenpflichtige API**. Das Claude-Abonnement ist keine API. Das geht nur mit deiner ausdrücklichen Kostenfreigabe. Die Spracheingabe nutzt nur die Browserfunktion, falls vorhanden. |
| Vertriebsweg A (KI sucht Kunden) | läuft: TED-Ausschreibungen täglich, Bewertung, Angebotsentwürfe | **Keine Kaltakquise per E-Mail** (Art. 130 Codice Privacy). Kontakt nur über den offiziellen Kanal der Ausschreibung, von dir eingereicht. |
| Vertriebsweg B (Website) | läuft heute schon technisch, wird gestaltet | – |
| Kundenportal | Bestellungen, Fortschritt, Nachrichten, Rechnungen, Downloads, Lizenzen, Änderungen, Support | Abonnements erst, wenn es ein Abo-Produkt gibt |
| Admin-Zentrale `/admin` | 18 Bereiche in 6 Hauptgruppen, bestehende Konsole wird dorthin überführt | „Claude-Kontingent“ ist vom Server aus **nicht messbar** und wird so angezeigt |
| 2-Faktor-Anmeldung für Admins | TOTP (Authenticator-App), kostenlos | Die Einrichtung machst du selbst; das Geheimnis sieht nur deine App |
| Stripe LIVE | Code für Checkout, Webhooks, Erstattungen und Abgleich ist vorhanden (Sandbox getestet) | **Freischaltung nur nach LA-01…LA-12 mit Nachweisen** (Partita IVA, Stripe-Verifizierung, Steuerberatung, Rechtstexte). Bis dahin technisch gesperrt. |
| Abonnements über Stripe | Technik umsetzbar | sinnvoll erst mit einem Abo-Produkt; braucht eine Steuerprüfung |
| Eigene Domain | – | kostet Geld, braucht deine Entscheidung. Bis dahin kostenlos auf `workers.dev`. |
| Bewertungen | nur echte, mit Einwilligung zur Veröffentlichung | keine erfundenen Stimmen, Logos oder Zahlen |
| Conversion-Analyse | eigene, cookielose Zählung auf dem Server | keine Tracker von Dritten ohne Einwilligung |

## Bauplan (in dieser Reihenfolge)

1. **Gemeinsames Designsystem** für die Website (Tokens der Konsole) mit drei Sprachen (DE/IT/EN).
2. **Öffentliche Website:**
   - Startseite, Katalog, Produktseiten, Ablauf, Nachweise, Fragen, Kontakt
   - SEO-Grundlagen: Sitemap, Robots, Canonical, hreflang, JSON-LD
3. **Produktberater:** geführter Dialog statt Formular, erzeugt Angebote über die bestehende Kette.
4. **Kundenportal neu gestaltet:** Fortschritt, Nachrichten, Downloads, Lizenzen.
5. **Admin-Zentrale `/admin`:**
   - Gruppierung der heutigen Konsole und Fernsteuerung
   - 2-Faktor-Anmeldung
   - Protokoll aller Admin-Aktionen (vorhanden)
6. **Abnahme:** Tests, Barrierefreiheit, Mobil- und Desktop-Prüfung, Rauchtest auf Staging.

Jeder Schritt wird einzeln getestet und auf Staging gebracht. Unfertiges ist sichtbar als „In Vorbereitung“ gekennzeichnet.
