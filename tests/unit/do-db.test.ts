import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { DoBlobStore, DoDb, type DoStorage } from '../../packages/storage/src/do-db.ts';
import { MIGRATIONS } from '../../packages/storage/src/migrations.generated.ts';
import { readMigrations } from '../../packages/storage/src/migrate.ts';
import { migrateList } from '../../packages/storage/src/migrate-list.ts';

/**
 * Simuliert die Durable-Object-SQL-API mit node:sqlite – inkl. der Eigenheit, dass rowsWritten
 * Index-Schreibvorgänge mitzählt (Befund aus wrangler dev, 12.11.2026).
 */
function fakeDoStorage(): DoStorage & { inTx: boolean } {
  const db = new DatabaseSync(':memory:');
  const s = {
    inTx: false,
    sql: {
      exec(query: string, ...rawBindings: unknown[]) {
        const bindings = rawBindings.map((b) => (b instanceof ArrayBuffer ? new Uint8Array(b) : b)); // DO bindet ArrayBuffer als BLOB
        if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(query)) throw new Error('transaction statements not allowed');
        const statements = query.split(/;\s*\n/).filter((q) => q.trim());
        let rows: Record<string, unknown>[] = [];
        let written = 0;
        if (statements.length > 1 || bindings.length === 0) {
          if (bindings.length === 0 && !/^\s*SELECT/i.test(query)) {
            db.exec(query);
            return { toArray: () => [], rowsWritten: 0 };
          }
        }
        const stmt = db.prepare(query);
        if (/^\s*(SELECT|PRAGMA|WITH)/i.test(query) || /RETURNING/i.test(query)) rows = stmt.all(...(bindings as never[])) as Record<string, unknown>[];
        else written = Number(stmt.run(...(bindings as never[])).changes) * 2; // Index-Effekt nachbilden
        return { toArray: () => rows, rowsWritten: written };
      },
    },
    transactionSync<T>(fn: () => T): T {
      db.exec('BEGIN');
      s.inTx = true;
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        s.inTx = false;
      }
    },
    setAlarm: async () => {},
    getAlarm: async () => null,
  };
  return s;
}

test('Eingebettete Migrationen sind identisch mit db/migrations (Worker ohne Dateisystem)', () => {
  assert.deepEqual(MIGRATIONS, readMigrations('db/migrations'));
});

test('DoDb: changes() statt rowsWritten, Transaktionen über transactionSync, Rollback bei Fehler', () => {
  const storage = fakeDoStorage();
  const db = new DoDb(storage);
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); CREATE INDEX t_v ON t (v)');
  db.run('INSERT INTO t (v) VALUES (?)', 'a');
  assert.equal(db.run('UPDATE t SET v = ? WHERE v = ?', 'b', 'a').changes, 1, 'genau eine Zeile, trotz Index');
  assert.equal(db.run('UPDATE t SET v = ? WHERE v = ?', 'c', 'nichts').changes, 0);
  assert.throws(() => db.tx(() => {
    db.run('INSERT INTO t (v) VALUES (?)', 'x');
    db.tx(() => db.run('INSERT INTO t (v) VALUES (?)', 'y'));
    throw new Error('abbruch');
  }), /abbruch/);
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM t')?.n, 1, 'Rollback inkl. verschachtelter Aufrufe');
});

test('DoBlobStore: Artefakte als BLOB, Locator-Präfix, Größenlimit', () => {
  const db = new DoDb(fakeDoStorage());
  const blobs = new DoBlobStore(db);
  const loc = blobs.put('test/ord_x/v1.csv', new TextEncoder().encode('a,b\r\n'));
  assert.equal(loc, 'blob:test/ord_x/v1.csv');
  assert.equal(new TextDecoder().decode(blobs.get(loc) ?? new Uint8Array()), 'a,b\r\n');
  assert.equal(blobs.get('/etc/passwd'), null);
  assert.throws(() => blobs.put('gross', new Uint8Array(8 * 1024 * 1024)), /BLOB_TOO_LARGE/);
});

test('Schema läuft vollständig über den DO-Adapter (alle Migrationen, Trigger, CHECKs)', () => {
  const db = new DoDb(fakeDoStorage());
  assert.deepEqual(migrateList(db, MIGRATIONS), MIGRATIONS.map((m) => m.name));
  assert.throws(() => db.run('UPDATE system_mode SET live_enabled = 1'), /LIVE_ACTIVATION_REQUIRES_M3_MIGRATION/);
});
