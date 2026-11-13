/**
 * Minimaler, abhängigkeitsfreier Parser für multipart/form-data (Datei-Upload per HTML-Formular, ohne JavaScript).
 * Arbeitet auf Bytes; Feldwerte werden als UTF-8 gelesen. Höchstens `maxParts` Teile, sonst null.
 */
export interface MultipartFile { field: string; filename: string; contentType: string; data: Uint8Array }
export interface Multipart { fields: Map<string, string>; files: MultipartFile[] }

function indexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

export function boundaryOf(contentType: string | undefined): string | null {
  if (!contentType || !/^multipart\/form-data/i.test(contentType)) return null;
  const m = /boundary=(?:"([^"]{1,70})"|([^;\s]{1,70}))/i.exec(contentType);
  return m?.[1] ?? m?.[2] ?? null;
}

export function parseMultipart(body: Uint8Array, contentType: string | undefined, maxParts = 10): Multipart | null {
  const boundary = boundaryOf(contentType);
  if (!boundary) return null;
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');
  const delim = enc.encode(`--${boundary}`);
  const out: Multipart = { fields: new Map(), files: [] };
  let pos = indexOf(body, delim, 0);
  if (pos < 0) return null;
  let parts = 0;
  while (pos >= 0) {
    let start = pos + delim.length;
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break; // Ende „--boundary--“
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;
    const next = indexOf(body, delim, start);
    if (next < 0) return null;
    if (++parts > maxParts) return null;
    let end = next;
    if (body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2;
    const headerEnd = indexOf(body, enc.encode('\r\n\r\n'), start);
    if (headerEnd < 0 || headerEnd > end) return null;
    const headers = dec.decode(body.subarray(start, headerEnd));
    const data = body.slice(headerEnd + 4, end);
    const disp = /content-disposition:\s*form-data;([^\r\n]*)/i.exec(headers)?.[1] ?? '';
    const name = /\bname="([^"]*)"/i.exec(disp)?.[1];
    const filename = /\bfilename="([^"]*)"/i.exec(disp)?.[1];
    const ctype = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? 'application/octet-stream';
    if (name) {
      if (filename !== undefined) out.files.push({ field: name, filename, contentType: ctype, data });
      else out.fields.set(name, dec.decode(data));
    }
    pos = next;
  }
  return out;
}
