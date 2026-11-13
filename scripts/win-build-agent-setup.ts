import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Richtet den GitHub-Windows-Server als Bau-Agenten für STAGING ein (Funktion 157/158):
 *   - Geheimnis WIN_BUILD_AGENT_TOKEN = BUILD_AGENT_TOKEN aus .dev.vars (über stdin, nie angezeigt)
 *   - Repository-Variable WIN_BUILD_AGENT_URL = APP_PUBLIC_ORIGIN aus wrangler.jsonc
 * Voraussetzung: gh angemeldet; Schlüssel existiert (entsteht beim Staging-Deploy). Nicht für LIVE.
 *
 *   node scripts/win-build-agent-setup.ts
 */
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const token = vars.BUILD_AGENT_TOKEN ?? '';
if (token.length < 32) {
  console.error('ABGEBROCHEN: BUILD_AGENT_TOKEN fehlt in .dev.vars – erst node scripts/staging-deploy.ts ausführen.');
  process.exit(1);
}
const url = /"APP_PUBLIC_ORIGIN":\s*"(https:\/\/[^"]+)"/.exec(readFileSync('wrangler.jsonc', 'utf8'))?.[1];
if (!url || !/staging/.test(url)) {
  console.error('ABGEBROCHEN: Staging-Adresse nicht gefunden (nur Staging wird eingerichtet).');
  process.exit(1);
}
const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
const repo = /github\.com[:/](.+?)(?:\.git)?$/.exec(remote)?.[1];
if (!repo) {
  console.error('ABGEBROCHEN: GitHub-Repository nicht erkannt.');
  process.exit(1);
}
const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
execFileSync(gh, ['secret', 'set', 'WIN_BUILD_AGENT_TOKEN', '--repo', repo], { input: token, stdio: ['pipe', 'ignore', 'inherit'] });
console.log('✓ Geheimnis WIN_BUILD_AGENT_TOKEN gesetzt (Wert nicht angezeigt)');
execFileSync(gh, ['variable', 'set', 'WIN_BUILD_AGENT_URL', '--repo', repo, '--body', url], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`✓ Variable WIN_BUILD_AGENT_URL = ${url}`);
