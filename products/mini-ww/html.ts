import type { AppState } from './ui/actions.ts';
import type { Brand } from './ui/brand.ts';
import type { Setup } from './src/setup.ts';

/**
 * Setzt das Offline-Programm aus dem vorab gebündelten Code und der Kundenkonfiguration zu EINER HTML-Datei zusammen.
 * Ohne Compiler und ohne Dateisystem – läuft daher auch in der Produktfabrik (Cloudflare Worker).
 * Eine CSP im Dokument verbietet jeden Netzwerkzugriff – das Programm kann keine Daten nach außen senden.
 */
export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";

export interface HtmlOptions { demo?: boolean; setup?: Setup; seed?: AppState }

const escHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const TITLE = { de: 'Warenwirtschaft', it: 'Gestione magazzino', en: 'Inventory management' } as const;
const NOSCRIPT = {
  de: 'Bitte JavaScript aktivieren – das Programm läuft vollständig in diesem Browser.',
  it: 'Attivare JavaScript – il programma funziona interamente in questo browser.',
  en: 'Please enable JavaScript – the program runs entirely in this browser.',
} as const;
const LOADING = { de: 'Wird geladen …', it: 'Caricamento …', en: 'Loading …' } as const;

export function htmlFromBundle(bundleJs: string, brand: Brand, opts: HtmlOptions = {}): string {
  const cfg = JSON.stringify({ brand, demo: !!opts.demo, ...(opts.setup ? { setup: opts.setup } : {}), ...(opts.seed ? { seed: opts.seed } : {}) }).replace(/</g, '\\u003c');
  const js = embeddedBundle(bundleJs);
  const lang = brand.lang;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${escHtml(brand.company)} – ${TITLE[lang]}</title>
<script type="application/json" id="mini-ww-config">${cfg}</script></head>
<body><div id="app"><p style="font:16px system-ui;padding:24px">${LOADING[lang]}</p></div><noscript><p style="font:16px system-ui;padding:24px">${NOSCRIPT[lang]}</p></noscript>
<script>${js}</script></body></html>`;
}

/** Liest die eingebettete Konfiguration aus einer gebauten Datei (für die Abnahmeprüfung). */
export function readConfig(html: string): { brand: Brand; demo: boolean; setup?: Setup; seed?: unknown } | null {
  const m = /<script type="application\/json" id="mini-ww-config">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1] as string) as { brand: Brand; demo: boolean; setup?: Setup; seed?: unknown };
  } catch {
    return null;
  }
}

/** Eingebetteter Programmcode in der Form, wie er in der Datei steht. */
export const embeddedBundle = (bundleJs: string): string => bundleJs.replace(/<\/script/gi, '<\\/script');

/** Liest den eingebetteten Programmcode (letzter Skriptblock) unverändert aus einer gebauten Datei. */
export function readBundle(html: string): string | null {
  const m = /<script>([\s\S]*)<\/script><\/body><\/html>$/.exec(html);
  return m ? (m[1] as string) : null;
}
