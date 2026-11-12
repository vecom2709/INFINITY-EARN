import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBackup } from '../services/core-api/src/backup-offsite.ts';
import { restoreBackup } from './restore-backup.ts';

/**
 * Holt eine tägliche Staging-Sicherung aus Workers KV, entschlüsselt sie und prüft sie per Restore-Test:
 *   npm run backup:pull               → neueste Sicherung
 *   npm run backup:pull -- 2026-11-12 → bestimmter Tag
 * Optional zweites Argument: Ziel-SQLite-Datei für eine echte Wiederherstellung (Standard: nur im Speicher prüfen).
 * Der Schlüssel (BACKUP_ENCRYPTION_KEY) wird aus .dev.vars gelesen und nie ausgegeben.
 * Ergebnis: data/backups/<tag>.json (enthält personenbezogene Daten – nicht weitergeben).
 */
const win = process.platform === 'win32';
const wrangler = (...args: string[]): string =>
  execFileSync(win ? 'npx.cmd' : 'npx', ['wrangler', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000, shell: win, stdio: ['ignore', 'pipe', 'pipe'] });

const key = /^BACKUP_ENCRYPTION_KEY=(.+)$/m.exec(readFileSync('.dev.vars', 'utf8'))?.[1]?.trim();
if (!key) {
  console.error('BACKUP_ENCRYPTION_KEY fehlt in .dev.vars – ohne Schlüssel keine Entschlüsselung.');
  process.exit(2);
}

let day = process.argv[2];
if (!day) {
  const raw = wrangler('kv', 'key', 'list', '--binding', 'BACKUPS', '--remote', '--prefix', 'backup/');
  const keys = (JSON.parse(raw.slice(raw.indexOf('['))) as { name: string }[]).map((k) => k.name).sort();
  if (!keys.length) {
    console.error('Noch keine Sicherung in KV vorhanden.');
    process.exit(1);
  }
  day = keys.at(-1)?.replace('backup/', '');
  console.log(`Vorhandene Sicherungen: ${keys.length} (${keys[0]} … ${keys.at(-1)})`);
}
if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error('Tag im Format JJJJ-MM-TT angeben.');
  process.exit(2);
}

const sealed = wrangler('kv', 'key', 'get', `backup/${day}`, '--binding', 'BACKUPS', '--remote', '--text');
const start = sealed.indexOf('{"format"');
if (start < 0) {
  console.error(`Sicherung backup/${day} nicht gefunden.`);
  process.exit(1);
}
const backup = await openBackup(sealed.slice(start).trim(), key);
mkdirSync('data/backups', { recursive: true });
const file = join('data/backups', `${day}.json`);
writeFileSync(file, JSON.stringify(backup), { mode: 0o600 });
const r = restoreBackup(backup, process.argv[3] ?? ':memory:');
console.log(`Sicherung backup/${day}: erstellt ${backup.created_at}, ${Math.round(sealed.length / 1024)} KB verschlüsselt, entschlüsselt → ${file}`);
console.log(r.ok ? `RESTORE OK: ${r.rows} Zeilen, ${r.artifactsVerified} Artefakte mit gültiger Prüfsumme` : `RESTORE FEHLER: ${r.issues.join(', ')}`);
process.exit(r.ok ? 0 : 1);
