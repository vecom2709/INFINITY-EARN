import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';

export interface ArtifactRow {
  artifact_id: string;
  order_id: string;
  capability_id: string;
  capability_version: number;
  version: number;
  path: string;
  sha256: string;
  bytes: number;
  media_type: string;
  rights_json: string;
  quarantined_at: string | null;
  test_mode: number;
  created_at: string;
}

export interface Rights {
  origin: 'own_work';
  generator: string;
  third_party_assets: { name: string; license: string }[];
  customer_license: string;
}

/** Versioniertes Artefakt mit SHA-256 und Rechte-Nachweis speichern (IE-043, IE-046). */
export function storeArtifact(
  ctx: AppContext,
  a: { orderId: string; capabilityId: string; capabilityVersion: number; bytes: Uint8Array; mediaType: string; extension: string; rights: Rights },
): ArtifactRow {
  if (!/^ord_[a-f0-9]{32}$/.test(a.orderId)) throw new WorkflowError('INVALID_ORDER_ID');
  const version = (ctx.db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM artifacts WHERE order_id = ?', a.orderId)?.v ?? 0) + 1;
  const path = ctx.blobs.put(`${ctx.config.testMode ? 'test' : 'live'}/${a.orderId}/v${version}.${a.extension}`, a.bytes);
  const row: ArtifactRow = {
    artifact_id: newId('art'),
    order_id: a.orderId,
    capability_id: a.capabilityId,
    capability_version: a.capabilityVersion,
    version,
    path,
    sha256: sha256Hex(a.bytes),
    bytes: a.bytes.byteLength,
    media_type: a.mediaType,
    rights_json: JSON.stringify(a.rights),
    quarantined_at: null,
    test_mode: ctx.config.testMode ? 1 : 0,
    created_at: ctx.clock().toISOString(),
  };
  ctx.db.run(
    `INSERT INTO artifacts (artifact_id, order_id, capability_id, capability_version, version, path, sha256, bytes, media_type, rights_json, test_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.artifact_id, row.order_id, row.capability_id, row.capability_version, row.version, row.path, row.sha256, row.bytes, row.media_type, row.rights_json, row.test_mode, row.created_at,
  );
  ctx.audit.record({ type: 'artifact.created', actor: 'system', subjectType: 'order', subjectId: a.orderId, data: { artifact_id: row.artifact_id, sha256: row.sha256, version }, testMode: ctx.config.testMode });
  return row;
}

export function getArtifact(ctx: AppContext, artifactId: string): ArtifactRow | undefined {
  return ctx.db.get<ArtifactRow>('SELECT * FROM artifacts WHERE artifact_id = ?', artifactId);
}

/** Liest ein Artefakt und prüft die Prüfsumme (IE-053). */
export function readVerifiedArtifact(ctx: AppContext, artifactId: string): { ok: true; bytes: Uint8Array; row: ArtifactRow } | { ok: false; reason: 'MISSING' | 'CHECKSUM_MISMATCH' | 'QUARANTINED' } {
  const row = getArtifact(ctx, artifactId);
  if (!row) return { ok: false, reason: 'MISSING' };
  if (row.quarantined_at) return { ok: false, reason: 'QUARANTINED' };
  const bytes = ctx.blobs.get(row.path);
  if (!bytes) return { ok: false, reason: 'MISSING' };
  if (sha256Hex(bytes) !== row.sha256) return { ok: false, reason: 'CHECKSUM_MISMATCH' };
  return { ok: true, bytes, row };
}
