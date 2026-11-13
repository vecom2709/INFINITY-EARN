import { escapeHtml } from '../../packages/shared/src/html.ts';
import { icon } from '../console/src/icons.ts';
import { TOKENS as t } from '../console/src/tokens.ts';

/**
 * Gemeinsames Layout der Kundenseiten (Anfrage, Angebot, Zahlung, Kundenportal) und der Anmeldung –
 * dieselben Design-Tokens wie die Business-Konsole (docs/spec/v15/PREMIUM_UI_DESIGN_SYSTEM.md).
 * CSP-konform: keine Skripte, keine externen Ressourcen. Klassen bleiben rückwärtskompatibel (.card, .tag, .row …).
 */
const CSS = `
:root{--canvas:${t.canvas};--surface:${t.surface};--ink:${t.ink};--ink-soft:${t.inkSoft};--muted:${t.muted};--accent:${t.accent};--accent-strong:${t.accentStrong};--accent-soft:${t.accentSoft};--border:${t.border};--border-strong:${t.borderStrong};--warning:${t.warning};--warning-soft:${t.warningSoft};--danger:${t.danger};--danger-soft:${t.dangerSoft};--neutral-soft:${t.neutralSoft};--focus:${t.focus};--brand:${t.brand};--ocean:${t.ocean};
--shadow:0 12px 28px rgba(14,29,37,.05),0 2px 6px rgba(14,29,37,.025);--font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color-scheme:light}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--canvas);color:var(--ink);font:400 16px/1.6 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none;font-weight:600}a:hover{text-decoration:underline;text-underline-offset:3px}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:6px}
.sr-only{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.skip{position:absolute;left:12px;top:-60px;background:var(--ink);color:#fff;padding:10px 14px;border-radius:10px;z-index:10}.skip:focus{top:12px}
.ico{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}.ico.sm{width:16px;height:16px}
header.site{position:sticky;top:0;z-index:20;background:rgba(247,250,249,.82);-webkit-backdrop-filter:saturate(1.4) blur(14px);backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid rgba(201,220,219,.7)}
.site-in{max-width:1080px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-weight:700}.brand:hover{text-decoration:none}
.mark{width:34px;height:34px;border-radius:10px;background:linear-gradient(150deg,#16323F 0%,var(--ocean) 70%);color:var(--brand);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 6px 14px rgba(14,29,37,.18);display:grid;place-items:center}.mark .ico{width:21px;height:21px;stroke-width:2}
.brandname{font-size:17px;letter-spacing:-.4px}.brandname b{color:var(--accent);font-weight:700}
.site nav{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.site nav a{color:var(--ink-soft);font-weight:600;font-size:15px;padding:10px 12px;border-radius:10px;min-height:44px;display:inline-flex;align-items:center}
.langs{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--border-strong);border-radius:999px;margin:0 4px}.site nav .langs a{min-height:36px;padding:6px 10px;border-radius:999px;font-size:13px;font-weight:650;color:var(--muted)}.site nav .langs a[aria-current=true]{background:var(--ink);color:#fff}
.site nav a:hover{background:#EEF5F4;text-decoration:none}.site nav a[aria-current=page]{background:var(--accent-soft);color:var(--accent-strong)}
.mode{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;font-size:13px;font-weight:650;color:var(--warning);background:var(--warning-soft);border:1px solid #F1DFBE;white-space:nowrap}.mode .dot{width:8px;height:8px;border-radius:50%;background:currentColor}
.banner{max-width:1080px;margin:16px auto 0;padding:12px 16px;border-radius:14px;background:var(--warning-soft);border:1px solid #F1DFBE;color:#5E4206;font-size:14px;display:flex;gap:10px;align-items:flex-start}
.banner strong{color:var(--warning)}
main{max-width:1080px;margin:0 auto;padding:28px 20px 56px}main.wide{max-width:none;padding:0}body:has(main.wide) .banner{margin:12px auto}
h1{font-size:clamp(28px,3.4vw,40px);line-height:1.15;letter-spacing:-1px;font-weight:720;margin:.2em 0 .4em}h2{font-size:20px;letter-spacing:-.3px;margin:1.6em 0 .6em;font-weight:680}h3{font-size:17px;margin:.2em 0 .4em}
.lead{color:var(--muted);font-size:17px;max-width:680px;margin:0 0 22px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:22px 24px;margin:14px 0}
.card h2:first-child,.card h3:first-child{margin-top:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.kpi .v{font-size:24px;font-weight:700;letter-spacing:-.6px;font-variant-numeric:tabular-nums}.kpi .l{color:var(--muted);font-size:14px}
.steps3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;counter-reset:s;list-style:none;padding:0;margin:18px 0}
.steps3 li{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px 18px 16px;box-shadow:var(--shadow)}
.steps3 li::before{counter-increment:s;content:counter(s);display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--accent-soft);color:var(--accent-strong);font-weight:700;margin-bottom:10px}
.steps3 strong{display:block;margin-bottom:4px}.steps3 span{color:var(--muted);font-size:15px}
.progress-steps{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 18px;padding:0}
.progress-steps li{padding:7px 12px;border-radius:999px;background:var(--neutral-soft);color:var(--ink-soft);font-size:13px;font-weight:600}
.progress-steps li.done{background:var(--accent-soft);color:var(--accent-strong)}.progress-steps li.now{background:var(--ink);color:#fff}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:12px 14px;border-bottom:1px solid #E9F0EF;vertical-align:top}
th{color:var(--muted);font-weight:650;font-size:12px;letter-spacing:1px;text-transform:uppercase;background:#F6FAFA}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;overflow-wrap:anywhere}
.tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:600;background:var(--warning-soft);color:var(--warning)}
.tag.ok{background:var(--accent-soft);color:var(--accent-strong)}.tag.bad{background:var(--danger-soft);color:var(--danger)}.tag.neutral{background:var(--neutral-soft);color:var(--ink-soft)}
label{display:block;margin:14px 0 6px;font-weight:600;font-size:15px}
input[type=text],input[type=email],input[type=password],textarea,select{width:100%;min-height:46px;padding:11px 13px;border:1px solid var(--border-strong);border-radius:11px;background:var(--surface);color:var(--ink);font:inherit}
input:focus,textarea:focus,select:focus{border-color:var(--accent)}
textarea{min-height:120px;resize:vertical}fieldset{border:1px solid var(--border);border-radius:14px;padding:12px 16px;margin:16px 0}legend{padding:0 6px}
label:has(input[type=checkbox]),label:has(input[type=radio]){display:flex;gap:10px;align-items:flex-start;font-weight:500;line-height:1.45;min-height:44px;padding:4px 0}
input[type=checkbox],input[type=radio]{width:20px;height:20px;margin:2px 0 0;flex:none;accent-color:var(--accent)}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:11px 18px;border-radius:11px;border:1px solid var(--accent);background:var(--accent);color:#fff;font:inherit;font-weight:650;cursor:pointer;text-decoration:none}
button:hover,.btn:hover{background:var(--accent-strong);text-decoration:none}button.secondary,.btn.secondary{background:var(--surface);color:var(--ink-soft);border-color:var(--border-strong)}button.secondary:hover,.btn.secondary:hover{border-color:#9CC7C5;background:#F8FCFC}
.muted{color:var(--muted)}.err{color:var(--danger)}.card.err{border-color:#F0D2D2;background:var(--danger-soft);color:#5B2121}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.table-wrap{overflow-x:auto}
.price{font-size:34px;font-weight:720;letter-spacing:-1px;font-variant-numeric:tabular-nums}
.docs{display:flex;flex-wrap:wrap;gap:8px}.docs a{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:8px 12px;border:1px solid var(--border-strong);border-radius:10px;color:var(--ink-soft);background:var(--surface)}
.docs a:hover{border-color:#9CC7C5;text-decoration:none}
footer.site{border-top:1px solid var(--border);color:var(--muted);font-size:14px}footer.site div{max-width:1080px;margin:0 auto;padding:20px}
@media (max-width:720px){header.site{position:static}main{padding:20px 16px 44px}main.wide{padding:0}.card{padding:18px 16px}.steps3{grid-template-columns:1fr}.site-in{padding:12px 16px}.banner{margin:12px 16px 0}
table.cards thead{display:none}table.cards,table.cards tbody,table.cards tr,table.cards td{display:block}table.cards tr{border:1px solid var(--border);border-radius:14px;padding:12px 14px;margin:0 0 10px}
table.cards td{border:0;padding:6px 0}table.cards td::before{content:attr(data-label);display:block;font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);font-weight:600}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

export interface PageOptions {
  testMode: boolean;
  active?: 'start' | 'anfrage' | 'portal';
  /** Vollbreite ohne Inhaltsrahmen (Startseite mit Storyscrolling). */
  wide?: boolean;
  /** Zusätzliche, seiteneigene Stile (bleiben CSP-konform inline). */
  extraCss?: string;
  description?: string;
  canonical?: string;
  /** Sprache der Seite (Standard: de) und übersetzte Rahmen-Texte. */
  lang?: 'de' | 'it' | 'en';
  ui?: { nav: { start: string; inquiry: string; portal: string; test: string }; banner: string; footer: string; trust: string; verify: string; admin: string; skip: string; home: string };
  /** hreflang-Alternativen (Pfad je Sprache). */
  alternates?: { lang: string; href: string }[];
  langSwitch?: { lang: string; href: string; label: string; current: boolean }[];
  /** Dunkler Kopfbereich (Startseite nach Design-Vorlage): Kopfzeile liegt auf dem dunklen Hero. */
  theme?: 'dark';
  /** Eigene Hauptnavigation (sonst Start/Anfrage/Portal). */
  navItems?: { href: string; label: string; current?: boolean }[];
  /** Unterzeile neben dem Markennamen im dunklen Kopf. */
  tagline?: string;
}

const DARK_CSS = `
.darkzone{position:relative;z-index:6;background:#03161B;color:#E8F4F2}
.darkzone header.site.dark{position:absolute;left:0;right:0;top:100%}
.darkzone .banner{margin:0 auto;max-width:none;border-radius:0;border:0;border-bottom:1px solid rgba(246,223,168,.18);background:#1A1708;color:#F6DFA8;justify-content:center;padding:9px 16px;font-size:13.5px}
.darkzone .banner strong{color:#FFD27A}
header.site.dark{position:relative;background:transparent;border:0;-webkit-backdrop-filter:none;backdrop-filter:none;z-index:5}
header.site.dark .site-in{max-width:1320px;padding:22px 32px 6px;flex-wrap:nowrap}
.brand.xl{gap:18px;color:#fff}.brand.xl .inf{width:118px;height:58px;display:block;flex:none;filter:drop-shadow(0 0 14px rgba(25,211,197,.55))}
.brand.xl .bn{display:flex;flex-direction:column;line-height:1.08;padding-left:18px;border-left:1.5px solid rgba(255,255,255,.55)}
.brand.xl .bn b{font-size:34px;letter-spacing:-.6px;font-weight:700;color:#fff}.brand.xl .bn b i{font-style:normal;color:#22D8C8}
.brand.xl .bn small{font-size:19px;font-weight:500;color:#E8F4F2;margin-top:4px}
header.site.dark nav{gap:6px;flex-wrap:nowrap}
header.site.dark nav a{color:#F2FAF9;font-size:17.5px;font-weight:500;padding:10px 14px;border-radius:0;position:relative;background:none}
header.site.dark nav a:hover{background:none;color:#22D8C8}
header.site.dark nav a[aria-current=page]{background:none;color:#22D8C8;font-weight:650}
header.site.dark nav a[aria-current=page]::after{content:"";position:absolute;left:12px;right:12px;bottom:0;height:3px;border-radius:3px;background:#22D8C8;box-shadow:0 0 12px rgba(34,216,200,.8)}
header.site.dark .langs{border-color:rgba(255,255,255,.28);margin-left:10px}header.site.dark nav .langs a{color:#BFD9D6;padding:6px 9px;font-size:12.5px}header.site.dark nav .langs a::after{display:none}
header.site.dark nav .langs a[aria-current=true]{background:#22D8C8;color:#03161B}
header.site.dark .mode{background:rgba(255,210,122,.12);border-color:rgba(255,210,122,.35);color:#FFD27A;margin-left:6px}
@media (max-width:1180px){header.site.dark .site-in{flex-wrap:wrap;padding:18px 20px 4px}header.site.dark nav{width:100%;overflow-x:auto;scrollbar-width:none;padding-bottom:4px}header.site.dark nav::-webkit-scrollbar{display:none}header.site.dark nav a{white-space:nowrap}}
@media (max-width:620px){.brand.xl .inf{width:72px;height:36px}.brand.xl{gap:12px}.brand.xl .bn{padding-left:12px}.brand.xl .bn b{font-size:24px}.brand.xl .bn small{font-size:14px}header.site.dark nav a{font-size:16px;padding:10px 10px}}
`;

/** Unendlich-Zeichen der Marke in Türkis mit Verlauf (dunkler Kopf). */
const INFINITY_MARK = `<svg class="inf" viewBox="0 0 120 60" aria-hidden="true" focusable="false"><defs><linearGradient id="infg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#0FB5A6"/><stop offset=".5" stop-color="#3FF0DC"/><stop offset="1" stop-color="#14C4B4"/></linearGradient></defs><path d="M30 12c-10 0-18 8-18 18s8 18 18 18c16 0 30-36 46-36 10 0 18 8 18 18s-8 18-18 18c-16 0-30-36-46-36Z" transform="translate(7 0)" fill="none" stroke="url(#infg)" stroke-width="7" stroke-linecap="round"/></svg>`;

const UI_DE: NonNullable<PageOptions['ui']> = {
  nav: { start: 'Start', inquiry: 'Anfrage stellen', portal: 'Kundenportal', test: 'Testbetrieb' },
  banner: '<strong>TESTMODUS – Testbetrieb:</strong> keine Live-Verkäufe, keine echten Zahlungen, keine gültigen Rechnungen.',
  footer: 'Geprüfte digitale Kalkulationen für Unternehmen · Zahlungen nur über einen geprüften Zahlungsanbieter',
  trust: 'Vertrauen &amp; Fakten', verify: 'Echtheit prüfen', admin: 'Admin', skip: 'Zum Inhalt springen', home: '/',
};

export function page(title: string, body: string, opts: PageOptions = { testMode: true }): string {
  const ui = opts.ui ?? UI_DE;
  const nav = [['start', ui.home, ui.nav.start], ['anfrage', '/anfrage', ui.nav.inquiry], ['portal', '/portal', ui.nav.portal]] as const;
  const banner = opts.testMode ? `<div class="banner" role="status">${icon('info', 'sm')}<span>${ui.banner}</span></div>` : '';
  const alt = (opts.alternates ?? []).map((a) => `<link rel="alternate" hreflang="${escapeHtml(a.lang)}" href="${escapeHtml(a.href)}">`).join('');
  const sw = opts.langSwitch?.length
    ? `<span class="langs" role="group" aria-label="Sprache / Lingua / Language">${opts.langSwitch.map((l) => `<a href="${escapeHtml(l.href)}" hreflang="${escapeHtml(l.lang)}" lang="${escapeHtml(l.lang)}"${l.current ? ' aria-current="true"' : ''}>${escapeHtml(l.label)}</a>`).join('')}</span>`
    : '';
  const dark = opts.theme === 'dark';
  const navHtml = opts.navItems
    ? opts.navItems.map((n) => `<a href="${escapeHtml(n.href)}"${n.current ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')
    : nav.map(([k, href, label]) => `<a href="${href}"${opts.active === k ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const brand = dark
    ? `<a class="brand xl" href="${ui.home}" aria-label="Infinity Earn – ${ui.nav.start}">${INFINITY_MARK}<span class="bn"><b>Infinity <i>Earn</i></b>${opts.tagline ? `<small>${opts.tagline}</small>` : ''}</span></a>`
    : `<a class="brand" href="${ui.home}"><span class="mark">${icon('infinity')}</span><span class="brandname">infinity<b>earn</b></span></a>`;
  const header = `<header class="site${dark ? ' dark' : ''}"><div class="site-in">${brand}
<nav aria-label="Hauptnavigation">${navHtml}${sw}${opts.testMode ? `<span class="mode"><span class="dot" aria-hidden="true"></span>${ui.nav.test}</span>` : ''}</nav></div></header>`;
  return `<!doctype html><html lang="${opts.lang ?? 'de'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="${dark ? '#03161B' : '#F7FAF9'}"><title>${escapeHtml(title)}</title>${opts.description ? `<meta name="description" content="${escapeHtml(opts.description)}">` : ''}${opts.canonical ? `<link rel="canonical" href="${escapeHtml(opts.canonical)}">` : ''}${alt}<style>${CSS}${dark ? DARK_CSS : ''}${opts.extraCss ?? ''}</style></head><body><a class="skip" href="#inhalt">${ui.skip}</a>
${dark ? `<div class="darkzone">${banner}${header}</div>` : `${header}\n${banner}`}<main id="inhalt"${opts.wide ? ' class="wide"' : ''}>${body}</main>
<footer class="site"><div>INFINITY EARN · ${ui.footer} ${opts.navItems ? `· <a href="/portal">${ui.nav.portal}</a> ` : ''}· <a href="/vertrauen">${ui.trust}</a> · <a href="/pruefen">${ui.verify}</a> · <a href="/admin">${ui.admin}</a></div></footer></body></html>`;
}

export const e = escapeHtml;
