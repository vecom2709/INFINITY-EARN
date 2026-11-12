import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { hashPassword, randomToken } from '../packages/shared/src/crypto.ts';

/**
 * Erzeugt Staging-Geheimnisse (einmalig, überschreibt nichts):
 *  - .dev.vars                         für `wrangler dev` (git-ignoriert)
 *  - data/ZUGANG-STAGING.txt           Owner-Passwort für das Staging-Dashboard (git-ignoriert)
 * Für das Deployment werden dieselben Werte per `wrangler secret put` übertragen (scripts/staging-deploy.ts).
 */
if (existsSync('.dev.vars')) {
  console.log('.dev.vars existiert bereits – nichts geändert.');
  process.exit(0);
}
const alnum = (n: number): string => randomToken(n * 2).replace(/[^A-Za-z0-9]/g, '').slice(0, n);
const pw = `${randomToken(9)}-${randomToken(9)}`;
const vars = {
  MOCK_WEBHOOK_SECRET: `whsec_staging${alnum(32)}`,
  DOWNLOAD_SIGNING_KEY: randomToken(32),
  OWNER_PASSWORD_HASH: hashPassword(pw),
};
writeFileSync('.dev.vars', Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
mkdirSync('data', { recursive: true });
writeFileSync('data/ZUGANG-STAGING.txt', `INFINITY EARN – STAGING Owner-Zugang (nicht teilen)\nPasswort: ${pw}\n`, { mode: 0o600 });
console.log('Staging-Geheimnisse erzeugt: .dev.vars, Owner-Passwort in data/ZUGANG-STAGING.txt');
