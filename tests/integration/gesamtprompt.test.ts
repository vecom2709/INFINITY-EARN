import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderHome } from '../../apps/customer-portal/src/pages.ts';
import { featureRegistryExport } from '../../packages/registry/src/export.ts';
import { channelStatus } from '../../services/core-api/src/channels.ts';
import { createHandler } from '../../services/core-api/src/http-core.ts';
import { makeCtx, toOrder } from '../helpers.ts';

test('FEATURE_REGISTRY_127.json ist aktuell: 127 JA, 3 NEIN, Status-Vokabular des Gesamtprompts, nichts live bestätigt', () => {
  const file = JSON.parse(readFileSync('FEATURE_REGISTRY_127.json', 'utf8')) as { approved_count: number; rejected: { id: string }[]; features: { id: string; status: string; live_verified: boolean; evidence: string[] }[] };
  assert.deepEqual(file, JSON.parse(JSON.stringify(featureRegistryExport())), 'Datei veraltet – node scripts/export-registry.ts ausführen');
  assert.equal(file.approved_count, 127);
  assert.deepEqual(file.rejected.map((r) => r.id), ['048', '049', '110']);
  assert.ok(file.features.every((f) => ['SPECIFIED', 'IMPLEMENTED', 'TESTED', 'LIVE_VERIFIED', 'BLOCKED'].includes(f.status)));
  assert.ok(file.features.every((f) => !f.live_verified && f.status !== 'LIVE_VERIFIED'), 'kein unbewiesener Live-Status');
  assert.ok(file.features.filter((f) => f.status === 'TESTED').every((f) => f.evidence.length > 0 && f.evidence.every((p) => existsSync(p))), 'TESTED nur mit existierendem Testnachweis');
});

test('Geforderte Dokumente existieren; Testmatrix verweist nur auf existierende Tests', () => {
  for (const f of ['IMPLEMENTATION_PLAN.md', 'FEATURE_REGISTRY_127.json', 'DESIGN_SYSTEM_LUXURY_TURQUOISE.md', 'SYSTEM_ARCHITECTURE.md', 'COMMUNICATION_AND_DELIVERY.md', 'PRODUCT_FACTORY_REAL_SOFTWARE.md', 'ADMIN_LIVE_PREVIEW.md', 'TEST_MATRIX.md', 'PROGRESS.md']) assert.ok(existsSync(f), f);
  const matrix = readFileSync('TEST_MATRIX.md', 'utf8');
  const refs = [...matrix.matchAll(/`(tests\/[^`]+\.test\.ts)`/g)].map((m) => m[1] ?? '');
  assert.ok(refs.length >= 15);
  for (const r of refs) assert.ok(existsSync(r), `fehlt: ${r}`);
});

test('Kanalstatus ehrlich: nur Website und Portal verbunden, TED nur lesend, Rest nicht verbunden', () => {
  const { ctx } = makeCtx();
  const c = Object.fromEntries(channelStatus(ctx).map((x) => [x.id, x.state]));
  assert.equal(c.website, 'CONNECTED');
  assert.equal(c.portal, 'CONNECTED');
  for (const id of ['email-out', 'email-in', 'whatsapp', 'platforms', 'phone']) assert.equal(c[id], 'NOT_CONNECTED', id);
  assert.notEqual(c.ted, 'CONNECTED', 'Ausschreibungen nie als Kontaktkanal');
});

test('/konto zeigt das Kundenportal; robots sperrt /konto', async () => {
  const { ctx } = makeCtx();
  const o = toOrder(ctx);
  const h = createHandler(ctx);
  const r = await h({ method: 'GET', url: '/konto', headers: { cookie: `ie_customer=${o.customerAccessKey}` }, body: '', ip: '127.0.0.1' });
  assert.equal(r.status, 200);
  assert.match(String(r.body), /Ihre Dokumente|Vertragsbestätigung/);
  const anon = await h({ method: 'GET', url: '/konto', headers: {}, body: '', ip: '127.0.0.1' });
  assert.match(String(anon.body), /noch kein Kundenzugang gespeichert/);
  assert.match(String((await h({ method: 'GET', url: '/robots.txt', headers: {}, body: '', ip: '127.0.0.1' })).body), /Disallow: \/konto/);
});

test('Landingpage Kapitel 8: echter Preisrahmen, FAQ, Kontakt und ehrliche Pflichtinformationen; Abschluss = Kapitel 9', () => {
  const h = renderHome(['b2b-calc-csv'], 'de', '', { minMinor: 5000, maxMinor: 200000 });
  assert.match(h, /id="k8"/);
  assert.match(h, /id="k9"/);
  assert.match(h, /mindestens 50,00 €, höchstens 2000,00 €/);
  assert.equal((h.match(/<details>/g) ?? []).length, 4, 'vier echte Fragen');
  assert.match(h, /Testbetrieb\. Vollständige Anbieterangaben/);
  assert.match(renderHome(['b2b-calc-csv'], 'it'), /Prezzi chiari, risposte chiare/);
  assert.match(renderHome(['b2b-calc-csv'], 'en'), /Clear prices, clear answers/);
});
