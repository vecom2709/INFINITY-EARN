/**
 * 128 Technische Altlasten: priorisiert Wartung anhand messbarer Signale im Quellcode (Größe, offene Markierungen,
 * fehlende Tests je Bereich). Reine Analyse – ändert nichts und umgeht keine Prüfungen (Releases nur nach `npm run verify`).
 */
export interface SourceFile { path: string; text: string }
export interface DebtItem { path: string; score: number; reasons: string[] }
export interface DebtReport { files: number; lines: number; todo: number; largest: { path: string; lines: number }[]; untestedAreas: string[]; items: DebtItem[] }

const MARKER = /\b(TODO|FIXME|HACK|XXX)\b/g;

export function analyzeDebt(sources: SourceFile[], tests: SourceFile[]): DebtReport {
  const testText = tests.map((t) => t.text).join('\n');
  const items: DebtItem[] = [];
  let lines = 0;
  let todo = 0;
  const areas = new Map<string, boolean>();
  for (const f of sources) {
    const n = f.text.split('\n').length;
    lines += n;
    const markers = (f.text.match(MARKER) ?? []).length;
    todo += markers;
    const area = f.path.split('/').slice(0, 3).join('/');
    const base = f.path.split('/').pop()?.replace(/\.ts$/, '') ?? '';
    const referenced = testText.includes(`/${base}.ts`);
    areas.set(area, (areas.get(area) ?? false) || referenced);
    const reasons: string[] = [];
    let score = 0;
    if (n > 400) { score += Math.min(5, Math.floor(n / 200)); reasons.push(`${n} Zeilen – aufteilen erwägen`); }
    if (markers) { score += markers * 2; reasons.push(`${markers} offene Markierung(en) (TODO/FIXME)`); }
    if (!referenced && !/\/(types|index)\.ts$/.test(f.path) && !f.path.includes('generated')) { score += 3; reasons.push('von keinem Test direkt importiert'); }
    if (score > 0) items.push({ path: f.path, score, reasons });
  }
  const largest = sources.map((f) => ({ path: f.path, lines: f.text.split('\n').length })).sort((a, b) => b.lines - a.lines).slice(0, 5);
  return { files: sources.length, lines, todo, largest, untestedAreas: [...areas].filter(([, t]) => !t).map(([a]) => a).sort(), items: items.sort((a, b) => b.score - a.score).slice(0, 15) };
}

export function renderDebtMarkdown(r: DebtReport, date: string): string {
  return [
    `# Technische Altlasten – Bericht ${date}`, '',
    `Quelldateien: ${r.files} · Zeilen: ${r.lines} · offene Markierungen: ${r.todo}`, '',
    '## Priorisierte Punkte', '', '| Punkte | Datei | Gründe |', '|---|---|---|',
    ...r.items.map((i) => `| ${i.score} | \`${i.path}\` | ${i.reasons.join('; ')} |`), '',
    '## Größte Dateien', '', ...r.largest.map((l) => `- \`${l.path}\` – ${l.lines} Zeilen`), '',
    '## Bereiche ohne direkten Testbezug', '', ...(r.untestedAreas.length ? r.untestedAreas.map((a) => `- \`${a}\``) : ['- keine']), '',
    'Releases nur nach `npm run verify` (Typecheck, Lint, alle Tests, E2E, Testmatrix, Build).', '',
  ].join('\n');
}
