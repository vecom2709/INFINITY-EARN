import { AuditLog } from '../../../packages/events/src/audit.ts';
import { migrateList } from '../../../packages/storage/src/migrate-list.ts';
import type { BlobStore, Migration, SqlDb } from '../../../packages/storage/src/types.ts';
import type { AppConfig } from './config.ts';
import { bootstrapPolicy } from './policy-store.ts';
import { applyOwnerDecisions } from './owner-decisions.ts';

/** Plattformneutraler Anwendungskontext. Node: context-node.ts · Cloudflare: apps/worker. */
export interface AppContext {
  db: SqlDb;
  blobs: BlobStore;
  audit: AuditLog;
  clock: () => Date;
  config: AppConfig;
}

export { WorkflowError } from './errors.ts';

export function buildContext(db: SqlDb, blobs: BlobStore, config: AppConfig, migrations: readonly Migration[], clock: () => Date = () => new Date()): AppContext {
  migrateList(db, migrations, clock);
  const ctx: AppContext = { db, blobs, audit: new AuditLog(db, clock), clock, config };
  bootstrapPolicy(ctx);
  applyOwnerDecisions(ctx);
  return ctx;
}

export const nowIso = (ctx: AppContext): string => ctx.clock().toISOString();
export const tm = (ctx: AppContext): number => (ctx.config.testMode ? 1 : 0);
