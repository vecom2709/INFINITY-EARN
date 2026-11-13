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

## 2. Claude-Anbindung (Phase C) – über das Claude-Abo, auf Wunsch des Eigentümers

- **Weg:** offizielle `anthropics/claude-code-action@v1` in GitHub Actions mit dem Abo-Token `CLAUDE_CODE_OAUTH_TOKEN` aus `claude setup-token` – **kein API-Schlüssel, keine API-Kosten**. Workflow: `.github/workflows/ai-job.yml`, Agent: `scripts/ai-agent.ts`.
- **Ablauf:** Bezahlter KI-Auftrag → Bauauftrag (Plattform `ai-claude`) → GitHub-Lauf alle 15 Minuten holt ihn ab → Claude schreibt nur `work/ergebnis.json` → Worker formt das Lieferpaket selbst und prüft es (Produktart `ai-texte`) → Lieferung. Höchstens 3 Versuche.
- **Sicherheit:** Claude bekommt nur die Aufgabe (Kundendaten als markierter Datenblock), darf nur Dateien lesen/schreiben (`--allowedTools Read,Write`), keine Ausgaben im öffentlichen Protokoll (`show_full_output: false`). Der Agent-Schlüssel steht nur in den Schritten „abholen“/„hochladen“, nie im Claude-Schritt. Keine Geschäfts-, Datenbank- oder Zahlungsschlüssel im KI-Lauf.
- **Grenzen des Abos:** Es gelten die Nutzungslimits deines Tarifs; zusätzlich Tageslimit `AI_DAILY_TASK_LIMIT` (Staging: 3). Ist es erreicht, startet kein Lauf und Aufträge warten sichtbar (`AI_QUOTA_BLOCKED`, Leitstand „WARTET AUF KI“). Die Verbraucher-Bedingungen von Anthropic beschränken automatisierten Zugriff; ob dein Tarif gewerblichen Dauerbetrieb abdeckt, musst du selbst prüfen.
- **Stand:** gebaut und getestet ohne Token (Abholen, Prüfen, Liefern, Limit, Fehlerwege). **UNVERIFIED:** echter Lauf mit Claude – braucht dein Token. Danach Probe: GitHub → Actions → „KI-Aufträge (Claude-Abo)“ → Run workflow mit Haken „KI-Probe“ oder Admin-Knopf. Erst eine bestandene Probe schaltet Claude im Router auf „verfügbar“.
- **Erstes KI-Produkt:** KI-Texte (Startseite, Über uns, Leistung, Produkt, FAQ) – gewählt, weil Texte sich am zuverlässigsten automatisch abnehmen lassen. Prüfungen: Textarten, Wortzahl, Sprache, Firmenname und Stichworte, keine Garantie-/Superlativ-/Gratis-Aussagen oder verbotenen Begriffe, keine Platzhalter, Links, Kontaktdaten, HTML oder KI-Selbstbezüge.

## 3. Production Router

| Arbeit | Umgebung | Heute |
|---|---|---|
| Kalkulation (CSV/PDF/Paket), Office-Kalkulation | Cloudflare Worker | verfügbar |
| Web-Software (Mini-Warenwirtschaft) | Cloudflare Worker | verfügbar |
| Windows-EXE (Lager & Rechnung) | GitHub-Windows-Server | verfügbar, sobald Probebau < 14 Tage bestanden |
| Angebot, Qualitätssicherung, Auslieferung, Kundenbetreuung | Cloudflare Worker | verfügbar |
| Texte (Produktart `ai-texte`) | Claude über dein Abo | verfügbar nach bestandener KI-Probe (Token nötig) |
| Webdesign, individuelle Software, freie Kundengespräche | Claude | **nicht verfügbar** – noch keine geprüfte Produktart |
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

- KI-Produktion: dein Abo-Token `CLAUDE_CODE_OAUTH_TOKEN` als GitHub-Geheimnis hinterlegen und KI-Probe starten – siehe 2.; Tarifbedingungen selbst prüfen.
- LIVE: LA-01 bis LA-12, Stripe-KYC, Unternehmens- und Steuerregistrierung.
- Kundengewinnung mit Versand: Versandkanal und Plattformregeln je Kanal (bisher: Postausgang ohne Versand, kein Spam).
- Administrativer MFA-Schutz: noch nicht umgesetzt (Passwort + Sitzung) – nächster Sicherheitsschritt.
- Italienische Windows-Fassung: FatturaPA-Annahme im SdI (dein Portalzugang).
