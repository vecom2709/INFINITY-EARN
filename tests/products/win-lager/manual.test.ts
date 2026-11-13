import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { hashPassword, randomToken } from '../../../packages/shared/src/crypto.ts';
import { pdfString } from '../../../packages/shared/src/pdf.ts';
import { jpegInfo } from '../../../packages/shared/src/pdf-doc.ts';
import { SHOTS_JPEG_BASE64, UI_SOURCE_HASH, UI_STRINGS } from '../../../products/win-lager/generated/manual-assets.ts';
import { buildWinManual, WIN_MANUAL_TEXTS, winLabel, winPlaceholders } from '../../../products/win-lager/manual.ts';
import { releaseSummary, winReleaseGates } from '../../../products/win-lager/release.ts';
import { parseStrings, uiSourceHash } from '../../../scripts/build-win-lager-assets.ts';
import type { AppContext } from '../../../services/core-api/src/context.ts';
import { Client, serve } from '../../http.ts';
import { makeCtx } from '../../helpers.ts';

/** Funktion 157: bebilderte Anleitung (DE/IT/EN) und Freigabe-Akte des Windows-Programms. Läuft auf jedem System. */
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const LANGS = ['de', 'it', 'en'] as const;

test('Abbildungen und Texte gehören zum aktuellen Programm (sonst: node scripts/build-win-lager-assets.ts)', () => {
  assert.equal(UI_SOURCE_HASH, uiSourceHash(), 'Oberfläche geändert – Abbildungen neu erzeugen');
  assert.deepEqual(UI_STRINGS, parseStrings(), 'Programmtexte geändert – Anleitungstexte neu erzeugen');
  for (const lang of LANGS) {
    for (const shot of ['firma', 'artikel', 'lager', 'kunden', 'rechnungen'] as const) {
      const bytes = Buffer.from(SHOTS_JPEG_BASE64[lang][shot], 'base64');
      const info = jpegInfo(bytes);
      assert.ok(info.width >= 900 && info.height >= 500, `${lang}/${shot}: echtes Fenster (${info.width}×${info.height})`);
    }
  }
});

test('Jeder Knopf- und Feldname der Anleitung existiert im Programm, in allen drei Sprachen', () => {
  const keys = winPlaceholders();
  assert.ok(keys.length >= 25);
  for (const lang of LANGS) for (const k of keys) assert.ok(UI_STRINGS[lang][k], `${lang}: ${k}`);
  assert.equal(winLabel('de', 'Klick [[add]]'), 'Klick „Neu anlegen“');
  assert.equal(winLabel('it', 'sotto «[[low]]»'), 'sotto «Sotto scorta»', 'keine doppelten Anführungszeichen');
  assert.throws(() => winLabel('en', '[[gibtsnicht]]'), /MANUAL_LABEL_UNKNOWN/);
});

test('Anleitung je Sprache und Land: gültiges PDF, 10 Kapitel, 5 echte Abbildungen, alle Zeichen darstellbar', () => {
  for (const [lang, country] of [['de', 'DE'], ['de', 'AT'], ['it', 'IT'], ['en', 'DE'], ['en', 'IT']] as const) {
    const r = buildWinManual({ company: 'Ferramenta Rossi', color: '#0F766E', lang, country, productId: 'win-lager', version: '1.2.0', created: new Date('2026-11-13T00:00:00Z') });
    const head = Buffer.from(r.bytes.subarray(0, 8)).toString('latin1');
    assert.ok(head.startsWith('%PDF-1.'), lang);
    assert.ok(Buffer.from(r.bytes.subarray(-6)).toString('latin1').includes('%%EOF'), lang);
    assert.equal(r.meta.images, 5, lang);
    assert.deepEqual(r.meta.chapters, ['einrichtung', 'installation', 'firma', 'artikel', 'lager', 'kunden', 'rechnungen', 'daten', 'update', 'meldungen']);
    assert.ok(r.meta.pages >= 8, `${lang}: ${r.meta.pages} Seiten`);
    const raw = Buffer.from(r.bytes).toString('latin1');
    assert.ok(raw.includes('Ferramenta Rossi'), 'Firmenname des Kunden');
    assert.ok(raw.includes('win-lager-setup-1.2.0.exe'), 'Name der Installationsdatei dieser Fassung');
  }
  const all = JSON.stringify(WIN_MANUAL_TEXTS) + JSON.stringify(LANGS.flatMap((l) => (['DE', 'AT', 'IT'] as const).map((country) => WIN_MANUAL_TEXTS[l].chapters({ setup: 's', exe: 'e', product: 'p', id: 'i', country })))) + JSON.stringify(UI_STRINGS);
  const bad = [...new Set([...all].filter((c) => c !== '?' && pdfString(c) === '?'))];
  assert.deepEqual(bad, [], 'kein Zeichen wird im PDF zu „?“');
});

test('Anleitung verspricht nichts Ungeprüftes und passt zum Land der Fassung', () => {
  for (const lang of LANGS) {
    const ch = (country: 'DE' | 'AT' | 'IT'): string => JSON.stringify(WIN_MANUAL_TEXTS[lang].chapters({ setup: 's', exe: 'e', product: 'p', id: 'i', country }));
    const t = ch('DE');
    assert.doesNotMatch(t, /läuft unter Windows 10|funziona con Windows 10|runs on Windows 10/, 'Windows 10 ist nicht getestet');
    assert.match(t, /signiert|firmato|signed/, 'Hinweis auf fehlende Signatur');
    assert.match(t, /\[\[servicedate\]\]/, 'Leistungsdatum wird erklärt');
    assert.match(t, /XRechnung/, 'DE: ehrlich, dass noch keine E-Rechnung erzeugt wird');
    assert.doesNotMatch(t, /fpa_export|FatturaPA/, 'DE: keine FatturaPA');
    assert.doesNotMatch(ch('AT'), /XRechnung|fpa_export/, 'AT: weder XRechnung-Hinweis noch FatturaPA');
    assert.match(ch('IT'), /\[\[fpa_export\]\]/, 'IT: FatturaPA-Export erklärt');
    assert.match(ch('IT'), /Fatture e Corrispettivi/, 'IT: Übermittlungsweg genannt');
  }
});

test('Programm: keine unübersetzte Meldung mehr im Quelltext', () => {
  for (const f of ['Core.cs', 'MainForm.cs']) {
    const src = readFileSync(join(ROOT, 'products', 'win-lager', 'src', f), 'utf8');
    assert.doesNotMatch(src, /new DomainException\("[A-Z_]+", "/, `${f}: Meldungen kommen aus Strings.cs`);
    assert.doesNotMatch(src, /"Rechnung "/, `${f}: Buchungsgrund übersetzt`);
  }
  const setup = readFileSync(join(ROOT, 'products', 'win-lager', 'setup', 'Setup.cs'), 'utf8');
  assert.doesNotMatch(setup, /Done\(\d, "/, 'Installer-Meldungen in drei Sprachen');
  for (const lang of LANGS) assert.ok(UI_STRINGS[lang].e_stock_for?.includes('{2}'), `${lang}: Platzhalter erhalten`);
});

test('Freigabe-Akte: Anleitung, Texte und Pflichtangaben belegt; FatturaPA-Prüfung und Lieferweg sperren den Verkauf', () => {
  const gates = winReleaseGates();
  const by = Object.fromEntries(gates.map((g) => [g.id, g]));
  assert.equal(by.manual?.status, 'PASS');
  assert.equal(by.manual?.live, true);
  assert.equal(by.texts?.status, 'PASS');
  assert.equal(by['legal-invoice']?.status, 'PASS');
  assert.equal(by['fatturapa-schema']?.status, 'PASS');
  assert.equal(by.fatturapa?.status, 'BLOCKED', 'ohne echte SdI-Annahme nicht freigegeben');
  assert.match(by.fatturapa?.evidence ?? '', /UNVERIFIED/);
  assert.equal(by['erechnung-de']?.status, 'OPEN');
  assert.equal(by.delivery?.status, 'BLOCKED', 'ohne bestandenen Probebau');
  assert.equal(winReleaseGates({ state: 'DONE', qa_passed: 1, runner_ref: 'github:1/1', updated_at: '2026-11-13T20:00:00Z', last_error: null }).find((g) => g.id === 'delivery')?.status, 'PASS', 'bestandener Probebau belegt den Lieferweg');
  assert.equal(by.signing?.status, 'OWNER');
  assert.equal(by.win10?.status, 'OPEN');
  assert.deepEqual(releaseSummary(gates), { sellable: false, blocked: 2, owner: 2 });
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

test('Admin: Anleitung und Freigabe-Akte nur für den Eigentümer, ohne Freigabeknopf', async () => {
  const anon = new Client(base);
  assert.equal((await anon.get('/admin/muster/win-lager/anleitung.pdf')).status, 303);
  assert.equal((await anon.get('/dashboard/produkte/win-lager')).status, 303);
  const owner = new Client(base);
  assert.equal((await owner.post('/auth/login', { password: PASSWORD })).status, 303);
  for (const lang of ['', '?lang=it', '?lang=en']) {
    const pdf = await owner.get(`/admin/muster/win-lager/anleitung.pdf${lang}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.ok(pdf.text.startsWith('%PDF-1.'));
  }
  const page = await owner.get('/dashboard/produkte/win-lager');
  assert.equal(page.status, 200);
  assert.match(page.text, /Freigabe-Akte/);
  assert.match(page.text, /Sperrt den Verkauf/);
  assert.match(page.text, /anleitung\.pdf\?lang=it/);
  assert.doesNotMatch(page.text, /action="\/admin\/produkte\/win-lager\/freigeben"/, 'kein Freigabeknopf, solange etwas sperrt');
  const products = await owner.get('/dashboard/produkte');
  assert.match(products.text, /href="\/dashboard\/produkte\/win-lager"/, 'erreichbar aus Produkte');
});
