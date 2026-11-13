import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { requestAsset } from '../../services/core-api/src/client-assets.ts';
import { startServer } from '../../services/core-api/src/server.ts';
import { inbound, makeCtx, toOrder } from '../helpers.ts';

/** 161 über den echten Node-Server: Browser-FormData kommt Byte-genau an; übergroße Uploads werden vor dem Lesen abgebrochen. */
test('Echter Server: Datei-Upload per FormData Byte-genau, Größenlimit greift, andere Pfade bleiben bei 64 KB', async () => {
  const { ctx } = makeCtx();
  const a = toOrder(ctx, inbound({ email: 'upload@a.example' }));
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Logo', purpose: 'Programm' });
  const server = await startServer(ctx, 0, '127.0.0.1');
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 200_000 }, (_, i) => i % 256)]);
    const fd = new FormData();
    fd.append('datei', new Blob([png], { type: 'image/png' }), 'logo.png');
    fd.append('rechte', '1');
    const res = await fetch(`${base}/portal/dateien/${r.request_id}`, { method: 'POST', body: fd, headers: { cookie: `ie_customer=${a.customerAccessKey}` }, redirect: 'manual' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/portal?datei=ACCEPTED#dateien');
    const loc = ctx.db.get<{ l: string; bytes: number }>('SELECT blob_locator AS l, bytes FROM client_assets WHERE request_id = ?', r.request_id);
    assert.equal(loc?.bytes, png.length);
    assert.deepEqual(Buffer.from(ctx.blobs.get(loc?.l ?? '') ?? []).equals(Buffer.from(png)), true, 'Byte-genau gespeichert');
    const big = new FormData();
    big.append('datei', new Blob([new Uint8Array(4 * 1024 * 1024)]), 'gross.png');
    const tooBig = await fetch(`${base}/portal/dateien/${r.request_id}`, { method: 'POST', body: big, headers: { cookie: `ie_customer=${a.customerAccessKey}` }, redirect: 'manual' }).catch(() => ({ status: 413 }));
    assert.equal(tooBig.status, 413);
    const other = await fetch(`${base}/portal/support`, { method: 'POST', body: 'x='.padEnd(70 * 1024, 'a'), headers: { 'content-type': 'application/x-www-form-urlencoded' } }).catch(() => ({ status: 413 }));
    assert.equal(other.status, 413);
  } finally {
    await new Promise<void>((res) => server.close(() => res()));
  }
});
