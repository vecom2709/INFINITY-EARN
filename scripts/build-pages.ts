import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHome } from '../apps/customer-portal/src/pages.ts';

/**
 * Statische Fassung für GitHub Pages (kostenlos, nur statische Dateien).
 * Die Startseite wird mit demselben Renderer wie im Worker erzeugt; alle internen Links zeigen auf das laufende
 * System (Anfrage, Portal, Bezahlung laufen nur dort). Der Testbetrieb-Hinweis bleibt sichtbar.
 *   node scripts/build-pages.ts   → site/
 */
const APP_ORIGIN = (process.env.APP_ORIGIN ?? 'https://infinity-earn-staging.bikerman01.workers.dev').replace(/\/$/, '');
const OFFERED = (process.env.PAGES_PRODUCTS ?? 'b2b-calc-csv,b2b-calc-pdf,b2b-calc-bundle').split(',').map((s) => s.trim()).filter(Boolean);
const out = 'site';

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'entwuerfe'), { recursive: true });

const html = renderHome(OFFERED)
  .replace(/href="\/(?!\/)([^"]*)"/g, (_m, path: string) => `href="${APP_ORIGIN}/${path}"`)
  .replace('<title>', `<link rel="canonical" href="${APP_ORIGIN}/"><title>`);
if (/href="\/(?!\/)/.test(html)) throw new Error('Interner Link nicht umgeschrieben');
writeFileSync(join(out, 'index.html'), html);
copyFileSync('docs/design/web-v15/entwuerfe.html', join(out, 'entwuerfe', 'index.html'));
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(join(out, '404.html'), `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nicht gefunden · INFINITY EARN</title></head><body style="font:16px/1.6 system-ui,sans-serif;background:#F7FAF9;color:#0E1D25;padding:48px 20px;text-align:center"><h1>Seite nicht gefunden</h1><p><a style="color:#087F82" href="./">Zur Startseite</a></p></body></html>`);
console.log(`GitHub-Pages-Fassung erzeugt in ${out}/ (Links → ${APP_ORIGIN}, Produkte: ${OFFERED.join(', ')})`);
