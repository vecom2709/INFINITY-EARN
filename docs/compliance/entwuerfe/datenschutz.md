# Datenschutzerklärung – ENTWURF (keine Rechtsberatung)

> Beschreibt die tatsächlich implementierte Datenverarbeitung (Stand Code 13.11.2026, Fassung 2). Vor Veröffentlichung anwaltlich bzw. durch Datenschutzbeauftragte prüfen (LA-08).

> **Wichtig für den Eigentümer vor dem Echtbetrieb von KI-Texten:** Claude läuft über dein persönliches Claude-Abo. Für Verbraucher-Tarife bietet Anthropic in der Regel **keinen Auftragsverarbeitungsvertrag (Art. 28 DSGVO)** an, und je nach Einstellung können Eingaben zur Verbesserung der Modelle genutzt werden. Bevor Briefings mit personenbezogenen Daten echter Kunden verarbeitet werden: (1) in den Claude-Einstellungen die Nutzung zur Modellverbesserung ausschalten, (2) rechtlich klären lassen, ob ein Tarif mit Auftragsverarbeitungsvertrag (Team/Enterprise oder API – kostenpflichtig, deine Freigabe) nötig ist, oder (3) im Briefing nur Unternehmensangaben ohne Personenbezug zulassen.

## 1. Verantwortlicher
[Name/Firma, Anschrift, E-Mail]

## 2. Welche Daten wir verarbeiten und warum

| Vorgang | Daten | Zweck | Rechtsgrundlage (DSGVO) | Speicherdauer |
|---|---|---|---|---|
| Anfrageformular | Name, E-Mail, Firma (optional), Land, Nachricht, Auftragsangaben (z. B. Positionen, Firmenname und Farbe, Briefing) | Bearbeitung der Anfrage, Machbarkeitsprüfung, Angebot | Art. 6 Abs. 1 lit. b (vorvertraglich) | [bis Abschluss + Frist] |
| Werbe-E-Mails (freiwillig) | E-Mail, Zeitpunkt und Nachweis der Einwilligung | Neuigkeiten | Art. 6 Abs. 1 lit. a (jederzeit widerrufbar) | bis Widerruf |
| Angebotsannahme / Bestellung | Rechnungsname, -adresse, Land, Kundentyp, USt-IdNr. (optional), Annahme- und ggf. Verzichtsnachweis (Zeitpunkt, gekürzter IP-Hash) | Vertragsabwicklung, Nachweis | Art. 6 Abs. 1 lit. b und c | gesetzliche Aufbewahrung [Frist je Land] |
| Zahlung | Abwicklung durch **Stripe** (Kartendaten verarbeitet ausschließlich Stripe); wir erhalten Zahlungsstatus, Betrag, Gebühr, Referenzen | Zahlungsabwicklung, Buchhaltung | Art. 6 Abs. 1 lit. b und c | gesetzliche Aufbewahrung |
| Vom Kunden hochgeladene Dateien (z. B. Logo) | Datei, Prüfsumme, Zeitpunkt | Herstellung der bestellten Leistung | Art. 6 Abs. 1 lit. b | bis Auftragsende + [Frist], danach gelöscht |
| Herstellung Windows-Programm | Firmenname, Farbe, Sprache, Land (keine Kontaktdaten) | Bau des Programms auf einem GitHub-Windows-Server | Art. 6 Abs. 1 lit. b | auf dem Bau-Server nur für die Dauer des Baus |
| Herstellung KI-Texte | Briefing: Firmenname, Angebot, Zielgruppe, Fakten, Stichworte (keine Kontaktdaten) | Erstellung der Texte durch Claude (Anthropic) auf einem GitHub-Server | Art. 6 Abs. 1 lit. b | bei uns: Auftragsdauer + [Frist]; bei Anthropic: nach dessen Bedingungen (siehe Hinweis oben) |
| Lieferung | erzeugte Dateien, Download-Zeitpunkte | Erfüllung, Nachweis | Art. 6 Abs. 1 lit. b | [Frist] |
| Support / Reklamation / Widerruf | Nachricht, Auftragsbezug | Bearbeitung | Art. 6 Abs. 1 lit. b, c | [Frist] |
| Technische Protokolle | Ereignisse ohne Klartext-IP (gekürzter Hash), keine Passwörter/Schlüssel | Sicherheit, Betrugsabwehr | Art. 6 Abs. 1 lit. f | [Frist] |
| Datensicherung | verschlüsselte Kopie der Datenbank | Wiederherstellung nach Fehlern | Art. 6 Abs. 1 lit. c und f | 30 Tage, dann automatisch gelöscht (Workers KV, Ablaufzeit) |
| Öffentliche Ausschreibungen (TED) | veröffentlichte Bekanntmachungen öffentlicher Auftraggeber | Marktbeobachtung | Art. 6 Abs. 1 lit. f | [Frist] |

Es findet **keine** automatisierte Entscheidung mit rechtlicher Wirkung über Personen statt: Angebote werden nach festen Preisregeln berechnet, die Machbarkeitsprüfung bezieht sich auf die Leistung, nicht auf die Person. [prüfen]

Programme (Mini-Warenwirtschaft, Windows-Programm) speichern die Geschäftsdaten des Kunden ausschließlich auf dessen Gerät; wir erhalten diese Daten nicht.

## 3. Empfänger und Drittlandübermittlung
| Empfänger | Rolle | Daten | Sitz / Garantien |
|---|---|---|---|
| **Cloudflare, Inc.** (Workers, Durable Objects, KV) | Hosting, Datenbank, verschlüsselte Sicherungen | alle oben genannten Daten | USA; [EU-US Data Privacy Framework / Standardvertragsklauseln, Auftragsverarbeitungsvertrag prüfen] |
| **Stripe** | Zahlungsdienstleister | Zahlungsdaten | [Rolle: eigener Verantwortlicher/Auftragsverarbeiter je Leistung prüfen; Drittland und Garantien angeben] |
| **GitHub, Inc. (Microsoft)** | Bau-Server für Windows-Programme und KI-Texte (GitHub Actions) | Bauangaben bzw. Briefing, nur während des Laufs; nie in öffentlichen Protokollen | USA; [Garantien prüfen] |
| **Anthropic, PBC** (Claude) | Erstellung von KI-Texten | Briefing | USA; [siehe Hinweis oben – Auftragsverarbeitung klären] |
| [Steuerberatung] | Buchhaltung | Rechnungsdaten | [—] |

## 4. Ihre Rechte
Auskunft (im Kundenportal als JSON-Export verfügbar), Berichtigung, Löschung bzw. Einschränkung (bei gesetzlichen Aufbewahrungspflichten wird die Verarbeitung eingeschränkt statt gelöscht), Datenübertragbarkeit, Widerspruch, Widerruf von Einwilligungen, Beschwerde bei einer Aufsichtsbehörde [zuständige Behörde des Sitzlandes].

## 5. Sicherheit
Verschlüsselte Übertragung (nur HTTPS, HSTS), Zugriff auf die Verwaltung nur für den Eigentümer, protokollierte Änderungen, verschlüsselte Sicherungen, keine Speicherung von Kartendaten, Bau- und KI-Server ohne Zugriff auf Datenbank- oder Zahlungsschlüssel.

_Vor Veröffentlichung prüfen lassen (LA-08)._
