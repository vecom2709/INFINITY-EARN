import { sha256Hex } from '../../shared/src/crypto.ts';
import type { Migration, SqlDb } from './types.ts';

/** Plattformneutraler Migrationslauf über eine Liste (Inhalt identisch zu db/migrations/*.sql, CRLF normalisiert). */
export function migrateList(db: SqlDb, migrations: readonly Migration[], now: () => Date = () => new Date()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const applied: string[] = [];
  for (const m of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = m.sql.replace(/\r\n/g, '\n');
    const sum = sha256Hex(sql);
    const row = db.get<{ sha256: string }>('SELECT sha256 FROM schema_migrations WHERE name = ?', m.name);
    if (row) {
      if (row.sha256 !== sum) throw new Error(`MIGRATION_TAMPERED:${m.name} – angewendete Migration wurde verändert.`);
      continue;
    }
    db.tx(() => {
      db.exec(sql);
      db.run('INSERT INTO schema_migrations (name, sha256, applied_at) VALUES (?, ?, ?)', m.name, sum, now().toISOString());
    });
    applied.push(m.name);
  }
  return applied;
}
