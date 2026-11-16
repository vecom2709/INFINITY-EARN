/**
 * Prüft ein von INFINITY EARN gebautes Programm mit REA (Reverse Engineer Anything) darauf, was ein Fremder aus der
 * ausgelieferten Datei herauslesen könnte: Debug-Dateien, Build-Pfade, Quelltext-Karten, Zugangsdaten.
 *
 *   node scripts/rea-audit.ts [pfad-zur-datei]        (Standard: products/win-lager/dist/win-lager/win-lager.exe)
 *
 * REA ist ein optionales Werkzeug auf dem PC des Eigentümers (kein Teil von `npm run verify`, läuft nicht auf GitHub).
 * Gesucht wird es über REA_NODE und REA_SCRIPT oder im Ordner `rea-tools` des Benutzerprofils.
 * Ist REA nicht vorhanden, endet das Skript mit „ÜBERSPRUNGEN“ (Exit 2) – das ist kein bestandener Test.
 * Nur für eigene Programme oder solche mit Berechtigung des Kunden.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface ExposureCheck { id: string; status: string; severity: string | null }
export interface ExposureVerdict { passed: boolean; exposed: string[]; assessed: number; notAssessed: string[]; summary: string }

/** Wertet den Bericht von `rea audit-release-exposure --json` aus. Bestanden nur ohne jeden Fund. */
export function judgeExposure(report: unknown): ExposureVerdict {
  const checks = (report as { normalized_result?: { checks?: ExposureCheck[] } })?.normalized_result?.checks;
  if (!Array.isArray(checks) || checks.length === 0) return { passed: false, exposed: [], assessed: 0, notAssessed: [], summary: 'Bericht unlesbar oder leer' };
  const exposed = checks.filter((c) => c.status === 'exposed').map((c) => `${c.id}${c.severity ? ` (${c.severity})` : ''}`);
  const notAssessed = checks.filter((c) => c.status === 'not_assessed' || c.status === 'unknown').map((c) => c.id);
  const assessed = checks.filter((c) => c.status === 'not_observed' || c.status === 'exposed').length;
  const passed = exposed.length === 0 && assessed > 0;
  return { passed, exposed, assessed, notAssessed, summary: passed ? `${assessed} Prüfungen ohne Fund, ${notAssessed.length} nicht bewertet` : exposed.length ? `Offengelegt: ${exposed.join(', ')}` : 'Keine Prüfung konnte bewertet werden' };
}

export function findRea(env: NodeJS.ProcessEnv = process.env): { node: string; script: string } | null {
  const root = join(homedir(), 'rea-tools');
  const node = env.REA_NODE ?? join(root, 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const script = env.REA_SCRIPT ?? join(root, 'rea', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs');
  return existsSync(node) && existsSync(script) ? { node, script } : null;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const target = resolve(process.argv[2] ?? 'products/win-lager/dist/win-lager/win-lager.exe');
  const rea = findRea();
  if (!rea) {
    console.log('ÜBERSPRUNGEN: REA ist auf diesem Rechner nicht eingerichtet (rea-tools fehlt). Nichts geprüft.');
    process.exit(2);
  }
  if (!existsSync(target)) {
    console.log(`ÜBERSPRUNGEN: Datei nicht gefunden: ${target}. Zuerst das Programm bauen.`);
    process.exit(2);
  }
  const r = spawnSync(rea.node, [rea.script, 'audit-release-exposure', target, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let verdict: ExposureVerdict;
  try {
    verdict = judgeExposure(JSON.parse(r.stdout));
  } catch {
    verdict = { passed: false, exposed: [], assessed: 0, notAssessed: [], summary: `REA lieferte keinen lesbaren Bericht (Exit ${r.status})` };
  }
  console.log(`REA-PRÜFUNG ${verdict.passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}: ${verdict.summary}`);
  if (verdict.notAssessed.length) console.log(`Nicht bewertet: ${verdict.notAssessed.join(', ')}`);
  process.exit(verdict.passed ? 0 : 1);
}
