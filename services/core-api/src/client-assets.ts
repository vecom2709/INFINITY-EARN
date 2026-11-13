import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from './context.ts';
import { customerByKey } from './customers.ts';
import { WorkflowError } from './errors.ts';

/**
 * Funktion 161 – Secure Client Asset & Access Concierge (Gesamtprompt 157, Anlage J).
 *
 *  - Anfrage nur beim zugeordneten Kunden (Auftrag → Kunde). Andere Kunden sehen und erreichen sie nicht.
 *  - Upload-Prüfung: Größe, erlaubte Endung je Art, Magic Bytes passend zur Endung, keine ausführbaren Dateien,
 *    keine Makros, EICAR-Testsignatur, keine Zugangsdaten in Textdateien. Abgelehnte Dateien werden nicht gespeichert.
 *    Ehrlich: Das ist eine Format- und Signaturprüfung, kein vollständiger Virenscanner.
 *  - Nutzungsrechte: Ohne Bestätigung bleibt eine Datei gesperrt (keine Freigabe an die Produktion).
 *  - Freigabe an die Produktion: auftragsbezogen, befristet, jederzeit widerrufbar; jeder Zugriff wird geprüft und protokolliert.
 *  - Zugänge: Passwörter oder Schlüssel werden nie angenommen; nur „Einladung erteilt“ mit Notiz, die auf Geheimnisse geprüft wird.
 *  - Dubletten: gleiche Datei = keine neue Version; andere Datei = neue Version, die alte bleibt erhalten.
 */

export const UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
export const GRANT_DAYS = 90;
export type AssetKind = 'logo' | 'document' | 'data' | 'access';

const ALLOWED: Record<Exclude<AssetKind, 'access'>, readonly string[]> = {
  logo: ['png', 'jpg', 'jpeg', 'webp', 'pdf'],
  document: ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'txt'],
  data: ['csv', 'xlsx', 'json', 'txt'],
};
const MEDIA: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Muster für Zugangsdaten. Treffer werden nie gespeichert, nie ausgegeben und nie protokolliert. */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/,
  /\bwhsec_[A-Za-z0-9]{8,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(password|passwort|kennwort|pwd|pass|api[_ -]?key|secret|token|zugangsdaten)\s*[:=]\s*\S{4,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/-]{16,}/i,
  /\b[a-f0-9]{32,}\b/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
];
export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

const startsWith = (b: Uint8Array, sig: number[], at = 0): boolean => sig.every((v, i) => b[at + i] === v);
const latin1 = (b: Uint8Array, max = b.length): string => { let s = ''; for (let i = 0; i < Math.min(max, b.length); i++) s += String.fromCharCode(b[i] ?? 0); return s; };

export interface ScanResult { ok: boolean; reason: string; ext: string; mediaType: string }

/** Format- und Sicherheitsprüfung einer hochgeladenen Datei (ohne Ausführung, ohne Netzwerk). */
export function scanUpload(kind: Exclude<AssetKind, 'access'>, filename: string, b: Uint8Array): ScanResult {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(filename)?.[1] ?? '').toLowerCase();
  const res = (ok: boolean, reason: string): ScanResult => ({ ok, reason, ext, mediaType: MEDIA[ext] ?? 'application/octet-stream' });
  if (b.length === 0) return res(false, 'Leere Datei');
  if (b.length > UPLOAD_MAX_BYTES) return res(false, `Datei größer als ${UPLOAD_MAX_BYTES / 1024 / 1024} MB`);
  if (!ALLOWED[kind].includes(ext)) return res(false, `Dateityp .${ext || '?'} ist für diese Anfrage nicht erlaubt (erlaubt: ${ALLOWED[kind].join(', ')})`);
  if (startsWith(b, [0x4d, 0x5a]) || startsWith(b, [0x7f, 0x45, 0x4c, 0x46]) || startsWith(b, [0x23, 0x21]) || startsWith(b, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xca, 0xfe, 0xba, 0xbe])) return res(false, 'Ausführbare Datei – nicht erlaubt');
  const head = latin1(b, 4096);
  if (latin1(b).includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) return res(false, 'Schadsoftware-Signatur erkannt (EICAR)');
  switch (ext) {
    case 'png': if (!startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return res(false, 'Inhalt ist kein PNG'); break;
    case 'jpg': case 'jpeg': if (!startsWith(b, [0xff, 0xd8, 0xff])) return res(false, 'Inhalt ist kein JPEG'); break;
    case 'webp': if (!(head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP')) return res(false, 'Inhalt ist kein WebP'); break;
    case 'pdf': {
      if (!head.startsWith('%PDF-')) return res(false, 'Inhalt ist kein PDF');
      if (/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(latin1(b))) return res(false, 'PDF mit eingebettetem Skript oder Dateianhang – nicht erlaubt');
      break;
    }
    case 'docx': case 'xlsx': case 'pptx': {
      const all = latin1(b);
      if (!startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || !all.includes('[Content_Types].xml')) return res(false, 'Inhalt ist keine Office-Datei');
      if (all.includes('vbaProject.bin')) return res(false, 'Office-Datei mit Makros – nicht erlaubt');
      break;
    }
    case 'csv': case 'txt': case 'json': {
      if (b.includes(0)) return res(false, 'Textdatei enthält Binärdaten');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return res(false, 'Textdatei ist nicht UTF-8'); }
      if (ext === 'json') { try { JSON.parse(text); } catch { return res(false, 'JSON ist ungültig'); } }
      if (containsSecret(text)) return res(false, 'Datei enthält offenbar Zugangsdaten oder Schlüssel – bitte nie hochladen; Zugang per Einladung erteilen');
      break;
    }
  }
  return res(true, 'Format, Signatur und Inhalt geprüft');
}

// ------------------------------------------------------------------ Anfragen

export interface AssetRequestRow { request_id: string; customer_id: string; order_id: string | null; kind: AssetKind; label: string; purpose: string; rights_required: number; blocks_production: number; created_by: string; created_at: string; cancelled_at: string | null }
export interface AssetRow { asset_id: string; request_id: string; customer_id: string; version: number; filename: string; media_type: string; bytes: number; sha256: string; blob_locator: string | null; note: string | null; scan_status: 'ACCEPTED' | 'REJECTED'; scan_reason: string | null; rights_confirmed: number; rights_confirmed_at: string | null; created_at: string; erased_at: string | null }
export interface GrantRow { grant_id: string; asset_id: string; order_id: string | null; grantee: 'production'; expires_at: string; revoked_at: string | null; revoked_by: string | null; revoke_reason: string | null; created_at: string }

const now = (ctx: AppContext): string => ctx.clock().toISOString();
const audit = (ctx: AppContext, type: string, actor: string, subjectId: string, data?: unknown): void => { ctx.audit.record({ type, actor, subjectType: 'client_asset', subjectId, data, testMode: ctx.config.testMode }); };

/** Eigentümer fordert eine Datei oder einen Zugang an – immer beim Kunden des Auftrags. */
export function requestAsset(ctx: AppContext, input: { orderId: string; kind: AssetKind; label: string; purpose: string; rightsRequired?: boolean; blocksProduction?: boolean }, actor = 'owner'): AssetRequestRow {
  const order = ctx.db.get<{ customer_id: string }>('SELECT customer_id FROM orders WHERE order_id = ?', input.orderId);
  if (!order) throw new WorkflowError('ORDER_NOT_FOUND');
  if (!['logo', 'document', 'data', 'access'].includes(input.kind)) throw new WorkflowError('INVALID_KIND');
  const label = input.label.trim();
  const purpose = input.purpose.trim();
  if (label.length < 2 || label.length > 120 || purpose.length < 2 || purpose.length > 300) throw new WorkflowError('INVALID_REQUEST', 'Bezeichnung (2–120) und Zweck (2–300 Zeichen) angeben.');
  if (containsSecret(`${label} ${purpose}`)) throw new WorkflowError('SECRET_DETECTED', 'Keine Zugangsdaten in Anfragen schreiben.');
  const row: AssetRequestRow = { request_id: newId('arq'), customer_id: order.customer_id, order_id: input.orderId, kind: input.kind, label, purpose, rights_required: input.rightsRequired === false ? 0 : 1, blocks_production: input.blocksProduction === false ? 0 : 1, created_by: actor, created_at: now(ctx), cancelled_at: null };
  ctx.db.run('INSERT INTO asset_requests (request_id, customer_id, order_id, kind, label, purpose, rights_required, blocks_production, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', row.request_id, row.customer_id, row.order_id, row.kind, row.label, row.purpose, row.rights_required, row.blocks_production, row.created_by, row.created_at);
  audit(ctx, 'asset.requested', actor, row.request_id, { order_id: row.order_id, kind: row.kind, blocks_production: row.blocks_production });
  return row;
}

export function cancelAssetRequest(ctx: AppContext, requestId: string, actor = 'owner'): void {
  const n = ctx.db.run('UPDATE asset_requests SET cancelled_at = ? WHERE request_id = ? AND cancelled_at IS NULL', now(ctx), requestId).changes;
  if (!n) throw new WorkflowError('NOT_FOUND');
  audit(ctx, 'asset.request_cancelled', actor, requestId);
}

/** Anfrage gehört genau diesem Kunden – sonst FORBIDDEN (und Sicherheitsprotokoll). */
function ownRequest(ctx: AppContext, key: string | undefined, requestId: string): { req: AssetRequestRow; customerId: string } {
  const c = customerByKey(ctx, key);
  const req = ctx.db.get<AssetRequestRow>('SELECT * FROM asset_requests WHERE request_id = ?', requestId);
  if (!c || !req || req.customer_id !== c.customer_id) {
    ctx.audit.record({ type: 'security.asset_access_denied', actor: 'customer', subjectType: 'asset_request', subjectId: requestId.slice(0, 40), testMode: ctx.config.testMode });
    throw new WorkflowError('FORBIDDEN');
  }
  if (req.cancelled_at) throw new WorkflowError('REQUEST_CANCELLED');
  return { req, customerId: c.customer_id };
}

function activeGrant(ctx: AppContext, assetId: string): GrantRow | undefined {
  return ctx.db.get<GrantRow>('SELECT * FROM asset_grants WHERE asset_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1', assetId, now(ctx));
}

function grantToProduction(ctx: AppContext, asset: AssetRow, req: AssetRequestRow): void {
  if (activeGrant(ctx, asset.asset_id)) return;
  const exp = new Date(ctx.clock().getTime() + GRANT_DAYS * 86_400_000).toISOString();
  const id = newId('agr');
  ctx.db.run('INSERT INTO asset_grants (grant_id, asset_id, order_id, grantee, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, asset.asset_id, req.order_id, 'production', exp, now(ctx));
  audit(ctx, 'asset.granted', 'customer', asset.asset_id, { grantee: 'production', order_id: req.order_id, expires_at: exp });
}

export type UploadOutcome = { status: 'ACCEPTED' | 'LOCKED_NO_RIGHTS' | 'DUPLICATE' | 'REJECTED'; assetId: string | null; version: number | null; reason: string };

/** Upload durch den Kunden im Portal. */
export function uploadAsset(ctx: AppContext, key: string | undefined, requestId: string, file: { filename: string; bytes: Uint8Array }, rightsConfirmed: boolean): UploadOutcome {
  const { req, customerId } = ownRequest(ctx, key, requestId);
  if (req.kind === 'access') throw new WorkflowError('NO_UPLOAD_FOR_ACCESS', 'Zugänge bitte per Einladung erteilen – keine Dateien oder Passwörter.');
  const filename = file.filename.replace(/[\\/]/g, '_').replace(/[^\w .()-]/g, '_').slice(-120) || 'datei';
  const sha = sha256Hex(file.bytes);
  const scan = scanUpload(req.kind, filename, file.bytes);
  const versions = ctx.db.all<AssetRow>('SELECT * FROM client_assets WHERE request_id = ? ORDER BY version DESC', requestId);
  const dup = versions.find((v) => v.sha256 === sha && v.scan_status === 'ACCEPTED' && !v.erased_at);
  if (dup) {
    if (rightsConfirmed && !dup.rights_confirmed) confirmRights(ctx, key, dup.asset_id);
    return { status: 'DUPLICATE', assetId: dup.asset_id, version: dup.version, reason: 'Diese Datei liegt bereits vor – keine neue Version angelegt.' };
  }
  const version = (versions[0]?.version ?? 0) + 1;
  const assetId = newId('ast');
  if (!scan.ok) {
    ctx.db.run('INSERT INTO client_assets (asset_id, request_id, customer_id, version, filename, media_type, bytes, sha256, blob_locator, scan_status, scan_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)', assetId, requestId, customerId, version, filename, scan.mediaType, file.bytes.length, sha, 'REJECTED', scan.reason, now(ctx));
    audit(ctx, 'asset.rejected', 'customer', assetId, { request_id: requestId, reason: scan.reason, bytes: file.bytes.length });
    return { status: 'REJECTED', assetId, version, reason: scan.reason };
  }
  const locator = ctx.blobs.put(`client-assets/${customerId}/${assetId}.${scan.ext}`, file.bytes);
  const rights = rightsConfirmed || req.rights_required === 0 ? 1 : 0;
  ctx.db.run('INSERT INTO client_assets (asset_id, request_id, customer_id, version, filename, media_type, bytes, sha256, blob_locator, scan_status, scan_reason, rights_confirmed, rights_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', assetId, requestId, customerId, version, filename, scan.mediaType, file.bytes.length, sha, locator, 'ACCEPTED', scan.reason, rights, rights ? now(ctx) : null, now(ctx));
  audit(ctx, 'asset.uploaded', 'customer', assetId, { request_id: requestId, version, bytes: file.bytes.length, sha256: sha, rights_confirmed: rights === 1 });
  const asset = ctx.db.get<AssetRow>('SELECT * FROM client_assets WHERE asset_id = ?', assetId) as AssetRow;
  if (!rights) return { status: 'LOCKED_NO_RIGHTS', assetId, version, reason: 'Gespeichert, aber gesperrt: Nutzungsrechte sind nicht bestätigt.' };
  grantToProduction(ctx, asset, req);
  return { status: 'ACCEPTED', assetId, version, reason: scan.reason };
}

/** Kunde bestätigt nachträglich die Nutzungsrechte einer eigenen, geprüften Datei. */
export function confirmRights(ctx: AppContext, key: string | undefined, assetId: string): void {
  const a = ctx.db.get<AssetRow>('SELECT * FROM client_assets WHERE asset_id = ?', assetId);
  if (!a) throw new WorkflowError('FORBIDDEN');
  const { req } = ownRequest(ctx, key, a.request_id);
  if (a.scan_status !== 'ACCEPTED' || a.erased_at) throw new WorkflowError('ASSET_NOT_USABLE');
  if (!a.rights_confirmed) {
    ctx.db.run('UPDATE client_assets SET rights_confirmed = 1, rights_confirmed_at = ? WHERE asset_id = ?', now(ctx), assetId);
    audit(ctx, 'asset.rights_confirmed', 'customer', assetId);
  }
  grantToProduction(ctx, { ...a, rights_confirmed: 1 }, req);
}

/** Zugang erteilt (z. B. Einladung in das System des Kunden) – ohne Passwörter oder Schlüssel. */
export function confirmAccess(ctx: AppContext, key: string | undefined, requestId: string, note: string): string {
  const { req, customerId } = ownRequest(ctx, key, requestId);
  if (req.kind !== 'access') throw new WorkflowError('NOT_AN_ACCESS_REQUEST');
  const clean = note.trim().slice(0, 300);
  if (clean.length < 3) throw new WorkflowError('NOTE_REQUIRED', 'Kurz beschreiben, wie der Zugang erteilt wurde (z. B. Einladung an …).');
  if (containsSecret(clean)) {
    ctx.audit.record({ type: 'security.secret_rejected', actor: 'customer', subjectType: 'asset_request', subjectId: requestId, testMode: ctx.config.testMode });
    throw new WorkflowError('SECRET_DETECTED', 'Bitte keine Passwörter oder Schlüssel senden – nur per Einladung oder eigenem Zugang.');
  }
  const version = (ctx.db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM client_assets WHERE request_id = ?', requestId)?.v ?? 0) + 1;
  const assetId = newId('ast');
  ctx.db.run('INSERT INTO client_assets (asset_id, request_id, customer_id, version, filename, media_type, bytes, sha256, blob_locator, note, scan_status, scan_reason, rights_confirmed, rights_confirmed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, ?, 1, ?, ?)', assetId, requestId, customerId, version, 'Zugang per Einladung', 'application/x-access-grant', sha256Hex(clean), clean, 'ACCEPTED', 'Ohne Zugangsdaten erteilt', now(ctx), now(ctx));
  audit(ctx, 'asset.access_confirmed', 'customer', assetId, { request_id: requestId });
  grantToProduction(ctx, ctx.db.get<AssetRow>('SELECT * FROM client_assets WHERE asset_id = ?', assetId) as AssetRow, req);
  return assetId;
}

/** Widerruf durch Kunde (eigene Datei) oder Eigentümer: wirkt sofort für jeden weiteren Zugriff. */
export function revokeAsset(ctx: AppContext, assetId: string, by: { customerKey?: string; owner?: boolean }, reason: string): number {
  const a = ctx.db.get<AssetRow>('SELECT * FROM client_assets WHERE asset_id = ?', assetId);
  if (!a) throw new WorkflowError('FORBIDDEN');
  if (!by.owner) ownRequest(ctx, by.customerKey, a.request_id);
  const n = ctx.db.run('UPDATE asset_grants SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE asset_id = ? AND revoked_at IS NULL', now(ctx), by.owner ? 'owner' : 'customer', reason.trim().slice(0, 200) || 'ohne Angabe', assetId).changes;
  audit(ctx, 'asset.revoked', by.owner ? 'owner' : 'customer', assetId, { grants: n });
  return n;
}

/**
 * Einziger Weg der Produktion an Kundendateien: gleicher Kunde wie der Auftrag, geprüft, Rechte bestätigt,
 * gültige und nicht widerrufene Freigabe für genau diesen Auftrag. Jeder Zugriff wird protokolliert (ohne Inhalt).
 */
export function assetForProduction(ctx: AppContext, assetId: string, orderId: string): Uint8Array {
  const a = ctx.db.get<AssetRow>('SELECT * FROM client_assets WHERE asset_id = ?', assetId);
  const order = ctx.db.get<{ customer_id: string }>('SELECT customer_id FROM orders WHERE order_id = ?', orderId);
  const deny = (code: string): never => { audit(ctx, 'asset.production_denied', 'system', assetId.slice(0, 40), { order_id: orderId, code }); throw new WorkflowError(code); };
  if (!a || !order) return deny('NOT_FOUND');
  if (a.customer_id !== order.customer_id) return deny('TENANT_MISMATCH');
  if (a.scan_status !== 'ACCEPTED' || a.erased_at || !a.blob_locator) return deny('ASSET_NOT_USABLE');
  if (!a.rights_confirmed) return deny('RIGHTS_MISSING');
  const g = activeGrant(ctx, assetId);
  if (!g || (g.order_id && g.order_id !== orderId)) return deny('GRANT_MISSING_OR_REVOKED');
  const bytes = ctx.blobs.get(a.blob_locator);
  if (!bytes || sha256Hex(bytes) !== a.sha256) return deny('INTEGRITY_FAILED');
  audit(ctx, 'asset.accessed', 'system', assetId, { order_id: orderId, grant_id: g.grant_id });
  return bytes;
}

/** Kunde lädt seine eigene Datei wieder herunter (nur eigene, nur geprüfte). */
export function customerAsset(ctx: AppContext, key: string | undefined, assetId: string): { filename: string; mediaType: string; bytes: Uint8Array } {
  const a = ctx.db.get<AssetRow>('SELECT * FROM client_assets WHERE asset_id = ?', assetId);
  if (!a) throw new WorkflowError('FORBIDDEN');
  ownRequest(ctx, key, a.request_id);
  const bytes = a.blob_locator ? ctx.blobs.get(a.blob_locator) : null;
  if (!bytes) throw new WorkflowError('NOT_FOUND');
  return { filename: a.filename, mediaType: a.media_type, bytes };
}

export interface RequestView { req: AssetRequestRow; assets: (AssetRow & { granted: boolean })[]; usable: boolean }

function usableAsset(ctx: AppContext, a: AssetRow): boolean {
  return a.scan_status === 'ACCEPTED' && !a.erased_at && a.rights_confirmed === 1 && !!activeGrant(ctx, a.asset_id);
}

function viewsFor(ctx: AppContext, rows: AssetRequestRow[]): RequestView[] {
  return rows.map((req) => {
    const assets = ctx.db.all<AssetRow>('SELECT * FROM client_assets WHERE request_id = ? ORDER BY version DESC', req.request_id).map((a) => ({ ...a, granted: !!activeGrant(ctx, a.asset_id) }));
    return { req, assets, usable: assets.some((a) => usableAsset(ctx, a)) };
  });
}

/** Portal: nur Anfragen dieses Kunden. */
export function requestsForCustomer(ctx: AppContext, customerId: string): RequestView[] {
  return viewsFor(ctx, ctx.db.all<AssetRequestRow>('SELECT * FROM asset_requests WHERE customer_id = ? AND cancelled_at IS NULL ORDER BY created_at DESC', customerId));
}

export function requestsForOrder(ctx: AppContext, orderId: string): RequestView[] {
  return viewsFor(ctx, ctx.db.all<AssetRequestRow>('SELECT * FROM asset_requests WHERE order_id = ? ORDER BY created_at DESC', orderId));
}

/** Produktions-Gate: fehlt eine benötigte Datei oder ein Zugang, pausiert der abhängige Schritt (keine Ersatz- oder Fantasiedaten). */
export function assetGate(ctx: AppContext, orderId: string): { ready: boolean; missing: string[] } {
  const missing = requestsForOrder(ctx, orderId).filter((v) => !v.req.cancelled_at && v.req.blocks_production === 1 && !v.usable).map((v) => v.req.label);
  return { ready: missing.length === 0, missing };
}

/** Löschantrag: Dateien endgültig löschen, Freigaben widerrufen; Prüfsumme und Version bleiben als Nachweis. */
export function eraseClientAssets(ctx: AppContext, customerId: string): number {
  const rows = ctx.db.all<AssetRow>('SELECT * FROM client_assets WHERE customer_id = ? AND erased_at IS NULL', customerId);
  for (const a of rows) {
    if (a.blob_locator) ctx.blobs.delete?.(a.blob_locator);
    ctx.db.run('UPDATE asset_grants SET revoked_at = COALESCE(revoked_at, ?), revoked_by = COALESCE(revoked_by, ?), revoke_reason = COALESCE(revoke_reason, ?) WHERE asset_id = ?', now(ctx), 'owner', 'Löschantrag', a.asset_id);
    ctx.db.run(`UPDATE client_assets SET blob_locator = NULL, note = NULL, filename = '[gelöscht]', erased_at = ? WHERE asset_id = ?`, now(ctx), a.asset_id);
  }
  return rows.length;
}
