import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { financeView } from '../../apps/console/src/model.ts';
import { assess, autopilotStatus, environments, jobStatus } from '../../services/ai-orchestrator/src/director.ts';
import { claimNext, enqueueJob } from '../../services/ai-orchestrator/src/queue.ts';
import { incrementUsage } from '../../services/ai-orchestrator/src/quota.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { ConfigError, loadConfig } from '../../services/core-api/src/config.ts';
import { createContext } from '../../services/core-api/src/context-node.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { setStop } from '../../services/core-api/src/policy-store.ts';
import { buildMockEvent, deliverMockEvent } from '../../services/finance/src/mock-provider.ts';
import { downloadArtifact, getDeliveryByOrder, issueDownloadToken } from '../../services/product-factory/src/delivery.ts';
import { count, FakeClock, makeConfig, makeCtx, toOrder, toPaid } from '../helpers.ts';

/**
 * INFINITY EARN 16.0 – 24/7-Autopilot ohne privaten PC. Jeder Test spielt ein Szenario aus Abschnitt 14 echt durch
 * (Datenbank, Warteschlange, Zahlungsereignis, Produktion, Abnahme, Download). Szenarien, die schon eigene
 * Testdateien haben, sind in TEST_MATRIX.md zugeordnet (9: tests/products/win-lager/external-build.test.ts,
 * 10: tests/integration/live-preview.test.ts, 13: tests/security/*).
 */

test('1–4, 16: Bestellung bei ausgeschaltetem PC – Cloudflare-Takt allein produziert, prüft und liefert bis zum Download', () => {
  const { ctx } = makeCtx();
  // Kunde bestellt und zahlt: nur Server-Funktionen, kein lokaler Prozess beteiligt
  const p = toPaid(ctx);
  assert.equal(getOrder(ctx, p.orderId).payment_state, 'CONFIRMED');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM jobs WHERE kind = 'production' AND order_id = ?`, p.orderId), 1, 'Folgeauftrag dauerhaft gespeichert');
  // Der Takt (im Worker: Durable-Object-Alarm jede Minute) übernimmt alles Weitere
  const t = autopilotTick(ctx);
  assert.equal(t.production.results[0]?.outcome, 'DELIVERED', JSON.stringify(t.production));
  const del = getDeliveryByOrder(ctx, p.orderId);
  assert.ok(del, 'Lieferung freigegeben');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.order_id = ? AND q.passed = 1`, p.orderId), 1, 'Abnahme bestanden');
  const dl = downloadArtifact(ctx, issueDownloadToken(ctx, del?.delivery_id ?? '', p.customerId), p.customerAccessKey ?? undefined);
  assert.ok(dl.ok, JSON.stringify(dl));
  assert.equal(autopilotStatus(ctx).state, 'AKTIV');
});

test('5–6: KI-Job pausiert sicher ohne KI und läuft nur im freigegebenen Umfang weiter', () => {
  const clock = new FakeClock();
  const file = join(mkdtempSync(join(tmpdir(), 'ie-ai-')), 'core.db');
  const off = createContext(makeConfig({ DATABASE_URL: file, AI_DAILY_TASK_LIMIT: '0' }), clock.now);
  enqueueJob(off, { kind: 'ai-text', idempotencyKey: 'ai:1', requiresAi: true });
  enqueueJob(off, { kind: 'ai-text', idempotencyKey: 'ai:2', requiresAi: true });
  assert.equal(claimNext(off, ['ai-text']), null, 'ohne KI-Kontingent startet nichts');
  const blocked = off.db.all<{ state: 'QUEUED'; reason: string | null; next_run_at: string | null }>(`SELECT state, reason, next_run_at FROM jobs WHERE kind = 'ai-text'`);
  assert.deepEqual(blocked.map((j) => jobStatus(j, clock.now())), ['AI_QUOTA_BLOCKED', 'AI_QUOTA_BLOCKED'], 'nicht verloren, sichtbar blockiert');
  assert.equal(assess(off, 'text').status, 'AI_QUOTA_BLOCKED');
  assert.equal(autopilotTick(off).errors.length, 0);
  assert.equal(autopilotStatus(off).state, 'WARTET AUF KI');
  // Eigentümer gibt genau 1 KI-Aufgabe pro Tag frei (neuer Start mit derselben Datenbank)
  clock.advance(61_000);
  const on = createContext(makeConfig({ DATABASE_URL: file, AI_DAILY_TASK_LIMIT: '1' }), clock.now);
  const first = claimNext(on, ['ai-text']);
  assert.ok(first, 'erster Job darf laufen');
  incrementUsage(on, 'ai_tasks');
  clock.advance(61_000);
  assert.equal(claimNext(on, ['ai-text']), null, 'zweiter Job bleibt blockiert – Kontingent eingehalten');
  assert.equal(count(on, `SELECT COUNT(*) AS n FROM jobs WHERE kind = 'ai-text'`), 2, 'kein Job verloren oder doppelt');
});

test('7: Doppelter Zahlungs-Webhook erzeugt weder doppelte Zahlung noch doppelten Produktionsauftrag', () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  const order = getOrder(ctx, o.orderId);
  const ev = buildMockEvent(ctx, 'checkout.session.completed', { id: order.checkout_session_id, amount_total: order.amount_minor, currency: 'eur', payment_status: 'paid', metadata: { order_id: o.orderId } });
  assert.equal(deliverMockEvent(ctx, ev).status, 'processed');
  assert.equal(deliverMockEvent(ctx, ev).status, 'duplicate');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM jobs WHERE kind = 'production' AND order_id = ?`, o.orderId), 1);
  autopilotTick(ctx);
  autopilotTick(ctx);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', o.orderId), 1, 'eine Lieferung');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM ledger_entries WHERE account = 'customer_payments'`), 1, 'eine Zahlung');
});

test('8: Fehlerhafte Produktion wird nicht ausgeliefert', () => {
  const { ctx } = makeCtx();
  const p = toPaid(ctx);
  ctx.db.run('UPDATE opportunities SET scope_json = ? WHERE opportunity_id = ?', JSON.stringify({ title: 'x', currency: 'EUR', margin_bps: 2000, language: 'de', items: [] }), p.opportunityId);
  for (let i = 0; i < 6; i++) autopilotTick(ctx);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', p.orderId), 0);
});

test('11: Kostenloses Kontingent erschöpft – Jobs pausieren gespeichert, keine Kosten, Status zeigt die Einschränkung', () => {
  const { ctx } = makeCtx({ env: { FREE_TIER_DAILY_REQUEST_LIMIT: '100' } });
  const p = toPaid(ctx);
  incrementUsage(ctx, 'platform_requests', 100);
  const t = autopilotTick(ctx);
  assert.equal(t.production.processed, 0, 'nichts verarbeitet');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM jobs WHERE order_id = ? AND state = 'QUEUED'`, p.orderId), 1, 'Auftrag gespeichert');
  assert.equal(environments(ctx).find((e) => e.id === 'worker')?.available, false);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'cost.committed'`), 0, 'keine Kosten ausgelöst');
});

test('12: Neustart (neuer Worker-Prozess, gleiche Datenbank) – kein Auftrag geht verloren, Ablauf setzt fort', () => {
  const clock = new FakeClock();
  const file = join(mkdtempSync(join(tmpdir(), 'ie-restart-')), 'core.db');
  const before = createContext(makeConfig({ DATABASE_URL: file }), clock.now);
  const p = toPaid(before);
  // Absturz mitten in der Produktion: Job bleibt auf RUNNING stehen
  before.db.run(`UPDATE jobs SET state = 'RUNNING', updated_at = ? WHERE kind = 'production' AND order_id = ?`, clock.now().toISOString(), p.orderId);
  const after = createContext(makeConfig({ DATABASE_URL: file }), clock.now);
  assert.equal(count(after, 'SELECT COUNT(*) AS n FROM orders WHERE order_id = ?', p.orderId), 1, 'Auftrag nach Neustart vorhanden');
  assert.equal(autopilotTick(after).production.results.some((r) => r.orderId === p.orderId), false, 'laufender Job wird nicht doppelt gestartet');
  clock.advance(31 * 60_000);
  const t = autopilotTick(after);
  assert.equal(t.production.results.find((r) => r.orderId === p.orderId)?.outcome, 'DELIVERED');
  assert.equal(count(after, `SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'job.recovered'`), 1, 'Wiederanlauf protokolliert');
  assert.equal(count(after, 'SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', p.orderId), 1);
});

test('14–15: Testdaten erscheinen nie als Echtumsatz; Echtbetrieb bleibt gesperrt', () => {
  const { ctx } = makeCtx();
  const p = toPaid(ctx);
  autopilotTick(ctx);
  assert.ok(financeView(ctx, true).paidMinor > 0, 'Testgeld in der Test-Ansicht');
  assert.equal(financeView(ctx, false).paidMinor, 0, 'kein Echtumsatz');
  assert.equal(getOrder(ctx, p.orderId).test_mode, 1);
  assert.throws(() => loadConfig({ ENVIRONMENT: 'live', DATABASE_URL: ':memory:' }), ConfigError);
});

test('Autopilot-Status: ANGEHALTEN per Stopp, FEHLER bei ausbleibendem Takt, Router sagt nur Machbares zu', () => {
  const { ctx, clock } = makeCtx();
  autopilotTick(ctx);
  assert.equal(autopilotStatus(ctx).state, 'AKTIV');
  setStop(ctx, 'STOP_ALL_JOBS', true, 'owner');
  assert.equal(autopilotStatus(ctx).state, 'ANGEHALTEN');
  assert.equal(assess(ctx, 'kalkulation', 'b2b-calc-pdf').feasible, false, 'nichts zusagen, solange angehalten');
  setStop(ctx, 'STOP_ALL_JOBS', false, 'owner');
  clock.advance(10 * 60_000);
  const s = autopilotStatus(ctx);
  assert.equal(s.state, 'FEHLER');
  assert.match(s.reasons[0] ?? '', /Letzter Takt vor 10 Minuten/);
  autopilotTick(ctx);
  assert.equal(assess(ctx, 'kalkulation', 'b2b-calc-pdf').status, 'READY');
  assert.equal(assess(ctx, 'windows-exe', 'win-lager').feasible, false, 'ohne Bau-Agent und Probebau keine Windows-Zusage');
  assert.equal(assess(ctx, 'mobile-app').status, 'RESOURCE_BLOCKED');
  assert.equal(assess(ctx, 'individuelle-software').status, 'AI_QUOTA_BLOCKED');
  assert.equal(environments(ctx).find((e) => e.id === 'ai-claude')?.available, false, 'kein vorgetäuschter KI-Zugang');
});

test('Leitstand im Admin zeigt gemessene Werte; Rohdaten nur für den Eigentümer', async () => {
  const { renderOverview } = await import('../../apps/console/src/pages/overview.ts');
  const { ctx } = makeCtx();
  autopilotTick(ctx);
  const html = renderOverview({ ctx, mode: 'test', csrf: 'x', path: '/dashboard', flash: null } as never);
  assert.match(html, /Autopilot-Leitstand/);
  assert.match(html, /AKTIV/);
  assert.match(html, /GitHub-Windows-Server/);
  assert.match(html, /Claude \(KI-Produktion über dein Abo\)/);
  const { serve, Client } = await import('../http.ts');
  const srv = await serve(ctx);
  try {
    assert.equal((await new Client(srv.base).get('/admin/autopilot.json')).status, 303, 'Rohdaten nur nach Login');
  } finally {
    srv.server.close();
  }
});
