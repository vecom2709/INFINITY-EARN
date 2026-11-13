import { sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { readZip } from '../../../packages/shared/src/zip.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { getStandard } from './quality-standard.ts';
import type { QaCheckResult } from './types.ts';

/**
 * Admin Live Preview & Product Inspection (Gesamtprompt §5): jedes produzierte Kundenprodukt mit echtem Stand –
 * Version, Prüfsumme, Prüfprotokoll, zugesagte und fehlende Funktionen, Lieferhistorie und ein echter Viewer
 * (Tabelle als Tabelle, PDF im Browser-Viewer, ZIP-Inhalt). Gibt es keinen ausführbaren Viewer, steht dort ehrlich
 * „Noch keine Live-Vorschau verfügbar“. Nur lesend; löst keine Zahlungen aus und verändert keine Kundendaten.
 */
export type ViewerKind = 'table' | 'pdf' | 'zip' | 'none';

export interface GalleryItem {
  artifactId: string;
  orderId: string;
  customer: string | null;
  title: string;
  capabilityId: string;
  version: number;
  capabilityVersion: number;
  sha256: string;
  bytes: number;
  createdAt: string;
  qaPassed: boolean | null;
  failedChecks: string[];
  delivered: { at: string; downloads: number; revoked: string | null } | null;
  quarantined: boolean;
  viewer: ViewerKind;
}

export function viewerFor(mediaType: string): ViewerKind {
  if (mediaType.startsWith('text/csv')) return 'table';
  if (mediaType === 'application/pdf') return 'pdf';
  if (mediaType === 'application/zip') return 'zip';
  return 'none';
}

interface Row {
  artifact_id: string; order_id: string; capability_id: string; capability_version: number; version: number; sha256: string; bytes: number;
  media_type: string; quarantined_at: string | null; created_at: string; customer: string | null; title: string;
  qa_passed: number | null; qa_json: string | null; released_at: string | null; download_count: number | null; revoked_at: string | null;
}

const SELECT = `SELECT a.artifact_id, a.order_id, a.capability_id, a.capability_version, a.version, a.sha256, a.bytes, a.media_type, a.quarantined_at, a.created_at,
  c.name AS customer, q.description AS title,
  (SELECT passed FROM qa_runs r WHERE r.artifact_id = a.artifact_id ORDER BY r.created_at DESC LIMIT 1) AS qa_passed,
  (SELECT results_json FROM qa_runs r WHERE r.artifact_id = a.artifact_id ORDER BY r.created_at DESC LIMIT 1) AS qa_json,
  d.released_at, d.download_count, d.revoked_at
  FROM artifacts a JOIN orders o ON o.order_id = a.order_id JOIN customers c ON c.customer_id = o.customer_id JOIN quotes q ON q.quote_id = o.quote_id
  LEFT JOIN deliveries d ON d.artifact_id = a.artifact_id`;

function toItem(r: Row): GalleryItem {
  const checks = r.qa_json ? (JSON.parse(r.qa_json) as QaCheckResult[]) : [];
  return {
    artifactId: r.artifact_id, orderId: r.order_id, customer: r.customer, title: r.title, capabilityId: r.capability_id, version: r.version,
    capabilityVersion: r.capability_version, sha256: r.sha256, bytes: r.bytes, createdAt: r.created_at,
    qaPassed: r.qa_passed === null ? null : r.qa_passed === 1, failedChecks: checks.filter((c) => !c.passed).map((c) => c.check),
    delivered: r.released_at ? { at: r.released_at, downloads: r.download_count ?? 0, revoked: r.revoked_at } : null,
    quarantined: !!r.quarantined_at, viewer: viewerFor(r.media_type),
  };
}

export function previewGallery(ctx: AppContext, test: boolean, search = ''): GalleryItem[] {
  const s = `%${search.trim().toLowerCase()}%`;
  return ctx.db.all<Row>(
    `${SELECT} WHERE a.test_mode = ? AND (? = '%%' OR lower(coalesce(c.name, '')) LIKE ? OR lower(q.description) LIKE ? OR a.order_id LIKE ? OR a.sha256 LIKE ?)
     ORDER BY a.created_at DESC LIMIT 200`, test ? 1 : 0, s, s, s, s, s,
  ).map(toItem);
}

export interface PreviewDetail extends GalleryItem {
  checks: QaCheckResult[];
  promised: { text: string; check: string; passed: boolean | null }[];
  versions: { artifactId: string; version: number; createdAt: string; sha256: string; qaPassed: boolean | null }[];
  integrity: 'OK' | 'MISSING' | 'CHECKSUM_MISMATCH';
  table: string[][] | null;
  zipEntries: { name: string; bytes: number; crcOk: boolean; viewer: ViewerKind }[] | null;
}

/** Liest die Datei für den Eigentümer (auch gesperrte Dateien – zur Prüfung), immer mit Prüfsummenkontrolle. */
export function readForOwner(ctx: AppContext, artifactId: string): { ok: true; bytes: Uint8Array; mediaType: string } | { ok: false; reason: 'NOT_FOUND' | 'MISSING' | 'CHECKSUM_MISMATCH' } {
  const a = ctx.db.get<{ path: string; sha256: string; media_type: string }>('SELECT path, sha256, media_type FROM artifacts WHERE artifact_id = ?', artifactId);
  if (!a) return { ok: false, reason: 'NOT_FOUND' };
  const bytes = ctx.blobs.get(a.path);
  if (!bytes) return { ok: false, reason: 'MISSING' };
  if (sha256Hex(bytes) !== a.sha256) return { ok: false, reason: 'CHECKSUM_MISMATCH' };
  return { ok: true, bytes, mediaType: a.media_type };
}

/** RFC-4180-CSV in Zeilen/Zellen (für die Tabellenansicht); begrenzt auf 500 Zeilen. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
      if (rows.length >= 500) return rows;
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function previewDetail(ctx: AppContext, artifactId: string): PreviewDetail | null {
  const r = ctx.db.get<Row>(`${SELECT} WHERE a.artifact_id = ?`, artifactId);
  if (!r) return null;
  const item = toItem(r);
  const checks = r.qa_json ? (JSON.parse(r.qa_json) as QaCheckResult[]) : [];
  const std = getStandard(r.capability_id);
  const promised = std
    ? [...std.design, ...std.features, ...std.accessibilityAndSecurity].map((v) => ({ text: v.text, check: v.verifiedBy, passed: checks.find((c) => c.check === v.verifiedBy)?.passed ?? null }))
    : [];
  const versions = ctx.db.all<{ artifact_id: string; version: number; created_at: string; sha256: string; qa: number | null }>(
    `SELECT a.artifact_id, a.version, a.created_at, a.sha256, (SELECT passed FROM qa_runs r WHERE r.artifact_id = a.artifact_id ORDER BY r.created_at DESC LIMIT 1) AS qa
     FROM artifacts a WHERE a.order_id = ? ORDER BY a.version DESC`, r.order_id,
  ).map((v) => ({ artifactId: v.artifact_id, version: v.version, createdAt: v.created_at, sha256: v.sha256, qaPassed: v.qa === null ? null : v.qa === 1 }));
  const file = readForOwner(ctx, artifactId);
  let table: string[][] | null = null;
  let zipEntries: PreviewDetail['zipEntries'] = null;
  if (file.ok && item.viewer === 'table') table = parseCsv(new TextDecoder().decode(file.bytes));
  if (file.ok && item.viewer === 'zip') {
    const entries = readZip(file.bytes);
    zipEntries = entries.map((z) => ({ name: z.name, bytes: z.bytes.length, crcOk: z.crcOk, viewer: z.name.endsWith('.csv') ? 'table' : z.name.endsWith('.pdf') ? 'pdf' : 'none' }));
    const csv = entries.find((z) => z.name.endsWith('.csv') && z.crcOk);
    if (csv) table = parseCsv(new TextDecoder().decode(csv.bytes));
  }
  return { ...item, checks, promised, versions, integrity: file.ok ? 'OK' : file.reason === 'NOT_FOUND' ? 'MISSING' : file.reason, table, zipEntries };
}

/** Rohdatei (oder eine Datei aus dem ZIP) zur Anzeige im Browser – nur für den angemeldeten Eigentümer. */
export function previewFile(ctx: AppContext, artifactId: string, inner?: string): { bytes: Uint8Array; mediaType: string; name: string } | null {
  const file = readForOwner(ctx, artifactId);
  if (!file.ok) return null;
  if (!inner) return { bytes: file.bytes, mediaType: file.mediaType, name: `vorschau.${file.mediaType === 'application/pdf' ? 'pdf' : file.mediaType === 'application/zip' ? 'zip' : 'csv'}` };
  if (file.mediaType !== 'application/zip') return null;
  const z = readZip(file.bytes).find((e) => e.name === inner && e.crcOk);
  if (!z) return null;
  return { bytes: z.bytes, mediaType: inner.endsWith('.pdf') ? 'application/pdf' : 'text/csv; charset=utf-8', name: inner };
}
