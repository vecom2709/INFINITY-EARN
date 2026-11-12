/**
 * Minimaler PDF-1.4-Textgenerator ohne Abhängigkeiten (läuft in Node und Cloudflare Workers).
 * Standardschriften Helvetica/Helvetica-Bold mit WinAnsiEncoding (Umlaute, ß, €, „“ – …).
 * Inhaltsströme bleiben reines ASCII (Nicht-ASCII als Oktal-Escape) → exakte Längen und xref-Offsets.
 */
export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  /** Abstand vor der Zeile in Punkt */
  gap?: number;
}

const WINANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f, '☐': 0x6f, '☑': 0x78,
};

/** Text → PDF-String-Literal (ohne Klammern), WinAnsi-kodiert, ASCII-sicher. */
export function pdfString(text: string): string {
  let out = '';
  for (const ch of text) {
    let code = WINANSI_EXTRA[ch] ?? ch.codePointAt(0) ?? 63;
    if (code > 0xff || (code >= 0x80 && code <= 0x9f && !Object.values(WINANSI_EXTRA).includes(code))) code = 63; // '?'
    if (code < 0x20) code = 32;
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code > 0x7e) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(code);
  }
  return out;
}

/** Grober Zeilenumbruch nach Durchschnittsbreite von Helvetica (~0,5 em). */
export function wrap(text: string, size: number, maxWidthPt = 495): string[] {
  const maxChars = Math.max(20, Math.floor(maxWidthPt / (size * 0.5)));
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if ((line ? `${line} ${word}` : word).length > maxChars && line) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
      while (line.length > maxChars) {
        out.push(line.slice(0, maxChars));
        line = line.slice(maxChars);
      }
    }
    out.push(line);
  }
  return out;
}

export function createTextPdf(opts: { title: string; lines: PdfLine[]; footer?: string; created?: Date }): Uint8Array {
  const pageH = 842;
  const top = 790;
  const bottom = 60;
  const left = 50;
  // Seiten setzen
  const pages: string[][] = [[]];
  let y = top;
  const page = (): string[] => pages[pages.length - 1] as string[];
  for (const l of opts.lines) {
    const size = l.size ?? 10;
    const lead = size * 1.35;
    y -= l.gap ?? 0;
    for (const part of wrap(l.text, size)) {
      if (y - lead < bottom) {
        pages.push([]);
        y = top;
      }
      y -= lead;
      page().push(`BT /${l.bold ? 'F2' : 'F1'} ${size} Tf ${left} ${y.toFixed(1)} Td (${pdfString(part)}) Tj ET`);
    }
  }
  const total = pages.length;
  const enc = new TextEncoder();
  const objects: string[] = [];
  // 1 Catalog, 2 Pages, 3 F1, 4 F2, 5 Info, danach je Seite: Page + Content
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${total} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const d = (opts.created ?? new Date()).toISOString().replace(/[-:T]/g, '').slice(0, 14);
  objects[5] = `<< /Title (${pdfString(opts.title)}) /Producer (INFINITY EARN) /CreationDate (D:${d}Z) >>`;
  pages.forEach((cmds, i) => {
    const footer = `BT /F1 8 Tf ${left} 30 Td (${pdfString(`${opts.footer ?? opts.title} · Seite ${i + 1} von ${total}`)}) Tj ET`;
    const stream = [...cmds, footer].join('\n');
    const pid = pageIds[i] as number;
    objects[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pid + 1} 0 R >>`;
    objects[pid + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = '%PDF-1.4\n%INFINITY-EARN\n'; // reines ASCII; Binär-Kommentar ist optional
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return enc.encode(pdf); // reines ASCII → Zeichen = Bytes
}
