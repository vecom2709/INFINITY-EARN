import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZip, readZip } from '../../../packages/shared/src/zip.ts';
import { autopilotTick } from '../../../services/core-api/src/autopilot.ts';
import { b2bCalcXlsx, formulas, layout, readCells, XLSX_FILES, xmlText } from '../../../services/product-factory/src/capabilities/b2b-calc-xlsx.ts';
import { computeTotals, type CalcInput } from '../../../services/product-factory/src/capabilities/b2b-calc-csv.ts';
import { downloadArtifact, getDeliveryByOrder, issueDownloadToken } from '../../../services/product-factory/src/delivery.ts';
import { acceptanceGate, standardGaps } from '../../../services/product-factory/src/quality-standard.ts';
import { routeCapability } from '../../../services/product-factory/src/registry.ts';
import { evaluateSheet } from '../../../services/product-factory/src/sheet-eval.ts';
import { inbound, makeCtx, toPaid } from '../../helpers.ts';

/**
 * 17.0 Excel-Kalkulation (XLSX) mit lebenden Formeln. Geprüft wird ohne installierte Programme: Die Formeln der Datei
 * wertet die eigene Rechenmaschine aus (sheet-eval.ts). Referenz: Dieselbe Datei wurde am 16.11.2026 einmalig in
 * Microsoft Excel 16 geöffnet – die dort abgelesenen Werte stehen unten als feste Vergleichswerte.
 */
const INPUT: CalcInput = {
  title: 'Kalkulation Büro & Montage <Test>', currency: 'EUR', margin_bps: 1750, language: 'de',
  items: [{ name: 'Montage', quantity: 10, unit_cost_minor: 4500 }, { name: '=HYPERLINK("http://boese.example")', quantity: 3, unit_cost_minor: 12050 }, { name: 'Kleinteil 0,07', quantity: 7, unit_cost_minor: 7 }],
};
const sheetOf = (bytes: Uint8Array): string => new TextDecoder().decode(readZip(bytes).find((e) => e.name === 'xl/worksheets/sheet1.xml')?.bytes);
const failed = (qa: { check: string; passed: boolean }[]): string[] => qa.filter((c) => !c.passed).map((c) => c.check);
const repack = (bytes: Uint8Array, change: (sheet: string) => string): Uint8Array =>
  createZip(readZip(bytes).map((e) => (e.name === 'xl/worksheets/sheet1.xml' ? { name: e.name, bytes: new TextEncoder().encode(change(new TextDecoder().decode(e.bytes))) } : { name: e.name, bytes: e.bytes })), { ooxml: true });

test('Arbeitsmappe: gültiger Aufbau, lebende Formeln, Abnahme bestanden, Standard-Akte vollständig', () => {
  const bytes = b2bCalcXlsx.generate(INPUT);
  assert.deepEqual(readZip(bytes).map((e) => e.name), [...XLSX_FILES]);
  assert.equal(readZip(bytes)[0]?.name, '[Content_Types].xml', 'Inhaltsverzeichnis zuerst');
  const cells = readCells(sheetOf(bytes));
  assert.equal(cells.get('D3')?.f, 'ROUND(B3*C3,2)');
  assert.equal(cells.get('D6')?.f, 'SUM(D3:D5)');
  assert.equal(cells.get('D7')?.f, 'ROUNDUP(ROUND(D6*100,0)*ROUND(C7*100,0)/10000,0)/100');
  assert.equal(cells.get('D8')?.f, 'D6+D7');
  const qa = b2bCalcXlsx.runQa(bytes, INPUT);
  assert.deepEqual(failed(qa), [], JSON.stringify(qa));
  const all = [...qa, { check: 'checksum', passed: true }];
  assert.equal(acceptanceGate('b2b-calc-xlsx', all).passed, true);
  assert.deepEqual(standardGaps(b2bCalcXlsx), []);
  assert.ok(routeCapability('b2b-calc-xlsx').ok);
});

test('Eigene Rechenmaschine liefert dieselben Werte wie Microsoft Excel 16 (Referenzmessung) – vor und nach einer Änderung', () => {
  const cells = readCells(sheetOf(b2bCalcXlsx.generate(INPUT)));
  const ev = evaluateSheet(cells);
  // Excel 16, 16.11.2026: Zwischensumme 811.99, Aufschlag 142.10, Gesamt 954.09
  assert.deepEqual([ev.get('D6'), ev.get('D7'), ev.get('D8')].map((x) => x?.toFixed(2)), ['811.99', '142.10', '954.09']);
  // Excel 16 nach Eingabe B3 = 20: Zeile 900.00, Zwischensumme 1261.99, Aufschlag 220.85, Gesamt 1482.84
  const ch = evaluateSheet(cells, { B3: 20 });
  assert.deepEqual([ch.get('D3'), ch.get('D6'), ch.get('D7'), ch.get('D8')].map((x) => x?.toFixed(2)), ['900.00', '1261.99', '220.85', '1482.84']);
  // Aufschlag ändern: 0 % und 90 %
  assert.equal(evaluateSheet(cells, { C7: 0 }).get('D8')?.toFixed(2), '811.99');
  assert.equal(evaluateSheet(cells, { C7: 90 }).get('D8')?.toFixed(2), '1542.79');
});

test('Formeln stimmen für viele Fälle mit der Fachberechnung überein (Rundung, große Beträge, Währung ohne Nachkommastellen)', () => {
  const cases: CalcInput[] = [
    { title: 'Ein Cent', currency: 'EUR', margin_bps: 1, language: 'en', items: [{ name: 'x', quantity: 1, unit_cost_minor: 1 }] },
    { title: 'Aufrunden', currency: 'EUR', margin_bps: 3333, language: 'it', items: [{ name: 'a', quantity: 3, unit_cost_minor: 3333 }, { name: 'b', quantity: 7, unit_cost_minor: 1999 }] },
    { title: 'Groß', currency: 'EUR', margin_bps: 9000, language: 'de', items: Array.from({ length: 200 }, (_, i) => ({ name: `Pos ${i}`, quantity: 1000 + i, unit_cost_minor: 99999 + i })) },
    { title: 'Yen', currency: 'JPY', margin_bps: 1250, language: 'en', items: [{ name: 'a', quantity: 3, unit_cost_minor: 1999 }, { name: 'b', quantity: 1, unit_cost_minor: 7 }] },
    { title: 'Null', currency: 'EUR', margin_bps: 0, language: 'de', items: [{ name: 'gratis', quantity: 5, unit_cost_minor: 0 }] },
  ];
  for (const input of cases) {
    const bytes = b2bCalcXlsx.generate(input);
    assert.deepEqual(failed(b2bCalcXlsx.runQa(bytes, input)), [], input.title);
    const L = layout(input);
    const ev = evaluateSheet(readCells(sheetOf(bytes)));
    const t = computeTotals(input);
    assert.equal(Math.round((ev.get(`D${L.total}`) ?? 0) * L.factor), t.total, `${input.title}: Gesamt`);
    assert.equal(Math.round((ev.get(`D${L.markup}`) ?? 0) * L.factor), t.markup, `${input.title}: Aufschlag`);
    assert.equal(formulas(input).size, input.items.length + 3);
  }
});

test('Sicherheit: Kundentexte werden nie Formeln; manipulierte Dateien fallen in der Abnahme durch', () => {
  const bytes = b2bCalcXlsx.generate(INPUT);
  const cells = readCells(sheetOf(bytes));
  assert.equal(cells.get('A4')?.s, '=HYPERLINK("http://boese.example")', 'als Text gespeichert');
  assert.equal(cells.get('A4')?.f, undefined, 'keine Formel');
  assert.equal(xmlText('a<b>&"c\u0000\u0001'), 'a&lt;b&gt;&amp;&quot;c', 'XML maskiert, Steuerzeichen entfernt');
  assert.ok(!/<!DOCTYPE|vbaProject|externalLink/.test(readZip(bytes).map((e) => `${e.name}${new TextDecoder().decode(e.bytes)}`).join('')));
  // falsches gespeichertes Ergebnis
  assert.ok(failed(b2bCalcXlsx.runQa(repack(bytes, (s) => s.replace('<v>954.09</v>', '<v>999.99</v>')), INPUT)).includes('totals'));
  // veränderte Formel
  assert.ok(failed(b2bCalcXlsx.runQa(repack(bytes, (s) => s.replace('<f>SUM(D3:D5)</f>', '<f>SUM(D3:D4)</f>')), INPUT)).includes('xlsx_formulas'));
  // eingeschleuste fremde Formel
  const injected = b2bCalcXlsx.runQa(repack(bytes, (s) => s.replace('</sheetData>', '<row r="20"><c r="A20"><f>WEBSERVICE("http://boese.example")</f><v>0</v></c></row></sheetData>')), INPUT);
  assert.ok(failed(injected).includes('xlsx_formulas') && failed(injected).includes('formula_injection'));
  // andere Menge als bestellt
  assert.ok(failed(b2bCalcXlsx.runQa(repack(bytes, (s) => s.replace('<c r="B3" s="3"><v>10</v></c>', '<c r="B3" s="3"><v>11</v></c>')), INPUT)).includes('format'));
  // zusätzliche Datei (Makro) im Paket
  const withMacro = createZip([...readZip(bytes).map((e) => ({ name: e.name, bytes: e.bytes })), { name: 'xl/vbaProject.bin', bytes: new Uint8Array([1]) }], { ooxml: true });
  assert.ok(failed(b2bCalcXlsx.runQa(withMacro, INPUT)).includes('xlsx_structure'));
  assert.throws(() => createZip([{ name: '../boese.xml', bytes: new Uint8Array() }], { ooxml: true }), /ZIP_NAME_INVALID/);
  assert.throws(() => createZip([{ name: 'xl/workbook.xml', bytes: new Uint8Array() }]), /ZIP_NAME_INVALID/, 'Ordner nur im Office-Modus');
});

test('Rechenmaschine: Klammern, Punkt vor Strich, Bereiche; Fehler bei unbekannter Funktion, Zirkelbezug und Syntax', () => {
  const c = new Map(Object.entries({ A1: { v: '2' }, A2: { v: '3.5' }, A3: { f: 'A1+A2*2' }, A4: { f: '(A1+A2)*2' }, A5: { f: 'SUM(A1:A4,10)' }, A6: { f: 'ROUND(10/3,2)' }, A7: { f: 'ROUNDUP(0.101,2)' }, A8: { f: 'ROUND(1.005,2)' } }));
  const ev = evaluateSheet(c);
  assert.deepEqual([ev.get('A3'), ev.get('A4'), ev.get('A5'), ev.get('A6'), ev.get('A7'), ev.get('A8')], [9, 11, 35.5, 3.33, 0.11, 1.01]);
  assert.throws(() => evaluateSheet(new Map([['A1', { f: 'WEBSERVICE(1)' }]])), /FORMULA_FUNCTION/);
  assert.throws(() => evaluateSheet(new Map([['A1', { f: 'A2+1' }], ['A2', { f: 'A1+1' }]])), /FORMULA_CYCLE/);
  assert.throws(() => evaluateSheet(new Map([['A1', { f: '1+' }]])), /FORMULA_/);
  assert.throws(() => evaluateSheet(new Map([['A1', { f: '"text"&A2' }]])), /FORMULA_SYNTAX/);
});

test('Ganzer Ablauf: bezahlter Auftrag → Excel-Datei hergestellt, geprüft, geliefert und herunterladbar', () => {
  const { ctx } = makeCtx({ env: { ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-xlsx', OWNER_ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-xlsx' } });
  const p = toPaid(ctx, inbound({ request: { capabilityId: 'b2b-calc-xlsx', scope: INPUT } }));
  const t = autopilotTick(ctx);
  assert.equal(t.production.results[0]?.outcome, 'DELIVERED', JSON.stringify(t.production));
  const del = getDeliveryByOrder(ctx, p.orderId);
  const dl = downloadArtifact(ctx, issueDownloadToken(ctx, del?.delivery_id ?? '', p.customerId), p.customerAccessKey ?? undefined);
  assert.ok(dl.ok);
  if (dl.ok) {
    assert.deepEqual(failed(b2bCalcXlsx.runQa(dl.bytes, INPUT)), []);
    assert.equal(dl.mediaType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
});
