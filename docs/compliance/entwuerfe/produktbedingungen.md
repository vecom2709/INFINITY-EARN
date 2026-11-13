# Produkt- und Lizenzbedingungen – ENTWURF (keine Rechtsberatung)

Stand: [Datum] · Fassung 1 (Entwurf 13.11.2026) · Bestandteil der AGB (`agb.md`) · Freigabepunkt LA-09

> Jede Zusage unten ist durch eine automatische Abnahmeprüfung im Code belegt (Standard-Akte in `services/product-factory/src/quality-standard.ts`). Was dort nicht geprüft wird, wird hier nicht versprochen.

## A. Kalkulationen (CSV, PDF, Paket)
- **Lieferung:** Tabelle mit Positionen, Zwischensumme, Aufschlag und Gesamtsumme als CSV, PDF oder beides; Herkunftsnachweis über die Prüfsumme.
- **Geprüft vor Lieferung:** Struktur, nachgerechnete Summen, Zeichensatz, Schutz vor Formel-Einschleusung (CSV), Prüfsumme.
- **Nutzungsrecht:** einfaches, zeitlich und räumlich unbeschränktes Recht zur Nutzung für eigene Zwecke, einschließlich Weitergabe an eigene Kunden als Angebotsgrundlage. [Weiterverkauf der Datei als solche ausschließen?]
- **Erstattung:** wenn nach Korrektur weiterhin falsche Summen oder eine unlesbare Datei geliefert werden.

## B. Mini-Warenwirtschaft (Programm im Browser)
- **Lieferung:** Programm als eine HTML-Datei in Firmenname, Farbe, Logo und Sprache des Kunden; bebilderte Anleitung (PDF); LIESMICH mit Prüfsummen.
- **Funktionen:** Artikel, Lager, Kunden, Angebote, Aufträge, Lieferungen, Rechnungen, Zahlungen, Gutschriften, Berichte, Sicherung – wie im Angebot beschrieben.
- **Daten:** Geschäftsdaten werden nur im Browser des Kunden gespeichert; das Programm baut keine Netzwerkverbindung auf. Für Sicherungen ist der Kunde verantwortlich (Funktion „Daten“).
- **Nicht enthalten:** Mehrplatz- oder Serverbetrieb, Synchronisation zwischen Geräten, elektronische Rechnungsübermittlung (XRechnung, FatturaPA/SdI).
- **Nutzungsrecht:** einfaches, zeitlich unbeschränktes Recht, das Programm im eigenen Unternehmen des Kunden auf beliebig vielen eigenen Geräten zu nutzen. Weitergabe an Dritte und Veränderung des Programmcodes sind nicht gestattet. [prüfen]
- **Erstattung:** wenn das Paket die Abnahmeprüfungen nach Wiederholung nicht besteht oder das Programm die zugesagten Abläufe nicht ausführt.

## C. „Lager & Rechnung“ für Windows
- **Lieferung:** Installer und Programm im Namen des Kunden (Firmenname, Farbe, Sprache, Steuersätze des Landes), bebilderte Anleitung (PDF), Bauprotokoll mit Prüfsummen und Testergebnis, LIESMICH.
- **Geprüft vor Lieferung:** alle Fachtests des Programms (u. a. Lager, Rechnungs-Pflichtangaben, Steuer je Satz, FatturaPA gegen das amtliche Schema), echtes Windows-Programm, Firmenname im Programm, Anleitung, Prüfsummen.
- **Systemvoraussetzung:** Windows 11 (geprüft); Windows 10 vorgesehen, aber nicht geprüft. Keine Administratorrechte nötig.
- **Signatur:** Das Programm ist **nicht digital signiert**. Windows kann beim Start warnen; die Anleitung beschreibt das Vorgehen.
- **Rechnungen:** Pflichtangaben nach § 14 Abs. 4 UStG (DE) bzw. § 11 UStG (AT) sind technisch umgesetzt. Die italienische Fassung erzeugt die FatturaPA-Datei; die Übermittlung an das SdI erfolgt durch den Kunden. Eine E-Rechnung für Deutschland (XRechnung/ZUGFeRD) ist **nicht** enthalten.
- **Daten:** Geschäftsdaten liegen auf dem Rechner des Kunden; Sicherung durch den Kunden (Anleitung, Kapitel „Datensicherung“).
- **Nutzungsrecht:** einfaches, zeitlich unbeschränktes Recht zur Nutzung im eigenen Unternehmen des Kunden auf [Anzahl] Rechnern. Keine Weitergabe, kein Zurückentwickeln, soweit gesetzlich zulässig.
- **Erstattung:** wenn kein Bau die Abnahmeprüfungen nach drei Versuchen besteht oder das Programm die zugesagten Abläufe nicht ausführt.

## D. KI-Texte
- **Lieferung:** die bestellten Textarten (Startseite, Über uns, Leistung, Produkt, FAQ) als Markdown, HTML und JSON mit LIESMICH.
- **Erstellung:** mit dem KI-System Claude (Anthropic). Das Briefing wird dafür an Anthropic übermittelt (siehe Datenschutzerklärung).
- **Briefing:** nur Unternehmensangaben, keine personenbezogenen Daten (z. B. keine Namen von Personen, Kontaktdaten, Kennnummern). Der Kunde bestätigt das bei der Bestellung; Briefings mit erkennbaren Kontaktdaten oder Kennnummern werden abgelehnt.
- **Geprüft vor Lieferung:** bestellte Textarten, Wortzahl, Sprache, Firmenname und Stichworte, keine Garantie-, Superlativ- oder Gratis-Aussagen, keine vom Kunden ausgeschlossenen Begriffe, keine Platzhalter, Links, Kontaktdaten, HTML oder KI-Selbstbezüge.
- **Nicht zugesagt:** inhaltliche Richtigkeit über die Fakten des Briefings hinaus, bestimmte Suchmaschinen-Platzierungen, Einzigartigkeit gegenüber allen veröffentlichten Texten. Rechts-, Medizin- und Finanzaussagen werden nicht erstellt.
- **Prüfpflicht:** Der Kunde liest die Texte vor einer Veröffentlichung gegen.
- **Nutzungsrecht:** Der Anbieter überträgt dem Kunden alle Rechte, die ihm an den Texten zustehen, zur uneingeschränkten Nutzung einschließlich Bearbeitung. [Hinweis: An rein KI-erzeugten Texten entsteht nach überwiegender Auffassung kein Urheberrecht; prüfen]
- **Erstattung:** wenn nach drei Versuchen kein Ergebnis die Abnahmeprüfung besteht.

_Vor Verwendung anwaltlich prüfen (LA-09)._
