import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomToken } from '../packages/shared/src/crypto.ts';

/**
 * Staging-Deployment (Cloudflare Workers, Free-Tarif):
 *   1. Prüfungen: Typecheck, Tests (kein Deploy bei roten Tests – Policy "deploy")
 *   2. Geheimnisse aus .dev.vars per `wrangler secret put` übertragen (Werte über stdin, nie in der Konsole)
 *   3. `wrangler deploy`
 * Voraussetzung: `npx wrangler login` (Eigentümer bestätigt im Browser).
 */
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (cmd: string, input?: string): string =>
  execSync(cmd, { encoding: 'utf8', input, stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'], timeout: 300_000, shell: process.platform === 'win32' ? 'cmd.exe' : undefined });

console.log('1/3 Prüfungen (Typecheck + Tests) …');
try {
  run(`${npx} tsc -p tsconfig.json`);
  run('node --disable-warning=ExperimentalWarning --test "tests/unit/**/*.test.ts" "tests/integration/**/*.test.ts" "tests/security/**/*.test.ts"');
} catch (e) {
  console.error('ABGEBROCHEN: Prüfungen fehlgeschlagen – kein Deploy.');
  console.error(((e as { stdout?: string }).stdout ?? '').split('\n').filter((l) => /✖|fail|error/i.test(l)).slice(0, 10).join('\n'));
  process.exit(1);
}
run('node scripts/gen-migrations.ts');

const readVars = (): Record<string, string> => Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
if (!readVars().BACKUP_ENCRYPTION_KEY) {
  // Einmalig erzeugen; Wert wird nie ausgegeben. Ohne diesen Schlüssel sind die Sicherungen nicht wiederherstellbar.
  const sep = readFileSync('.dev.vars', 'utf8').endsWith('\n') ? '' : '\n';
  appendFileSync('.dev.vars', `${sep}BACKUP_ENCRYPTION_KEY=${randomToken(32)}\n`);
  if (existsSync('data/ZUGANG-STAGING.txt')) {
    appendFileSync('data/ZUGANG-STAGING.txt', 'Sicherungs-Schlüssel: liegt als BACKUP_ENCRYPTION_KEY in .dev.vars – sicher aufbewahren, ohne ihn sind die täglichen Sicherungen nicht entschlüsselbar.\n');
  }
  console.log('   ✓ Sicherungs-Schlüssel erzeugt (in .dev.vars, nicht angezeigt)');
}
const vars = readVars();
const names = ['MOCK_WEBHOOK_SECRET', 'DOWNLOAD_SIGNING_KEY', 'OWNER_PASSWORD_HASH', 'BACKUP_ENCRYPTION_KEY'];
for (const n of names) {
  if (!vars[n]) {
    console.error(`ABGEBROCHEN: ${n} fehlt in .dev.vars (npm run staging:secrets).`);
    process.exit(1);
  }
}

console.log('2/3 Deploy …');
const out = run(`${npx} wrangler deploy`);
const url = /https:\/\/[a-z0-9.-]+\.workers\.dev/.exec(out)?.[0];
console.log(url ? `   ✓ ${url}` : out.split('\n').slice(-15).join('\n'));

console.log('3/3 Geheimnisse übertragen (gebündelt, Werte nie in der Konsole) …');
const tmp = join(mkdtempSync(join(tmpdir(), 'ie-sec-')), 'secrets.json');
try {
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(names.map((n) => [n, vars[n]]))), { mode: 0o600 });
  run(`${npx} wrangler secret bulk "${tmp}"`);
  names.forEach((n) => console.log(`   ✓ ${n}`));
} finally {
  rmSync(tmp, { force: true });
}
console.log(url ? `STAGING ONLINE: ${url}` : 'Deploy abgeschlossen – URL siehe Ausgabe oben.');
