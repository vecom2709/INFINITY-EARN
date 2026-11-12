import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { acquireFromTed } from '../services/acquisition/src/connectors/ted.ts';
import { loadConfig } from '../services/core-api/src/config.ts';
import { createContext } from '../services/core-api/src/context-node.ts';

/**
 * TED-Abruf von der Kommandozeile (vom Eigentümer gestartet).
 *   npm run acquire -- --preview   liest und bewertet, speichert keine Leads (Bericht in data/acquisition/)
 *   npm run acquire                speichert Nachweise + Leads – nur wenn die Quelle im Dashboard freigegeben ist
 */
const preview = process.argv.includes('--preview');
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 14);
const ctx = createContext(loadConfig());
const r = await acquireFromTed(ctx, { mode: preview ? 'PREVIEW' : 'PERSIST', actor: 'owner', sinceDays: Number.isFinite(days) ? days : 14, maxPages: 2, limit: 50 });

console.log(`TED ${r.mode}: Status ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
console.log(`Verfügbar: ${r.totalAvailable ?? '?'} · abgerufen: ${r.seen} · relevant: ${r.relevant} · neue Leads: ${r.leadsCreated}`);
const top = [...r.items].sort((a, b) => b.score.total - a.score.total).slice(0, 10);
for (const i of top) {
  console.log(`  [${String(i.score.total).padStart(3)}] ${i.score.relevant ? 'RELEVANT ' : '         '}${i.publicationNumber} ${i.noticeType ?? ''} – ${i.title.slice(0, 90)}`);
}
const dir = resolve('data/acquisition');
mkdirSync(dir, { recursive: true });
const file = join(dir, `ted-${r.mode.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ ...r, items: r.items.map(({ raw: _raw, ...rest }) => rest) }, null, 2));
console.log(`Bericht: ${file}`);
ctx.db.close();
process.exit(r.status === 'ERROR' ? 1 : 0);
