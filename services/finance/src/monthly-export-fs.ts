import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppContext } from '../../core-api/src/context.ts';
import { buildMonthlyExport, monthlyExportCsvs } from './monthly-export.ts';

/** Monatsexport als Dateien schreiben (nur Node). */
export function writeMonthlyExport(ctx: AppContext, month: string): { dir: string; files: string[] } {
  const exp = buildMonthlyExport(ctx, month);
  const dir = join(ctx.config.exportsDir, exp.mode.toLowerCase(), month);
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const json = join(dir, 'export.json');
  writeFileSync(json, JSON.stringify(exp, null, 2));
  files.push(json);
  for (const [name, content] of Object.entries(monthlyExportCsvs(exp))) {
    const p = join(dir, name);
    writeFileSync(p, content);
    files.push(p);
  }
  ctx.audit.record({ type: 'report.exported', actor: 'owner', subjectType: 'report', subjectId: month, data: { files: files.length, gaps: exp.numberingGaps.length }, testMode: ctx.config.testMode });
  return { dir, files };
}
