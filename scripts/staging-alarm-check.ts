import { readFileSync } from 'node:fs';
import { Client } from '../tests/http.ts';

/** Prüft, ob der Always-On-Takt (DO-Alarm) läuft: zählt automatische Autopilot-Takte im Audit-Log. */
const base = (process.argv[2] ?? '').replace(/\/$/, '');
const password = /Passwort:\s*(\S+)/.exec(readFileSync('data/ZUGANG-STAGING.txt', 'utf8'))?.[1] ?? '';
const owner = new Client(base);
if ((await owner.post('/auth/login', { password })).status !== 303) {
  console.error('Login fehlgeschlagen');
  process.exit(1);
}
const audit = JSON.parse((await owner.get('/api/audit?limit=500')).text) as { event_type: string; data_json: string; created_at: string }[];
const ticks = audit.filter((a) => a.event_type === 'job.enqueued' && a.data_json.includes('"autopilot"')).map((a) => a.created_at).sort();
const sinceMin = (Date.now() - Date.parse(ticks[0] ?? new Date().toISOString())) / 60000;
console.log(`${ticks.length} Autopilot-Takte im Audit-Log, erster vor ${sinceMin.toFixed(1)} min, letzter ${ticks.at(-1)}`);
process.exit(ticks.length >= 3 ? 0 : 1);
