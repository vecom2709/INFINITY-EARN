import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { hashPassword, randomToken } from '../../../packages/shared/src/crypto.ts';
import { jpegInfo, PdfDoc, textWidth } from '../../../packages/shared/src/pdf-doc.ts';
import { createZip, readZip } from '../../../packages/shared/src/zip.ts';
import { bundle } from '../../../products/mini-ww/build.ts';
import { MINI_WW_BUNDLE, MINI_WW_BUNDLE_SHA256 } from '../../../products/mini-ww/generated/bundle.ts';
import { SHOTS_JPEG_BASE64 } from '../../../products/mini-ww/generated/shots.ts';
import { htmlFromBundle, readConfig } from '../../../products/mini-ww/html.ts';
import { label, MANUAL_TEXTS, placeholders } from '../../../products/mini-ww/manual.ts';
import { SHOT_NAMES } from '../../../products/mini-ww/manual-shots.ts';
import { manualSeed } from '../../../products/mini-ww/seed.ts';
import { applySetup, DEFAULT_SETUP, emptyStore, validateSetup } from '../../../products/mini-ww/src/index.ts';
import { KEYS } from '../../../products/mini-ww/ui/i18n.ts';
import type { AppContext } from '../../../services/core-api/src/context.ts';
import { MINI_WW_FILES, miniWw } from '../../../services/product-factory/src/capabilities/mini-ww.ts';
import { acceptanceGate, getStandard, standardGaps } from '../../../services/product-factory/src/quality-standard.ts';
import { getCapability, listCapabilities, routeCapability } from '../../../services/product-factory/src/registry.ts';
import { Client, serve } from '../../http.ts';
import { makeCtx } from '../../helpers.ts';
import { isSellable, RELEASE_REQUIRED } from '../../../services/core-api/src/releases.ts';

/** Pilot P3 – Fabrik-Anbindung der Mini-Warenwirtschaft: Konfiguration aus dem Auftrag, Build, Abnahme, Lieferpaket. */

const ORDER = {
  company: 'Ferramenta Rossi Srl',
  primary: '#E8B4B8', // zu hell für weiße Schrift → wird angepasst
  language: 'it' as const,
  setup: {
    taxRates: [{ id: 'std', label: 'IVA 22 %', bps: 2200 }, { id: 'red', label: 'IVA 10 %', bps: 1000 }, { id: 'esen', label: 'Esente art. 10', bps: 0 }],
    prefixes: { quote: 'OF26-', order: 'OR26-', delivery: 'DDT26-', invoice: 'FT26/', credit: 'NC26/' },
    paymentTermDays: 30,
  },
};

const files = (zip: Uint8Array): Record<string, Uint8Array> => Object.fromEntries(readZip(zip).map((e) => [e.name, e.bytes]));
const repack = (zip: Uint8Array, change: (f: Record<string, Uint8Array>) => void): Uint8Array => {
  const f = files(zip);
  change(f);
  return createZip(Object.entries(f).map(([name, bytes]) => ({ name, bytes })));
};
const failed = (qa: { check: string; passed: boolean }[]): string[] => qa.filter((c) => !c.passed).map((c) => c.check);

test('Vorab gebauter Programmcode ist aktuell und die getestete Fassung (sonst: node scripts/build-mini-ww-assets.ts)', () => {
  assert.equal(MINI_WW_BUNDLE, bundle(), 'products/mini-ww/generated/bundle.ts veraltet');
  assert.equal(createHash('sha256').update(MINI_WW_BUNDLE).digest('hex'), MINI_WW_BUNDLE_SHA256);
});

test('Echte Screenshots je Sprache und Arbeitsablauf vorhanden, gültige JPEGs, identisch mit den Dateien im Repository', () => {
  for (const lang of ['de', 'it', 'en'] as const) {
    for (const name of SHOT_NAMES) {
      const b64 = SHOTS_JPEG_BASE64[lang][name];
      assert.ok(b64, `${lang}-${name}`);
      const bytes = Buffer.from(b64, 'base64');
      const info = jpegInfo(bytes);
      assert.equal(info.width, 900);
      assert.ok(info.height > 400 && info.components === 3);
      assert.ok(bytes.equals(readFileSync(`products/mini-ww/manual/shots/${lang}-${name}.jpg`)), `${lang}-${name}.jpg`);
    }
  }
});

test('Beispielbestand für die Abbildungen entsteht über die echten Aktionen und ist als Beispiel erkennbar', () => {
  for (const lang of ['de', 'it', 'en'] as const) {
    const s = manualSeed(lang, new Date('2026-11-13T10:00:00Z'));
    assert.match(s.store.settings.company, /Beispiel|demo/);
    assert.equal(s.store.invoices.filter((i) => i.status === 'FINAL').length, 2);
    assert.ok(s.store.audit.length > 20, 'jede Aktion protokolliert');
    assert.ok(s.store.customers.every((c) => (c.email ?? '').endsWith('.example')), 'keine echten Adressen');
  }
});

test('Einrichtung aus dem Auftrag: Standardwerte, eigene Werte, klare Ablehnung ungültiger Angaben', () => {
  assert.deepEqual(validateSetup(undefined), DEFAULT_SETUP);
  const own = validateSetup(ORDER.setup);
  assert.equal(own.prefixes.invoice, 'FT26/');
  assert.equal(own.paymentTermDays, 30);
  for (const [bad, msg] of [
    [{ taxRates: [{ id: 'red', label: '10 %', bps: 1000 }] }, /std/],
    [{ taxRates: [{ id: 'std', label: 'x', bps: 12000 }] }, /0 und 100/],
    [{ prefixes: { quote: 'RE-', invoice: 'RE-' } }, /eigenes Präfix/],
    [{ prefixes: { invoice: 're<script>' } }, /ungültig/],
    [{ prefixes: { lager: 'L-' } }, /Unbekannter Nummernkreis/],
    [{ paymentTermDays: 0 }, /1 bis 120/],
    ['text', /Objekt/],
  ] as const) assert.throws(() => validateSetup(bad), msg);
  const store = applySetup(emptyStore('X'), own);
  assert.equal(store.settings.sequences.invoice.prefix, 'FT26/');
  assert.equal(store.settings.taxRates.length, 3);
});

test('Lieferpaket je Auftrag besteht alle Abnahmekriterien (IT, eigene Steuersätze und Nummernkreise, angepasste Farbe)', () => {
  const zip = miniWw.generate(ORDER);
  const f = files(zip);
  assert.deepEqual(Object.keys(f).sort(), Object.values(MINI_WW_FILES).sort());
  const html = new TextDecoder().decode(f[MINI_WW_FILES.html]);
  const cfg = readConfig(html);
  assert.equal(cfg?.brand.company, 'Ferramenta Rossi Srl');
  assert.equal(cfg?.setup?.prefixes.invoice, 'FT26/');
  assert.equal(cfg?.seed, undefined, 'nie Beispieldaten in einer Kundenauslieferung');
  assert.match(html, /<title>Ferramenta Rossi Srl – Gestione magazzino<\/title>/);
  const qa = miniWw.runQa(zip, ORDER);
  assert.deepEqual(failed(qa), [], JSON.stringify(qa.filter((c) => !c.passed)));
  assert.match(qa.find((c) => c.check === 'domain_selftest')?.detail ?? '', /OF26-00001 → Rechnung FT26\/00001 über 36\.60/);
  assert.match(qa.find((c) => c.check === 'branding')?.detail ?? '', /angepasst/);
  assert.match(qa.find((c) => c.check === 'manual_pdf')?.detail ?? '', /10 Screenshots, 10 Kapitel \(it\)/);
  const gate = acceptanceGate('mini-ww', [...qa, { check: 'checksum', passed: true }]);
  assert.equal(gate.passed, true, gate.detail);
  const readme = new TextDecoder().decode(f[MINI_WW_FILES.readme]);
  assert.match(readme, /Gestione magazzino per Ferramenta Rossi Srl/);
  assert.ok(readme.includes(createHash('sha256').update(f[MINI_WW_FILES.pdf] as Uint8Array).digest('hex')));
});

test('Abnahme erkennt Manipulation und Mängel: fremder Code, Beispieldaten, fehlende CSP, fehlende Anleitung, falsche Prüfsumme', () => {
  const zip = miniWw.generate({ company: 'Musterfirma', primary: '#1F5FA8', language: 'de' });
  const input = { company: 'Musterfirma', primary: '#1F5FA8', language: 'de' };
  const html = (f: Record<string, Uint8Array>): string => new TextDecoder().decode(f[MINI_WW_FILES.html]);
  const setHtml = (f: Record<string, Uint8Array>, s: string): void => { f[MINI_WW_FILES.html] = new TextEncoder().encode(s); };
  assert.deepEqual(failed(miniWw.runQa(zip, input)), []);
  const qaOf = (fn: (f: Record<string, Uint8Array>) => void): string[] => failed(miniWw.runQa(repack(zip, fn), input));
  assert.ok(qaOf((f) => setHtml(f, html(f).replace('"use strict";', '"use strict";fetch("https://x.example");'))).includes('program_integrity'));
  const seeded = htmlFromBundle(MINI_WW_BUNDLE, { company: 'Musterfirma', primary: '#1F5FA8', logoDataUrl: null, lang: 'de' }, { seed: manualSeed('de', new Date()) });
  assert.ok(qaOf((f) => setHtml(f, seeded)).includes('branding'));
  assert.ok(qaOf((f) => setHtml(f, html(f).replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, ''))).includes('no_network'));
  const noPdf = qaOf((f) => { delete f[MINI_WW_FILES.pdf]; });
  assert.ok(noPdf.includes('zip_structure') && noPdf.includes('manual_pdf') && noPdf.includes('readme'));
  const brokenPdf = repack(zip, (f) => { f[MINI_WW_FILES.pdf] = new TextEncoder().encode('%PDF-1.4\nkaputt\n%%EOF'); });
  assert.ok(failed(miniWw.runQa(brokenPdf, input)).includes('manual_pdf'));
  assert.ok(failed(miniWw.runQa(zip, { ...input, company: 'Andere Firma' })).includes('branding'), 'Paket passt nicht zum Auftrag');
  assert.deepEqual(failed(miniWw.runQa(zip, { company: '' })), ['input']);
  assert.throws(() => miniWw.generate({ ...input, logo_data_url: 'data:image/svg+xml;base64,PHN2Zz4=' }), /Logo/);
  assert.throws(() => miniWw.generate({ ...input, setup: { paymentTermDays: 999 } }), /INVALID_INPUT/);
});

test('Anleitung: jede Knopfbezeichnung stammt aus dem Programm; DE/EN-Pakete bestehen ebenfalls die Abnahme', () => {
  assert.deepEqual(placeholders().filter((k) => !KEYS.includes(k)), [], 'Anleitung nennt Bezeichnungen, die es im Programm nicht gibt');
  assert.equal(label('it', 'Cliccare [[Liefern]]'), 'Cliccare «Consegna»');
  for (const lang of ['de', 'en'] as const) {
    const input = { company: lang === 'de' ? 'Schreinerei Huber' : 'Smith & Sons Ltd', primary: '#0B6E4F', language: lang };
    const qa = miniWw.runQa(miniWw.generate(input), input);
    assert.deepEqual(failed(qa), [], `${lang}: ${JSON.stringify(qa.filter((c) => !c.passed))}`);
    assert.equal(MANUAL_TEXTS[lang].chapters.length, 10);
  }
});

test('PDF-Baustein: echte Laufweiten, Bilder binärsicher, Verweistabelle byte-genau', () => {
  assert.ok(textWidth('WWW', 10) > textWidth('iii', 10) * 3);
  const jpeg = Buffer.from(SHOTS_JPEG_BASE64.de.uebersicht as string, 'base64');
  const doc = new PdfDoc({ title: 'Test', footer: (p, t) => `${p}/${t}` });
  doc.heading('Überschrift äöü €');
  doc.paragraph('Text '.repeat(1500));
  doc.image(jpeg, { caption: 'Abb. 1' });
  const pdf = doc.toBytes();
  const s = Buffer.from(pdf).toString('latin1');
  const xref = Number(/startxref\n(\d+)/.exec(s)?.[1]);
  assert.ok(s.startsWith('xref', xref));
  for (const [i, m] of [...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].entries()) assert.ok(s.startsWith(`${i + 1} 0 obj`, Number(m[1])), `Objekt ${i + 1}`);
  assert.ok(Buffer.from(pdf).includes(jpeg), 'JPEG unverändert eingebettet');
  assert.ok(doc.pageCount >= 2);
  assert.throws(() => jpegInfo(new Uint8Array([1, 2, 3])), /JPEG_INVALID/);
});

test('Produktart registriert, Standard-Akte vollständig – aber nicht verkaufbar bis zur Freigabe (P4)', () => {
  const cap = getCapability('mini-ww');
  assert.ok(cap);
  assert.deepEqual(standardGaps(cap), []);
  const s = getStandard('mini-ww');
  assert.equal(s?.deliverables.manualInPackage, MINI_WW_FILES.pdf);
  // Herstellbar (Akte vollständig) – bestellbar aber erst mit Freigabe und Festpreis des Eigentümers (P4, releases.ts).
  assert.equal(routeCapability('mini-ww').ok, true);
  assert.equal(listCapabilities().find((c) => c.id === 'mini-ww')?.enabled, true);
  const { ctx: c2 } = makeCtx({ env: { ALLOWED_CAPABILITIES: 'b2b-calc-csv,mini-ww' } });
  assert.equal(isSellable(c2, 'mini-ww'), false, 'ohne Freigabe nicht bestellbar');
  assert.ok(RELEASE_REQUIRED.has('mini-ww'));
});

let ctx: AppContext;
let base: string;
let close: () => void;
const PASSWORD = `pw-${randomToken(12)}`;
before(async () => {
  ctx = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } }).ctx;
  const s = await serve(ctx);
  base = s.base;
  close = () => s.server.close();
});
after(() => close());

test('Musteranleitung und Musterpaket nur für den Eigentümer', async () => {
  const anon = new Client(base);
  assert.equal((await anon.get('/admin/muster/mini-ww/anleitung.pdf')).status, 303);
  assert.equal((await anon.get('/admin/muster/mini-ww/paket.zip')).status, 303);
  const owner = new Client(base);
  assert.equal((await owner.post('/auth/login', { password: PASSWORD })).status, 303);
  const pdf = await owner.get('/admin/muster/mini-ww/anleitung.pdf?lang=it');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok(pdf.text.startsWith('%PDF-1.4'));
  const zip = await owner.get('/admin/muster/mini-ww/paket.zip');
  assert.equal(zip.headers.get('content-type'), 'application/zip');
});
