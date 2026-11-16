import assert from 'node:assert/strict';
import { test } from 'node:test';
import { page, shareMeta } from '../../apps/shared/layout.ts';
import { makeCtx } from '../helpers.ts';
import { Client, serve } from '../http.ts';

/** Open Graph und JSON-LD: nur auf Seiten mit fester Adresse, nur belegte Angaben, sicher eingebettet. */
test('Ohne feste Adresse keine Angaben; mit Adresse Open Graph und gültiges JSON-LD', () => {
  assert.equal(shareMeta('Titel', {}), '');
  const html = shareMeta('Kalkulation für Handwerker', { canonical: 'https://example.test/loesungen/handwerk?lang=it', description: 'Angebot in Minuten', lang: 'it' });
  assert.match(html, /<meta property="og:title" content="Kalkulation für Handwerker">/);
  assert.match(html, /<meta property="og:locale" content="it_IT">/);
  assert.match(html, /<meta property="og:description" content="Angebot in Minuten">/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1] ?? '{}') as Record<string, unknown>;
  assert.equal(ld['@type'], 'WebPage');
  assert.equal(ld.url, 'https://example.test/loesungen/handwerk?lang=it');
  assert.deepEqual(ld.publisher, { '@type': 'Organization', name: 'INFINITY EARN', url: 'https://example.test/' });
  for (const forbidden of ['aggregateRating', 'review', 'offers', 'price', 'address', 'telephone']) assert.ok(!(forbidden in ld), `keine unbelegte Angabe: ${forbidden}`);
});

test('Gefährliche Zeichen in Titel und Beschreibung können den Datenblock nicht verlassen', () => {
  const html = shareMeta('</script><script>alert(1)</script>', { canonical: 'https://example.test/', description: '"><img src=x onerror=alert(1)> & mehr' });
  assert.equal((html.match(/<script/g) ?? []).length, 1, 'genau ein Datenblock');
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1);
  assert.ok(!html.includes('<img'));
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1] ?? '{}') as { name: string; description: string };
  assert.equal(ld.name, '</script><script>alert(1)</script>');
  assert.equal(ld.description, '"><img src=x onerror=alert(1)> & mehr');
});

test('Seitenrahmen: Angaben nur mit fester Adresse; Startseite liefert sie über HTTP aus', async () => {
  assert.ok(!page('Intern', '<p>x</p>', { testMode: true }).includes('og:title'));
  assert.ok(page('Öffentlich', '<p>x</p>', { testMode: true, canonical: 'https://example.test/x' }).includes('og:title'));
  const { ctx } = makeCtx({ env: { PUBLIC_ORIGIN: 'https://example.test' } });
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    const home = await c.get('/');
    const url = /<meta property="og:url" content="([^"]+)">/.exec(home.text)?.[1] ?? '';
    assert.ok(url.startsWith('http') && new URL(url).pathname === '/', `og:url der Startseite: ${url}`);
    assert.match(home.text, /application\/ld\+json/);
    for (const p of ['/anfrage', '/portal', '/login']) assert.ok(!(await c.get(p)).text.includes('application/ld+json'), `${p} ohne Suchmaschinen-Angaben`);
  } finally {
    s.server.close();
  }
});
