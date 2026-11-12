import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { containsSecret } from '../../packages/events/src/redact.ts';
import { escapeHtml } from '../../packages/shared/src/html.ts';
import { hashPassword, randomToken } from '../../packages/shared/src/crypto.ts';
import { renderDashboard } from '../../apps/dashboard/src/render.ts';
import { submitInboundLead, validateInboundLead } from '../../services/acquisition/src/leads.ts';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { erasePersonalData, exportPersonalData } from '../../services/core-api/src/customers.ts';
import { recordInvoiceForOrder } from '../../services/finance/src/invoice.ts';
import { Client, csrfFrom, serve } from '../http.ts';
import { buyer, count, inbound, makeCtx, toDelivered } from '../helpers.ts';

const PASSWORD = `pw-${randomToken(12)}`;
let ctx: AppContext;
let base: string;
let close: () => void;

before(async () => {
  ctx = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } }).ctx;
  const s = await serve(ctx);
  base = s.base;
  close = () => s.server.close();
});
after(() => close());

test('IE-082 unauthentifizierter Zugriff: 401/403 ohne Datenleck', async () => {
  const c = new Client(base);
  const dash = await c.get('/dashboard');
  assert.equal(dash.status, 303);
  assert.equal(dash.location, '/login');
  for (const path of ['/api/reports/summary', '/api/audit', '/api/reports/monthly?month=2026-11']) {
    const r = await c.get(path);
    assert.equal(r.status, 401, path);
    assert.deepEqual(JSON.parse(r.text), { error: 'UNAUTHORIZED' });
  }
  const forged = new Client(base);
  forged.cookies.set('ie_owner', 'erfundenes-token');
  assert.equal((await forged.get('/api/audit')).status, 401);
});

test('IE-081 gültige Owner-Session: Dashboard autorisiert, CSRF erzwungen', async () => {
  const c = new Client(base);
  const login = await c.post('/auth/login', { password: PASSWORD });
  assert.equal(login.status, 303);
  assert.equal(login.location, '/dashboard');
  assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly; Path=\/; SameSite=Strict/);
  const dash = await c.get('/dashboard');
  assert.equal(dash.status, 200);
  assert.match(dash.text, /Dein Geschäft\. Klar im Blick\./);
  assert.match(dash.text, /Testbetrieb<span class="sr-only"> – Echtbetrieb gesperrt/);
  assert.match((await c.get('/dashboard/experte')).text, /TESTMODUS/, 'Detailansicht für Fachleute bleibt erreichbar');
  assert.equal(dash.headers.get('x-frame-options'), 'DENY');
  assert.match(dash.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.equal((await c.post('/admin/stops', { stop: 'PAUSE_PRODUCTION', active: '1' })).status, 403, 'ohne CSRF-Token');
  const ok = await c.post('/admin/stops', { stop: 'PAUSE_PRODUCTION', active: '1', _csrf: csrfFrom(dash.text) });
  assert.equal(ok.status, 303);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM emergency_stops WHERE stop = 'PAUSE_PRODUCTION' AND active = 1`), 1);
  await c.post('/admin/stops', { stop: 'PAUSE_PRODUCTION', active: '0', _csrf: csrfFrom(dash.text) });
});

test('Login-Ratenlimit: nach 5 Fehlversuchen 429, auch mit richtigem Passwort', async () => {
  const c = new Client(base);
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/auth/login', { password: 'falsch' })).status, 401);
  assert.equal((await c.post('/auth/login', { password: PASSWORD })).status, 429);
});

test('IE-086 Datenauskunft nach Identitätsprüfung: Export möglich', () => {
  const d = toDelivered(ctx);
  const data = exportPersonalData(ctx, d.customerAccessKey ?? undefined) as { customer: { email: string }; orders: unknown[] };
  assert.match(data.customer.email, /@example\.invalid$/);
  assert.equal(data.orders.length, 1);
  assert.equal(ctx.audit.byType('gdpr.data_exported').length >= 1, true);
});

test('IE-090 Datenexport ohne Berechtigung: Sperre', async () => {
  assert.throws(() => exportPersonalData(ctx, undefined), /FORBIDDEN/);
  assert.throws(() => exportPersonalData(ctx, 'a'.repeat(43)), /FORBIDDEN/);
  const r = await new Client(base).get('/portal/datenexport');
  assert.equal(r.status, 403);
  assert.doesNotMatch(r.text, /@/);
});

test('IE-087 Löschantrag mit Aufbewahrungspflicht: differenzierte Sperre/Löschung', () => {
  const plain = submitInboundLead(ctx, inbound({ marketingConsent: true }), { ipHash: 'x' });
  assert.deepEqual(erasePersonalData(ctx, plain.leadId, 'owner'), { mode: 'ERASED' });
  const l = ctx.db.get<{ email: string | null; name: string }>('SELECT email, name FROM leads WHERE lead_id = ?', plain.leadId);
  assert.deepEqual({ ...l }, { email: null, name: '[gelöscht]' });

  const d = toDelivered(ctx);
  recordInvoiceForOrder(ctx, d.orderId, { name: buyer.name, address: buyer.address, country: 'DE', type: 'B2B', vatId: null });
  assert.deepEqual(erasePersonalData(ctx, d.leadId, 'owner'), { mode: 'RESTRICTED' });
  const c = ctx.db.get<{ processing_restricted: number; name: string }>('SELECT processing_restricted, name FROM customers WHERE lead_id = ?', d.leadId);
  assert.equal(c?.processing_restricted, 1);
  assert.equal(c?.name, buyer.name, 'belegrelevante Daten bleiben gesperrt erhalten');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM invoices WHERE order_id = ?', d.orderId), 1);
});

test('IE-088 SQL/HTML-Injection im Lead: Eingabe validiert, Ausgabe escaped', async () => {
  const bad = validateInboundLead({ ...inbound(), name: '<script>alert(1)</script>' });
  assert.equal(bad.ok, false);
  const badEmail = validateInboundLead({ ...inbound(), email: 'x"@evil.invalid' });
  assert.equal(badEmail.ok, false);
  const payload = `'); DROP TABLE leads;-- <img src=x onerror=alert(1)>`;
  const v = validateInboundLead({ ...inbound(), message: payload });
  assert.equal(v.ok, true);
  if (!v.ok) return;
  const r = submitInboundLead(ctx, v.value, { ipHash: 'x' });
  assert.equal(ctx.db.get<{ message: string }>('SELECT message FROM leads WHERE lead_id = ?', r.leadId)?.message, payload, 'gespeichert als Daten');
  assert.ok(count(ctx, 'SELECT COUNT(*) AS n FROM leads') > 0, 'Tabelle intakt');
  assert.equal(escapeHtml(payload).includes('<img'), false);
  assert.equal(renderDashboard(ctx, 'csrf').includes('<img src=x'), false);
  const api = await new Client(base).post('/api/leads', JSON.stringify({ ...inbound(), name: '"><svg onload=alert(1)>' }), { 'content-type': 'application/json' });
  assert.equal(api.status, 400);
});

test('IE-084 Webhook-Replay über HTTP: alte Signatur verworfen', async () => {
  const body = JSON.stringify({ id: 'evt_replay_000001', type: 'checkout.session.completed', livemode: false, created: 1, data: { object: {} } });
  const { signPayload } = await import('../../services/finance/src/webhook.ts');
  const old = signPayload(ctx.config.payment.webhookSecret, body, Math.floor(Date.now() / 1000) - 3600);
  const r = await new Client(base).post('/webhooks/payments', body, { 'stripe-signature': old, 'content-type': 'application/json' });
  assert.equal(r.status, 400);
  assert.match(r.text, /TIMESTAMP_OUT_OF_TOLERANCE|SIGNATURE_INVALID/);
});

test('DB-Invarianten: Audit append-only, Live-Zeilen und Live-Freischaltung gesperrt', () => {
  assert.throws(() => ctx.db.run(`UPDATE audit_events SET actor = 'x'`), /AUDIT_APPEND_ONLY/);
  assert.throws(() => ctx.db.run('DELETE FROM audit_events'), /AUDIT_APPEND_ONLY/);
  assert.throws(() => ctx.db.run('UPDATE system_mode SET live_enabled = 1'), /LIVE_ACTIVATION_REQUIRES_M3_MIGRATION/);
  const o = ctx.db.get<{ quote_id: string; customer_id: string; opportunity_id: string }>('SELECT quote_id, customer_id, opportunity_id FROM orders LIMIT 1');
  assert.throws(
    () => ctx.db.run(`INSERT INTO orders (order_id, quote_id, customer_id, opportunity_id, amount_minor, currency, payment_state, fulfillment_state, test_mode, created_at, updated_at)
      VALUES ('ord_live', 'q_x', ?, ?, 1, 'EUR', 'UNPAID', 'NOT_STARTED', 0, 'now', 'now')`, o?.customer_id ?? '', o?.opportunity_id ?? ''),
    /LIVE_MODE_DISABLED/,
  );
  assert.throws(() => ctx.db.run(`UPDATE orders SET amount_minor = 1`), /ORDER_CORE_IMMUTABLE/);
});

test('Keine Secrets im Repository (Quelltext, Konfiguration, Doku)', () => {
  const skip = new Set(['node_modules', 'data', 'dist', '.git']);
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      if (skip.has(f)) continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|js|json|md|sql|yml|yaml|example)$/.test(f) || f.startsWith('.env')) {
        // Nur eindeutig gekennzeichnete Test-Fixtures werden ausgenommen; alles andere zählt als Leck.
        const src = readFileSync(p, 'utf8')
          .replace(/\bsk_(?:live|test)_(?:0123456789abcdef|ABCDEFGHIJ1234|ABCDEFGHIJKLMNOP|abcdefghijklmnop)\b/g, '')
          .replace(/\bwhsec_(?:test|dryrun|attacker)_[A-Za-z0-9_]+|\bwhsec_0123456789abcdef\b/g, '')
          .replace(/DE89 ?3704 ?0044 ?0532 ?0130 ?00/g, '');
        if (containsSecret(src)) hits.push(p);
      }
    }
  };
  walk('.');
  assert.deepEqual(hits.filter((h) => !h.includes('.env') || h.endsWith('.env.example')), []);
});
