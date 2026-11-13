import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildHtml, CSP } from '../../../products/mini-ww/build.ts';
import { ACTIONS, backupFile, handle, importCsv, initialState, restoreFrom, type AppState, type Form } from '../../../products/mini-ww/ui/actions.ts';
import { brandColors, contrast, safeLogo } from '../../../products/mini-ww/ui/brand.ts';
import { KEYS, tr } from '../../../products/mini-ww/ui/i18n.ts';
import { CLIENT_ACTIONS, documentView, renderApp, ROUTES } from '../../../products/mini-ww/ui/view.ts';

/** Pilot P2 – Oberfläche des Offline-Programms (ohne Browser testbar; der echte Browserlauf ist zusätzlich dokumentiert). */

const now = new Date('2026-11-13T10:00:00Z');
const today = '2026-11-13';

function run(st: AppState, action: string, form: Form): AppState {
  const r = handle(st, action, form, now);
  assert.equal(r.flash.kind, 'ok', `${action}: ${r.flash.text}`);
  return r.state;
}

/** Vollständig befüllter Zustand über die Oberfläche (dieselben Aktionen wie die Knöpfe). */
function populated(lang: 'de' | 'it' | 'en' = 'de'): AppState {
  let st = initialState('Ferramenta Rossi', lang);
  st = run(st, 'session.mode', { mode: 'pro' });
  st = run(st, 'article.add', { sku: 'VITE-10', name: 'Viti 10 mm', unit: 'Conf', price: '12,50', cost: '7,00', tax: 'std' });
  const art = st.store.articles[0]?.id ?? '';
  st = run(st, 'article.receive', { articleId: art, qty: '40' });
  st = run(st, 'customer.add', { name: 'Edilizia Bianchi', email: 'a@b.example' });
  const cus = st.store.customers[0]?.id ?? '';
  st = run(st, 'quote.create', { customerId: cus, line_article_0: art, line_qty_0: '3' });
  st = run(st, 'quote.send', { id: st.store.quotes[0]?.id ?? '' });
  st = run(st, 'order.create', { customerId: cus, line_article_0: art, line_qty_0: '10' });
  const ord = st.store.orders[0]?.id ?? '';
  st = run(st, 'order.deliver', { id: ord, token: 't1', [`qty_${art}`]: '6' });
  st = run(st, 'invoice.draft', { [`del_${st.store.deliveries[0]?.id}`]: '1' });
  st = run(st, 'invoice.finalize', { id: st.store.invoices[0]?.id ?? '' });
  return st;
}

/** Jede Schaltfläche gehört zu einem Formular mit bekannter Aktion oder hat eine bekannte Client-Funktion. */
function assertNoDeadButtons(html: string, where: string): void {
  let open: string | null = null;
  for (const m of html.matchAll(/<form data-action="([^"]+)"|<\/form>|<button([^>]*)>/g)) {
    if (m[1]) { open = m[1]; assert.ok(ACTIONS.includes(m[1]), `${where}: unbekannte Aktion ${m[1]}`); }
    else if (m[0] === '</form>') open = null;
    else {
      const attrs = m[2] ?? '';
      const client = /data-client="([^"]+)"/.exec(attrs)?.[1];
      if (client) assert.ok((CLIENT_ACTIONS as readonly string[]).includes(client), `${where}: unbekannte Client-Funktion ${client}`);
      else assert.ok(open || /data-client-search/.test(html), `${where}: Schaltfläche ohne Funktion: ${m[0]}`);
    }
  }
}

test('Keine funktionslosen Schaltflächen und jedes Feld beschriftet – auf allen Seiten, als Inhaber/Profi und Mitarbeiter/Einsteiger', () => {
  const st = populated();
  const staffSt = run(st, 'user.add', { name: 'Luca', role: 'STAFF' });
  const staff = { ...staffSt, session: { ...staffSt.session, userId: staffSt.store.users[1]?.id ?? '', mode: 'basic' as const } };
  for (const s of [st, staff]) {
    for (const r of [...ROUTES, `beleg/${st.store.invoices[0]?.id}`, `beleg/${st.store.quotes[0]?.id}`]) {
      const html = renderApp(s, `#/${r}`, {}, today, 'tok');
      assertNoDeadButtons(html, r);
      for (const m of html.matchAll(/<(input|select)\b([^>]*)>/g)) {
        if (/type="(hidden|checkbox)"/.test(m[2] ?? '')) continue;
        const id = /id="([^"]+)"/.exec(m[2] ?? '')?.[1];
        assert.ok(id && html.includes(`for="${id}"`), `${r}: Feld ohne Beschriftung ${m[0].slice(0, 60)}`);
      }
      assert.doesNotMatch(html, /<script|javascript:|on\w+=/i, `${r}: keine eingebetteten Skripte/Handler`);
    }
  }
  const staffInvoices = renderApp(staff, '#/rechnungen', {}, today, 'tok');
  assert.doesNotMatch(staffInvoices, /invoice\.finalize|credit\.create/, 'Mitarbeiter sieht keine Inhaber-Aktionen');
  assert.doesNotMatch(renderApp(staff, '#/artikel', {}, today, 'tok'), /article\.adjust/);
});

test('Durchgängiger Ablauf über die Oberfläche: Zahlung erfasst, Rechnung bezahlt, Druckansicht korrekt', () => {
  let st = populated();
  const inv = st.store.invoices[0];
  assert.equal(inv?.number, 'RE-00001');
  st = run(st, 'payment.record', { id: inv?.id ?? '', amount: '91,50' }); // 6 × 12,50 = 75,00 + 22 % = 91,50
  const html = renderApp(st, '#/rechnungen', {}, today, 'tok');
  assert.match(html, /RE-00001[\s\S]*Bezahlt/);
  const doc = documentView(st, inv?.id ?? '');
  assert.match(doc, /Rechnung RE-00001/);
  assert.match(doc, /91,50 €/);
  assert.match(doc, /Steuerberatung/);
  const ov = renderApp(st, '#/', {}, today, 'tok');
  assert.match(ov, /75,00 €/, 'Monatsumsatz netto auf der Übersicht');
});

test('Fehlbedienung: verständliche Meldung, Zustand unverändert; Doppelklick auf Liefern wird erkannt', () => {
  const st = populated();
  const ord = st.store.orders[0];
  const art = st.store.articles[0]?.id ?? '';
  const over = handle(st, 'order.deliver', { id: ord?.id ?? '', token: 't2', [`qty_${art}`]: '99' }, now);
  assert.equal(over.flash.kind, 'error');
  assert.match(over.flash.text, /offen 4/);
  assert.equal(over.state, st, 'nichts geändert');
  const dbl = handle(st, 'order.deliver', { id: ord?.id ?? '', token: 't1', [`qty_${art}`]: '1' }, now);
  assert.match(dbl.flash.text, /bereits gebucht/, 'gleiches Formular-Token = Doppelklick');
  assert.match(handle(st, 'article.add', { sku: 'X', name: 'Y', price: 'abc' }, now).flash.text, /Verkaufspreis ungültig/);
  assert.match(handle(st, 'gibt.es.nicht', {}, now).flash.text, /Unbekannte Aktion/);
});

test('DE/IT/EN: Seiten und Meldungen übersetzt, Fachfehler je Code verständlich', () => {
  const it = populated('it');
  assert.match(renderApp(it, '#/', {}, today, 'tok'), /Panoramica[\s\S]*Fatturato del mese/);
  assert.match(renderApp(it, '#/rechnungen', {}, today, 'tok'), /Fattura/);
  const err = handle(it, 'order.deliver', { id: it.store.orders[0]?.id ?? '', token: 'x', [`qty_${it.store.articles[0]?.id}`]: '99' }, now);
  assert.equal(err.flash.text, 'Quantità superiore al residuo dell’ordine.');
  const en = run(it, 'session.lang', { lang: 'en' });
  assert.match(renderApp(en, '#/artikel', {}, today, 'tok'), /Goods receipt/);
  assert.equal(en.store.users[0]?.name, 'Titolare', 'Name des Erstbenutzers in der Startsprache');
});

test('Vollständigkeit: jeder Text der Oberfläche und jeder Fehlercode der Fachlogik hat IT/EN', () => {
  const ui = readFileSync('products/mini-ww/ui/view.ts', 'utf8') + readFileSync('products/mini-ww/ui/actions.ts', 'utf8') + readFileSync('products/mini-ww/ui/main.ts', 'utf8');
  const used = new Set<string>();
  for (const m of ui.matchAll(/\bt\('([^']+)'\)|tr\([a-zA-Z.]+, '([^']+)'\)|ok: '([^']+)'/g)) used.add((m[1] ?? m[2] ?? m[3]) as string);
  for (const m of ui.matchAll(/\['[a-z]*', '([^']+)'\]/g)) used.add(m[1] as string);
  for (const m of ui.matchAll(/: \['([^']+)', '(ok|warn|bad|)'\]/g)) used.add(m[1] as string);
  const missingUi = [...used].filter((k) => /\p{L}/u.test(k) && !KEYS.includes(k));
  assert.deepEqual(missingUi, []);
  const codes = new Set<string>();
  for (const f of readdirSync('products/mini-ww/src')) for (const m of readFileSync(`products/mini-ww/src/${f}`, 'utf8').matchAll(/DomainError\('([A-Z_]+)'/g)) codes.add(m[1] as string);
  for (const m of ui.matchAll(/DomainError\('([A-Z_]+)'/g)) codes.add(m[1] as string);
  const missingErr = [...codes].filter((c) => !KEYS.includes(`ERR_${c}`));
  assert.deepEqual(missingErr, [], 'Fehlercodes ohne Übersetzung');
  for (const k of KEYS) assert.notEqual(tr('it', k), '', k);
});

test('Kundendesign: unlesbare Farbe wird auf AA-Kontrast angepasst, ungültige Eingaben abgefangen, kein SVG-Logo', () => {
  const light = brandColors('#C8A2C8');
  assert.equal(light.adjusted, true);
  assert.ok(contrast(light.primary, '#FFFFFF') >= 4.5, `Kontrast ${light.contrast}`);
  const dark = brandColors('#1F5FA8');
  assert.equal(dark.adjusted, false);
  assert.equal(dark.primary, '#1F5FA8');
  assert.equal(brandColors('rot').adjusted, true);
  assert.equal(safeLogo('data:image/svg+xml;base64,PHN2Zz4='), null, 'SVG kann Skripte enthalten');
  assert.equal(safeLogo('https://evil.example/logo.png'), null);
  assert.ok(safeLogo('data:image/png;base64,iVBORw0KGgo='));
});

test('Sicherung und CSV über die Oberfläche: Rundreise, Fehler verständlich, letzte Sicherung vermerkt', () => {
  const st = populated();
  const b = backupFile(st, now);
  assert.match(b.name, /^sicherung-2026-11-13\.json$/);
  assert.equal(b.state.session.lastBackup, now.toISOString());
  const back = restoreFrom(initialState('Ferramenta Rossi', 'de'), b.content);
  assert.equal(back.flash.kind, 'ok');
  assert.deepEqual(back.state.store, st.store);
  assert.equal(restoreFrom(st, '{"x":1}').flash.kind, 'error');
  const imp = importCsv(st, 'articles', 'Artikelnummer;Bezeichnung;Einheit;Verkaufspreis;Einkaufspreis;Steuersatz\nA-1;Hammer;Stk;19,90;9,50;std\n', now);
  assert.match(imp.flash.text, /Import abgeschlossen\. \(1\)/);
  assert.equal(importCsv(st, 'articles', 'falsch\n', now).flash.kind, 'error');
});

test('Gebaute Datei: eine HTML-Datei, CSP verbietet Netzwerk, keine externen Quellen, Kundendaten sicher eingebettet', () => {
  const html = buildHtml({ company: 'Evil </script><script>alert(1)</script>', primary: '#1F5FA8', logoDataUrl: null, lang: 'de' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes(`content="${CSP}"`));
  assert.match(CSP, /default-src 'none'/);
  assert.doesNotMatch(CSP, /connect-src|https?:/, 'keine Netzwerkziele erlaubt');
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i, 'keine externen Skripte oder Stylesheets');
  assert.equal((html.match(/<script>alert\(1\)<\/script>/g) ?? []).length, 0, 'Firmenname kann kein Skript einschleusen');
  assert.ok(html.length < 300_000, `${Math.round(html.length / 1024)} KB`);
  assert.match(html, /"Modul fehlt: "/, 'Modullader enthalten');
  for (const mod of ['ui/main.ts', 'ui/view.ts', 'src/billing.ts', 'src/inventory.ts']) assert.ok(html.includes(JSON.stringify(mod)), mod);
});
