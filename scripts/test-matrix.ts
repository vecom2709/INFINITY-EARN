import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Erzeugt docs/TESTMATRIX.md: Welche IE-001..IE-100 sind als ausführbarer Test abgebildet
 * (Test-Titel enthält die ID), welche sind ausdrücklich offen (tests/open-cases.json).
 * Nichts wird als erledigt markiert, das nicht als Test existiert.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.test.ts') ? [p] : [];
  });
}

const spec = readFileSync('docs/spec/TESTS_100.md', 'utf8');
const specRows = new Map<string, { title: string; expected: string }>();
for (const m of spec.matchAll(/^\| (IE-\d{3}) \| ([^|]+) \| ([^|]+) \|/gm)) specRows.set(m[1] as string, { title: (m[2] as string).trim(), expected: (m[3] as string).trim() });

const covered = new Map<string, Set<string>>();
for (const file of walk('tests')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\b(?:test|it)\(\s*['"`]([^'"`]*)/g)) {
    for (const id of (m[1] as string).match(/IE-\d{3}/g) ?? []) {
      covered.set(id, (covered.get(id) ?? new Set()).add(relative('.', file).replace(/\\/g, '/')));
    }
  }
}
const open = JSON.parse(readFileSync('tests/open-cases.json', 'utf8')) as Record<string, string>;

const lines = ['# Abnahmematrix IE-001 … IE-100', '', `Automatisch erzeugt von \`npm run test:matrix\` am ${new Date().toISOString().slice(0, 10)}.`, '',
  '| ID | Fall | Status | Nachweis |', '|---|---|---|---|'];
let done = 0;
for (let i = 1; i <= 100; i++) {
  const id = `IE-${String(i).padStart(3, '0')}`;
  const row = specRows.get(id);
  const files = covered.get(id);
  if (files) done++;
  const status = files ? 'automatisiert' : open[id] ? 'offen' : 'FEHLT';
  const proof = files ? [...files].join(', ') : open[id] ?? 'keine Zuordnung';
  lines.push(`| ${id} | ${row?.title ?? '?'} | ${status} | ${proof} |`);
}
lines.splice(4, 0, `**${done} von 100** Abnahmefällen sind als ausführbare Tests abgebildet; die übrigen sind mit Begründung und Ziel-Meilenstein als offen markiert.`, '');
writeFileSync('docs/TESTMATRIX.md', lines.join('\n') + '\n');
const missing = [...Array(100).keys()].map((i) => `IE-${String(i + 1).padStart(3, '0')}`).filter((id) => !covered.has(id) && !open[id]);
console.log(`${done}/100 automatisiert · ${100 - done - missing.length} offen dokumentiert · ${missing.length} ohne Zuordnung`);
if (missing.length) {
  console.error(`Ohne Zuordnung: ${missing.join(', ')}`);
  process.exit(1);
}
