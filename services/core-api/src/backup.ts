import { Buffer } from 'node:buffer';
import { sha256Hex } from '../../../packages/shared/src/crypto.ts';
import type { SqlDb } from '../../../packages/storage/src/types.ts';
import type { AppContext } from './context.ts';

/**
 * Vollständiger logischer Backup-Export (Owner-only) – plattformneutral (Node und Durable Object).
 * Ausgenommen: Owner-Sessions (kurzlebig, sicherheitsrelevant) und interne Tabellen der Plattform.
 * BLOBs werden base64-kodiert. Enthält personenbezogene Daten → nur Eigentümer, Abruf wird protokolliert.
 */
export interface Backup {
  format: 'infinity-earn-backup/1';
  created_at: string;
  test_mode: boolean;
  migrations: string[];
  tables: Record<string, Record<string, unknown>[]>;
  table_order: string[];
  checksum: string;
}

const EXCLUDED = new Set(['owner_sessions']);

export function listUserTables(db: SqlDb): string[] {
  return db
    .all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid`)
    .map((r) => r.name)
    .filter((n) => !EXCLUDED.has(n) && !n.startsWith('__') && /^[a-z][a-z0-9_]*$/.test(n));
}

function encode(v: unknown): unknown {
  if (v instanceof Uint8Array) return { $b64: Buffer.from(v).toString('base64') };
  if (v instanceof ArrayBuffer) return { $b64: Buffer.from(new Uint8Array(v)).toString('base64') };
  return v;
}

export function exportBackup(ctx: AppContext, actor: 'owner' | 'system' = 'owner'): Backup {
  const order = listUserTables(ctx.db);
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of order) {
    tables[t] = ctx.db.all<Record<string, unknown>>(`SELECT * FROM "${t}"`).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, encode(v)])));
  }
  const body = { format: 'infinity-earn-backup/1' as const, created_at: ctx.clock().toISOString(), test_mode: ctx.config.testMode, migrations: (tables.schema_migrations ?? []).map((m) => String(m.name)), tables, table_order: order };
  const backup: Backup = { ...body, checksum: sha256Hex(JSON.stringify(body.tables)) };
  ctx.audit.record({ type: 'backup.exported', actor, subjectType: 'backup', subjectId: backup.created_at, data: { tables: order.length, rows: Object.values(tables).reduce((n, r) => n + r.length, 0) }, testMode: ctx.config.testMode });
  return backup;
}
