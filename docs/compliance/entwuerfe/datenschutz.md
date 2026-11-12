# Datenschutzerklärung – ENTWURF (keine Rechtsberatung)

> Beschreibt die tatsächlich implementierte Datenverarbeitung (Stand Code 12.11.2026). Vor Veröffentlichung anwaltlich bzw. durch Datenschutzbeauftragte prüfen (LA-08). Hosting-Abschnitt nach Staging-Entscheidung ergänzen.

## 1. Verantwortlicher
[Name/Firma, Anschrift, E-Mail]

## 2. Welche Daten wir verarbeiten und warum

| Vorgang | Daten | Zweck | Rechtsgrundlage (DSGVO) | Speicherdauer |
|---|---|---|---|---|
| Anfrageformular | Name, E-Mail, Firma (optional), Land, Nachricht, Positionsdaten | Bearbeitung der Anfrage, Angebot | Art. 6 Abs. 1 lit. b (vorvertraglich) | [bis Abschluss + Frist] |
| Werbe-E-Mails (freiwillig) | E-Mail, Zeitpunkt und Nachweis der Einwilligung | Neuigkeiten | Art. 6 Abs. 1 lit. a (Einwilligung, jederzeit widerrufbar) | bis Widerruf |
| Angebotsannahme / Bestellung | Rechnungsname, -adresse, Land, Kundentyp, USt-IdNr. (optional), Annahme- und ggf. Verzichtsnachweis (Zeitpunkt, gekürzter IP-Hash) | Vertragsabwicklung, Nachweis | Art. 6 Abs. 1 lit. b und c | gesetzliche Aufbewahrung [Frist je Land] |
| Zahlung | Abwicklung durch **Stripe** (Kartendaten verarbeitet ausschließlich Stripe); wir erhalten Zahlungsstatus, Betrag, Gebühr, Referenzen | Zahlungsabwicklung, Buchhaltung | Art. 6 Abs. 1 lit. b und c | gesetzliche Aufbewahrung |
| Lieferung | erzeugte Datei, Download-Zeitpunkte | Erfüllung, Nachweis | Art. 6 Abs. 1 lit. b | [Frist] |
| Support / Reklamation / Widerruf | Nachricht, Auftragsbezug | Bearbeitung | Art. 6 Abs. 1 lit. b, c | [Frist] |
| Technische Protokolle | Ereignisse ohne Klartext-IP (gekürzter Hash), keine Passwörter/Schlüssel | Sicherheit, Betrugsabwehr | Art. 6 Abs. 1 lit. f | [Frist] |
| Öffentliche Ausschreibungen (TED) | veröffentlichte Bekanntmachungen öffentlicher Auftraggeber | Marktbeobachtung | Art. 6 Abs. 1 lit. f | [Frist] |

Es findet **keine** automatisierte Entscheidung mit rechtlicher Wirkung über Personen statt; Angebote werden nach festen Preisregeln berechnet. [prüfen]

## 3. Empfänger
- **Stripe** (Zahlungsdienstleister) – [Rolle: eigener Verantwortlicher/Auftragsverarbeiter je nach Leistung prüfen; Übermittlung in Drittländer und Garantien angeben]
- [Hosting-Anbieter nach Staging-Entscheidung]
- [Steuerberatung, soweit erforderlich]

## 4. Ihre Rechte
Auskunft (im Kundenportal als JSON-Export verfügbar), Berichtigung, Löschung bzw. Einschränkung (bei gesetzlichen Aufbewahrungspflichten wird die Verarbeitung eingeschränkt statt gelöscht), Datenübertragbarkeit, Widerspruch, Widerruf von Einwilligungen, Beschwerde bei einer Aufsichtsbehörde [zuständige Behörde des Sitzlandes].

## 5. Sicherheit
Verschlüsselte Übertragung [nach Hosting], Zugriff nur für den Eigentümer, protokollierte Änderungen, keine Speicherung von Kartendaten.

_Vor Veröffentlichung prüfen lassen (LA-08)._
