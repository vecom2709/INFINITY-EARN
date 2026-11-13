import type { BrandResult } from './brand.ts';

/** Ruhiges, professionelles Erscheinungsbild; Farben aus dem Kundendesign, Kontraste geprüft. Mobil: Tabellen werden Karten. */
export function css(b: BrandResult): string {
  return `:root{--p:${b.primary};--pt:${b.primaryText};--ps:${b.primarySoft};--ink:#1B2430;--muted:#5A6573;--line:#E3E7EC;--bg:#F6F7F9;--card:#fff;--ok:#1E6B45;--oks:#E3F3EA;--warn:#8A5400;--warns:#FFF4DE;--bad:#A13A3A;--bads:#FBEAEA;--r:14px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.5}
a{color:var(--p)}:focus-visible{outline:3px solid var(--p);outline-offset:2px}
.skip{position:absolute;left:8px;top:-50px;background:var(--ink);color:#fff;padding:8px 12px;border-radius:8px}.skip:focus{top:8px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 24px;background:var(--card);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-size:17px}.logo{width:34px;height:34px;border-radius:10px;background:var(--p);color:var(--pt);display:grid;place-items:center;font-weight:700}
.who{color:var(--muted);font-size:13px}
.nav{display:flex;gap:4px;overflow-x:auto;padding:8px 16px;background:var(--card);border-bottom:1px solid var(--line)}
.nav a{white-space:nowrap;text-decoration:none;color:var(--ink);padding:10px 12px;border-radius:10px;min-height:44px;display:inline-flex;align-items:center;font-weight:550}
.nav a[aria-current=page]{background:var(--ps);color:var(--p);font-weight:700}
main{max-width:1180px;margin:0 auto;padding:20px 24px 60px}h1{font-size:26px;margin:4px 0 16px;letter-spacing:-.4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px 20px;margin:0 0 16px}.card h2{margin:0 0 12px;font-size:17px}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;border-top:3px solid var(--p)}
.kpi span{color:var(--muted);font-size:13px;display:block}.kpi b{font-size:22px;display:block;margin-top:6px;font-variant-numeric:tabular-nums}.kpi small{color:var(--muted);font-size:12px;display:block;margin-top:6px}
.fld{min-width:0}.grid{display:grid;align-items:end;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 14px}.row2{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:4px 12px}
label{display:block;font-size:13px;font-weight:600;margin:8px 0 4px;color:var(--ink)}
input,select{width:100%;min-height:42px;padding:8px 10px;border:1px solid #C9D0D8;border-radius:10px;font:inherit;background:#fff;color:var(--ink)}
input[type=checkbox]{width:20px;height:20px;min-height:0;vertical-align:middle}label.check{font-weight:500;display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:8px 16px;border-radius:10px;border:1px solid var(--p);background:var(--p);color:var(--pt);font:inherit;font-weight:650;cursor:pointer;text-decoration:none}
.btn.ghost{background:#fff;color:var(--ink);border-color:#C9D0D8}.btn.small{min-height:36px;padding:6px 12px;font-size:14px}
.inline{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}.inline input{width:auto;min-width:90px;flex:1}.inline label{margin:0}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}td small{display:block;color:var(--muted);font-size:12px}
.tag{display:inline-block;padding:3px 9px;border-radius:99px;font-size:12.5px;font-weight:650;background:#EEF1F4;color:var(--ink)}.tag.ok{background:var(--oks);color:var(--ok)}.tag.warn{background:var(--warns);color:var(--warn)}.tag.bad{background:var(--bads);color:var(--bad)}
.flash{padding:12px 14px;border-radius:12px;margin:0 0 14px;font-weight:550}.flash.ok{background:var(--oks);color:var(--ok)}.flash.err{background:var(--bads);color:var(--bad)}
.muted{color:var(--muted)}.small{font-size:13px}.err{color:var(--bad)}.todo{padding-left:18px}.todo li{margin:6px 0}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px}.kv dt{color:var(--muted)}.kv dd{margin:0;font-variant-numeric:tabular-nums}
.search{margin:0 0 12px}details summary{cursor:pointer;color:var(--p);font-weight:600;min-height:32px}
.doc{background:#fff;max-width:820px;margin:24px auto;padding:40px;border:1px solid var(--line);border-radius:var(--r)}.doc header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid var(--p);padding-bottom:12px;margin-bottom:18px}
.doc h1{font-size:22px;margin:0}.doc h2{font-size:18px;margin:0}.doc .right{text-align:right}.doc .r{text-align:right}.doc .tot{margin:14px 0 0 auto;width:max-content}.doc .tot dd{text-align:right}
@media (max-width:820px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.grid{grid-template-columns:1fr}main{padding:16px}
thead{display:none}table,tbody,tr,td{display:block}tr{border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:10px;background:#fff}td{border:0;padding:4px 0}td::before{content:attr(data-label);display:block;font-size:11px;text-transform:uppercase;color:var(--muted);font-weight:650}}
@media (max-width:420px){.kpis{grid-template-columns:1fr}.row2{grid-template-columns:1fr}}
@media print{.top,.nav,.noprint,.skip{display:none!important}body{background:#fff}.doc{border:0;margin:0;padding:0;max-width:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`;
}
