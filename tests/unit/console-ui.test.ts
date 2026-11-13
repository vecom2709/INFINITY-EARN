import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { hashPassword, newId, randomToken } from '../../packages/shared/src/crypto.ts';
import { renderConsole, safeBack, statusReport, withFlash } from '../../apps/console/src/index.ts';
import { financeView, friendlyTitle, money, plainReason, shortRef } from '../../apps/console/src/model.ts';
import { CSS, TEXT_PAIRS, TOKENS } from '../../apps/console/src/tokens.ts';
import { NAV } from '../../apps/console/src/ui.ts';
import type { AppContext } from '../../services/core-api/src/context.ts';
import { Client, csrfFrom, serve } from '../http.ts';
import { makeCtx, toDelivered } from '../helpers.ts';

const PAGES = ['/dashboard', '/dashboard/kunden', '/dashboard/auftraege', '/dashboard/produkte', '/dashboard/finanzen', '/dashboard/berichte', '/dashboard/einstellungen', '/dashboard/aktivitaeten'];
const page = (ctx: AppContext, path: string, q = ''): string => renderConsole(ctx, path, new URLSearchParams(q), 'csrf-token-x') ?? '';

// WCAG 2.x relative Leuchtdichte und Kontrast
function lum(hex: string): number {
  const c = hex.replace('#', '').match(/../g)?.map((x) => parseInt(x, 16) / 255) ?? [0, 0, 0];
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number]; return (x + 0.05) / (y + 0.05); };

test('UI-06 Kontrast: alle verwendeten Text/Hintergrund-Paare erfüllen WCAG 2.2 AA', () => {
  for (const p of TEXT_PAIRS) {
    const ratio = contrast(p.fg, p.bg);
    assert.ok(ratio >= (p.large ? 3 : 4.5), `${p.name}: ${ratio.toFixed(2)}:1`);
  }
  // LUXURY TURQUOISE (Eigentümer-Vorgabe 2026-11-13)
  assert.equal(TOKENS.canvas, '#F7FAF9', 'Ivory White');
  assert.equal(TOKENS.accent, '#087F82', 'Tiefes Petrol');
  assert.equal(TOKENS.ink, '#0E1D25', 'Dark Ocean');
  assert.equal(TOKENS.accentSoft, '#DCEBEA', 'Soft Mist');
  assert.equal(TOKENS.brand, '#18C8C1', 'Türkis');
  assert.ok(contrast(TOKENS.brand, TOKENS.canvas) < 3, 'Türkis ist auf Hell kein Textfarbton – darf dort nur dekorativ sein');
  assert.ok(!TEXT_PAIRS.some((p) => p.fg === TOKENS.brand && p.bg !== TOKENS.ocean), 'Türkis als Text nur auf Dark Ocean');
});

test('UI-07 keine KI-/Neon-/Glitzer-Muster, keine externen Ressourcen, keine Skripte, Reduced Motion', () => {
  const { ctx } = makeCtx();
  const all = PAGES.map((p) => page(ctx, p)).join('\n');
  for (const bad of [/<script/i, /AI CEO/i, /Godmode/i, /Roboter/i, /neon/i, /glow/i, /radial-gradient/i, /text-shadow/i, /@keyframes/i, /🤖|✨|🚀|💰/u, /100 ?% automatisch/i, /https?:\/\/(?!127\.0\.0\.1)[^"'\s)]*\.(js|css|woff2?)/i]) {
    assert.doesNotMatch(all, bad, String(bad));
  }
  assert.match(CSS, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(CSS, /@import|url\(http/i, 'keine externen Fonts/CDNs');
});

test('UI-04 sechs Bereiche, Barrierefreiheits-Grundstruktur auf jeder Seite', () => {
  const { ctx } = makeCtx();
  assert.deepEqual(NAV.map((n) => n.label), ['Übersicht', 'Kunden', 'Aufträge', 'Produkte', 'Finanzen', 'Berichte']);
  for (const p of PAGES) {
    const h = page(ctx, p);
    assert.ok(h.startsWith('<!doctype html><html lang="de">'), `${p}: lang`);
    assert.match(h, /name="viewport" content="width=device-width,initial-scale=1"/, `${p}: viewport`);
    assert.equal((h.match(/<h1[\s>]/g) ?? []).length, 1, `${p}: genau eine Hauptüberschrift`);
    assert.match(h, /class="skip" href="#inhalt"/, `${p}: Sprunglink`);
    assert.match(h, /<nav class="nav" aria-label="Hauptnavigation">/, `${p}: Navigation`);
    const navLinks = /<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/.exec(h)?.[1]?.match(/<a /g) ?? [];
    assert.ok(navLinks.length <= 6, `${p}: höchstens 6 Hauptbereiche`);
    for (const m of h.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      const attrs = m[2] ?? '';
      if (/type="hidden"/.test(attrs)) continue;
      const id = /id="([^"]+)"/.exec(attrs)?.[1];
      assert.ok(/aria-label="/.test(attrs) || (id && h.includes(`for="${id}"`)), `${p}: Feld ohne Beschriftung: ${attrs.slice(0, 80)}`);
    }
    for (const th of h.matchAll(/<th\b[^>]*>/g)) assert.match(th[0], /scope="col"/, `${p}: Tabellenkopf ohne scope`);
    for (const st of h.matchAll(/<span class="tag[^"]*"><span class="dot" aria-hidden="true"><\/span>([^<]*)<\/span>/g)) assert.ok((st[1] ?? '').trim().length > 0, `${p}: Status nur farbcodiert`);
  }
  assert.match(page(ctx, '/dashboard/kunden'), /aria-current="page"[^>]*>[\s\S]*?Kunden/);
});

test('UI-02 / UI-11 leerer Echtbetrieb: ehrliche leere Zustände, keine Musterzahlen, Bank nicht verbunden', () => {
  const { ctx } = makeCtx();
  const h = page(ctx, '/dashboard');
  assert.match(h, /Noch keine Verkäufe im Echtbetrieb/);
  assert.match(h, /data-metric="paid"[\s\S]*?0,00\s€/);
  assert.match(h, /data-metric="bank"[\s\S]*?Noch nicht verbunden[\s\S]*?Kein Bankeingang verifizierbar/);
  assert.match(h, /Noch keine Aktivitäten/);
  assert.match(h, /Keine offenen Punkte/);
  for (const fake of ['2.480', '1.762', '1.440', 'Nordstern', 'Musterwerk', 'Beispielagentur']) assert.ok(!h.includes(fake), `Musterwert ${fake}`);
  const fin = page(ctx, '/dashboard/finanzen');
  for (const id of ['paid', 'provider', 'transit', 'bank', 'reserve']) assert.match(fin, new RegExp(`data-metric="${id}"`), `Finanzwert ${id}`);
  assert.match(fin, /Steuerkontext fehlt/);
});

test('UI-03 / Negativtest 8: Testdaten erhöhen nie die Echt-Kennzahlen; Test sichtbar und für Screenreader gekennzeichnet', () => {
  const { ctx } = makeCtx();
  const o = toDelivered(ctx);
  assert.equal(financeView(ctx, false).paidMinor, 0);
  assert.ok(financeView(ctx, true).paidMinor > 0);
  const live = page(ctx, '/dashboard');
  assert.match(live, /data-metric="paid"[\s\S]*?0,00\s€/);
  assert.match(live, /Im Testbetrieb gibt es 1 Testauftrag/);
  assert.match(live, /Testbetrieb<span class="sr-only"> – Echtbetrieb gesperrt, kein echtes Geld<\/span>/);
  const testView = page(ctx, '/dashboard', 'modus=test');
  assert.match(testView, /<strong>Testdaten:<\/strong>/);
  assert.match(testView, /Testgeld/);
  assert.ok(testView.includes(`/dashboard/auftraege/${o.orderId}?modus=test`), 'UI-08: Auftrag direkt aus der Übersicht erreichbar');
  const detail = page(ctx, `/dashboard/auftraege/${o.orderId}`);
  assert.match(detail, /Testauftrag/);
  assert.match(detail, /<li class="done">[\s\S]*?Geliefert/, 'Lieferstatus im Fortschritt');
  assert.match(detail, /Testbeleg – keine gültige Rechnung|noch keiner/);
});

test('Negativtest 7: gemeldete Auszahlung ohne Bankbestätigung erscheint nur als „unterwegs“, nie „auf Bank“', () => {
  const { ctx } = makeCtx();
  const o = toDelivered(ctx);
  const now = ctx.clock().toISOString();
  ctx.db.run(`INSERT INTO payouts (payout_id, provider, provider_payout_id, amount_minor, currency, status, order_ids_json, bank_credit_confirmed, provider_event_id, test_mode, created_at, updated_at)
    VALUES (?, 'mock', ?, 1000, 'EUR', 'SENT', ?, 0, ?, 1, ?, ?)`, newId('po'), `po_${randomToken(6)}`, JSON.stringify([o.orderId]), `evt_${randomToken(6)}`, now, now);
  ctx.db.run(`INSERT INTO ledger_entries (entry_id, order_id, account, amount_minor, currency, source_type, source_ref, description, test_mode, created_at)
    VALUES (?, NULL, 'payouts', -1000, 'EUR', 'payout_event', ?, 'Testauszahlung', 1, ?)`, newId('le'), `po_ref_${randomToken(6)}`, now);
  const f = financeView(ctx, true);
  assert.equal(f.inTransitMinor, 1000);
  assert.equal(f.onBankMinor, 0);
  const fin = page(ctx, '/dashboard/finanzen', 'modus=test');
  assert.match(fin, /data-metric="transit"[\s\S]*?10,00\s€/);
  assert.match(fin, /Auszahlung unterwegs/);
  assert.doesNotMatch(fin, /Auf Bank angekommen/);
  assert.match(fin, /data-metric="bank"[\s\S]*?Noch nicht verbunden/);
});

test('UI-10 Kostengate sichtbar gesperrt; Funktionsstand zeigt alle 147 ehrlich; Statusbericht ohne personenbezogene Daten', () => {
  const { ctx } = makeCtx();
  toDelivered(ctx);
  const rep = page(ctx, '/dashboard/berichte');
  assert.match(rep, /Technisch gesperrt/);
  assert.match(rep, /0 € pro Monat freigegeben/);
  assert.equal((rep.match(/<td data-label="Nr\.">\d{3}<\/td>/g) ?? []).length, 147);
  for (const n of ['048', '049', '110']) assert.ok(!rep.includes(`<td data-label="Nr.">${n}</td>`), `abgelehnte ${n} nicht gelistet`);
  const filtered = page(ctx, '/dashboard/berichte', 'stand=GESPERRT');
  assert.ok((filtered.match(/<td data-label="Nr\.">\d{3}<\/td>/g) ?? []).length < 147);
  const set = page(ctx, '/dashboard/einstellungen');
  assert.match(set, /Kostenpflichtige Dienste<\/dt><dd><span class="tag ok"><span class="dot" aria-hidden="true"><\/span>Gesperrt/);
  const s = statusReport(ctx);
  const text = JSON.stringify(s);
  assert.doesNotMatch(text, /@example|@/, 'keine E-Mail-Adressen');
  assert.equal((s.registry as { approved: number }).approved, 147);
  assert.equal((s.cost_gate as { max_additional_monthly_fixed_eur: number }).max_additional_monthly_fixed_eur, 0);
  assert.equal((s.live as { bank_connected: boolean }).bank_connected, false);
});

test('Verständliche Texte: kein „-0,00 €“, keine internen Kennungen, Auftragsnummer bricht nicht um', () => {
  assert.equal(money(-0).replace(/\s/g, ' '), '0,00 €');
  assert.equal(money(-210).replace(/\s/g, ' '), '-2,10 €');
  assert.equal(friendlyTitle('b2b-calc-csv gemäß Anfrage'), 'Kalkulationstabelle gemäß Anfrage');
  assert.equal(plainReason('Lieferung dlv_796cd5bed3f84663866bd48ec9e764d7 freigegeben'), 'Lieferung freigegeben');
  assert.equal(plainReason('Capability b2b-calc-csv@1'), 'Produktart Kalkulationstabelle');
  assert.match(shortRef('ord_7b4c9fabc'), /^IE‑7B4C9F$/);
  const { ctx } = makeCtx();
  const o = toDelivered(ctx);
  const detail = page(ctx, `/dashboard/auftraege/${o.orderId}`);
  assert.doesNotMatch(detail, /dlv_[a-f0-9]{8}|b2b-calc-csv|Capability/);
});

test('Rücksprung nach Owner-Aktionen nur auf interne Konsolenpfade', () => {
  assert.equal(safeBack('/dashboard/finanzen?modus=test#erstattungen'), '/dashboard/finanzen?modus=test#erstattungen');
  for (const bad of ['https://evil.example', '//evil.example', '/login', '/dashboard/../login', '/dashboard//x', 'javascript:alert(1)', null]) assert.equal(safeBack(bad), '/dashboard', String(bad));
  assert.equal(withFlash('/dashboard/einstellungen#freigaben', 'ok'), '/dashboard/einstellungen?msg=ok#freigaben');
  assert.equal(withFlash('/dashboard/kunden?modus=test', 'a b'), '/dashboard/kunden?modus=test&msg=a%20b');
});

describeHttp();

function describeHttp(): void {
  const PASSWORD = `pw-${randomToken(12)}`;
  let base = '';
  let close: () => void = () => undefined;
  let ctx: AppContext;
  before(async () => {
    ctx = makeCtx({ env: { OWNER_PASSWORD_HASH: hashPassword(PASSWORD) } }).ctx;
    const s = await serve(ctx);
    base = s.base;
    close = () => s.server.close();
  });
  after(() => close());

  test('Router: alle Bereiche nur mit Owner-Login, unbekannte Seiten 404, Aktion kehrt zur Ausgangsseite zurück', async () => {
    const anon = new Client(base);
    for (const p of [...PAGES, '/dashboard/experte', '/api/status']) assert.ok([303, 401].includes((await anon.get(p)).status), `${p} ohne Login`);
    const c = new Client(base);
    await c.post('/auth/login', { password: PASSWORD });
    for (const p of PAGES) {
      const r = await c.get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    }
    assert.equal((await c.get('/dashboard/unbekannt')).status, 404);
    assert.equal((await c.get('/dashboard/auftraege/ord_ffffffff')).status, 404);
    assert.match((await c.get('/dashboard/experte')).text, /Eigentümer-Dashboard/);
    const set = await c.get('/dashboard/einstellungen');
    const r = await c.post('/admin/stops', { stop: 'PAUSE_PRODUCTION', active: '1', _csrf: csrfFrom(set.text), _back: '/dashboard/einstellungen' });
    assert.equal(r.status, 303);
    assert.match(r.location ?? '', /^\/dashboard\/einstellungen\?msg=Produktion%3A%20pausiert$/);
    const evil = await c.post('/admin/stops', { stop: 'PAUSE_PRODUCTION', active: '0', _csrf: csrfFrom(set.text), _back: 'https://evil.example/' });
    assert.match(evil.location ?? '', /^\/dashboard\?msg=/);
    const overview = await c.get('/dashboard');
    assert.match(overview.text, /Dein Geschäft\. Klar im Blick\./);
    const status = JSON.parse((await c.get('/api/status')).text) as { mode: string; registry: { approved: number } };
    assert.deepEqual([status.mode, status.registry.approved], ['TEST', 147]);
  });
}
