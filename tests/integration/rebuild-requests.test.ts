import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword } from '../../packages/shared/src/crypto.ts';
import { assess, environments } from '../../services/ai-orchestrator/src/director.ts';
import { setStop } from '../../services/core-api/src/policy-store.ts';
import { createRebuildRequest, decideRebuildRequest, listRebuildRequests, rebuildByToken, RIGHTS_TEXT_VERSION, validateRebuild } from '../../services/core-api/src/rebuild-requests.ts';
import { count, makeCtx } from '../helpers.ts';
import { Client, csrfFrom, serve } from '../http.ts';

/**
 * Auftragsart „Programm nach Vorlage“ (mit REA): Annahme nur mit Rechte-Erklärung, jede Anfrage wartet auf den
 * Eigentümer, nichts wird automatisch zugesagt oder hergestellt, keine Programmdatei wird gespeichert.
 */
const PASSWORD = 'eigentuemer-test-passwort-2026';
const GOOD = {
  company: 'Muster Maschinenbau GmbH', email: 'einkauf@muster-maschinenbau.example', programName: 'Lagerliste 2009', programKind: 'dotnet',
  description: 'Unsere alte Lagerliste soll neu gebaut werden: Artikel, Bestände, Inventurliste als PDF.', rightsBasis: 'OWN_SOFTWARE',
  rightsDetail: '2009 von unserem damaligen Mitarbeiter für uns entwickelt.', rightsConfirmed: true, privacyAccepted: true,
};
const FORM = {
  company: GOOD.company, email: GOOD.email, program_name: GOOD.programName, program_kind: GOOD.programKind, description: GOOD.description,
  rights_basis: GOOD.rightsBasis, rights_detail: GOOD.rightsDetail, rights_confirmed: '1', privacy: '1',
};

test('Ohne Rechte-Erklärung, Beleg oder Berechtigungsgrund wird nichts gespeichert', () => {
  const { ctx } = makeCtx();
  for (const bad of [{ rightsConfirmed: false }, { rightsDetail: 'kurz' }, { rightsBasis: 'ANDERES_PROGRAMM' }, { privacyAccepted: false }, { description: 'zu kurz' }, { email: 'keine-adresse' }, { programKind: 'spiel' }]) {
    const r = createRebuildRequest(ctx, { ...GOOD, ...bad });
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM rebuild_requests'), 0);
  assert.match(validateRebuild({ ...GOOD, rightsConfirmed: false }).errors.join(' '), /Rechte-Erklärung/);
});

test('Gültige Anfrage: wartet auf den Eigentümer, Statuslink nur als Hash gespeichert, Erklärung mit Fassung protokolliert', () => {
  const { ctx } = makeCtx();
  const r = createRebuildRequest(ctx, GOOD);
  assert.ok(r.ok);
  if (!r.ok) return;
  const row = rebuildByToken(ctx, r.statusToken);
  assert.equal(row?.state, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(row?.rights_text_version, RIGHTS_TEXT_VERSION);
  assert.notEqual(row?.status_token_hash, r.statusToken);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM rebuild_requests WHERE status_token_hash = ?', r.statusToken), 0, 'Link steht nicht im Klartext in der Datenbank');
  assert.equal(rebuildByToken(ctx, 'falsch'), undefined);
  assert.equal(rebuildByToken(ctx, `${r.statusToken}x`), undefined);
  assert.equal(ctx.audit.byType('rebuild.requested').length, 1);
  // Es entsteht kein Auftrag, kein Job und keine Lieferung
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM orders'), 0);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM jobs WHERE kind NOT IN ('autopilot')`), 0);
});

test('Entscheidung: genau einmal; Ablehnung braucht einen Grund; Annahme startet keine Herstellung', () => {
  const { ctx } = makeCtx();
  const a = createRebuildRequest(ctx, GOOD);
  const b = createRebuildRequest(ctx, { ...GOOD, programName: 'Fremdprogramm', rightsBasis: 'LICENSE_PERMITS', rightsDetail: 'Lizenz Abschnitt 4 erlaubt die Analyse.' });
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.deepEqual(decideRebuildRequest(ctx, b.requestId, 'DECLINED', ''), { ok: false, reason: 'NOTE_REQUIRED' });
  assert.deepEqual(decideRebuildRequest(ctx, b.requestId, 'DECLINED', 'Berechtigung nicht belegt.'), { ok: true });
  assert.deepEqual(decideRebuildRequest(ctx, a.requestId, 'ACCEPTED', ''), { ok: true });
  assert.deepEqual(decideRebuildRequest(ctx, a.requestId, 'DECLINED', 'doch nicht mehr'), { ok: false, reason: 'ALREADY_DECIDED' });
  assert.deepEqual(decideRebuildRequest(ctx, 'rbr_gibt_es_nicht', 'ACCEPTED', ''), { ok: false, reason: 'NOT_FOUND' });
  assert.equal(rebuildByToken(ctx, a.statusToken)?.state, 'ACCEPTED');
  assert.equal(rebuildByToken(ctx, b.statusToken)?.owner_note, 'Berechtigung nicht belegt.');
  assert.equal(listRebuildRequests(ctx, true).length, 2);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM orders'), 0, 'Annahme erzeugt keinen Auftrag');
});

test('Produktionsrouter: nie automatisch machbar – immer Entscheidung des Eigentümers', () => {
  const { ctx } = makeCtx();
  const a = assess(ctx, 'programm-nach-vorlage');
  assert.equal(a.feasible, false);
  assert.equal(a.status, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(a.env, 'owner-pc');
  assert.equal(environments(ctx).find((x) => x.id === 'owner-pc')?.available, false);
});

test('HTTP: Formular, Fehler mit erhaltenen Eingaben, Statusseite, Entscheidung nur für den Eigentümer mit CSRF', async () => {
  const { ctx } = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } });
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    const page = await c.get('/programm-nach-vorlage');
    assert.equal(page.status, 200);
    assert.match(page.text, /Keine automatische Zusage/);
    assert.match(page.text, /Nicht rund um die Uhr/);
    assert.ok(!/type="file"/.test(page.text), 'kein Datei-Upload');

    const bad = await c.post('/programm-nach-vorlage', { ...FORM, rights_confirmed: '', company: 'Firma <b>' });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /Ohne die Rechte-Erklärung/);
    assert.match(bad.text, /value="Firma &lt;b&gt;"/);
    assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM rebuild_requests'), 0);

    const ok = await c.post('/programm-nach-vorlage', FORM);
    assert.equal(ok.status, 200);
    const link = /href="(\/programm-nach-vorlage\/stand\/[A-Za-z0-9_-]+)"/.exec(ok.text)?.[1] ?? '';
    assert.ok(link, 'Statuslink angezeigt');
    const st = await c.get(link);
    assert.match(st.text, /Wartet auf Prüfung durch den Inhaber/);
    assert.equal(st.headers.get('cache-control'), 'no-store');
    assert.equal((await c.get('/programm-nach-vorlage/stand/st_unbekannt0000000000')).status, 404);

    const id = listRebuildRequests(ctx, true)[0]?.request_id ?? '';
    // Fremder ohne Anmeldung darf nicht entscheiden
    const anon = await new Client(s.base).post(`/admin/programm-nach-vorlage/${id}/entscheiden`, { entscheidung: 'annehmen' });
    assert.equal(anon.location, '/login');
    // Eigentümer: ohne CSRF abgelehnt, mit CSRF angenommen
    const o = new Client(s.base);
    assert.equal((await o.post('/auth/login', { password: PASSWORD })).status, 303);
    const prod = await o.get('/dashboard/produkte?modus=test');
    assert.match(prod.text, /Programm nach Vorlage \(mit REA\)/);
    assert.match(prod.text, /Lagerliste 2009/);
    assert.equal((await o.post(`/admin/programm-nach-vorlage/${id}/entscheiden`, { entscheidung: 'annehmen' })).status, 403);
    assert.equal(listRebuildRequests(ctx, true)[0]?.state, 'OWNER_APPROVAL_REQUIRED');
    const done = await o.post(`/admin/programm-nach-vorlage/${id}/entscheiden`, { entscheidung: 'annehmen', _csrf: csrfFrom(prod.text), _back: '/dashboard/produkte' });
    assert.equal(done.status, 303);
    assert.equal(listRebuildRequests(ctx, true)[0]?.state, 'ACCEPTED');
    assert.match((await c.get(link)).text, /Angenommen – Angebot folgt/);
  } finally {
    s.server.close();
  }
});

test('Stopp-Schalter „Akquise pausieren“ nimmt keine neuen Anfragen an', async () => {
  const { ctx } = makeCtx();
  setStop(ctx, 'PAUSE_ACQUISITION', true, 'owner');
  const s = await serve(ctx);
  try {
    assert.equal((await new Client(s.base).post('/programm-nach-vorlage', FORM)).status, 503);
    assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM rebuild_requests'), 0);
  } finally {
    s.server.close();
  }
});
