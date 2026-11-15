import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * 17.0 Funktionsprüfmatrix: prüft für jede der 157 bestätigten Funktionen, ob ihre Nachweistests existieren und im
 * AKTUELLEN Lauf bestehen, und leitet daraus den Status ab. Schreibt FABLE_52_FEATURE_MATRIX.json (maschinenlesbar)
 * und FABLE_52_FEATURE_MATRIX.md.
 *   node scripts/fable-feature-matrix.ts
 * Statusregeln (streng, nichts wird hochgestuft):
 *   SPECIFIED         nur beschrieben, kein lauffähiger Nachweis
 *   IMPLEMENTED       teilweise umgesetzt (offene Teile benannt) ODER Nachweis fehlt/schlägt fehl
 *   VERIFIED          vollständig umgesetzt, alle Nachweistests vorhanden und bestanden
 *   PRODUCTION_READY  nur wenn zusätzlich alle rechtlichen/externen Freigaben vorliegen – derzeit 0 von 12 → nie vergeben
 *   LIVE_VERIFIED     nur nach echtem Live-Betrieb – nie vergeben
 *   BLOCKED           fehlende Voraussetzung (Ressource, Lizenz, Freigabe)
 */
interface Feature { id: string; title: string; title_de: string; status: 'TESTED' | 'SPECIFIED' | 'BLOCKED'; scope?: string; implemented: string; open: string; evidence?: string[]; test_command?: string; milestone: string }
const reg = JSON.parse(readFileSync('FEATURE_REGISTRY_157.json', 'utf8')) as { features: Feature[]; rejected: unknown; not_approved: unknown };

const files = [...new Set(reg.features.flatMap((f) => f.evidence ?? []))].sort();
const results = new Map<string, { exists: boolean; pass: number; fail: number; skipped: number; ms: number }>();
for (const file of files) {
  if (!existsSync(file)) { results.set(file, { exists: false, pass: 0, fail: 0, skipped: 0, ms: 0 }); continue; }
  const t = Date.now();
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', file], { encoding: 'utf8', timeout: 600_000 });
  const out = `${r.stdout}${r.stderr}`;
  const n = (k: string): number => Number(new RegExp(`^ℹ ${k} (\\d+)`, 'm').exec(out)?.[1] ?? 0);
  results.set(file, { exists: true, pass: n('pass'), fail: n('fail') + (r.status === 0 ? 0 : n('fail') === 0 ? 1 : 0), skipped: n('skipped'), ms: Date.now() - t });
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${file} (${n('pass')} bestanden, ${n('fail')} fehlgeschlagen, ${n('skipped')} übersprungen)`);
}

/** Quelldateien, die die Nachweistests tatsächlich importieren (Implementierungsort). */
function sources(evidence: string[]): string[] {
  const out = new Set<string>();
  for (const e of evidence) {
    if (!existsSync(e)) continue;
    for (const m of readFileSync(e, 'utf8').matchAll(/from '((?:\.\.\/)+(?:services|apps|packages|products|scripts)\/[^']+)'/g)) out.add((m[1] as string).replace(/^(\.\.\/)+/, ''));
  }
  return [...out].sort();
}

const rows = reg.features.map((f) => {
  const ev = f.evidence ?? [];
  const res = ev.map((e) => ({ file: e, ...(results.get(e) ?? { exists: false, pass: 0, fail: 0, skipped: 0, ms: 0 }) }));
  const missing = res.filter((r) => !r.exists).map((r) => r.file);
  const failing = res.filter((r) => r.exists && r.fail > 0).map((r) => r.file);
  const evidenceOk = ev.length > 0 && missing.length === 0 && failing.length === 0;
  const previous = f.status === 'TESTED' ? `TESTED (${f.scope ?? '?'})` : f.status;
  const status = f.status === 'BLOCKED' ? 'BLOCKED' : f.status === 'SPECIFIED' ? 'SPECIFIED' : f.scope === 'full' && evidenceOk ? 'VERIFIED' : 'IMPLEMENTED';
  const problems = [...missing.map((m) => `Nachweis fehlt: ${m}`), ...failing.map((m) => `Test schlägt fehl: ${m}`)];
  return {
    id: Number(f.id), name: f.title_de, name_en: f.title, milestone: f.milestone, expected: f.implemented, implementation_files: sources(ev), evidence: ev,
    tests: { files: res.length, passed: res.reduce((a, r) => a + r.pass, 0), failed: res.reduce((a, r) => a + r.fail, 0), skipped: res.reduce((a, r) => a + r.skipped, 0) },
    test_command: f.test_command ?? null, previous_status: previous, problems, remaining: f.open || null, status,
  };
});

const counts = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
const meta = { generated_at: new Date().toISOString(), node: process.version, platform: process.platform, features: rows.length, counts, evidence_files: files.length, evidence_tests_passed: [...results.values()].reduce((a, r) => a + r.pass, 0), evidence_tests_failed: [...results.values()].reduce((a, r) => a + r.fail, 0), evidence_tests_skipped: [...results.values()].reduce((a, r) => a + r.skipped, 0), rejected: reg.rejected, not_approved: reg.not_approved, production_ready_rule: 'Nicht vergeben: 0 von 12 Live-Freigaben (LA-01..LA-12) erteilt.' };
writeFileSync('FABLE_52_FEATURE_MATRIX.json', `${JSON.stringify({ meta, features: rows }, null, 1)}\n`);

const esc = (s: string | null): string => (s ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const md = `# FABLE 5.2 – Funktionsprüfmatrix (157 bestätigte Funktionen)

Erzeugt von \`node scripts/fable-feature-matrix.ts\` am ${meta.generated_at} (${meta.platform}, Node ${meta.node}). Maschinenlesbar: \`FABLE_52_FEATURE_MATRIX.json\`.

**Was diese Matrix belegt:** Für jede Funktion wurden die im Register genannten Nachweistests in diesem Lauf ausgeführt (${meta.evidence_files} Testdateien, ${meta.evidence_tests_passed} Tests bestanden, ${meta.evidence_tests_failed} fehlgeschlagen, ${meta.evidence_tests_skipped} übersprungen). Der Status folgt streng daraus.
**Was sie nicht belegt:** eine neue, vollständige fachliche Tiefenprüfung jeder einzelnen Funktion. Tiefenprüfungen dieser Sitzung stehen in \`FABLE_52_COMPLETE_AUDIT.md\`.

| Status | Anzahl | Bedeutung |
|---|---|---|
${['VERIFIED', 'IMPLEMENTED', 'SPECIFIED', 'BLOCKED', 'PRODUCTION_READY', 'LIVE_VERIFIED'].map((s) => `| ${s} | ${counts[s] ?? 0} | ${{ VERIFIED: 'vollständig umgesetzt, Nachweistests bestanden', IMPLEMENTED: 'teilweise umgesetzt, offene Teile benannt', SPECIFIED: 'nur beschrieben', BLOCKED: 'Voraussetzung fehlt', PRODUCTION_READY: 'nicht vergeben – 0 von 12 Live-Freigaben', LIVE_VERIFIED: 'nicht vergeben – kein Live-Betrieb' }[s]} |`).join('\n')}

Abgelehnt und nicht enthalten: 48, 49, 110. Nicht als eigene Module bestätigt: 141–145.

| Nr. | Name | Tatsächlich umgesetzt und getestet | Implementierung (aus den Tests) | Vorher | Tests (best./fehlg.) | Befunde | Offen | Status |
|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${esc(r.name)} | ${esc(r.expected)} | ${r.implementation_files.slice(0, 4).map((x) => `\`${x.split('/').slice(-2).join('/')}\``).join(', ') || '—'}${r.implementation_files.length > 4 ? ` +${r.implementation_files.length - 4}` : ''} | ${r.previous_status} | ${r.tests.files ? `${r.tests.passed}/${r.tests.failed}` : '—'} | ${esc(r.problems.join('; ') || 'keine')} | ${esc(r.remaining)} | **${r.status}** |`).join('\n')}

Testkommando je Funktion: Feld \`test_command\` in der JSON-Datei.
`;
writeFileSync('FABLE_52_FEATURE_MATRIX.md', md);
console.log(`MATRIX ${JSON.stringify(meta.counts)} · Nachweistests ${meta.evidence_tests_passed} bestanden, ${meta.evidence_tests_failed} fehlgeschlagen`);
