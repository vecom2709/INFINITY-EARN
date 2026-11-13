import { readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import ts from 'typescript';
import { CSP, htmlFromBundle, type HtmlOptions } from './html.ts';
import type { Brand } from './ui/brand.ts';

/**
 * Bündelt das Offline-Programm: Fachlogik + Oberfläche werden mit dem TypeScript-Compiler übersetzt und mit einem
 * kleinen Modullader zu einem Skript zusammengefasst (keine weitere Abhängigkeit). Läuft nur zur Bauzeit in Node;
 * die Produktfabrik verwendet das vorab erzeugte Ergebnis (dist/bundle.generated.ts).
 */
const ROOT = 'products/mini-ww';
const ENTRY = `${ROOT}/ui/main.ts`;

function collect(entry: string): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (file: string): void => {
    const id = normalize(file).replace(/\\/g, '/');
    if (out.has(id)) return;
    const src = readFileSync(id, 'utf8');
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false, esModuleInterop: false, removeComments: true, newLine: ts.NewLineKind.LineFeed }, fileName: id }).outputText;
    out.set(id, js);
    for (const m of js.matchAll(/require\("(\.[^"]+)"\)/g)) visit(join(dirname(id), m[1] as string));
  };
  visit(entry);
  return out;
}

export function bundle(): string {
  const mods = collect(ENTRY);
  const entryId = normalize(ENTRY).replace(/\\/g, '/');
  const defs = [...mods.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, js]) => {
    const rel = relative(ROOT, id).replace(/\\/g, '/');
    return `${JSON.stringify(rel)}:function(require,module,exports){${js}\n}`;
  });
  return `(function(){"use strict";var D={${defs.join(',')}};var C={};
function res(from,p){var a=from.split("/");a.pop();p.split("/").forEach(function(s){if(s===".."){a.pop()}else if(s!=="."){a.push(s)}});return a.join("/")}
function mk(from){return function(p){var id=res(from,p);if(C[id])return C[id].exports;if(!D[id])throw new Error("Modul fehlt: "+id);var m={exports:{}};C[id]=m;D[id](mk(id),m,m.exports);return m.exports}}
mk("")(${JSON.stringify(relative(ROOT, entryId).replace(/\\/g, '/'))});})();`;
}

export { CSP };

/** Fertige HTML-Datei für einen Kunden (Kundendesign) oder als Demo – direkt aus den Quellen gebündelt. */
export function buildHtml(brand: Brand, opts: HtmlOptions = {}): string {
  return htmlFromBundle(bundle(), brand, opts);
}
