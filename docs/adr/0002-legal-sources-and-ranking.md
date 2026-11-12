# ADR 0002 – Legale Quellen, Opportunity-Ranking, Angebotsentwürfe (M1)

- **Status:** angenommen (M1), Stand 12.11.2026

## Entscheidung

### Quellen
| # | Quelle | Erlaubnis (belegt) | Kontaktkanal |
|---|---|---|---|
| 1 | **Eigenes Anfrageformular** (`src_inbound_form`) | eigene Plattform; Datenschutzhinweis + freiwillige Werbeeinwilligung mit Nachweis | Antwort auf Anfrage (`permitted_inbound`) |
| 2 | **TED – Tenders Electronic Daily** (`src_ted_eu`), Search-API v3 | „The Search API does not require a key“ (docs.ted.europa.eu/api); Bekanntmachungen „can be freely reused, for commercial or non-commercial purposes“ (ted.europa.eu/en/legal-notice, Wiederverwendungsbeschluss 2011/833/EU); Fair Use 700 HTTP-Anfragen/Minute (Developers’ Corner) | **keiner** – Einreichung nur manuell im Vergabeverfahren |

Verworfen: Freelance-/Jobplattformen ohne offizielle, für automatisierte Angebote zugelassene API (ToS-Risiko); gekaufte Listen; Web-Scraping.

### Freigabe nur durch den Eigentümer
TED ist per Migration als `PENDING_REVIEW` angelegt. Ohne Freigabe (Dashboard → „Quelle freigeben“, mit Angabe der geprüften Fassung der Bedingungen) erfolgt **kein Netzwerkzugriff** (Lauf `BLOCKED`). Freigabe gilt 90 Tage, danach `TERMS_RECHECK_REQUIRED`. KI/System können nicht freigeben.

### Abruf
`services/acquisition/src/connectors/ted.ts`: `POST https://api.ted.europa.eu/v3/notices/search`, Expertensuche `classification-cpv IN (…) AND publication-date>=YYYYMMDD`, max. 5 Seiten à ≤ 100, 1,1 s Pause, 30 s Timeout, generischer User-Agent, keine personenbezogenen Daten. Jede Bekanntmachung wird als Nachweis gespeichert (`source_items`, Rohdaten + SHA-256, Lauf-ID). Täglicher Abruf im Serverprozess (idempotent per Cron-Schlüssel), manuell per Dashboard oder `npm run acquire`.

### Relevanz und Ranking (deterministisch, erklärbar)
- **Nachweis:** offene Auftragsbekanntmachung (`cn-*`) mit offener Frist = 100; Vorinformation (`pin-*`) = 30; Vergabebekanntmachung (`can-*`) = 0.
- **Fit:** CPV-Treffer zur aktiven Produktklasse (+50) und produktspezifischer Titelbegriff (+50).
- **Relevant** nur bei Nachweis 100 **und** Titelbegriff. Nach dem ersten Live-Abruf verschärft: Ein CPV-Treffer allein markierte Großprojekte (Elektrobusse, SAP-Einführung) fälschlich als relevant.
- Risiko: formelles Vergabeverfahren (immer manuelle Prüfung), Frist < 7 Tage.
- Nur relevante Einträge werden Leads (`intent_verified` über Bekanntmachungsnummer, `contact_legal_basis = none`, Frist = Ablauf).

### Angebotsgenerator
`services/core-api/src/offers.ts` erzeugt **Entwürfe zur Prüfung** mit Quelle, Bekanntmachungsnummer, Rohdaten-Hash, Bewertungsgründen und offenen Punkten. Ohne freigegebenen Umfang **kein Preis**. Inhalt per Trigger unveränderlich. Eigentümer kann „zur manuellen Einreichung freigeben“ oder verwerfen; es gibt **keine Versandfunktion**.

### Erster Produktions-Use-Case
Bestätigt: `b2b-calc-csv` (siehe ADR 0001). Begründung: einzige Produktklasse, die heute kostenlos, deterministisch und QA-gesichert lieferbar ist.

## Konsequenzen
- Öffentliche Ausschreibungen passen selten zu einem kleinen Standardprodukt; realistischer Kanal für `b2b-calc-csv` bleibt Inbound (SEO/Landingpage, M5). TED bleibt als belegte Nachfragequelle und Marktbeobachtung.
- Titel stehen oft in der Originalsprache (PL, LT, RO …); die Schlüsselwortliste deckt DE/EN/IT ab. Erweiterung nur mit Prüfung, um Fehltreffer zu vermeiden.
