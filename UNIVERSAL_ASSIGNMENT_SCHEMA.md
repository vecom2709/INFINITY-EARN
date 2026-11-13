# Universal Assignment Schema (Funktion 156)

Code: `services/core-api/src/assignments.ts` · Datenbank: `db/migrations/0011_assignments.sql` · Tests: `tests/integration/assignment.test.ts` · Admin: `/dashboard/auftraege/anforderungen`

## Ablauf

Kundenwunsch (Website-Anfrage, E-Mail, Telefonnotiz, Plattform)
→ `analyzeAssignment` (regelbasiert, DE/IT/EN, ohne kostenpflichtige KI)
→ `AssignmentSpec`, gespeichert als Revision 1
→ Rückfragen und Konflikte, danach neue Version
→ Kundenbestätigung genau dieser Version (mit Beleg)
→ `quoteInput` für das Angebot, nur wenn angebotsreif, bestätigt und die Produktart freigegeben ist.

## AssignmentSpec

| Feld | Inhalt |
|---|---|
| `domain` | `software-native`, `software-mobile`, `software-web`, `office-excel`, `office-word`, `office-slides`, `office-calc`, `media-*`, `api-integration`, `research`, `unknown` |
| `businessAreas` | Warenwirtschaft/Lager, Rechnungen/Angebote, Buchhaltung, CRM, ERP |
| `platforms`, `architectures` | windows, macos, linux, android, ios, browser · x64/arm64 |
| `formats`, `language`, `deadline` | erkannte Dateiformate, Sprache, Termin |
| `requirements[]` | `{level: MUSS/SOLL/OPTIONAL, text, origin: customer/product_type}` |
| `deliverables[]`, `acceptanceCriteria[]` | echter Liefernachweis je Produktart (Anlage I), z. B. Windows: Installer, Deinstallation, Test je Plattform; Excel: Zell-, Formel- und Dateiprüfung |
| `dependencies[]`, `licences[]` | Datenschutz, Kundendateien (→ 161), Fremdsysteme, Apple-Signatur · SBOM, Rechte |
| `questions[]`, `conflicts[]` | Rückfragen in Kundensprache · Widersprüche, z. B. „nur Windows“ und Mac, „offline“ und Cloud, „ohne Installation“ und Installer |
| `reviewFlags[]` | anweisungsähnliche Texte im Kundentext oder in Anhängen |
| `capability` | `{id, status, reason}` gegen den echten Stand der Produktfabrik |
| `status` | siehe unten |
| `attachments[]` | nur Name, SHA-256, Größe und Hinweisanzahl; der Anhangtext wird nicht gespeichert |

**Kein Preisfeld.** Preise entstehen nur aus Policy und Eigentümer-Freigabe.

## Status

| Status | Bedeutung |
|---|---|
| `ASSIGNMENT_AMBIGUOUS` | Rückfrage oder Konflikt offen, z. B. fehlende Zielplattform |
| `REVIEW` | unbekannte Aufgabenart oder anweisungsähnlicher Text, manuelle Prüfung |
| `CAPABILITY_PENDING` | Produktart noch nicht herstellbar oder nicht freigegeben |
| `COST_APPROVAL_REQUIRED` | braucht kostenpflichtige Ressourcen, z. B. macOS/iOS |
| `CAPABILITY_BLOCKED` | bewusst gesperrt, z. B. Medien (160) |
| `READY_FOR_QUOTE` | Produktart freigegeben, keine offenen Punkte |

## Regeln (per Test erzwungen)

- **Duplikate:** Derselbe Wunsch vom selben Kunden über mehrere Kanäle ergibt eine einzige Anforderung, über einen eindeutigen Index.
- **Versionen sind append-only:** Originaltext und SHA-256 jeder Version bleiben erhalten. Eine Bestätigung gilt nur für die neueste, nicht mehrdeutige Version. Eine Änderung nach der Bestätigung meldet `changeOrderRequired` (→ Funktion 92).
- **Löschantrag:**
  - Entfernt werden Freitext und Analyse; Prüfsumme, Versionen und Stand bleiben als Nachweis.
  - Das ist die einzige erlaubte Änderung (Datenbank-Trigger).
- **Anhänge:** Sie verändern weder Status, Anforderungen, Tests noch Preise.
