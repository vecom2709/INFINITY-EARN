import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HSTS, httpsRedirect } from '../../apps/worker/src/index.ts';

/** LA-11 Sicherheitsprüfung: Staging nur über HTTPS – http wird dauerhaft umgeleitet, Browser merken sich HTTPS (HSTS). */
test('HTTP wird dauerhaft auf HTTPS umgeleitet, inklusive Pfad und Query; HTTPS bleibt unverändert', () => {
  const r = httpsRedirect(new Request('http://infinity-earn-staging.bikerman01.workers.dev/portal?x=1'));
  assert.equal(r?.status, 301);
  assert.equal(r?.headers.get('location'), 'https://infinity-earn-staging.bikerman01.workers.dev/portal?x=1');
  assert.equal(r?.headers.get('strict-transport-security'), HSTS);
  assert.equal(httpsRedirect(new Request('https://infinity-earn-staging.bikerman01.workers.dev/')), null);
  assert.match(HSTS, /max-age=31536000/);
});
