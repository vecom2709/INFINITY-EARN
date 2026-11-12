import { Buffer } from 'node:buffer';
import { sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { exportBackup, type Backup } from './backup.ts';
import type { AppContext } from './context.ts';

/**
 * Automatische tägliche Sicherung außerhalb der Datenbank (Staging: Cloudflare Workers KV, Free-Tarif).
 * Ablauf: logischer Export → gzip → AES-256-GCM (Schlüssel nur als Secret BACKUP_ENCRYPTION_KEY) → Speicher.
 * Eine Sicherung pro UTC-Tag, Aufbewahrung 30 Tage (Ablauf durch den Speicher), Fehler → Retry frühestens nach 1 h
 * (schont das Free-Kontingent von 1.000 KV-Schreibvorgängen/Tag). Plattformneutral: läuft in Node und im Worker.
 */
export const OFFSITE_FORMAT = 'infinity-earn-offsite/1';
export const RETENTION_SECONDS = 30 * 86_400;
export const MAX_SEALED_BYTES = 24 * 1024 * 1024; // KV-Grenze 25 MiB pro Wert, mit Reserve
const RETRY_AFTER_MS = 3_600_000;

export interface BackupSink {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts: { expirationTtl: number; metadata: Record<string, unknown> }): Promise<void>;
}

export interface OffsiteEnvelope {
  format: typeof OFFSITE_FORMAT;
  created_at: string;
  backup_checksum: string;
  plain_sha256: string;
  bytes_plain: number;
  bytes_gzip: number;
  iv: string;
  data: string;
}

export interface DailyBackupState {
  lastDay: string | null;
  nextAttemptAt: number;
}

export type DailyBackupResult =
  | { status: 'SKIPPED' | 'EXISTS'; key?: string }
  | { status: 'STORED'; key: string; bytes: number }
  | { status: 'FAILED'; key: string; error: string };

export function newBackupState(): DailyBackupState {
  return { lastDay: null, nextAttemptAt: 0 };
}

type AesKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

async function aesKey(secret: string): Promise<AesKey> {
  if (secret.length < 32) throw new Error('BACKUP_KEY_TOO_SHORT');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`infinity-earn-backup/1:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function sealBackup(backup: Backup, secret: string): Promise<string> {
  const plain = new TextEncoder().encode(JSON.stringify(backup));
  const gz = await pipe(plain, new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), gz));
  const env: OffsiteEnvelope = {
    format: OFFSITE_FORMAT,
    created_at: backup.created_at,
    backup_checksum: backup.checksum,
    plain_sha256: sha256Hex(plain),
    bytes_plain: plain.length,
    bytes_gzip: gz.length,
    iv: Buffer.from(iv).toString('base64'),
    data: Buffer.from(cipher).toString('base64'),
  };
  return JSON.stringify(env);
}

/** Entschlüsselt und prüft eine Sicherung. Wirft bei falschem Schlüssel, Manipulation oder Prüfsummenfehler. */
export async function openBackup(text: string, secret: string): Promise<Backup> {
  const env = JSON.parse(text) as OffsiteEnvelope;
  if (env.format !== OFFSITE_FORMAT) throw new Error('OFFSITE_FORMAT_UNBEKANNT');
  let gz: Uint8Array;
  try {
    gz = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(env.iv, 'base64') }, await aesKey(secret), Buffer.from(env.data, 'base64')));
  } catch {
    throw new Error('ENTSCHLUESSELUNG_FEHLGESCHLAGEN (falscher Schlüssel oder manipuliert)');
  }
  const plain = await pipe(gz, new DecompressionStream('gzip'));
  if (sha256Hex(plain) !== env.plain_sha256) throw new Error('PRUEFSUMME_FALSCH');
  const backup = JSON.parse(new TextDecoder().decode(plain)) as Backup;
  if (backup.checksum !== env.backup_checksum || sha256Hex(JSON.stringify(backup.tables)) !== backup.checksum) throw new Error('BACKUP_PRUEFSUMME_FALSCH');
  return backup;
}

export function backupKeyFor(day: string): string {
  return `backup/${day}`;
}

/** Höchstens eine Sicherung pro UTC-Tag. `state` lebt im Prozess (Worker-Instanz); der Speicher ist die Wahrheit. */
export async function runDailyBackup(ctx: AppContext, sink: BackupSink, secret: string, state: DailyBackupState): Promise<DailyBackupResult> {
  const now = ctx.clock();
  const day = now.toISOString().slice(0, 10);
  if (state.lastDay === day || now.getTime() < state.nextAttemptAt) return { status: 'SKIPPED' };
  const key = backupKeyFor(day);
  try {
    if ((await sink.get(key)) !== null) {
      state.lastDay = day;
      return { status: 'EXISTS', key };
    }
    const backup = exportBackup(ctx, 'system');
    const sealed = await sealBackup(backup, secret);
    if (sealed.length > MAX_SEALED_BYTES) throw new Error(`ZU_GROSS:${sealed.length}`);
    const rows = Object.values(backup.tables).reduce((n, r) => n + r.length, 0);
    await sink.put(key, sealed, { expirationTtl: RETENTION_SECONDS, metadata: { created_at: backup.created_at, checksum: backup.checksum, bytes: sealed.length, rows } });
    state.lastDay = day;
    ctx.audit.record({ type: 'backup.offsite_stored', actor: 'system', subjectType: 'backup', subjectId: key, data: { bytes: sealed.length, rows, checksum: backup.checksum, retention_days: RETENTION_SECONDS / 86_400 }, testMode: ctx.config.testMode });
    return { status: 'STORED', key, bytes: sealed.length };
  } catch (e) {
    const error = (e as Error).message.slice(0, 200);
    state.nextAttemptAt = now.getTime() + RETRY_AFTER_MS;
    ctx.audit.record({ type: 'backup.offsite_failed', actor: 'system', subjectType: 'backup', subjectId: key, data: { error }, testMode: ctx.config.testMode });
    return { status: 'FAILED', key, error };
  }
}

/** Letzter Sicherungsstatus für Dashboard/Readiness. */
export function lastOffsiteBackup(ctx: AppContext): { stored_at: string | null; key: string | null; failed_since: string | null } {
  const ok = ctx.db.get<{ created_at: string; subject_id: string }>(`SELECT created_at, subject_id FROM audit_events WHERE event_type = 'backup.offsite_stored' ORDER BY seq DESC LIMIT 1`);
  const fail = ctx.db.get<{ created_at: string }>(`SELECT created_at FROM audit_events WHERE event_type = 'backup.offsite_failed' AND seq > COALESCE((SELECT MAX(seq) FROM audit_events WHERE event_type = 'backup.offsite_stored'), 0) ORDER BY seq LIMIT 1`);
  return { stored_at: ok?.created_at ?? null, key: ok?.subject_id ?? null, failed_since: fail?.created_at ?? null };
}

export const BACKUP_STALE_MS = 36 * 3_600_000;

export interface BackupStatus {
  /** NOT_ACTIVE = noch keine Sicherung, OK = aktuell, ATTENTION = fehlgeschlagen oder älter als 36 h. */
  health: 'NOT_ACTIVE' | 'OK' | 'ATTENTION';
  reason: 'FAILED' | 'STALE' | null;
  last_stored_at: string | null;
  last_key: string | null;
  failed_since: string | null;
  retention_days: number;
  target: 'workers-kv';
  encryption: 'AES-256-GCM';
}

/** Status für die Oberfläche (Owner-API /api/backup/status); die Darstellung liegt im Dashboard. */
export function backupStatus(ctx: AppContext): BackupStatus {
  const b = lastOffsiteBackup(ctx);
  const stale = b.stored_at !== null && ctx.clock().getTime() - Date.parse(b.stored_at) > BACKUP_STALE_MS;
  const reason = b.failed_since ? 'FAILED' : stale ? 'STALE' : null;
  return {
    health: reason ? 'ATTENTION' : b.stored_at ? 'OK' : 'NOT_ACTIVE',
    reason,
    last_stored_at: b.stored_at,
    last_key: b.key,
    failed_since: b.failed_since,
    retention_days: RETENTION_SECONDS / 86_400,
    target: 'workers-kv',
    encryption: 'AES-256-GCM',
  };
}
