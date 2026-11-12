# ADR 0006 – Bankeingang nur mit gesondertem Kontoauszug (BANK_CREDIT_VERIFIED)

**Status:** angenommen · 2026-11-12 · Meilenstein 15.0-M1

## Kontext

Die 15.0-Kette verlangt `PROVIDER_PAYOUT_SENT` → `BANK_CREDIT_VERIFIED` (nur bei bestätigter Bankbewegung) → `CLOSED`. Bisher wurde ein Auftrag bereits beim Auszahlungsereignis des Zahlungsanbieters abgeschlossen. Ein „Bank-Feed“ ohne Kontozugriff gibt es nicht, und PSD2-Banking-APIs wären kostenpflichtig bzw. bräuchten eine eigene Zulassung.

## Entscheidung

- **Abschluss erst nach Bankbeleg.** Die Auszahlungsmeldung setzt nur `PAYOUT_RECORDED`, in der Oberfläche „Auszahlung unterwegs“. `CLOSED` folgt erst, wenn eine passende Gutschrift auf einem importierten Kontoauszug gefunden wurde.
- **Importformate:** CSV (deutsche Bankexporte) und ISO 20022 camt.053. Beides kann jede Bank kostenlos exportieren, es entstehen keine Kosten und keine Zugangsdaten im Programm.
- **Abgleichregeln (deterministisch, ohne KI):**
  - R1: Auszahlungs-ID im Verwendungszweck, Betrag und Währung gleich.
  - R2: Betrag gleich, Buchung 0–10 Tage nach der Meldung, genau ein Kandidat ohne konkurrierende Auszahlung.
  - Mehrdeutige Fälle werden nie zugeordnet, sondern gehen als Hinweis zur Prüfung.
- **Datenbank als Wächter (Migration 0006):**
  - Bankbestätigung nur mit verknüpfter Buchung; einmal bestätigt bleibt bestätigt.
  - Buchungen sind unveränderlich, eine Zuordnung ist endgültig.
  - Keine Live-Zeilen, solange der Echtbetrieb gesperrt ist.
- **Datensparsamkeit:**
  - Die Rohdatei wird nicht gespeichert, nur ihre Prüfsumme (verhindert doppelte Importe).
  - Die IBAN wird maskiert, Gegenparteien werden gekürzt.
  - XML wird ohne DTD/Entitäten gelesen (Schutz vor XXE).
- **Nur Testbetrieb vorerst:**
  - Im Testbetrieb werden nur ausdrücklich als TEST gekennzeichnete Auszüge angenommen.
  - Der Import echter Auszüge ist gesperrt, bis LA-03/LA-04 freigegeben sind (`LIVE_BANK_IMPORT_LOCKED`).

## Folgen

- Im Echtbetrieb zeigt die Konsole weiterhin „Noch nicht verbunden“.
- Im Testbetrieb gilt der Bankabgleich als eingerichtet, sobald ein Test-Auszug importiert wurde.
- Für Stripe-Echtgeld wird später derselbe Import genutzt. Die Auszahlungs-ID steht bei Stripe im Verwendungszweck der Überweisung, Regel R1 greift also direkt.
