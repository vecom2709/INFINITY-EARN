import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, type ActionRequest, type Actor, type EngineContext, type StopName } from '../../packages/policies/src/engine.ts';
import { mostRestrictive, policyFromEnv, SAFE_DEFAULT_POLICY, type Policy } from '../../packages/policies/src/policy.ts';

const ctxFor = (policy: Policy | null = SAFE_DEFAULT_POLICY, stops: StopName[] = [], actor: Actor = 'ai'): EngineContext => ({ policy, stops: new Set(stops), actor });
const permissive: Policy = {
  ...SAFE_DEFAULT_POLICY,
  allowPaidApis: true,
  allowAutoUpgrade: true,
  allowPaidAds: true,
  allowNewFinancialCommitments: true,
  liveSalesEnabled: true,
  autoMarketingOutreach: true,
  allowUnreviewedDeploy: true,
  maxNewMonthlyFixedCostEur: 1000,
};

const SAMPLE: ActionRequest[] = [
  { action: 'quote.issue', priceMinor: 10000, costMinor: 5000, currency: 'EUR' },
  { action: 'lead.contact', purpose: 'transactional', legalBasis: 'permitted_inbound', consentProofRef: null, consentWithdrawn: false, optedOut: false, automated: false },
  { action: 'checkout.create', testMode: true },
  { action: 'production.start', paymentState: 'CONFIRMED', feasibilityApproved: true, scopeValid: true },
  { action: 'delivery.release', paymentState: 'CONFIRMED', qaPassed: true },
  { action: 'invoice.issue', testMode: true },
  { action: 'job.run', kind: 'production', production: true },
  { action: 'capability.use', capabilityId: 'b2b-calc-csv' },
];

test('IE-001 geladene Owner-Policy: nur konfigurierte Aktionen werden ausgeführt', () => {
  assert.equal(evaluate({ action: 'capability.use', capabilityId: 'b2b-calc-csv' }, ctxFor()).allowed, true);
  assert.equal(evaluate({ action: 'capability.use', capabilityId: 'video-production' }, ctxFor()).allowed, false);
  assert.equal(evaluate({ action: 'marketing.outreach', recipients: 10 }, ctxFor()).allowed, false);
  assert.equal(evaluate({ action: 'live.sale' }, ctxFor()).allowed, false);
  for (const req of SAMPLE) assert.equal(evaluate(req, ctxFor()).allowed, true, req.action);
});

test('IE-002 keine Policy vorhanden: alle externen Aktionen blockiert', () => {
  for (const req of SAMPLE) {
    const d = evaluate(req, ctxFor(null));
    assert.equal(d.allowed, false, req.action);
    assert.equal(d.rule, 'NO_POLICY');
  }
});

test('IE-003 Preis innerhalb der Grenzwerte: Quote freigegeben', () => {
  const d = evaluate({ action: 'quote.issue', priceMinor: 10000, costMinor: 5000, currency: 'EUR' }, ctxFor());
  assert.deepEqual([d.allowed, d.rule], [true, 'QUOTE_WITHIN_POLICY']);
});

test('IE-004 Preis über Maximalwert: Quote blockiert', () => {
  const d = evaluate({ action: 'quote.issue', priceMinor: 300000, costMinor: 1000, currency: 'EUR' }, ctxFor());
  assert.deepEqual([d.allowed, d.rule], [false, 'QUOTE_ABOVE_MAX']);
  assert.equal(evaluate({ action: 'quote.issue', priceMinor: 10000, costMinor: 1000, currency: 'USD' }, ctxFor()).rule, 'QUOTE_CURRENCY');
});

test('IE-005 Notstopp aktiviert: alle operativen Jobs/Aktionen angehalten', () => {
  const c = ctxFor(permissive, ['STOP_ALL_JOBS']);
  for (const req of SAMPLE.filter((r) => r.action !== 'invoice.issue' && r.action !== 'capability.use')) {
    assert.equal(evaluate(req, c).allowed, false, req.action);
  }
  assert.equal(evaluate({ action: 'production.start', paymentState: 'CONFIRMED', feasibilityApproved: true, scopeValid: true }, ctxFor(permissive, ['PAUSE_PRODUCTION'])).allowed, false);
  assert.equal(evaluate({ action: 'checkout.create', testMode: true }, ctxFor(permissive, ['PAUSE_PAYMENTS'])).allowed, false);
  assert.equal(evaluate({ action: 'quote.issue', priceMinor: 10000, costMinor: 5000, currency: 'EUR' }, ctxFor(permissive, ['PAUSE_ACQUISITION'])).allowed, false);
});

test('IE-006 KI fordert Fremdüberweisung: immer abgelehnt (auch bei offener Policy)', () => {
  for (const actor of ['ai', 'system', 'owner'] as Actor[]) {
    const d = evaluate({ action: 'transfer.funds', beneficiary: 'DE89370400440532013000', amountMinor: 50000 }, ctxFor(permissive, [], actor));
    assert.deepEqual([d.allowed, d.rule], [false, 'NO_SOFTWARE_TRANSFERS']);
  }
});

test('IE-007 KI will kostenpflichtige API aktivieren: abgelehnt', () => {
  const d = evaluate({ action: 'paid_api.enable', service: 'some-llm-api', monthlyCostEur: 20 }, ctxFor());
  assert.deepEqual([d.allowed, d.rule], [false, 'PAID_APIS_DISABLED']);
});

test('IE-024 IE-076 negativer Deckungsbeitrag / Marge unter Minimum: abgelehnt', () => {
  assert.equal(evaluate({ action: 'quote.issue', priceMinor: 6000, costMinor: 7000, currency: 'EUR' }, ctxFor()).rule, 'NEGATIVE_MARGIN');
  assert.equal(evaluate({ action: 'quote.issue', priceMinor: 6000, costMinor: 5000, currency: 'EUR' }, ctxFor()).rule, 'MARGIN_BELOW_MIN');
});

test('IE-048 ungeprüfte/kostenpflichtige Bibliothek: nicht installieren', () => {
  assert.equal(evaluate({ action: 'dependency.install', name: 'pro-lib', license: 'MIT', requiresPayment: true }, ctxFor()).rule, 'PAID_DEPENDENCY');
  assert.equal(evaluate({ action: 'dependency.install', name: 'gpl-lib', license: 'GPL-3.0', requiresPayment: false }, ctxFor()).rule, 'LICENSE_REVIEW');
  assert.equal(evaluate({ action: 'dependency.install', name: 'ok-lib', license: 'MIT', requiresPayment: false }, ctxFor()).allowed, true);
});

test('IE-078 neue Auszahlungs-IBAN: nur Owner-KYC im Provider-UI, nie per Software', () => {
  for (const actor of ['ai', 'owner'] as Actor[]) {
    assert.equal(evaluate({ action: 'payout.beneficiary.change' }, ctxFor(permissive, [], actor)).rule, 'OWNER_PROVIDER_UI_ONLY');
  }
});

test('IE-080 Kosten > 0 ohne Freigabe: Zahlungsanforderung verweigert', () => {
  assert.equal(evaluate({ action: 'cost.commit', amountEur: 0.01, recurring: false, description: 'x' }, ctxFor()).rule, 'COST_NOT_APPROVED');
  assert.equal(evaluate({ action: 'cost.commit', amountEur: 5, recurring: true, description: 'x' }, ctxFor()).allowed, false);
  assert.equal(evaluate({ action: 'cost.commit', amountEur: 0, recurring: false, description: 'x' }, ctxFor()).allowed, true);
});

test('IE-098 KI will ungeprüften Code live deployen: gesperrt', () => {
  assert.equal(evaluate({ action: 'deploy', target: 'live', testsPassed: true, reviewed: false }, ctxFor()).rule, 'UNREVIEWED_DEPLOY');
  assert.equal(evaluate({ action: 'deploy', target: 'live', testsPassed: true, reviewed: false }, ctxFor(permissive, [], 'ai')).rule, 'AI_UNREVIEWED_DEPLOY');
  assert.equal(evaluate({ action: 'deploy', target: 'staging', testsPassed: true, reviewed: false }, ctxFor()).allowed, true);
});

test('IE-099 Tests nach Codeänderung rot: kein Release', () => {
  for (const target of ['staging', 'live'] as const) {
    assert.equal(evaluate({ action: 'deploy', target, testsPassed: false, reviewed: true }, ctxFor(permissive, [], 'owner')).rule, 'TESTS_FAILED');
  }
});

test('Policy aus Env: nur exakt "true" schaltet frei, Fehlwerte fallen auf sicher zurück', () => {
  const { policy, warnings } = policyFromEnv({ ALLOW_PAID_APIS: 'TRUE', AUTO_MARKETING_OUTREACH: 'yes', LIVE_SALES_ENABLED: 'false', MAX_NEW_MONTHLY_FIXED_COST_EUR: '-5' });
  assert.equal(policy.allowPaidApis, false);
  assert.equal(policy.autoMarketingOutreach, false);
  assert.equal(policy.maxNewMonthlyFixedCostEur, 0);
  assert.ok(warnings.length >= 3);
  assert.deepEqual(policyFromEnv({}).policy, { ...SAFE_DEFAULT_POLICY, allowedCapabilities: ['b2b-calc-csv'], quote: { ...SAFE_DEFAULT_POLICY.quote } });
});

test('mostRestrictive: Lockern erfordert beide Quellen, Währungskonflikt blockiert Angebote', () => {
  const m = mostRestrictive(permissive, SAFE_DEFAULT_POLICY);
  assert.equal(m.allowPaidApis, false);
  assert.equal(m.maxNewMonthlyFixedCostEur, 0);
  const usd = mostRestrictive(SAFE_DEFAULT_POLICY, { ...SAFE_DEFAULT_POLICY, quote: { ...SAFE_DEFAULT_POLICY.quote, currency: 'USD' } });
  assert.equal(usd.quote.maxMinor, 0);
});
