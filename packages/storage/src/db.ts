import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { SqlDb, SqlParam } from './types.ts';

export type { SqlDb, SqlParam } from './types.ts';

/**
 * Dünner synchroner Wrapper um node:sqlite. Das SQL ist SQLite-/Cloudflare-D1-kompatibel,
 * damit dieselben Migrationen lokal und auf D1 laufen.
 */
export class Db implements SqlDb {
  readonly raw: DatabaseSync;
  readonly #stmts = new Map<string, StatementSync>();
  #depth = 0;

  constructor(path: string) {
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA foreign_keys = ON;');
    if (path !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  }

  #stmt(sql: string): StatementSync {
    let s = this.#stmts.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.#stmts.set(sql, s);
    }
    return s;
  }

  run(sql: string, ...params: SqlParam[]): { changes: number } {
    const r = this.#stmt(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  get<T>(sql: string, ...params: SqlParam[]): T | undefined {
    return this.#stmt(sql).get(...params) as unknown as T | undefined;
  }

  all<T>(sql: string, ...params: SqlParam[]): T[] {
    return this.#stmt(sql).all(...params) as unknown as T[];
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /** Synchrone Transaktion; verschachtelte Aufrufe nutzen SAVEPOINTs. */
  tx<T>(fn: () => T): T {
    const name = `sp_${this.#depth}`;
    this.raw.exec(this.#depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
    this.#depth++;
    try {
      const result = fn();
      this.#depth--;
      this.raw.exec(this.#depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return result;
    } catch (e) {
      this.#depth--;
      if (this.#depth === 0) this.raw.exec('ROLLBACK');
      else this.raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      throw e;
    }
  }

  close(): void {
    this.raw.close();
  }
}

export { isUniqueViolation, isConstraintAbort } from './errors.ts';
