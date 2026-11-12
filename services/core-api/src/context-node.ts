import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { FsBlobStore } from '../../../packages/storage/src/blob-fs.ts';
import { Db } from '../../../packages/storage/src/db.ts';
import { readMigrations } from '../../../packages/storage/src/migrate.ts';
import type { AppConfig } from './config.ts';
import { buildContext, type AppContext } from './context.ts';

export type { AppContext } from './context.ts';

/** Node-Kontext: node:sqlite + Dateisystem für Artefakte. */
export function createContext(config: AppConfig, clock: () => Date = () => new Date()): AppContext {
  if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(config.artifactsDir, { recursive: true });
  return buildContext(new Db(config.dbPath), new FsBlobStore(config.artifactsDir), config, readMigrations(config.migrationsDir), clock);
}
