/**
 * INFINITY EARN 15.0 – Design-Tokens und Basis-Stile (verbindlich: docs/spec/v15/PREMIUM_UI_DESIGN_SYSTEM.md).
 * Ruhig, hell, editorial. Keine externen Fonts/CDNs, keine Skripte (CSP: default-src 'none').
 * Textfarben sind auf WCAG 2.2 AA geprüft (tests/unit/console-ui.test.ts → Kontrasttest).
 */
export const TOKENS = {
  /** LUXURY TURQUOISE (Eigentümer-Vorgabe 2026-11-13). Ivory White */
  canvas: '#F7FAF9',
  surface: '#FFFFFF',
  surfaceSoft: '#FBFDFD',
  /** Dark Ocean */
  ink: '#0E1D25',
  inkSoft: '#24363F',
  muted: '#53656E',
  /** Tiefes Petrol – Text, Links, Schaltflächen (weiße Schrift 4,8:1) */
  accent: '#087F82',
  accentStrong: '#06676A',
  /** Soft Mist */
  accentSoft: '#DCEBEA',
  border: '#E1ECEB',
  borderStrong: '#C9DCDB',
  warning: '#8A5400',
  warningSoft: '#FFF5E3',
  danger: '#A63A3A',
  dangerSoft: '#FBECEC',
  neutralSoft: '#EAF2F1',
  focus: '#0A8F8D',
  /** Elegantes Türkis – nur als Markenlicht (Logo, Linien, Glanz), NICHT für Text: auf Hell nur ~2:1 Kontrast */
  brand: '#18C8C1',
  ocean: '#0E1D25',
} as const;

/** Text/Hintergrund-Paare, die die Oberfläche tatsächlich verwendet (für den Kontrasttest). */
export const TEXT_PAIRS: { name: string; fg: string; bg: string; large?: boolean }[] = [
  { name: 'Primärtext auf Seite', fg: TOKENS.ink, bg: TOKENS.canvas },
  { name: 'Primärtext auf Karte', fg: TOKENS.ink, bg: TOKENS.surface },
  { name: 'Sekundärtext auf Seite', fg: TOKENS.muted, bg: TOKENS.canvas },
  { name: 'Sekundärtext auf Karte', fg: TOKENS.muted, bg: TOKENS.surface },
  { name: 'Sekundärtext auf Seitenleiste', fg: TOKENS.muted, bg: TOKENS.surfaceSoft },
  { name: 'Aktion (Link) auf Karte', fg: TOKENS.accent, bg: TOKENS.surface },
  { name: 'Aktive Navigation', fg: TOKENS.accentStrong, bg: TOKENS.accentSoft },
  { name: 'Status Erfolg', fg: TOKENS.accentStrong, bg: TOKENS.accentSoft },
  { name: 'Status Hinweis', fg: TOKENS.warning, bg: TOKENS.warningSoft },
  { name: 'Status Fehler', fg: TOKENS.danger, bg: TOKENS.dangerSoft },
  { name: 'Status neutral', fg: TOKENS.inkSoft, bg: TOKENS.neutralSoft },
  { name: 'Button-Text auf Akzent', fg: '#FFFFFF', bg: TOKENS.accent },
  { name: 'Testbetrieb-Kennzeichnung', fg: TOKENS.warning, bg: TOKENS.warningSoft },
  // Startseite (Dark-Ocean-Kapitel)
  { name: 'Hero-Überschrift auf Dark Ocean', fg: TOKENS.canvas, bg: TOKENS.ocean },
  { name: 'Hero-Fließtext auf Dark Ocean', fg: '#B9CFCE', bg: TOKENS.ocean },
  { name: 'Hero-Kicker auf Dark Ocean', fg: '#9FDCD8', bg: TOKENS.ocean },
  { name: 'Türkis-Akzent auf Dark Ocean', fg: TOKENS.brand, bg: TOKENS.ocean },
  { name: 'Hero-Schaltfläche (Dark Ocean auf Türkis)', fg: TOKENS.ocean, bg: TOKENS.brand },
  { name: 'Kapitelnummer (Petrol auf Ivory)', fg: TOKENS.accent, bg: TOKENS.canvas, large: true },
];

const t = TOKENS;

export const CSS = `
:root{--canvas:${t.canvas};--surface:${t.surface};--surface-soft:${t.surfaceSoft};--ink:${t.ink};--ink-soft:${t.inkSoft};--muted:${t.muted};--accent:${t.accent};--accent-strong:${t.accentStrong};--accent-soft:${t.accentSoft};--border:${t.border};--border-strong:${t.borderStrong};--warning:${t.warning};--warning-soft:${t.warningSoft};--danger:${t.danger};--danger-soft:${t.dangerSoft};--neutral-soft:${t.neutralSoft};--focus:${t.focus};--brand:${t.brand};--ocean:${t.ocean};
--r-card:18px;--r-control:11px;--r-pill:999px;--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;
--shadow-1:0 1px 2px rgba(14,29,37,.04);--shadow-2:0 12px 28px rgba(14,29,37,.05),0 2px 6px rgba(14,29,37,.025);
--font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color-scheme:light}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--canvas);color:var(--ink);font:400 15px/1.55 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:3px}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:6px}
.sr-only{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.skip{position:absolute;left:12px;top:-60px;background:var(--ink);color:#fff;padding:10px 14px;border-radius:var(--r-control);z-index:10}.skip:focus{top:12px}
.ico{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}.ico.sm{width:16px;height:16px}
.num,.amount,td.amount,.tabular{font-variant-numeric:tabular-nums}
/* Shell */
.app{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh;max-width:1680px;margin:0 auto}
.sidebar{position:sticky;top:0;height:100vh;padding:32px 18px 22px;border-right:1px solid var(--border);background:var(--surface-soft);display:flex;flex-direction:column;gap:28px}
.brand{display:flex;align-items:center;gap:12px;padding:0 10px;color:var(--ink)}.brand:hover{text-decoration:none}
.mark{width:36px;height:36px;border-radius:11px;background:var(--ink);color:#fff;display:grid;place-items:center}.mark .ico{width:22px;height:22px;stroke-width:2}
.brandname{font-size:18px;font-weight:700;letter-spacing:-.5px;line-height:1.1}.brandname b{color:var(--accent);font-weight:700}.brandname small{display:block;margin-top:4px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted);font-weight:600}
.nav{display:flex;flex-direction:column;gap:4px}.nav-label{font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);font-weight:600;margin:0 12px 8px}
.nav a{display:flex;align-items:center;gap:12px;min-height:44px;padding:10px 12px;border-radius:var(--r-control);color:var(--ink-soft);font-weight:550}
.nav a:hover{background:#EEF5F4;text-decoration:none}.nav a[aria-current=page]{background:var(--accent-soft);color:var(--accent-strong);font-weight:650}
.sidefoot{margin-top:auto;padding:16px 12px 0;border-top:1px solid var(--border);display:flex;gap:10px;color:var(--muted);font-size:13px}.sidefoot .ico{color:var(--accent);width:18px;height:18px;margin-top:2px}
main{min-width:0;padding:28px clamp(18px,4vw,56px) 64px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:32px}
.eyebrow{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:650;color:var(--muted)}
.topright{display:flex;align-items:center;gap:10px}
.mode{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:var(--r-pill);font-size:13px;font-weight:650;white-space:nowrap;border:1px solid}
.mode .dot{width:8px;height:8px;border-radius:50%;background:currentColor}
.mode.test{color:var(--warning);background:var(--warning-soft);border-color:#F1DFBE}.mode.live{color:var(--accent-strong);background:var(--accent-soft);border-color:#BFDCDA}
.profile{position:relative}.profile summary{list-style:none;cursor:pointer;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#DCEBEA;color:var(--accent-strong);font-weight:700;font-size:14px}.profile summary::-webkit-details-marker{display:none}
.menu{position:absolute;right:0;top:52px;z-index:5;min-width:240px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-2);padding:8px}
.menu a,.menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:10px 12px;border-radius:10px;color:var(--ink-soft);font:inherit;font-weight:550;background:none;border:0;text-align:left;cursor:pointer}
.menu a:hover,.menu button:hover{background:#EFF5F5;text-decoration:none}.menu hr{border:0;border-top:1px solid var(--border);margin:6px 4px}
/* Seitenkopf */
.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:24px}
.hero h1{margin:8px 0 8px;font-size:clamp(28px,3.1vw,40px);line-height:1.12;letter-spacing:-1.2px;font-weight:720}
.lead{margin:0;max-width:680px;color:var(--muted);font-size:16px}
.notice{display:flex;gap:12px;align-items:flex-start;padding:12px 16px;border-radius:14px;border:1px solid;margin-bottom:22px;font-size:14px}
.notice .ico{margin-top:1px}.notice.test{background:var(--warning-soft);border-color:#F1DFBE;color:#5E4206}.notice.test strong{color:var(--warning)}
.notice.info{background:#EDF6F5;border-color:#D3E6E4;color:#1E4A4C}.notice.info strong{color:var(--accent-strong)}
.notice.flash{background:var(--surface);border-color:var(--border);color:var(--ink-soft)}
.notice.danger{background:var(--danger-soft);border-color:#F0D2D2;color:#5B2121}
.segmented{display:inline-flex;padding:4px;border-radius:12px;background:var(--neutral-soft);gap:4px}
.segmented a{min-height:40px;display:inline-flex;align-items:center;padding:8px 14px;border-radius:9px;color:var(--ink-soft);font-weight:600;font-size:14px}
.segmented a[aria-current=true]{background:var(--surface);color:var(--ink);box-shadow:var(--shadow-1)}.segmented a:hover{text-decoration:none}
/* Kennzahlen */
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:24px}
.metrics.five{grid-template-columns:repeat(5,minmax(0,1fr))}
.metric{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);box-shadow:var(--shadow-2);padding:20px 20px 18px;min-width:0;display:flex;flex-direction:column}
.metric-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.metric-label{font-size:14px;font-weight:600;color:var(--ink-soft)}
.metric-icon{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:#EAF4F3;color:var(--accent)}
.metric-value{margin-top:14px;font-size:clamp(24px,2.3vw,32px);font-weight:720;letter-spacing:-1px;line-height:1.1;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.metric-value.accent{color:var(--accent-strong)}.metric-value.text{font-size:17px;letter-spacing:-.2px;font-weight:650;line-height:1.35;color:var(--ink-soft)}
.metric-sub{margin-top:auto;padding-top:12px;font-size:13px;color:var(--muted)}
/* Panels */
.grid2{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,1fr);gap:20px;margin-bottom:20px}.grid2.even{grid-template-columns:repeat(2,minmax(0,1fr))}
.stack{display:flex;flex-direction:column;gap:20px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card);box-shadow:var(--shadow-2);min-width:0;margin-bottom:20px}.grid2 .panel,.stack .panel{margin-bottom:0}
.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:22px 24px 8px}.panel-head h2{margin:0;font-size:18px;letter-spacing:-.3px;font-weight:680}
.panel-head p{margin:4px 0 0;font-size:14px;color:var(--muted)}.panel-body{padding:8px 24px 22px}.panel-body.flush{padding:4px 0 6px}
.linkbtn{display:inline-flex;align-items:center;gap:6px;min-height:44px;font-weight:650;font-size:14px;white-space:nowrap}
/* Liste / Aktivität */
.feed{list-style:none;margin:0;padding:0}.feed li{display:flex;gap:12px;padding:14px 0;align-items:flex-start}.feed li+li{border-top:1px solid #E9F0EF}
.badge{width:34px;height:34px;flex:none;border-radius:11px;display:grid;place-items:center;background:#E6F2F1;color:var(--accent)}.badge.warn{background:var(--warning-soft);color:var(--warning)}.badge.bad{background:var(--danger-soft);color:var(--danger)}
.feed h3{margin:0;font-size:15px;font-weight:650}.feed p{margin:3px 0 0;font-size:14px;color:var(--muted)}.feed .when{margin-left:auto;font-size:13px;color:var(--muted);white-space:nowrap;padding-top:2px}
/* Tabellen → Karten auf Mobil */
.table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left}
th{padding:12px 24px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);font-weight:650;background:#F6FAFA;white-space:nowrap}
td{padding:15px 24px;border-top:1px solid #E9F0EF;font-size:14px;color:var(--ink-soft);vertical-align:top}td strong{color:var(--ink);font-weight:650}
th.amount,td.amount{text-align:right;white-space:nowrap}td.amount{font-weight:650;color:var(--ink)}td .sub{display:block;font-size:13px;color:var(--muted);margin-top:2px}
.tag{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border-radius:var(--r-pill);font-size:13px;font-weight:600;white-space:nowrap;background:var(--neutral-soft);color:var(--ink-soft)}
.tag .dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}.tag.ok{background:var(--accent-soft);color:var(--accent-strong)}.tag.pending{background:var(--warning-soft);color:var(--warning)}.tag.bad{background:var(--danger-soft);color:var(--danger)}
/* Leerer Zustand */
.empty{display:flex;gap:16px;align-items:flex-start;padding:22px 24px}.empty .badge{width:44px;height:44px}.empty h3{margin:2px 0 4px;font-size:16px}.empty p{margin:0;color:var(--muted);max-width:620px}
/* Erklärung */
details.explain{margin-top:10px}details.explain summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:14px;min-height:32px;display:inline-flex;align-items:center;gap:6px}
details.explain p{margin:6px 0 0;color:var(--muted);font-size:14px;max-width:680px}
/* Fortschritt */
.steps{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0}.steps li{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:var(--r-pill);background:var(--neutral-soft);color:var(--ink-soft);font-size:13px;font-weight:600}
.steps li.done{background:var(--accent-soft);color:var(--accent-strong)}.steps li.now{background:var(--ink);color:#fff}.steps li.wait{background:var(--warning-soft);color:var(--warning)}
/* Formulare und Aktionen */
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 16px;border-radius:var(--r-control);font:inherit;font-weight:650;font-size:14px;cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#fff;text-decoration:none}
.btn:hover{background:var(--accent-strong);text-decoration:none}.btn.ghost{background:var(--surface);color:var(--ink-soft);border-color:var(--border-strong)}.btn.ghost:hover{border-color:#9CC7C5;background:#F8FCFC}
.btn.danger{background:var(--surface);color:var(--danger);border-color:#E7C4C4}.btn.danger:hover{background:var(--danger-soft)}
.action{display:flex;flex-direction:column;gap:6px}.action .what{font-size:13px;color:var(--muted);max-width:520px}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 6px}
input[type=text],input[type=password],input[type=email],select,textarea{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--border-strong);border-radius:var(--r-control);background:var(--surface);color:var(--ink);font:inherit}
.inline-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto;gap:8px;align-items:center}
.kv{display:grid;grid-template-columns:minmax(140px,240px) minmax(0,1fr);gap:0}.kv dt,.kv dd{margin:0;padding:12px 0;border-top:1px solid #E9F0EF;font-size:14px}.kv dt{color:var(--muted);font-weight:600}.kv dd{color:var(--ink-soft);overflow-wrap:anywhere}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;overflow-wrap:anywhere}
.muted{color:var(--muted)}.foot{margin-top:28px;font-size:13px;color:var(--muted)}
.bars{height:150px;display:flex;align-items:flex-end;gap:10px;border-bottom:1px solid var(--border);padding:0 4px;background:repeating-linear-gradient(to top,transparent 0 36px,#EEF4F3 36px 37px)}
.bar{flex:1;min-width:0;border-radius:5px 5px 0 0;background:#BFDCDA}.bar.now{background:var(--accent)}.bar.zero{height:2px!important;background:var(--border-strong)}
.months{display:flex;gap:10px;margin-top:10px;padding:0 4px;font-size:12px;color:var(--muted)}.months span{flex:1;text-align:center;min-width:0}
.progress{height:10px;border-radius:99px;background:var(--neutral-soft);overflow:hidden}.progress span{display:block;height:100%;background:var(--accent)}
/* Mobile Tab-Leiste */
.tabbar{display:none}
@media (max-width:1180px){.metrics,.metrics.five{grid-template-columns:repeat(2,minmax(0,1fr))}.grid2,.grid2.even{grid-template-columns:minmax(0,1fr)}}
.panel-body,.panel-head,.empty,.feed{overflow-wrap:break-word;min-width:0}
.action{align-items:flex-start}
@media (max-width:900px){
.app{display:block}.sidebar{display:none}main{padding:16px 16px 104px}
.topbar{margin-bottom:22px}.topbar .brand{display:flex;padding:0}.topbar .eyebrow{display:none}
.tabbar{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:4;background:rgba(255,255,255,.97);border-top:1px solid var(--border);padding:6px 6px calc(6px + env(safe-area-inset-bottom))}
.tabbar a,.tabbar summary{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:52px;border-radius:12px;color:var(--ink-soft);font-size:12px;font-weight:600;list-style:none;cursor:pointer}
.tabbar summary::-webkit-details-marker{display:none}.tabbar a[aria-current=page]{color:var(--accent-strong);background:var(--accent-soft)}.tabbar a:hover{text-decoration:none}
.tabbar details{position:relative}.tabbar .menu{top:auto;bottom:64px;right:0}
.hero{flex-direction:column;align-items:flex-start}.lead{font-size:15px}
.panel-head{padding:18px 16px 8px}.panel-body{padding:6px 16px 18px}.empty{padding:18px 16px}
th{display:none}table,tbody,tr,td{display:block}tbody{display:grid;gap:10px;padding:4px 12px 12px}
tbody tr{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:10px 12px;border:1px solid var(--border);border-radius:14px;padding:14px}
tbody td{border:0;padding:0;min-width:0;overflow-wrap:anywhere}tbody td::before{content:attr(data-label);display:block;font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:3px}
tbody td.amount{text-align:left}tbody td.full{grid-column:1/-1}tbody tr.empty-row{display:block;border:0;padding:0}tbody tr.empty-row td::before{content:none}
.inline-form{grid-template-columns:1fr}.kv{grid-template-columns:1fr}.kv dt{padding-bottom:0}.kv dd{border-top:0;padding-top:4px}
}
@media (min-width:901px){.topbar .brand{display:none}}
@media (max-width:380px){.metrics,.metrics.five{grid-template-columns:1fr}.mode{font-size:12px;padding:7px 10px;gap:6px}.hero h1{font-size:27px}
.topbar{gap:8px}.topright{gap:6px}.topbar .brand{gap:8px}.topbar .brandname small{display:none}.topbar .mark{width:32px;height:32px}.profile summary{width:44px;height:44px;font-size:13px}}
/* Klickziele mindestens 24 px (WCAG 2.2, 2.5.8) auch für Links in Tabellen, Listen und Hinweisen */
td a,.feed h3 a,td .sub a{display:inline-block;min-height:24px;padding:3px 0}
.metric-head{min-height:44px}
@media (max-width:900px){.tag{white-space:normal;text-align:left;line-height:1.35}}
/* LUXURY TURQUOISE – Markenlicht nur dekorativ, sehr zurückhaltend */
.mark{background:linear-gradient(150deg,#16323F 0%,var(--ocean) 70%);color:var(--brand);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 6px 14px rgba(14,29,37,.18)}
.sidebar{background:linear-gradient(180deg,#FBFDFD 0%,#F3F9F8 100%)}
.nav a[aria-current=page]{box-shadow:inset 3px 0 0 var(--brand)}
.metric{position:relative;overflow:hidden}.metric::before{content:"";position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,var(--brand),rgba(24,200,193,0))}
.metric,.panel{transition:box-shadow .25s ease,transform .25s ease}.metric:hover{box-shadow:0 18px 36px rgba(14,29,37,.08),0 3px 8px rgba(14,29,37,.04)}
.btn{box-shadow:0 1px 0 rgba(255,255,255,.12) inset,0 6px 14px rgba(8,127,130,.18)}.btn.ghost,.btn.danger{box-shadow:none}
.bar.now,.progress span{background:linear-gradient(180deg,#0B9C9C,var(--accent))}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;
