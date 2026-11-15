# FABLE 5.2 – Sicherheitsprüfung (17.0)

Stand 16.11.2026 · Eigenreview · nur eigene Systeme (lokal und eigenes Staging), keine Angriffe auf fremde Dienste.

| Bereich | Geprüft | Ergebnis | Nachweis |
|---|---|---|---|
| Anmeldung Eigentümer | scrypt-Passwort, Sitzung serverseitig, Limit 5 Fehlversuche in 15 Minuten | in Ordnung | `tests/security/security.test.ts` |
| Zweiter Faktor | Passkey (WebAuthn): Herkunft, Benutzerprüfung, Signatur, Zähler, Einmal-Herausforderung, Wiederherstellungscodes | serverseitig in Ordnung; **Browserteil ungeprüft**; **noch nicht eingeschaltet** | `tests/security/passkey.test.ts` (6) |
| Sitzungs-Cookies | HttpOnly, SameSite=Strict (Eigentümer) bzw. Lax (Kunde), Secure auf Staging | in Ordnung | Code `cookie()`, Staging-Antworten |
| CSRF | Eigentümer: Token je Sitzung; alle POSTs: Herkunftsprüfung (neu) | **verbessert** | `tests/security/tenant-isolation.test.ts` |
| Mandantentrennung | 8 Lese- und 8 Schreibwege Kunde A gegen Kunde B; Kunden-Cookie gegen Verwaltung | keine Durchlässigkeit gefunden | `tests/security/tenant-isolation.test.ts` (4) |
| SQL-Injection | alle Datenbankaufrufe durchsucht: nur gebundene Parameter; Interpolation nur mit festen Textbausteinen | in Ordnung | Suche in `services`, `apps`, `packages` |
| XSS | Lead-Eingaben werden maskiert; CSP `default-src 'none'`, Skript nur auf zwei Seiten (`script-src 'self'`) | in Ordnung; **nicht jede Ausgabestelle einzeln geprüft** | `security.test.ts` IE-088, Antwort-Header |
| SSRF | ausgehende Aufrufe nur an feste Ziele (Stripe, TED, GitHub-API) – keine vom Nutzer bestimmte Adresse | in Ordnung | Suche nach `fetch(` |
| Uploads | Typ- und Inhaltsprüfung, Größenlimit 3 MB, abgelehnte Dateien nie gespeichert | in Ordnung (bestehende Tests) | `tests/integration/client-assets.test.ts`, `tests/security/upload-server.test.ts` |
| Fluten | öffentliche POSTs je IP begrenzt (neu) | **behoben** | `tests/security/flood.test.ts` |
| Geheimnisse | Repository-Scan (Stripe, Webhook, Anthropic, private Schlüssel): 0 Treffer; `.env`, `.dev.vars`, `data/` nicht versioniert | in Ordnung | `security.test.ts`, `git grep` |
| Abhängigkeiten | `npm audit --omit=dev` | 0 Schwachstellen | 13.11.2026 |
| Transport | HTTP wird auf HTTPS umgeleitet (301), HSTS ein Jahr | in Ordnung | live gegen Staging |
| Zahlungs-Webhook | Signaturprüfung, Wiederholungsschutz, gefälschte Signatur 400 | in Ordnung | `payments.test.ts`, live gegen Staging |
| Bau- und KI-Agent | eigener Schlüssel, 401 ohne oder mit falschem Schlüssel; Agent sieht nur vier Bauangaben bzw. das Briefing | in Ordnung | `external-build.test.ts`, live gegen Staging |
| Prompt Injection | Briefing nur als Datenblock, Backticks entfernt, Claude nur Lesen und Schreiben, kein Agent-Schlüssel im KI-Schritt, Ergebnis unabhängig geprüft | in Ordnung; **echter KI-Lauf ungeprüft** | `tests/products/ai-texte/ai-texte.test.ts` |
| KI-erzeugter Code | wird nirgends ausgeführt (nur Texte) | Risiko derzeit nicht vorhanden | Code |
| Datenschutz KI | Briefing nur Unternehmensangaben (Bestätigung und automatische Ablehnung) | in Ordnung; Grenze: Personennamen in Firmennamen | `ai-texte.test.ts` |
| Suchmaschinen | Testseite jetzt `noindex` (neu) | **behoben** | `tests/security/https.test.ts` |
| Sicherung | täglich verschlüsselt, Wiederherstellung in lokale Datenbank geprüft (13.11.) | in Ordnung; Rückspielen ins laufende System **ungeprüft** | `docs/compliance/nachweise/LA-11.md` |

## Offene Sicherheitspunkte
1. Zweiten Faktor einschalten (Eigentümer, eigenes Gerät) und im Browser prüfen.
2. Die Ratenbegrenzung überlebt keinen Neustart des Durable Objects und schützt nicht gegen verteilte Angriffe.
3. Keine systematische Prüfung jeder HTML-Ausgabestelle auf Maskierung.
4. Keine unabhängige Prüfung durch Dritte (Penetrationstest wäre kostenpflichtig).

Kritische offene Schwachstellen: **keine bekannt.** Das ist keine Garantie für Fehlerfreiheit.
