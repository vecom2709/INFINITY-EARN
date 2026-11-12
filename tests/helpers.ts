import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { OpportunityState } from '../packages/contracts/src/states.ts';
import { randomToken } from '../packages/shared/src/crypto.ts';
import { submitInboundLead, type InboundLeadInput } from '../services/acquisition/src/leads.ts';
import { loadConfig, type AppConfig } from '../services/core-api/src/config.ts';
import { createContext, type AppContext } from '../services/core-api/src/context-node.ts';
import { getOrder } from '../services/core-api/src/orders.ts';
import { acceptQuote, autoProcessOpportunity, createCheckout, type AcceptanceEvidence } from '../services/core-api/src/workflow.ts';
import { mockPay } from '../services/finance/src/mock-provider.ts';
import { runProductionOnce } from '../services/product-factory/src/production.ts';

export class FakeClock {
  t: number;
  constructor(iso = '2026-11-12T10:00:00.000Z') {
    this.t = Date.parse(iso);
  }
  now = (): Date => new Date(this.t);
  advance(ms: number): void {
    this.t += ms;
  }
}

export const TEST_SIGNING_KEY = 'test-signing-key-0123456789abcdef012345';
export const TEST_WEBHOOK_SECRET = 'whsec_test_0123456789abcdef0123456789';

export function makeConfig(env: Record<string, string> = {}): AppConfig {
  const dir = mkdtempSync(join(tmpdir(), 'ie-test-'));
  return loadConfig({
    ENVIRONMENT: 'test',
    DATABASE_URL: ':memory:',
    ARTIFACTS_DIR: join(dir, 'artifacts'),
    EXPORTS_DIR: join(dir, 'exports'),
    MIGRATIONS_DIR: resolve('db/migrations'),
    DOWNLOAD_SIGNING_KEY: TEST_SIGNING_KEY,
    MOCK_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    AI_DAILY_TASK_LIMIT: '0',
    ...env,
  });
}

export function makeCtx(opts: { env?: Record<string, string>; clock?: FakeClock } = {}): { ctx: AppContext; clock: FakeClock } {
  const clock = opts.clock ?? new FakeClock();
  return { ctx: createContext(makeConfig(opts.env), clock.now), clock };
}

export const calcScope = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: 'Test-Kalkulation',
  currency: 'EUR',
  margin_bps: 2000,
  language: 'de',
  items: [
    { name: 'Montage', quantity: 10, unit_cost_minor: 4500 },
    { name: 'Material', quantity: 3, unit_cost_minor: 12050 },
  ],
  ...over,
});

export function inbound(over: Partial<InboundLeadInput> = {}): InboundLeadInput {
  return {
    name: 'Test Kunde',
    email: `kunde-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}@example.invalid`,
    company: 'Test GmbH',
    country: 'DE',
    message: 'Bitte um ein Angebot.',
    privacyAccepted: true,
    marketingConsent: false,
    request: { capabilityId: 'b2b-calc-csv', scope: calcScope() },
    ...over,
  };
}

export const buyer: AcceptanceEvidence['buyer'] = { name: 'Test GmbH', address: 'Teststraße 1, 10115 Berlin', country: 'DE', type: 'B2B', vatId: null };

export function oppState(ctx: AppContext, id: string): OpportunityState {
  return (ctx.db.get<{ pipeline_state: OpportunityState }>('SELECT pipeline_state FROM opportunities WHERE opportunity_id = ?', id) as { pipeline_state: OpportunityState }).pipeline_state;
}

export function count(ctx: AppContext, sql: string, ...p: (string | number)[]): number {
  return ctx.db.get<{ n: number }>(sql, ...p)?.n ?? 0;
}

export function toQuote(ctx: AppContext, input: InboundLeadInput = inbound()) {
  const lead = submitInboundLead(ctx, input, { ipHash: 'test' });
  const auto = autoProcessOpportunity(ctx, lead.opportunityId);
  assert.equal(auto.stage, 'QUOTED', JSON.stringify(auto));
  if (auto.stage !== 'QUOTED') throw new Error('unreachable');
  return { ...lead, quote: auto.quote };
}

export function toOrder(ctx: AppContext, input?: InboundLeadInput, b = buyer) {
  const q = toQuote(ctx, input);
  const acc = acceptQuote(ctx, q.quote.quoteId, q.quote.acceptanceToken, { termsAccepted: true, ipHash: 'test', buyer: b });
  createCheckout(ctx, acc.orderId);
  return { ...q, ...acc };
}

export function toPaid(ctx: AppContext, input?: InboundLeadInput, b = buyer) {
  const o = toOrder(ctx, input, b);
  const r = mockPay(ctx, getOrder(ctx, o.orderId));
  assert.equal(r.detail, 'CONFIRMED');
  return { ...o, payEventId: r.eventId };
}

export function toDelivered(ctx: AppContext, input?: InboundLeadInput, b = buyer) {
  const p = toPaid(ctx, input, b);
  const run = runProductionOnce(ctx);
  assert.equal(run.results[0]?.outcome, 'DELIVERED', JSON.stringify(run));
  return p;
}
