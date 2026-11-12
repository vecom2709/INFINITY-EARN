import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../services/core-api/src/config.ts';
import { STRIPE_API_VERSION } from '../services/finance/src/providers/stripe.ts';

/**
 * npm run checkout:url -- <order_id>   (ohne Argument: neueste offene Stripe-Bestellung)
 * Zeigt die Bezahl-URL einer offenen Stripe-Checkout-Sitzung (nur lesend), z. B. wenn die Weiterleitung abbrach.
 */
const c = loadConfig();
if (c.payment.provider !== 'stripe' || !c.payment.stripeSecretKey) {
  console.log('Stripe ist nicht konfiguriert.');
  process.exit(1);
}
const db = new DatabaseSync(c.dbPath, { readOnly: true });
const orderId = process.argv[2];
const row = (orderId
  ? db.prepare(`SELECT order_id, checkout_session_id FROM orders WHERE order_id = ?`).get(orderId)
  : db.prepare(`SELECT order_id, checkout_session_id FROM orders WHERE payment_provider = 'stripe' AND payment_state = 'UNPAID' ORDER BY created_at DESC LIMIT 1`).get()) as
  { order_id: string; checkout_session_id: string | null } | undefined;
if (!row?.checkout_session_id?.startsWith('cs_test_')) {
  console.log('Keine offene Stripe-Testsitzung gefunden.');
  process.exit(1);
}
const res = await fetch(`${c.payment.stripeApiBase}/v1/checkout/sessions/${encodeURIComponent(row.checkout_session_id)}`, {
  headers: { authorization: `Bearer ${c.payment.stripeSecretKey}`, 'stripe-version': STRIPE_API_VERSION },
  signal: AbortSignal.timeout(15_000),
});
const s = (await res.json()) as { url?: string; status?: string; livemode?: boolean };
if (s.livemode !== false) {
  console.log('ABGELEHNT: keine Testsitzung.');
  process.exit(1);
}
console.log(`Auftrag ${row.order_id} · Sitzung ${s.status}`);
console.log(s.url ?? '(keine URL – Sitzung abgelaufen oder abgeschlossen)');
