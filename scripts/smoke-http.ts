import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, csrfFrom } from '../tests/http.ts';

/**
 * Rauch- und Sicherheitstest gegen eine laufende Instanz (lokal, wrangler dev oder Staging):
 *   node scripts/smoke-http.ts <BASE_URL> [passwort-datei]
 * Spielt Anfrage → Angebot → Annahme → Mock-Zahlung → Autopilot → Download durch und prüft Sicherheitsmerkmale.
 * Nur mit Mock-Provider (Testmodus). Das Owner-Passwort wird aus der Datei gelesen und nie ausgegeben.
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const pwFile = process.argv[3] ?? 'data/ZUGANG-STAGING.txt';
const password = /Passwort:\s*(\S+)/.exec(readFileSync(pwFile, 'utf8'))?.[1] ?? '';
const checks: { check: string; ok: boolean; detail?: string }[] = [];
const ok = (check: string, cond: boolean, detail?: string): void => {
  checks.push({ check, ok: cond, detail });
  console.log(`${cond ? '✓' : '✗'} ${check}${detail ? ` – ${detail}` : ''}`);
};
const t0 = Date.now();

const anon = new Client(base);
const health = await anon.get('/health');
ok('Health erreichbar, Testmodus', health.status === 200 && /"mode": "TEST"/.test(health.text), health.text.replace(/\s+/g, ' ').slice(0, 120));
const h = health.headers;
ok('Sicherheitsheader (CSP, X-Frame-Options, nosniff, no-store)',
  /default-src 'none'/.test(h.get('content-security-policy') ?? '') && h.get('x-frame-options') === 'DENY' && h.get('x-content-type-options') === 'nosniff' && h.get('cache-control') === 'no-store');
ok('Dashboard ohne Login gesperrt', (await anon.get('/dashboard')).status === 303);
ok('Owner-API ohne Login 401', (await anon.get('/api/audit')).status === 401);
const forged = await anon.post('/webhooks/payments', '{"id":"evt_forged_000001","type":"x","livemode":false,"data":{"object":{}}}', { 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` });
ok('Gefälschter Webhook abgelehnt', forged.status === 400);

const customer = new Client(base);
const inquiry = await customer.post('/anfrage', {
  name: 'Staging Rauchtest', email: `smoke-${Date.now()}@example.com`, company: 'Rauchtest GmbH', country: 'DE', title: 'Staging Rauchtest',
  items: 'Montage;2;45.00\nMaterial;1;20', margin: '20', message: 'Automatischer Rauchtest (Testmodus).', privacy: '1',
});
ok('Anfrage → automatisches Angebot', inquiry.status === 303 && /\/angebot\/quo_/.test(inquiry.location ?? ''), inquiry.location ?? String(inquiry.status));
const quoteId = /\/angebot\/(quo_[a-f0-9]+)/.exec(inquiry.location ?? '')?.[1] ?? '';
const token = new URL(base + (inquiry.location ?? '/')).searchParams.get('t') ?? '';
const provider = /"payment_provider": "(\w+)"/.exec(health.text)?.[1] ?? 'mock';
const accept = await customer.post(`/angebot/${quoteId}/annehmen`, { t: token, buyer_name: 'Rauchtest GmbH', buyer_address: 'Teststr. 1, Berlin', buyer_country: 'DE', buyer_type: 'B2B', vat_id: '', terms: '1' });
if (provider === 'stripe') {
  ok('Annahme → Stripe-Checkout (Sandbox)', accept.status === 303 && /^https:\/\/checkout\.stripe\.com\//.test(accept.location ?? ''), (accept.location ?? String(accept.status)).slice(0, 60));
  ok('Mock-Checkout im Stripe-Modus gesperrt', (await customer.get('/checkout/mock/cs_test_mock_x')).status === 404);
} else {
  ok('Annahme → Testzahlung', accept.status === 303 && /\/checkout\/mock\//.test(accept.location ?? ''), accept.location ?? String(accept.status));
  const pay = await customer.post(`${accept.location}/pay`, { outcome: 'paid' });
  ok('Mock-Zahlung (signierter Webhook intern)', pay.status === 303);
}
const portalAfterAccept = await customer.get('/portal');
const contractLink = /href="(\/portal\/vertrag\/ord_[a-f0-9]+)"/.exec(portalAfterAccept.text)?.[1];
ok('Vertragsbestätigung im Portal direkt nach Annahme', !!contractLink);
if (contractLink) {
  const pdf = await customer.get(contractLink);
  ok('Vertragsbestätigung als PDF abrufbar', pdf.status === 200 && pdf.headers.get('content-type') === 'application/pdf' && pdf.text.startsWith('%PDF-1.4'), `${pdf.text.length} Bytes`);
  ok('Vertragsbestätigung für Fremde gesperrt', (await anon.get(contractLink)).status === 403);
}
const cookieHeader = accept.headers.get('set-cookie') ?? '';
ok('Kunden-Cookie HttpOnly', /HttpOnly/.test(cookieHeader), base.startsWith('https') ? (/Secure/.test(cookieHeader) ? 'Secure gesetzt' : 'Secure FEHLT') : 'http lokal');
if (base.startsWith('https')) ok('Cookie Secure über HTTPS', /Secure/.test(cookieHeader));

const owner = new Client(base);
const login = await owner.post('/auth/login', { password });
ok('Owner-Login', login.status === 303 && login.location === '/dashboard', String(login.status));
const dash = await owner.get('/dashboard');
ok('Konsole zeigt Testbetrieb und Echt-Umsatz 0', dash.status === 200 && /Testbetrieb/.test(dash.text) && /data-metric="paid"[\s\S]*?0,00\s€/.test(dash.text));
for (const p of ['/dashboard/kunden', '/dashboard/auftraege', '/dashboard/produkte', '/dashboard/finanzen', '/dashboard/berichte', '/dashboard/einstellungen']) ok(`Bereich ${p} erreichbar`, (await owner.get(p)).status === 200);
const tick = await owner.post('/admin/tick', { _csrf: csrfFrom(dash.text) });
ok('Autopilot-Takt (Produktion, Beleg, Abgleich)', tick.status === 303, decodeURIComponent(tick.location ?? '').replace('/dashboard?msg=', ''));
ok('CSRF erzwungen', (await owner.post('/admin/tick', {})).status === 403);

const portal = await customer.get('/portal');
const link = provider === 'stripe' ? undefined : /href="(\/download\/[^"]+)"/.exec(portal.text)?.[1];
if (provider !== 'stripe') ok('Download-Link im Kundenportal', !!link);
else ok('Ohne bestätigte Stripe-Zahlung kein Download', !/href="\/download\//.test(portal.text));
if (link) {
  const file = await customer.get(link);
  ok('Download liefert geprüfte CSV', file.status === 200 && /Position,Menge,Einzelpreis,Summe/.test(file.text) && /Gesamt,,,132\.00/.test(file.text) /* 2×45 + 20 = 110, +20 % = 132 */, file.text.split('\r\n').find((l) => l.startsWith('Gesamt')));
  ok('Fremder Zugriff auf Download verweigert', (await anon.get(link)).status === 403);
}
const summary = JSON.parse((await owner.get('/api/reports/summary')).text) as { live: { grossReceiptsMinor: number }; test: { grossReceiptsMinor: number } };
ok(provider === 'stripe' ? 'LIVE-Umsatz 0' : 'LIVE-Umsatz 0, TEST-Umsatz > 0', summary.live.grossReceiptsMinor === 0 && (provider === 'stripe' || summary.test.grossReceiptsMinor > 0), `test=${summary.test.grossReceiptsMinor}`);
const readiness = JSON.parse((await owner.get('/api/readiness')).text) as { summary: { liveTechnicallyLocked: boolean } };
ok('LIVE technisch gesperrt', readiness.summary.liveTechnicallyLocked === true);
const backup = await owner.get('/api/admin/backup');
ok('Backup-Export (Owner)', backup.status === 200 && /"tables"/.test(backup.text), `${Math.round(backup.text.length / 1024)} KB`);

const failed = checks.filter((c) => !c.ok);
const report = { base, run_at: new Date().toISOString(), duration_ms: Date.now() - t0, passed: checks.length - failed.length, failed: failed.length, checks };
mkdirSync('data/staging', { recursive: true });
const file = join('data/staging', `smoke-${new URL(base).hostname.replace(/[^a-z0-9.-]/gi, '_')}-${Date.now()}.json`);
writeFileSync(file, JSON.stringify(report, null, 2));
if (backup.status === 200) writeFileSync(file.replace('.json', '-backup.json'), backup.text);
console.log(`\n${report.passed}/${checks.length} Prüfungen bestanden · Bericht: ${file}`);
process.exit(failed.length ? 1 : 0);
