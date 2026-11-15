import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_POST_WINDOW_MS, publicPostLimited } from '../../services/core-api/src/http-core.ts';
import { Client, serve } from '../http.ts';
import { count, makeCtx } from '../helpers.ts';

/** 17.0 Flutschutz: öffentliche Formulare nehmen je IP nur begrenzt viele Einsendungen an – nichts wird darüber hinaus gespeichert. */
test('Zähler je IP und Bereich, Fenster läuft ab, andere IP und andere Wege unberührt', () => {
  const owner = {};
  const t0 = 1_000_000;
  for (let i = 0; i < 12; i++) assert.equal(publicPostLimited(owner, '/anfrage', '1.2.3.4', t0), false, `Einsendung ${i + 1}`);
  assert.equal(publicPostLimited(owner, '/api/leads', '1.2.3.4', t0), true, '13. Einsendung derselben IP (gleicher Bereich)');
  assert.equal(publicPostLimited(owner, '/anfrage', '5.6.7.8', t0), false, 'andere IP');
  assert.equal(publicPostLimited(owner, '/portal/support', '1.2.3.4', t0), false, 'Kundenwege haben einen eigenen Zähler');
  assert.equal(publicPostLimited(owner, '/webhooks/payments', '1.2.3.4', t0), false, 'Webhooks sind signiert, nicht gezählt');
  assert.equal(publicPostLimited(owner, '/admin/stops', '1.2.3.4', t0), false, 'Verwaltung ist per Anmeldung geschützt');
  assert.equal(publicPostLimited(owner, '/anfrage', '1.2.3.4', t0 + PUBLIC_POST_WINDOW_MS + 1), false, 'nach dem Fenster wieder frei');
});

test('HTTP: nach 12 Anfragen antwortet der Server mit 429 und speichert keine weiteren Leads', async () => {
  const { ctx } = makeCtx();
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    const lead = (i: number): string => JSON.stringify({ name: `Flut ${i}`, email: `flut${i}@example.invalid`, country: 'DE', message: 'Bitte Angebot', privacyAccepted: true, marketingConsent: false });
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) statuses.push((await c.req('POST', '/api/leads', lead(i), { 'content-type': 'application/json' })).status);
    assert.ok(statuses.slice(0, 12).every((x) => x !== 429), `erste 12 angenommen oder fachlich geprüft: ${statuses.join(',')}`);
    assert.deepEqual(statuses.slice(12), [429, 429, 429]);
    assert.ok(count(ctx, 'SELECT COUNT(*) AS n FROM leads') <= 12, 'höchstens 12 Leads gespeichert');
    assert.ok(ctx.audit.byType('security.public_post_rate_limited').length >= 3, 'Abweisungen protokolliert');
  } finally {
    s.server.close();
  }
});
