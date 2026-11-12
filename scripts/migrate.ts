import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Db } from '../packages/storage/src/db.ts';
import { migrate } from '../packages/storage/src/migrate.ts';
import { loadConfig } from '../services/core-api/src/config.ts';

const config = loadConfig();
if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new Db(config.dbPath);
const applied = migrate(db, config.migrationsDir);
console.log(applied.length ? `Angewendet: ${applied.join(', ')}` : 'Datenbank ist aktuell.');
db.close();
