import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { approveSource } from '../services/acquisition/src/sources.ts';
import { TED_SOURCE_ID } from '../services/acquisition/src/connectors/ted.ts';
import { ConfigError, loadConfig } from '../services/core-api/src/config.ts';
import { createContext } from '../services/core-api/src/context-node.ts';
import { hashPassword, randomToken } from '../packages/shared/src/crypto.ts';
import { getEnv, isUnset, readEnvFile, readHidden, setEnv, writeEnvFile } from './lib/env-file.ts';
import { checkStripeKey } from './lib/stripe-check.ts';

/**
 * Automatische lokale Einrichtung (idempotent, überschreibt keine gesetzten Werte):
 *   npm run setup                         .env, Signaturschlüssel, Owner-Zugang, Datenbank
 *   npm run setup -- --approve-ted        zusätzlich TED-Quelle als Eigentümer freigeben
 *   npm run setup -- --stripe             Stripe-TEST-Schlüssel verdeckt abfragen, prüfen und eintragen
 * Erstellt KEINE Konten und übermittelt nichts an Dritte außer der Schlüsselprüfung bei Stripe (--stripe).
 */
const args = new Set(process.argv.slice(2));
const ENV = '.env';
const lines = readEnvFile(ENV, '.env.example');
const done: string[] = [];

for (const key of ['DOWNLOAD_SIGNING_KEY', 'MOCK_WEBHOOK_SECRET'] as const) {
  if (isUnset(getEnv(lines, key))) {
    setEnv(lines, key, key === 'MOCK_WEBHOOK_SECRET' ? `whsec_local${randomToken(24).replace(/[^A-Za-z0-9]/g, '')}` : randomToken(32));
    done.push(`${key} erzeugt`);
  }
}

if (isUnset(getEnv(lines, 'OWNER_PASSWORD_HASH'))) {
  const pw = `${randomToken(9)}-${randomToken(9)}`;
  setEnv(lines, 'OWNER_PASSWORD_HASH', hashPassword(pw));
  mkdirSync('data', { recursive: true });
  writeFileSync(
    'data/ZUGANG-OWNER.txt',
    `INFINITY EARN – Owner-Zugang (lokal, nicht teilen)\nDashboard: http://localhost:${getEnv(lines, 'PORT') ?? '8787'}/login\nPasswort: ${pw}\n\nÄndern: npm run owner:password und den neuen Hash in .env eintragen. Danach diese Datei löschen.\n`,
    { mode: 0o600 },
  );
  done.push('Owner-Passwort erzeugt → data/ZUGANG-OWNER.txt');
}

if (args.has('--stripe-cli')) {
  // Übernimmt den Testschlüssel aus der lokal angemeldeten Stripe CLI und erzeugt das Webhook-Secret.
  // Werte werden nur lokal von Datei zu Datei übertragen und nie ausgegeben.
  const run = (cmd: string): string => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
    } catch (e) {
      console.error(`ABGELEHNT: "${cmd.split(' ').slice(0, 3).join(' ')}" fehlgeschlagen – ist die Stripe CLI installiert und "stripe login" erfolgt?`);
      console.error((e as Error).message.split('\n')[0]);
      process.exit(2);
    }
  };
  const cfg = run('stripe config --list');
  const sk = /test_mode_api_key\s*=\s*['"]?((?:sk|rk)_test_[A-Za-z0-9]+)/.exec(cfg)?.[1];
  if (!sk) {
    console.error('ABGELEHNT: Kein Testschlüssel in der Stripe CLI gefunden. Bitte zuerst "stripe login" ausführen.');
    process.exit(2);
  }
  const wh = run('stripe listen --print-secret').trim().split(/\s+/).find((t) => /^whsec_[A-Za-z0-9]{16,}$/.test(t));
  if (!wh) {
    console.error('ABGELEHNT: Webhook-Secret konnte nicht ermittelt werden.');
    process.exit(2);
  }
  const check = await checkStripeKey(sk);
  if (!check.ok) {
    console.error(`ABGELEHNT: Stripe-Prüfung fehlgeschlagen (${check.reason}). Nichts gespeichert.`);
    process.exit(2);
  }
  setEnv(lines, 'STRIPE_SECRET_KEY', sk);
  setEnv(lines, 'STRIPE_WEBHOOK_SECRET', wh);
  setEnv(lines, 'PAYMENT_PROVIDER', 'stripe');
  done.push('Stripe-Testmodus aus Stripe CLI übernommen und geprüft (livemode=false)');
  done.push('Für Webhooks parallel laufen lassen: stripe listen --forward-to localhost:8787/webhooks/payments');
}

if (args.has('--stripe')) {
  console.log('\nStripe-TESTMODUS einrichten. Geheimer Schlüssel der SANDBOX aus dem Stripe-Dashboard → Entwickler → API-Schlüssel.');
  console.log('Eingabe bleibt unsichtbar. Einfügen mit Rechtsklick, dann Enter.\n');
  const sk = await readHidden('Geheimer Testschlüssel (sk_test_… oder rk_test_…): ');
  if (/^(sk|rk)_live_/.test(sk)) {
    console.error('ABGELEHNT: Live-Schlüssel sind bis zur Live-Freigabe (M3) gesperrt.');
    process.exit(2);
  }
  if (!/^(sk|rk)_test_[A-Za-z0-9]{10,}$/.test(sk)) {
    console.error('ABGELEHNT: kein gültiger Stripe-Testschlüssel.');
    process.exit(2);
  }
  // Webhook-Secret automatisch über die angemeldete Stripe CLI, sonst manuell.
  let wh: string;
  try {
    wh = execSync(`"${process.env.STRIPE_CLI ?? 'stripe'}" listen --print-secret`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })
      .trim().split(/\s+/).find((t) => /^whsec_[A-Za-z0-9]{16,}$/.test(t)) ?? '';
    if (wh) console.log('Webhook-Secret automatisch aus der Stripe CLI übernommen.');
  } catch {
    wh = '';
  }
  if (!wh) wh = await readHidden('Webhook-Signing-Secret (whsec_…): ');
  if (!/^whsec_[A-Za-z0-9]{16,}$/.test(wh)) {
    console.error('ABGELEHNT: kein gültiges whsec_-Secret.');
    process.exit(2);
  }
  const check = await checkStripeKey(sk);
  if (!check.ok) {
    console.error(`ABGELEHNT: Stripe-Prüfung fehlgeschlagen (${check.reason}). Nichts gespeichert.`);
    process.exit(2);
  }
  setEnv(lines, 'STRIPE_SECRET_KEY', sk);
  setEnv(lines, 'STRIPE_WEBHOOK_SECRET', wh);
  setEnv(lines, 'PAYMENT_PROVIDER', 'stripe');
  done.push('Stripe-Testmodus eingetragen und geprüft (livemode=false)');
}

writeEnvFile(ENV, lines);

const env: Record<string, string | undefined> = { ...process.env };
for (const l of lines) {
  const i = l.indexOf('=');
  if (i > 0 && !l.startsWith('#')) env[l.slice(0, i)] = l.slice(i + 1);
}
let config;
try {
  config = loadConfig(env);
} catch (e) {
  console.error(e instanceof ConfigError ? `KONFIGURATION ABGELEHNT: ${e.message}` : e);
  process.exit(2);
}
const ctx = createContext(config);
done.push(`Datenbank bereit (${config.dbPath})`);

if (args.has('--approve-ted')) {
  const src = ctx.db.get<{ status: string }>('SELECT status FROM sources WHERE source_id = ?', TED_SOURCE_ID);
  if (src?.status !== 'APPROVED') {
    approveSource(ctx, TED_SOURCE_ID, `TED legal notice + API-Doku geprüft ${new Date().toISOString().slice(0, 10)}; Freigabe durch Eigentümer (Einrichtungsanweisung)`, 'owner');
    done.push('TED-Quelle freigegeben (gilt 90 Tage; im Dashboard pausierbar)');
  } else done.push('TED-Quelle war bereits freigegeben');
}
ctx.db.close();

console.log('\nEinrichtung abgeschlossen:');
done.forEach((d) => console.log(`  ✓ ${d}`));
console.log(`\nZahlungsanbieter: ${config.payment.provider === 'stripe' ? 'Stripe TESTMODUS' : 'Mock (Test) – für Stripe: npm run setup -- --stripe'}`);
console.log('Start: npm run dev   ·   LIVE bleibt gesperrt (docs/compliance/live-activation-checklist.md)\n');
