import { escapeHtml as e } from '../../../packages/shared/src/html.ts';
import { icon, type IconName } from './icons.ts';
import { CSS } from './tokens.ts';

/**
 * Wiederverwendbare Bausteine der Business-Konsole. Reines HTML/CSS, keine Skripte.
 * Jeder Status trägt Text (nie nur Farbe), jede Aktion sagt, was passiert und ob Kosten/Nachrichten entstehen.
 */
export { e };

export type Area = 'uebersicht' | 'kunden' | 'auftraege' | 'produkte' | 'finanzen' | 'berichte' | 'wachstum';
export type ViewMode = 'live' | 'test';
export type Tone = 'ok' | 'pending' | 'bad' | 'neutral';

export const NAV: { area: Area; label: string; href: string; icon: IconName }[] = [
  { area: 'uebersicht', label: 'Übersicht', href: '/dashboard', icon: 'grid' },
  { area: 'kunden', label: 'Kunden', href: '/dashboard/kunden', icon: 'users' },
  { area: 'auftraege', label: 'Aufträge', href: '/dashboard/auftraege', icon: 'folder' },
  { area: 'produkte', label: 'Produkte', href: '/dashboard/produkte', icon: 'package' },
  { area: 'finanzen', label: 'Finanzen', href: '/dashboard/finanzen', icon: 'wallet' },
  { area: 'berichte', label: 'Berichte', href: '/dashboard/berichte', icon: 'chart' },
];

export function withMode(href: string, mode: ViewMode): string {
  if (mode === 'live') return href;
  return `${href}${href.includes('?') ? '&' : '?'}modus=test`;
}

export interface ShellOpts {
  title: string;
  eyebrow: string;
  heading: string;
  lead?: string;
  active: Area | 'einstellungen' | 'aktivitaeten' | 'experte' | null;
  mode: ViewMode;
  csrf: string;
  path: string;
  flash?: string;
  heroAside?: string;
  body: string;
  /** Echter Systemmodus: solange true, ist der Echtbetrieb gesperrt. */
  systemTestMode: boolean;
}

function modeBadge(o: ShellOpts): string {
  // Systemmodus immer sichtbar: Solange nur Testbetrieb möglich ist, steht das oben – auch beim Blick auf Echtdaten.
  if (o.systemTestMode) return `<span class="mode test" role="status"><span class="dot" aria-hidden="true"></span>Testbetrieb<span class="sr-only"> – Echtbetrieb gesperrt, kein echtes Geld</span></span>`;
  return `<span class="mode live" role="status"><span class="dot" aria-hidden="true"></span>Echtbetrieb</span>`;
}

function profileMenu(o: ShellOpts): string {
  return `<details class="profile"><summary aria-label="Profil und Einstellungen öffnen">IE</summary><div class="menu">
<a href="${withMode('/dashboard/einstellungen', o.mode)}"${o.active === 'einstellungen' ? ' aria-current="page"' : ''}>${icon('settings', 'sm')}Einstellungen &amp; Freigaben</a>
<a href="${withMode('/dashboard/aktivitaeten', o.mode)}"${o.active === 'aktivitaeten' ? ' aria-current="page"' : ''}>${icon('list', 'sm')}Aktivitäten (Protokoll)</a>
<a href="/dashboard/experte">${icon('doc', 'sm')}Detailansicht für Fachleute</a>
<hr><form method="post" action="/auth/logout"><input type="hidden" name="_csrf" value="${e(o.csrf)}"><button type="submit">${icon('logout', 'sm')}Abmelden</button></form>
</div></details>`;
}

function brand(): string {
  return `<a class="brand" href="/dashboard" aria-label="INFINITY EARN – zur Übersicht"><span class="mark">${icon('infinity')}</span><span class="brandname">infinity<b>earn</b><small>Business Console</small></span></a>`;
}

export function shell(o: ShellOpts): string {
  const nav = NAV.map((n) => `<a href="${withMode(n.href, o.mode)}"${o.active === n.area ? ' aria-current="page"' : ''}>${icon(n.icon)}${n.label}</a>`).join('');
  const tabs = NAV.slice(0, 4).map((n) => `<a href="${withMode(n.href, o.mode)}"${o.active === n.area ? ' aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a>`).join('');
  const more = `<details><summary aria-label="Weitere Bereiche">${icon('more')}<span>Mehr</span></summary><div class="menu">
${NAV.slice(4).map((n) => `<a href="${withMode(n.href, o.mode)}"${o.active === n.area ? ' aria-current="page"' : ''}>${icon(n.icon, 'sm')}${n.label}</a>`).join('')}
<hr><a href="${withMode('/dashboard/einstellungen', o.mode)}">${icon('settings', 'sm')}Einstellungen</a><a href="${withMode('/dashboard/aktivitaeten', o.mode)}">${icon('list', 'sm')}Aktivitäten</a></div></details>`;
  const testNotice = o.mode === 'test'
    ? `<div class="notice test" role="note">${icon('info', 'sm')}<span><strong>Testdaten:</strong> Du siehst Vorgänge aus dem Testbetrieb (Stripe-Sandbox bzw. Testzahlung). Kein echtes Geld, keine echten Kunden, keine gültigen Rechnungen.</span></div>`
    : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#F7FAF9"><meta name="robots" content="noindex"><title>${e(o.title)} · INFINITY EARN</title><style>${CSS}</style></head>
<body><a class="skip" href="#inhalt">Zum Inhalt springen</a><div class="app">
<aside class="sidebar" aria-label="Seitenleiste">${brand()}
<nav class="nav" aria-label="Hauptnavigation"><span class="nav-label">Dein Unternehmen</span>${nav}</nav>
<div class="sidefoot">${icon('lock')}<span>Deine Daten. Deine Kontrolle.<br>Zusatzkosten: 0 € freigegeben.</span></div></aside>
<main id="inhalt"><header class="topbar">${brand()}<span class="eyebrow">${e(o.eyebrow)}</span><div class="topright">${modeBadge(o)}${profileMenu(o)}</div></header>
<section class="hero"><div><h1>${e(o.heading)}</h1>${o.lead ? `<p class="lead">${e(o.lead)}</p>` : ''}</div>${o.heroAside ?? ''}</section>
${o.flash ? `<div class="notice flash" role="status">${icon('checkCircle', 'sm')}<span>${e(o.flash)}</span></div>` : ''}${testNotice}
${o.body}
<p class="foot">INFINITY EARN 15.0 · Alle Beträge stammen aus provider-bestätigten Buchungen. Bankeingänge zählen erst nach unabhängiger Bankbestätigung.</p>
</main></div><nav class="tabbar" aria-label="Hauptnavigation (mobil)">${tabs}${more}</nav></body></html>`;
}

export function modeSwitch(path: string, mode: ViewMode): string {
  return `<nav class="segmented" aria-label="Datenansicht wählen"><a href="${e(path)}"${mode === 'live' ? ' aria-current="true"' : ''}>Echte Daten</a><a href="${e(withMode(path, 'test'))}"${mode === 'test' ? ' aria-current="true"' : ''}>Testdaten</a></nav>`;
}

export function metric(o: { label: string; value: string; sub: string; icon: IconName; accent?: boolean; text?: boolean; id?: string }): string {
  return `<article class="metric"${o.id ? ` data-metric="${e(o.id)}"` : ''}><div class="metric-head"><h2 class="metric-label">${e(o.label)}</h2><span class="metric-icon">${icon(o.icon, 'sm')}</span></div>
<div class="metric-value${o.accent ? ' accent' : ''}${o.text ? ' text' : ''}">${e(o.value)}</div><div class="metric-sub">${e(o.sub)}</div></article>`;
}

export function panel(o: { title: string; sub?: string; action?: { href: string; label: string }; body: string; flush?: boolean; id?: string }): string {
  return `<section class="panel"${o.id ? ` id="${e(o.id)}"` : ''} aria-labelledby="${e(o.id ?? slug(o.title))}-h"><div class="panel-head"><div><h2 id="${e(o.id ?? slug(o.title))}-h">${e(o.title)}</h2>${o.sub ? `<p>${e(o.sub)}</p>` : ''}</div>
${o.action ? `<a class="linkbtn" href="${e(o.action.href)}">${e(o.action.label)} ${icon('arrow', 'sm')}</a>` : ''}</div><div class="panel-body${o.flush ? ' flush' : ''}">${o.body}</div></section>`;
}

export function tag(text: string, tone: Tone = 'neutral'): string {
  return `<span class="tag${tone === 'neutral' ? '' : ` ${tone}`}"><span class="dot" aria-hidden="true"></span>${e(text)}</span>`;
}

export function empty(title: string, text: string, ico: IconName = 'inbox'): string {
  return `<div class="empty"><span class="badge">${icon(ico)}</span><div><h3>${e(title)}</h3><p>${e(text)}</p></div></div>`;
}

export function explain(text: string, summary = 'Was bedeutet das?'): string {
  return `<details class="explain"><summary>${icon('info', 'sm')}${e(summary)}</summary><p>${e(text)}</p></details>`;
}

export interface Column {
  label: string;
  amount?: boolean;
  full?: boolean;
}

/** Tabelle, die unter 900 px zu Karten wird (data-label). Zellen sind bereits escapetes HTML. */
export function table(cols: Column[], rows: string[][], emptyText: string, caption?: string): string {
  const head = `<thead><tr>${cols.map((c) => `<th scope="col"${c.amount ? ' class="amount"' : ''}>${e(c.label)}</th>`).join('')}</tr></thead>`;
  const body = rows.length
    ? rows.map((r) => `<tr>${r.map((cell, i) => { const c = cols[i] ?? { label: '' }; const cls = [c.amount ? 'amount' : '', c.full ? 'full' : ''].filter(Boolean).join(' '); return `<td data-label="${e(c.label)}"${cls ? ` class="${cls}"` : ''}>${cell}</td>`; }).join('')}</tr>`).join('')
    : `<tr class="empty-row"><td colspan="${cols.length}">${empty(emptyText, 'Sobald echte Vorgänge stattfinden, erscheinen sie hier automatisch.')}</td></tr>`;
  return `<div class="table-wrap"><table>${caption ? `<caption class="sr-only">${e(caption)}</caption>` : ''}${head}<tbody>${body}</tbody></table></div>`;
}

/** Owner-Aktion mit CSRF. `what` erklärt in einem Satz die Folge inkl. Kosten/Kundennachricht. */
export function action(o: { href: string; csrf: string; label: string; what: string; hidden?: Record<string, string>; variant?: 'primary' | 'ghost' | 'danger'; back?: string }): string {
  const hidden = Object.entries({ ...(o.hidden ?? {}), ...(o.back ? { _back: o.back } : {}) }).map(([k, v]) => `<input type="hidden" name="${e(k)}" value="${e(v)}">`).join('');
  return `<form class="action" method="post" action="${e(o.href)}"><input type="hidden" name="_csrf" value="${e(o.csrf)}">${hidden}
<button class="btn${o.variant && o.variant !== 'primary' ? ` ${o.variant}` : ''}" type="submit">${e(o.label)}</button><span class="what">${e(o.what)}</span></form>`;
}

export function steps(list: { label: string; state: 'done' | 'now' | 'todo' | 'wait' }[]): string {
  return `<ol class="steps" aria-label="Fortschritt">${list.map((s) => `<li class="${s.state === 'todo' ? '' : s.state}"${s.state === 'now' ? ' aria-current="step"' : ''}>${s.state === 'done' ? icon('check', 'sm') : ''}${e(s.label)}<span class="sr-only">${s.state === 'done' ? ' (erledigt)' : s.state === 'now' ? ' (aktuell)' : s.state === 'wait' ? ' (wartet auf Bestätigung)' : ' (offen)'}</span></li>`).join('')}</ol>`;
}

export function kv(rows: [string, string][]): string {
  return `<dl class="kv">${rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

export function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}
