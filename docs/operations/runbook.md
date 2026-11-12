# Betriebshandbuch (M0, lokal / Testmodus)

## Erststart
```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run owner:password        # Ausgabe als OWNER_PASSWORD_HASH in .env eintragen
npm run check:env
npm run dev                   # http://localhost:8787
```
Optional zufällige Schlüssel in `.env` setzen (`DOWNLOAD_SIGNING_KEY`, `MOCK_WEBHOOK_SECRET`, je ≥ 32 Zeichen), sonst erzeugt der Prozess bei jedem Start neue (Download-Links werden dann nach Neustart ungültig).

## Abläufe
| Was | Wo |
|---|---|
| Kundenanfrage | `/anfrage` → automatisches Angebot (wenn innerhalb Policy) |
| Angebot annehmen | Link aus der Anfrage → `/angebot/<id>?t=…` |
| Testzahlung | `/checkout/mock/<session>` (nur Testmodus, nur Besteller) |
| Produktion/Beleg/Abgleich | automatisch alle 30 s (Autopilot) oder Dashboard → „Autopilot-Takt jetzt ausführen“ |
| Download | `/portal` (Kundencookie) |
| Eigentümer | `/dashboard` |
| Dry Run | `npm run dryrun` (eigene Wegwerf-DB) |

## Akquise (M1)
- Quelle TED freigeben: Dashboard → „Akquise – Quellen“ → geprüfte Fassung der Bedingungen eintragen → „Quelle freigeben“. Gilt 90 Tage.
- Danach automatischer Abruf 1× täglich im Serverprozess; manuell: „TED jetzt abrufen“ oder `npm run acquire`.
- Nur lesen, nichts speichern: „Vorschau“ bzw. `npm run acquire -- --preview --days=30`.
- Ausschreibungs-Leads haben keinen Kontaktkanal. „Angebotsentwurf“ erzeugt ein prüfbares Dokument; Einreichung nur manuell im Vergabeverfahren.

## Notstopps
Dashboard → Notstopps: `PAUSE_ACQUISITION`, `PAUSE_PRODUCTION`, `PAUSE_PAYMENTS`, `STOP_ALL_JOBS`. Jobs bleiben in der Queue (`QUEUED`, Grund `EMERGENCY_STOP`) und laufen nach Freigabe weiter. Belege/Ledger werden nie gelöscht.

## Fehlerbilder
| Symptom | Bedeutung | Aktion |
|---|---|---|
| Opportunity `MANUAL_REVIEW` | Betrag weicht ab, Dead-Letter, Sicherheitsisolierung | Audit-Trail prüfen, Owner entscheidet |
| Opportunity `TAX_REVIEW` | Pflichtdaten fehlen / SdI / OSS / keine Steuerregel | fachliche Klärung; kein automatischer Steuersatz |
| Job `DEAD_LETTER` + `alert.dead_letter` | Produktion nach 3 Retries gescheitert | Ursache beheben, ggf. Rückerstattung |
| Reconciliation `REVIEW` | unbekannte/unbelegte Buchung, Gebühr unbestätigt | Buchung belegen; nichts überschreiben (append-only) |
| `alert.payout_failed` | Provider meldet gescheiterte Auszahlung | im Provider-UI prüfen |
| Start verweigert | Live-Modus, Live-Key oder unbekannter Provider konfiguriert | Konfiguration korrigieren (gewollte Sperre) |

## Daten & Backup
- Datenbank: `data/infinity-earn.sqlite` (WAL). Backup: Dienst stoppen, Datei + `-wal`/`-shm` kopieren.
- Artefakte: `data/artifacts/test/<order>/vN.csv` (SHA-256 in DB).
- Exporte: `data/exports/`, Dry-Run-/E2E-Belege: `data/dryrun/`, `data/e2e/`.
- Aufbewahrungs-/Löschfristen: erst nach LA-08 festlegen.

### Staging: automatische tägliche Sicherung
- Der Worker-Alarm sichert einmal pro UTC-Tag den gesamten Datenbestand nach Workers KV (`backup/JJJJ-MM-TT`, Namespace `infinity-earn-backups`, Free-Tarif; kein R2, da dort eine Zahlungsart nötig wäre).
- Format: logischer Export → gzip → AES-256-GCM. Schlüssel nur als Secret `BACKUP_ENCRYPTION_KEY` (Quelle: `.dev.vars`, beim ersten Deploy automatisch erzeugt). **Schlüssel sicher aufbewahren – ohne ihn sind alle Sicherungen unbrauchbar.**
- Aufbewahrung 30 Tage (Ablauf automatisch). Fehler → Audit `backup.offsite_failed`, neuer Versuch frühestens nach 1 h. Status (Owner-Login nötig): `GET /api/backup/status` bzw. Feld `backup` in `/api/readiness` → `health` = `OK` / `NOT_ACTIVE` / `ATTENTION` (`reason` `FAILED` oder `STALE` = älter als 36 h). Die Anzeige im Dashboard folgt mit der 15.0-Oberfläche.
- **Wiederherstellung prüfen:** `npm run backup:pull` (neueste) oder `npm run backup:pull -- 2026-11-12` → entschlüsselt nach `data/backups/<tag>.json` und führt den Restore-Test aus (`RESTORE OK …`).
- **Echte Wiederherstellung** in eine SQLite-Datei: `npm run backup:pull -- <tag> data/restore.sqlite`. Zurück ins Durable Object gibt es bewusst keinen Ein-Klick-Weg (Eigentümerentscheidung, manuell).

## Logs
Strukturierte JSON-Zeilen auf stdout, Geheimnisse (Keys, IBAN, Passwort-Hashes, Tokens) werden redigiert.
