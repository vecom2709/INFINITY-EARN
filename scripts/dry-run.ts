import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { formatMinor } from '../packages/contracts/src/money.ts';
import { submitInboundLead } from '../services/acquisition/src/leads.ts';
import { autopilotTick } from '../services/core-api/src/autopilot.ts';
import { loadConfig } from '../services/core-api/src/config.ts';
import { createContext } from '../services/core-api/src/context-node.ts';
import { getOrder } from '../services/core-api/src/orders.ts';
import { acceptQuote, autoProcessOpportunity, createCheckout } from '../services/core-api/src/workflow.ts';
import { computeKpis } from '../services/finance/src/kpis.ts';
import { mockPay, mockPayout } from '../services/finance/src/mock-provider.ts';
import { buildTestCamt053, importBankStatement } from '../services/finance/src/bank-statement.ts';
import { downloadArtifact, getDeliveryByOrder, issueDownloadToken } from '../services/product-factory/src/delivery.ts';

/**
 * Vollständiger Dry Run (M0): Qualifizierung -> Angebot -> Annahme -> Mock-Payment -> Produktion/QA ->
 * Test-Auslieferung -> Test-Beleg -> Reconciliation -> Mock-Auszahlung. Eigene Wegwerf-Datenbank,
 * keine Livebuchung. Bericht unter data/dryrun/.
 */
const work = mkdtempSync(join(tmpdir(), 'infinity-dryrun-'));
const config = loadConfig({
  ENVIRONMENT: 'test',
  DATABASE_URL: join(work, 'dryrun.sqlite'),
  ARTIFACTS_DIR: join(work, 'artifacts'),
  EXPORTS_DIR: join(work, 'exports'),
  MIGRATIONS_DIR: resolve('db/migrations'),
  DOWNLOAD_SIGNING_KEY: 'dryrun-signing-key-0123456789abcdef0123',
  MOCK_WEBHOOK_SECRET: 'whsec_dryrun_0123456789abcdef0123',
});
const ctx = createContext(config);
const steps: { step: string; result: string }[] = [];
const step = (s: string, r: string): void => {
  steps.push({ step: s, result: r });
  console.log(`✓ ${s.padEnd(34)} ${r}`);
};

const lead = submitInboundLead(ctx, {
  name: 'Dry Run GmbH', email: 'dryrun@example.invalid', company: 'Dry Run GmbH', country: 'DE', message: 'Bitte Kalkulation für Montageauftrag.',
  privacyAccepted: true, marketingConsent: false,
  request: { capabilityId: 'b2b-calc-csv', scope: { title: 'Montage Halle 3', currency: 'EUR', margin_bps: 2000, language: 'de', items: [
    { name: 'Montage', quantity: 10, unit_cost_minor: 4500 }, { name: 'Material', quantity: 3, unit_cost_minor: 12050 }] } },
}, { ipHash: 'dryrun' });
step('Inbound-Lead erfasst', `${lead.leadId} / ${lead.opportunityId}`);

const auto = autoProcessOpportunity(ctx, lead.opportunityId);
if (auto.stage !== 'QUOTED') throw new Error(`Dry Run abgebrochen: ${JSON.stringify(auto)}`);
step('Qualifiziert + Angebot erstellt', `${auto.quote.quoteId} = ${formatMinor(auto.quote.grossTotalMinor, auto.quote.currency)} ${auto.quote.currency}`);

const acc = acceptQuote(ctx, auto.quote.quoteId, auto.quote.acceptanceToken, {
  termsAccepted: true, ipHash: 'dryrun', buyer: { name: 'Dry Run GmbH', address: 'Teststraße 1, 10115 Berlin', country: 'DE', type: 'B2B', vatId: null },
});
step('Angebot angenommen', acc.orderId);

const checkout = createCheckout(ctx, acc.orderId);
step('Checkout (Mock) erstellt', checkout.sessionId);

const pay = mockPay(ctx, getOrder(ctx, acc.orderId));
step('Mock-Payment-Webhook (signiert)', `${pay.eventId} → ${pay.detail}`);

const tick = autopilotTick(ctx);
step('Produktion + QA + Lieferung', tick.production.results.map((r) => r.outcome).join(','));
step('Testbeleg', tick.invoices.map((i) => `${i.number} (${i.status})`).join(','));
step('Reconciliation', `${tick.reconciliation?.status} – ${tick.reconciliation?.issues.length ?? 0} Abweichungen`);

const delivery = getDeliveryByOrder(ctx, acc.orderId);
const dl = delivery ? downloadArtifact(ctx, issueDownloadToken(ctx, delivery.delivery_id, acc.customerId), acc.customerAccessKey ?? undefined) : null;
if (!dl?.ok) throw new Error('Download fehlgeschlagen');
step('Download (Token + Kundenschlüssel)', `${dl.filename}, ${dl.bytes.byteLength} Bytes`);

const order = getOrder(ctx, acc.orderId);
const payout = mockPayout(ctx, [acc.orderId], order.amount_minor - 25 - Math.ceil(order.amount_minor * 0.015), order.currency);
step('Mock-Auszahlung (Provider gemeldet)', `${payout.eventId} → ${payout.detail}`);
const bank = importBankStatement(ctx, buildTestCamt053(ctx), 'system');
step('Bank-Testbeleg (camt.053, als TEST gekennzeichnet)', `${bank.matched.length} Auszahlung(en) bestätigt (${bank.matched.map((m) => m.rule).join(',')})`);

const finalState = ctx.db.get<{ pipeline_state: string }>('SELECT pipeline_state FROM opportunities WHERE opportunity_id = ?', lead.opportunityId)?.pipeline_state;
step('Endzustand Pipeline', String(finalState));
const live = computeKpis(ctx, false);
const test = computeKpis(ctx, true);
step('LIVE-Umsatz (muss 0 sein)', `${formatMinor(live.grossReceiptsMinor, live.currency)} ${live.currency}`);
step('TEST-Umsatz', `${formatMinor(test.grossReceiptsMinor, test.currency)} ${test.currency}, Gebühren ${formatMinor(test.feesMinor, test.currency)}`);

const events = ctx.db.all<{ event_type: string; event_id: string; subject_id: string | null; created_at: string }>(
  'SELECT event_type, event_id, subject_id, created_at FROM audit_events ORDER BY seq',
);
const report = {
  title: 'INFINITY EARN – M0 Dry Run (TESTMODUS, keine Livebuchung)',
  generated_at: new Date().toISOString(),
  final_pipeline_state: finalState,
  steps,
  kpis: { live, test },
  transitions: ctx.db.all('SELECT from_state, to_state, actor, reason, created_at FROM state_transitions WHERE opportunity_id = ? ORDER BY id', lead.opportunityId),
  payment_events: ctx.db.all('SELECT provider_event_id, event_type, amount_minor, fee_minor FROM payment_events ORDER BY id'),
  ledger: ctx.db.all('SELECT account, amount_minor, currency, source_ref FROM ledger_entries ORDER BY created_at'),
  audit_events: events,
  artifact_csv: Buffer.from(dl.bytes).toString('utf8'),
};
const outDir = resolve('data/dryrun');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `dryrun-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
writeFileSync(join(outDir, 'latest-artifact.csv'), dl.bytes);
console.log(`\n${events.length} Audit-Events · Bericht: ${file}`);
if (finalState !== 'CLOSED' || live.grossReceiptsMinor !== 0) {
  console.error('DRY RUN FEHLGESCHLAGEN');
  process.exit(1);
}
ctx.db.close();
console.log('DRY RUN ERFOLGREICH (nur Testdaten).');
