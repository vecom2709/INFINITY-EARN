import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyOwnerDecisions } from '../../services/core-api/src/owner-decisions.ts';
import { effectivePolicy } from '../../services/core-api/src/policy-store.ts';
import { businessProfile, listActivationItems, readinessSummary } from '../../services/core-api/src/readiness.ts';
import { getSource } from '../../services/acquisition/src/sources.ts';
import { calcScope, inbound, makeConfig, makeCtx, toDelivered } from '../helpers.ts';

const ENV = {
  OWNER_SEAT_COUNTRY: 'IT',
  OWNER_ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf,b2b-calc-bundle,video-production',
  ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf,b2b-calc-bundle',
  OWNER_APPROVE_TED_TERMS: 'TED Legal Notice geprüft 2026-11-12',
  OWNER_DECISION_REF: 'Owner-Anweisung im Chat 2026-11-12',
};

test('Eigentümer-Entscheidungen aus der Konfiguration: Sitz Italien, Produkte, TED – einmalig und protokolliert', () => {
  // Wie auf Staging: bestehende Datenbank mit Policy v1 (nur CSV), danach Neustart mit Eigentümer-Konfiguration
  const { ctx: existing } = makeCtx();
  const ctx = { ...existing, config: makeConfig(ENV) };
  assert.equal(applyOwnerDecisions(ctx).length, 3);
  assert.equal(businessProfile(ctx).seat_country, 'IT');
  assert.equal(listActivationItems(ctx).find((i) => i.item_id === 'LA-01')?.status, 'IN_PROGRESS', 'nicht freigegeben – Steuerberatung fehlt');
  assert.deepEqual(effectivePolicy(ctx)?.allowedCapabilities, ['b2b-calc-csv', 'b2b-calc-pdf', 'b2b-calc-bundle'], 'gesperrte Produktart (Video) wird nicht freigegeben');
  assert.equal(getSource(ctx, 'src_ted_eu').status, 'APPROVED');
  const audits = ctx.audit.byType('owner.decision_applied');
  assert.equal(audits.length, 3);
  assert.ok(audits.every((a) => a.actor === 'owner' && a.data_json.includes('Owner-Anweisung im Chat')));
  assert.deepEqual(applyOwnerDecisions(ctx), [], 'idempotent – beim nächsten Start nichts doppelt');
  const d = toDelivered(ctx, inbound({ request: { capabilityId: 'b2b-calc-pdf', scope: calcScope() } }));
  assert.ok(d.orderId, 'PDF-Kalkulation jetzt bestellbar und lieferbar');
});

test('Konfiguration kann weder Live-Freigaben erteilen noch den Echtbetrieb einschalten', () => {
  assert.throws(() => makeCtx({ env: { ...ENV, LIVE_SALES_ENABLED: 'true' } }), /LIVE_SALES_ENABLED=true ist gesperrt/);
  const { ctx } = makeCtx({ env: ENV });
  const rs = readinessSummary(ctx);
  assert.equal(rs.done, 0, 'keine LA-Freigabe ohne Nachweis');
  assert.equal(rs.liveTechnicallyLocked, true);
  assert.equal(ctx.config.testMode, true);
});

test('Ohne Konfiguration bleibt alles beim sicheren Standard', () => {
  const { ctx } = makeCtx();
  assert.equal(businessProfile(ctx).seat_country, 'OPEN');
  assert.deepEqual(effectivePolicy(ctx)?.allowedCapabilities, ['b2b-calc-csv']);
  assert.notEqual(getSource(ctx, 'src_ted_eu').status, 'APPROVED');
  assert.equal(ctx.audit.byType('owner.decision_applied').length, 0);
});
