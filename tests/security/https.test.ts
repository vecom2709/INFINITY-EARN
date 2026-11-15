import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HSTS, httpsRedirect } from '../../apps/worker/src/index.ts';
import { Client, serve } from '../http.ts';
import { makeCtx } from '../helpers.ts';

/** LA-11 Sicherheitsprüfung: Staging nur über HTTPS – http wird dauerhaft umgeleitet, Browser merken sich HTTPS (HSTS). */
test('HTTP wird dauerhaft auf HTTPS umgeleitet, inklusive Pfad und Query; HTTPS bleibt unverändert', () => {
  const r = httpsRedirect(new Request('http://infinity-earn-staging.bikerman01.workers.dev/portal?x=1'));
  assert.equal(r?.status, 301);
  assert.equal(r?.headers.get('location'), 'https://infinity-earn-staging.bikerman01.workers.dev/portal?x=1');
  assert.equal(r?.headers.get('strict-transport-security'), HSTS);
  assert.equal(httpsRedirect(new Request('https://infinity-earn-staging.bikerman01.workers.dev/')), null);
  assert.match(HSTS, /max-age=31536000/);
});

test('Testbetrieb: jede Antwort trägt noindex – die Testseite gelangt nicht in Suchmaschinen', async () => {
  const s = await serve(makeCtx().ctx);
  try {
    for (const path of ['/', '/anfrage', '/sitemap.xml', '/gibt-es-nicht']) assert.equal((await new Client(s.base).get(path)).headers.get('x-robots-tag'), 'noindex, nofollow', path);
  } finally {
    s.server.close();
  }
});
