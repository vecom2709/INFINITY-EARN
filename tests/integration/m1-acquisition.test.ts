import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { acquireFromTed, buildTedQuery, parseTedResponse, TED_SOURCE_ID, type FetchFn } from '../../services/acquisition/src/connectors/ted.ts';
import { rankOpportunities } from '../../services/acquisition/src/ranking.ts';
import { scoreItem } from '../../services/acquisition/src/scoring.ts';
import { approveSource, getSource } from '../../services/acquisition/src/sources.ts';
import { contactDecision } from '../../services/acquisition/src/consent.ts';
import { renderDashboard } from '../../apps/dashboard/src/render.ts';
import { generateOfferDraft, getOfferDraft, reviewOfferDraft } from '../../services/core-api/src/offers.ts';
import { setStop } from '../../services/core-api/src/policy-store.ts';
import { qualify } from '../../services/core-api/src/workflow.ts';
import { count, FakeClock, makeCtx, oppState, toQuote } from '../helpers.ts';

const FIXTURE = JSON.parse(readFileSync('tests/fixtures/ted-search.json', 'utf8')) as unknown;
const noSleep = async (): Promise<void> => {};

function fakeFetch(body: unknown = FIXTURE, status = 200): { fn: FetchFn; calls: { url: string; body: string; headers: Record<string, string> }[] } {
  const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
  const fn: FetchFn = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, calls };
}

const approvedCtx = () => {
  const m = makeCtx({ clock: new FakeClock('2026-11-12T10:00:00.000Z') });
  approveSource(m.ctx, TED_SOURCE_ID, 'TED legal notice geprüft 2026-11-12', 'owner');
  return m;
};

test('TED-Abfrage: gültige Expertensuche, nur CPV-Codes, keine personenbezogenen Daten', () => {
  assert.equal(buildTedQuery(['48440000', 'x; DROP', '72212000'], new Date('2026-11-01T00:00:00Z')), 'classification-cpv IN (48440000 72212000) AND publication-date>=20261101');
  assert.throws(() => buildTedQuery(['abc'], new Date()), /NO_VALID_CPV/);
});

test('TED-Antwort: mehrsprachige Felder, fehlerhafte Einträge übersprungen statt geraten', () => {
  const p = parseTedResponse(FIXTURE);
  assert.equal(p.notices.length, 4);
  assert.equal(p.skipped, 1);
  assert.equal(p.notices[0]?.title.startsWith('Deutschland – Software für Kostenkalkulation'), true, 'Deutsch bevorzugt');
  assert.deepEqual(p.notices[0]?.cpv, ['48440000'], 'CPV dedupliziert');
  assert.equal(p.notices[0]?.url, 'https://ted.europa.eu/de/notice/-/detail/900001-2026');
  assert.throws(() => parseTedResponse({ foo: 1 }), /TED_RESPONSE_SHAPE/);
});

test('IE-012 TED ohne Eigentümerfreigabe: kein Netzwerkzugriff, Lauf BLOCKED', async () => {
  const { ctx } = makeCtx();
  assert.equal(getSource(ctx, TED_SOURCE_ID).status, 'PENDING_REVIEW');
  const f = fakeFetch();
  const r = await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: f.fn, sleep: noSleep });
  assert.deepEqual([r.status, r.reason], ['BLOCKED', 'SOURCE_PENDING_REVIEW']);
  assert.equal(f.calls.length, 0);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM source_fetch_runs WHERE status = 'BLOCKED'`), 1);
  assert.throws(() => approveSource(ctx, TED_SOURCE_ID, 'TED geprüft', 'ai'), /OWNER_REQUIRED/);
  assert.throws(() => approveSource(ctx, TED_SOURCE_ID, '', 'owner'), /TERMS_LABEL_REQUIRED/);
});

test('IE-011 IE-020 freigegebene Quelle: Nachweise gespeichert, nur strukturiert belegte offene Ausschreibung wird Lead', async () => {
  const { ctx } = approvedCtx();
  const f = fakeFetch();
  const r = await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: f.fn, sleep: noSleep, maxPages: 1 });
  assert.equal(r.status, 'OK');
  assert.deepEqual([r.seen, r.newItems, r.relevant, r.leadsCreated], [4, 4, 1, 1]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]?.headers['user-agent'], 'infinity-earn-connector/0.2 (read-only)');
  assert.doesNotMatch(f.calls[0]?.body ?? '', /@|biker|example/i, 'keine personenbezogenen Daten in der Anfrage');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM source_items'), 4, 'alle Bekanntmachungen als Nachweis gespeichert');
  const lead = ctx.db.get<{ lead_id: string; source_url: string; contact_legal_basis: string; purchase_intent_evidence: string; intent_verified: number }>(
    `SELECT lead_id, source_url, contact_legal_basis, purchase_intent_evidence, intent_verified FROM leads WHERE source_id = ?`, TED_SOURCE_ID,
  );
  assert.equal(lead?.source_url, 'https://ted.europa.eu/de/notice/-/detail/900001-2026');
  assert.equal(lead?.purchase_intent_evidence, 'public_tender:900001-2026');
  assert.equal(lead?.contact_legal_basis, 'none');
  assert.equal(contactDecision(ctx, lead?.lead_id ?? '', 'transactional', false).allowed, false, 'keine Direktansprache aus Ausschreibung');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM source_items WHERE external_id = '900003-2026' AND lead_id IS NULL`), 1, 'abgelaufene Frist -> kein Lead');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM source_items WHERE external_id = '900002-2026' AND relevant = 0`), 1, 'Vergabebekanntmachung ist kein Bedarf');
});

test('Wiederholter Abruf: keine Duplikate, keine zweiten Leads (idempotent)', async () => {
  const { ctx } = approvedCtx();
  await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: fakeFetch().fn, sleep: noSleep, maxPages: 1 });
  const r2 = await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: fakeFetch().fn, sleep: noSleep, maxPages: 1 });
  assert.deepEqual([r2.newItems, r2.leadsCreated], [0, 0]);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM source_items'), 4);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM leads WHERE source_id = ?`, TED_SOURCE_ID), 1);
});

test('Vorschau: nur Eigentümer, speichert keine Leads oder Nachweise', async () => {
  const { ctx } = makeCtx();
  const r = await acquireFromTed(ctx, { mode: 'PREVIEW', actor: 'owner', fetchFn: fakeFetch().fn, sleep: noSleep, maxPages: 1 });
  assert.deepEqual([r.status, r.seen, r.relevant], ['OK', 4, 1]);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM source_items'), 0);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM leads'), 0);
  const sys = await acquireFromTed(ctx, { mode: 'PREVIEW', actor: 'system', fetchFn: fakeFetch().fn, sleep: noSleep });
  assert.deepEqual([sys.status, sys.reason], ['BLOCKED', 'PREVIEW_REQUIRES_OWNER']);
});

test('IE-005 Notstopp PAUSE_ACQUISITION: kein Abruf', async () => {
  const { ctx } = approvedCtx();
  setStop(ctx, 'PAUSE_ACQUISITION', true, 'owner');
  const f = fakeFetch();
  const r = await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: f.fn, sleep: noSleep });
  assert.deepEqual([r.status, r.reason, f.calls.length], ['BLOCKED', 'ACQUISITION_PAUSED', 0]);
});

test('IE-019 ToS-Prüfung älter als 90 Tage: Quelle blockiert bis zur erneuten Prüfung', async () => {
  const { ctx, clock } = approvedCtx();
  clock.advance(91 * 86_400_000);
  const r = await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: fakeFetch().fn, sleep: noSleep });
  assert.deepEqual([r.status, r.reason], ['BLOCKED', 'TERMS_RECHECK_REQUIRED']);
});

test('HTTP-Fehler/Drosselung der Quelle: Lauf ERROR, nichts gespeichert', async () => {
  const { ctx } = approvedCtx();
  const r = await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: fakeFetch({}, 429).fn, sleep: noSleep });
  assert.deepEqual([r.status, r.reason], ['ERROR', 'TED_HTTP_429']);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM source_items'), 0);
  assert.equal(ctx.audit.byType('source.fetch_failed').length, 1);
});

test('Paginierung begrenzt und mit Pause zwischen Seiten', async () => {
  const { ctx } = approvedCtx();
  const many = { notices: Array.from({ length: 2 }, (_, i) => ({ 'publication-number': `91000${i}-2026`, 'notice-type': 'cn-standard', 'notice-title': { eng: 'Spreadsheet calculation tool' }, 'classification-cpv': ['48440000'], 'deadline-receipt-tender-date-lot': ['2026-12-30+01:00'] })), totalNoticeCount: 100 };
  const sleeps: number[] = [];
  const f = fakeFetch(many);
  await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: f.fn, sleep: async (ms) => { sleeps.push(ms); }, limit: 2, maxPages: 3 });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(sleeps, [1100, 1100]);
});

test('Scoring: erklärbar, keine Phantasie-Erträge', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const s = scoreItem({ title: 'Kalkulationstool', cpv: ['48440000'], noticeType: 'cn-standard', deadline: '2026-12-09+01:00', now });
  assert.deepEqual([s.fit, s.evidence, s.relevant], [100, 100, true]);
  assert.ok(s.reasons.some((r) => r.includes('manuelle Einreichung')));
  const short = scoreItem({ title: 'Kalkulationstool', cpv: ['48440000'], noticeType: 'cn-standard', deadline: '2026-11-15+01:00', now });
  assert.ok(short.risk > s.risk);
  assert.equal(scoreItem({ title: 'Server', cpv: ['48820000'], noticeType: 'can-standard', deadline: null, now }).relevant, false);
  const cpvOnly = scoreItem({ title: 'Modernisierung ÖPNV – Elektrobusse und Leitsystem', cpv: ['48440000'], noticeType: 'cn-standard', deadline: '2026-12-09+01:00', now });
  assert.equal(cpvOnly.relevant, false, 'CPV-Treffer ohne Produktbegriff ist nicht relevant (Live-Befund)');
  assert.equal(scoreItem({ title: 'Kalkulationstool', cpv: ['48440000'], noticeType: 'pin-only', deadline: null, now }).evidence, 30);
});

test('IE-018 IE-022 Ranking + Angebotsentwurf: Nachweise sichtbar, ohne Umfang kein Preis, nie automatisch versendet', async () => {
  const { ctx } = approvedCtx();
  await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: fakeFetch().fn, sleep: noSleep, maxPages: 1 });
  const inbound = toQuote(ctx);
  const ranking = rankOpportunities(ctx);
  assert.equal(ranking[0]?.relevant, true);
  assert.ok(ranking.some((r) => r.kind === 'tender' && r.title.includes('Kostenkalkulation')));
  assert.ok(ranking.findIndex((r) => r.title.includes('Server')) > ranking.findIndex((r) => r.title.includes('Kostenkalkulation')));
  assert.ok(ranking.some((r) => r.kind === 'inbound' && r.opportunityId === inbound.opportunityId));

  const tender = ranking.find((r) => r.kind === 'tender' && r.opportunityId);
  qualify(ctx, tender?.opportunityId ?? '');
  const draft = generateOfferDraft(ctx, tender?.opportunityId ?? '');
  assert.equal(draft.status, 'DRAFT_FOR_REVIEW');
  assert.equal(draft.price_minor, null);
  assert.match(draft.content_md, /public_tender:900001-2026/);
  assert.match(draft.content_md, /Rohdaten-SHA-256 [a-f0-9]{64}/);
  assert.match(draft.content_md, /nur manuell durch den Eigentümer/);
  assert.match(draft.content_md, /keine Direktansprache/);
  assert.throws(() => reviewOfferDraft(ctx, draft.draft_id, 'APPROVED_FOR_MANUAL_SUBMISSION', 'ai'), /OWNER_REQUIRED/);
  reviewOfferDraft(ctx, draft.draft_id, 'APPROVED_FOR_MANUAL_SUBMISSION', 'owner');
  assert.equal(getOfferDraft(ctx, draft.draft_id).status, 'APPROVED_FOR_MANUAL_SUBMISSION');
  assert.throws(() => ctx.db.run(`UPDATE offer_drafts SET content_md = 'x'`), /DRAFT_CONTENT_IMMUTABLE/);
  assert.equal(oppState(ctx, tender?.opportunityId ?? ''), 'QUALIFIED', 'Entwurf verändert keinen Pipeline-Zustand');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM quotes'), 1, 'nur das Inbound-Angebot existiert');
});

test('IE-049 IE-088 Prompt-Injection/HTML in Bekanntmachungstitel bleibt Daten und wird escaped', async () => {
  const { ctx } = approvedCtx();
  await acquireFromTed(ctx, { mode: 'PERSIST', actor: 'system', fetchFn: fakeFetch().fn, sleep: noSleep, maxPages: 1 });
  const html = renderDashboard(ctx, 'csrf');
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM ledger_entries'), 0);
  assert.match(html, /Echte Leads aus externen Quellen: 1/);
});
