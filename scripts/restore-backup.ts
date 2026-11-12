import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { sha256Hex } from '../packages/shared/src/crypto.ts';
import { Db } from '../packages/storage/src/db.ts';
import { readMigrations } from '../packages/storage/src/migrate.ts';
import { migrateList } from '../packages/storage/src/migrate-list.ts';
import type { SqlParam } from '../packages/storage/src/types.ts';
import type { Backup } from '../services/core-api/src/backup.ts';

/**
 * Restore-Test: node scripts/restore-backup.ts <backup.json> [ziel.sqlite | :memory:]
 * Spielt ein Backup in eine frische Datenbank (gleiches Schema), prüft Prüfsumme, Zeilenzahlen,
 * Fremdschlüssel und Artefakt-Prüfsummen. Ändert die Quelle nie.
 */
export function restoreBackup(input: Backup, target = ':memory:'): { ok: boolean; issues: string[]; rows: number; artifactsVerified: number } {
  const issues: string[] = [];
  let backup = input;
  if (backup.format !== 'infinity-earn-backup/1') issues.push('FORMAT_UNBEKANNT');
  if (sha256Hex(JSON.stringify(backup.tables)) !== backup.checksum) issues.push('PRUEFSUMME_FALSCH');
  const db = new Db(target);
  migrateList(db, readMigrations('db/migrations'));
  db.exec('CREATE TABLE IF NOT EXISTS blob_store (key TEXT PRIMARY KEY, bytes BLOB NOT NULL, created_at TEXT NOT NULL)'); // wie DoBlobStore
  db.exec('PRAGMA foreign_keys = OFF');
  const known = new Set(db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`).map((r) => r.name));
  for (const t of backup.table_order) if (!known.has(t) && !t.startsWith('__')) issues.push(`UNBEKANNTE_TABELLE:${t}`);
  backup = { ...backup, table_order: backup.table_order.filter((t) => known.has(t)) };
  const decode = (v: unknown): SqlParam => (v && typeof v === 'object' && '$b64' in v ? new Uint8Array(Buffer.from(String((v as { $b64: string }).$b64), 'base64')) : (v as SqlParam));
  let rows = 0;
  db.tx(() => {
    for (const table of backup.table_order) {
      if (table === 'schema_migrations' || table === 'system_mode') continue; // aus Migrationen
      for (const row of backup.tables[table] ?? []) {
        const cols = Object.keys(row);
        db.run(`INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => decode(row[c])));
        rows++;
      }
    }
  });
  db.exec('PRAGMA foreign_keys = ON');
  const fk = db.all<Record<string, unknown>>('PRAGMA foreign_key_check');
  if (fk.length) issues.push(`FREMDSCHLUESSEL_VERLETZT:${fk.length}`);
  for (const table of backup.table_order) {
    if (table === 'schema_migrations' || table === 'system_mode') continue;
    const n = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`)?.n ?? 0;
    if (n !== (backup.tables[table] ?? []).length) issues.push(`ZEILEN_ABWEICHUNG:${table}:${n}!=${(backup.tables[table] ?? []).length}`);
  }
  let artifactsVerified = 0;
  const blobs = new Map((backup.tables.blob_store ?? []).map((b) => [`blob:${String(b.key)}`, decode(b.bytes) as Uint8Array]));
  for (const a of db.all<{ artifact_id: string; path: string; sha256: string }>('SELECT artifact_id, path, sha256 FROM artifacts')) {
    const bytes = blobs.get(a.path);
    if (!bytes) continue; // lokale Dateisystem-Artefakte sind nicht Teil des DB-Backups
    if (sha256Hex(bytes) !== a.sha256) issues.push(`ARTEFAKT_PRUEFSUMME:${a.artifact_id}`);
    else artifactsVerified++;
  }
  db.close();
  return { ok: issues.length === 0, issues, rows, artifactsVerified };
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error('Aufruf: node scripts/restore-backup.ts <backup.json> [ziel.sqlite]');
    process.exit(2);
  }
  const r = restoreBackup(JSON.parse(readFileSync(file, 'utf8')) as Backup, process.argv[3] ?? ':memory:');
  console.log(r.ok ? `RESTORE OK: ${r.rows} Zeilen, ${r.artifactsVerified} Artefakte mit gültiger Prüfsumme` : `RESTORE FEHLER: ${r.issues.join(', ')}`);
  process.exit(r.ok ? 0 : 1);
}
