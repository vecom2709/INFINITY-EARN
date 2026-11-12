import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderConsole } from '../../apps/console/src/index.ts';
import { analyzeDebt, renderDebtMarkdown } from '../../scripts/lib/tech-debt.ts';
import { recordAcceptance } from '../../services/core-api/src/aftercare.ts';
import { MIN_SAMPLE, priceAcceptance, productLifecycle } from '../../services/finance/src/insights.ts';
import { listCapabilities } from '../../services/product-factory/src/registry.ts';
import { makeCtx, toDelivered, toOrder, toQuote } from '../helpers.ts';

test('014/033 Preisspannen: echte Zählung, kein Gewinner bei kleiner Stichprobe, keine automatische Preisänderung', () => {
  const { ctx } = makeCtx();
  toQuote(ctx);
  toOrder(ctx);
  toDelivered(ctx);
  const r = priceAcceptance(ctx, true);
  const band = r.bands.find((b) => b.quotes > 0);
  assert.deepEqual([band?.quotes, band?.accepted, band?.paid], [3, 2, 1]);
  assert.equal(band?.enoughData, false);
  assert.match(r.hint, new RegExp(`mindestens ${MIN_SAMPLE}`));
  assert.match(r.hint, /nicht automatisch geändert/);
  assert.equal(priceAcceptance(ctx, false).bands.reduce((n, b) => n + b.quotes, 0), 0);
  assert.match(renderConsole(ctx, '/dashboard/berichte', new URLSearchParams('modus=test'), 'x') ?? '', /zu wenige Daten/);
});

test('087 Lebenszyklus: neu unter 5 Lieferungen; Mängel erhöhen die Problemquote → „prüfen“', () => {
  const { ctx } = makeCtx();
  const caps = listCapabilities();
  toDelivered(ctx);
  assert.equal(productLifecycle(ctx, true, caps).find((r) => r.product === 'b2b-calc-csv')?.status, 'neu');
  for (let i = 0; i < 4; i++) toDelivered(ctx);
  let row = productLifecycle(ctx, true, caps).find((r) => r.product === 'b2b-calc-csv');
  assert.deepEqual([row?.delivered, row?.status], [5, 'stabil']);
  const d = toDelivered(ctx);
  recordAcceptance(ctx, d.customerAccessKey ?? undefined, d.orderId, 'DEFECT_REPORTED', 'Summe falsch');
  const d2 = toDelivered(ctx);
  recordAcceptance(ctx, d2.customerAccessKey ?? undefined, d2.orderId, 'DEFECT_REPORTED', 'Zeile fehlt');
  row = productLifecycle(ctx, true, caps).find((r) => r.product === 'b2b-calc-csv');
  assert.equal(row?.defects, 2);
  assert.equal(row?.status, 'prüfen', '2 Mängel bei 7 Lieferungen = 28 % > 20 %');
  assert.match(row?.reason ?? '', /Problemquote \(29 %/);
});

test('128 Altlasten: große Dateien, Markierungen und fehlender Testbezug werden priorisiert', () => {
  const big = { path: 'services/x/src/big.ts', text: 'a\n'.repeat(900) };
  const todo = { path: 'services/x/src/todo.ts', text: '// TODO aufräumen\n// FIXME später\n' };
  const tested = { path: 'services/x/src/ok.ts', text: 'export const ok = 1;\n' };
  const r = analyzeDebt([big, todo, tested], [{ path: 'tests/a.test.ts', text: "import '../services/x/src/ok.ts';" }]);
  assert.equal(r.todo, 2);
  assert.equal(r.items[0]?.path, 'services/x/src/big.ts');
  assert.ok(r.items.some((i) => i.path.endsWith('todo.ts') && i.reasons.some((x) => /2 offene Markierung/.test(x))));
  assert.ok(!r.items.some((i) => i.path.endsWith('ok.ts')));
  assert.match(renderDebtMarkdown(r, '2026-11-12'), /Releases nur nach `npm run verify`/);
});
