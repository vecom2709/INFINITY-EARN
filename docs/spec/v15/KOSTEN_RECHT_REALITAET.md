# Kosten, Recht und reale Umsetzbarkeit – verbindliche Leitplanken

## Kostenregel

**Ziel:** monatliche **zusätzliche Software-Fixkosten 0 €**, solange der vorhandene Claude-Tarif und verfügbare kostenlose Dienstleistungen ausreichen.

**Standard:** `PAID_SERVICES_ALLOWED=false`, `MAX_ADDITIONAL_MONTHLY_FIXED_EUR=0`, `UNAPPROVED_PAID_API_CALLS=BLOCK`.

Das bedeutet **nicht** automatisch: null Transaktionsgebühren, null Steuern, null Registrierungs- oder Pflichtkosten, unbegrenztes Hosting, 24/7-Claude Code oder gratis Videorendering.

## Claude-Grenze

Ein Claude-Abo berechtigt innerhalb der aktuellen Nutzungsbedingungen und Kontingente zur vorgesehenen Nutzung. Es ist **nicht** gleichzusetzen mit einer unbegrenzten Claude-API für einen dauerlaufenden, vollautomatischen Drittplattform-Server. Verfügbarkeit von Cloud-Aufgaben und Gebühren vor Realbetrieb prüfen; bei ausgeschöpften Limits `QUEUED`/`BLOCKED_CAPACITY`, nicht automatisch kostenpflichtig upgraden.

## Rechtlicher Rahmen

- Geschäftsanmeldung, Unternehmeridentität, KYC und Steuerstatus müssen korrekt sein; eine KI kann keine Rechtsperson oder rechtsverantwortliche Geschäftsführung im eigenen Namen ersetzen.
- Für Verkäufe aus Italien sind dortige steuerliche Vorgaben einschließlich ggf. Partita IVA und elektronischer Rechnungsprozesse (SdI) zu prüfen. Bei anderem tatsächlichem Geschäftssitz gilt dessen Rechtslage.
- Es genügt nicht generell, Rechnungen nur zu archivieren: Steuererklärungen, Meldungen, Abgaben und Aufbewahrung sind ggf. erforderlich.
- Preisangaben, digitale Inhalte, Verbraucherrechte, Widerrufsregeln und Abo-Kündigungen müssen zum Markt passen.
- Kontaktakquise über E-Mail, WhatsApp oder andere elektronische Kanäle nur bei entsprechender rechtlicher Grundlage; öffentliche Firmendaten allein erlauben keine Massenwerbung.
- Kundendaten, Text-, Foto-, Musik-, Code- und 3D-Rechte lizenziert, dokumentiert und ggf. anonymisiert behandeln.
- Keine unzulässige KI-Rechts-/Steuerberatung, medizinische Fachdiagnosen, riskante regulierte Finanztätigkeiten oder bewusst irreführende Geschäftsangebote.
- Neue Märkte werden bei ungeklärten Rechtsfragen vorab blockiert, nicht „vorläufig“ illegal betrieben.

## Bankauszahlung

Nach echten Verkäufen verarbeitet ein Zahlungsanbieter den Betrag ggf. abzüglich Gebühren und hält ihn zeitweise zurück. Eine Auszahlung kann verzögert oder gesperrt sein. **Erst eine passende Banktransaktion** bestätigt, dass Geld wirklich angekommen ist. Eine Zahlung beim Anbieter ist nicht identisch mit frei verfügbarem Gewinn.

## Immer klar kennzeichnen

- `DEMO` = Fiktion, keinerlei echte Bankbewegung.
- `TEST` = Testumgebung/Sandbox, kein echtes Kundengeld.
- `LIVE` = echte Vorgänge mit echten Zahlungen, Freigaben und Buchhaltungsbelegen.

## Fazit

Ein hoher Automatisierungsgrad ist ein realistisches Entwicklungsziel. Ein dauerhaft vollständig selbstständiges Unternehmen mit garantiert zahlenden Kunden, unbegrenzter KI-Arbeit und null realen Nebenkosten ist **nicht** garantiert oder vorab nachgewiesen. Claude soll das Projekt deshalb in überprüfbaren Meilensteinen bauen, nicht als „fertige Geldmaschine“ ausgeben.
