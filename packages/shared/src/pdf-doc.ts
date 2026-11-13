import { pdfString } from './pdf.ts';

/**
 * Gestalteter PDF-1.4-Dokumentbau ohne Abhängigkeiten (Node und Cloudflare Workers): Fließtext mit echten
 * Helvetica-Laufweiten, Überschriften, Aufzählungen, Farbflächen und eingebettete JPEG-Bilder (DCTDecode).
 * Byte-genaue xref-Offsets auch mit Binärdaten. Keine Skripte, keine aktiven Inhalte.
 */
export type Rgb = [number, number, number];

// Helvetica / Helvetica-Bold, Zeichen 32–126 (AFM-Laufweiten in 1/1000 em)
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const BASE: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', Ä: 'A', Ö: 'O', Ü: 'U', à: 'a', á: 'a', è: 'e', é: 'e', ì: 'i', í: 'i', ò: 'o', ó: 'o', ù: 'u', ú: 'u', À: 'A', È: 'E', É: 'E', Ì: 'I', Ò: 'O', Ù: 'U', ç: 'c', ñ: 'n' };
const SPECIAL: Record<string, number> = { ß: 611, '€': 556, '–': 556, '—': 1000, '„': 333, '“': 333, '”': 333, '‘': 222, '’': 222, '…': 1000, '•': 350, '×': 584, '·': 278, '→': 1000 };

export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of text) {
    const c = (BASE[ch] ?? ch).codePointAt(0) ?? 63;
    w += SPECIAL[ch] ?? (c >= 32 && c <= 126 ? (table[c - 32] as number) : 556);
  }
  return (w * size) / 1000;
}

/** Zeilenumbruch nach echter Laufweite. */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (line && textWidth(cand, size, bold) > maxWidth) {
        out.push(line);
        line = word;
      } else line = cand;
    }
    out.push(line);
  }
  return out;
}

/** Breite, Höhe und Farbkanäle aus einem JPEG (SOF-Marker). */
export function jpegInfo(bytes: Uint8Array): { width: number; height: number; components: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('JPEG_INVALID: kein JPEG');
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('JPEG_INVALID: Markerfolge');
    const marker = bytes[i + 1] as number;
    const len = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: ((bytes[i + 5] as number) << 8) | (bytes[i + 6] as number), width: ((bytes[i + 7] as number) << 8) | (bytes[i + 8] as number), components: bytes[i + 9] as number };
    }
    i += 2 + len;
  }
  throw new Error('JPEG_INVALID: keine Bildgröße');
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString();
const col = (c: Rgb): string => c.map((v) => f(v / 255)).join(' ');

export interface DocOptions {
  title: string;
  author?: string;
  lang?: string;
  created?: Date;
  /** Fußzeile je Seite (nicht auf dem Deckblatt), z. B. „Seite 2 von 9“ */
  footer?: (page: number, total: number) => string;
  ink?: Rgb;
  muted?: Rgb;
  accent?: Rgb;
}

interface Img { name: string; bytes: Uint8Array; width: number; height: number; components: number }

export class PdfDoc {
  readonly pageW = 595;
  readonly pageH = 842;
  readonly margin = 56;
  readonly contentW = 595 - 2 * 56;
  private pages: string[][] = [];
  private pageImages: Set<string>[] = [];
  private images: Img[] = [];
  private noFooter = new Set<number>();
  y = 0;
  readonly ink: Rgb;
  readonly muted: Rgb;
  readonly accent: Rgb;

  private opts: DocOptions;

  constructor(opts: DocOptions) {
    this.opts = opts;
    this.ink = opts.ink ?? [14, 29, 37];
    this.muted = opts.muted ?? [84, 98, 108];
    this.accent = opts.accent ?? [31, 95, 168];
  }

  get pageCount(): number {
    return this.pages.length;
  }

  get imageCount(): number {
    return this.images.length;
  }

  newPage(opts: { footer?: boolean } = {}): void {
    this.pages.push([]);
    this.pageImages.push(new Set());
    if (opts.footer === false) this.noFooter.add(this.pages.length - 1);
    this.y = this.pageH - this.margin;
  }

  private cmd(s: string): void {
    if (!this.pages.length) this.newPage();
    (this.pages[this.pages.length - 1] as string[]).push(s);
  }

  /** Sorgt für Platz; sonst neue Seite. */
  ensure(h: number): void {
    if (!this.pages.length || this.y - h < this.margin + 18) this.newPage();
  }

  rect(x: number, y: number, w: number, h: number, fill: Rgb): void {
    this.cmd(`q ${col(fill)} rg ${f(x)} ${f(y)} ${f(w)} ${f(h)} re f Q`);
  }

  strokeRect(x: number, y: number, w: number, h: number, stroke: Rgb, width = 0.75): void {
    this.cmd(`q ${col(stroke)} RG ${f(width)} w ${f(x)} ${f(y)} ${f(w)} ${f(h)} re S Q`);
  }

  text(x: number, y: number, s: string, o: { size?: number; bold?: boolean; color?: Rgb } = {}): void {
    this.cmd(`BT ${col(o.color ?? this.ink)} rg /${o.bold ? 'F2' : 'F1'} ${f(o.size ?? 10.5)} Tf ${f(x)} ${f(y)} Td (${pdfString(s)}) Tj ET`);
  }

  /** Fließtext an der Schreibposition; bricht über Seiten um. */
  paragraph(s: string, o: { size?: number; bold?: boolean; color?: Rgb; indent?: number; gapAfter?: number; width?: number } = {}): void {
    const size = o.size ?? 10.5;
    const lead = size * 1.42;
    const x = this.margin + (o.indent ?? 0);
    for (const line of wrapText(s, size, (o.width ?? this.contentW) - (o.indent ?? 0), o.bold)) {
      this.ensure(lead);
      this.y -= lead;
      this.text(x, this.y + size * 0.28, line, { size, bold: o.bold, color: o.color });
    }
    this.y -= o.gapAfter ?? size * 0.6;
  }

  heading(s: string, level: 1 | 2 = 1): void {
    const size = level === 1 ? 19 : 13;
    this.ensure(size * 2 + 60); // nie allein am Seitenende
    this.y -= level === 1 ? 6 : 4;
    if (level === 1) this.rect(this.margin, this.y - 4, 28, 3, this.accent);
    this.y -= level === 1 ? 12 : 0;
    this.paragraph(s, { size, bold: true, gapAfter: level === 1 ? 10 : 4 });
  }

  bullets(items: string[], o: { numbered?: boolean } = {}): void {
    items.forEach((it, i) => {
      const size = 10.5;
      const lead = size * 1.42;
      const lines = wrapText(it, size, this.contentW - 18);
      this.ensure(lead);
      lines.forEach((line, j) => {
        this.ensure(lead);
        this.y -= lead;
        if (j === 0) this.text(this.margin + 2, this.y + size * 0.28, o.numbered ? `${i + 1}.` : '•', { size, bold: !!o.numbered, color: this.accent });
        this.text(this.margin + 18, this.y + size * 0.28, line, { size });
      });
      this.y -= 3;
    });
    this.y -= 6;
  }

  /** Hinweiskasten mit Akzentkante. */
  note(s: string, o: { label?: string } = {}): void {
    const size = 9.5;
    const lead = size * 1.42;
    const lines = wrapText(o.label ? `${o.label} ${s}` : s, size, this.contentW - 28);
    const h = lines.length * lead + 16;
    this.ensure(h + 8);
    this.rect(this.margin, this.y - h, this.contentW, h, [242, 246, 250]);
    this.rect(this.margin, this.y - h, 3, h, this.accent);
    let y = this.y - 8;
    for (const line of lines) {
      y -= lead;
      this.text(this.margin + 16, y + size * 0.3, line, { size, color: this.ink });
    }
    this.y -= h + 12;
  }

  /** JPEG einbetten; skaliert auf die gewünschte Breite, hält das Seitenverhältnis. */
  image(bytes: Uint8Array, o: { width?: number; caption?: string; x?: number; frame?: boolean } = {}): void {
    const info = jpegInfo(bytes);
    if (info.components !== 3 && info.components !== 1) throw new Error('JPEG_INVALID: nur RGB oder Graustufen');
    const name = `Im${this.images.length + 1}`;
    this.images.push({ name, bytes, ...info });
    const w = o.width ?? this.contentW;
    const h = (w * info.height) / info.width;
    const capH = o.caption ? 22 : 0;
    this.ensure(h + capH + 10);
    const x = o.x ?? this.margin + (this.contentW - w) / 2;
    this.y -= h;
    if (o.frame !== false) {
      this.rect(x + 2, this.y - 2, w, h, [226, 232, 238]); // dezenter Schatten
      this.strokeRect(x, this.y, w, h, [205, 213, 221]);
    }
    this.cmd(`q ${f(w)} 0 0 ${f(h)} ${f(x)} ${f(this.y)} cm /${name} Do Q`);
    (this.pageImages[this.pageImages.length - 1] as Set<string>).add(name);
    if (o.caption) {
      this.y -= 15;
      this.text(x, this.y, o.caption, { size: 8.5, color: this.muted });
      this.y -= 7;
    }
    this.y -= 12;
  }

  /** Fertiges PDF als Bytes (binärsicher). */
  toBytes(): Uint8Array {
    if (!this.pages.length) this.newPage();
    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const push = (b: Uint8Array | string): void => {
      const u = typeof b === 'string' ? enc.encode(b) : b;
      chunks.push(u);
      size += u.length;
    };
    const offsets: number[] = [];
    let nextId = 1;
    const reserve = (): number => nextId++;
    const catalogId = reserve();
    const pagesId = reserve();
    const f1 = reserve();
    const f2 = reserve();
    const infoId = reserve();
    const imgIds = new Map(this.images.map((im) => [im.name, reserve()]));
    const total = this.pages.length;
    const pageIds = this.pages.map(() => [reserve(), reserve()] as [number, number]);
    const objs = new Map<number, (Uint8Array | string)[]>();
    objs.set(catalogId, [`<< /Type /Catalog /Pages ${pagesId} 0 R${this.opts.lang ? ` /Lang (${pdfString(this.opts.lang)})` : ''} >>`]);
    objs.set(pagesId, [`<< /Type /Pages /Kids [${pageIds.map(([p]) => `${p} 0 R`).join(' ')}] /Count ${total} >>`]);
    objs.set(f1, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
    objs.set(f2, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
    const d = (this.opts.created ?? new Date()).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    objs.set(infoId, [`<< /Title (${pdfString(this.opts.title)}) /Author (${pdfString(this.opts.author ?? '')}) /Producer (INFINITY EARN) /CreationDate (D:${d}Z) >>`]);
    for (const im of this.images) {
      objs.set(imgIds.get(im.name) as number, [`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /${im.components === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`, im.bytes, '\nendstream']);
    }
    this.pages.forEach((cmds, i) => {
      const [pid, cid] = pageIds[i] as [number, number];
      const footer = this.opts.footer && !this.noFooter.has(i)
        ? [`q ${col([220, 226, 232])} rg ${this.margin} 40 ${this.contentW} 0.6 re f Q`, `BT ${col(this.muted)} rg /F1 8 Tf ${this.margin} 28 Td (${pdfString(this.opts.footer(i + 1, total))}) Tj ET`]
        : [];
      const stream = [...cmds, ...footer].join('\n');
      const xobj = [...(this.pageImages[i] as Set<string>)].map((n) => `/${n} ${imgIds.get(n)} 0 R`).join(' ');
      objs.set(pid, [`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.pageW} ${this.pageH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj ? ` /XObject << ${xobj} >>` : ''} >> /Contents ${cid} 0 R >>`]);
      objs.set(cid, [`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]); // Inhaltsstrom reines ASCII
    });
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.4 + Binärkennung
    for (let id = 1; id < nextId; id++) {
      offsets[id] = size;
      push(`${id} 0 obj\n`);
      for (const part of objs.get(id) ?? ['null']) push(part);
      push('\nendobj\n');
    }
    const xrefAt = size;
    let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
    for (let id = 1; id < nextId; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    push(`${xref}trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
    const out = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}
