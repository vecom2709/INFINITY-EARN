import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderPortal } from '../../apps/customer-portal/src/pages.ts';
import { assetForProduction, assetGate, confirmAccess, confirmRights, containsSecret, customerAsset, requestAsset, requestsForCustomer, revokeAsset, scanUpload, uploadAsset, UPLOAD_MAX_BYTES } from '../../services/core-api/src/client-assets.ts';
import { customerByKey, erasePersonalData } from '../../services/core-api/src/customers.ts';
import { WorkflowError } from '../../services/core-api/src/errors.ts';
import { createHandler } from '../../services/core-api/src/http-core.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { mockPay } from '../../services/finance/src/mock-provider.ts';
import { runProductionOnce } from '../../services/product-factory/src/production.ts';
import { parseMultipart } from '../../packages/shared/src/multipart.ts';
import { count, inbound, makeCtx, toOrder } from '../helpers.ts';

/** Funktion 161 – Secure Client Asset & Access Concierge. Pflichttests PR-161-01 … PR-161-08 (Gesamtprompt 157, Anlage J). */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3, 4]);
const PNG2 = new Uint8Array([...PNG, 9, 9, 9]);
const code = (fn: () => unknown): string => { try { fn(); return 'OK'; } catch (e) { return e instanceof WorkflowError ? e.code : String(e); } };

function twoCustomers() {
  const { ctx, clock } = makeCtx();
  const a = toOrder(ctx, inbound({ email: 'anna@a.example', name: 'Anna A' }));
  const b = toOrder(ctx, inbound({ email: 'bert@b.example', name: 'Bert B' }));
  return { ctx, clock, a, b };
}

test('PR-161-01: fehlendes Logo wird nur beim zugeordneten Kunden angefragt', () => {
  const { ctx, a, b } = twoCustomers();
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Firmenlogo', purpose: 'Kopfzeile im Programm' });
  const ca = customerByKey(ctx, a.customerAccessKey ?? undefined);
  const cb = customerByKey(ctx, b.customerAccessKey ?? undefined);
  assert.ok(ca && cb);
  assert.equal(r.customer_id, ca.customer_id, 'Kunde kommt aus dem Auftrag, nicht aus einer Eingabe');
  assert.equal(requestsForCustomer(ctx, ca.customer_id).length, 1);
  assert.equal(requestsForCustomer(ctx, cb.customer_id).length, 0);
  assert.match(renderPortal(ctx, ca), /Firmenlogo/);
  assert.doesNotMatch(renderPortal(ctx, cb), /Firmenlogo/);
  assert.equal(code(() => requestAsset(ctx, { orderId: 'ord_unbekannt', kind: 'logo', label: 'x1', purpose: 'y1' })), 'ORDER_NOT_FOUND');
});

test('PR-161-02: Widerruf verhindert jede weitere Nutzung sofort', () => {
  const { ctx, a } = twoCustomers();
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Logo', purpose: 'Programm' });
  const up = uploadAsset(ctx, a.customerAccessKey ?? undefined, r.request_id, { filename: 'logo.png', bytes: PNG }, true);
  assert.equal(up.status, 'ACCEPTED');
  assert.deepEqual([...assetForProduction(ctx, up.assetId ?? '', a.orderId)], [...PNG]);
  assert.equal(revokeAsset(ctx, up.assetId ?? '', { customerKey: a.customerAccessKey ?? undefined }, 'nicht mehr gewünscht'), 1);
  assert.equal(code(() => assetForProduction(ctx, up.assetId ?? '', a.orderId)), 'GRANT_MISSING_OR_REVOKED');
  assert.equal(assetGate(ctx, a.orderId).ready, false, 'nach Widerruf fehlt die Datei wieder');
  assert.equal(ctx.audit.byType('asset.production_denied').length, 1);
});

test('PR-161-03: unzulässige oder infizierte Datei wird nicht gespeichert und nie an die Produktion gegeben', () => {
  const { ctx, a } = twoCustomers();
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Logo', purpose: 'Programm' });
  const key = a.customerAccessKey ?? undefined;
  const bad: [string, Uint8Array, RegExp][] = [
    ['logo.exe', new Uint8Array([0x4d, 0x5a, 1, 2]), /nicht erlaubt/],
    ['logo.png', new Uint8Array([0x4d, 0x5a, 1, 2, 3]), /Ausführbare Datei/],
    ['logo.png', new TextEncoder().encode('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'), /EICAR/],
    ['logo.jpg', PNG, /kein JPEG/],
    ['logo.svg', new TextEncoder().encode('<svg onload="alert(1)"/>'), /nicht erlaubt/],
    ['logo.pdf', new TextEncoder().encode('%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>'), /Skript/],
  ];
  for (const [name, bytes, why] of bad) {
    const out = uploadAsset(ctx, key, r.request_id, { filename: name, bytes }, true);
    assert.equal(out.status, 'REJECTED', name);
    assert.match(out.reason, why, name);
    assert.equal(code(() => assetForProduction(ctx, out.assetId ?? '', a.orderId)), 'ASSET_NOT_USABLE');
  }
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM client_assets WHERE scan_status = 'REJECTED' AND blob_locator IS NULL`), bad.length, 'abgelehnte Dateien nicht gespeichert');
  assert.equal(scanUpload('document', 'makro.docx', new TextEncoder().encode('PK\u0003\u0004[Content_Types].xml word/vbaProject.bin')).reason, 'Office-Datei mit Makros – nicht erlaubt');
  assert.equal(scanUpload('logo', 'gross.png', new Uint8Array(UPLOAD_MAX_BYTES + 1)).ok, false);
  assert.equal(scanUpload('data', 'kunden.csv', new TextEncoder().encode('Name;Ort\nMüller;Köln\n')).ok, true);
});

test('PR-161-04: Dateizugriff zwischen zwei Kunden wird blockiert (Portal, Upload, Produktion)', () => {
  const { ctx, a, b } = twoCustomers();
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Logo', purpose: 'Programm' });
  const up = uploadAsset(ctx, a.customerAccessKey ?? undefined, r.request_id, { filename: 'logo.png', bytes: PNG }, true);
  const bKey = b.customerAccessKey ?? undefined;
  assert.equal(code(() => uploadAsset(ctx, bKey, r.request_id, { filename: 'x.png', bytes: PNG2 }, true)), 'FORBIDDEN');
  assert.equal(code(() => customerAsset(ctx, bKey, up.assetId ?? '')), 'FORBIDDEN');
  assert.equal(code(() => revokeAsset(ctx, up.assetId ?? '', { customerKey: bKey }, 'x')), 'FORBIDDEN');
  assert.equal(code(() => confirmRights(ctx, bKey, up.assetId ?? '')), 'FORBIDDEN');
  assert.equal(code(() => assetForProduction(ctx, up.assetId ?? '', b.orderId)), 'TENANT_MISMATCH', 'Produktion für Kunde B bekommt nie die Datei von A');
  assert.equal(code(() => customerAsset(ctx, undefined, up.assetId ?? '')), 'FORBIDDEN', 'ohne Zugang nichts');
  assert.ok(ctx.audit.byType('security.asset_access_denied').length >= 4);
});

test('PR-161-05: Zugangsdaten erscheinen weder in Datenbank, Protokoll noch Portal', () => {
  const { ctx, a } = twoCustomers();
  const key = a.customerAccessKey ?? undefined;
  const acc = requestAsset(ctx, { orderId: a.orderId, kind: 'access', label: 'Zugang Shop', purpose: 'Produktdaten importieren' });
  const fakeHex = Array.from({ length: 32 }, (_, i) => '0123456789abcdef'[(i * 7 + 3) % 16]).join('');
  const live = ['sk', 'live', '51HxyzABCDEFGH12345678'].join('_');
  const secrets = [['Pass', 'wort: Sommer2026!'].join(''), live, ['api', 'key=abcd1234efgh'].join('_'), fakeHex];
  for (const s of secrets) {
    assert.equal(code(() => confirmAccess(ctx, key, acc.request_id, `Hier: ${s}`)), 'SECRET_DETECTED', s);
    assert.ok(containsSecret(s));
  }
  const id = confirmAccess(ctx, key, acc.request_id, 'Einladung an produktion@infinity-earn.example als Benutzer „Import“');
  assert.ok(id);
  const data = requestAsset(ctx, { orderId: a.orderId, kind: 'data', label: 'Artikelliste', purpose: 'Import' });
  const leak = uploadAsset(ctx, key, data.request_id, { filename: 'artikel.csv', bytes: new TextEncoder().encode(`sku;preis\nA1;10\n# ${['to', 'ken=', 'ghp', '_abcdefghijklmnopqrstuvwxyz123456'].join('')}\n`) }, true);
  assert.equal(leak.status, 'REJECTED');
  const everything = JSON.stringify([ctx.db.all('SELECT * FROM client_assets'), ctx.db.all('SELECT * FROM asset_requests'), ctx.db.all('SELECT * FROM audit_events')]);
  for (const s of ['Sommer2026', live.slice(0, 10), 'abcd1234efgh', fakeHex.slice(0, 12), 'abcdefghijklmnop']) assert.ok(!everything.includes(s), `Geheimnis gespeichert: ${s}`);
  assert.equal(code(() => requestAsset(ctx, { orderId: a.orderId, kind: 'access', label: 'Zugang', purpose: ['Pass', 'wort: geheim123'].join('') })), 'SECRET_DETECTED');
  assert.equal(code(() => uploadAsset(ctx, key, acc.request_id, { filename: 'p.txt', bytes: PNG }, true)), 'NO_UPLOAD_FOR_ACCESS');
});

test('PR-161-06: Datei ohne bestätigte Nutzungsrechte bleibt gesperrt', () => {
  const { ctx, a } = twoCustomers();
  const key = a.customerAccessKey ?? undefined;
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Logo', purpose: 'Programm' });
  const up = uploadAsset(ctx, key, r.request_id, { filename: 'logo.png', bytes: PNG }, false);
  assert.equal(up.status, 'LOCKED_NO_RIGHTS');
  assert.equal(code(() => assetForProduction(ctx, up.assetId ?? '', a.orderId)), 'RIGHTS_MISSING');
  assert.equal(assetGate(ctx, a.orderId).ready, false);
  confirmRights(ctx, key, up.assetId ?? '');
  assert.equal(assetGate(ctx, a.orderId).ready, true);
  assert.equal(assetForProduction(ctx, up.assetId ?? '', a.orderId).length, PNG.length);
});

test('PR-161-07: Dubletten werden versioniert statt überschrieben', () => {
  const { ctx, a } = twoCustomers();
  const key = a.customerAccessKey ?? undefined;
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Logo', purpose: 'Programm' });
  const v1 = uploadAsset(ctx, key, r.request_id, { filename: 'logo.png', bytes: PNG }, true);
  const again = uploadAsset(ctx, key, r.request_id, { filename: 'logo-kopie.png', bytes: PNG }, true);
  assert.equal(again.status, 'DUPLICATE');
  assert.equal(again.assetId, v1.assetId);
  const v2 = uploadAsset(ctx, key, r.request_id, { filename: 'logo.png', bytes: PNG2 }, true);
  assert.deepEqual([v1.version, v2.version], [1, 2]);
  assert.deepEqual([...customerAsset(ctx, key, v1.assetId ?? '').bytes], [...PNG], 'Version 1 unverändert erhalten');
  assert.deepEqual([...customerAsset(ctx, key, v2.assetId ?? '').bytes], [...PNG2]);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM client_assets WHERE request_id = ?', r.request_id), 2);
});

test('PR-161-08: fehlende Kundendatei pausiert die Produktion ohne Ersatzdaten; danach läuft sie normal', () => {
  const { ctx, clock, a } = twoCustomers();
  const key = a.customerAccessKey ?? undefined;
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Firmenlogo', purpose: 'Programm' });
  mockPay(ctx, getOrder(ctx, a.orderId));
  const first = runProductionOnce(ctx);
  assert.equal(first.results[0]?.outcome, 'BLOCKED');
  assert.match(first.results[0]?.detail ?? '', /ASSET_MISSING: Firmenlogo/);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM artifacts WHERE order_id = ?', a.orderId), 0, 'nichts mit Fantasie-Daten erzeugt');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', a.orderId), 0);
  uploadAsset(ctx, key, r.request_id, { filename: 'logo.png', bytes: PNG }, true);
  clock.advance(16 * 60_000);
  const second = runProductionOnce(ctx);
  assert.equal(second.results.find((x) => x.orderId === a.orderId)?.outcome, 'DELIVERED');
});

test('Upload über das Portal (multipart, ohne JavaScript): Grenzen, fremde Seiten, Download nur eigener Dateien', async () => {
  const { ctx, a, b } = twoCustomers();
  const h = createHandler(ctx);
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Logo', purpose: 'Programm' });
  const boundary = '----ieTest123';
  const enc = new TextEncoder();
  const body = (bytes: Uint8Array, rights = true): Uint8Array => new Uint8Array([
    ...enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="datei"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`), ...bytes,
    ...enc.encode(`\r\n${rights ? `--${boundary}\r\nContent-Disposition: form-data; name="rechte"\r\n\r\n1\r\n` : ''}--${boundary}--\r\n`),
  ]);
  const parsed = parseMultipart(body(PNG), `multipart/form-data; boundary=${boundary}`);
  assert.deepEqual([...(parsed?.files[0]?.data ?? [])], [...PNG], 'Bytes unverändert');
  assert.equal(parsed?.fields.get('rechte'), '1');
  const send = (cookieKey: string | null | undefined, bytes: Uint8Array, extra: Record<string, string> = {}) => h({ method: 'POST', url: `/portal/dateien/${r.request_id}`, headers: { cookie: `ie_customer=${cookieKey ?? ''}`, 'content-type': `multipart/form-data; boundary=${boundary}`, ...extra }, body: '', bodyBytes: bytes, ip: '1.2.3.4' });
  const ok = await send(a.customerAccessKey, body(PNG));
  assert.equal(ok.status, 303);
  assert.equal(ok.headers?.location, '/portal?datei=ACCEPTED#dateien');
  assert.match(String((await send(b.customerAccessKey, body(PNG2))).headers?.location), /dateifehler=FORBIDDEN/);
  assert.equal((await send(a.customerAccessKey, body(PNG2), { 'sec-fetch-site': 'cross-site' })).status, 403, 'kein Upload von fremden Seiten');
  const big = await h({ method: 'POST', url: `/portal/dateien/${r.request_id}`, headers: { cookie: `ie_customer=${a.customerAccessKey}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, body: '', bodyBytes: new Uint8Array(UPLOAD_MAX_BYTES + 70 * 1024), ip: '1.2.3.4' });
  assert.equal(big.status, 413);
  const wrongPath = await h({ method: 'POST', url: '/portal/support', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: '', bodyBytes: body(PNG), ip: '1.2.3.4' });
  assert.equal(wrongPath.status, 413, 'Bytes-Upload nur auf dem Upload-Pfad');
  const portal = await h({ method: 'GET', url: '/portal?datei=ACCEPTED', headers: { cookie: `ie_customer=${a.customerAccessKey}` }, body: '', ip: '1.2.3.4' });
  assert.match(String(portal.body), /Datei geprüft und für Ihren Auftrag freigegeben/);
  assert.match(String(portal.body), /enctype="multipart\/form-data"/);
  const assetId = ctx.db.get<{ asset_id: string }>('SELECT asset_id FROM client_assets WHERE request_id = ?', r.request_id)?.asset_id ?? '';
  const dl = await h({ method: 'GET', url: `/portal/datei/${assetId}`, headers: { cookie: `ie_customer=${a.customerAccessKey}` }, body: '', ip: '1.2.3.4' });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers?.['content-type'], 'application/octet-stream', 'nie im Browser ausgeführt');
  assert.equal((await h({ method: 'GET', url: `/portal/datei/${assetId}`, headers: { cookie: `ie_customer=${b.customerAccessKey}` }, body: '', ip: '1.2.3.4' })).status, 403);
});

test('Löschantrag löscht Kundendateien endgültig und widerruft Freigaben', () => {
  const { ctx, a } = twoCustomers();
  const r = requestAsset(ctx, { orderId: a.orderId, kind: 'logo', label: 'Logo', purpose: 'Programm' });
  const up = uploadAsset(ctx, a.customerAccessKey ?? undefined, r.request_id, { filename: 'logo.png', bytes: PNG }, true);
  const loc = ctx.db.get<{ l: string }>('SELECT blob_locator AS l FROM client_assets WHERE asset_id = ?', up.assetId ?? '')?.l ?? '';
  erasePersonalData(ctx, a.leadId, 'owner');
  assert.equal(ctx.blobs.get(loc), null, 'Datei gelöscht');
  assert.equal(code(() => assetForProduction(ctx, up.assetId ?? '', a.orderId)), 'ASSET_NOT_USABLE');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM asset_grants WHERE revoked_at IS NULL'), 0);
});
