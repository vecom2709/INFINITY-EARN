import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildWinManual } from '../products/win-lager/manual.ts';

/**
 * Baut „Lager & Rechnung für Windows“ (Funktion 157) je Kunde: Fachtests → Programm (.exe) → Installer (setup.exe) → Manifest.
 * Werkzeug: der in Windows enthaltene C#-Compiler des .NET Framework 4.x – keine Downloads, keine Kosten.
 * Ehrlich gekennzeichnet: unsigniert (ohne gekauftes Code-Signatur-Zertifikat warnt Windows SmartScreen bei Downloads).
 *
 *   node scripts/build-win-lager.ts [--company "Musterfirma"] [--color "#1F5FA8"] [--lang de|it|en] [--country IT|DE|AT] [--id win-lager] [--version 1.0.0]
 */
export interface WinBuildOptions { company: string; color: string; lang: 'de' | 'it' | 'en'; country: 'IT' | 'DE' | 'AT'; productId: string; version: string; outDir?: string; /** false: ohne Anleitung (nur beim Erzeugen der Abbildungen, die die Anleitung erst braucht) */ manual?: boolean }
export interface WinBuildResult { outDir: string; setup: string; app: string; manual: string; manifest: WinManifest; testOutput: string }
export interface WinManifest {
  product: string; productName: string; version: string; company: string; language: string; builtAt: string; toolchain: string;
  signed: false; signature: string; files: { name: string; bytes: number; sha256: string }[]; unitTests: { passed: number; failed: number };
}

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'products', 'win-lager');
const TAX: Record<string, number[]> = { IT: [2200, 1000, 400, 0], DE: [1900, 700, 0], AT: [2000, 1000, 1300, 0] };
const CULTURE: Record<string, string> = { de: 'de-DE', it: 'it-IT', en: 'en-GB' };
const NAME: Record<string, string> = { de: 'Lager & Rechnung', it: 'Magazzino & Fatture', en: 'Stock & Invoices' };

/** Signaturstatus, wie Windows ihn meldet (NotSigned/Valid/…). Ohne PSModulePath aus PowerShell 7, sonst lädt Windows PowerShell das Modul nicht. */
export function signatureStatus(file: string): string {
  const env = { ...process.env };
  delete env.PSModulePath;
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Import-Module Microsoft.PowerShell.Security; (Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}').Status`], { encoding: 'utf8', env }).trim() || 'unbekannt';
  } catch {
    return 'unbekannt';
  }
}

export function findCsc(): string | null {
  const win = process.env.WINDIR ?? 'C:\\Windows';
  for (const p of [join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'), join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')]) if (existsSync(p)) return p;
  return null;
}

/** Amtliches FatturaPA-Schema (FPR12 v1.2.3, fatturapa.gov.it), unverändert und per Prüfsumme festgehalten. */
export const FPR12_XSD = join(SRC, 'schema', 'Schema_VFPR12_v1.2.3.xsd');
export const FPR12_XSD_SHA256 = '152944f6eef9f5d69ef6e955ee173b32142b00a8c1c5222fc97dfab5910e8a8c';
const cs = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

export function validateOptions(o: WinBuildOptions): string[] {
  const e: string[] = [];
  if (!o.company.trim() || o.company.length > 80 || /[\r\n<>]/.test(o.company)) e.push('Firmenname: 1–80 Zeichen, keine Zeilenumbrüche oder spitzen Klammern');
  if (!/^#[0-9a-fA-F]{6}$/.test(o.color)) e.push('Farbe: #RRGGBB');
  if (!['de', 'it', 'en'].includes(o.lang)) e.push('Sprache: de, it oder en');
  if (!TAX[o.country]) e.push('Land: IT, DE oder AT');
  if (!/^[a-z0-9-]{3,40}$/.test(o.productId)) e.push('Produkt-ID: a–z, 0–9, Bindestrich');
  if (!/^\d+\.\d+\.\d+$/.test(o.version)) e.push('Version: x.y.z');
  return e;
}

export function buildWinLager(o: WinBuildOptions): WinBuildResult {
  if (process.platform !== 'win32') throw new Error('PLATFORM_TEST_BLOCKED: Windows-Programme werden auf Windows gebaut und getestet (nicht auf diesem System).');
  const errors = validateOptions(o);
  if (errors.length) throw new Error(`UNGUELTIG: ${errors.join('; ')}`);
  if (sha(FPR12_XSD) !== FPR12_XSD_SHA256) throw new Error('SCHEMA_VERAENDERT: Das amtliche FatturaPA-Schema weicht von der heruntergeladenen Fassung ab.');
  const csc = findCsc();
  if (!csc) throw new Error('TOOLCHAIN_MISSING: C#-Compiler des .NET Framework 4.x nicht gefunden.');
  const out = o.outDir ?? join(SRC, 'dist', o.productId);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const productName = NAME[o.lang] ?? NAME.de ?? '';
  const exeName = `${o.productId}.exe`;
  const brand = `// AUTOMATISCH ERZEUGT von scripts/build-win-lager.ts
using System.Reflection;
[assembly: AssemblyTitle(${cs(productName)})]
[assembly: AssemblyProduct(${cs(productName)})]
[assembly: AssemblyCompany(${cs(o.company)})]
[assembly: AssemblyVersion(${cs(`${o.version}.0`)})]
[assembly: AssemblyFileVersion(${cs(`${o.version}.0`)})]
namespace InfinityEarn.WinLager {
  public static class BrandData {
    public const string ProductId = ${cs(o.productId)}; public const string ProductName = ${cs(productName)}; public const string Version = ${cs(o.version)};
    public const string Company = ${cs(o.company)}; public const string Color = ${cs(o.color)}; public const string Language = ${cs(o.lang)};
    public const string Culture = ${cs(CULTURE[o.lang] ?? 'de-DE')}; public const string Currency = "EUR"; public const string Country = ${cs(o.country)};
    public static readonly int[] TaxRatesBps = new[] { ${(TAX[o.country] ?? []).join(', ')} };
  }
}
`;
  const setupData = `// AUTOMATISCH ERZEUGT von scripts/build-win-lager.ts
using System.Reflection;
[assembly: AssemblyTitle(${cs(`${productName} – Setup`)})]
[assembly: AssemblyCompany(${cs(o.company)})]
[assembly: AssemblyVersion(${cs(`${o.version}.0`)})]
[assembly: AssemblyFileVersion(${cs(`${o.version}.0`)})]
namespace InfinityEarn.WinLagerSetup {
  static class SetupData {
    public const string ProductId = ${cs(o.productId)}; public const string ProductName = ${cs(productName)}; public const string Version = ${cs(o.version)};
    public const string Company = ${cs(o.company)}; public const string ExeName = ${cs(exeName)}; public const string Language = ${cs(o.lang)};
  }
}
`;
  // Der Framework-Compiler kann keine Pfade über 260 Zeichen: in kurzem Temp-Ordner bauen, Ergebnis danach kopieren.
  const work = mkdtempSync(join(tmpdir(), 'iewl-'));
  const gen = join(work, 'gen');
  mkdirSync(gen);
  for (const [dir, files] of [['src', ['Core.cs', 'Legal.cs', 'Strings.cs', 'MainForm.cs', 'Program.cs', 'app.manifest']], ['setup', ['Setup.cs']], ['tests', ['Tests.cs']]] as const) {
    mkdirSync(join(work, dir), { recursive: true });
    for (const f of files) copyFileSync(join(SRC, dir, f), join(work, dir, f));
  }
  writeFileSync(join(gen, 'BrandData.g.cs'), brand);
  writeFileSync(join(gen, 'SetupData.g.cs'), setupData);
  const refs = ['/r:System.dll', '/r:System.Core.dll', '/r:System.Xml.dll', '/r:System.Xml.Linq.dll'];
  const ui = ['/r:System.Windows.Forms.dll', '/r:System.Drawing.dll'];
  const core = ['Core.cs', 'Legal.cs', 'Strings.cs'].map((f) => join(work, 'src', f));
  const compile = (args: string[]): void => {
    const r = spawnSync(csc, ['/nologo', '/codepage:65001', '/optimize+', '/warnaserror-', ...args], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`COMPILE_FAILED:\n${r.stdout}${r.stderr}`);
  };
  // 1. Fachtests
  const testsExe = join(work, 'tests.exe');
  const xsdRes = `/resource:${FPR12_XSD},fpr12.xsd`;
  compile(['/target:exe', `/out:${testsExe}`, xsdRes, ...refs, ...core, join(gen, 'BrandData.g.cs'), join(work, 'tests', 'Tests.cs')]);
  const t = spawnSync(testsExe, [], { encoding: 'utf8', env: { ...process.env } });
  const testOutput = `${t.stdout}${t.stderr}`;
  const m = /passed=(\d+) failed=(\d+)/.exec(testOutput);
  const unitTests = { passed: Number(m?.[1] ?? 0), failed: Number(m?.[2] ?? 1) };
  if (t.status !== 0 || unitTests.failed > 0 || unitTests.passed === 0) throw new Error(`UNIT_TESTS_FAILED:\n${testOutput}`);
  // 2. Programm
  const appW = join(work, exeName);
  compile(['/target:winexe', `/out:${appW}`, `/win32manifest:${join(work, 'src', 'app.manifest')}`, xsdRes, ...refs, ...ui, ...core, ...['MainForm.cs', 'Program.cs'].map((f) => join(work, 'src', f)), join(gen, 'BrandData.g.cs')]);
  // 3. Installer mit eingebettetem Programm
  const setupName = `${o.productId}-setup-${o.version}.exe`;
  compile(['/target:winexe', `/out:${join(work, setupName)}`, `/win32manifest:${join(work, 'src', 'app.manifest')}`, `/resource:${appW},app.exe`, ...refs, '/r:System.Windows.Forms.dll', join(work, 'setup', 'Setup.cs'), join(gen, 'SetupData.g.cs')]);
  const app = join(out, exeName);
  const setup = join(out, setupName);
  copyFileSync(appW, app);
  copyFileSync(join(work, setupName), setup);
  rmSync(work, { recursive: true, force: true });
  // 4. Bebilderte Anleitung für diese Kundenfassung (Firmenname, Farbe, Steuersätze, Sprache)
  const manual = join(out, `${o.productId}-anleitung-${o.lang}.pdf`);
  if (o.manual !== false) writeFileSync(manual, buildWinManual({ company: o.company, color: o.color, lang: o.lang, country: o.country, productId: o.productId, version: o.version }).bytes);
  // 5. Signaturstatus ehrlich aus Windows abfragen (ohne Zertifikat: NotSigned)
  const signature = signatureStatus(setup);
  const manifest: WinManifest = {
    product: o.productId, productName, version: o.version, company: o.company, language: o.lang, builtAt: new Date().toISOString(),
    toolchain: `csc ${csc.includes('Framework64') ? 'x64' : 'x86'} .NET Framework 4.x (in Windows enthalten)`,
    signed: false, signature,
    files: (o.manual !== false ? [app, setup, manual] : [app, setup]).map((p) => ({ name: p.slice(out.length + 1), bytes: readFileSync(p).length, sha256: sha(p) })),
    unitTests,
  };
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { outDir: out, setup, app, manual, manifest, testOutput };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const arg = (n: string, d: string): string => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? (process.argv[i + 1] ?? d) : d; };
  const r = buildWinLager({ company: arg('company', 'Musterfirma'), color: arg('color', '#1F5FA8'), lang: arg('lang', 'de') as 'de', country: arg('country', 'DE') as 'DE', productId: arg('id', 'win-lager'), version: arg('version', '1.0.0') });
  console.log(r.testOutput.trim().split('\n').at(-1));
  console.log(`Installer: ${r.setup}`);
  console.log(`Anleitung: ${r.manual}`);
  console.log(JSON.stringify(r.manifest.files, null, 2));
  console.log(`Signatur: ${r.manifest.signature} (unsigniert gekennzeichnet)`);
}
