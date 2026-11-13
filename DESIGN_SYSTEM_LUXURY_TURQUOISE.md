# Designsystem LUXURY TURQUOISE

Quelle der Wahrheit im Code: `apps/console/src/tokens.ts`. Genutzt von der Startseite, den Kundenseiten (`apps/shared/layout.ts`) und der Admin-Konsole (`apps/console`). Ein automatischer Kontrasttest prüft alle verwendeten Text-Hintergrund-Paare: `tests/unit/console-ui.test.ts`.

## Tokens

| Token | Wert | Einsatz |
|---|---|---|
| `canvas` (Ivory) | `#F7FAF9` | Seitengrund |
| `surface` | `#FFFFFF` | Karten, Tabellen |
| `ink` (Dark Ocean) | `#0E1D25` | Text, dunkle Kapitel, Logo-Fläche |
| `muted` | `#53656E` | Sekundärtext (AA auf Ivory und Weiß) |
| `accent` (Petrol) | `#087F82` | Schaltflächen, Links (weiße Schrift 4,8:1) |
| `accentSoft` (Soft Mist) | `#DCEBEA` | Status „ok“, aktive Navigation |
| `brand` (Türkis) | `#18C8C1` | **nur Markenlicht**: Logo, Linien, Lichtakzente, Text auf Dark Ocean |
| `warning` / `danger` | `#8A5400` / `#A63A3A` | nur echte Status |

**Regel:** Türkis erreicht auf hellem Grund nur etwa 2:1 Kontrast und ist dort nie Textfarbe. Ein Test erzwingt das. Der Gesamtprompt nennt als Ausgangswerte `ink #14272C`, `muted #576B70` und `border #D8E7E7`. Wir nutzen die dunkleren, AA-geprüften Werte; das ist die erlaubte Anpassung nach Kontrastprüfung („justiere ggf. Farben für AA“).

## Typografie, Abstände, Formen

- Systemschrift (Inter, falls lokal vorhanden), keine externen Schriften.
- Fließtext 15–16 px, Zahlen tabellarisch.
- Abstände 4/8/12/16/24/32 px.
- Radien: Karten 18–22 px, Bedienelemente 11 px.
- Klickziele mindestens 44 px.

## Storyscrolling (Startseite)

- **9 Kapitel:** Hero → Bedarf → Beratung → Produkte → Qualität → Bezahlung (Stripe) → Lieferung → Preise & Fragen (mit Pflichtinformationen) → Abschluss.
- **Technik:** nur CSS, kein JavaScript (CSP `default-src 'none'` bleibt).
  - Scroll-Reveal über `animation-timeline: view()`, Fortschrittslinie über `scroll(root)`.
  - Parallax nur ab 900 px Breite.
- **Barrierefreiheit:** Bewegung nur bei `prefers-reduced-motion: no-preference`. Ohne Unterstützung ist alles sofort sichtbar, und es gibt keinen Scroll-Zwang.
- **Inhalte:** nur echt – freigegebene Produkte, Prüfanzahl aus dem Produktstandard, eine als „Beispiel“ gekennzeichnete Kalkulation vom echten Rechenkern. Keine Referenzen, Bewertungen oder Verkaufszahlen.

## Kundenportal und Admin

- **Kundenportal und Admin:** dieselben Tokens, ruhiger, ohne Scroll-Animation.
- **Admin:** sechs Hauptbereiche (Übersicht, Kunden, Aufträge, Produkte, Finanzen, Berichte), Unterseiten statt Menüwüste, Tabellen werden auf Mobilgeräten zu Karten.

## Kundenprogramme

Kundenprodukte bekommen **nicht** automatisch Türkis. Ihre Gestaltung richtet sich nach der Marke des Kunden und ist Teil der Standard-Akte im Produktstandard (siehe [PRODUCT_FACTORY_REAL_SOFTWARE.md](PRODUCT_FACTORY_REAL_SOFTWARE.md)).

## Startseite nach Design-Vorlage (13.11.2026)

Dunkler Hero mit Foto nach der Vorlage des Eigentümers: Marke Infinity Earn mit Unterzeile, sechs Menüpunkte mit echten Zielen, B2B SOLUTIONS, zwei Schaltflächen, darunter vier Kacheln (nur echte Angebote).

- **Foto:** erzeugt mit kie.ai (Modell Flux-2 Pro, 16:9, 1 Bild, 7 Credits) im Auftrag des Eigentümers, ohne Schrift im Bild. Original: `docs/design/hero/kie-hero-original.jpg`; Skript: `scripts/kie-hero.ts` (Schlüssel nur aus `.env`: `KIE_API_KEY`).
- **Auslieferung:** `apps/customer-portal/assets/hero-1920.jpg` (105 KB) und `hero-960.jpg` (36 KB), eingebettet über `node scripts/build-hero-assets.ts`, ausgeliefert unter `/bilder/…?v=<Prüfsumme>` (CSP `img-src 'self'`).
- **Ehrlichkeit:** Der Laptop im Foto ist Stimmungsbild; die echte, nachgerechnete Beispiel-Kalkulation steht in Kapitel 04.

