import { readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import ts from 'typescript';
import type { Brand } from './ui/brand.ts';

/**
 * Baut das Offline-Programm als EINE HTML-Datei: Fachlogik + Oberfläche werden mit dem TypeScript-Compiler
 * übersetzt und mit einem kleinen Modullader gebündelt (keine weitere Abhängigkeit). Eine CSP im Dokument
 * verbietet jeden Netzwerkzugriff – das Programm kann keine Daten nach außen senden.
 */
const ROOT = 'products/mini-ww';
const ENTRY = `${ROOT}/ui/main.ts`;

function collect(entry: string): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (file: string): void => {
    const id = normalize(file).replace(/\\/g, '/');
    if (out.has(id)) return;
    const src = readFileSync(id, 'utf8');
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false, esModuleInterop: false, removeComments: true }, fileName: id }).outputText;
    out.set(id, js);
    for (const m of js.matchAll(/require\("(\.[^"]+)"\)/g)) visit(join(dirname(id), m[1] as string));
  };
  visit(entry);
  return out;
}

export function bundle(): string {
  const mods = collect(ENTRY);
  const entryId = normalize(ENTRY).replace(/\\/g, '/');
  const defs = [...mods.entries()].map(([id, js]) => {
    const rel = relative(ROOT, id).replace(/\\/g, '/');
    return `${JSON.stringify(rel)}:function(require,module,exports){${js}\n}`;
  });
  return `(function(){"use strict";var D={${defs.join(',')}};var C={};
function res(from,p){var a=from.split("/");a.pop();p.split("/").forEach(function(s){if(s===".."){a.pop()}else if(s!=="."){a.push(s)}});return a.join("/")}
function mk(from){return function(p){var id=res(from,p);if(C[id])return C[id].exports;if(!D[id])throw new Error("Modul fehlt: "+id);var m={exports:{}};C[id]=m;D[id](mk(id),m,m.exports);return m.exports}}
mk("")(${JSON.stringify(relative(ROOT, entryId).replace(/\\/g, '/'))});})();`;
}

export const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";

const escHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Fertige HTML-Datei für einen Kunden (Kundendesign) oder als Demo. */
export function buildHtml(brand: Brand, opts: { demo?: boolean } = {}): string {
  const cfg = JSON.stringify({ brand, demo: !!opts.demo }).replace(/</g, '\\u003c');
  const js = bundle().replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html lang="${brand.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${escHtml(brand.company)} – Warenwirtschaft</title>
<script type="application/json" id="mini-ww-config">${cfg}</script></head>
<body><div id="app"><p style="font:16px system-ui;padding:24px">Wird geladen …</p></div><noscript><p style="font:16px system-ui;padding:24px">Bitte JavaScript aktivieren – das Programm läuft vollständig in diesem Browser.</p></noscript>
<script>${js}</script></body></html>`;
}
