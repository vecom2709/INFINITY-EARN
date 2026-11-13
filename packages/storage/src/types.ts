/**
 * Plattformneutrale Speicher-Schnittstellen. Implementierungen:
 * - Node (lokal): node:sqlite + Dateisystem (db.ts, blob-fs.ts)
 * - Cloudflare Durable Object: SQLite-Storage-API (do-db.ts)
 * Beide sind synchron – die Domänenlogik bleibt unverändert.
 */
export type SqlParam = string | number | bigint | null | Uint8Array;

export interface SqlDb {
  run(sql: string, ...params: SqlParam[]): { changes: number };
  get<T>(sql: string, ...params: SqlParam[]): T | undefined;
  all<T>(sql: string, ...params: SqlParam[]): T[];
  exec(sql: string): void;
  tx<T>(fn: () => T): T;
  close(): void;
}

/** Binärspeicher für Artefakte. `put` liefert einen Locator, der in der DB gespeichert wird. */
export interface BlobStore {
  put(key: string, bytes: Uint8Array): string;
  get(locator: string): Uint8Array | null;
  /** Nur für Tests/Integrität: Inhalt überschreiben. */
  overwrite?(locator: string, bytes: Uint8Array): void;
  /** Endgültig löschen (z. B. Löschantrag, Kundendateien). */
  delete?(locator: string): void;
}

export interface Migration {
  name: string;
  sql: string;
}
