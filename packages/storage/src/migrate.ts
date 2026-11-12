import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateList } from './migrate-list.ts';
import type { Migration, SqlDb } from './types.ts';

/** Liest db/migrations/NNNN_*.sql (Node). */
export function readMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n') }));
}

/**
 * Wendet db/migrations/NNNN_*.sql der Reihe nach an. Bereits angewendete Dateien
 * werden per Prüfsumme gegen nachträgliche Manipulation geschützt.
 */
export function migrate(db: SqlDb, dir: string, now: () => Date = () => new Date()): string[] {
  return migrateList(db, readMigrations(dir), now);
}
