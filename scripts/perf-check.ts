import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword, randomToken } from '../packages/shared/src/crypto.ts';
import { submitInboundLead } from '../services/acquisition/src/leads.ts';
import { autopilotTick } from '../services/core-api/src/autopilot.ts';
import { loadConfig } from '../services/core-api/src/config.ts';
import { createContext } from '../services/core-api/src/context-node.ts';
import { getOrder } from '../services/core-api/src/orders.ts';
import { startServer } from '../services/core-api/src/server.ts';
import { acceptQuote, autoProcessOpportunity, createCheckout } from '../services/core-api/src/workflow.ts';
import { mockPay } from '../services/finance/src/mock-provider.ts';

/**
 * 17.0 Leistungs- und Zuverlässigkeitsmessung (lokal, echte Software, Testzahlungen):
 *   node scripts/perf-check.ts [aufträge=60] [anfragen=300] [parallel=20]
 * 1. N Aufträge anlegen, bezahlen und vom Autopilot-Takt abarbeiten lassen (Durchsatz, nichts doppelt, nichts verloren).
 * 2. Seiten unter gleichzeitigen Zugriffen messen (Median, 95 %, Maximum, Fehler).
 * Gibt eine JSON-Zeile „PERF {…}“ aus – nur gemessene Werte.
 */
const [nOrders, nReq, conc] = [Number(process.argv[2]) || 60, Number(process.argv[3]) || 300, Number(process.argv[4]) || 20];
const PASSWORD = randomToken(18);
const dir = mkdtempSync(join(tmpdir(), 'ie-perf-'));
const ctx = createContext(loadConfig({ ENVIRONMENT: 'test', DATABASE_URL: join(dir, 'core.db'), ARTIFACTS_DIR: join(dir, 'a'), EXPORTS_DIR: join(dir, 'e'), DOWNLOAD_SIGNING_KEY: randomToken(32), MOCK_WEBHOOK_SECRET: randomToken(32), OWNER_PASSWORD_HASH: hashPassword(PASSWORD), ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf' }));

const t0 = performance.now();
let customerKey = '';
for (let i = 0; i < nOrders; i++) {
  const lead = submitInboundLead(ctx, { name: `Lastkunde ${i}`, email: `last${i}@example.invalid`, company: `Last ${i} GmbH`, country: 'DE', message: 'Lasttest', privacyAccepted: true, marketingConsent: false, request: { capabilityId: i % 2 ? 'b2b-calc-pdf' : 'b2b-calc-csv', scope: { title: `Kalkulation ${i}`, currency: 'EUR', margin_bps: 2000, language: 'de', items: [{ name: 'Montage', quantity: 10, unit_cost_minor: 4500 }, { name: 'Material', quantity: 3, unit_cost_minor: 12050 }] } } }, { ipHash: 'perf' });
  const auto = autoProcessOpportunity(ctx, lead.opportunityId);
  if (auto.stage !== 'QUOTED') throw new Error(`kein Angebot: ${JSON.stringify(auto)}`);
  const acc = acceptQuote(ctx, auto.quote.quoteId, auto.quote.acceptanceToken, { termsAccepted: true, ipHash: 'perf', buyer: { name: `Last ${i} GmbH`, address: 'Teststraße 1, 12345 Teststadt', country: 'DE', type: 'B2B', vatId: null } });
  createCheckout(ctx, acc.orderId);
  mockPay(ctx, getOrder(ctx, acc.orderId));
  customerKey = acc.customerAccessKey ?? customerKey;
}
const tOrders = performance.now() - t0;
const t1 = performance.now();
let ticks = 0;
while ((ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM jobs WHERE kind = 'production' AND state IN ('QUEUED','FAILED_RETRY','RUNNING')`)?.n ?? 0) > 0 && ticks < 50) { autopilotTick(ctx); ticks++; }
autopilotTick(ctx);
const tProd = performance.now() - t1;
const q = (sql: string): number => ctx.db.get<{ n: number }>(sql)?.n ?? 0;
const orders = { created: q('SELECT COUNT(*) AS n FROM orders'), delivered: q('SELECT COUNT(*) AS n FROM deliveries'), duplicateDeliveries: q('SELECT COUNT(*) AS n FROM (SELECT order_id FROM deliveries GROUP BY order_id HAVING COUNT(*) > 1)'), invoices: q('SELECT COUNT(*) AS n FROM invoices'), duplicateInvoices: q('SELECT COUNT(*) AS n FROM (SELECT order_id FROM invoices GROUP BY order_id HAVING COUNT(*) > 1)'), qaFailed: q('SELECT COUNT(*) AS n FROM qa_runs WHERE passed = 0'), deadLetters: q(`SELECT COUNT(*) AS n FROM jobs WHERE state = 'DEAD_LETTER'`), ticks };

const server = await startServer(ctx, 0, '127.0.0.1');
const addr = server.address();
const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
const login = await fetch(`${base}/auth/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(PASSWORD)}` });
const ownerCookie = (login.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';

async function measure(path: string, cookie = ''): Promise<{ path: string; p50: number; p95: number; max: number; errors: number; kb: number }> {
  const times: number[] = [];
  let errors = 0;
  let bytes = 0;
  let next = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < nReq) {
      next++;
      const s = performance.now();
      try {
        const r = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
        const b = await r.arrayBuffer();
        bytes = b.byteLength;
        if (r.status !== 200) errors++;
      } catch { errors++; }
      times.push(performance.now() - s);
    }
  }));
  times.sort((a, b) => a - b);
  const at = (f: number): number => Math.round((times[Math.min(times.length - 1, Math.floor(times.length * f))] ?? 0) * 10) / 10;
  return { path, p50: at(0.5), p95: at(0.95), max: at(1), errors, kb: Math.round(bytes / 102.4) / 10 };
}
const pages = [await measure('/'), await measure('/anfrage'), await measure('/sitemap.xml'), await measure('/portal', `ie_customer=${encodeURIComponent(customerKey)}`), await measure('/dashboard?modus=test', ownerCookie), await measure('/dashboard/auftraege?modus=test', ownerCookie), await measure('/admin/autopilot.json', ownerCookie)];
server.close();
console.log(`PERF ${JSON.stringify({ node: process.version, orders: { ...orders, createMsPerOrder: Math.round((tOrders / nOrders) * 10) / 10, productionMsTotal: Math.round(tProd) }, load: { requestsPerPage: nReq, parallel: conc }, pages })}`);
process.exit(orders.delivered === nOrders && orders.duplicateDeliveries === 0 && orders.duplicateInvoices === 0 && pages.every((p) => p.errors === 0) ? 0 : 1);
