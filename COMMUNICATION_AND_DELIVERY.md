# Universal Communication & Delivery Center

## Eine Kundenakte

- **Gemeinsamer Datenstand:** Lead → Kunde → Angebot → Auftrag → Zahlung → Lieferung → Beleg → Ticket mit eindeutigen IDs in einer Datenbank, Auditlog für jeden Schritt.
- **Keine Dubletten:** Doppelte Kunden verhindert der E-Mail-Hash, doppelte Zahlungen verhindern idempotente Webhooks.
- **Ein Weg für beide Kanäle:** Website und Ausschreibungen nutzen dieselbe Kette.

## Kanäle (Admin → Kunden → Kommunikationskanäle)

| Kanal | Status |
|---|---|
| Website: Anfrage und Produktberater (DE/IT/EN) | Verbunden |
| Kundenportal (`/portal`, `/konto`) | Verbunden |
| Öffentliche Ausschreibungen (TED) | Nur lesend – Antworten über den offiziellen Kanal der Ausschreibung |
| E-Mail-Versand | Nicht verbunden – Postausgang hält alles zurück |
| Geschäftliche E-Mail (Eingang), WhatsApp Business, Auftragsplattformen, Telefonie | Nicht verbunden |

Code: `services/core-api/src/channels.ts`. Ein Kanal gilt nur als verbunden, wenn er tatsächlich angebunden ist.

## Gesprächsführung

- **Produktberater (`/berater`):** versteht Wünsche in eigenen Worten, fragt Fehlendes nach und lehnt Nicht-Lieferbares ehrlich ab. Er arbeitet regelbasiert, ohne kostenpflichtige KI.
- **Postausgang:**
  - Auftragsnachrichten: Angebot, Zahlung, Lieferung, „nicht lieferfähig“.
  - Werbung nur mit Einwilligung, mit Abmeldelink, Sperrliste und höchstens einer Nachricht je 90 Tage.
  - Keine Kaltakquise.
- **Versand** erst mit einem Versanddienst, den der Eigentümer anlegt, und den Anbieterangaben (LA-02).

## Auslieferung

- **Lieferung:** Geschützter Download mit Besitzprüfung, Gültigkeit, Prüfsumme und Liefer-ID. Der Herkunftsnachweis ist unter `/pruefen/<sha>` öffentlich prüfbar.
- **Formate heute:** Tabelle (CSV), PDF und Paket (ZIP mit CRC). Jedes Format hat seine Anleitung unter `/hilfe/<produkt>`.
- **Nachbetreuung im Portal:** Abnahme, Mangelmeldung, Bewertung, Nachtrag als eigenes Angebot, Support und Datenexport.
- **Nicht lieferfähig:** Es wird nichts ausgeliefert. Der Eigentümer bekommt einen Erstattungsvorschlag, der Kunde eine Nachricht.

## Offen

E-Mail-Versand und -Eingang, WhatsApp, Plattformen und Telefonie brauchen Konten und Freigaben des Eigentümers.
