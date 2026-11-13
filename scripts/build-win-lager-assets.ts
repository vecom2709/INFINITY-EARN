import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildWinLager } from './build-win-lager.ts';

/**
 * Erzeugt die Abbildungen und Programmtexte für die bebilderte Anleitung von „Lager & Rechnung“ (Funktion 157):
 * baut das echte Programm je Sprache (Musterfirma), startet es im Abbildungsmodus (--shots, Beispieldaten in einem
 * eigenen Temp-Ordner) und schreibt products/win-lager/generated/manual-assets.ts.
 * Läuft nur auf Windows. Danach: npm run verify (der Test prüft, dass die Abbildungen zum aktuellen Programm gehören).
 *
 *   node scripts/build-win-lager-assets.ts
 */
const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'products', 'win-lager', 'src');
export const SHOT_FILES = ['firma', 'artikel', 'lager', 'kunden', 'rechnungen'] as const;
const LANGS = { de: 'DE', it: 'IT', en: 'DE' } as const;

/** Prüfsumme der Programmquellen, die das Aussehen bestimmen (Zeilenenden vereinheitlicht). */
export function uiSourceHash(): string {
  const h = createHash('sha256');
  for (const f of ['MainForm.cs', 'Program.cs', 'Strings.cs', 'Core.cs', 'Legal.cs']) h.update(readFileSync(join(SRC, f), 'utf8').replace(/\r\n/g, '\n'));
  return h.digest('hex').slice(0, 16);
}

/** Texte des Programms (Strings.cs) je Sprache – damit die Anleitung dieselben Wörter verwendet wie die Oberfläche. */
export function parseStrings(): Record<'de' | 'it' | 'en', Record<string, string>> {
  const src = readFileSync(join(SRC, 'Strings.cs'), 'utf8');
  const out = { de: {} as Record<string, string>, it: {} as Record<string, string>, en: {} as Record<string, string> };
  const unq = (s: string): string => s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  for (const m of src.matchAll(/\{\s*"([a-z_]+)",\s*new\[\]\s*\{\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/g)) {
    out.de[m[1] as string] = unq(m[2] as string);
    out.it[m[1] as string] = unq(m[3] as string);
    out.en[m[1] as string] = unq(m[4] as string);
  }
  return out;
}

function main(): void {
  if (process.platform !== 'win32') throw new Error('PLATFORM_TEST_BLOCKED: Abbildungen entstehen aus dem echten Windows-Programm.');
  const work = mkdtempSync(join(tmpdir(), 'iewa-'));
  const shots: Record<string, Record<string, string>> = {};
  try {
    for (const [lang, country] of Object.entries(LANGS)) {
      const company = lang === 'it' ? 'Azienda Esempio' : lang === 'en' ? 'Example Company' : 'Musterfirma';
      const b = buildWinLager({ company, color: '#1F5FA8', lang: lang as 'de', country, productId: 'win-lager', version: '1.0.0', outDir: join(work, lang), manual: false });
      const dir = join(work, `${lang}-shots`);
      mkdirSync(dir);
      const r = spawnSync(b.app, ['--shots', dir], { encoding: 'utf8', timeout: 60_000 });
      if (r.status !== 0) throw new Error(`SHOTS_FAILED ${lang}: ${r.stderr}`);
      shots[lang] = {};
      for (const f of SHOT_FILES) {
        const bytes = readFileSync(join(dir, `${f}.jpg`));
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`KEIN_JPEG ${lang}/${f}`);
        (shots[lang] as Record<string, string>)[f] = bytes.toString('base64');
      }
      console.log(`${lang}: ${SHOT_FILES.map((f) => `${f} ${Math.round(Buffer.from((shots[lang] as Record<string, string>)[f] as string, 'base64').length / 1024)} KB`).join(', ')}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const out = join(ROOT, 'products', 'win-lager', 'generated');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'manual-assets.ts'), `// Automatisch erzeugt von scripts/build-win-lager-assets.ts – echte Abbildungen des gebauten Windows-Programms (Beispieldaten) und seine Texte.
export const UI_SOURCE_HASH = ${JSON.stringify(uiSourceHash())};
export const UI_STRINGS: Record<'de' | 'it' | 'en', Record<string, string>> = ${JSON.stringify(parseStrings())};
export const SHOTS_JPEG_BASE64: Record<'de' | 'it' | 'en', Record<${SHOT_FILES.map((f) => `'${f}'`).join(' | ')}, string>> = ${JSON.stringify(shots)};
`);
  console.log(`geschrieben: products/win-lager/generated/manual-assets.ts (Quellen ${uiSourceHash()})`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
