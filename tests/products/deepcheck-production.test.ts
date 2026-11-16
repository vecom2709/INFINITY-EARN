import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfString, pdfUnsupported } from '../../packages/shared/src/pdf.ts';
import { readZip } from '../../packages/shared/src/zip.ts';
import { b2bCalcBundle } from '../../services/product-factory/src/capabilities/b2b-calc-bundle.ts';
import { b2bCalcCsv, type CalcInput } from '../../services/product-factory/src/capabilities/b2b-calc-csv.ts';
import { b2bCalcPdf, moneyL, pdfInputIssues } from '../../services/product-factory/src/capabilities/b2b-calc-pdf.ts';
import { b2bCalcXlsx } from '../../services/product-factory/src/capabilities/b2b-calc-xlsx.ts';
import { count, makeCtx } from '../helpers.ts';
import { Client, serve } from '../http.ts';

/**
 * Tiefenprüfung Produktherstellung (16.11.2026): echte Dateien mit schwierigen Eingaben hergestellt und angesehen.
 * Funde: Das PDF ersetzte nicht darstellbare Zeichen stillschweigend durch „?“, schrieb Beträge im deutschen und
 * italienischen Dokument mit Punkt statt Komma, die Seitenangabe immer auf Deutsch und brach Bezeichnungen mit
 * Zeilenumbruch mitten in der Position um.
 */
const HARD: CalcInput = {
  title: 'Angebot „Größe & Maß“ – Büro; Halle 3 <Test>', currency: 'EUR', margin_bps: 1750, language: 'de',
  items: [
    { name: 'Montage vor Ort; inkl. Anfahrt', quantity: 10, unit_cost_minor: 4500 },
    { name: '=SUM(A1:A9)', quantity: 1, unit_cost_minor: 100 },
    { name: '+49 30 1234567 Rückruf', quantity: 2, unit_cost_minor: 0 },
    { name: '-Rabatt "Sonder" 10 %', quantity: 1, unit_cost_minor: 100000000 },
    { name: 'Zeile\nmit Umbruch\tund Tab', quantity: 3, unit_cost_minor: 12050 },
  ],
};
const GREEK: CalcInput = { ...HARD, items: [...HARD.items, { name: 'Ελληνικά 日本語 🙂', quantity: 1, unit_cost_minor: 7 }] };
const latin1 = (b: Uint8Array): string => new TextDecoder('latin1').decode(b);
const failed = (qa: { check: string; passed: boolean }[]): string[] => qa.filter((c) => !c.passed).map((c) => c.check);

test('Beträge in der Schreibweise der Dokumentsprache', () => {
  assert.equal(moneyL(118770476, 'EUR', 'de'), '1.187.704,76 EUR');
  assert.equal(moneyL(118770476, 'EUR', 'it'), '1.187.704,76 EUR');
  assert.equal(moneyL(118770476, 'EUR', 'en'), '1,187,704.76 EUR');
  assert.equal(moneyL(7, 'EUR', 'de'), '0,07 EUR');
  assert.equal(moneyL(99999, 'EUR', 'de'), '999,99 EUR');
  assert.equal(moneyL(100000, 'EUR', 'de'), '1.000,00 EUR');
  assert.equal(moneyL(1999, 'JPY', 'de'), '1.999 JPY', 'Währung ohne Nachkommastellen');
});

test('PDF: schwierige Eingabe richtig dargestellt – deutsche Zahlen, eine Zeile je Position, Abnahme bestanden', () => {
  const bytes = b2bCalcPdf.generate(HARD);
  assert.deepEqual(failed(b2bCalcPdf.runQa(bytes, HARD)), []);
  const s = latin1(bytes);
  assert.ok(s.includes(pdfString('Gesamt: 1.175.954,69 EUR')), 'Gesamtsumme mit Tausenderpunkt und Komma');
  assert.ok(s.includes(pdfString('Aufschlag (17,50 %)')));
  assert.ok(s.includes(pdfString('005) Zeile mit Umbruch und Tab')), 'Umbruch und Tabulator zu Leerzeichen');
  assert.ok(s.includes(pdfString('10 × 45,00 EUR = 450,00 EUR')));
  assert.ok(s.includes(pdfString('Seite 1 von 1')));
  assert.equal(b2bCalcPdf.version, 2);
});

test('PDF: Seitenangabe und Zahlen folgen der Sprache (Italienisch, Englisch), auch über mehrere Seiten', () => {
  const many = (language: CalcInput['language']): CalcInput => ({ title: 'Molte voci', currency: 'EUR', margin_bps: 0, language, items: Array.from({ length: 95 }, (_, i) => ({ name: `Voce ${i + 1}`, quantity: i + 1, unit_cost_minor: 1999 + i })) });
  const it = latin1(b2bCalcPdf.generate(many('it')));
  assert.ok(it.includes(pdfString('Pagina 1 di 2')) && it.includes(pdfString('Pagina 2 di 2')));
  assert.ok(!it.includes('Seite '), 'kein deutsches Wort im italienischen Dokument');
  assert.ok(it.includes(pdfString('Totale: 94.012,00 EUR')));
  const en = latin1(b2bCalcPdf.generate(many('en')));
  assert.ok(en.includes(pdfString('Page 2 of 2')) && en.includes(pdfString('Total: 94,012.00 EUR')));
  assert.deepEqual(failed(b2bCalcPdf.runQa(b2bCalcPdf.generate(many('it')), many('it'))), []);
});

test('Nicht darstellbare Zeichen: PDF und Paket lehnen ab statt „?“ zu liefern; Excel und CSV liefern sie unverändert', () => {
  assert.deepEqual(pdfUnsupported('Größe & Maß – „Zitat“ € ×'), [], 'westeuropäische Zeichen sind darstellbar');
  assert.ok(pdfUnsupported('Ελ日🙂').length >= 3);
  const issues = pdfInputIssues(GREEK);
  assert.equal(issues.length, 1);
  assert.match(issues[0] ?? '', /^Position 6: Das PDF kann diese Zeichen nicht darstellen/);
  assert.match(issues[0] ?? '', /Excel-Datei bzw\. CSV/);
  assert.throws(() => b2bCalcPdf.generate(GREEK), /INVALID_INPUT: Position 6/);
  assert.throws(() => b2bCalcBundle.generate(GREEK), /INVALID_INPUT: Position 6/);
  assert.equal(b2bCalcBundle.version, 2);
  assert.ok(new TextDecoder().decode(b2bCalcCsv.generate(GREEK)).includes('Ελληνικά 日本語 🙂'));
  assert.deepEqual(failed(b2bCalcXlsx.runQa(b2bCalcXlsx.generate(GREEK), GREEK)), []);
  assert.ok(new TextDecoder().decode(readZip(b2bCalcXlsx.generate(GREEK)).find((e) => e.name === 'xl/worksheets/sheet1.xml')?.bytes).includes('Ελληνικά 日本語 🙂'));
});

test('CSV: Formel-Anfänge entschärft, Anführungszeichen und Umbrüche korrekt eingefasst, Summen stimmen', () => {
  const csv = new TextDecoder().decode(b2bCalcCsv.generate(HARD));
  assert.deepEqual(failed(b2bCalcCsv.runQa(b2bCalcCsv.generate(HARD), HARD)), []);
  const rows = csv.split('\r\n'); // Windows-Zeilenenden; ein Umbruch innerhalb einer Bezeichnung bleibt ein einfaches \n
  assert.ok(rows.includes("'=SUM(A1:A9),1,1.00,1.00"));
  assert.ok(rows.includes("'+49 30 1234567 Rückruf,2,0.00,0.00"));
  assert.ok(rows.includes('"\'-Rabatt ""Sonder"" 10 %",1,1000000.00,1000000.00'));
  assert.ok(rows.includes('"Zeile\nmit Umbruch\tund Tab",3,120.50,361.50'));
  assert.ok(rows.includes('Gesamt,,,1175954.69'));
});

test('Anfrage mit nicht darstellbaren Zeichen im PDF-Format: offener Punkt statt Angebot, nichts wird verkauft', async () => {
  const { ctx } = makeCtx({ env: { ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf', OWNER_ALLOWED_CAPABILITIES: 'b2b-calc-csv,b2b-calc-pdf' } });
  const s = await serve(ctx);
  try {
    const c = new Client(s.base);
    const body = { name: 'Test Einkauf', email: 'einkauf@pruef-gmbh.example', country: 'DE', title: 'Angebot', items: 'Ελληνικά;1;10,00', margin: '0', message: 'Bitte als PDF.', privacy: '1', format: 'b2b-calc-pdf' };
    const r = await c.post('/anfrage', body);
    assert.equal(r.status, 200);
    assert.match(r.text, /offene Punkte/);
    assert.match(r.text, /Das PDF kann diese Zeichen nicht darstellen/);
    assert.equal(count(ctx, 'SELECT COUNT(*) AS n FROM quotes'), 0);
    const ok = await c.post('/anfrage', { ...body, email: 'zwei@pruef-gmbh.example', format: 'b2b-calc-csv' });
    assert.equal(ok.status, 303, 'dieselbe Eingabe als CSV wird angeboten');
  } finally {
    s.server.close();
  }
});
