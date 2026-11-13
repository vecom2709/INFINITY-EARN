import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as W from '../../../products/mini-ww/src/index.ts';
import type { Ctx, Store } from '../../../products/mini-ww/src/index.ts';

/** Pilot P1 – Fachlogik der Mini-Warenwirtschaft: durchgängiger Ablauf und alle Pflicht-Fehlerfälle aus PILOT_FACHSOFTWARE.md. */

const at = (d: string): Date => new Date(`${d}T10:00:00Z`);
const owner = (d = '2026-11-13'): Ctx => ({ userId: 'u1', now: at(d) });
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof W.DomainError) return e.code;
    throw e;
  }
  return 'KEIN_FEHLER';
};

/** Grundbestand: 2 Artikel (22 % und 10 %), Wareneingang, 1 Kunde. */
function setup(): { s: Store; schraube: string; buch: string; kunde: string } {
  let s = W.emptyStore('Ferramenta Rossi');
  const a = W.addArticle(s, owner(), { sku: 'SCH-100', name: 'Schraube 100er-Pack', unit: 'Pack', priceMinor: 1250, costMinor: 700, taxRateId: 'std' });
  s = a.store;
  const b = W.addArticle(s, owner(), { sku: 'BUCH-1', name: 'Handbuch', priceMinor: 2000, costMinor: 1200, taxRateId: 'red' });
  s = b.store;
  s = W.receive(s, owner(), { articleId: a.result.id, qty: 50 }).store;
  s = W.receive(s, owner(), { articleId: b.result.id, qty: 5 }).store;
  const k = W.addCustomer(s, owner(), { name: 'Bau GmbH', email: 'einkauf@bau.example' });
  return { s: k.store, schraube: a.result.id, buch: b.result.id, kunde: k.result.id };
}

test('Durchgängiger Ablauf: Angebot → Annahme → Auftrag → Teil- und Restlieferung → Rechnung → Zahlung → ausgeglichen', () => {
  const init = setup();
  let s = init.s;
  const { schraube, buch, kunde } = init;
  const q = W.createQuote(s, owner(), { customerId: kunde, lines: [{ articleId: schraube, qty: 10 }, { articleId: buch, qty: 2 }] });
  s = q.store;
  assert.equal(q.result.number, null, 'Entwurf hat noch keine Nummer');
  s = W.sendQuote(s, owner(), q.result.id).store;
  const o = W.acceptQuote(s, owner(), q.result.id);
  s = o.store;
  assert.equal(o.result.number, 'AU-00001');
  assert.deepEqual(W.stockOf(s, schraube), { onHand: 50, reserved: 10, available: 40 }, 'Reservierung bei Auftrag');
  const d1 = W.deliver(s, owner(), { orderId: o.result.id, lines: [{ articleId: schraube, qty: 6 }], clientRef: 'LS-A' });
  s = d1.store;
  assert.equal(W.order(s, o.result.id).status, 'PARTIAL');
  const d2 = W.deliver(s, owner(), { orderId: o.result.id, lines: [{ articleId: schraube, qty: 4 }, { articleId: buch, qty: 2 }], clientRef: 'LS-B' });
  s = d2.store;
  assert.equal(W.order(s, o.result.id).status, 'DELIVERED');
  assert.deepEqual(W.stockOf(s, schraube), { onHand: 40, reserved: 0, available: 40 }, 'Warenausgang bucht ab und löst Reservierung');
  const inv = W.draftInvoice(s, owner(), [d1.result.id, d2.result.id]);
  s = inv.store;
  // 10 × 12,50 = 125,00 (22 %) + 2 × 20,00 = 40,00 (10 %) → Steuer 27,50 + 4,00
  assert.deepEqual(inv.result.totals, { netMinor: 16500, taxMinor: 3150, grossMinor: 19650, byRate: [{ bps: 1000, netMinor: 4000, taxMinor: 400 }, { bps: 2200, netMinor: 12500, taxMinor: 2750 }] });
  const fin = W.finalize(s, owner(), inv.result.id);
  s = fin.store;
  assert.equal(fin.result.number, 'RE-00001');
  assert.equal(fin.result.dueDate, '2026-11-27', 'Zahlungsziel 14 Tage');
  s = W.recordPayment(s, owner(), { invoiceId: inv.result.id, amountMinor: 10000 }).store;
  assert.equal(W.openAmount(s, inv.result.id), 9650);
  s = W.recordPayment(s, owner(), { invoiceId: inv.result.id, amountMinor: 9650 }).store;
  assert.equal(W.openItems(s, '2026-12-31').length, 0, 'ausgeglichen');
  assert.deepEqual(W.revenue(s, '2026-11-01', '2026-11-30'), { netMinor: 16500, taxMinor: 3150, grossMinor: 19650, invoices: 1, credits: 0 });
  assert.equal(W.stockReport(s).totalValueMinor, 40 * 700 + 3 * 1200, 'Lagerwert zum Einkaufspreis');
  assert.deepEqual(W.verifyStore(s), [], 'alle Invarianten erfüllt');
});

test('Negativer Bestand ist unmöglich – und ein abgelehnter Vorgang ändert nichts (atomar)', () => {
  const { s, schraube, buch, kunde } = setup();
  const before = JSON.stringify(s);
  assert.equal(code(() => W.createOrder(s, owner(), { customerId: kunde, lines: [{ articleId: schraube, qty: 10 }, { articleId: buch, qty: 6 }] })), 'INSUFFICIENT_STOCK');
  assert.equal(JSON.stringify(s), before, 'auch die gültige erste Position wurde nicht reserviert');
  assert.equal(code(() => W.adjust(s, owner(), { articleId: buch, delta: -6, reason: 'Inventur' })), 'NEGATIVE_STOCK');
  const o = W.createOrder(s, owner(), { customerId: kunde, lines: [{ articleId: buch, qty: 4 }] });
  assert.equal(code(() => W.adjust(o.store, owner(), { articleId: buch, delta: -2, reason: 'Bruch' })), 'BELOW_RESERVED', 'reservierte Ware kann nicht weggebucht werden');
  assert.equal(code(() => W.receive(s, owner(), { articleId: buch, qty: 0 })), 'INVALID_QUANTITY');
  assert.equal(code(() => W.receive(s, owner(), { articleId: buch, qty: 1.5 })), 'INVALID_QUANTITY');
});

test('Doppelte Buchungen werden erkannt: gleiche Lieferung, Überlieferung, doppelt abgerechnet', () => {
  const init = setup();
  let s = init.s;
  const { schraube, kunde } = init;
  const o = W.createOrder(s, owner(), { customerId: kunde, lines: [{ articleId: schraube, qty: 5 }] });
  s = o.store;
  const d = W.deliver(s, owner(), { orderId: o.result.id, lines: [{ articleId: schraube, qty: 3 }], clientRef: 'SCAN-77' });
  s = d.store;
  assert.equal(code(() => W.deliver(s, owner(), { orderId: o.result.id, lines: [{ articleId: schraube, qty: 1 }], clientRef: 'SCAN-77' })), 'DUPLICATE_BOOKING');
  assert.equal(code(() => W.deliver(s, owner(), { orderId: o.result.id, lines: [{ articleId: schraube, qty: 3 }], clientRef: 'SCAN-78' })), 'OVER_DELIVERY');
  s = W.draftInvoice(s, owner(), [d.result.id]).store;
  assert.equal(code(() => W.draftInvoice(s, owner(), [d.result.id])), 'ALREADY_INVOICED');
  assert.equal(code(() => W.createOrder(s, owner(), { customerId: kunde, lines: [{ articleId: schraube, qty: 1 }, { articleId: schraube, qty: 2 }] })), 'DUPLICATE_LINE');
});

test('Gutschrift statt Storno: gleicht offene Posten aus, nimmt Ware zurück, nie mehr als berechnet', () => {
  const init = setup();
  let s = init.s;
  const { schraube, kunde } = init;
  const o = W.createOrder(s, owner(), { customerId: kunde, lines: [{ articleId: schraube, qty: 4 }] });
  s = o.store;
  const d = W.deliver(s, owner(), { orderId: o.result.id, lines: [{ articleId: schraube, qty: 4 }], clientRef: 'L1' });
  s = d.store;
  const inv = W.draftInvoice(s, owner(), [d.result.id]);
  s = W.finalize(inv.store, owner(), inv.result.id).store;
  assert.equal(code(() => W.discardDraft(s, owner(), inv.result.id)), 'IMMUTABLE', 'festgeschriebene Rechnung bleibt');
  s = W.recordPayment(s, owner(), { invoiceId: inv.result.id, amountMinor: 6100 }).store; // 4 × 12,50 + 22 % = 61,00
  assert.equal(W.openAmount(s, inv.result.id), 0);
  const cn = W.createCreditNote(s, owner(), { invoiceId: inv.result.id, lines: [{ articleId: schraube, qty: 1 }], reason: 'Pack beschädigt', restock: true });
  s = cn.store;
  assert.equal(code(() => W.createCreditNote(s, owner(), { invoiceId: inv.result.id, lines: [{ articleId: schraube, qty: 4 }], reason: 'zu viel', restock: false })), 'OVER_CREDIT', 'Entwurf zählt mit');
  const fc = W.finalize(s, owner(), cn.result.id);
  s = fc.store;
  assert.equal(fc.result.number, 'GU-00001', 'eigener Nummernkreis');
  assert.equal(W.openAmount(s, inv.result.id), -1525, 'Guthaben des Kunden: Erstattung fällig');
  assert.equal(W.openItemsReport(s, '2026-12-31').customerCreditMinor, 1525);
  assert.equal(W.stockOf(s, schraube).onHand, 47, 'Rücknahme ins Lager');
  assert.deepEqual(W.revenue(s, '2026-11-01', '2026-11-30').grossMinor, 6100 - 1525);
  assert.equal(code(() => W.recordPayment(s, owner(), { invoiceId: inv.result.id, amountMinor: 1 })), 'OVERPAYMENT');
  assert.deepEqual(W.verifyStore(s), []);
});

test('Rollen: Mitarbeiter dürfen nicht festschreiben, korrigieren, gutschreiben oder Einstellungen ändern', () => {
  const init = setup();
  let s = init.s;
  const { schraube, kunde } = init;
  const u = W.addUser(s, owner(), { name: 'Luca', role: 'STAFF' });
  s = u.store;
  const staff: Ctx = { userId: u.result.id, now: at('2026-11-13') };
  const o = W.createOrder(s, staff, { customerId: kunde, lines: [{ articleId: schraube, qty: 2 }] });
  s = o.store;
  const d = W.deliver(s, staff, { orderId: o.result.id, lines: [{ articleId: schraube, qty: 2 }], clientRef: 'M1' });
  const inv = W.draftInvoice(d.store, staff, [d.result.id]);
  s = inv.store;
  assert.equal(code(() => W.finalize(s, staff, inv.result.id)), 'FORBIDDEN');
  assert.equal(code(() => W.adjust(s, staff, { articleId: schraube, delta: -1, reason: 'Bruch' })), 'FORBIDDEN');
  assert.equal(code(() => W.updateSettings(s, staff, { paymentTermDays: 30 })), 'FORBIDDEN');
  assert.equal(code(() => W.addUser(s, staff, { name: 'X', role: 'OWNER' })), 'FORBIDDEN');
  s = W.finalize(s, owner(), inv.result.id).store;
  assert.equal(code(() => W.createCreditNote(s, staff, { invoiceId: inv.result.id, lines: [{ articleId: schraube, qty: 1 }], reason: 'Test', restock: false })), 'FORBIDDEN');
  assert.equal(code(() => W.finalize(s, { userId: 'unbekannt', now: at('2026-11-13') }, inv.result.id)), 'UNKNOWN_USER');
});

test('Korrekturbuchungen brauchen einen Grund und bleiben im Journal nachvollziehbar', () => {
  const init = setup();
  let s = init.s;
  const { schraube } = init;
  assert.equal(code(() => W.adjust(s, owner(), { articleId: schraube, delta: -2, reason: '' })), 'REASON_REQUIRED');
  s = W.adjust(s, owner(), { articleId: schraube, delta: -2, reason: 'Inventur 13.11.' }).store;
  const h = W.movementHistory(s, schraube);
  assert.deepEqual(h.map((m) => [m.type, m.qty, m.onHandAfter]), [['RECEIPT', 50, 50], ['ADJUST', -2, 48]]);
  assert.equal(h[1]?.reason, 'Inventur 13.11.');
  assert.ok(s.audit.some((a) => a.action === 'stock.adjusted' && a.userId === 'u1'));
});

test('Nummernkreise lückenlos: verworfene Entwürfe kosten keine Nummer, nach Wiederherstellung geht es nahtlos weiter', () => {
  const init = setup();
  let s = init.s;
  const { schraube, kunde } = init;
  const mk = (ref: string): string => {
    const o = W.createOrder(s, owner(), { customerId: kunde, lines: [{ articleId: schraube, qty: 1 }] });
    const d = W.deliver(o.store, owner(), { orderId: o.result.id, lines: [{ articleId: schraube, qty: 1 }], clientRef: ref });
    s = d.store;
    return d.result.id;
  };
  const dA = mk('A');
  const first = W.draftInvoice(s, owner(), [dA]);
  s = W.discardDraft(first.store, owner(), first.result.id).store;
  const dB = mk('B');
  const second = W.draftInvoice(s, owner(), [dB]);
  const f2 = W.finalize(second.store, owner(), second.result.id);
  s = f2.store;
  assert.equal(f2.result.number, 'RE-00001', 'verworfener Entwurf hat keine Nummer verbraucht');
  const restored = W.restoreBackup(W.exportBackup(s));
  const third = W.draftInvoice(restored, owner(), [restored.deliveries[0]?.id ?? '']);
  const f3 = W.finalize(third.store, owner(), third.result.id);
  assert.equal(f3.result.number, 'RE-00002');
  assert.deepEqual(W.verifyStore(f3.store), []);
});

test('Sicherung: Rundreise ohne Verlust; beschädigte, fremde oder manipulierte Sicherungen werden abgelehnt', () => {
  const init = setup();
  let s = init.s;
  const { schraube, kunde } = init;
  s = W.createOrder(s, owner(), { customerId: kunde, lines: [{ articleId: schraube, qty: 3 }] }).store;
  const backup = W.exportBackup(s);
  const back = W.restoreBackup(backup);
  assert.deepEqual(back, s);
  assert.deepEqual(W.stockReport(back), W.stockReport(s), 'identische Berichte');
  assert.equal(code(() => W.restoreBackup(backup.replace('"qty":50', '"qty":5000'))), 'BACKUP_CORRUPT');
  assert.equal(code(() => W.restoreBackup('{"hallo":1}')), 'BACKUP_INVALID');
  assert.equal(code(() => W.restoreBackup('kein json')), 'BACKUP_INVALID');
  // Manipulation mit neu berechneter Prüfsumme: Bestand passt nicht mehr zum Journal → abgelehnt
  const evil = structuredClone(s);
  evil.movements = evil.movements.filter((m) => m.type !== 'RECEIPT' || m.articleId !== schraube);
  assert.equal(code(() => W.restoreBackup(JSON.stringify({ format: 'mini-ww-backup', schema: 1, checksum: W.fnv1a(JSON.stringify(evil)), store: evil }))), 'BACKUP_INCONSISTENT');
});

test('CSV: Import alles-oder-nichts mit Zeilenfehlern, Export Excel-tauglich und sicher gegen Formel-Injektion', () => {
  let { s } = setup();
  const bad = 'Artikelnummer;Bezeichnung;Einheit;Verkaufspreis;Einkaufspreis;Steuersatz\nA-1;Hammer;Stk;19,90;9,50;std\nSCH-100;Doppelt;Stk;1;1;std\nA-2;Zange;Stk;abc;;std\n';
  const err = code(() => W.importArticlesCsv(s, owner(), bad));
  assert.equal(err, 'CSV_ROWS');
  try { W.importArticlesCsv(s, owner(), bad); } catch (e) { assert.match((e as Error).message, /Zeile 3: Artikelnummer SCH-100 gibt es bereits.*Zeile 4: Verkaufspreis/); }
  assert.equal(s.articles.length, 2, 'nichts übernommen');
  const ok = W.importArticlesCsv(s, owner(), '\uFEFFArtikelnummer;Bezeichnung;Einheit;Verkaufspreis;Einkaufspreis;Steuersatz\r\nA-1;"Hammer; 500 g";Stk;19,90;9,50;std\r\nA-2;Zange;Stk;7.5;;red\r\n');
  s = ok.store;
  assert.equal(ok.result.imported, 2);
  assert.equal(s.articles.find((a) => a.sku === 'A-1')?.name, 'Hammer; 500 g');
  assert.equal(s.articles.find((a) => a.sku === 'A-2')?.priceMinor, 750);
  s = W.addCustomer(s, owner(), { name: '=HYPERLINK("http://böse")' }).store;
  const csv = W.exportCsv(s, 'customers');
  assert.match(csv, /'=HYPERLINK/, 'Formel wird entschärft');
  const parsed = W.parseCsv(W.exportCsv(s, 'articles'));
  assert.deepEqual(parsed[0], ['Artikelnummer', 'Bezeichnung', 'Einheit', 'Verkaufspreis', 'Einkaufspreis', 'Steuersatz', 'Bestand', 'Reserviert']);
  assert.deepEqual(parsed.find((r) => r[0] === 'SCH-100')?.slice(3), ['12,50', '7,00', 'std', '50', '0']);
  assert.equal(code(() => W.importArticlesCsv(s, owner(), 'falsch;kopf\n')), 'CSV_HEADER');
});

test('Angebote: Ablauf erzwungen, abgelaufene Angebote nicht annehmbar, festgeschriebene Inhalte bleiben', () => {
  const init = setup();
  let s = init.s;
  const { schraube, kunde } = init;
  const q = W.createQuote(s, owner(), { customerId: kunde, lines: [{ articleId: schraube, qty: 1 }], validDays: 10 });
  s = q.store;
  assert.equal(code(() => W.acceptQuote(s, owner(), q.result.id)), 'INVALID_STATE', 'erst versenden');
  s = W.sendQuote(s, owner(), q.result.id).store;
  assert.equal(code(() => W.sendQuote(s, owner(), q.result.id)), 'INVALID_STATE');
  assert.equal(code(() => W.acceptQuote(s, owner('2026-11-24'), q.result.id)), 'QUOTE_EXPIRED');
  s = W.acceptQuote(s, owner('2026-11-23'), q.result.id).store;
  assert.equal(code(() => W.acceptQuote(s, owner(), q.result.id)), 'INVALID_STATE', 'nicht zweimal');
  assert.equal(code(() => W.createQuote(s, owner(), { customerId: 'nope', lines: [{ articleId: schraube, qty: 1 }] })), 'CUSTOMER_NOT_FOUND');
});

test('Mahnstufen nach Fälligkeit; Steuerrundung je Steuersatz kaufmännisch', () => {
  const { s } = setup();
  assert.equal(W.dunningLevel(s, '2026-11-27', '2026-11-27'), 0);
  assert.equal(W.dunningLevel(s, '2026-11-27', '2026-12-04'), 1);
  assert.equal(W.dunningLevel(s, '2026-11-27', '2026-12-18'), 2);
  assert.equal(W.dunningLevel(s, '2026-11-27', '2027-01-01'), 3);
  // 3 × 0,15 € = 0,45 € × 22 % = 0,099 → 0,10 €; 1 × 0,05 € × 10 % = 0,005 → 0,01 €
  const t = W.computeTotals([{ articleId: 'a', name: 'a', qty: 3, priceMinor: 15, taxBps: 2200 }, { articleId: 'b', name: 'b', qty: 1, priceMinor: 5, taxBps: 1000 }]);
  assert.deepEqual([t.netMinor, t.taxMinor, t.grossMinor], [50, 11, 61]);
  assert.equal(W.formatMoney(123456789), '1.234.567,89 €');
  assert.equal(W.formatMoney(-1525), '-15,25 €');
});

test('Fachlogik läuft ohne Node: keine node:-Importe, keine Netz- oder Dateizugriffe (für das Offline-Programm im Browser)', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = 'products/mini-ww/src';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const src = readFileSync(`${dir}/${f}`, 'utf8');
    assert.doesNotMatch(src, /from 'node:|require\(|fetch\(|XMLHttpRequest|localStorage|process\./, f);
  }
});

test('Stammdaten: eindeutige Artikelnummern, gültige E-Mail, Steuersatz in Benutzung nicht löschbar', () => {
  const { s } = setup();
  assert.equal(code(() => W.addArticle(s, owner(), { sku: 'sch-100', name: 'Doppelt', priceMinor: 1 })), 'DUPLICATE_SKU', 'Groß-/Kleinschreibung egal');
  assert.equal(code(() => W.addArticle(s, owner(), { sku: 'X 1', name: 'Leerzeichen', priceMinor: 1 })), 'INVALID_SKU');
  assert.equal(code(() => W.addArticle(s, owner(), { sku: 'X-1', name: 'Negativ', priceMinor: -1 })), 'INVALID_AMOUNT');
  assert.equal(code(() => W.addCustomer(s, owner(), { name: 'A', email: 'kein-mail' })), 'INVALID_EMAIL');
  assert.equal(code(() => W.updateSettings(s, owner(), { taxRates: [{ id: 'std', label: '22 %', bps: 2200 }] })), 'TAX_RATE_IN_USE');
  assert.equal(code(() => W.updateSettings(s, owner(), { dunningDays: [10, 5, 20] })), 'INVALID_DUNNING');
  const k2 = W.addCustomer(s, owner(), { name: 'Zweiter Kunde' });
  assert.equal(k2.result.number, 'K-0002');
});
