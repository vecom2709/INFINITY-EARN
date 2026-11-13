# INFINITY EARN 16.0 – 24/7-Autopilot (Stand 13.11.2026)

Ziel: Das Geschäft läuft rund um die Uhr auf Cloudflare, auch wenn der private PC aus ist. Kein Neubau, keine neuen Kosten.

## 1. Bestandsprüfung (Phase A)

| Baustein | Stand | Nachweis im Code |
|---|---|---|
| Transaktionskern in einem SQLite-Durable-Object | läuft auf Staging | `apps/worker/src/index.ts` (`InfinityCore`) |
| Zeitsteuerung ohne PC | läuft: DO-Alarm jede Minute, setzt sich selbst neu | `alarm()` → `autopilotTick` |
| Dauerhafte Job-Warteschlange mit Idempotenz, Backoff, Dead-Letter | läuft | `services/ai-orchestrator/src/queue.ts` |
| Wiederanlauf hängengebliebener Jobs | **neu** | `recoverStaleJobs` (30 Min.), Audit `job.recovered` |
| Zahlungs-Webhooks: Signatur, Duplikatschutz | läuft (Mock/Stripe-Test) | `services/finance/src/payments.ts` |
| Produktion → Abnahme → Lieferung → Beleg → Abgleich | läuft | `production.ts`, `delivery.ts`, `autopilot.ts` |
| Windows-Bau je Auftrag | läuft, per Probebau belegt | `external-build.ts`, `.github/workflows/win-build.yml` |
| Tägliche verschlüsselte Sicherung in Workers KV | läuft | `backup-offsite.ts` |
| Stopp-Schalter je Bereich | läuft | Admin → Einstellungen → Stopp-Schalter |
| Production Router / Job Director | **neu** | `services/ai-orchestrator/src/director.ts` |
| Einheitlicher Job-Status (WAITING … OWNER_APPROVAL_REQUIRED) | **neu** (Abbildung des echten Zustands) | `jobStatus()` |
| Autopilot-Status AKTIV … ANGEHALTEN | **neu**, aus Messwerten | `autopilotStatus()`, Admin-Übersicht „Autopilot-Leitstand“, `/admin/autopilot.json` |

## 2. Claude-Anbindung (Phase C) – ehrliches Ergebnis

- **Offiziell vorhanden:** Claude Code in GitHub Actions (`anthropics/claude-code-action`) mit einem Abo-Token aus `claude setup-token` (Pro/Max/Team/Enterprise) oder mit API-Schlüssel.
- **Grenze:** Die Verbraucher-Bedingungen erlauben automatisierten Zugriff nur mit API-Schlüssel oder ausdrücklicher Erlaubnis von Anthropic. Abo-Kontingente sind für gewöhnliche, individuelle Nutzung bemessen; Berichten zufolge läuft programmatische Nutzung seit Juni 2026 über ein eigenes, begrenztes Budget (nicht offiziell geprüft).
- **Entscheidung:** Kein 24/7-Geschäftsbetrieb auf dem Abo. KI-Aufträge bleiben sicher in der Warteschlange (`AI_QUOTA_BLOCKED`), sichtbar im Leitstand. Alles Deterministische läuft weiter.
- **Was du freigeben müsstest, um KI-Produktion zu starten** (jeweils deine Entscheidung):
  1. Bestätigung, dass dein Tarif automatisierte geschäftliche Nutzung erlaubt – oder ein Anthropic-API-Schlüssel (kostet Geld).
  2. Token/Schlüssel selbst erzeugen und als GitHub-Geheimnis hinterlegen (ich lege keine Zugänge an).
  3. Tageslimit `AI_DAILY_TASK_LIMIT` > 0.
  4. Danach baue ich den KI-Agenten nach demselben Muster wie den Windows-Bau (abholen → isoliert ausführen → prüfen → liefern), ohne Geschäfts-, Datenbank- oder Zahlungsschlüssel im KI-Lauf.

## 3. Production Router

| Arbeit | Umgebung | Heute |
|---|---|---|
| Kalkulation (CSV/PDF/Paket), Office-Kalkulation | Cloudflare Worker | verfügbar |
| Web-Software (Mini-Warenwirtschaft) | Cloudflare Worker | verfügbar |
| Windows-EXE (Lager & Rechnung) | GitHub-Windows-Server | verfügbar, sobald Probebau < 14 Tage bestanden |
| Angebot, Qualitätssicherung, Auslieferung, Kundenbetreuung | Cloudflare Worker | verfügbar |
| Texte, Webdesign, individuelle Software, freie Kundengespräche | Claude | **nicht verfügbar** (siehe 2.) |
| macOS/Linux-Desktop, Android/iOS, Grafik/Video | – | **nicht verfügbar** |

Zugesagt wird nur, was `assess()` als machbar meldet. Gestoppte Produktion → keine Zusage.

## 4. Szenarien aus Abschnitt 14 – tatsächliche Ergebnisse

`tests/integration/autopilot-247.test.ts` (9 Tests, alle bestanden) plus bestehende Dateien:

| # | Szenario | Ergebnis | Nachweis |
|---|---|---|---|
| 1–4, 16 | Bestellung bei ausgeschaltetem PC → gespeichert → Takt produziert → Abnahme → Download | bestanden | autopilot-247 „1–4, 16“ |
| 5–6 | KI fehlt → Job pausiert sichtbar; Freigabe 1/Tag → genau ein Job läuft | bestanden | autopilot-247 „5–6“ |
| 7 | Doppelter Webhook → eine Zahlung, ein Auftrag, eine Lieferung | bestanden | autopilot-247 „7“, payments.test.ts |
| 8 | Fehlerhafte Produktion wird nicht geliefert | bestanden | autopilot-247 „8“, quality-standard.test.ts |
| 9 | Windows-Bau auf Windows | bestanden (lokal Windows 11, CI Windows Server, GitHub-Probebau) | external-build.test.ts, Lauf 43496760277 |
| 10 | Admin-Vorschau mit isolierten Testdaten | bestanden | live-preview.test.ts |
| 11 | Kostenloses Kontingent erschöpft → gespeichert, nichts verarbeitet, keine Kosten | bestanden | autopilot-247 „11“ |
| 12 | Neustart → nichts verloren; hängender Job nach 30 Min. protokolliert wieder aufgenommen | bestanden | autopilot-247 „12“ |
| 13 | Kunden- und Adminrechte getrennt | bestanden | tests/security/security.test.ts, external-build.test.ts |
| 14 | Testdaten nie als Echtumsatz | bestanden | autopilot-247 „14–15“ |
| 15 | Echtbetrieb gesperrt | bestanden (`ENVIRONMENT=live` wird abgewiesen) | autopilot-247 „14–15“ |

## 5. Wiederherstellung (Runbook)

- **Takt bleibt aus** (Leitstand: FEHLER „Letzter Takt vor … Minuten“): Seite aufrufen weckt das Durable Object und setzt den Alarm neu; sonst `node scripts/staging-deploy.ts`.
- **Job hängt auf RUNNING:** wird nach 30 Minuten automatisch zurückgestellt (`job.recovered`).
- **Datenverlust:** tägliche verschlüsselte Sicherung in Workers KV (`BACKUP_ENCRYPTION_KEY` in `.dev.vars` aufbewahren).
- **Windows-Bau bleibt aus:** GitHub → Actions → „Windows-Bau je Auftrag“ → Run workflow. GitHub pausiert Zeitpläne nach 60 Tagen ohne Änderungen.

## 6. Kosten

0 €. Cloudflare Free (Worker, Durable Object, KV), GitHub Actions kostenlos (öffentliches Repository). Keine KI-API, kein VPS, keine Upgrades.

## 7. Verbleibende Blocker und Eigentümerfreigaben

- KI-Produktion: Entscheidung zu Abo-Bedingungen oder API-Schlüssel (Kosten) – siehe 2.
- LIVE: LA-01 bis LA-12, Stripe-KYC, Unternehmens- und Steuerregistrierung.
- Kundengewinnung mit Versand: Versandkanal und Plattformregeln je Kanal (bisher: Postausgang ohne Versand, kein Spam).
- Administrativer MFA-Schutz: noch nicht umgesetzt (Passwort + Sitzung) – nächster Sicherheitsschritt.
- Italienische Windows-Fassung: FatturaPA-Annahme im SdI (dein Portalzugang).
