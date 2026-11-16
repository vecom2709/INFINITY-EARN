import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { requestAsset, uploadAsset } from '../../services/core-api/src/client-assets.ts';
import { crossSitePost } from '../../services/core-api/src/http-core.ts';
import { getDeliveryByOrder, issueDownloadToken } from '../../services/product-factory/src/delivery.ts';
import { Client, serve } from '../http.ts';
import { count, inbound, makeCtx, toDelivered } from '../helpers.ts';

/**
 * 17.0 Mandantentrennung (Priorität 0): Kunde A versucht über JEDEN Kundenweg an Daten von Kunde B zu kommen –
 * Download, Vertrag, Beleg, hochgeladene Datei, Datenexport, Portalseite und alle Portal-Aktionen mit fremder Auftragsnummer.
 */
let ctx: AppContext;
let base: string;
let close: () => void;
let A: ReturnType<typeof toDelivered>;
let B: ReturnType<typeof toDelivered>;
let bInvoice = '';
let bAsset = '';
const SECRET_B = 'Geheimfirma Beta GmbH';

before(async () => {
  ctx = makeCtx().ctx;
  A = toDelivered(ctx, inbound({ company: 'Alpha GmbH', name: 'Anna Alpha' }));
  B = toDelivered(ctx, inbound({ company: SECRET_B, name: 'Bernd Beta' }), { name: SECRET_B, address: 'Betaweg 9, 54321 Betastadt', country: 'DE', type: 'B2B', vatId: null });
  autopilotTick(ctx);
  bInvoice = ctx.db.get<{ invoice_id: string }>('SELECT invoice_id FROM invoices WHERE order_id = ?', B.orderId)?.invoice_id ?? '';
  const req = requestAsset(ctx, { orderId: B.orderId, kind: 'document', label: 'Preisliste Beta', purpose: 'Test der Mandantentrennung' });
  const up = uploadAsset(ctx, B.customerAccessKey ?? undefined, req.request_id, { filename: 'beta.txt', bytes: new TextEncoder().encode('vertrauliche Preisliste Beta') }, true);
  bAsset = (up as { assetId?: string; asset_id?: string }).assetId ?? (up as { asset_id?: string }).asset_id ?? ctx.db.get<{ asset_id: string }>('SELECT asset_id FROM client_assets WHERE customer_id = ?', B.customerId)?.asset_id ?? '';
  const s = await serve(ctx);
  base = s.base;
  close = () => s.server.close();
});
after(() => close());

const as = (key: string | null | undefined): Client => {
  const c = new Client(base);
  if (key) c.cookies.set('ie_customer', key);
  return c;
};

test('Voraussetzung: Kunde B hat Lieferung, Beleg und hochgeladene Datei – und kommt selbst an alles heran', async () => {
  assert.ok(bInvoice && bAsset && getDeliveryByOrder(ctx, B.orderId));
  const b = as(B.customerAccessKey);
  const del = getDeliveryByOrder(ctx, B.orderId);
  assert.equal((await b.get(`/download/${issueDownloadToken(ctx, del?.delivery_id ?? '', B.customerId)}`)).status, 200);
  assert.equal((await b.get(`/portal/vertrag/${B.orderId}`)).status, 200);
  assert.equal((await b.get(`/portal/beleg/${bInvoice}`)).status, 200);
  assert.equal((await b.get(`/portal/datei/${bAsset}`)).status, 200);
  assert.ok((await b.get('/portal')).text.includes(B.orderId), 'B sieht seinen Auftrag');
  assert.ok((await b.get('/portal/datenexport')).text.includes(SECRET_B), 'B erhält seine Daten im Export');
});

test('Kunde A (und ein Besucher ohne Konto) erhält nichts von Kunde B – auf keinem Lesezugriff', async () => {
  const del = getDeliveryByOrder(ctx, B.orderId);
  const tokenB = issueDownloadToken(ctx, del?.delivery_id ?? '', B.customerId);
  for (const [who, c] of [['Kunde A', as(A.customerAccessKey)], ['Besucher', as(null)]] as const) {
    for (const path of [`/download/${tokenB}`, `/portal/vertrag/${B.orderId}`, `/portal/beleg/${bInvoice}`, `/portal/datei/${bAsset}`]) {
      const r = await c.get(path);
      assert.ok([401, 403, 404].includes(r.status), `${who} ${path}: ${r.status}`);
      assert.ok(!r.text.includes(SECRET_B) && !r.text.includes('vertrauliche Preisliste'), `${who} ${path}: kein Inhalt von B`);
    }
    const portal = await c.get('/portal');
    assert.ok(!portal.text.includes(SECRET_B) && !portal.text.includes(B.orderId), `${who}: Portal zeigt nichts von B`);
    const exp = await c.get('/portal/datenexport');
    assert.ok(!exp.text.includes(SECRET_B) && !exp.text.includes(B.orderId), `${who}: Datenexport ohne B`);
  }
  // Ein für A ausgestellter Download-Token öffnet nicht die Lieferung von B, auch nicht mit B-Cookie vertauscht
  const delA = getDeliveryByOrder(ctx, A.orderId);
  const tokenA = issueDownloadToken(ctx, delA?.delivery_id ?? '', A.customerId);
  assert.ok([401, 403].includes((await as(B.customerAccessKey).get(`/download/${tokenA}`)).status), 'Token von A mit Cookie von B');
});

test('Kunde A kann mit der Auftragsnummer von B keine Aktion auslösen', async () => {
  const a = as(A.customerAccessKey);
  const before = {
    tickets: count(ctx, 'SELECT COUNT(*) AS n FROM support_tickets WHERE order_id = ?', B.orderId),
    refunds: count(ctx, 'SELECT COUNT(*) AS n FROM refund_requests WHERE order_id = ?', B.orderId),
    audit: count(ctx, `SELECT COUNT(*) AS n FROM audit_events WHERE subject_id = ? AND actor = 'customer'`, B.orderId),
  };
  const posts: [string, Record<string, string>][] = [
    ['/portal/support', { order_id: B.orderId, kind: 'withdrawal', message: 'Bitte alles erstatten' }],
    ['/portal/support', { order_id: B.orderId, kind: 'question', message: 'Frage zu fremdem Auftrag' }],
    ['/portal/abnahme', { order_id: B.orderId, decision: 'accept', note: 'ok' }],
    ['/portal/nachtrag', { order_id: B.orderId, items: 'Zusatz;1;10.00', note: 'x' }],
    ['/portal/rueckmeldung', { order_id: B.orderId, rating: '1', outcome: 'bad', comment: 'x' }],
    ['/portal/zahlung', { order_id: B.orderId }],
    [`/portal/datei/${bAsset}/widerrufen`, {}],
    [`/portal/datei/${bAsset}/rechte`, {}],
  ];
  for (const [path, body] of posts) {
    const r = await a.post(path, body);
    assert.ok(r.status !== 500, `${path}: kein Serverfehler (${r.status})`);
    assert.ok(!r.text.includes(SECRET_B), `${path}: kein Inhalt von B`);
  }
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM support_tickets WHERE order_id = ?', B.orderId), before.tickets, 'kein Ticket auf fremdem Auftrag');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM refund_requests WHERE order_id = ?', B.orderId), before.refunds, 'kein Erstattungsantrag auf fremdem Auftrag');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM audit_events WHERE subject_id = ? AND actor = 'customer'`, B.orderId), before.audit, 'keine Kundenaktion auf fremdem Auftrag protokolliert');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'asset.revoked' AND subject_id = ?`, bAsset), 0, 'Datei von B nicht widerrufen');
  assert.equal((await as(B.customerAccessKey).get(`/portal/datei/${bAsset}`)).status, 200, 'B kommt weiter an seine Datei');
});

test('Kunden-Cookie öffnet keine Verwaltung; fremdgesteuerte Formulare (anderer Origin) werden abgelehnt', async () => {
  const a = as(A.customerAccessKey);
  for (const path of ['/dashboard', '/admin/autopilot.json', '/api/audit', '/api/admin/backup', '/dashboard/sicherheit']) {
    const r = await a.get(path);
    assert.ok([303, 401, 403].includes(r.status), `${path}: ${r.status}`);
  }
  const host = new URL(base).host;
  assert.equal(crossSitePost({ method: 'POST', headers: { origin: 'https://boese.example', host } }), true);
  assert.equal(crossSitePost({ method: 'POST', headers: { origin: 'null', host } }), true);
  assert.equal(crossSitePost({ method: 'POST', headers: { origin: base, host } }), false, 'eigene Seite erlaubt');
  assert.equal(crossSitePost({ method: 'POST', headers: { host } }), false, 'Server-zu-Server ohne Origin (Webhook, Agent)');
  // Regression 16.11.2026: Echte Browser senden bei strenger Referrer-Policy „Origin: null“ auch von der eigenen Seite.
  // Damit wurden alle Formulare im Browser abgewiesen (curl-Prüfungen bemerkten es nicht). Maßgeblich ist Sec-Fetch-Site.
  assert.equal(crossSitePost({ method: 'POST', headers: { origin: 'null', host, 'sec-fetch-site': 'same-origin' } }), false, 'eigenes Formular im Browser');
  assert.equal(crossSitePost({ method: 'POST', headers: { origin: base, host, 'sec-fetch-site': 'cross-site' } }), true, 'Browser meldet fremde Seite');
  assert.equal(crossSitePost({ method: 'POST', headers: { origin: 'null', host, 'sec-fetch-site': 'same-site' } }), true, 'Nachbar-Subdomain ist fremd');
  assert.equal(crossSitePost({ method: 'POST', headers: { host, 'sec-fetch-site': 'none' } }), false, 'vom Nutzer selbst ausgelöst');
  const evil = await a.req('POST', '/portal/support', new URLSearchParams({ order_id: A.orderId, kind: 'withdrawal', message: 'fremdgesteuert' }).toString(), { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://boese.example' });
  assert.equal(evil.status, 403);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM refund_requests WHERE order_id = ?', A.orderId), 0, 'kein fremdgesteuerter Widerruf');
  const own = await a.req('POST', '/portal/support', new URLSearchParams({ order_id: A.orderId, kind: 'question', message: 'eigene Frage' }).toString(), { 'content-type': 'application/x-www-form-urlencoded', origin: base });
  assert.ok(own.status < 400, `eigene Anfrage funktioniert (${own.status})`);
});
