import { handle, initialState, ACTIONS, type AppState, type Form } from './ui/actions.ts';
import type { Lang } from './ui/i18n.ts';
import { CLIENT_ACTIONS, renderApp, ROUTES } from './ui/view.ts';
import type { Setup } from './src/setup.ts';

/**
 * Selbsttests des Programms, die die Produktfabrik bei jeder Auslieferung ausführt (ohne Browser, im Worker):
 * derselbe Fachcode und dieselben Aktionen wie die Knöpfe der ausgelieferten Datei.
 */
export interface SelfcheckResult { passed: boolean; detail: string }

/** Vollständiger Geschäftsablauf mit der Einrichtung des Kunden: Angebot → Auftrag → Lieferung → Rechnung → Zahlung. */
export function domainSelftest(company: string, lang: Lang, setup: Setup, now = new Date()): SelfcheckResult & { state?: AppState } {
  try {
    let st = initialState(company, lang, setup);
    const run = (action: string, form: Form): void => {
      const r = handle(st, action, form, now);
      if (r.flash.kind !== 'ok') throw new Error(`${action}: ${r.flash.text}`);
      st = r.state;
    };
    const std = setup.taxRates.find((t) => t.id === 'std');
    if (!std) return { passed: false, detail: 'kein Standardsteuersatz' };
    run('session.mode', { mode: 'pro' });
    run('article.add', { sku: 'T-1', name: 'Selbsttest', unit: 'Stk', price: '10,00', cost: '4,00', tax: 'std' });
    const art = st.store.articles[0]?.id ?? '';
    run('article.receive', { articleId: art, qty: '10' });
    run('customer.add', { name: 'Selbsttest-Kunde' });
    const cus = st.store.customers[0]?.id ?? '';
    run('quote.create', { customerId: cus, line_article_0: art, line_qty_0: '3' });
    run('quote.send', { id: st.store.quotes[0]?.id ?? '' });
    run('quote.accept', { id: st.store.quotes[0]?.id ?? '' });
    const ord = st.store.orders[0];
    run('order.deliver', { id: ord?.id ?? '', token: 'selftest', [`qty_${art}`]: '3' });
    run('invoice.draft', { [`del_${st.store.deliveries[0]?.id}`]: '1' });
    run('invoice.finalize', { id: st.store.invoices[0]?.id ?? '' });
    const inv = st.store.invoices[0];
    const tax = Math.round((3000 * std.bps) / 10000);
    const problems: string[] = [];
    if (st.store.quotes[0]?.number !== `${setup.prefixes.quote}00001`) problems.push(`Angebotsnummer ${st.store.quotes[0]?.number}`);
    if (ord?.number !== `${setup.prefixes.order}00001`) problems.push(`Auftragsnummer ${ord?.number}`);
    if (st.store.deliveries[0]?.number !== `${setup.prefixes.delivery}00001`) problems.push(`Lieferscheinnummer ${st.store.deliveries[0]?.number}`);
    if (inv?.number !== `${setup.prefixes.invoice}00001`) problems.push(`Rechnungsnummer ${inv?.number}`);
    if (inv?.totals.netMinor !== 3000 || inv.totals.taxMinor !== tax || inv.totals.grossMinor !== 3000 + tax) problems.push(`Summen ${JSON.stringify(inv?.totals)}`);
    if (inv?.dueDate !== new Date(now.getTime() + setup.paymentTermDays * 86_400_000).toISOString().slice(0, 10)) problems.push(`Fälligkeit ${inv?.dueDate}`);
    run('payment.record', { id: inv?.id ?? '', amount: ((3000 + tax) / 100).toFixed(2).replace('.', ',') });
    const stock = st.store.movements.filter((m) => m.articleId === art).reduce((n, m) => n + (m.type === 'RECEIPT' ? m.qty : m.type === 'ISSUE' ? -m.qty : 0), 0);
    if (stock !== 7) problems.push(`Bestand ${stock} statt 7`);
    const over = handle(st, 'order.deliver', { id: ord?.id ?? '', token: 'selftest-2', [`qty_${art}`]: '1' }, now);
    if (over.flash.kind !== 'error' || over.state !== st) problems.push('Überlieferung nicht abgewiesen');
    if (problems.length) return { passed: false, detail: problems.join('; ') };
    return { passed: true, detail: `Angebot ${setup.prefixes.quote}00001 → Rechnung ${inv?.number} über ${((inv?.totals.grossMinor ?? 0) / 100).toFixed(2)} bezahlt, Bestand 7, Fehlbedienung abgewiesen`, state: st };
  } catch (e) {
    return { passed: false, detail: (e as Error).message };
  }
}

/** Keine funktionslosen Schaltflächen und jedes Eingabefeld beschriftet – auf allen Seiten, als Inhaber und Mitarbeiter. */
export function uiSelfcheck(st: AppState, today: string): SelfcheckResult {
  const problems: string[] = [];
  const staffState = handle(st, 'user.add', { name: 'Prüfung', role: 'STAFF' }, new Date()).state;
  const staff: AppState = { ...staffState, session: { ...staffState.session, userId: staffState.store.users.at(-1)?.id ?? '', mode: 'basic' } };
  let pages = 0;
  for (const s of [st, staff]) {
    for (const r of [...ROUTES, `beleg/${st.store.invoices[0]?.id ?? ''}`, `beleg/${st.store.quotes[0]?.id ?? ''}`]) {
      const html = renderApp(s, `#/${r}`, {}, today, 'tok');
      pages++;
      let open: string | null = null;
      for (const m of html.matchAll(/<form data-action="([^"]+)"|<\/form>|<button([^>]*)>/g)) {
        if (m[1]) {
          open = m[1];
          if (!ACTIONS.includes(m[1])) problems.push(`${r}: unbekannte Aktion ${m[1]}`);
        } else if (m[0] === '</form>') open = null;
        else {
          const client = /data-client="([^"]+)"/.exec(m[2] ?? '')?.[1];
          if (client) {
            if (!(CLIENT_ACTIONS as readonly string[]).includes(client)) problems.push(`${r}: unbekannte Client-Funktion ${client}`);
          } else if (!open && !/data-client-search/.test(html)) problems.push(`${r}: Schaltfläche ohne Funktion`);
        }
      }
      for (const m of html.matchAll(/<(input|select)\b([^>]*)>/g)) {
        if (/type="(hidden|checkbox)"/.test(m[2] ?? '')) continue;
        const id = /id="([^"]+)"/.exec(m[2] ?? '')?.[1];
        if (!id || !html.includes(`for="${id}"`)) problems.push(`${r}: Feld ohne Beschriftung`);
      }
      // Beschriftung und Feld bilden im Raster eine Einheit (sonst stehen Beschriftungen über fremden Feldern)
      const gridFields = (html.match(/ id="f\d+"/g) ?? []).length;
      const paired = (html.match(/<div class="fld"><label for="(f\d+)">[^<]*<\/label><(?:input|select) id="\1"/g) ?? []).length;
      if (paired !== gridFields) problems.push(`${r}: ${gridFields - paired} Feld(er) nicht mit ihrer Beschriftung gruppiert`);
      if (/<script|javascript:|on\w+=/i.test(html)) problems.push(`${r}: eingebettetes Skript`);
    }
  }
  return problems.length ? { passed: false, detail: [...new Set(problems)].slice(0, 5).join('; ') } : { passed: true, detail: `${pages} Seiten geprüft (Inhaber/Profi und Mitarbeiter/Einsteiger)` };
}
