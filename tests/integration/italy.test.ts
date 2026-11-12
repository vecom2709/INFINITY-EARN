import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, randomToken } from '../../packages/shared/src/crypto.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { businessProfile, listActivationItems, setSeatCountry } from '../../services/core-api/src/readiness.ts';
import { buildFatturaPA, fatturaInputFromInvoice, proposeItalianTax, splitAddress, totals, validateFatturaPA, type FpInput } from '../../services/finance/src/fatturapa.ts';
import { Client, csrfFrom, serve } from '../http.ts';
import { makeCtx, toDelivered } from '../helpers.ts';

const seller = { country: 'IT', vatId: '12345678903', fiscalCode: null, name: 'INFINITY EARN di Mario Rossi', address: 'Via Roma 1', cap: '20121', city: 'Milano', province: 'MI', regime: 'RF19' as const };
const base = (over: Partial<FpInput> = {}): FpInput => ({
  progressivo: 'a1b2c', seller, buyer: { country: 'DE', vatId: '123456789', fiscalCode: null, name: 'Muster GmbH', address: 'Hauptstr. 5', cap: '10115', city: 'Berlin', province: null },
  codiceDestinatario: 'XXXXXXX', pec: null, docType: 'TD01', number: 'TEST-2026-000001', date: '2026-11-12',
  lines: [{ description: 'Kalkulation gemäß Anfrage', quantity: 1, unitMinor: 9000 }], tax: { rate: 0, nature: 'N2.2', law: 'L. 190/2014' }, causale: [], ...over,
});

test('LA-01: Sitzland nur durch den Eigentümer; Italien gespeichert, LA-01 auf „In Arbeit“, nicht freigegeben', () => {
  const { ctx } = makeCtx();
  assert.throws(() => setSeatCountry(ctx, 'IT', 'ai'), /OWNER_REQUIRED/);
  assert.throws(() => setSeatCountry(ctx, 'US', 'owner'), /INVALID_COUNTRY/);
  setSeatCountry(ctx, 'it', 'owner');
  assert.equal(businessProfile(ctx).seat_country, 'IT');
  const la = listActivationItems(ctx).find((i) => i.item_id === 'LA-01');
  assert.equal(la?.status, 'IN_PROGRESS', 'keine Freigabe ohne Nachweis der Steuerberatung');
  assert.match(la?.note ?? '', /Sitzland IT vom Eigentümer gewählt/);
  assert.equal(ctx.audit.byType('business.seat_country_set').length, 1);
});

test('FatturaPA forfettario an EU-Unternehmen: RF19, 0 % mit Natura N2.2, Stempelsteuer ab 77,47 €, korrekte Summen', () => {
  const x = buildFatturaPA(base());
  for (const s of ['<FormatoTrasmissione>FPR12</FormatoTrasmissione>', '<RegimeFiscale>RF19</RegimeFiscale>', '<CodiceDestinatario>XXXXXXX</CodiceDestinatario>', '<AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura>', '<BolloVirtuale>SI</BolloVirtuale>', '<ImportoTotaleDocumento>90.00</ImportoTotaleDocumento>', '<IdPaese>DE</IdPaese><IdCodice>123456789</IdCodice>', '<CAP>00000</CAP>']) assert.ok(x.includes(s), s);
  for (const tag of ['FatturaElettronicaHeader', 'FatturaElettronicaBody', 'DatiTrasmissione', 'CedentePrestatore', 'CessionarioCommittente', 'DettaglioLinee', 'DatiRiepilogo']) {
    assert.equal((x.match(new RegExp(`<${tag}>`, 'g')) ?? []).length, (x.match(new RegExp(`</${tag}>`, 'g')) ?? []).length, `${tag} geschlossen`);
  }
  assert.deepEqual(totals(base({ lines: [{ description: 'x', quantity: 1, unitMinor: 5000 }] })).bollo, false, 'unter 77,47 € keine Stempelsteuer');
});

test('FatturaPA ordinario: 22 % Imposta korrekt gerundet; EU-B2B Reverse Charge N2.1; OSS-Verbraucher ohne Vorschlag', () => {
  const ord = { ...seller, regime: 'RF01' as const };
  const it = base({ seller: ord, buyer: { country: 'IT', vatId: '01234567897', fiscalCode: null, name: 'Rossi Srl', address: 'Via Po 2', cap: '10121', city: 'Torino', province: 'TO' }, codiceDestinatario: '0000000', tax: { rate: 22, nature: null, law: null }, lines: [{ description: 'x', quantity: 3, unitMinor: 3333 }] });
  const t = totals(it);
  assert.deepEqual([t.taxable, t.tax, t.total], [9999, 2200, 12199]);
  assert.ok(buildFatturaPA(it).includes('<Imposta>22.00</Imposta><EsigibilitaIVA>I</EsigibilitaIVA>'));
  const rc = proposeItalianTax('RF01', { country: 'DE', type: 'B2B', vatId: 'DE123456789' });
  assert.equal(rc.proposal && rc.nature, 'N2.1');
  assert.ok(rc.proposal && rc.requiresAdvisorApproval);
  const oss = proposeItalianTax('RF01', { country: 'FR', type: 'B2C', vatId: null });
  assert.equal(oss.proposal, false, 'kein Platzhalter-Steuersatz für OSS-Fälle');
  const ff = proposeItalianTax('RF19', { country: 'IT', type: 'B2C', vatId: null });
  assert.deepEqual(ff.proposal ? [ff.rate, ff.nature] : null, [0, 'N2.2']);
});

test('FatturaPA-Validierung verweigert ungültige Dateien statt Platzhalter', () => {
  assert.deepEqual(validateFatturaPA(base()), []);
  const bad = validateFatturaPA(base({ seller: { ...seller, vatId: '123', cap: '2012' }, tax: { rate: 0, nature: null, law: null }, codiceDestinatario: 'ABC' }));
  for (const m of [/11 Ziffern/, /CAP muss 5 Ziffern/, /Natura/, /7 Zeichen/]) assert.ok(bad.some((x) => m.test(x)), String(m));
  assert.ok(validateFatturaPA(base({ tax: { rate: 22, nature: null, law: null } })).some((x) => /forfettario/.test(x)));
  assert.throws(() => buildFatturaPA(base({ seller: { ...seller, vatId: null } })), /FATTURAPA_INVALID/);
  assert.deepEqual(splitAddress('Teststraße 1, 10115 Berlin'), { street: 'Teststraße 1', cap: '10115', city: 'Berlin' });
  assert.equal(splitAddress('irgendwo'), null);
});

test('Beleg → FatturaPA: ohne Verkäuferdaten Liste fehlender Angaben; mit Daten gültiges Test-XML', () => {
  const { ctx: noVat } = makeCtx();
  toDelivered(noVat);
  autopilotTick(noVat);
  const inv0 = noVat.db.get<{ invoice_id: string; invoice_number: string; kind: string; created_at: string; buyer_json: string; lines_json: string; test_mode: number }>('SELECT invoice_id, invoice_number, kind, created_at, buyer_json, lines_json, test_mode FROM invoices LIMIT 1');
  const r0 = inv0 ? fatturaInputFromInvoice(inv0, { name: seller.name, vatId: seller.vatId, fiscalCode: null, address: seller.address, cap: seller.cap, city: seller.city, province: 'MI', regime: 'RF19' }, 'abc12') : null;
  assert.ok(r0 && !r0.ok && r0.missing.some((m) => /USt-IdNr\. des ausländischen Unternehmens/.test(m)), 'fehlende Käufer-USt-IdNr. wird gemeldet');
  const { ctx } = makeCtx();
  toDelivered(ctx, undefined, { name: 'Test GmbH', address: 'Teststraße 1, 10115 Berlin', country: 'DE', type: 'B2B', vatId: 'DE123456789' });
  autopilotTick(ctx);
  const inv = ctx.db.get<{ invoice_id: string; invoice_number: string; kind: string; created_at: string; buyer_json: string; lines_json: string; test_mode: number }>('SELECT invoice_id, invoice_number, kind, created_at, buyer_json, lines_json, test_mode FROM invoices LIMIT 1');
  assert.ok(inv);
  const none = fatturaInputFromInvoice(inv, { name: null, vatId: null, fiscalCode: null, address: null, cap: null, city: null, province: null, regime: null }, 'abc12');
  assert.equal(none.ok, false);
  if (!none.ok) assert.ok(none.missing.some((m) => /Partita IVA/.test(m)) && none.missing.some((m) => /Steuerregime/.test(m)));
  const ok = fatturaInputFromInvoice(inv, { name: seller.name, vatId: seller.vatId, fiscalCode: null, address: seller.address, cap: seller.cap, city: seller.city, province: 'MI', regime: 'RF19' }, 'abc12');
  assert.equal(ok.ok, true);
  if (ok.ok) {
    const x = buildFatturaPA(ok.input);
    assert.match(x, /TESTBELEG - NICHT AN DAS SDI UEBERMITTELN/);
    assert.match(x, /von der Steuerberatung zu pruefen/);
    assert.doesNotMatch(x, /b2b-calc/);
  }
});

test('HTTP: Sitzland in den Einstellungen speichern; FatturaPA-Export nennt fehlende Angaben (409)', async () => {
  const PASSWORD = `pw-${randomToken(12)}`;
  const { ctx } = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } });
  toDelivered(ctx);
  autopilotTick(ctx);
  const { server, base: url } = await serve(ctx);
  try {
    const c = new Client(url);
    await c.post('/auth/login', { password: PASSWORD });
    const set = await c.get('/dashboard/einstellungen');
    assert.match(set.text, /Sitzland festlegen \(LA-01\)/);
    const r = await c.post('/admin/business/seat', { _csrf: csrfFrom(set.text), country: 'IT', _back: '/dashboard/einstellungen#freigaben' });
    assert.match(decodeURIComponent(r.location ?? ''), /Sitzland gespeichert/);
    assert.equal(businessProfile(ctx).seat_country, 'IT');
    const fin = await c.get('/dashboard/finanzen?modus=test');
    const link = /href="(\/admin\/invoices\/inv_[a-f0-9]+\/fatturapa)"/.exec(fin.text)?.[1];
    assert.ok(link, 'FatturaPA-Link bei Sitz Italien');
    const x = await c.get(link ?? '');
    assert.equal(x.status, 409);
    assert.match(x.text, /Partita IVA/);
    assert.match(x.text, /keine Datei mit Platzhaltern/);
    assert.equal((await new Client(url).get(link ?? '')).status, 303, 'nur Eigentümer');
  } finally {
    server.close();
  }
});
