import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bundle } from '../products/mini-ww/build.ts';
import { htmlFromBundle } from '../products/mini-ww/html.ts';
import { SHOT_NAMES, SHOT_ROUTES, type ShotName } from '../products/mini-ww/manual-shots.ts';
import { manualSeed } from '../products/mini-ww/seed.ts';

/**
 * Erzeugt die vorab gebauten Bestandteile der Produktart „mini-ww“ für die Produktfabrik (Worker ohne Compiler/Browser):
 *  1. products/mini-ww/generated/bundle.ts – gebündelter Programmcode + SHA-256 (die getestete Fassung)
 *  2. echte Screenshots des gebauten Programms je Sprache (Microsoft Edge headless, lokal, kostenlos) als JPEG
 *     → products/mini-ww/manual/shots/*.jpg und products/mini-ww/generated/shots.ts
 *   node scripts/build-mini-ww-assets.ts [--no-shots]
 */
const GEN = resolve('products/mini-ww/generated');
const SHOTS = resolve('products/mini-ww/manual/shots');
mkdirSync(GEN, { recursive: true });

const js = bundle();
const sha = createHash('sha256').update(js).digest('hex');
writeFileSync(join(GEN, 'bundle.ts'), `// Automatisch erzeugt von scripts/build-mini-ww-assets.ts – nicht von Hand ändern.\nexport const MINI_WW_BUNDLE_SHA256 = '${sha}';\nexport const MINI_WW_BUNDLE: string = ${JSON.stringify(js)};\n`);
console.log(`Programmcode: ${Math.round(js.length / 1024)} KB, SHA-256 ${sha.slice(0, 16)}…`);

if (process.argv.includes('--no-shots')) process.exit(0);

const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
if (!edge) throw new Error('Microsoft Edge nicht gefunden – Screenshots können nicht erzeugt werden.');
mkdirSync(SHOTS, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'mini-ww-shots-'));
const W = 1200;
const H = 780;
const OUT_W = 900;

// PNG → JPEG (verkleinert) mit den Bordmitteln von Windows (System.Drawing), Pfade über Umgebungsvariablen.
const PS = `Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($env:SHOT_IN)
$w = [int]$env:SHOT_W; $h = [int]([math]::Round($src.Height * $w / $src.Width))
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.DrawImage($src, 0, 0, $w, $h)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$env:SHOT_Q)
$bmp.Save($env:SHOT_OUT, $codec, $p)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()`;

/** Edge kehrt teils zurück, bevor die PNG fertig geschrieben ist: warten, bis die Datei existiert und stabil ist. */
function waitForFile(p: string): void {
  const sleep = (ms: number): void => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  let last = -1;
  for (let i = 0; i < 100; i++) {
    const size = existsSync(p) ? statSync(p).size : -1;
    if (size > 0 && size === last) return;
    last = size;
    sleep(250);
  }
  throw new Error(`Screenshot nicht erzeugt: ${p}`);
}

const entries: string[] = [];
let total = 0;
for (const lang of ['de', 'it', 'en'] as const) {
  const seed = manualSeed(lang, new Date());
  const html = htmlFromBundle(js, { company: seed.store.settings.company, primary: '#1F5FA8', logoDataUrl: null, lang }, { seed });
  const file = join(work, `app-${lang}.html`);
  writeFileSync(file, html);
  const items: string[] = [];
  for (const name of SHOT_NAMES) {
    const route = SHOT_ROUTES[name as ShotName](seed);
    const png = join(work, `${lang}-${name}.png`);
    const profile = mkdtempSync(join(work, 'p-'));
    execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, '--virtual-time-budget=3000', `--window-size=${W},${H}`, `--screenshot=${png}`, `file:///${file.replace(/\\/g, '/')}${route}`], { stdio: 'ignore', timeout: 90_000 });
    waitForFile(png);
    const jpg = join(SHOTS, `${lang}-${name}.jpg`);
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { env: { ...process.env, SHOT_IN: png, SHOT_OUT: jpg, SHOT_W: String(OUT_W), SHOT_Q: '74' }, stdio: 'inherit', timeout: 60_000 });
    const bytes = readFileSync(jpg);
    total += bytes.length;
    items.push(`${JSON.stringify(name)}:${JSON.stringify(bytes.toString('base64'))}`);
    console.log(`✓ ${lang}-${name}.jpg (${Math.round(bytes.length / 1024)} KB)`);
  }
  entries.push(`${lang}:{${items.join(',')}}`);
}
rmSync(work, { recursive: true, force: true });
writeFileSync(join(GEN, 'shots.ts'), `// Automatisch erzeugt von scripts/build-mini-ww-assets.ts – echte Screenshots des gebauten Programms (Beispielbestand).\nexport const SHOTS_JPEG_BASE64: Record<'de' | 'it' | 'en', Record<string, string>> = {${entries.join(',')}};\n`);
console.log(`Screenshots gesamt: ${Math.round(total / 1024)} KB (base64 ≈ ${Math.round((total * 4) / 3 / 1024)} KB)`);
