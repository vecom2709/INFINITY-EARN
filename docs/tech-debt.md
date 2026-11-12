# Technische Altlasten – Bericht 2026-11-12

Quelldateien: 104 · Zeilen: 10290 · offene Markierungen: 0

## Priorisierte Punkte

| Punkte | Datei | Gründe |
|---|---|---|
| 3 | `apps/console/src/icons.ts` | von keinem Test direkt importiert |
| 3 | `apps/console/src/labels.ts` | von keinem Test direkt importiert |
| 3 | `apps/console/src/pages/finance.ts` | von keinem Test direkt importiert |
| 3 | `apps/console/src/pages/overview.ts` | von keinem Test direkt importiert |
| 3 | `apps/console/src/pages/products.ts` | von keinem Test direkt importiert |
| 3 | `apps/console/src/pages/reports.ts` | von keinem Test direkt importiert |
| 3 | `apps/console/src/pages/settings.ts` | von keinem Test direkt importiert |
| 3 | `apps/console/src/status-report.ts` | von keinem Test direkt importiert |
| 3 | `apps/shared/layout.ts` | von keinem Test direkt importiert |
| 3 | `services/core-api/src/auth.ts` | von keinem Test direkt importiert |
| 3 | `services/core-api/src/errors.ts` | von keinem Test direkt importiert |
| 3 | `services/core-api/src/http-core.ts` | 632 Zeilen – aufteilen erwägen |
| 3 | `services/core-api/src/main.ts` | von keinem Test direkt importiert |
| 3 | `services/core-api/src/opportunities.ts` | von keinem Test direkt importiert |
| 3 | `services/product-factory/src/legal.ts` | von keinem Test direkt importiert |

## Größte Dateien

- `services/core-api/src/http-core.ts` – 632 Zeilen
- `apps/customer-portal/src/pages.ts` – 323 Zeilen
- `services/core-api/src/workflow.ts` – 299 Zeilen
- `services/finance/src/bank-statement.ts` – 299 Zeilen
- `services/finance/src/insights.ts` – 285 Zeilen

## Bereiche ohne direkten Testbezug

- `apps/shared/layout.ts`

Releases nur nach `npm run verify` (Typecheck, Lint, alle Tests, E2E, Testmatrix, Build).
