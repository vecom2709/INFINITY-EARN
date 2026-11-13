import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderConsole } from '../../apps/console/src/index.ts';
import { createHandler } from '../../services/core-api/src/http-core.ts';
import { parseCsv, previewDetail, previewFile, previewGallery } from '../../services/product-factory/src/preview.ts';
import { calcScope, inbound, makeCtx, toDelivered, toPaid } from '../helpers.ts';
import { runProductionOnce } from '../../services/product-factory/src/production.ts';

const ENV = { ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf,b2b-calc-bundle' };

test('Galerie zeigt jedes produzierte Produkt mit echtem Stand (Version, Prüfsumme, Prüfung, Lieferung)', () => {
  const { ctx } = makeCtx({ env: ENV });
  const a = toDelivered(ctx);
  const b = toDelivered(ctx, inbound({ request: { capabilityId: 'b2b-calc-pdf', scope: calcScope() } }));
  const c = toDelivered(ctx, inbound({ request: { capabilityId: 'b2b-calc-bundle', scope: calcScope() } }));
  const g = previewGallery(ctx, true);
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((x) => x.viewer).sort(), ['pdf', 'table', 'zip']);
  assert.ok(g.every((x) => x.qaPassed === true && x.delivered && x.sha256.length === 64 && x.version === 1));
  assert.deepEqual(new Set(g.map((x) => x.orderId)), new Set([a.orderId, b.orderId, c.orderId]));
  assert.equal(previewGallery(ctx, false).length, 0, 'Testprodukte erscheinen nie in der Echt-Ansicht');
  assert.equal(previewGallery(ctx, true, a.orderId).length, 1, 'Suche nach Auftrag');
});

test('Echter Viewer: Tabelle aus der Datei, PDF-Original, ZIP-Inhalt mit CRC; Zusagen mit Prüfergebnis', () => {
  const { ctx } = makeCtx({ env: ENV });
  toDelivered(ctx);
  toDelivered(ctx, inbound({ request: { capabilityId: 'b2b-calc-bundle', scope: calcScope() } }));
  const all = previewGallery(ctx, true);
  const zip = all.find((x) => x.viewer === 'zip');
  const csv = all.find((x) => x.viewer === 'table');
  const dc = previewDetail(ctx, csv?.artifactId ?? '');
  assert.equal(dc?.integrity, 'OK');
  assert.ok((dc?.table?.length ?? 0) >= 4, 'Tabelle aus der echten CSV gelesen');
  assert.ok(dc?.promised.length && dc.promised.every((p) => p.passed === true), 'jede Zusage mit bestandener Prüfung');
  const dz = previewDetail(ctx, zip?.artifactId ?? '');
  assert.deepEqual(dz?.zipEntries?.map((z) => [z.name, z.crcOk]), [['kalkulation.csv', true], ['kalkulation.pdf', true]]);
  const pdf = previewFile(ctx, zip?.artifactId ?? '', 'kalkulation.pdf');
  assert.ok(pdf && new TextDecoder('latin1').decode(pdf.bytes).startsWith('%PDF-1.4'));
  assert.deepEqual(parseCsv('a,"b ""x"", c"\r\n1,2\n'), [['a', 'b "x", c'], ['1', '2']]);
});

test('Ehrlichkeit: manipulierte Datei wird nicht angezeigt; QA-Fehler sichtbar; noch nicht produziert = kein Viewer', () => {
  const { ctx } = makeCtx({ env: ENV });
  const d = toDelivered(ctx);
  const [item] = previewGallery(ctx, true);
  const path = ctx.db.get<{ path: string }>('SELECT path FROM artifacts WHERE artifact_id = ?', item?.artifactId ?? '')?.path ?? '';
  writeFileSync(path, 'manipuliert');
  assert.equal(previewDetail(ctx, item?.artifactId ?? '')?.integrity, 'CHECKSUM_MISMATCH');
  assert.equal(previewFile(ctx, item?.artifactId ?? ''), null);
  const p = toPaid(ctx);
  runProductionOnce(ctx, { mutateBytes: (b) => new Uint8Array([...b.slice(0, 20), 0x00]) });
  const failed = previewGallery(ctx, true).find((x) => x.orderId === p.orderId);
  assert.equal(failed?.qaPassed, false);
  assert.ok((failed?.failedChecks.length ?? 0) > 0);
  const html = renderConsole(ctx, `/dashboard/auftraege/${toPaid(ctx).orderId}`, new URLSearchParams('modus=test'), 'x') ?? '';
  assert.match(html, /Noch keine Live-Vorschau verfügbar/);
  assert.ok(d.orderId);
});

test('HTTP: Vorschau-Datei nur für den Eigentümer; Detailseite mit echter Tabelle und Sperr-Aktion, ohne Skripte', async () => {
  const { ctx } = makeCtx({ env: { ...ENV, OWNER_PASSWORD_HASH: '' } });
  toDelivered(ctx);
  const [item] = previewGallery(ctx, true);
  const h = createHandler(ctx);
  const anon = await h({ method: 'GET', url: `/admin/vorschau/${item?.artifactId}/datei`, headers: {}, body: '', ip: '127.0.0.1' });
  assert.equal(anon.status, 303, 'ohne Anmeldung keine Datei');
  const page = renderConsole(ctx, `/dashboard/produkte/vorschau/${item?.artifactId}`, new URLSearchParams('modus=test'), 'csrf-x') ?? '';
  assert.match(page, /Live-Vorschau/);
  assert.match(page, /Datei sperren und Lieferung zurückziehen/);
  assert.match(page, /<table/);
  assert.doesNotMatch(page, /<script/i);
});
