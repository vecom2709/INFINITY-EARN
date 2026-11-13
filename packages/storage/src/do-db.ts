import type { BlobStore, SqlDb, SqlParam } from './types.ts';

/**
 * Adapter für die SQLite-Storage-API von Cloudflare Durable Objects (synchron).
 * Transaktionen MÜSSEN über transactionSync laufen – BEGIN/SAVEPOINT sind dort verboten.
 * Minimal eigene Typdeklarationen, damit keine Cloudflare-Typpakete nötig sind.
 */
export interface DoSqlCursor {
  toArray(): Record<string, unknown>[];
  readonly rowsWritten: number;
}

export interface DoSqlStorage {
  exec(query: string, ...bindings: unknown[]): DoSqlCursor;
}

export interface DoStorage {
  sql: DoSqlStorage;
  transactionSync<T>(fn: () => T): T;
  setAlarm(time: number): Promise<void>;
  getAlarm(): Promise<number | null>;
}

const bind = (params: SqlParam[]): unknown[] => params.map((p) => (p instanceof Uint8Array ? p.slice().buffer : typeof p === 'bigint' ? Number(p) : p));

export class DoDb implements SqlDb {
  readonly #storage: DoStorage;
  #depth = 0;

  constructor(storage: DoStorage) {
    this.#storage = storage;
  }

  run(sql: string, ...params: SqlParam[]): { changes: number } {
    this.#storage.sql.exec(sql, ...bind(params)).toArray();
    // NICHT cursor.rowsWritten verwenden: zählt auch Index-Schreibvorgänge (Abrechnungsgröße),
    // nicht die Zahl der geänderten Tabellenzeilen. SQLite changes() ist exakt.
    const row = this.#storage.sql.exec('SELECT changes() AS n').toArray()[0];
    return { changes: Number(row?.n ?? 0) };
  }

  get<T>(sql: string, ...params: SqlParam[]): T | undefined {
    return this.#storage.sql.exec(sql, ...bind(params)).toArray()[0] as T | undefined;
  }

  all<T>(sql: string, ...params: SqlParam[]): T[] {
    return this.#storage.sql.exec(sql, ...bind(params)).toArray() as T[];
  }

  exec(sql: string): void {
    this.#storage.sql.exec(sql).toArray();
  }

  tx<T>(fn: () => T): T {
    if (this.#depth > 0) return fn(); // verschachtelt: äußere transactionSync deckt alles ab
    this.#depth++;
    try {
      return this.#storage.transactionSync(fn);
    } finally {
      this.#depth--;
    }
  }

  close(): void {
    /* Durable Object verwaltet die Verbindung selbst */
  }
}

/** Artefakte als BLOB in derselben SQLite-Datenbank (kein R2 nötig; Limit 8 MB pro Wert). */
export class DoBlobStore implements BlobStore {
  readonly #db: SqlDb;
  constructor(db: SqlDb) {
    this.#db = db;
    db.exec('CREATE TABLE IF NOT EXISTS blob_store (key TEXT PRIMARY KEY, bytes BLOB NOT NULL, created_at TEXT NOT NULL)');
  }
  put(key: string, bytes: Uint8Array): string {
    if (bytes.byteLength > 7 * 1024 * 1024) throw new Error('BLOB_TOO_LARGE');
    this.#db.run('INSERT INTO blob_store (key, bytes, created_at) VALUES (?, ?, ?)', key, bytes, new Date().toISOString());
    return `blob:${key}`;
  }
  get(locator: string): Uint8Array | null {
    if (!locator.startsWith('blob:')) return null;
    const row = this.#db.get<{ bytes: ArrayBuffer | Uint8Array }>('SELECT bytes FROM blob_store WHERE key = ?', locator.slice(5));
    if (!row) return null;
    return row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
  }
  delete(locator: string): void {
    if (locator.startsWith('blob:')) this.#db.run('DELETE FROM blob_store WHERE key = ?', locator.slice(5));
  }
}
