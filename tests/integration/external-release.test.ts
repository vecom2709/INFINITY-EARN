import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeRelease, isSellable, releaseEvidence, releaseProduct, RELEASE_PROBE_MAX_AGE_MS } from '../../services/core-api/src/releases.ts';
import { requestProbe } from '../../services/product-factory/src/external-build.ts';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { makeCtx } from '../helpers.ts';

/**
 * Freigabe extern gebauter Produktarten (Windows-Server, KI-Lauf): Der Shop kann sie nicht selbst erzeugen, deshalb
 * gilt der letzte Probebau als Nachweis – abgeschlossen, Abnahme bestanden, höchstens 14 Tage alt.
 */
const AGENT = `agent_${'x'.repeat(40)}`;
const ENV = { BUILD_AGENT_TOKEN: AGENT, AI_DAILY_TASK_LIMIT: '3', ALLOWED_CAPABILITIES: 'b2b-calc-csv,ai-texte,win-lager' };
const SHA = 'a'.repeat(64);

function finishProbe(ctx: AppContext, buildId: string, over: { state?: string; passed?: number; qa?: unknown } = {}): void {
  ctx.db.run('UPDATE external_builds SET state = ?, qa_passed = ?, result_sha256 = ?, qa_json = ?, updated_at = ? WHERE build_id = ?',
    over.state ?? 'DONE', over.passed ?? 1, SHA, JSON.stringify(over.qa ?? [{ check: 'structure', passed: true }, { check: 'checksum', passed: true }]), ctx.clock().toISOString(), buildId);
}

test('KI-Texte: ohne oder mit unfertigem Probebau keine Freigabe; mit bestandenem Probebau freigegeben und bestellbar', () => {
  const { ctx } = makeCtx({ env: ENV });
  assert.throws(() => releaseProduct(ctx, 'ai-texte', 9900), /NO_PASSED_PROBE/);
  const b = requestProbe(ctx, 'ai-texte').build;
  assert.throws(() => releaseProduct(ctx, 'ai-texte', 9900), /NO_PASSED_PROBE/, 'Probebau wartet noch');
  finishProbe(ctx, b.build_id, { passed: 0 });
  assert.throws(() => releaseProduct(ctx, 'ai-texte', 9900), /NO_PASSED_PROBE/, 'Abnahme nicht bestanden');
  finishProbe(ctx, b.build_id, { qa: [{ check: 'structure', passed: true }, { check: 'pii', passed: false }] });
  assert.throws(() => releaseProduct(ctx, 'ai-texte', 9900), /NO_PASSED_PROBE/, 'Prüfprotokoll mit Fehler, auch wenn als bestanden markiert');
  assert.equal(activeRelease(ctx, 'ai-texte'), null);
  assert.equal(isSellable(ctx, 'ai-texte'), false);

  finishProbe(ctx, b.build_id);
  const ev = releaseEvidence(ctx, 'ai-texte');
  assert.equal(ev.sha256, SHA);
  assert.ok(ev.checks.some((c) => c.check === 'probe_build' && (c.detail ?? '').includes(b.build_id)));
  const r = releaseProduct(ctx, 'ai-texte', 9900);
  assert.equal(r.release.price_minor, 9900);
  assert.equal(r.sellable, true);
  assert.equal(isSellable(ctx, 'ai-texte'), true);
  assert.equal(JSON.parse(String(activeRelease(ctx, 'ai-texte')?.sample_qa_json)).sha256, SHA, 'Nachweis in der Freigabe gespeichert');
});

test('Ein Probebau, der älter als 14 Tage ist, reicht nicht mehr', () => {
  const { ctx, clock } = makeCtx({ env: ENV });
  const b = requestProbe(ctx, 'ai-texte').build;
  finishProbe(ctx, b.build_id);
  clock.advance(RELEASE_PROBE_MAX_AGE_MS + 60_000);
  assert.throws(() => releaseProduct(ctx, 'ai-texte', 9900), /NO_PASSED_PROBE/);
});

test('Windows-Programm: trotz bestandenem Probebau gesperrt, solange Punkte der Freigabe-Akte offen sind', () => {
  const { ctx } = makeCtx({ env: ENV });
  const b = requestProbe(ctx, 'win-lager').build;
  finishProbe(ctx, b.build_id);
  assert.throws(() => releaseProduct(ctx, 'win-lager', 49000), /RELEASE_GATES_OPEN/);
  assert.equal(isSellable(ctx, 'win-lager'), false);
});

test('Im Shop erzeugte Produktarten werden weiterhin bei der Freigabe neu erzeugt und geprüft', () => {
  const { ctx } = makeCtx({ env: { ALLOWED_CAPABILITIES: 'b2b-calc-csv,mini-ww' } });
  const ev = releaseEvidence(ctx, 'mini-ww');
  assert.ok(ev.bytes > 0 && ev.passed);
  assert.ok(!ev.checks.some((c) => c.check === 'probe_build'));
});
