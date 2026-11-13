# Admin Live Preview & Product Inspection

**Wo:** Admin → Produkte → „Live-Vorschauen“ (`/dashboard/produkte/vorschau`). Außerdem hat jede Auftragsdetailseite einen Eintrag „Live-Vorschau“.

**Code:** `services/product-factory/src/preview.ts`, `apps/console/src/pages/preview.ts`. **Tests:** `tests/integration/live-preview.test.ts`.

## Galerie

- **Je Produkt:** Kunde, Titel, Version, Generator-Version, Prüfsumme, Zeitpunkt, Prüfergebnis mit den fehlgeschlagenen Prüfungen, Lieferstatus (geliefert, abgerufen, zurückgezogen), Sperrstatus und Art der Vorschau.
- **Suche:** nach Kunde, Auftrag, Titel oder Prüfsumme.
- **Trennung:** Test- und Echtdaten sind getrennt; Testprodukte erscheinen nie in der Echt-Ansicht.

## Detail und echte Ansicht

| Produktart | Vorschau |
|---|---|
| Tabelle (CSV) | Tabelle direkt aus der gespeicherten Datei gelesen |
| PDF | Originaldatei im PDF-Viewer des Browsers |
| Paket (ZIP) | Inhalt mit CRC-Prüfung, Tabelle aus dem Paket, PDF aus dem Paket |
| andere | „Noch keine Live-Vorschau verfügbar“ – nie eine Dekoration als Funktion |

Daneben zeigt die Detailseite:
- **Zusagen aus dem Produktstandard** mit Prüfergebnis.
- **Das vollständige Prüfprotokoll.**
- **Alle Versionen des Auftrags**, jede einzeln aufrufbar.
- **Den öffentlichen Herkunftsnachweis.**

## Sicherheit und Ehrlichkeit

- **Zugriff:** Die Datei-Route `/admin/vorschau/<id>/datei` ist nur für den angemeldeten Eigentümer erreichbar.
- **Integrität:** Vor jeder Anzeige wird die Prüfsumme kontrolliert. Eine manipulierte Datei wird nicht angezeigt.
- **Nur lesend:** Die Vorschau löst keine Zahlungen aus und verändert keine Kundendaten.
- **Fehler gefunden:** „Datei sperren und Lieferung zurückziehen“ (CSRF-geschützt, protokolliert). Der Kunde kann die Datei dann nicht mehr laden, und der Auftrag geht in die Nachbearbeitung.

## Noch nicht möglich

- **Interaktive Vorschau ausführbarer Software:** Websites, Apps und ERP brauchen isolierte Preview-Deployments und Emulatoren. Sie kommen erst, wenn es solche Produkte gibt und die nötige Rechenleistung kostenlos verfügbar oder freigegeben ist.
- **Kommentare und Korrekturjobs aus der Vorschau:** offen.
