import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { formatMinor, marginBps, priceFromCost, toMinor } from '../../packages/contracts/src/money.ts';
import { CONTRACT_SCHEMAS, validate } from '../../packages/contracts/src/schemas.ts';
import { ALL_STATES, canTransition, PIPELINE_STATES } from '../../packages/contracts/src/states.ts';
import { containsSecret, redact } from '../../packages/events/src/redact.ts';
import { log, setLogSink } from '../../packages/events/src/logger.ts';
import { ConfigError } from '../../services/core-api/src/config.ts';
import { checkOutputFormat, resolveTaxContext } from '../../services/finance/src/tax.ts';
import { signPayload, verifySignature } from '../../services/finance/src/webhook.ts';
import { b2bCalcCsv } from '../../services/product-factory/src/capabilities/b2b-calc-csv.ts';
import { parseCsv } from '../../services/product-factory/src/csv.ts';
import { calcScope, makeConfig } from '../helpers.ts';

test('IE-030 ungewöhnliche Währung: korrekte Minor-Units statt Rundungsfehler', () => {
  assert.equal(toMinor('0.1', 'EUR') + toMinor('0.2', 'EUR'), toMinor('0.3', 'EUR'));
  assert.equal(toMinor('1500', 'JPY'), 1500);
  assert.equal(toMinor('1.234', 'KWD'), 1234);
  assert.equal(formatMinor(1234, 'KWD'), '1.234');
  assert.equal(formatMinor(-5, 'EUR'), '-0.05');
  assert.throws(() => toMinor('1.5', 'JPY'), /TOO_MANY_DECIMALS/);
  assert.throws(() => toMinor('1.00', 'XYZ'), /UNSUPPORTED_CURRENCY/);
});

test('IE-023 rentabler Auftrag: Preis aus Kosten + Marge hergeleitet', () => {
  const price = priceFromCost(3700, 3000);
  assert.equal(price, 5286);
  assert.ok(marginBps(price, 3700) >= 3000);
  assert.ok(marginBps(price - 1, 3700) < 3000, 'kleinster Preis mit Mindestmarge');
});

test('Zustandsmaschine: nur definierte Übergänge, Zahlung nur durch Provider', () => {
  for (let i = 0; i < PIPELINE_STATES.length - 1; i++) {
    const from = PIPELINE_STATES[i] as (typeof PIPELINE_STATES)[number];
    const to = PIPELINE_STATES[i + 1] as (typeof PIPELINE_STATES)[number];
    const actor = to === 'PAYMENT_CONFIRMED' ? 'provider' : 'system';
    assert.ok(canTransition(from, to, actor).ok, `${from}->${to}`);
  }
  assert.equal(canTransition('CUSTOMER_ACCEPTED', 'PAYMENT_CONFIRMED', 'system').ok, false);
  assert.equal(canTransition('CUSTOMER_ACCEPTED', 'PAYMENT_CONFIRMED', 'ai').ok, false);
  assert.equal(canTransition('QUOTED', 'DELIVERED', 'system').ok, false);
  assert.equal(canTransition('CLOSED', 'QUOTED', 'owner').ok, false);
  assert.equal(canTransition('MANUAL_REVIEW', 'QUALIFIED', 'ai').ok, false);
  assert.equal(canTransition('MANUAL_REVIEW', 'QUALIFIED', 'owner').ok, true);
  assert.equal(ALL_STATES.length, 28);
});

test('Verträge: TS-Schemas sind identisch mit packages/contracts/schemas/*.json', () => {
  for (const [name, schema] of Object.entries(CONTRACT_SCHEMAS)) {
    const file = JSON.parse(readFileSync(`packages/contracts/schemas/${name}.schema.json`, 'utf8')) as unknown;
    assert.deepEqual(schema, file, name);
  }
  assert.deepEqual(validate(CONTRACT_SCHEMAS.quote, { quote_id: 'q', lead_id: 'l', description: 'd', gross_total_minor: -1, currency: 'eur', scope: 's', accepted: false }).length, 2);
});

test('IE-032 gefälschte Webhook-Signatur: Event abgelehnt', () => {
  const now = 1_800_000_000;
  const body = '{"id":"evt_x"}';
  assert.equal(verifySignature('whsec_a', body, signPayload('whsec_a', body, now), now).ok, true);
  assert.deepEqual(verifySignature('whsec_a', body, signPayload('whsec_b', body, now), now), { ok: false, reason: 'SIGNATURE_INVALID' });
  assert.deepEqual(verifySignature('whsec_a', body + ' ', signPayload('whsec_a', body, now), now), { ok: false, reason: 'SIGNATURE_INVALID' });
  assert.equal(verifySignature('whsec_a', body, undefined, now).ok, false);
  assert.equal(verifySignature('whsec_a', body, 't=abc,v1=zz', now).ok, false);
});

test('IE-084 Webhook-Replay außerhalb der Toleranz: verworfen', () => {
  const now = 1_800_000_000;
  const sig = signPayload('whsec_a', '{}', now - 301);
  assert.deepEqual(verifySignature('whsec_a', '{}', sig, now), { ok: false, reason: 'TIMESTAMP_OUT_OF_TOLERANCE' });
});

test('IE-085 Secret im Debuglog: redigiert', () => {
  const lines: string[] = [];
  setLogSink((l) => lines.push(l));
  log('debug', 'payment', { stripe_key: 'sk_test_abcdefghijklmnop', note: 'key sk_live_ABCDEFGHIJKLMNOP and whsec_0123456789abcdef', iban: 'DE89 3704 0044 0532 0130 00', nested: { password: 'hunter2' } });
  setLogSink(null);
  const out = lines.join('\n');
  assert.equal(containsSecret(out), false, out);
  assert.ok(!out.includes('hunter2'));
  assert.ok(!out.includes('0532'));
  assert.equal(containsSecret('Fehler mit sk_live_ABCDEFGHIJ1234'), true, 'Detektor erkennt Leck');
  assert.deepEqual(redact({ authorization: 'Bearer abc', ok: 'x' }), { authorization: '[REDACTED]', ok: 'x' });
  const fakeHash = ['scrypt', '16384', '8', '1', 'c2FsdHNhbHQ', 'aGFzaGhhc2hoYXNoaGFzaGhhc2g'].join('$');
  assert.equal(containsSecret(`OWNER_PASSWORD_HASH=${fakeHash}`), true);
});

test('IE-040 verschiedene Test-/Live-Keys: Live-Key oder Live-Modus verweigert den Start', () => {
  assert.throws(() => makeConfig({ STRIPE_SECRET_KEY: 'sk_live_0123456789abcdef' }), ConfigError);
  assert.throws(() => makeConfig({ ENVIRONMENT: 'live' }), ConfigError);
  assert.throws(() => makeConfig({ LIVE_SALES_ENABLED: 'true' }), ConfigError);
  assert.throws(() => makeConfig({ PAYMENT_PROVIDER: 'stripe' }), ConfigError);
  assert.equal(makeConfig({ STRIPE_SECRET_KEY: 'sk_test_0123456789abcdef' }).payment.stripeKeyMode, 'test');
});

test('IE-066 Steuerkontext unklar: keine pauschale USt-Berechnung', () => {
  const r = resolveTaxContext({ sellerCountry: null, buyerCountry: 'DE', buyerType: 'B2B', buyerVatId: null, jurisdictionConfigured: false, sdiChannelConfigured: false, testMode: false });
  assert.equal(r.status, 'REVIEW');
  const t = resolveTaxContext({ sellerCountry: null, buyerCountry: 'DE', buyerType: 'B2B', buyerVatId: null, jurisdictionConfigured: false, sdiChannelConfigured: false, testMode: true });
  assert.equal(t.status, 'TEST_NO_TAX');
  const configured = resolveTaxContext({ sellerCountry: 'DE', buyerCountry: 'DE', buyerType: 'B2B', buyerVatId: null, jurisdictionConfigured: true, sdiChannelConfigured: false, testMode: false });
  assert.equal(configured.status, 'REVIEW', 'ohne fachlich freigegebene Regel nie automatische USt');
});

test('IE-065 PDF allein bei erforderlichem XML: Blockade', () => {
  assert.deepEqual(checkOutputFormat('XML_FATTURAPA', ['PDF']), { ok: false, reason: 'XML_REQUIRED_PDF_INSUFFICIENT' });
  assert.equal(checkOutputFormat('XML_FATTURAPA', ['PDF', 'XML_FATTURAPA']).ok, true);
  assert.equal(checkOutputFormat('NONE', ['PDF']).ok, true);
});

test('IE-057 falsches Dateiformat: QA-Fail', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]);
  const r = b2bCalcCsv.runQa(png, calcScope());
  assert.ok(r.some((c) => !c.passed));
  const wrongCsv = new TextEncoder().encode('a,b\r\n1,2\r\n');
  assert.equal(b2bCalcCsv.runQa(wrongCsv, calcScope()).find((c) => c.check === 'format')?.passed, false);
});

test('IE-046 Produktgeneration innerhalb Limits: deterministisches, QA-bestandenes Artefakt', () => {
  const scope = calcScope({ items: [{ name: '=SUM(A1:A9)', quantity: 2, unit_cost_minor: 1050 }, { name: 'Zeile, mit "Komma"', quantity: 1, unit_cost_minor: 1 }] });
  const a = b2bCalcCsv.generate(scope);
  const b = b2bCalcCsv.generate(scope);
  assert.deepEqual(a, b);
  const qa = b2bCalcCsv.runQa(a, scope);
  assert.ok(qa.every((c) => c.passed), JSON.stringify(qa));
  const rows = parseCsv(new TextDecoder().decode(a));
  assert.equal(rows[2]?.[0], "'=SUM(A1:A9)", 'Formel-Injection neutralisiert');
  assert.equal(rows[3]?.[0], 'Zeile, mit "Komma"');
  assert.equal(rows[rows.length - 2]?.[3], '25.22', '2101 + aufgerundete 20 % (421) = 2522');
});
