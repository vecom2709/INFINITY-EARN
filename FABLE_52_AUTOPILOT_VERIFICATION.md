# FABLE 5.2 – Prüfung des 24/7-Autopiloten (17.0)

Stand 16.11.2026 · Ergänzt `AUTOPILOT_247.md`.

## Was ohne privaten PC läuft (belegt)

| Baustein | Nachweis | Ergebnis |
|---|---|---|
| Takt jede Minute im Durable Object (Alarm setzt sich selbst neu) | Code `apps/worker/src/index.ts`; Staging-Sicherungen vom 12. und 13.11. entstanden ohne Benutzeraktion | läuft |
| Auftrag bis Download nur durch den Takt | `tests/integration/autopilot-247.test.ts` „1–4, 16“ | bestanden |
| Doppelter Webhook | „7“ und `payments.test.ts` | eine Zahlung, eine Lieferung |
| Neustart mit hängendem Job | „12“ – nach 30 Minuten protokolliert wieder aufgenommen | bestanden |
| Erschöpftes Free-Kontingent | „11“ – nichts verarbeitet, nichts verloren, keine Kosten | bestanden |
| KI fehlt | „5–6“ und `ai-texte.test.ts` – sichtbar „wartet auf KI“, Tageslimit hält | bestanden |
| 60 gleichzeitige Aufträge | `scripts/perf-check.ts` – 60 Lieferungen, 60 Belege, 0 doppelt, 6 Takte | bestanden (lokal) |
| Windows-Bau über GitHub | echter Probebau 13.11. (Lauf 43496760277), CI Windows grün | bestanden |

## Was die Prüfung neu aufgedeckt hat

1. **Startzeit externer Läufe ist nicht 15 Minuten, sondern Stunden.** 9 geplante Läufe am 14.–15.11.2026: Abstand mindestens 221, im Median 384, höchstens 439 Minuten. Ein Windows- oder KI-Auftrag wartet also bis zu etwa 7 Stunden auf den Start. Die frühere Angabe „bis ca. 30 Minuten“ war falsch und ist überall korrigiert.
   - Abhilfe gebaut: Der Worker stößt den Workflow selbst an (`services/product-factory/src/dispatch.ts`), höchstens alle 10 Minuten und nur wenn etwas wartet. **Aktiv erst mit einem GitHub-Token des Eigentümers** (fein abgestuft, nur dieses Repository, Recht „Actions: schreiben“) als `GITHUB_DISPATCH_TOKEN` und `GITHUB_REPOSITORY=vecom2709/INFINITY-EARN`. Getestet mit nachgebildeter GitHub-Antwort; **echter Anstoß ungeprüft**.
2. **Zweiter Probebau wäre auf Staging gescheitert** (Speicher überschreibt nicht) – behoben, siehe `FABLE_52_REPAIR_LOG.md` R-07.

## KI-Ausführung (Claude)

- Modell dieser Prüfung: Claude Fable 5.2 (`claude-fable-5-2`), in dieser Sitzung über Claude Code.
- Automatische KI-Produktion: gebaut für das Claude-Abo über die offizielle Claude-Code-Action (`.github/workflows/ai-job.yml`). Welches Modell die Action verwendet, bestimmt das Abo bzw. die Voreinstellung der Action – **nicht festgelegt und nicht geprüft**.
- Stand: **BLOCKED** – das Abo-Token (`CLAUDE_CODE_OAUTH_TOKEN`) ist nicht hinterlegt. Seit dem 13.11. liefen 9 geplante KI-Läufe; alle endeten ohne Arbeit („Token fehlt“). Kein echter KI-Lauf wurde je ausgeführt.
- Aufträge warten sichtbar als `AI_QUOTA_BLOCKED`; der deterministische Betrieb ist davon unabhängig.

## Status

| Bereich | Status |
|---|---|
| Cloudflare-Kern 24/7 (deterministisch) | VERIFIED auf Staging im Testbetrieb |
| Windows-Bau extern | VERIFIED (ein echter Lauf); Startzeit Stunden ohne Token |
| KI-Produktion | BLOCKED (Token des Eigentümers) |
| Sofort-Auslöser | IMPLEMENTED, echter Anstoß ungeprüft |

## Nicht geprüft
Dauerbetrieb über Wochen; Verhalten nach der 60-Tage-Pause von GitHub-Zeitplänen; Grenzen des Free-Tarifs unter echter Last.
