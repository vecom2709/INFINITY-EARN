# Produktfabrik – echte Produkte statt Attrappen

## Verbindlicher Produktstandard (`services/product-factory/src/quality-standard.ts`)

- **Standard-Akte je Produktart:** Zweck, Zielgruppe, Arbeitsabläufe, Referenzen mit abgeleiteten Anforderungen, Gestaltungsregeln, zugesagte Funktionen, Sicherheit und Barrierefreiheit, Formate, Anleitung, getestete Benutzerabläufe, Kriterien für „nicht lieferfähig“.
- **Keine Zusage ohne Prüfung:** Jede Zusage ist einer automatischen Prüfung zugeordnet. Fehlt die Prüfung, ist die Produktart nicht verkaufbar.
- **Abnahme-Gate je Lieferung:** Alle Kriterien müssen ausgeführt und bestanden sein. Eine fehlende Prüfung zählt als durchgefallen.
- **Nicht lieferfähig:** Es wird nichts ausgeliefert. Der Eigentümer bekommt einen Erstattungsvorschlag, der Kunde eine ehrliche Nachricht.

## Heute lieferbar

| Produkt | Prüfungen |
|---|---|
| Kalkulation als Tabelle (CSV) | Kodierung, Format, Summen, Formel-Injektion, Prüfsumme |
| Kalkulation als PDF | Struktur, Seiten, Vollständigkeit, Summen, Gestaltung (Titel, Netto-Hinweis, Fußzeile), Prüfsumme |
| Paket (ZIP) | ZIP-Struktur/CRC, Tabellen- und PDF-Prüfungen, Prüfsumme |

## Gebaut und abgenommen, Verkauf noch gesperrt

| Produkt | Prüfungen | Stand |
|---|---|---|
| **Mini-Warenwirtschaft** (`mini-ww`, Offline-Programm + bebilderte PDF-Anleitung + LIESMICH als ZIP) | ZIP-Struktur, Programm = getestete Fassung, Kundendesign/Kontrast, kein Netzwerkzugriff, fachlicher Selbsttest mit der Einrichtung des Kunden, keine toten Knöpfe, Anleitung (Seiten, 10 Screenshots, Kapitel, Sprache), LIESMICH-Prüfsummen, Prüfsumme | Standard-Akte vollständig; `disabled_reason`: Verkaufsfreigabe durch den Eigentümer (P4). Details: [PILOT_FACHSOFTWARE.md](PILOT_FACHSOFTWARE.md) |

## Gesperrt bis nachgewiesen

Software (außer dem Pilot oben, der ebenfalls noch gesperrt ist), Websites, Apps, große ERP-Systeme, Grafik, 3D, Video und Audio sind **nicht bestellbar**. Für diese Produktarten gibt es weder eine Standard-Akte noch automatische Prüfungen, und ihre Herstellung auf kostenloser Infrastruktur ist nicht belegt (`services/product-factory/src/registry.ts`).

## Weg zu echter Fachsoftware (Gesamtprompt §4, M3)

1. **Pilot:** eine kleine, vollständige Fachanwendung. Umfang wird mit dem Eigentümer abgestimmt, zum Beispiel eine Auftrags- und Rechnungsverwaltung für einen Kleinbetrieb. Sie umfasst Domänenmodell, dauerhafte Daten, Rollen, Fachlogik, Import/Export, Ende-zu-Ende-Tests mit Fehlerfällen, Anleitung und eine bereitstellbare Auslieferung.
2. **Standard-Akte und Prüfungen:** Für die neue Produktart entstehen zuerst die Standard-Akte und automatische Fachprüfungen. Erst danach darf sie verkauft werden.
3. **Grenze:** Jede Individualsoftware braucht Entwicklungsarbeit. Ein automatischer Betrieb rund um die Uhr wäre nur mit einer kostenpflichtigen KI-API möglich (Freigabe nötig). Große ERP-Projekte werden nicht zugesagt.

## Kundendesign

Kundenprogramme bekommen ein eigenes, zur Marke des Kunden passendes Design, nicht das Türkis von INFINITY EARN.
