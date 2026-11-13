import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { HELP } from '../../apps/customer-portal/src/pages.ts';
import { renderProducts } from '../../apps/console/src/pages/products.ts';
import { backoffMs } from '../../services/ai-orchestrator/src/queue.ts';
import { acceptanceChecks, acceptanceGate, getStandard, listStandards, standardGaps } from '../../services/product-factory/src/quality-standard.ts';
import { runProductionOnce } from '../../services/product-factory/src/production.ts';
import { getCapability, listCapabilities, routeCapability } from '../../services/product-factory/src/registry.ts';
import { b2bCalcPdf } from '../../services/product-factory/src/capabilities/b2b-calc-pdf.ts';
import { calcScope, count, inbound, makeCtx, toDelivered, toPaid } from '../helpers.ts';
import { isSellable } from '../../services/core-api/src/releases.ts';

test('Jede verkaufbare Produktart hat eine vollständige Standard-Akte mit Anleitung und getesteten Abläufen', () => {
  const enabled = listCapabilities().filter((c) => c.enabled);
  assert.equal(enabled.length, 4, '3 Kalkulationen + Warenwirtschaft (Verkauf zusätzlich nur mit Freigabe)');
  for (const c of enabled) {
    const cap = getCapability(c.id);
    assert.ok(cap);
    assert.deepEqual(standardGaps(cap), [], c.id);
    const s = getStandard(c.id);
    assert.ok(s && HELP[c.id], `${c.id}: Bedienungsanleitung vorhanden`);
    assert.equal(s.deliverables.manualPath, `/hilfe/${c.id}`);
    for (const f of s.userFlowTests) assert.ok(existsSync(f), `${c.id}: Ablauftest ${f} existiert`);
    assert.ok(acceptanceChecks(s).every((name) => cap.qa_suite.includes(name)), 'keine Zusage ohne Prüfung');
  }
  assert.ok(listStandards().filter((s) => !getCapability(s.capabilityId)?.disabled_reason).every((s) => routeCapability(s.capabilityId).ok));
  // Vollständige Akte = herstellbar; bestellbar erst nach Eigentümer-Freigabe mit Festpreis (tests/integration/p4-release.test.ts).
  assert.equal(isSellable(makeCtx({ env: { ALLOWED_CAPABILITIES: 'b2b-calc-csv,mini-ww' } }).ctx, 'mini-ww'), false, 'vollständige Akte allein schaltet den Verkauf nicht frei');
  assert.equal(routeCapability('video-production').ok, false, 'gesperrte Produktarten bleiben gesperrt');
});

test('Zusage ohne Prüfung oder fehlende Akte macht eine Produktart unverkaufbar', () => {
  const s = getStandard('b2b-calc-pdf');
  assert.ok(s);
  const invented = { ...s, features: [...s.features, { text: 'Interaktive Diagramme', verifiedBy: 'charts' }] };
  assert.match(standardGaps(b2bCalcPdf, invented).join(), /Zusage ohne Prüfung: „Interaktive Diagramme“/);
  assert.match(standardGaps({ ...b2bCalcPdf, capability_id: 'neu' }).join(), /Keine Standard-Akte/);
  assert.match(standardGaps(b2bCalcPdf, { ...s, references: [], design: [] }).join(), /Referenzen.*Gestaltungsregeln/s);
});

test('Abnahme je Lieferung: fehlende Prüfung zählt als nicht bestanden; PDF-Gestaltung wird geprüft', () => {
  const s = getStandard('b2b-calc-pdf');
  assert.ok(s);
  const all = acceptanceChecks(s).map((check) => ({ check, passed: true }));
  assert.equal(acceptanceGate('b2b-calc-pdf', all).passed, true);
  assert.match(acceptanceGate('b2b-calc-pdf', all.filter((c) => c.check !== 'layout')).detail ?? '', /nicht erfüllt: layout/);
  assert.equal(acceptanceGate('unbekannt', all).passed, false);
  const scope = calcScope();
  const qa = b2bCalcPdf.runQa(b2bCalcPdf.generate(scope), scope);
  assert.equal(qa.find((c) => c.check === 'layout')?.passed, true);
  const withoutFooter = new TextEncoder().encode(new TextDecoder('latin1').decode(b2bCalcPdf.generate(scope)).replace('INFINITY EARN b2b-calc-pdf', 'XXXXXXXX XXXX b2b-calc-pdf'));
  assert.match(b2bCalcPdf.runQa(withoutFooter, scope).find((c) => c.check === 'layout')?.detail ?? '', /Fußzeile/);
});

test('Lieferung enthält das bestandene Abnahme-Gate im Prüfprotokoll', () => {
  const { ctx } = makeCtx({ env: { ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf,b2b-calc-bundle' } });
  const d = toDelivered(ctx, inbound({ request: { capabilityId: 'b2b-calc-pdf', scope: calcScope() } }));
  const qa = ctx.db.get<{ results_json: string }>('SELECT q.results_json FROM qa_runs q JOIN artifacts a ON a.artifact_id = q.artifact_id WHERE a.order_id = ?', d.orderId);
  const gate = (JSON.parse(qa?.results_json ?? '[]') as { check: string; passed: boolean }[]).find((c) => c.check === 'standard_acceptance');
  assert.equal(gate?.passed, true);
});

test('Nicht lieferfähig: nichts wird geliefert, Erstattung nur als Vorschlag an den Eigentümer, Kunde wird informiert', () => {
  const { ctx, clock } = makeCtx();
  const p = toPaid(ctx);
  const outcomes: string[] = [];
  for (let i = 1; i <= 4; i++) {
    outcomes.push(runProductionOnce(ctx, { mutateBytes: (b) => new Uint8Array([...b.slice(0, 20), 0x00]) }).results[0]?.outcome ?? 'none');
    clock.advance(backoffMs(i) + 1);
  }
  assert.equal(outcomes.at(-1), 'QA_FAILED');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', p.orderId), 0, 'keine Auslieferung');
  assert.equal(ctx.audit.byType('order.not_deliverable').filter((a) => a.subject_id === p.orderId).length, 1);
  const rr = ctx.db.get<{ status: string; origin: string; amount_minor: number }>('SELECT status, origin, amount_minor FROM refund_requests WHERE order_id = ?', p.orderId);
  assert.deepEqual([rr?.status, rr?.origin], ['PENDING_OWNER', 'qa_failure'], 'Erstattung wartet auf Freigabe');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM orders WHERE order_id = ? AND payment_state = 'REFUNDED'`, p.orderId), 0, 'nicht automatisch erstattet');
  assert.equal(ctx.db.get<{ status: string }>(`SELECT status FROM outbox_messages WHERE template = 'not_deliverable' AND order_id = ?`, p.orderId)?.status, 'HELD');
});

test('Produkte-Seite zeigt den Standard je Produkt', () => {
  const { ctx } = makeCtx();
  const html = renderProducts({ ctx, mode: 'test', csrf: 'x', path: '/dashboard/produkte', flash: null } as never);
  assert.ok(html.includes('Premium-Produktstandard'));
  assert.equal((html.match(/Standard erfüllt/g) ?? []).length, 4);
  assert.match(html, /\/dashboard\/produkte\/mini-ww/, 'Weg zu Vorschau und Freigabe');
});
