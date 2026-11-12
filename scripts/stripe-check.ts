import { loadConfig } from '../services/core-api/src/config.ts';
import { STRIPE_API_VERSION } from '../services/finance/src/providers/stripe.ts';
import { checkStripeKey } from './lib/stripe-check.ts';

/** npm run stripe:check – prüft den Stripe-Testschlüssel (nur lesend) und zeigt Kontoname/-ID, nie den Schlüssel. */
const c = loadConfig();
if (c.payment.provider !== 'stripe' || !c.payment.stripeSecretKey) {
  console.log('Stripe ist nicht konfiguriert (PAYMENT_PROVIDER=mock). Einrichten: npm run setup -- --stripe');
  process.exit(0);
}
const r = await checkStripeKey(c.payment.stripeSecretKey, undefined, c.payment.stripeApiBase);
if (!r.ok) {
  console.log(`FEHLER: ${r.reason}`);
  process.exit(1);
}
const res = await fetch(`${c.payment.stripeApiBase}/v1/account`, {
  headers: { authorization: `Bearer ${c.payment.stripeSecretKey}`, 'stripe-version': STRIPE_API_VERSION },
  signal: AbortSignal.timeout(15_000),
});
const acct = (await res.json().catch(() => ({}))) as { id?: string; settings?: { dashboard?: { display_name?: string } }; business_profile?: { name?: string } };
const name = acct.settings?.dashboard?.display_name ?? acct.business_profile?.name ?? '(ohne Namen)';
console.log(`OK: Testschlüssel gültig, livemode=false · Konto ${acct.id ?? '(unbekannt, Schlüssel ohne Kontoleserecht)'} · ${name}`);
