import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { hashPassword, randomToken } from '../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { autopilotTick } from '../../services/core-api/src/autopilot.ts';
import { Client, serve } from '../http.ts';
import { makeCtx, toDelivered, toPaid, toQuote } from '../helpers.ts';

/**
 * 17.0 No-Prototype-Prüfung: Durchläuft die echte Anwendung als Besucher, Kunde und Eigentümer und prüft JEDES
 * Bedienelement, das auf den Seiten erscheint:
 *  - jeder interne Link führt zu einer vorhandenen Seite (kein 404, kein Serverfehler),
 *  - jedes Formular zeigt auf eine vorhandene Route (POST ohne Daten darf abgelehnt, aber nie „nicht gefunden“ sein),
 *  - jeder Knopf gehört zu einem Formular oder hat eine Kennung für ein Skript (kein Knopf ohne Funktion),
 *  - Sprungmarken (#…) existieren auf der Zielseite, leere Links (href="#" / "") sind verboten.
 * Die Daten sind echte Vorgänge aus dem Ablauf (Anfrage, Angebot, bezahlter und gelieferter Auftrag).
 */
const PASSWORD = `pw-${randomToken(12)}`;
let ctx: AppContext;
let base: string;
let close: () => void;
let customerKey = '';

before(async () => {
  ctx = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD), BUILD_AGENT_TOKEN: `agent_${'x'.repeat(40)}`, AI_DAILY_TASK_LIMIT: '2' } }).ctx;
  const d = toDelivered(ctx);
  customerKey = d.customerAccessKey ?? '';
  toPaid(ctx);
  toQuote(ctx);
  autopilotTick(ctx);
  const s = await serve(ctx);
  base = s.base;
  close = () => s.server.close();
});
after(() => close());

interface Finding { page: string; problem: string }
const SKIP_GET = /^\/(auth\/logout|abmelden\/|download\/|checkout\/mock\/)/;

async function crawl(c: Client, start: string[], scope: RegExp, limit = 400): Promise<{ pages: number; links: number; forms: number; buttons: number; findings: Finding[] }> {
  const seen = new Set<string>();
  const queue = [...start];
  const findings: Finding[] = [];
  const formsSeen = new Set<string>();
  let links = 0;
  let buttons = 0;
  let pages = 0;
  while (queue.length && seen.size < limit) {
    const url = queue.shift() as string;
    if (seen.has(url)) continue;
    seen.add(url);
    const r = await c.get(url);
    if (r.status === 404 || r.status >= 500) {
      findings.push({ page: url, problem: `Seite antwortet mit ${r.status}` });
      continue;
    }
    if (r.status >= 300 && r.status < 400) {
      if (r.location?.startsWith('/') && !seen.has(r.location)) queue.push(r.location);
      continue;
    }
    if (!(r.headers.get('content-type') ?? '').includes('text/html')) continue;
    pages++;
    // Die Demo der Mini-Warenwirtschaft ist eine eigenständige App in einer Seite; ihre Bedienelemente prüft tests/products/mini-ww/ui.test.ts.
    if (url.startsWith('/demo/warenwirtschaft')) continue;
    // Eingebetteter Programmcode ist kein Seiteninhalt (die Demo-App prüft tests/products/mini-ww/ui.test.ts auf funktionslose Knöpfe).
    const html = r.text.replace(/<script\b[\s\S]*?<\/script>/g, '');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
      const href = (m[1] ?? '').replace(/&amp;/g, '&');
      links++;
      if (href === '' || href === '#') { findings.push({ page: url, problem: `Leerer Link (href="${href}")` }); continue; }
      if (href.startsWith('#')) { if (!ids.has(href.slice(1))) findings.push({ page: url, problem: `Sprungmarke ${href} fehlt auf der Seite` }); continue; }
      if (!href.startsWith('/') || href.startsWith('//')) continue; // externe Ziele werden nicht aufgerufen
      const [path, hash] = href.split('#');
      if (SKIP_GET.test(path ?? '')) continue;
      if (path && !seen.has(path) && (scope.test(path) || true)) queue.push(path);
      void hash;
    }
    for (const m of html.matchAll(/<form\b([^>]*)>/g)) {
      const attrs = m[1] ?? '';
      const action = (/\saction="([^"]*)"/.exec(attrs)?.[1] ?? url).replace(/&amp;/g, '&');
      const method = (/\smethod="([^"]*)"/i.exec(attrs)?.[1] ?? 'get').toLowerCase();
      const key = `${method} ${action.split('?')[0]}`;
      if (formsSeen.has(key) || !action.startsWith('/')) continue;
      formsSeen.add(key);
      if (method === 'post') {
        if (/^\/auth\/logout/.test(action)) continue;
        const p = await c.post(action, {});
        if (p.status === 404 || p.status >= 500) findings.push({ page: url, problem: `Formular → POST ${action} antwortet mit ${p.status}` });
      } else if (!seen.has(action)) queue.push(action);
    }
    // Knöpfe: innerhalb eines Formulars oder mit Kennung für das Seitenskript
    const withoutForms = html.replace(/<form\b[\s\S]*?<\/form>/g, '');
    for (const m of withoutForms.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      buttons++;
      if (!/\sid="/.test(m[1] ?? '') && !/\sform="/.test(m[1] ?? '')) findings.push({ page: url, problem: `Knopf ohne Funktion: „${(m[2] ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 40)}“` });
    }
    buttons += (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).join('').match(/<button\b/g)?.length ?? 0;
  }
  return { pages, links, forms: formsSeen.size, buttons, findings };
}

const report = (name: string, r: Awaited<ReturnType<typeof crawl>>): void => {
  console.log(`NO-PROTOTYPE ${name}: ${r.pages} Seiten, ${r.links} Links, ${r.forms} Formulare, ${r.buttons} Knöpfe, ${r.findings.length} Befunde`);
  assert.deepEqual(r.findings, [], `${name}: ${JSON.stringify(r.findings.slice(0, 12), null, 1)}`);
};

test('Besucher: jede öffentliche Seite, jeder Link, jedes Formular und jeder Knopf funktioniert', async () => {
  const sitemap = (await new Client(base).get('/sitemap.xml')).text;
  const fromSitemap = [...sitemap.matchAll(/<loc>[^<]*?(\/[^<]*)<\/loc>/g)].map((m) => new URL(m[0].replace(/<\/?loc>/g, '')).pathname);
  const r = await crawl(new Client(base), ['/', '/en', '/it', '/anfrage', '/berater', '/vertrauen', '/pruefen', '/konto', '/login', '/robots.txt', ...fromSitemap], /^\//);
  assert.ok(r.pages >= 15, `${r.pages} Seiten`);
  report('Besucher', r);
});

test('Kunde: Portal mit geliefertem Auftrag – alles bedienbar', async () => {
  const c = new Client(base);
  c.cookies.set('ie_customer', customerKey);
  const r = await crawl(c, ['/portal', '/konto'], /^\//);
  assert.ok(r.forms >= 3, `${r.forms} Formulare im Portal`);
  report('Kunde', r);
});

test('Eigentümer: gesamte Verwaltung – alle Bereiche, Unterseiten, Formulare und Knöpfe', async () => {
  const c = new Client(base);
  assert.equal((await c.post('/auth/login', { password: PASSWORD })).status, 303);
  const r = await crawl(c, ['/dashboard', '/dashboard?modus=test', '/dashboard/experte', '/dashboard/sicherheit'], /^\//, 600);
  assert.ok(r.pages >= 20 && r.forms >= 15, `${r.pages} Seiten, ${r.forms} Formulare`);
  report('Eigentümer', r);
});

test('Selbsttest der Prüfung: ein toter Link, ein Formular ins Leere und ein Knopf ohne Funktion werden gefunden', async () => {
  const { createServer } = await import('node:http');
  const page = '<html><body><a href="/gibt-es-nicht">x</a><a href="#">leer</a><a href="#fehlt">Marke</a><form method="post" action="/nirgendwo"><button>Senden</button></form><button type="button">Tot</button></body></html>';
  const srv = createServer((req, res) => {
    if (req.url === '/start') res.writeHead(200, { 'content-type': 'text/html' }).end(page);
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const addr = srv.address();
    const r = await crawl(new Client(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`), ['/start'], /^\//);
    const problems = r.findings.map((f) => f.problem).join(' | ');
    for (const expected of ['Seite antwortet mit 404', 'Leerer Link', 'Sprungmarke #fehlt', 'POST /nirgendwo antwortet mit 404', 'Knopf ohne Funktion: „Tot“']) assert.ok(problems.includes(expected), `${expected} – gefunden: ${problems}`);
  } finally {
    srv.close();
  }
});
