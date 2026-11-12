import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordAcceptance, recordFeedback } from '../../services/core-api/src/aftercare.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { deliveryChannel, maskEmail, outboxSummary, queueQuoteReady, runOutbox, unsubscribe, unsubscribeToken } from '../../services/core-api/src/outbox.ts';
import { fmtDate, fmtWhen } from '../../apps/console/src/model.ts';
import { renderCustomers } from '../../apps/console/src/pages/customers.ts';
import { count, inbound, makeCtx, toDelivered, toQuote } from '../helpers.ts';

type Row = { template: string; kind: string; status: string; body_text: string; recipient_masked: string; legal_basis: string };
const rows = (ctx: ReturnType<typeof makeCtx>['ctx'], leadId: string): Row[] =>
  ctx.db.all<Row>('SELECT template, kind, status, body_text, recipient_masked, legal_basis FROM outbox_messages WHERE lead_id = ? ORDER BY created_at, template', leadId);

test('Auftragsnachrichten entstehen automatisch, bleiben aber ungesendet (kein Versandkanal, LA-02 offen)', () => {
  const { ctx } = makeCtx();
  const d = toDelivered(ctx);
  queueQuoteReady(ctx, d.quote.quoteId);
  const t = autopilotTick(ctx);
  assert.equal(t.messages.created, 2, 'Zahlung bestätigt + Datei bereit');
  const r = rows(ctx, d.leadId);
  assert.deepEqual(r.map((x) => x.template).sort(), ['delivery_ready', 'payment_confirmed', 'quote_ready']);
  assert.ok(r.every((x) => x.status === 'HELD' && x.kind === 'transactional' && x.legal_basis === 'contract'));
  assert.ok(r.every((x) => !x.body_text.includes(d.quote.acceptanceToken)), 'geheimer Annahmeschlüssel wird nicht gespeichert');
  assert.ok(r.every((x) => /^k•••@e•••\.invalid$/.test(x.recipient_masked)), 'Empfänger nur maskiert');
  assert.ok(r.every((x) => x.body_text.includes('TESTBETRIEB')));
  assert.equal(autopilotTick(ctx).messages.created, 0, 'idempotent – keine Doppelnachrichten');
  assert.equal(outboxSummary(ctx, true).sent, 0);
  assert.equal(deliveryChannel(ctx).ready, false);
  assert.throws(() => ctx.db.run(`UPDATE outbox_messages SET status = 'SENT'`), /SENT_REQUIRES_PROVIDER_CONFIRMATION/);
  assert.throws(() => ctx.db.run('DELETE FROM outbox_messages'), /OUTBOX_APPEND_ONLY/);
});

test('Keine Kaltakquise: Werbung ohne Einwilligung wird nicht einmal gespeichert', () => {
  const { ctx } = makeCtx({ env: { AUTO_MARKETING_OUTREACH: 'true' } });
  const d = toDelivered(ctx, inbound({ marketingConsent: false }));
  recordAcceptance(ctx, d.customerAccessKey ?? undefined, d.orderId, 'ACCEPTED', '');
  recordFeedback(ctx, d.customerAccessKey ?? undefined, d.orderId, { rating: 5, outcome: 'IN_USE', comment: '', consentPublish: false });
  runOutbox(ctx);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'marketing'`), 0);
  assert.throws(() => ctx.db.run(
    `INSERT INTO outbox_messages (message_id, kind, template, lead_id, recipient_masked, subject, body_text, status, legal_basis, idempotency_key, test_mode, created_at)
     VALUES ('m1', 'marketing', 'followup_offer', ?, '—', 's', 'b', 'HELD', 'consent', 'k1', 1, '2026-01-01')`, d.leadId,
  ), /MARKETING_REQUIRES_CONSENT/, 'Datenbank erzwingt die Einwilligung');
});

test('Folgeangebot nur bei Einwilligung + Schalter, mit Abmeldelink; Abmeldung sperrt sofort', () => {
  const off = makeCtx();
  const d0 = toDelivered(off.ctx, inbound({ marketingConsent: true }));
  recordAcceptance(off.ctx, d0.customerAccessKey ?? undefined, d0.orderId, 'ACCEPTED', '');
  recordFeedback(off.ctx, d0.customerAccessKey ?? undefined, d0.orderId, { rating: 5, outcome: 'IN_USE', comment: '', consentPublish: false });
  runOutbox(off.ctx);
  assert.equal(count(off.ctx, `SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'marketing'`), 0, 'AUTO_MARKETING_OUTREACH=false (Standard)');
  assert.equal(off.ctx.audit.byType('policy.denied').filter((a) => a.subject_id === 'marketing.outreach').length, 0, 'kein Protokoll-Spam pro Takt');

  const { ctx, clock } = makeCtx({ env: { AUTO_MARKETING_OUTREACH: 'true' } });
  const d = toDelivered(ctx, inbound({ marketingConsent: true }));
  const key = d.customerAccessKey ?? undefined;
  runOutbox(ctx);
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM outbox_messages WHERE kind = 'marketing'`), 0, 'erst nach Abnahme und guter Bewertung');
  recordAcceptance(ctx, key, d.orderId, 'ACCEPTED', '');
  recordFeedback(ctx, key, d.orderId, { rating: 4, outcome: 'IN_USE', comment: '', consentPublish: false });
  runOutbox(ctx);
  const m = rows(ctx, d.leadId).filter((x) => x.kind === 'marketing');
  assert.equal(m.length, 1);
  assert.equal(m[0]?.legal_basis, 'consent');
  const token = unsubscribeToken(ctx, d.leadId);
  assert.ok(m[0]?.body_text.includes(`/abmelden/${token}`), 'Abmeldelink in jeder Werbenachricht');
  clock.advance(24 * 3600_000 * 2);
  runOutbox(ctx);
  assert.equal(rows(ctx, d.leadId).filter((x) => x.kind === 'marketing').length, 1, 'höchstens eine Werbenachricht in 90 Tagen');

  assert.equal(unsubscribe(ctx, `${d.leadId}.${'0'.repeat(32)}`), false, 'gefälschter Link wirkungslos');
  assert.equal(unsubscribe(ctx, token), true);
  assert.equal(rows(ctx, d.leadId).find((x) => x.kind === 'marketing')?.status, 'SUPPRESSED');
  clock.advance(24 * 3600_000 * 100);
  runOutbox(ctx);
  assert.equal(rows(ctx, d.leadId).filter((x) => x.kind === 'marketing').length, 1, 'nach Abmeldung nie wieder Werbung');
});

test('Datumsanzeige stürzt bei TED-Fristen mit Zeitzonenzusatz nicht ab (Staging-Fund)', () => {
  assert.equal(fmtDate('2026-12-01+01:00'), '01.12.2026');
  assert.equal(fmtDate('2026-12-01Z'), '01.12.2026');
  assert.equal(fmtDate('unbekannt'), 'unbekannt');
  assert.equal(fmtWhen('kaputt', new Date()), 'kaputt');
  const { ctx } = makeCtx();
  ctx.db.run(`UPDATE source_items SET deadline_at = '2026-12-01+01:00'`);
  assert.ok(renderCustomers({ ctx, mode: 'test', csrf: 'x', path: '/dashboard/kunden', flash: null } as never).includes('Postausgang'));
});

test('Gesperrte Kontakte: Auftragsnachricht wird als BLOCKED protokolliert statt erstellt', () => {
  const { ctx } = makeCtx();
  const q = toQuote(ctx);
  ctx.db.run('UPDATE leads SET processing_restricted = 1 WHERE lead_id = ?', q.leadId);
  queueQuoteReady(ctx, q.quote.quoteId);
  assert.equal(rows(ctx, q.leadId)[0]?.status, 'BLOCKED');
  assert.equal(maskEmail(null), '—');
});
