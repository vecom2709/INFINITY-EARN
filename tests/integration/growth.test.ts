import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submitInboundLead } from '../../services/acquisition/src/leads.ts';
import { createHandler } from '../../services/core-api/src/http-core.ts';
import { autoProcessOpportunity } from '../../services/core-api/src/workflow.ts';
import { releaseProduct } from '../../services/core-api/src/releases.ts';
import { accrueCommissions, addPartner, attachReferral, decideCommission, evaluateExperiments, funnel, proposeExperiment, recordAcquisition, responseQueue, timingSignals } from '../../services/growth/src/sales-growth.ts';
import { buildArticle, campaignLink, classifyIntent, ingestIntents, intentClusters, landingQa, LANDING_DEFS, markPublished, planDistribution, publishedLanding, reviewArticle, syncContent } from '../../services/growth/src/visibility.ts';
import { inbound, makeCtx, toDelivered, toPaid, toQuote } from '../helpers.ts';

/** Wachstumsfunktionen 132, 135, 138, 139, 140, 147, 148, 149, 151, 155 – Pflichtfälle aus Anlage F/H. */
const get = (h: ReturnType<typeof createHandler>, url: string) => h({ method: 'GET', url, headers: {}, body: '', ip: '127.0.0.1' });

function tedLead(ctx: ReturnType<typeof makeCtx>['ctx'], id: string, deadline: string | null, evidence: number): void {
  const now = ctx.clock().toISOString();
  ctx.db.run(
    `INSERT INTO leads (lead_id, source_id, source_url, source_terms_checked, contact_legal_basis, buyer_signal, purchase_intent_evidence, company, message, status, expires_at, test_mode, created_at)
     VALUES (?, 'src_ted_eu', ?, 1, 'none', ?, ?, 'Comune Esempio', 'Software gestionale magazzino', 'SOURCE_COMPLIANT', ?, 1, ?)`,
    id, `https://ted.europa.eu/notice/${id}`, evidence >= 2 ? 'CPV 48000000' : null, evidence >= 3 ? 'Ausschreibung veröffentlicht' : null, deadline, now,
  );
  ctx.db.run(`INSERT INTO opportunities (opportunity_id, lead_id, capability_id, pipeline_state, test_mode, created_at, updated_at) VALUES (?, ?, NULL, 'SOURCE_COMPLIANT', 1, ?, ?)`, `opp_${id}`, id, now, now);
}

test('132 Zeitpunkt: Gründe statt Prozentwerte, abgelaufen/unsicher ehrlich, knappe Frist ohne Zeitfenster', () => {
  const { ctx } = makeCtx();
  tedLead(ctx, 'l1', '2026-11-30T00:00:00.000Z', 3);
  tedLead(ctx, 'l2', null, 1);
  tedLead(ctx, 'l3', '2026-11-01T00:00:00.000Z', 3);
  tedLead(ctx, 'l4', '2026-11-13T12:00:00.000Z', 2);
  const s = Object.fromEntries(timingSignals(ctx, true).map((x) => [x.opportunityId, x]));
  assert.equal(s.opp_l1?.confidenceBand, 'HIGH');
  assert.deepEqual(s.opp_l1?.bestContactWindow, { from: '2026-11-12', to: '2026-11-28' });
  assert.ok(s.opp_l1?.reasonCodes.includes('FRIST_IN_17_TAGEN'));
  assert.equal(s.opp_l2?.confidenceBand, 'TIMING_UNCERTAIN');
  assert.ok(s.opp_l2?.reasonCodes.includes('KEINE_BELEGTE_FRIST'));
  assert.ok(s.opp_l3?.reasonCodes.includes('FRIST_ABGELAUFEN'));
  assert.equal(s.opp_l4?.bestContactWindow, null);
  assert.ok(s.opp_l4?.reasonCodes.includes('ZU_KNAPP_FUER_SORGFAELTIGES_ANGEBOT'));
  assert.ok(Object.values(s).every((x) => !JSON.stringify(x).includes('%')), 'kein Prozentwert');
});

test('138 Antwort-Warteschlange: echte Zeitstempel, Angebot = vorbereitet, Kontaktregel blockiert, offene Punkte bleiben in der Schlange', () => {
  const { ctx } = makeCtx();
  toQuote(ctx);
  const open = submitInboundLead(ctx, inbound({ request: { capabilityId: 'b2b-calc-csv', scope: { title: 'x' } } }), { ipHash: 't' });
  assert.equal(autoProcessOpportunity(ctx, open.opportunityId).stage, 'OPEN_POINTS');
  const q = responseQueue(ctx, true);
  assert.equal(q.length, 2);
  assert.ok(q.some((x) => x.state === 'QUEUED' && x.firstResponseMinutes === null), 'offene Punkte');
  assert.ok(q.some((x) => ['PREPARED', 'QUOTA_BLOCKED', 'POLICY_BLOCKED'].includes(x.state) && x.firstResponseMinutes === 0));
  assert.equal(q[0]?.state, 'QUEUED', 'Offenes zuerst');
});

test('139 Partner: nur mit Zustimmung und Vertrag; Provision nur aus bestätigter Zahlung, Freigabe durch den Eigentümer', () => {
  const { ctx } = makeCtx();
  assert.throws(() => addPartner(ctx, { name: 'P', consentRef: '', contractRef: 'V1', territory: 'IT', capabilities: [], commissionBps: 1000 }), /CONSENT_OR_CONTRACT/);
  assert.throws(() => addPartner(ctx, { name: 'P', consentRef: 'Mail', contractRef: 'V1', territory: 'IT', capabilities: [], commissionBps: 5000 }), /COMMISSION_INVALID/);
  const p = addPartner(ctx, { name: 'Studio Bianchi', consentRef: 'E-Mail 12.11.', contractRef: 'Vertrag 2026-01', territory: 'IT,DE', capabilities: ['b2b-calc-csv'], commissionBps: 1000 });
  const quoted = toQuote(ctx);
  assert.ok(attachReferral(ctx, quoted.leadId, p.referral_code));
  assert.equal(attachReferral(ctx, quoted.leadId, p.referral_code), null, 'erste Zuordnung zählt');
  assert.equal(accrueCommissions(ctx), 0, 'ohne Zahlung keine Provision');
  const paid = toPaid(ctx);
  attachReferral(ctx, paid.leadId, p.referral_code);
  assert.equal(accrueCommissions(ctx), 1);
  const c = ctx.db.get<{ commission_id: string; amount_minor: number; base_minor: number; state: string; payment_event_ref: string }>('SELECT * FROM partner_commissions');
  assert.equal(c?.state, 'PENDING_OWNER');
  assert.equal(c?.amount_minor, Math.floor((c?.base_minor ?? 0) / 10));
  assert.ok(c?.payment_event_ref);
  decideCommission(ctx, c?.commission_id ?? '', true);
  assert.throws(() => decideCommission(ctx, c?.commission_id ?? '', true), /NOT_PENDING/);
});

test('140 Erste Kunden: Budget fest 0 €, Entscheidung nur aus echten bezahlten Aufträgen; Testzahlungen zählen nicht', () => {
  const { ctx, clock } = makeCtx();
  assert.throws(() => proposeExperiment(ctx, { capabilityId: 'b2b-calc-csv', hypothesis: 'x', channels: ['ted'], days: 30 }), /CHANNELS_INVALID/);
  assert.throws(() => ctx.db.run(`INSERT INTO first_customer_experiments (experiment_id, capability_id, hypothesis, primary_metric, permitted_channels_json, max_spend_eur, start_at, end_at, decision, created_at) VALUES ('e','c','h','m','[]',100,'a','b','RUNNING','a')`), /CHECK/);
  const x = proposeExperiment(ctx, { capabilityId: 'b2b-calc-csv', hypothesis: 'Agenturen bestellen über die Bedarfsseite', channels: ['landing', 'content'], days: 14 });
  toPaid(ctx);
  let r = evaluateExperiments(ctx).find((e) => e.id === x.experiment_id);
  assert.equal(r?.testPaid, 1);
  assert.equal(r?.livePaid, 0);
  assert.equal(r?.decision, 'RUNNING', 'Testzahlung ist kein Kunde');
  clock.advance(15 * 86_400_000);
  r = evaluateExperiments(ctx).find((e) => e.id === x.experiment_id);
  assert.equal(r?.decision, 'NO_DEMAND');
});

test('147 Suchabsichten: Kauf → echte Leistung, Information ≠ Kaufinteresse, fehlende Leistung → Machbarkeit, nichts erfunden', () => {
  assert.deepEqual(classifyIntent('Lagerverwaltung Software kaufen Preis'), { intentClass: 'COMMERCIAL', capability: 'mini-ww', mappingState: 'MAPPED' });
  assert.equal(classifyIntent('was ist eine Kalkulation').intentClass, 'INFORMATIONAL');
  assert.deepEqual(classifyIntent('Logo Design bestellen'), { intentClass: 'COMMERCIAL', capability: null, mappingState: 'FEASIBILITY_CHECK' });
  assert.equal(classifyIntent('xyz').mappingState, 'REVIEW');
  const { ctx } = makeCtx();
  toQuote(ctx, inbound({ message: 'Kalkulation als PDF, Kontakt a@b.example 0123456789' }));
  ingestIntents(ctx);
  const row = ctx.db.get<{ query_norm: string; observed_at: string; source_ref: string }>('SELECT * FROM search_intents');
  assert.ok(row?.observed_at && row.source_ref, 'Quelle und Datum je Zuordnung');
  assert.doesNotMatch(row?.query_norm ?? '', /@|0123456789/, 'keine Kontaktdaten');
  assert.ok(intentClusters(ctx, true).every((c) => !('volume' in c)), 'kein Suchvolumen');
});

test('135/151 Bedarfsseiten: nur für freigegebene Leistung veröffentlicht, sonst ehrlich zum Berater; keine Doorway-Duplikate', async () => {
  const { ctx } = makeCtx({ env: { ALLOWED_CAPABILITIES: 'b2b-calc-csv,mini-ww' } });
  const lager = LANDING_DEFS.find((d) => d.slug === 'lagerverwaltung');
  assert.ok(lager);
  assert.equal(landingQa(ctx, lager).find((q) => q.check === 'real_offer')?.passed, false);
  assert.equal(publishedLanding(ctx, 'lagerverwaltung'), null);
  const h = createHandler(ctx);
  const before = await get(h, '/loesungen/lagerverwaltung');
  assert.equal(before.status, 303);
  assert.match(String(before.headers?.location), /^\/berater/);
  releaseProduct(ctx, 'mini-ww', 49000);
  const page = await get(h, '/loesungen/lagerverwaltung?lang=it');
  assert.equal(page.status, 200);
  assert.match(String(page.body), /href="\/produkte\/warenwirtschaft\?lang=it&amp;src=landing"|href="\/produkte\/warenwirtschaft\?lang=it&src=landing"/);
  assert.match(String(page.body), /hreflang="it"|lang="it"/);
  assert.ok(landingQa(ctx, lager).every((q) => q.passed));
  assert.equal(new Set(LANDING_DEFS.map((d) => d.capability)).size, LANDING_DEFS.length, 'eine Seite je Leistung');
  assert.match(String((await get(h, '/sitemap.xml')).body), /\/loesungen\/lagerverwaltung/);
});

test('148 Ratgeber: aus echten getesteten Funktionen, erfundene Berichte blockiert, Produktänderung → Wiedervorlage', async () => {
  const a = buildArticle('de');
  assert.ok(reviewArticle(a).every((r) => r.passed), JSON.stringify(reviewArticle(a)));
  const fake = { ...a, intro: `${a.intro} Unsere Kunden sagen: 40 % mehr Umsatz!` };
  assert.equal(reviewArticle(fake).find((r) => r.check === 'no_fabrication')?.passed, false);
  assert.equal(reviewArticle({ ...a, capabilityVersion: 999 }).find((r) => r.check === 'current')?.passed, false);
  const { ctx } = makeCtx();
  assert.ok(syncContent(ctx).every((r) => r.status === 'PUBLISHED'));
  ctx.db.run(`UPDATE content_pages SET capability_version = 0 WHERE lang = 'de'`);
  syncContent(ctx);
  assert.ok(ctx.db.get('SELECT 1 AS x FROM audit_events') !== undefined);
  const h = createHandler(ctx);
  const page = String((await get(h, '/ratgeber/angebot-bis-rechnung?lang=en')).body);
  assert.match(page, /From quote to paid invoice/);
  assert.match(page, /hreflang="de"/);
  assert.equal((await get(h, '/ratgeber/gibt-es-nicht')).status, 404);
});

test('149 Verbreitung: nicht verbunden = NOT_CONNECTED, Direktnachrichten verboten, Kampagnenlink ohne Personendaten, keine Veröffentlichung ohne Quittung', () => {
  const { ctx } = makeCtx();
  const r = planDistribution(ctx, 'https://x.invalid', 'angebot-bis-rechnung');
  assert.ok(r.every((p) => p.status === 'NOT_CONNECTED'));
  assert.ok(planDistribution(ctx, 'https://x.invalid', 'angebot-bis-rechnung', 'dm').every((p) => p.status === 'BLOCKED'));
  const link = campaignLink('https://x.invalid', '/ratgeber/a', 'linkedin', 'a');
  assert.match(link, /^https:\/\/x\.invalid\/ratgeber\/a\?src=social&cmp=linkedin-a$/);
  const post = ctx.db.get<{ post_id: string }>('SELECT post_id FROM distribution_posts LIMIT 1');
  assert.throws(() => markPublished(ctx, post?.post_id ?? '', null), /RECEIPT_MISSING/);
  planDistribution(ctx, 'https://x.invalid', 'angebot-bis-rechnung');
  assert.equal(ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM distribution_posts')?.n, 8, 'idempotent, keine Doppelplanung');
});

test('155 Funnel: Impressionen nicht erfunden, nicht zuordenbar erlaubt, Netto = Zahlung − Gebühren − Erstattung, Bank nur mit Beleg', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  recordAcquisition(ctx, d.leadId, { channel: 'landing', campaign: 'lagerverwaltung' });
  toQuote(ctx);
  const f = funnel(ctx, true);
  const landing = f.rows.find((r) => r.channel === 'landing');
  const un = f.rows.find((r) => r.channel === 'unattributed');
  assert.ok(landing && un);
  assert.ok('unavailable' in landing.impressions && 'unavailable' in landing.clicks);
  assert.equal(landing.paidOrders, 1);
  assert.equal(landing.netMinor, landing.paymentsMinor - landing.feesMinor - landing.refundsMinor);
  assert.ok(landing.paymentsMinor > 0);
  assert.equal(un.paidOrders, 0);
  assert.equal(f.bankVerifiedMinor, 0, 'ohne Kontoauszug nichts auf der Bank');
  assert.equal(f.optimization, 'PAUSED_INSUFFICIENT_DATA');
  recordAcquisition(ctx, d.leadId, { channel: 'social' });
  assert.equal(ctx.db.get<{ c: string }>('SELECT acquisition_channel AS c FROM leads WHERE lead_id = ?', d.leadId)?.c, 'landing', 'First-Touch bleibt');
  recordAcquisition(ctx, d.leadId, { channel: '<script>' });
});

test('Admin-Seite Wachstum und Freigabeseite nur für den Eigentümer erreichbar', async () => {
  const { ctx } = makeCtx();
  const h = createHandler(ctx);
  for (const p of ['/dashboard/wachstum', '/dashboard/produkte/mini-ww']) assert.equal((await get(h, p)).status, 303, p);
  const post = await h({ method: 'POST', url: '/admin/produkte/mini-ww/freigeben', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'price=490', ip: '127.0.0.1' });
  assert.equal(post.status, 303, 'ohne Anmeldung keine Freigabe');
});
