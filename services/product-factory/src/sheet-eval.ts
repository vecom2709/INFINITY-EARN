/**
 * Eigene, kleine Tabellen-Rechenmaschine (nachgebaut, ohne installierte Programme und ohne Fremdbibliothek):
 * wertet die Formeln einer Arbeitsmappe aus – Zellbezüge, Bereiche, + − * /, Klammern, SUM, ROUND, ROUNDUP.
 * Damit prüft die Abnahme die TATSÄCHLICHEN Formeln der Datei, unabhängig von gespeicherten Ergebnissen.
 * Rundung wie in Tabellenprogrammen: kaufmännisch (ROUND) bzw. vom Nullpunkt weg (ROUNDUP), mit Ausgleich
 * kleinster Gleitkomma-Abweichungen.
 */
export interface SheetCell { f?: string; v?: string; s?: string }

type Tok = { t: 'num'; v: number } | { t: 'ref'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Z]{1,3}\d{1,7})|([A-Z]+)(?=\()|([-+*/(),:]))/gy;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new Error(`FORMULA_SYNTAX at ${pos}: ${src.slice(pos, pos + 12)}`);
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'ref', v: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'id', v: m[3] });
    else out.push({ t: 'op', v: m[4] as string });
    pos = re.lastIndex;
  }
  return out;
}

const EPS = 1e-9;
// „|| 0“ macht aus einer negativen Null eine normale Null (Tabellenprogramme kennen keine −0).
const round = (x: number, d: number): number => { const f = 10 ** d; return (Math.sign(x) * Math.round(Math.abs(x) * f + EPS)) / f || 0; };
const roundUp = (x: number, d: number): number => { const f = 10 ** d; return (Math.sign(x) * Math.ceil(Math.abs(x) * f - EPS)) / f || 0; };

function colRow(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref) as RegExpExecArray;
  let c = 0;
  for (const ch of m[1] as string) c = c * 26 + (ch.charCodeAt(0) - 64);
  return [c, Number(m[2])];
}
const colName = (c: number): string => { let s = ''; while (c > 0) { s = String.fromCharCode(65 + ((c - 1) % 26)) + s; c = Math.floor((c - 1) / 26); } return s; };

/** Wertet alle Formeln aus. `overrides` ersetzt Eingabewerte (z. B. geänderte Menge) – wie eine Eingabe im Tabellenprogramm. */
export function evaluateSheet(cells: Map<string, SheetCell>, overrides: Record<string, number> = {}): Map<string, number> {
  const memo = new Map<string, number>();
  const busy = new Set<string>();
  const value = (ref: string): number => {
    if (ref in overrides) return overrides[ref] as number;
    const hit = memo.get(ref);
    if (hit !== undefined) return hit;
    const c = cells.get(ref);
    if (!c) return 0;
    if (c.f === undefined) return c.v !== undefined ? Number(c.v) : 0;
    if (busy.has(ref)) throw new Error(`FORMULA_CYCLE ${ref}`);
    busy.add(ref);
    const r = run(c.f);
    busy.delete(ref);
    memo.set(ref, r);
    return r;
  };
  const run = (src: string): number => {
    const toks = tokenize(src);
    let i = 0;
    const peek = (): Tok | undefined => toks[i];
    const eat = (v: string): void => { const t = toks[i++]; if (!t || t.t !== 'op' || t.v !== v) throw new Error(`FORMULA_EXPECTED ${v}`); };
    const isOp = (v: string): boolean => { const t = peek(); return !!t && t.t === 'op' && t.v === v; };
    const range = (a: string, b: string): number[] => {
      const [c1, r1] = colRow(a);
      const [c2, r2] = colRow(b);
      const out: number[] = [];
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) out.push(value(`${colName(c)}${r}`));
      return out;
    };
    const args = (): number[][] => {
      const list: number[][] = [];
      eat('(');
      if (!isOp(')')) {
        for (;;) {
          const t = peek();
          const next = toks[i + 1];
          if (t?.t === 'ref' && next?.t === 'op' && next.v === ':') {
            const end = toks[i + 2];
            if (end?.t !== 'ref') throw new Error('FORMULA_RANGE');
            i += 3;
            list.push(range(t.v, end.v));
          } else list.push([expr()]);
          if (isOp(',')) { i++; continue; }
          break;
        }
      }
      eat(')');
      return list;
    };
    const one = (a: number[][], n: number): number => { const x = a[n]; if (!x || x.length !== 1) throw new Error('FORMULA_ARGUMENT'); return x[0] as number; };
    const factor = (): number => {
      const t = toks[i++];
      if (!t) throw new Error('FORMULA_END');
      if (t.t === 'num') return t.v;
      if (t.t === 'ref') return value(t.v);
      if (t.t === 'op' && t.v === '(') { const v = expr(); eat(')'); return v; }
      if (t.t === 'op' && t.v === '-') return -factor();
      if (t.t === 'id') {
        const a = args();
        if (t.v === 'SUM') return a.flat().reduce((x, y) => x + y, 0);
        if (t.v === 'ROUND') return round(one(a, 0), one(a, 1));
        if (t.v === 'ROUNDUP') return roundUp(one(a, 0), one(a, 1));
        throw new Error(`FORMULA_FUNCTION ${t.v}`);
      }
      throw new Error('FORMULA_TOKEN');
    };
    const term = (): number => {
      let v = factor();
      for (;;) {
        if (isOp('*')) { i++; v *= factor(); } else if (isOp('/')) { i++; v /= factor(); } else return v;
      }
    };
    function expr(): number {
      let v = term();
      for (;;) {
        if (isOp('+')) { i++; v += term(); } else if (isOp('-')) { i++; v -= term(); } else return v;
      }
    }
    const v = expr();
    if (i !== toks.length) throw new Error('FORMULA_TRAILING');
    return v;
  };
  const out = new Map<string, number>();
  for (const [ref, c] of cells) if (c.f !== undefined) out.set(ref, value(ref));
  return out;
}
