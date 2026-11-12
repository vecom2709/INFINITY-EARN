import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupStatus, lastOffsiteBackup, newBackupState, openBackup, RETENTION_SECONDS, runDailyBackup, sealBackup, type BackupSink } from '../../services/core-api/src/backup-offsite.ts';
import { exportBackup } from '../../services/core-api/src/backup.ts';
import { createHandler } from '../../services/core-api/src/http-core.ts';
import { hashPassword } from '../../packages/shared/src/crypto.ts';
import { restoreBackup } from '../../scripts/restore-backup.ts';
import { makeCtx, toOrder } from '../helpers.ts';

const KEY = 'backup-key-0123456789abcdef0123456789abcdef';

class MemorySink implements BackupSink {
  store = new Map<string, { value: string; ttl: number; metadata: Record<string, unknown> }>();
  puts = 0;
  fail = false;
  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }
  async put(key: string, value: string, opts: { expirationTtl: number; metadata: Record<string, unknown> }): Promise<void> {
    this.puts++;
    if (this.fail) throw new Error('KV nicht erreichbar');
    this.store.set(key, { value, ttl: opts.expirationTtl, metadata: opts.metadata });
  }
}

test('Tägliche Sicherung: genau eine pro UTC-Tag, nach Neustart erkannt, Folgetag neu, 30 Tage Aufbewahrung', async () => {
  const { ctx, clock } = makeCtx();
  toOrder(ctx);
  const sink = new MemorySink();
  const state = newBackupState();
  const first = await runDailyBackup(ctx, sink, KEY, state);
  assert.equal(first.status, 'STORED');
  assert.equal(first.status === 'STORED' && first.key, 'backup/2026-11-12');
  assert.equal(sink.store.get('backup/2026-11-12')?.ttl, RETENTION_SECONDS);
  assert.equal((await runDailyBackup(ctx, sink, KEY, state)).status, 'SKIPPED');
  assert.equal((await runDailyBackup(ctx, sink, KEY, newBackupState())).status, 'EXISTS', 'Neustart der Instanz: keine Doppelsicherung');
  assert.equal(sink.puts, 1);
  clock.advance(86_400_000);
  assert.equal((await runDailyBackup(ctx, sink, KEY, state)).status, 'STORED');
  assert.deepEqual([...sink.store.keys()], ['backup/2026-11-12', 'backup/2026-11-13']);
  assert.equal(ctx.audit.byType('backup.offsite_stored').length, 2);
  assert.equal(lastOffsiteBackup(ctx).key, 'backup/2026-11-13');
  const stored = sink.store.get('backup/2026-11-13')?.value ?? '';
  assert.ok(!stored.includes('example.com') && !stored.includes('orders'), 'Inhalt verschlüsselt, keine Klartextdaten im Speicher');
});

test('Wiederherstellung: entschlüsseln → Restore-Test grün; falscher Schlüssel und Manipulation werden erkannt', async () => {
  const { ctx } = makeCtx();
  toOrder(ctx);
  toOrder(ctx);
  const sealed = await sealBackup(exportBackup(ctx, 'system'), KEY);
  const backup = await openBackup(sealed, KEY);
  const r = restoreBackup(backup);
  assert.deepEqual(r.issues, []);
  assert.ok(r.rows > 10);
  await assert.rejects(openBackup(sealed, `${KEY}-falsch`), /ENTSCHLUESSELUNG_FEHLGESCHLAGEN/);
  const env = JSON.parse(sealed) as { data: string };
  const flipped = env.data.startsWith('A') ? `B${env.data.slice(1)}` : `A${env.data.slice(1)}`;
  await assert.rejects(openBackup(JSON.stringify({ ...env, data: flipped }), KEY), /ENTSCHLUESSELUNG_FEHLGESCHLAGEN/);
  await assert.rejects(sealBackup(backup, 'zu-kurz'), /BACKUP_KEY_TOO_SHORT/);
});

test('Speicherfehler: FAILED + Audit, kein Retry vor 1 h, danach erfolgreich; Status warnt und entwarnt', async () => {
  const { ctx, clock } = makeCtx();
  const sink = new MemorySink();
  const state = newBackupState();
  assert.equal(backupStatus(ctx).health, 'NOT_ACTIVE');
  sink.fail = true;
  const failed = await runDailyBackup(ctx, sink, KEY, state);
  assert.deepEqual([failed.status, failed.status === 'FAILED' && failed.error], ['FAILED', 'KV nicht erreichbar']);
  assert.equal(ctx.audit.byType('backup.offsite_failed').length, 1);
  assert.notEqual(lastOffsiteBackup(ctx).failed_since, null);
  assert.deepEqual([backupStatus(ctx).health, backupStatus(ctx).reason], ['ATTENTION', 'FAILED']);
  sink.fail = false;
  clock.advance(30 * 60_000);
  assert.equal((await runDailyBackup(ctx, sink, KEY, state)).status, 'SKIPPED', 'Backoff schont das Free-Kontingent');
  assert.equal(sink.puts, 1);
  clock.advance(31 * 60_000);
  assert.equal((await runDailyBackup(ctx, sink, KEY, state)).status, 'STORED');
  assert.equal(lastOffsiteBackup(ctx).failed_since, null);
  assert.deepEqual([backupStatus(ctx).health, backupStatus(ctx).last_key], ['OK', 'backup/2026-11-12']);
  clock.advance(37 * 3_600_000);
  assert.deepEqual([backupStatus(ctx).health, backupStatus(ctx).reason], ['ATTENTION', 'STALE'], 'veraltete Sicherung wird gemeldet');
});

test('Owner-API /api/backup/status: nur mit Login, liefert Status als JSON (auch in /api/readiness)', async () => {
  const { ctx } = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword('owner-pass-123456') } });
  const handle = createHandler(ctx);
  const get = (url: string, cookie = ''): Promise<{ status: number; body?: unknown }> => handle({ method: 'GET', url, headers: cookie ? { cookie } : {}, body: '', ip: '1.2.3.4' });
  assert.equal((await get('/api/backup/status')).status, 401);
  const login = await handle({ method: 'POST', url: '/auth/login', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owner-pass-123456', ip: '1.2.3.4' });
  const setCookie = ([] as string[]).concat(login.headers?.['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  const res = await get('/api/backup/status', setCookie);
  assert.equal(res.status, 200);
  assert.equal((JSON.parse(String(res.body)) as { health: string }).health, 'NOT_ACTIVE');
  const ready = JSON.parse(String((await get('/api/readiness', setCookie)).body)) as { backup: { encryption: string } };
  assert.equal(ready.backup.encryption, 'AES-256-GCM');
});
