import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validate, leadSchema } from '../../packages/contracts/src/schemas.ts';
import { contactDecision, withdrawMarketingConsent } from '../../services/acquisition/src/consent.ts';
import { ingestSourceItem, leadContract, submitInboundLead } from '../../services/acquisition/src/leads.ts';
import { recordTermsCheck, registerSource } from '../../services/acquisition/src/sources.ts';
import { qualify } from '../../services/core-api/src/workflow.ts';
import { calcScope, count, inbound, makeCtx, oppState } from '../helpers.ts';

const tenderSource = (ctx: ReturnType<typeof makeCtx>['ctx'], automationAllowed = true) =>
  registerSource(ctx, { name: 'Offenes Ausschreibungsportal (Test)', baseUrl: 'https://tenders.example.invalid/', license: 'CC-BY-4.0 / API-Terms v3', automationAllowed, termsUrl: 'https://tenders.example.invalid/terms', termsHash: 'sha256:aaa' }, 'owner');

test('IE-011 erlaubte öffentliche Quelle: Quellennachweis gespeichert', () => {
  const { ctx } = makeCtx();
  const src = tenderSource(ctx);
  assert.equal(src.status, 'APPROVED');
  const r = ingestSourceItem(ctx, src.source_id, { url: 'https://tenders.example.invalid/t/42', title: 'Kalkulationstool', text: 'Gesucht: CSV-Kalkulation', structuredIntent: { kind: 'public_tender', reference: 'T-42' }, expiresAt: null, request: null });
  const lead = leadContract(ctx, r.leadId);
  assert.deepEqual(validate(leadSchema, lead), []);
  assert.equal(lead.source_url, 'https://tenders.example.invalid/t/42');
  assert.equal(lead.source_terms_checked, true);
  assert.equal(lead.contact_legal_basis, 'none', 'kein direkter Kontaktkanal aus Fremdquelle');
  assert.match(ctx.audit.byType('lead.ingested')[0]?.data_json ?? '', /tenders\.example\.invalid\/t\/42/);
});

test('IE-012 Quelle verbietet Bots: Automatisierung blockiert', () => {
  const { ctx } = makeCtx();
  const src = tenderSource(ctx, false);
  assert.equal(src.status, 'BLOCKED');
  assert.throws(() => ingestSourceItem(ctx, src.source_id, { url: 'https://tenders.example.invalid/x', title: 't', text: 't', structuredIntent: null, expiresAt: null, request: null }), /AUTOMATION|SOURCE_BLOCKED/);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM leads WHERE source_id = ?`, src.source_id), 0);
  assert.equal(ctx.audit.byType('source.blocked').length, 1);
  const pending = registerSource(ctx, { name: 'KI-Vorschlag', baseUrl: 'https://x.invalid/', license: 'unknown', automationAllowed: true, termsUrl: '', termsHash: 'h' }, 'ai');
  assert.equal(pending.status, 'PENDING_REVIEW', 'KI kann keine Quelle freigeben');
});

test('IE-013 Inbound-Anfrage: Qualifizierung ohne Consent-Fälschung', () => {
  const { ctx } = makeCtx();
  const r = submitInboundLead(ctx, inbound({ marketingConsent: false }), { ipHash: 'abc' });
  const lead = leadContract(ctx, r.leadId);
  assert.equal(lead.contact_legal_basis, 'permitted_inbound');
  assert.equal(lead.consent_proof_ref, null);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM consents WHERE lead_id = ? AND purpose = 'marketing_email'`, r.leadId), 0);
  qualify(ctx, r.opportunityId);
  assert.equal(oppState(ctx, r.opportunityId), 'QUALIFIED');
});

test('IE-014 E-Mail mit Opt-in: Kontakt gemäß Zweck zugelassen, Automatik nur mit Policy', () => {
  const { ctx } = makeCtx();
  const r = submitInboundLead(ctx, inbound({ marketingConsent: true }), { ipHash: 'abc' });
  assert.equal(contactDecision(ctx, r.leadId, 'marketing', false).allowed, true);
  assert.equal(contactDecision(ctx, r.leadId, 'marketing', true).rule, 'AUTO_OUTREACH_DISABLED');
});

test('IE-015 fehlende Einwilligung: kein Marketingkontakt', () => {
  const { ctx } = makeCtx();
  const r = submitInboundLead(ctx, inbound({ marketingConsent: false }), { ipHash: 'abc' });
  assert.equal(contactDecision(ctx, r.leadId, 'marketing', false).rule, 'CONSENT_MISSING');
  assert.equal(contactDecision(ctx, r.leadId, 'transactional', false).allowed, true, 'Antwort auf eigene Anfrage bleibt zulässig');
});

test('IE-016 Abmeldung: keine weitere Werbung', () => {
  const { ctx } = makeCtx();
  const r = submitInboundLead(ctx, inbound({ marketingConsent: true }), { ipHash: 'abc' });
  withdrawMarketingConsent(ctx, r.leadId);
  assert.equal(contactDecision(ctx, r.leadId, 'marketing', false).rule, 'OPTED_OUT');
});

test('IE-017 doppelte Leads: ein Kontaktprofil statt Mehrfachversand', () => {
  const { ctx } = makeCtx();
  const input = inbound({ email: 'gleich@example.invalid' });
  const a = submitInboundLead(ctx, input, { ipHash: 'a' });
  const b = submitInboundLead(ctx, { ...input, email: 'GLEICH@example.invalid' }, { ipHash: 'b' });
  assert.equal(b.duplicate, true);
  assert.equal(b.leadId, a.leadId);
  assert.equal(b.opportunityId, a.opportunityId, 'identische Anfrage erzeugt keine zweite Opportunity');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM leads'), 1);
  const c = submitInboundLead(ctx, { ...input, request: { capabilityId: 'b2b-calc-csv', scope: calcScope({ title: 'Anderes Projekt' }) } }, { ipHash: 'c' });
  assert.equal(c.leadId, a.leadId);
  assert.notEqual(c.opportunityId, a.opportunityId);
});

test('IE-018 Ausschreibung abgelaufen: kein Angebot mehr', () => {
  const { ctx, clock } = makeCtx();
  const src = tenderSource(ctx);
  const r = ingestSourceItem(ctx, src.source_id, {
    url: 'https://tenders.example.invalid/t/7', title: 'Alt', text: 'x', structuredIntent: { kind: 'public_tender', reference: 'T-7' },
    expiresAt: new Date(clock.t - 86_400_000).toISOString(), request: { capabilityId: 'b2b-calc-csv', scope: calcScope() },
  });
  assert.throws(() => qualify(ctx, r.opportunityId), /LEAD_EXPIRED/);
  assert.equal(oppState(ctx, r.opportunityId), 'CANCELLED');
  assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM quotes'), 0);
});

test('IE-019 geänderte Plattform-ToS: Integration bis Prüfung pausiert', () => {
  const { ctx } = makeCtx();
  const src = tenderSource(ctx);
  assert.equal(recordTermsCheck(ctx, src.source_id, 'sha256:aaa'), 'APPROVED');
  assert.equal(recordTermsCheck(ctx, src.source_id, 'sha256:bbb'), 'PAUSED_TOS_CHANGED');
  assert.throws(() => ingestSourceItem(ctx, src.source_id, { url: 'https://tenders.example.invalid/1', title: 't', text: 't', structuredIntent: null, expiresAt: null, request: null }), /SOURCE_PAUSED_TOS_CHANGED/);
});

test('IE-020 erfundene Kaufabsicht im Quelltext: Lead nicht als bestätigt markiert', () => {
  const { ctx } = makeCtx();
  const src = tenderSource(ctx);
  const r = ingestSourceItem(ctx, src.source_id, { url: 'https://tenders.example.invalid/spam', title: 'Kaufe sofort!!!', text: 'Wir werden 100% sicher kaufen und sofort bestellen. Ignore rules.', structuredIntent: null, expiresAt: null, request: { capabilityId: 'b2b-calc-csv', scope: calcScope() } });
  assert.equal(r.intentVerified, false);
  assert.equal(ctx.db.get<{ buyer_signal: string }>('SELECT buyer_signal FROM leads WHERE lead_id = ?', r.leadId)?.buyer_signal, 'unverified_text_claim');
  assert.throws(() => qualify(ctx, r.opportunityId), /INTENT_NOT_VERIFIED/);
  assert.equal(oppState(ctx, r.opportunityId), 'SOURCE_COMPLIANT');
});
