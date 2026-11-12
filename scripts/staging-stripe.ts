import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STRIPE_API_VERSION } from '../services/finance/src/providers/stripe.ts';

/**
 * Stripe-TESTMODUS für Staging einrichten:
 *   node scripts/staging-stripe.ts <STAGING_URL> <erwartete acct_-ID der Sandbox> [--recreate]
 * 1. Testschlüssel aus .env lesen, prüfen (livemode=false, richtiges Sandbox-Konto)
 * 2. Webhook-Endpunkt <STAGING_URL>/webhooks/payments anlegen (nur benötigte Events)
 * 3. STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET per `wrangler secret bulk` übertragen
 * Geheimnisse werden nie ausgegeben; die temporäre Datei wird sofort gelöscht.
 */
const [stagingUrl, expectedAccount] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const recreate = process.argv.includes('--recreate');
if (!stagingUrl?.startsWith('https://') || !expectedAccount?.startsWith('acct_')) {
  console.error('Aufruf: node scripts/staging-stripe.ts https://<staging> acct_… [--recreate]');
  process.exit(2);
}
const EVENTS = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
  'payment_intent.payment_failed', 'charge.refunded', 'charge.dispute.created', 'payout.paid', 'payout.failed',
];
const endpointUrl = `${stagingUrl.replace(/\/$/, '')}/webhooks/payments`;

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const key = env.STRIPE_SECRET_KEY ?? '';
if (!/^(sk|rk)_test_/.test(key)) {
  console.error('ABGELEHNT: Kein Stripe-TESTschlüssel in .env (npm run setup -- --stripe).');
  process.exit(2);
}

async function stripe(method: 'GET' | 'POST' | 'DELETE', path: string, params?: Record<string, string | string[]>): Promise<Record<string, unknown>> {
  const body = params
    ? Object.entries(params).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`) : [`${encodeURIComponent(k)}=${encodeURIComponent(v)}`])).join('&')
    : undefined;
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'stripe-version': STRIPE_API_VERSION, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${String((json.error as { message?: string } | undefined)?.message ?? 'Fehler').slice(0, 120)}`);
  if (json.livemode === true) throw new Error('LIVEMODE_REFUSED');
  return json;
}

const acct = await stripe('GET', '/v1/account');
if (acct.id !== expectedAccount) {
  console.error(`ABGELEHNT: Schlüssel gehört zu ${String(acct.id)}, erwartet ${expectedAccount}.`);
  process.exit(2);
}
console.log(`✓ Stripe-Testkonto ${expectedAccount} bestätigt (livemode=false)`);

const list = (await stripe('GET', '/v1/webhook_endpoints?limit=100')).data as { id: string; url: string }[];
const existing = list.filter((e) => e.url === endpointUrl);
if (existing.length && !recreate) {
  console.error(`ABGEBROCHEN: Endpunkt existiert bereits (${existing.map((e) => e.id).join(', ')}). Das Secret ist nur bei Anlage abrufbar → mit --recreate neu anlegen.`);
  process.exit(1);
}
for (const e of existing) {
  await stripe('DELETE', `/v1/webhook_endpoints/${e.id}`);
  console.log(`✓ Alter Endpunkt ${e.id} entfernt`);
}
const created = await stripe('POST', '/v1/webhook_endpoints', {
  url: endpointUrl,
  'enabled_events[]': EVENTS,
  description: 'INFINITY EARN Staging (Testmodus)',
  'metadata[project]': 'infinity-earn-staging',
});
const secret = typeof created.secret === 'string' ? created.secret : '';
if (!/^whsec_/.test(secret)) {
  console.error('ABGELEHNT: Kein Webhook-Secret in der Antwort.');
  process.exit(1);
}
console.log(`✓ Webhook-Endpunkt ${String(created.id)} → ${endpointUrl} (${EVENTS.length} Events)`);

const dir = mkdtempSync(join(tmpdir(), 'ie-sec-'));
const tmp = join(dir, 'secrets.json');
try {
  writeFileSync(tmp, JSON.stringify({ STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: secret }), { mode: 0o600 });
  execSync(`${process.platform === 'win32' ? 'npx.cmd' : 'npx'} wrangler secret bulk "${tmp}"`, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000, shell: process.platform === 'win32' ? 'cmd.exe' : undefined });
  console.log('✓ STRIPE_SECRET_KEY und STRIPE_WEBHOOK_SECRET als Cloudflare-Geheimnisse gesetzt');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('Nächster Schritt: PAYMENT_PROVIDER="stripe" in wrangler.jsonc und `npm run staging:deploy`.');
