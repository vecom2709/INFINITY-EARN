/**
 * Minimaler ZIP-Baustein (Methode 0 „gespeichert“, ohne Kompression, ohne Fremdbibliothek) für Produktpakete.
 * Deterministisch: fester DOS-Zeitstempel, damit gleiche Inhalte gleiche Prüfsummen ergeben.
 * Der Leser dient der Qualitätsprüfung (Struktur + CRC32 jeder Datei).
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01

export function createZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(f.name)) throw new Error(`ZIP_NAME_INVALID:${f.name}`);
    const name = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, DOS_TIME, true); local.setUint16(12, DOS_DATE, true); local.setUint32(14, crc, true);
    local.setUint32(18, f.bytes.length, true); local.setUint32(22, f.bytes.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.bytes);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, DOS_TIME, true); cen.setUint16(14, DOS_DATE, true); cen.setUint32(16, crc, true); cen.setUint32(20, f.bytes.length, true);
    cen.setUint32(24, f.bytes.length, true); cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.bytes.length;
  }
  const cenSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

/** Liest ein ZIP (nur Methode 0) und prüft CRC32 jeder Datei. Wirft bei Strukturfehlern. */
export function readZip(bytes: Uint8Array): { name: string; bytes: Uint8Array; crcOk: boolean }[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  if (eocd < 0 || dv.getUint32(eocd, true) !== 0x06054b50) throw new Error('ZIP_EOCD_MISSING');
  const count = dv.getUint16(eocd + 10, true);
  let cp = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: { name: string; bytes: Uint8Array; crcOk: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(cp, true) !== 0x02014b50) throw new Error('ZIP_CENTRAL_INVALID');
    if (dv.getUint16(cp + 10, true) !== 0) throw new Error('ZIP_METHOD_UNSUPPORTED');
    const crc = dv.getUint32(cp + 16, true);
    const size = dv.getUint32(cp + 20, true);
    const nameLen = dv.getUint16(cp + 28, true);
    const extraLen = dv.getUint16(cp + 30, true);
    const commentLen = dv.getUint16(cp + 32, true);
    const local = dv.getUint32(cp + 42, true);
    const name = dec.decode(bytes.subarray(cp + 46, cp + 46 + nameLen));
    if (dv.getUint32(local, true) !== 0x04034b50) throw new Error('ZIP_LOCAL_INVALID');
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (data.length !== size) throw new Error('ZIP_TRUNCATED');
    out.push({ name, bytes: data, crcOk: crc32(data) === crc });
    cp += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
