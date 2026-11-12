import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { analyzeDebt, renderDebtMarkdown, type SourceFile } from './lib/tech-debt.ts';

/** 128: erzeugt docs/tech-debt.md aus dem aktuellen Quellcode.   node scripts/tech-debt.ts */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : walk(p)) : p.endsWith('.ts') ? [p] : [];
  });
}
const read = (p: string): SourceFile => ({ path: relative('.', p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') });
const sources = ['apps', 'services', 'packages'].flatMap((d) => walk(d)).map(read);
const tests = walk('tests').map(read);
const report = analyzeDebt(sources, tests);
writeFileSync('docs/tech-debt.md', renderDebtMarkdown(report, new Date().toISOString().slice(0, 10)));
console.log(`docs/tech-debt.md: ${report.files} Dateien, ${report.lines} Zeilen, ${report.items.length} priorisierte Punkte, ${report.todo} TODO/FIXME`);
