import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autopilotTick } from '../services/core-api/src/autopilot.ts';
import { loadConfig } from '../services/core-api/src/config.ts';
import { createContext } from '../services/core-api/src/context-node.ts';
import { getOrder } from '../services/core-api/src/orders.ts';
import { startServer } from '../services/core-api/src/server.ts';
import { acceptQuote, autoProcessOpportunity } from '../services/core-api/src/workflow.ts';
import { submitInboundLead } from '../services/acquisition/src/leads.ts';
import { startCheckout } from '../services/finance/src/checkout.ts';
import { providerFor } from '../services/finance/src/providers/index.ts';
import { downloadArtifact, getDeliveryByOrder, issueDownloadToken } from '../services/product-factory/src/delivery.ts';

/**
 * Vollständiger Testauftrag mit ECHTEM Stripe-Testmodus, lokal (16.0, Phase G):
 * lokaler Server (127.0.0.1) + `stripe listen` leitet echte, signierte Stripe-Webhooks weiter →
 * Anfrage → Angebot → Annahme → Stripe-Checkout (Testmodus) → Zahlung mit Stripe-Testkarte →
 * signierter Webhook → Produktion → Abnahme → Lieferung → Download.
 * Nur Testschlüssel (sk_test_/rk_test_); Schlüssel werden nie ausgegeben. Kein Live-Geld möglich.
 *
 *   node --env-file=.env scripts/stripe-e2e-local.ts
 */
const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
if (!/^(sk|rk)_test_/.test(key)) {
  console.error('ABGEBROCHEN: kein Stripe-TESTschlüssel in .env');
  process.exit(1);
}
const PORT = 8799;
const origin = `http://127.0.0.1:${PORT}`;
const stripeBin = process.platform === 'win32' ? 'stripe.exe' : 'stripe';
const whsec = execFileSync(stripeBin, ['listen', '--api-key', key, '--print-secret'], { encoding: 'utf8' }).trim();
if (!/^whsec_/.test(whsec)) throw new Error('Webhook-Schlüssel der Stripe-CLI nicht erhalten');

const dir = mkdtempSync(join(tmpdir(), 'ie-stripe-e2e-'));
const config = loadConfig({
  ...process.env, ENVIRONMENT: 'development', PAYMENT_PROVIDER: 'stripe', STRIPE_WEBHOOK_SECRET: whsec,
  ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf', DATABASE_URL: join(dir, 'core.db'), ARTIFACTS_DIR: join(dir, 'artifacts'), EXPORTS_DIR: join(dir, 'exports'), APP_PUBLIC_ORIGIN: origin,
});
const ctx = createContext(config);
const server = await startServer(ctx, PORT, '127.0.0.1');
const listen = spawn(stripeBin, ['listen', '--api-key', key, '--forward-to', `${origin}/webhooks/payments`, '--events', 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,payment_intent.payment_failed'], { stdio: ['ignore', 'pipe', 'pipe'] });
let forwarded = 0;
listen.stdout.on('data', (d: Buffer) => { forwarded += (d.toString().match(/-->/g) ?? []).length; });
await new Promise<void>((res, rej) => {
  const t = setTimeout(() => rej(new Error('stripe listen nicht bereit')), 60_000);
  listen.stderr.on('data', (d: Buffer) => { if (/Ready!/.test(d.toString())) { clearTimeout(t); res(); } });
});
console.log('1 Lokaler Server und Stripe-Weiterleitung bereit');

const lead = submitInboundLead(ctx, {
  name: 'E2E Testkunde', email: 'e2e-test@example.invalid', company: 'Testfirma E2E', country: 'DE', message: 'Testauftrag E2E (Stripe-Testmodus)',
  privacyAccepted: true, marketingConsent: false,
  request: { capabilityId: 'b2b-calc-pdf', scope: { title: 'E2E-Kalkulation', currency: 'EUR', margin_bps: 2000, language: 'de', items: [{ name: 'Montage', quantity: 10, unit_cost_minor: 4500 }, { name: 'Material', quantity: 3, unit_cost_minor: 12050 }] } },
}, { ipHash: 'e2e' });
const auto = autoProcessOpportunity(ctx, lead.opportunityId);
if (auto.stage !== 'QUOTED') throw new Error(`Kein Angebot: ${JSON.stringify(auto)}`);
const acc = acceptQuote(ctx, auto.quote.quoteId, auto.quote.acceptanceToken, { termsAccepted: true, ipHash: 'e2e', buyer: { name: 'Testfirma E2E', address: 'Teststraße 1, 12345 Teststadt', country: 'DE', type: 'B2B', vatId: null } });
const co = await startCheckout(ctx, acc.orderId, providerFor(ctx));
console.log(`2 Angebot angenommen, Stripe-Checkout (Testmodus) erstellt: ${co.sessionId.slice(0, 14)}…`);
console.log(`CHECKOUT_URL ${co.url}`);

const until = Date.now() + 15 * 60_000;
while (getOrder(ctx, acc.orderId).payment_state !== 'CONFIRMED') {
  if (Date.now() > until) { console.log('ABGEBROCHEN: keine Zahlung innerhalb von 15 Minuten'); process.exit(3); }
  await new Promise((r) => setTimeout(r, 3000));
}
console.log(`3 Zahlung von Stripe per signiertem Webhook bestätigt (${forwarded} Ereignis(se) weitergeleitet)`);
const t = autopilotTick(ctx);
const del = getDeliveryByOrder(ctx, acc.orderId);
console.log(`4 Autopilot-Takt: Produktion ${t.production.results.map((r) => r.outcome).join(', ') || '–'}, Lieferung ${del ? 'freigegeben' : 'FEHLT'}`);
const dl = del ? downloadArtifact(ctx, issueDownloadToken(ctx, del.delivery_id, acc.customerId), acc.customerAccessKey ?? undefined) : { ok: false as const, reason: 'keine Lieferung' };
console.log(`5 Download: ${dl.ok ? `${dl.filename} (${dl.bytes.length} Bytes, ${dl.mediaType})` : `FEHLER ${dl.reason}`}`);
const o = getOrder(ctx, acc.orderId);
console.log(`ERGEBNIS ${JSON.stringify({ order: acc.orderId, payment_state: o.payment_state, amount_minor: o.amount_minor, test_mode: o.test_mode, delivered: !!del, download_ok: dl.ok, invoices: t.invoices.length })}`);
listen.kill();
server.close();
process.exit(dl.ok ? 0 : 4);
