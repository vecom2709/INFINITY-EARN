import { mkdirSync, writeFileSync } from 'node:fs';
import { buildHtml } from '../products/mini-ww/build.ts';

/**
 * Baut die Mini-Warenwirtschaft als Offline-Programm.
 *   node scripts/build-mini-ww.ts [Firma] [#Farbe] [de|it|en] [--demo]   → build/mini-ww/index.html
 */
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const company = args[0] ?? 'Musterfirma';
const primary = args[1] ?? '#1F5FA8';
const lang = (args[2] === 'it' || args[2] === 'en' ? args[2] : 'de') as 'de' | 'it' | 'en';
mkdirSync('build/mini-ww', { recursive: true });
const html = buildHtml({ company, primary, logoDataUrl: null, lang }, { demo: process.argv.includes('--demo') });
writeFileSync('build/mini-ww/index.html', html);
console.log(`build/mini-ww/index.html (${Math.round(html.length / 1024)} KB) für „${company}“, Farbe ${primary}, Sprache ${lang}`);
