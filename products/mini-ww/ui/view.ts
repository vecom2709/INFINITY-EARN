import * as W from '../src/index.ts';
import type { Invoice, Store } from '../src/index.ts';
import type { AppState } from './actions.ts';
import { tr, type Lang } from './i18n.ts';

/**
 * Ansichten als reine Funktionen (Zustand → HTML). Jede Schaltfläche gehört zu einem Formular mit `data-action`
 * (Fachaktion, siehe actions.ts) oder trägt `data-client` (Datei laden/speichern, Drucken – siehe main.ts).
 */
export const CLIENT_ACTIONS = ['backup.download', 'backup.restore', 'csv.export', 'csv.import', 'print'] as const;
export const ROUTES = ['', 'artikel', 'kunden', 'angebote', 'auftraege', 'rechnungen', 'berichte', 'daten', 'einstellungen'] as const;

export const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

interface V { s: Store; st: AppState; t: (x: string) => string; lang: Lang; pro: boolean; owner: boolean; today: string; token: string }

const money = (m: number, s: Store): string => W.formatMoney(m, s.settings.currency);
const cname = (s: Store, id: string): string => s.customers.find((c) => c.id === id)?.name ?? '—';
const form = (action: string, inner: string, hidden: Record<string, string> = {}, cls = ''): string =>
  `<form data-action="${esc(action)}" class="${cls}">${Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('')}${inner}</form>`;
let fieldSeq = 0;
const field = (label: string, name: string, attrs = '', value = ''): string => {
  const id = `f${++fieldSeq}`;
  return `<div class="fld"><label for="${id}">${esc(label)}</label><input id="${id}" name="${esc(name)}" value="${esc(value)}" ${attrs}></div>`;
};
const select = (label: string, name: string, options: [string, string][], attrs = ''): string => {
  const id = `f${++fieldSeq}`;
  return `<div class="fld"><label for="${id}">${esc(label)}</label><select id="${id}" name="${esc(name)}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>`;
};
const card = (title: string, body: string, id = ''): string => `<section class="card"${id ? ` id="${id}"` : ''}><h2>${esc(title)}</h2>${body}</section>`;
const table = (head: string[], rows: string[][], empty: string): string =>
  rows.length ? `<div class="tw"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${esc(head[i] ?? '')}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(empty)}</p>`;
const tag = (text: string, tone: 'ok' | 'warn' | 'bad' | '' = ''): string => `<span class="tag ${tone}">${esc(text)}</span>`;

function lineRows(v: V, n = 5): string {
  const opts: [string, string][] = [['', '—'], ...v.s.articles.filter((a) => a.active).map((a) => [a.id, `${a.sku} · ${a.name} (${money(a.priceMinor, v.s)})`] as [string, string])];
  return Array.from({ length: n }, (_, i) => `<div class="row2">${select(`${v.t('Position')} ${i + 1}`, `line_article_${i}`, opts)}${field(v.t('Menge'), `line_qty_${i}`, 'inputmode="numeric" pattern="[0-9]*"')}</div>`).join('');
}

function overview(v: V): string {
  const month = v.today.slice(0, 7);
  const rev = W.revenue(v.s, `${month}-01`, `${month}-31`);
  const oi = W.openItemsReport(v.s, v.today);
  const stock = W.stockReport(v.s);
  const low = stock.rows.filter((r) => r.available <= 2);
  const drafts = v.s.invoices.filter((i) => i.status === 'DRAFT').length;
  const uninvoiced = v.s.deliveries.filter((d) => !d.invoiceId).length;
  const openOrders = v.s.orders.filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL').length;
  const backupAge = v.st.session.lastBackup ? `${v.st.session.lastBackup.slice(0, 10)}` : v.t('noch nie');
  return `<div class="kpis">
<article class="kpi"><span>${v.t('Umsatz diesen Monat (netto)')}</span><b>${money(rev.netMinor, v.s)}</b></article>
<article class="kpi"><span>${v.t('Offene Posten')}</span><b>${money(oi.totalOpenMinor, v.s)}</b><small>${oi.overdue} ${v.t('davon überfällig')}</small></article>
<article class="kpi"><span>${v.t('Lagerwert (Einkauf)')}</span><b>${money(stock.totalValueMinor, v.s)}</b></article>
<article class="kpi"><span>${v.t('Letzte Sicherung')}</span><b>${esc(backupAge)}</b><small>${v.t('Ihre Daten liegen nur in diesem Browser. Sichern Sie regelmäßig.')}</small></article></div>
${card(v.t('Zu tun'), `<ul class="todo"><li><a href="#/rechnungen">${v.t('Rechnungsentwürfe festschreiben')}</a> ${tag(String(drafts), drafts ? 'warn' : 'ok')}</li><li><a href="#/rechnungen">${v.t('Lieferungen ohne Rechnung')}</a> ${tag(String(uninvoiced), uninvoiced ? 'warn' : 'ok')}</li><li><a href="#/auftraege">${v.t('Offene Aufträge')}</a> ${tag(String(openOrders))}</li></ul><p><button type="button" data-client="backup.download" class="btn ghost">${v.t('Jetzt sichern')}</button></p>`)}
${card(v.t('Knapper Bestand'), low.length ? table([v.t('Artikelnummer'), v.t('Bezeichnung'), v.t('Verfügbar')], low.map((r) => [esc(r.sku), esc(r.name), tag(String(r.available), r.available <= 0 ? 'bad' : 'warn')]), '') : `<p class="muted">${v.t('Alles im grünen Bereich.')}</p>`)}`;
}

function articles(v: V, q: string): string {
  const rows = v.s.articles.filter((a) => !q || `${a.sku} ${a.name}`.toLowerCase().includes(q.toLowerCase()));
  const taxOpts = v.s.settings.taxRates.map((r) => [r.id, r.label] as [string, string]);
  return `${card(v.t('Neuer Artikel'), form('article.add', `<div class="grid">${field(v.t('Artikelnummer'), 'sku', 'required maxlength="40"')}${field(v.t('Bezeichnung'), 'name', 'required maxlength="200"')}${field(v.t('Einheit'), 'unit', 'maxlength="20"', 'Stk')}${field(v.t('Verkaufspreis'), 'price', 'required inputmode="decimal" placeholder="12,50"')}${field(v.t('Einkaufspreis'), 'cost', 'inputmode="decimal" placeholder="7,00"')}${select(v.t('Steuersatz'), 'tax', taxOpts)}</div><p><button class="btn">${v.t('Anlegen')}</button></p>`))}
<form class="search" role="search" data-client-search="artikel"><label for="q" class="sr">${v.t('Suche')}</label><input id="q" name="q" type="search" placeholder="${esc(v.t('Suche'))}" value="${esc(q)}"></form>
${card(v.t('Artikel'), table([v.t('Artikelnummer'), v.t('Bezeichnung'), v.t('Verkaufspreis'), v.t('Bestand'), v.t('Reserviert'), v.t('Verfügbar'), v.t('Aktion')], rows.map((a) => {
    const st = W.stockOf(v.s, a.id);
    const recv = form('article.receive', `<div class="inline"><label class="sr" for="r-${a.id}">${v.t('Menge')}</label><input id="r-${a.id}" name="qty" inputmode="numeric" pattern="[0-9]*" required placeholder="${esc(v.t('Menge'))}"><button class="btn small">${v.t('Wareneingang')}</button></div>`, { articleId: a.id });
    const adj = v.pro && v.owner ? form('article.adjust', `<div class="inline"><label class="sr" for="d-${a.id}">${v.t('Korrektur (+/−)')}</label><input id="d-${a.id}" name="delta" required placeholder="±"><label class="sr" for="g-${a.id}">${v.t('Grund')}</label><input id="g-${a.id}" name="reason" required placeholder="${esc(v.t('Grund'))}"><button class="btn small ghost">${v.t('Korrigieren')}</button></div>`, { articleId: a.id }) : '';
    return [`<strong>${esc(a.sku)}</strong>`, `${esc(a.name)}<small>${esc(a.unit)}</small>`, money(a.priceMinor, v.s), String(st.onHand), String(st.reserved), tag(String(st.available), st.available <= 0 ? 'bad' : st.available <= 2 ? 'warn' : 'ok'), recv + adj];
  }), v.t('Noch keine Artikel.')))}`;
}

function customers(v: V): string {
  return `${card(v.t('Neuer Kunde'), form('customer.add', `<div class="grid">${field(v.t('Name'), 'name', 'required maxlength="200"')}${field(v.t('E-Mail'), 'email', 'type="email"')}${field(v.t('Adresse'), 'address')}${field(v.t('USt-IdNr.'), 'vatId')}</div><p><button class="btn">${v.t('Anlegen')}</button></p>`))}
${card(v.t('Kunden'), table([v.t('Kundennr.'), v.t('Name'), v.t('E-Mail'), v.t('Offene Posten')], v.s.customers.map((c) => {
    const open = W.openItems(v.s, v.today).filter((i) => i.customerId === c.id).reduce((a, i) => a + i.openMinor, 0);
    return [esc(c.number), `<strong>${esc(c.name)}</strong><small>${esc(c.address ?? '')}</small>`, esc(c.email ?? '—'), open ? money(open, v.s) : '—'];
  }), v.t('Noch keine Kunden.')))}`;
}

const QS: Record<string, [string, 'ok' | 'warn' | 'bad' | '']> = { DRAFT: ['Entwurf', 'warn'], SENT: ['Versendet', ''], ACCEPTED: ['Angenommen', 'ok'], REJECTED: ['Abgelehnt', 'bad'] };
const OS: Record<string, [string, 'ok' | 'warn' | 'bad' | '']> = { OPEN: ['Offen', 'warn'], PARTIAL: ['Teilgeliefert', 'warn'], DELIVERED: ['Geliefert', 'ok'], CANCELLED: ['Storniert', 'bad'] };

function quotes(v: V): string {
  const custOpts = v.s.customers.map((c) => [c.id, `${c.number} · ${c.name}`] as [string, string]);
  const create = custOpts.length && v.s.articles.length
    ? form('quote.create', `${select(v.t('Kunde'), 'customerId', custOpts, 'required')}${lineRows(v)}${field(v.t('Gültig (Tage)'), 'validDays', 'inputmode="numeric"', '30')}<p><button class="btn">${v.t('Als Entwurf speichern')}</button></p>`)
    : `<p class="muted">${v.t('Erst Kunden und Artikel anlegen.')}</p>`;
  return `${card(v.t('Neues Angebot'), create)}
${card(v.t('Angebote'), table([v.t('Nummer'), v.t('Kunde'), v.t('Betrag'), v.t('Status'), v.t('Aktion')], [...v.s.quotes].reverse().map((q) => {
    const [label, tone] = QS[q.status] ?? [q.status, ''];
    const acts = q.status === 'DRAFT' ? form('quote.send', `<button class="btn small">${v.t('Festschreiben')}</button>`, { id: q.id })
      : q.status === 'SENT' ? `<div class="inline">${form('quote.accept', `<button class="btn small">${v.t('Annehmen')}</button>`, { id: q.id })}${form('quote.reject', `<button class="btn small ghost">${v.t('Ablehnen')}</button>`, { id: q.id })}<a class="btn small ghost" href="#/beleg/${esc(q.id)}">${v.t('Drucken')}</a></div>` : '';
    return [esc(q.number ?? '—'), esc(cname(v.s, q.customerId)), money(W.computeTotals(q.lines).grossMinor, v.s), `${tag(v.t(label), tone)}<small>${v.t('gültig bis')} ${esc(q.validUntil)}</small>`, acts];
  }), v.t('Noch keine Angebote.')))}`;
}

function orders(v: V): string {
  const custOpts = v.s.customers.map((c) => [c.id, `${c.number} · ${c.name}`] as [string, string]);
  const create = custOpts.length && v.s.articles.length ? form('order.create', `${select(v.t('Kunde'), 'customerId', custOpts, 'required')}${lineRows(v)}<p><button class="btn">${v.t('Auftrag anlegen')}</button></p>`) : `<p class="muted">${v.t('Erst Kunden und Artikel anlegen.')}</p>`;
  return `${card(v.t('Aufträge'), table([v.t('Nummer'), v.t('Kunde'), v.t('Status'), v.t('Liefern')], [...v.s.orders].reverse().map((o) => {
    const [label, tone] = OS[o.status] ?? [o.status, ''];
    const open = o.lines.filter((l) => l.qty > l.delivered);
    const deliver = open.length ? form('order.deliver', `${open.map((l) => `<div class="inline"><label for="q-${o.id}-${l.articleId}">${esc(l.name)} (${v.t('offen')} ${l.qty - l.delivered})</label><input id="q-${o.id}-${l.articleId}" name="qty_${esc(l.articleId)}" inputmode="numeric" value="${l.qty - l.delivered}"></div>`).join('')}<button class="btn small">${v.t('Liefern')}</button>`, { id: o.id, token: `${v.token}-${o.id}` })
      + form('order.cancel', `<div class="inline"><label class="sr" for="c-${o.id}">${v.t('Grund')}</label><input id="c-${o.id}" name="reason" required placeholder="${esc(v.t('Grund'))}"><button class="btn small ghost">${v.t('Rest stornieren')}</button></div>`, { id: o.id }) : '';
    return [esc(o.number), esc(cname(v.s, o.customerId)), tag(v.t(label), tone), deliver];
  }), v.t('Noch keine Aufträge.')))}
${card(v.t('Neuer Auftrag (ohne Angebot)'), create)}`;
}

function invoices(v: V): string {
  const open = v.s.deliveries.filter((d) => !d.invoiceId);
  const draft = open.length ? form('invoice.draft', `${open.map((d) => `<label class="check"><input type="checkbox" name="del_${esc(d.id)}" value="1"> ${esc(d.number)} · ${esc(cname(v.s, d.customerId))} · ${esc(d.at.slice(0, 10))}</label>`).join('')}<p><button class="btn">${v.t('Rechnungsentwurf erstellen')}</button></p>`) : `<p class="muted">${v.t('Keine offenen Lieferungen.')}</p>`;
  const row = (i: Invoice): string[] => {
    const kind = i.kind === 'INVOICE' ? v.t('Rechnung') : v.t('Gutschrift');
    const openAmt = i.kind === 'INVOICE' ? W.openAmount(v.s, i.id) : 0;
    let acts: string;
    if (i.status === 'DRAFT') acts = `<div class="inline">${v.owner ? form('invoice.finalize', `<button class="btn small">${v.t('Festschreiben')}</button>`, { id: i.id }) : ''}${form('invoice.discard', `<button class="btn small ghost">${v.t('Verwerfen')}</button>`, { id: i.id })}</div>`;
    else {
      acts = `<a class="btn small ghost" href="#/beleg/${esc(i.id)}">${v.t('Drucken')}</a>`;
      if (i.kind === 'INVOICE' && openAmt > 0) acts += form('payment.record', `<div class="inline"><label class="sr" for="p-${i.id}">${v.t('Betrag')}</label><input id="p-${i.id}" name="amount" inputmode="decimal" required value="${esc(W.formatMoney(openAmt).replace(/ €$/, '').replace(/\./g, ''))}"><button class="btn small">${v.t('Zahlung erfassen')}</button></div>`, { id: i.id });
      if (i.kind === 'INVOICE' && v.owner && v.pro) acts += `<details><summary>${v.t('Gutschrift erstellen')}</summary>${form('credit.create', `${i.lines.map((l) => `<div class="inline"><label for="cr-${i.id}-${l.articleId}">${esc(l.name)} (max ${l.qty})</label><input id="cr-${i.id}-${l.articleId}" name="qty_${esc(l.articleId)}" inputmode="numeric" value="0"></div>`).join('')}${field(v.t('Grund'), 'reason', 'required')}<label class="check"><input type="checkbox" name="restock" value="1"> ${v.t('Ware zurück ins Lager')}</label><button class="btn small ghost">${v.t('Gutschrift erstellen')}</button>`, { id: i.id })}</details>`;
    }
    const dun = i.kind === 'INVOICE' && i.status === 'FINAL' ? W.dunningLevel(v.s, i.dueDate, v.today) : 0;
    const status = i.status === 'DRAFT' ? tag(v.t('Entwurf'), 'warn') : openAmt < 0 ? tag(`${v.t('Guthaben des Kunden')} ${money(-openAmt, v.s)}`, 'warn') : i.kind === 'INVOICE' && openAmt === 0 ? tag(v.t('Bezahlt'), 'ok') : tag(v.t('Festgeschrieben'));
    return [`${esc(i.number ?? '—')}<small>${esc(kind)}</small>`, esc(cname(v.s, i.customerId)), money(i.totals.grossMinor, v.s), `${status}${i.dueDate ? `<small>${v.t('Fällig')} ${esc(i.dueDate)}${dun ? ` · ${v.t('Mahnstufe')} ${dun}` : ''}</small>` : ''}`, acts];
  };
  return `${card(v.t('Lieferungen abrechnen'), draft)}${card(v.t('Rechnungen'), table([v.t('Nummer'), v.t('Kunde'), v.t('Brutto'), v.t('Status'), v.t('Aktion')], [...v.s.invoices].reverse().map(row), v.t('Noch keine Belege.')))}<p class="muted small">${v.t('Bitte vor Verwendung von der Steuerberatung prüfen lassen.')}</p>`;
}

function reports(v: V, from: string, to: string): string {
  const r = W.revenue(v.s, from, to);
  const st = W.stockReport(v.s);
  return `${card(v.t('Umsatz'), `<form class="inline" data-client-search="berichte"><label for="rf">${v.t('Von')}</label><input id="rf" name="from" type="date" value="${esc(from)}"><label for="rt">${v.t('Bis')}</label><input id="rt" name="to" type="date" value="${esc(to)}"><button class="btn small ghost">${v.t('Anzeigen')}</button></form>
<dl class="kv"><dt>${v.t('Netto')}</dt><dd>${money(r.netMinor, v.s)}</dd><dt>${v.t('Steuer')}</dt><dd>${money(r.taxMinor, v.s)}</dd><dt>${v.t('Brutto')}</dt><dd>${money(r.grossMinor, v.s)}</dd><dt>${v.t('Rechnungen / Gutschriften')}</dt><dd>${r.invoices} / ${r.credits}</dd></dl>`)}
${card(v.t('Lagerliste'), table([v.t('Artikelnummer'), v.t('Bezeichnung'), v.t('Bestand'), v.t('Reserviert'), v.t('Wert')], st.rows.map((x) => [esc(x.sku), esc(x.name), String(x.onHand), String(x.reserved), money(x.valueMinor, v.s)]), v.t('Noch keine Artikel.')))}
${card(v.t('Offene Posten'), table([v.t('Nummer'), v.t('Kunde'), v.t('Offen'), v.t('Fällig'), v.t('Mahnstufe')], W.openItems(v.s, v.today).map((i) => [esc(i.number), esc(cname(v.s, i.customerId)), money(i.openMinor, v.s), esc(i.dueDate ?? '—'), String(i.dunning)]), v.t('Alles im grünen Bereich.')))}`;
}

function data(v: V): string {
  const issues = W.verifyStore(v.s);
  return `${card(v.t('Sicherung herunterladen'), `<p class="muted">${v.t('Ihre Daten liegen nur in diesem Browser. Sichern Sie regelmäßig.')}</p><button type="button" class="btn" data-client="backup.download">${v.t('Sicherung herunterladen')}</button>`)}
${card(v.t('Sicherung wiederherstellen'), `<p class="muted">${v.t('Ersetzt alle Daten in diesem Browser durch die Sicherung.')}</p><label for="restore">${v.t('Datei')}</label><input id="restore" type="file" accept=".json,application/json"><p><button type="button" class="btn ghost" data-client="backup.restore">${v.t('Sicherung wiederherstellen')}</button></p>`)}
${card(v.t('CSV-Export'), `<div class="inline">${(['articles', 'customers', 'invoices'] as const).map((k) => `<button type="button" class="btn small ghost" data-client="csv.export" data-kind="${k}">${v.t(k === 'articles' ? 'Artikel' : k === 'customers' ? 'Kunden' : 'Rechnungen')}</button>`).join('')}</div>`)}
${v.pro ? card(v.t('CSV-Import'), `<label for="csvkind">${v.t('Daten')}</label><select id="csvkind"><option value="articles">${v.t('Artikel')}</option><option value="customers">${v.t('Kunden')}</option></select><label for="csvfile">${v.t('Datei')}</label><input id="csvfile" type="file" accept=".csv,text/csv"><p><button type="button" class="btn ghost" data-client="csv.import">${v.t('Importieren')}</button></p>`) : ''}
${card(v.t('Integritätsprüfung'), issues.length ? `<ul>${issues.map((x) => `<li class="err">${esc(x)}</li>`).join('')}</ul>` : `<p>${tag(v.t('Alle Daten sind konsistent.'), 'ok')}</p>`)}`;
}

function settings(v: V): string {
  const s = v.s.settings;
  const users = v.s.users.map((u) => [esc(u.name), v.t(u.role === 'OWNER' ? 'Inhaber' : 'Mitarbeiter'), u.id === v.st.session.userId ? tag(v.t('Angemeldet als'), 'ok') : form('session.user', `<button class="btn small ghost">${v.t('Wechseln')}</button>`, { userId: u.id })]);
  return `${v.owner ? card(v.t('Firma'), form('settings.save', `<div class="grid">${field(v.t('Firma'), 'company', 'required', s.company)}${field(v.t('Zahlungsziel (Tage)'), 'paymentTermDays', 'inputmode="numeric"', String(s.paymentTermDays))}</div><p><button class="btn">${v.t('Speichern')}</button></p>`)) : ''}
${card(v.t('Benutzer'), `${table([v.t('Name'), v.t('Rolle'), v.t('Aktion')], users, '')}${v.owner ? form('user.add', `<div class="grid">${field(v.t('Name'), 'name', 'required')}${select(v.t('Rolle'), 'role', [['STAFF', v.t('Mitarbeiter')], ['OWNER', v.t('Inhaber')]])}</div><p><button class="btn ghost">${v.t('Neuer Benutzer')}</button></p>`) : ''}<p class="muted small">${v.t('Rollen sind Ablaufregeln auf diesem Gerät, kein Zugriffsschutz.')}</p>`)}
${card(v.t('Ansicht'), `<div class="inline">${form('session.mode', `<button class="btn small ${v.pro ? 'ghost' : ''}">${v.t('Einsteiger')}</button>`, { mode: 'basic' })}${form('session.mode', `<button class="btn small ${v.pro ? '' : 'ghost'}">${v.t('Profi')}</button>`, { mode: 'pro' })}</div>`)}
${card(v.t('Sprache'), `<div class="inline">${(['de', 'it', 'en'] as const).map((l) => form('session.lang', `<button class="btn small ${v.lang === l ? '' : 'ghost'}" lang="${l}">${l.toUpperCase()}</button>`, { lang: l })).join('')}</div>`)}`;
}

/** Druckansicht eines Angebots oder Belegs (Browser-Druck → PDF). */
export function documentView(st: AppState, id: string): string {
  const s = st.store;
  const t = (x: string): string => tr(st.session.lang, x);
  const inv = s.invoices.find((i) => i.id === id);
  const q = s.quotes.find((x) => x.id === id);
  const doc = inv ?? q;
  if (!doc) return `<p>${esc(t('Noch keine Belege.'))}</p>`;
  const title = t(inv ? (inv.kind === 'INVOICE' ? 'Rechnung' : 'Gutschrift') : 'Angebot');
  const totals = inv ? inv.totals : W.computeTotals(doc.lines);
  const c = s.customers.find((x) => x.id === doc.customerId);
  return `<article class="doc"><header><div><h1>${esc(s.settings.company)}</h1></div><div class="right"><h2>${esc(title)} ${esc(doc.number ?? t('Entwurf'))}</h2><p>${esc((inv?.finalizedAt ?? doc.createdAt).slice(0, 10))}</p></div></header>
<p><strong>${esc(c?.name ?? '')}</strong><br>${esc(c?.address ?? '')}${c?.vatId ? `<br>${esc(t('USt-IdNr.'))} ${esc(c.vatId)}` : ''}</p>
<table><thead><tr><th>${esc(t('Bezeichnung'))}</th><th class="r">${esc(t('Menge'))}</th><th class="r">${esc(t('Einzelpreis'))}</th><th class="r">${esc(t('Steuersatz'))}</th><th class="r">${esc(t('Summe'))}</th></tr></thead><tbody>
${doc.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="r">${l.qty}</td><td class="r">${money(l.priceMinor, s)}</td><td class="r">${(l.taxBps / 100).toFixed(0)} %</td><td class="r">${money(l.qty * l.priceMinor, s)}</td></tr>`).join('')}</tbody></table>
<dl class="kv tot"><dt>${esc(t('Netto'))}</dt><dd>${money(totals.netMinor, s)}</dd>${totals.byRate.map((r) => `<dt>${esc(t('Steuer'))} ${(r.bps / 100).toFixed(0)} %</dt><dd>${money(r.taxMinor, s)}</dd>`).join('')}<dt><strong>${esc(t('Brutto'))}</strong></dt><dd><strong>${money(totals.grossMinor, s)}</strong></dd></dl>
${inv?.dueDate ? `<p>${esc(t('Fällig'))}: ${esc(inv.dueDate)}</p>` : ''}${'validUntil' in doc ? `<p>${esc(t('gültig bis'))} ${esc(doc.validUntil)}</p>` : ''}
<p class="muted small">${esc(t('Bitte vor Verwendung von der Steuerberatung prüfen lassen.'))}</p>
<p class="noprint"><button type="button" class="btn" data-client="print">${esc(t('Drucken'))}</button> <a class="btn ghost" href="#/${inv ? 'rechnungen' : 'angebote'}">←</a></p></article>`;
}

/** Ganze Seite für eine Route. `query` enthält Such-/Filterwerte, `token` schützt Lieferungen vor Doppelklick. */
export function renderApp(st: AppState, route: string, query: Record<string, string>, today: string, token: string, flash?: { kind: string; text: string }): string {
  fieldSeq = 0;
  const lang = st.session.lang;
  const t = (x: string): string => tr(lang, x);
  const u = st.store.users.find((x) => x.id === st.session.userId);
  const v: V = { s: st.store, st, t, lang, pro: st.session.mode === 'pro', owner: u?.role === 'OWNER', today, token };
  const [base = '', arg = ''] = route.replace(/^#?\/?/, '').split('/');
  if (base === 'beleg') return documentView(st, arg);
  const nav: [string, string][] = [['', 'Übersicht'], ['artikel', 'Artikel'], ['kunden', 'Kunden'], ['angebote', 'Angebote'], ['auftraege', 'Aufträge'], ['rechnungen', 'Rechnungen'], ['berichte', 'Berichte'], ['daten', 'Daten'], ['einstellungen', 'Einstellungen']];
  const month = today.slice(0, 7);
  const body = base === 'artikel' ? articles(v, query.q ?? '') : base === 'kunden' ? customers(v) : base === 'angebote' ? quotes(v) : base === 'auftraege' ? orders(v)
    : base === 'rechnungen' ? invoices(v) : base === 'berichte' ? reports(v, query.from ?? `${month}-01`, query.to ?? today) : base === 'daten' ? data(v) : base === 'einstellungen' ? settings(v) : overview(v);
  const current = nav.find(([k]) => k === base)?.[1] ?? 'Übersicht';
  return `<a class="skip" href="#main">${t('Zum Inhalt springen')}</a>
<header class="top"><div class="brand">${st.store.settings.company ? `<span class="logo" aria-hidden="true">${esc(st.store.settings.company.slice(0, 1))}</span>` : ''}<strong>${esc(st.store.settings.company)}</strong></div>
<div class="who">${t('Angemeldet als')}: <strong>${esc(u?.name ?? '?')}</strong> (${t(u?.role === 'OWNER' ? 'Inhaber' : 'Mitarbeiter')}) · ${t(v.pro ? 'Profi' : 'Einsteiger')}</div></header>
<nav class="nav" aria-label="${t('Hauptmenü')}">${nav.map(([k, l]) => `<a href="#/${k}"${k === base ? ' aria-current="page"' : ''}>${t(l)}</a>`).join('')}</nav>
<main id="main" tabindex="-1"><h1>${t(current)}</h1>${flash ? `<div class="flash ${flash.kind === 'error' ? 'err' : 'ok'}" role="${flash.kind === 'error' ? 'alert' : 'status'}">${esc(flash.text)}</div>` : ''}${body}</main>`;
}
