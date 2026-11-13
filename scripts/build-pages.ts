import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHome } from '../apps/customer-portal/src/pages.ts';
import { LANGS, type Lang } from '../apps/customer-portal/src/home-i18n.ts';
import { buildHtml } from '../products/mini-ww/build.ts';

/**
 * Statische Fassung für GitHub Pages (kostenlos, nur statische Dateien): Startseite DE/IT/EN + Designentwürfe.
 * Sie wird mit demselben Renderer wie im Worker erzeugt. Sprachwechsel bleibt innerhalb von Pages; alle anderen
 * internen Links zeigen auf das laufende System (Anfrage, Portal, Bezahlung laufen nur dort).
 *   node scripts/build-pages.ts   → site/
 */
const APP_ORIGIN = (process.env.APP_ORIGIN ?? 'https://infinity-earn-staging.bikerman01.workers.dev').replace(/\/$/, '');
const OFFERED = (process.env.PAGES_PRODUCTS ?? 'b2b-calc-csv,b2b-calc-pdf,b2b-calc-bundle').split(',').map((s) => s.trim()).filter(Boolean);
const out = 'site';
const DIR: Record<Lang, string> = { de: '', it: 'it', en: 'en' };

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'entwuerfe'), { recursive: true });

for (const lang of LANGS) {
  const up = lang === 'de' ? './' : '../';
  const local: Record<string, string> = { '/': up, '/it': `${up}it/`, '/en': `${up}en/` };
  const html = renderHome(OFFERED, lang, APP_ORIGIN)
    .replace(/href="(\/(?:it|en)?)"/g, (m, p: string) => (local[p] ? `href="${local[p]}"` : m))
    .replace(/href="\/(?!\/)([^"]*)"/g, (_m, path: string) => `href="${APP_ORIGIN}/${path}"`)
    .replace(/url\("\/bilder\//g, `url("${APP_ORIGIN}/bilder/`);
  if (/href="\/(?!\/)/.test(html)) throw new Error(`Interner Link nicht umgeschrieben (${lang})`);
  const dir = join(out, DIR[lang]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}
copyFileSync('docs/design/web-v15/entwuerfe.html', join(out, 'entwuerfe', 'index.html'));
// Pilot-Fachsoftware: bedienbare Demo des Offline-Programms (Daten bleiben im Browser des Besuchers).
for (const [dir, lang, company] of [['mini-ww-demo', 'de', 'Musterfirma Demo'], ['mini-ww-demo/it', 'it', 'Azienda Demo'], ['mini-ww-demo/en', 'en', 'Demo Company']] as const) {
  mkdirSync(join(out, dir), { recursive: true });
  writeFileSync(join(out, dir, 'index.html'), buildHtml({ company, primary: '#1F5FA8', logoDataUrl: null, lang }, { demo: true }));
}
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(join(out, '404.html'), `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nicht gefunden · INFINITY EARN</title></head><body style="font:16px/1.6 system-ui,sans-serif;background:#F7FAF9;color:#0E1D25;padding:48px 20px;text-align:center"><h1>Seite nicht gefunden</h1><p><a style="color:#087F82" href="/INFINITY-EARN/">Zur Startseite</a></p></body></html>`);
console.log(`GitHub-Pages-Fassung erzeugt in ${out}/ (DE/IT/EN, Links → ${APP_ORIGIN}, Produkte: ${OFFERED.join(', ')})`);
