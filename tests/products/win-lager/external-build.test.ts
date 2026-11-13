import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { hashPassword, randomToken } from '../../../packages/shared/src/crypto.ts';
import { createZip, readZip } from '../../../packages/shared/src/zip.ts';
import { buildWinManual } from '../../../products/win-lager/manual.ts';
import { utf16le, winPackageNames, winReadme, type WinSpec } from '../../../products/win-lager/package.ts';
import { runAgent } from '../../../scripts/win-build-agent.ts';
import type { AppContext } from '../../../services/core-api/src/context.ts';
import { isUploadRequest } from '../../../services/core-api/src/http-core.ts';
import { isSellable, RELEASE_REQUIRED } from '../../../services/core-api/src/releases.ts';
import { BUILD_LEASE_MS, buildByOrder, getBuild, latestProbe, MAX_BUILD_ATTEMPTS } from '../../../services/product-factory/src/external-build.ts';
import { runProductionOnce } from '../../../services/product-factory/src/production.ts';
import { getCapability, routeCapability } from '../../../services/product-factory/src/registry.ts';
import { Client, serve } from '../../http.ts';
import { FakeClock, makeCtx, toPaid } from '../../helpers.ts';

/** Funktion 157/158: Bau je Auftrag über den Windows-Bau-Agenten – Abholen, Prüfen, Liefern, Fehlerwege, Datenschutz. */
const TOKEN = `agent_${randomToken(24)}`.replace(/[^A-Za-z0-9_-]/g, 'x');
const PASSWORD = `pw-${randomToken(12)}`;
const SPEC: WinSpec = { company: 'Ferramenta Rossi Srl', color: '#0F766E', lang: 'it', country: 'IT' };
const CULTURE = { de: 'de-DE', it: 'it-IT', en: 'en-GB' } as const;
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** Paket wie vom Agenten – mit nachgebildetem Installer (echter Bau nur auf Windows, siehe letzter Test). */
function fakePackage(spec: WinSpec, change: { exeCompany?: string; unitTests?: { passed: number; failed: number } } = {}): Uint8Array {
  const exe = new Uint8Array(64 * 1024);
  exe.set([0x4d, 0x5a]);
  exe[0x3c] = 0x80;
  exe.set([0x50, 0x45, 0, 0], 0x80);
  let off = 0x200;
  for (const s of [change.exeCompany ?? spec.company, spec.color, CULTURE[spec.lang]]) {
    const u = utf16le(s);
    exe.set(u, off);
    off += u.length + 16;
  }
  const pdf = buildWinManual({ company: spec.company, color: spec.color, lang: spec.lang, country: spec.country, productId: 'win-lager', version: '1.0.0', created: new Date('2026-11-13T00:00:00Z') }).bytes;
  const n = winPackageNames(spec.lang);
  const manifest = {
    product: 'win-lager', productName: 'x', version: '1.0.0', company: spec.company, language: spec.lang, builtAt: '2026-11-13T00:00:00Z', toolchain: 'test',
    signed: false, signature: 'NotSigned', files: [{ name: n.setup, bytes: exe.length, sha256: sha(exe) }, { name: n.manual, bytes: pdf.length, sha256: sha(pdf) }],
    unitTests: change.unitTests ?? { passed: 24, failed: 0 }, source: { commit: 'abc1234', run: 'test' },
  };
  return createZip([
    { name: n.setup, bytes: exe },
    { name: n.manual, bytes: pdf },
    { name: n.manifest, bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
    { name: n.readme, bytes: new TextEncoder().encode(winReadme(spec.lang, spec.company, sha(exe), sha(pdf))) },
  ]);
}

let ctx: AppContext;
let clock: FakeClock;
let base: string;
let close: () => void;
before(async () => {
  ({ ctx, clock } = makeCtx({ env: { BUILD_AGENT_TOKEN: TOKEN, OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } }));
  const s = await serve(ctx);
  base = s.base;
  close = () => s.server.close();
});
after(() => close());

const agent = async (method: string, path: string, opts: { token?: string; body?: Uint8Array | string; type?: string } = {}): Promise<{ status: number; json: Record<string, unknown> }> => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(opts.token !== '' ? { authorization: `Bearer ${opts.token ?? TOKEN}` } : {}), 'x-runner-ref': 'test:1', ...(opts.type ? { 'content-type': opts.type } : {}) },
    ...(opts.body !== undefined ? { body: opts.body } : {}),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
};

function winOrder(spec: WinSpec = SPEC): string {
  const p = toPaid(ctx);
  ctx.db.run(`UPDATE opportunities SET capability_id = 'win-lager', scope_json = ? WHERE opportunity_id = ?`, JSON.stringify(spec), p.opportunityId);
  return p.orderId;
}

test('Produktart win-lager: Standard-Akte vollständig, Bau nur extern, ohne Freigabe nicht bestellbar', () => {
  const r = routeCapability('win-lager');
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(getCapability('win-lager')?.externalBuild?.platform, 'windows');
  assert.throws(() => getCapability('win-lager')?.generate(SPEC), /EXTERNAL_BUILD_REQUIRED/);
  assert.ok(RELEASE_REQUIRED.has('win-lager'));
  assert.equal(isSellable(ctx, 'win-lager'), false);
  assert.throws(() => getCapability('win-lager')?.externalBuild?.spec({ ...SPEC, company: 'A\r\nB' }), /INVALID_INPUT/);
  assert.ok(isUploadRequest('POST', '/agent/win-builds/bld_0123456789abcdef0123456789abcdef/ergebnis', 'application/zip'));
  assert.ok(!isUploadRequest('POST', '/agent/win-builds/bld_0123456789abcdef0123456789abcdef/ergebnis', 'multipart/form-data'));
});

test('Auftrag wartet auf den Windows-Bau; Schnittstelle nur mit Schlüssel und gibt nur die vier Bauangaben heraus', async () => {
  const orderId = winOrder();
  const run = runProductionOnce(ctx);
  assert.equal(run.results[0]?.outcome, 'WAITING');
  const b = buildByOrder(ctx, orderId);
  assert.equal(b?.state, 'PENDING');
  assert.equal(ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM artifacts WHERE order_id = ?', orderId)?.n, 0, 'noch nichts geliefert');
  assert.equal(runProductionOnce(ctx).processed, 0, 'kein Leerlauf: nächster Blick erst nach der Wartezeit');
  assert.ok(!JSON.stringify(ctx.audit.byType('build.requested')).includes('Ferramenta'), 'Kundendaten nicht im Protokoll');

  assert.equal((await agent('GET', '/agent/win-builds/offen', { token: '' })).status, 401);
  assert.equal((await agent('GET', '/agent/win-builds/offen', { token: `${TOKEN.slice(0, -1)}x` })).status, 401);
  assert.deepEqual((await agent('GET', '/agent/win-builds/offen')).json, { pending: 1 });
  const c = await agent('POST', '/agent/win-builds/abholen');
  assert.equal(c.status, 200);
  assert.deepEqual(Object.keys(c.json).sort(), ['attempt', 'build_id', 'kind', 'spec']);
  assert.deepEqual(c.json.spec, SPEC);
  assert.equal((await agent('POST', '/agent/win-builds/abholen')).status, 204, 'vergeben (Lease)');

  // Falsches Paket: anderer Firmenname im Programm → Abnahme scheitert, nichts geliefert, neuer Versuch möglich
  const bad = await agent('POST', `/agent/win-builds/${b?.build_id}/ergebnis`, { body: fakePackage(SPEC, { exeCompany: 'Andere Firma' }), type: 'application/zip' });
  assert.equal(bad.json.passed, false);
  assert.ok((bad.json.failed as string[]).includes('branding'));
  assert.equal(getBuild(ctx, b?.build_id ?? '')?.state, 'PENDING');
  assert.equal(ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', orderId)?.n, 0);

  const c2 = await agent('POST', '/agent/win-builds/abholen');
  assert.equal(c2.json.attempt, 2);
  const ok = await agent('POST', `/agent/win-builds/${b?.build_id}/ergebnis`, { body: fakePackage(SPEC), type: 'application/zip' });
  assert.equal(ok.json.outcome, 'DELIVERED', JSON.stringify(ok.json));
  assert.equal(getBuild(ctx, b?.build_id ?? '')?.state, 'DONE');
  assert.equal(ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', orderId)?.n, 1, 'Lieferung freigegeben');
  const art = ctx.db.get<{ capability_id: string; path: string }>('SELECT capability_id, path FROM artifacts WHERE order_id = ? ORDER BY version DESC', orderId);
  assert.equal(art?.capability_id, 'win-lager');
  assert.deepEqual(readZip(ctx.blobs.get(art?.path ?? '') as Uint8Array).map((e) => e.name).sort(), Object.values(winPackageNames('it')).sort());
  assert.equal((await agent('POST', `/agent/win-builds/${b?.build_id}/ergebnis`, { body: fakePackage(SPEC), type: 'application/zip' })).status, 409, 'kein zweites Hochladen');
});

test('Fehlversuche und abgelaufene Leases: höchstens drei Versuche, dann „nicht lieferfähig“ mit Erstattungsvorschlag', async () => {
  const orderId = winOrder({ ...SPEC, company: 'Bauservice Beispiel', lang: 'de', country: 'DE' });
  runProductionOnce(ctx);
  const b = buildByOrder(ctx, orderId);
  // Versuch 1: Agent meldet sich nicht → Lease läuft ab
  assert.equal((await agent('POST', '/agent/win-builds/abholen')).json.attempt, 1);
  clock.advance(BUILD_LEASE_MS + 1000);
  assert.deepEqual((await agent('GET', '/agent/win-builds/offen')).json, { pending: 1 });
  // Versuch 2 und 3: Fehler gemeldet (Zeilenumbrüche werden entfernt)
  for (let i = 2; i <= MAX_BUILD_ATTEMPTS; i++) {
    const c = await agent('POST', '/agent/win-builds/abholen');
    assert.equal(c.json.attempt, i);
    const f = await agent('POST', `/agent/win-builds/${b?.build_id}/fehler`, { body: JSON.stringify({ reason: 'UNIT_TESTS_FAILED:\nFAIL x' }), type: 'application/json' });
    assert.equal(f.json.state, i < MAX_BUILD_ATTEMPTS ? 'PENDING' : 'FAILED');
  }
  const done = getBuild(ctx, b?.build_id ?? '');
  assert.equal(done?.state, 'FAILED');
  assert.ok(!/\n/.test(done?.last_error ?? ''));
  assert.ok(ctx.audit.byType('order.not_deliverable').some((a) => a.subject_id === orderId), 'nicht lieferfähig gemeldet');
  assert.ok((ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM refund_requests WHERE order_id = ?', orderId)?.n ?? 0) >= 1, 'Erstattung nur vorgeschlagen');
  assert.equal(ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', orderId)?.n, 0);
  assert.equal((await agent('POST', '/agent/win-builds/abholen')).status, 204);
});

test('Probebau mit Musterfirma: über den Agenten oder den Admin anstoßbar, Ergebnis nur für den Eigentümer', async () => {
  const c = await agent('POST', '/agent/win-builds/abholen?probe=1');
  assert.equal(c.json.kind, 'PROBE');
  assert.deepEqual(c.json.spec, { company: 'Musterfirma', color: '#1F5FA8', lang: 'de', country: 'DE' });
  const r = await agent('POST', `/agent/win-builds/${c.json.build_id}/ergebnis`, { body: fakePackage(c.json.spec as WinSpec), type: 'application/zip' });
  assert.equal(r.json.passed, true, JSON.stringify(r.json));
  assert.equal(latestProbe(ctx)?.qa_passed, 1);
  const anon = new Client(base);
  assert.equal((await anon.get('/admin/muster/win-lager/probebau.zip')).status, 303);
  const owner = new Client(base);
  await owner.post('/auth/login', { password: PASSWORD });
  const z = await owner.get('/admin/muster/win-lager/probebau.zip');
  assert.equal(z.status, 200);
  assert.equal(z.headers.get('content-type'), 'application/zip');
});

test('Ohne eingerichteten Schlüssel ist die Bau-Schnittstelle abgeschaltet', async () => {
  const other = makeCtx().ctx;
  const s = await serve(other);
  try {
    const res = await fetch(`${s.base}/agent/win-builds/offen`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(res.status, 503);
  } finally {
    s.server.close();
  }
});

test('Datenschutz im öffentlichen GitHub-Workflow: keine Kundendaten in Eingaben, Geheimnisse nur über Umgebungsvariablen', () => {
  const wf = readFileSync('.github/workflows/win-build.yml', 'utf8').replace(/\r\n/g, '\n'); // Windows-Checkout liefert CRLF
  const runs = [...wf.matchAll(/run: \|?\n?([\s\S]*?)(?=\n {6}- |\n {2}\w|$)/g)].map((m) => m[1] ?? '').join('\n');
  assert.doesNotMatch(runs, /\$\{\{/, 'keine Ausdrücke direkt in Skripten (Einschleusung)');
  assert.doesNotMatch(wf, /upload-artifact|company|spec/i, 'keine Bauergebnisse oder Kundenangaben bei GitHub');
  assert.match(wf, /permissions:\n {2}contents: read/);
  const agentSrc = readFileSync('scripts/win-build-agent.ts', 'utf8');
  assert.match(agentSrc, /::add-mask::/);
  assert.doesNotMatch(agentSrc, /log\([^)]*spec\.company|console\.log\([^)]*company\)/, 'Firmenname wird nie ausgegeben');
});

test('Echter Bau auf Windows: Agent baut, Worker prüft und liefert', { skip: process.platform !== 'win32' && 'Windows-Programme werden auf Windows gebaut', timeout: 600_000 }, async () => {
  const orderId = winOrder({ company: 'Ferramenta Bianchi', color: '#8A2BE2', lang: 'it', country: 'IT' });
  runProductionOnce(ctx);
  const lines: string[] = [];
  const r = await runAgent({ url: base, token: TOKEN, runner: 'test:echt', maxBuilds: 1, commit: 'test', log: (l) => lines.push(l) });
  assert.equal(r.length, 1);
  assert.equal(r[0]?.outcome, 'DELIVERED', JSON.stringify(r));
  assert.ok(!lines.join('\n').includes('Bianchi'), 'Protokoll ohne Firmenname');
  const art = ctx.db.get<{ path: string }>('SELECT path FROM artifacts WHERE order_id = ? ORDER BY version DESC', orderId);
  const files = readZip(ctx.blobs.get(art?.path ?? '') as Uint8Array);
  const manifest = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json')?.bytes)) as { unitTests: { passed: number; failed: number }; company: string };
  assert.equal(manifest.unitTests.failed, 0);
  assert.ok(manifest.unitTests.passed >= 24);
  assert.equal(manifest.company, 'Ferramenta Bianchi');
});
