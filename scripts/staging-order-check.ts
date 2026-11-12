import { readFileSync } from 'node:fs';
import { Client } from '../tests/http.ts';

/**
 * Prüft den letzten bezahlten Auftrag auf Staging anhand des Audit-Logs (Owner-Login, nur lesend):
 * Zahlung → Produktion/QA → Lieferung → Beleg → Gebühr → Abgleich.
 */
const base = (process.argv[2] ?? '').replace(/\/$/, '');
const password = /Passwort:\s*(\S+)/.exec(readFileSync('data/ZUGANG-STAGING.txt', 'utf8'))?.[1] ?? '';
const owner = new Client(base);
if ((await owner.post('/auth/login', { password })).status !== 303) {
  console.error('Login fehlgeschlagen');
  process.exit(1);
}
type A = { event_id: string; event_type: string; actor: string; subject_id: string | null; data_json: string; created_at: string };
const audit = (JSON.parse((await owner.get('/api/audit?limit=500')).text) as A[]).reverse();
const paid = audit.filter((a) => a.event_type === 'payment.confirmed').at(-1);
if (!paid) {
  console.log('Keine bestätigte Zahlung im Audit-Log.');
  process.exit(1);
}
const order = paid.subject_id ?? '';
const forOrder = audit.filter((a) => a.subject_id === order || a.data_json.includes(order));
const steps: [string, string][] = [
  ['Zahlung (Stripe-Webhook, signiert)', 'payment.confirmed'],
  ['Produktion: Artefakt erzeugt', 'artifact.created'],
  ['QA bestanden', 'qa.passed'],
  ['Lieferung freigegeben', 'delivery.completed'],
  ['Testbeleg erstellt', 'invoice.created'],
  ['Stripe-Gebühr gebucht', 'fee.synced'],
];
console.log(`Auftrag ${order}`);
let ok = true;
for (const [label, type] of steps) {
  const e = forOrder.find((a) => a.event_type === type);
  ok &&= !!e;
  console.log(`${e ? '✓' : '✗'} ${label}${e ? ` · ${e.created_at} · ${e.data_json.slice(0, 110)}` : ''}`);
}
const reconciled = audit.filter((a) => a.event_type === 'opportunity.state_changed' && a.data_json.includes('"to":"LEDGER_RECONCILED"') && Date.parse(a.created_at) >= Date.parse(paid.created_at)).at(-1);
console.log(`${reconciled ? '✓' : '✗'} Abgleich (LEDGER_RECONCILED)${reconciled ? ` · ${reconciled.created_at}` : ''}`);
ok &&= !!reconciled;
const summary = JSON.parse((await owner.get('/api/reports/summary')).text) as { live: { grossReceiptsMinor: number }; test: { grossReceiptsMinor: number; feesMinor: number } };
console.log(`LIVE-Umsatz ${summary.live.grossReceiptsMinor} · TEST-Umsatz ${summary.test.grossReceiptsMinor} · TEST-Gebühren ${summary.test.feesMinor} (Minor Units)`);
process.exit(ok ? 0 : 1);
