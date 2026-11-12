import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, newId, randomToken } from '../../packages/shared/src/crypto.ts';
import { renderConsole } from '../../apps/console/src/index.ts';
import { financeView } from '../../apps/console/src/model.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { getOrder } from '../../services/core-api/src/orders.ts';
import { buildTestCamt053, importBankStatement, maskIban, parseAmount, parseCamt053, parseCsvStatement } from '../../services/finance/src/bank-statement.ts';
import { mockPayout } from '../../services/finance/src/mock-provider.ts';
import { Client, csrfFrom, serve } from '../http.ts';
import { count, makeCtx, oppState, toDelivered } from '../helpers.ts';

/** Gelieferter, abgeglichener Testauftrag mit gemeldeter Auszahlung. */
function withPayout(ctx: AppContext, amount?: number): { orderId: string; opportunityId: string; providerPayoutId: string; amount: number } {
  const d = toDelivered(ctx);
  autopilotTick(ctx);
  const a = amount ?? getOrder(ctx, d.orderId).amount_minor - 100;
  mockPayout(ctx, [d.orderId], a, 'EUR');
  const p = ctx.db.get<{ provider_payout_id: string }>(`SELECT provider_payout_id FROM payouts WHERE order_ids_json LIKE ?`, `%${d.orderId}%`);
  return { orderId: d.orderId, opportunityId: d.opportunityId, providerPayoutId: p?.provider_payout_id ?? '', amount: a };
}

const csv = (rows: string[], marker = 'TESTAUSZUG'): string => `Kontoauszug ${marker};;;\nIBAN;DE89 3704 0044 0532 0130 00;;\nBuchungstag;Betrag;Währung;Verwendungszweck;Auftraggeber\n${rows.join('\n')}\n`;
const ymd = (ctx: AppContext, plusDays = 1): string => new Date(ctx.clock().getTime() + plusDays * 86_400_000).toISOString().slice(0, 10);
const deDate = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

test('Gesamtkette bis BANK_CREDIT_VERIFIED: Auszahlung allein = unterwegs; erst Test-Kontoauszug bestätigt und schließt ab', () => {
  const { ctx } = makeCtx();
  const p = withPayout(ctx);
  assert.equal(oppState(ctx, p.opportunityId), 'PAYOUT_RECORDED');
  let f = financeView(ctx, true);
  assert.deepEqual([f.inTransitMinor, f.onBankMinor, f.bankConnected], [p.amount, 0, false]);
  const xml = buildTestCamt053(ctx);
  assert.match(xml, /<MsgId>TEST-/);
  const r = importBankStatement(ctx, xml);
  assert.deepEqual(r.matched.map((m) => [m.providerPayoutId, m.rule]), [[p.providerPayoutId, 'REFERENCE']]);
  assert.deepEqual(r.closedOrders, [p.orderId]);
  assert.equal(oppState(ctx, p.opportunityId), 'CLOSED');
  const po = ctx.db.get<{ b: number; txn: string | null; at: string | null }>('SELECT bank_credit_confirmed AS b, bank_txn_id AS txn, bank_verified_at AS at FROM payouts');
  assert.equal(po?.b, 1);
  assert.ok(po?.txn && po.at, 'Nachweis (Bankbuchung) verknüpft');
  f = financeView(ctx, true);
  assert.deepEqual([f.inTransitMinor, f.onBankMinor, f.bankConnected], [0, p.amount, true]);
  assert.equal(financeView(ctx, false).bankConnected, false, 'Echtbetrieb bleibt unverbunden');
  assert.equal(ctx.audit.byType('bank.credit_verified').length, 1);
  const detail = renderConsole(ctx, `/dashboard/auftraege/${p.orderId}`, new URLSearchParams(), 'x') ?? '';
  assert.match(detail, /Auf Bank angekommen/);
  assert.match(detail, /Auf Bank bestätigt/);
});

test('CSV (deutsches Format): Betrag + Datumsfenster, eindeutig → Regel AMOUNT_DATE; IBAN nur maskiert gespeichert', () => {
  const { ctx } = makeCtx();
  const p = withPayout(ctx);
  const amount = (p.amount / 100).toFixed(2).replace('.', ',');
  const r = importBankStatement(ctx, csv([`${deDate(ymd(ctx, 2))};${amount};EUR;SEPA-Gutschrift Sammelauszahlung;Zahlungsdienst GmbH`, `${deDate(ymd(ctx, 2))};-9,99;EUR;Kontoführung;Bank`]));
  assert.deepEqual(r.matched.map((m) => m.rule), ['AMOUNT_DATE']);
  assert.equal(oppState(ctx, p.opportunityId), 'CLOSED');
  const s = ctx.db.get<{ account_masked: string }>('SELECT account_masked FROM bank_statements');
  assert.equal(s?.account_masked, 'DE89 •••• 3000');
  assert.equal(count(ctx, `SELECT COUNT(*) AS n FROM bank_statements WHERE account_masked LIKE '%0532%'`), 0);
});

test('Mehrdeutig: zwei Auszahlungen mit gleichem Betrag ohne Referenz → keine Zuordnung, Prüfhinweis', () => {
  const { ctx } = makeCtx();
  const a = withPayout(ctx, 5000);
  const b = withPayout(ctx, 5000);
  const r = importBankStatement(ctx, csv([`${deDate(ymd(ctx))};50,00;EUR;Gutschrift;Anbieter`]));
  assert.equal(r.matched.length, 0);
  assert.ok(r.review.some((x) => /mehrere mögliche Buchungen/.test(x)));
  assert.deepEqual([oppState(ctx, a.opportunityId), oppState(ctx, b.opportunityId)], ['PAYOUT_RECORDED', 'PAYOUT_RECORDED']);
  assert.equal(financeView(ctx, true).onBankMinor, 0);
});

test('Referenz passt, Betrag nicht → keine Bestätigung; Lastschrift mit Referenz zählt nie; außerhalb des Zeitfensters keine Zuordnung', () => {
  const { ctx } = makeCtx();
  const p = withPayout(ctx);
  const r = importBankStatement(ctx, csv([
    `${deDate(ymd(ctx))};1,00;EUR;Auszahlung ${p.providerPayoutId};Anbieter`,
    `${deDate(ymd(ctx))};-${(p.amount / 100).toFixed(2).replace('.', ',')};EUR;Rückbuchung ${p.providerPayoutId};Anbieter`,
    `${deDate(ymd(ctx, 30))};${(p.amount / 100).toFixed(2).replace('.', ',')};EUR;Gutschrift spät;Anbieter`,
  ]));
  assert.equal(r.matched.length, 0);
  assert.ok(r.review.some((x) => /Betrag\/Währung weicht ab/.test(x)));
  assert.equal(oppState(ctx, p.opportunityId), 'PAYOUT_RECORDED');
});

test('Schutz: Duplikat, fehlende TEST-Kennzeichnung, DTD/XXE, Größe und Echtbetrieb werden abgelehnt', () => {
  const { ctx } = makeCtx();
  withPayout(ctx);
  const xml = buildTestCamt053(ctx);
  importBankStatement(ctx, xml);
  assert.throws(() => importBankStatement(ctx, xml), /STATEMENT_DUPLICATE/);
  assert.throws(() => importBankStatement(ctx, csv([`${deDate(ymd(ctx))};1,00;EUR;x;y`], 'Girokonto')), /STATEMENT_NOT_MARKED_TEST/);
  assert.throws(() => importBankStatement(ctx, `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><Document>&x;</Document>`), /STATEMENT_UNREADABLE/);
  assert.throws(() => importBankStatement(ctx, 'x'.repeat(61_000)), /STATEMENT_TOO_LARGE/);
  assert.throws(() => importBankStatement(ctx, '   '), /STATEMENT_EMPTY/);
  // Simulierter Echtbetrieb (testMode ist im Typ fest true – genau deshalb hier bewusst per unknown erzwungen)
  const live = { ...ctx, config: { ...ctx.config, testMode: false } } as unknown as AppContext;
  assert.throws(() => importBankStatement(live, xml), /LIVE_BANK_IMPORT_LOCKED/);
});

test('Datenbank erzwingt: Bankbestätigung nur mit Buchung, endgültig, Buchungen unveränderlich, keine Live-Zeilen', () => {
  const { ctx } = makeCtx();
  withPayout(ctx);
  assert.throws(() => ctx.db.run('UPDATE payouts SET bank_credit_confirmed = 1'), /BANK_CONFIRM_REQUIRES_EVIDENCE/);
  importBankStatement(ctx, buildTestCamt053(ctx));
  assert.throws(() => ctx.db.run('UPDATE payouts SET bank_credit_confirmed = 0'), /BANK_MATCH_FINAL/);
  assert.throws(() => ctx.db.run('UPDATE bank_transactions SET amount_minor = 1'), /BANK_DATA_APPEND_ONLY/);
  assert.throws(() => ctx.db.run('UPDATE bank_transactions SET matched_payout_id = NULL WHERE matched_payout_id IS NOT NULL'), /BANK_MATCH_FINAL/);
  assert.throws(() => ctx.db.run('DELETE FROM bank_transactions'), /BANK_DATA_APPEND_ONLY/);
  assert.throws(() => ctx.db.run(`INSERT INTO bank_statements (statement_id, source_format, file_sha256, marked_test, entries, credits, imported_by, test_mode, created_at) VALUES (?, 'CSV', 'x', 0, 0, 0, 'owner', 0, ?)`, newId('bst'), ctx.clock().toISOString()), /LIVE_MODE_DISABLED/);
});

test('Parser: Beträge, camt.053-Buchungen und IBAN-Maskierung', () => {
  assert.deepEqual(parseAmount('1.234,56'), { minor: 123456, negative: false });
  assert.deepEqual(parseAmount('-12,00 €'), { minor: 1200, negative: true });
  assert.deepEqual(parseAmount('1,234.50'), { minor: 123450, negative: false });
  assert.equal(parseAmount('abc'), null);
  assert.equal(maskIban('DE89370400440532013000'), 'DE89 •••• 3000');
  assert.equal(maskIban('kein iban'), null);
  const camt = parseCamt053(`<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>TEST-1</MsgId></GrpHdr><Stmt><Id>S1</Id><Acct><Id><IBAN>DE89370400440532013000</IBAN></Id></Acct>
    <Ntry><Amt Ccy="EUR">12.30</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-11-13</Dt></BookgDt><NtryDtls><TxDtls><RltdPties><Dbtr><Nm>A &amp; B</Nm></Dbtr></RltdPties><RmtInf><Ustrd>Auszahlung po_x</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
    <Ntry><Amt Ccy="EUR">5.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-11-13</Dt></BookgDt></Ntry></Stmt></BkToCstmrStmt></Document>`);
  assert.equal(camt.markedTest, true);
  assert.equal(camt.accountMasked, 'DE89 •••• 3000');
  assert.deepEqual(camt.txns.map((t) => [t.amountMinor, t.direction, t.bookingDate, t.reference, t.counterparty]), [[1230, 'CRDT', '2026-11-13', 'Auszahlung po_x', 'A & B'], [500, 'DBIT', '2026-11-13', '', null]]);
  const c = parseCsvStatement('Datum,Betrag,Verwendungszweck\n2026-11-13,"1,234.50",Test');
  assert.equal(c.txns[0]?.amountMinor, 123450);
});

test('HTTP: Testauszahlung melden → Test-Kontoauszug herunterladen → einfügen → Auftrag abgeschlossen (nur Owner, CSRF)', async () => {
  const PASSWORD = `pw-${randomToken(12)}`;
  const { ctx } = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } });
  const d = toDelivered(ctx);
  autopilotTick(ctx);
  const { server, base } = await serve(ctx);
  try {
    const anon = new Client(base);
    assert.equal((await anon.get('/admin/bank/test-statement')).status, 303);
    const c = new Client(base);
    await c.post('/auth/login', { password: PASSWORD });
    const fin = await c.get('/dashboard/finanzen?modus=test');
    assert.match(fin.text, /Bankabgleich \(Testbetrieb\)/);
    assert.equal((await c.post('/admin/payouts/test', {})).status, 403, 'CSRF erzwungen');
    const po = await c.post('/admin/payouts/test', { _csrf: csrfFrom(fin.text), _back: '/dashboard/finanzen?modus=test#bankabgleich' });
    assert.match(decodeURIComponent(po.location ?? ''), /1 Testauszahlung\(en\) gemeldet/);
    assert.equal(oppState(ctx, d.opportunityId), 'PAYOUT_RECORDED');
    const xml = await c.get('/admin/bank/test-statement');
    assert.match(xml.headers.get('content-type') ?? '', /application\/xml/);
    const imp = await c.post('/admin/bank/import', { _csrf: csrfFrom(fin.text), statement: xml.text, _back: '/dashboard/finanzen?modus=test#bankabgleich' });
    assert.match(decodeURIComponent(imp.location ?? ''), /1 Auszahlung\(en\) als Bankeingang bestätigt/);
    assert.match(imp.location ?? '', /#bankabgleich$/);
    assert.equal(oppState(ctx, d.opportunityId), 'CLOSED');
    const live = await c.get('/dashboard/finanzen');
    assert.match(live.text, /Echte Kontoauszüge können erst importiert werden/);
  } finally {
    server.close();
  }
});
