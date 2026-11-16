import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseProduct } from '../../services/core-api/src/releases.ts';
import { makeCtx } from '../helpers.ts';
import { Client, serve } from '../http.ts';

/**
 * Tiefenprüfung Sichtbarkeit und Vertrauen (16.11.2026). Funde: Katalog und Vertrauenspass nannten eine erlaubte, aber
 * noch nicht freigegebene Produktart als bestellbar (und ohne verständlichen Namen); robots.txt sperrte den Katalog,
 * der für Suchmaschinen und Einkaufssysteme gedacht ist.
 */
const ENV = { ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-xlsx,mini-ww', OWNER_ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-xlsx' };
type Listed = { id: string; name: string }[];

test('Katalog, Vertrauenspass und Vertrauensseite nennen nur wirklich bestellbare Produkte – mit verständlichem Namen', async () => {
  const { ctx } = makeCtx({ env: ENV });
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    const read = async (): Promise<{ catalog: Listed; pass: Listed; page: string }> => ({
      catalog: (JSON.parse((await c.get('/api/katalog')).text) as { products: Listed }).products,
      pass: (JSON.parse((await c.get('/.well-known/infinity-earn.json')).text) as { products: Listed }).products,
      page: (await c.get('/vertrauen')).text,
    });
    const before = await read();
    assert.deepEqual(before.catalog.map((p) => p.id).sort(), ['b2b-calc-csv', 'b2b-calc-xlsx'], 'erlaubt, aber nicht freigegeben = nicht im Katalog');
    assert.deepEqual(before.pass.map((p) => p.id).sort(), ['b2b-calc-csv', 'b2b-calc-xlsx']);
    assert.ok(!before.page.includes('mini-ww') && !before.page.includes('Warenwirtschaft für kleine Betriebe –'));

    releaseProduct(ctx, 'mini-ww', 49000);
    const after = await read();
    assert.equal(after.catalog.find((p) => p.id === 'mini-ww')?.name, 'Warenwirtschaft für kleine Betriebe');
    assert.equal(after.pass.find((p) => p.id === 'mini-ww')?.name, 'Warenwirtschaft für kleine Betriebe');
    for (const p of [...after.catalog, ...after.pass]) assert.notEqual(p.name, p.id, `verständlicher Name für ${p.id}`);
  } finally {
    s.server.close();
  }
});

test('robots.txt: Katalog erlaubt, private Bereiche gesperrt; jede Sitemap-Adresse ist erreichbar und nicht gesperrt', async () => {
  const { ctx } = makeCtx({ env: ENV });
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    const robots = (await c.get('/robots.txt')).text;
    const lines = robots.split('\n');
    assert.ok(lines.indexOf('Allow: /api/katalog') >= 0 && lines.indexOf('Allow: /api/katalog') < lines.indexOf('Disallow: /api/'), 'Katalog vor der allgemeinen Sperre erlaubt');
    for (const d of ['/dashboard', '/admin', '/portal', '/angebot/', '/checkout/', '/download/', '/programm-nach-vorlage/stand/']) assert.ok(lines.includes(`Disallow: ${d}`), d);
    const disallowed = lines.filter((l) => l.startsWith('Disallow: ')).map((l) => l.slice(10));
    const paths = [...(await c.get('/sitemap.xml')).text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname);
    assert.ok(paths.length >= 8);
    for (const p of paths) {
      assert.equal((await c.get(p)).status, 200, `Sitemap-Adresse erreichbar: ${p}`);
      assert.ok(!disallowed.some((d) => p.startsWith(d)), `nicht gesperrt: ${p}`);
    }
    assert.equal((await c.get('/api/katalog')).status, 200);
  } finally {
    s.server.close();
  }
});

test('Echtheitsprüfung: unbekannte oder unsinnige Prüfsummen ergeben „nicht bekannt“, nichts wird ungefiltert zurückgegeben', async () => {
  const { ctx } = makeCtx({ env: ENV });
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    for (const sha of ['0000', 'a'.repeat(64), '%3Cscript%3Ealert(1)%3C%2Fscript%3E']) {
      const r = await c.get(`/pruefen/${sha}`);
      assert.equal(r.status, 404, sha);
      assert.ok(!r.text.includes('<script>alert(1)'), 'keine ungefilterte Rückgabe');
    }
    assert.equal((await c.get('/pruefen')).status, 200);
  } finally {
    s.server.close();
  }
});
