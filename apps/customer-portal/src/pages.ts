import { formatMinor } from '../../../packages/contracts/src/money.ts';
import type { AppContext } from '../../../services/core-api/src/context.ts';
import type { CustomerRow } from '../../../services/core-api/src/customers.ts';
import type { OrderRow } from '../../../services/core-api/src/orders.ts';
import type { QuoteRow } from '../../../services/core-api/src/workflow.ts';
import { customerInvoices } from '../../../services/finance/src/invoice-pdf.ts';
import { getAcceptance, getFeedback } from '../../../services/core-api/src/aftercare.ts';
import { asCalcInput, computeTotals, type CalcInput } from '../../../services/product-factory/src/capabilities/b2b-calc-csv.ts';
import type { ProvenancePassport } from '../../../services/product-factory/src/provenance.ts';
import { HOME, LANG_PATH, LANGS, type Lang } from './home-i18n.ts';
import { acceptanceChecks, listStandards } from '../../../services/product-factory/src/quality-standard.ts';
import type { TrustFacts } from '../../../services/core-api/src/trust.ts';
import { getDeliveryByOrder, issueDownloadToken } from '../../../services/product-factory/src/delivery.ts';
import { icon } from '../../console/src/icons.ts';
import { paymentLabel, pipelineLabel } from '../../console/src/labels.ts';
import { friendlyTitle } from '../../console/src/model.ts';
import { e, page } from '../../shared/layout.ts';

/** Kundenseiten im 15.0-Design: verständlich, ruhig, alle Dokumente ohne Chat auffindbar (UI-09). */
const money = (minor: number, currency: string): string => `${formatMinor(minor, currency).replace('.', ',')} ${currency === 'EUR' ? '€' : currency}`;
const tone = (t: string): string => (t === 'ok' ? 'ok' : t === 'bad' ? 'bad' : t === 'neutral' ? 'neutral' : '');

/**
 * Startseite LUXURY TURQUOISE mit Storyscrolling (8 Kapitel). Ohne JavaScript (CSP): Scroll-Reveal und dezentes
 * Parallax über CSS-Scroll-Timelines, nur bei „Bewegung erlaubt“; Parallax nur auf großen Bildschirmen.
 * Ohne Unterstützung bleibt alles sofort sichtbar. Inhalte nur aus echten Systemdaten – keine erfundenen Zahlen.
 */
const HOME_CSS = `
.story-progress{position:fixed;left:0;right:0;top:0;height:3px;z-index:30;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,var(--accent),var(--brand));display:none}
.hero{position:relative;overflow:hidden;background:radial-gradient(1200px 520px at 78% -10%,rgba(24,200,193,.20),transparent 60%),radial-gradient(900px 500px at -10% 110%,rgba(8,127,130,.28),transparent 60%),var(--ocean);color:#E6F1F0}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.04),transparent 30%);pointer-events:none}
.hero-in{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:clamp(56px,9vw,120px) 24px clamp(64px,9vw,112px);display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);gap:56px;align-items:center}
.kicker{display:inline-flex;align-items:center;gap:10px;font-size:13px;letter-spacing:1.8px;text-transform:uppercase;font-weight:650;color:#9FDCD8}.kicker::before{content:"";width:28px;height:1px;background:var(--brand)}
.hero h1{font-size:clamp(40px,5.6vw,76px);line-height:1.02;letter-spacing:-2.6px;font-weight:740;margin:22px 0 22px;color:#F7FAF9}
.hero h1 em{font-style:normal;background:linear-gradient(90deg,#5FE0DA,var(--brand));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p.lead{color:#B9CFCE;font-size:clamp(17px,1.5vw,20px);max-width:560px;margin:0 0 32px}
.hero .btn{min-height:52px;padding:14px 22px;font-size:16px;border-color:var(--brand);background:linear-gradient(180deg,#22D3CB,var(--brand));color:var(--ocean);box-shadow:0 10px 30px rgba(24,200,193,.25)}
.hero .btn:hover{background:#5FE0DA}.hero .btn.secondary{background:rgba(255,255,255,.06);color:#E6F1F0;border-color:rgba(230,241,240,.28);box-shadow:none}.hero .btn.secondary:hover{background:rgba(255,255,255,.12)}
.glass{position:relative;border-radius:22px;padding:22px;background:linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.14);box-shadow:0 40px 80px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.sheet{background:#fff;color:var(--ink);border-radius:14px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.25)}
.sheet-h{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border)}.sheet-h b{font-size:15px}.sheet-h small{display:block;color:var(--muted);font-size:12.5px}
.sheet table{font-size:13.5px}.sheet th{padding:9px 18px}.sheet td{padding:10px 18px;border-bottom:1px solid #E9F0EF}.sheet .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.sheet tfoot td{font-weight:740;background:#F2F9F8;border-bottom:0}
.glass-note{display:flex;gap:10px;align-items:center;margin-top:14px;color:#B9CFCE;font-size:13px}.glass-note .ico{color:var(--brand)}
.chapter{position:relative;max-width:1200px;margin:0 auto;padding:clamp(72px,10vw,128px) 24px;display:grid;grid-template-columns:200px minmax(0,1fr);gap:48px}
.band{background:#fff;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}.band.mist{background:linear-gradient(180deg,#F1F8F7,#F7FAF9)}
.ch-label{position:sticky;top:96px;align-self:start;color:var(--muted);font-size:13px;letter-spacing:1.6px;text-transform:uppercase;font-weight:650}
.ch-label b{display:block;font-size:44px;letter-spacing:-1.5px;line-height:1;color:var(--accent);margin-bottom:8px;font-weight:720}
.chapter h2{font-size:clamp(30px,3.6vw,48px);line-height:1.08;letter-spacing:-1.6px;margin:0 0 16px;font-weight:720;max-width:820px}
.chapter .sub{font-size:clamp(17px,1.4vw,19px);color:var(--ink-soft);max-width:680px;margin:0 0 32px}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.tile{background:#fff;border:1px solid var(--border);border-radius:20px;padding:24px;box-shadow:0 1px 2px rgba(14,29,37,.04);transition:transform .25s ease,box-shadow .25s ease;min-width:0}
.tile:hover{transform:translateY(-3px);box-shadow:0 22px 44px rgba(14,29,37,.08)}.tile h3{margin:14px 0 6px;font-size:18px;letter-spacing:-.3px}.tile p{margin:0;color:var(--muted);font-size:15px}
.tile .ic{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(150deg,#16323F,var(--ocean));color:var(--brand)}
.tile .meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.compose{border-radius:20px;background:#fff;border:1px solid var(--border);box-shadow:0 24px 50px rgba(14,29,37,.07);overflow:hidden;max-width:760px}
.compose-h{padding:14px 20px;border-bottom:1px solid var(--border);font-size:13px;color:var(--muted);display:flex;gap:8px;align-items:center}.compose-h .dot{width:8px;height:8px;border-radius:50%;background:var(--brand)}
.compose pre{margin:0;padding:20px;font:14.5px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--ink-soft);white-space:pre-wrap}
.flow{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.flow li{position:relative;background:#fff;border:1px solid var(--border);border-radius:18px;padding:18px}.flow li b{display:block;font-size:15.5px;margin:10px 0 4px}.flow li span{color:var(--muted);font-size:14px}
.flow li i{font-style:normal;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--accent-soft);color:var(--accent-strong);font-weight:720;font-size:13px}
.checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.checks .tile b.num{display:block;font-size:40px;letter-spacing:-1.4px;color:var(--accent);line-height:1;margin-top:6px}
.cta-final{background:radial-gradient(900px 400px at 50% -20%,rgba(24,200,193,.22),transparent 60%),var(--ocean);color:#E6F1F0;text-align:center}
.cta-final .chapter{display:block}.cta-final h2{color:#F7FAF9;margin:0 auto 14px}.cta-final .sub{color:#B9CFCE;margin:0 auto 30px}
.cta-final .btn{min-height:54px;padding:14px 26px;font-size:16.5px;border-color:var(--brand);background:linear-gradient(180deg,#22D3CB,var(--brand));color:var(--ocean)}
.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.links a{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:10px 14px;border-radius:12px;border:1px solid var(--border-strong);background:#fff;color:var(--ink-soft)}
.links a:hover{text-decoration:none;border-color:var(--accent)}
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion:no-preference) {
    .story-progress{display:block;animation:grow linear both;animation-timeline:scroll(root)}
    .reveal{animation:reveal linear both;animation-timeline:view();animation-range:entry 0% cover 28%}
  }
  @media (prefers-reduced-motion:no-preference) and (min-width:900px) {
    .parallax{animation:drift linear both;animation-timeline:view();animation-range:cover 0% cover 100%}
  }
}
@keyframes reveal{from{opacity:0;transform:translateY(28px) scale(.985)}to{opacity:1;transform:none}}
@keyframes drift{from{transform:translateY(28px)}to{transform:translateY(-28px)}}
@keyframes grow{to{transform:scaleX(1)}}
@media (max-width:900px){.hero-in{grid-template-columns:1fr;gap:36px}.chapter{grid-template-columns:1fr;gap:12px}.ch-label{position:static}.ch-label b{font-size:30px;display:inline;margin-right:10px}
.tiles,.checks{grid-template-columns:1fr}.flow{grid-template-columns:1fr 1fr}}
@media (max-width:520px){.flow{grid-template-columns:1fr}.hero h1{letter-spacing:-1.6px}.hero .btn{width:100%}.sheet td,.sheet th{padding-left:12px;padding-right:12px}}
`;

const HOME_ICON: Record<string, Parameters<typeof icon>[0]> = { 'b2b-calc-csv': 'grid', 'b2b-calc-pdf': 'doc', 'b2b-calc-bundle': 'package' };
const HOME_FORMAT: Record<string, string> = { 'b2b-calc-csv': 'CSV', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'ZIP · CSV · PDF' };

const SAMPLE: Record<Lang, { title: string; items: [string, string, string] }> = {
  de: { title: 'Montage Büro Nord', items: ['Montage', 'Material', 'Anfahrt'] },
  it: { title: 'Montaggio Ufficio Nord', items: ['Montaggio', 'Materiale', 'Trasferta'] },
  en: { title: 'Office North installation', items: ['Installation', 'Material', 'Travel'] },
};

export function renderHome(offered: readonly string[] = ['b2b-calc-csv'], lang: Lang = 'de', origin = ''): string {
  const T = HOME[lang];
  const S = SAMPLE[lang];
  const sample = asCalcInput({ title: S.title, currency: 'EUR', margin_bps: 2000, language: lang, items: [{ name: S.items[0], quantity: 2, unit_cost_minor: 4500 }, { name: S.items[1], quantity: 1, unit_cost_minor: 2000 }, { name: S.items[2], quantity: 1, unit_cost_minor: 3500 }] });
  const t = computeTotals(sample);
  const products = FORMATS.filter((f) => offered.includes(f.id));
  const standards = listStandards().filter((s) => offered.includes(s.capabilityId));
  const chapter = (n: number, label: string, inner: string, band = ''): string =>
    `<section class="${band}" aria-labelledby="k${n}"><div class="chapter"><div class="ch-label" aria-hidden="true"><b>0${n}</b>${label}</div><div>${inner}</div></div></section>`;
  const body = `<div class="story-progress" aria-hidden="true"></div>
<section class="hero" aria-labelledby="k1"><div class="hero-in">
<div class="reveal"><span class="kicker">INFINITY EARN</span>
<h1 id="k1">${T.heroH1[0]}<br>${T.heroH1[1]} ${T.heroH1[2]}</h1>
<p class="lead">${T.heroLead}</p>
<p class="row"><a class="btn" href="/anfrage">${T.ctaPrimary} ${icon('arrow', 'sm')}</a><a class="btn secondary" href="#k4">${T.ctaProducts}</a></p></div>
<figure class="glass parallax" style="margin:0" aria-label="${e(T.sample.aria)}">
<div class="sheet"><div class="sheet-h"><div><b>${e(sample.title)}</b><small>${T.sample.meta}</small></div><span class="tag ok">${icon('check', 'sm')} ${T.sample.checked}</span></div>
<table><thead><tr><th>${T.sample.pos}</th><th class="r">${T.sample.qty}</th><th class="r">${T.sample.sum}</th></tr></thead><tbody>
${sample.items.map((it, i) => `<tr><td>${e(it.name)}</td><td class="r">${it.quantity}</td><td class="r">${money(t.lines[i] as number, 'EUR')}</td></tr>`).join('')}
<tr><td>${T.sample.markup}</td><td></td><td class="r">${money(t.markup, 'EUR')}</td></tr></tbody>
<tfoot><tr><td>${T.sample.total}</td><td></td><td class="r">${money(t.total, 'EUR')}</td></tr></tfoot></table></div>
<figcaption class="glass-note">${icon('shield', 'sm')} ${T.sample.note}</figcaption></figure>
</div></section>
${chapter(2, T.c2[0], `<div class="reveal"><h2 id="k2">${T.c2[1]}</h2><p class="sub">${T.c2[2]}</p></div>`)}
${chapter(3, T.c3[0], `<div class="reveal"><h2 id="k3">${T.c3[1]}</h2><p class="sub">${T.c3[2]}</p>
<figure class="compose" style="margin:0"><div class="compose-h"><span class="dot"></span>${T.c3[3]}</div><pre>${e(S.items[0])};2;45,00
${e(S.items[1])};1;20
${e(S.items[2])};1;35
${e(T.sample.markup)}</pre></figure>
<p class="links"><a href="/berater">${icon('send', 'sm')} ${T.c3[4]}</a></p></div>`, 'band')}
${chapter(4, T.c4[0], `<div class="reveal"><h2 id="k4">${T.c4[1]}</h2><p class="sub">${T.c4[2]}</p></div>
<div class="tiles">${products.map((f) => `<article class="tile reveal"><span class="ic">${icon(HOME_ICON[f.id] ?? 'doc')}</span><h3>${e(T.products[f.id]?.label ?? f.label)}</h3><p>${e(T.products[f.id]?.text ?? f.text)}</p><div class="meta"><span class="tag neutral">${e(HOME_FORMAT[f.id] ?? '')}</span><a href="/hilfe/${e(f.id)}">${T.guide}</a></div></article>`).join('')}</div>`, 'band mist')}
${chapter(5, T.c5[0], `<div class="reveal"><h2 id="k5">${T.c5[1]}</h2><p class="sub">${T.c5[2]}</p></div>
<div class="checks">${standards.map((s) => `<article class="tile reveal"><span class="muted" style="font-size:14px">${e(T.products[s.capabilityId]?.label ?? s.capabilityId)}</span><b class="num">${acceptanceChecks(s).length}</b><p>${T.c5[3]}</p><div class="meta">${s.references.map((r) => `<span class="tag neutral">${e(r.name)}</span>`).join('')}</div></article>`).join('')}</div>
<p class="links"><a href="/vertrauen">${icon('shield', 'sm')} ${T.trust}</a><a href="/pruefen">${icon('check', 'sm')} ${T.c5[4]}</a></p>`)}
${chapter(6, T.c6[0], `<div class="reveal"><h2 id="k6">${T.c6[1]}</h2><p class="sub">${T.c6[2]}</p></div>
<ol class="flow">${T.flow.map(([b, s], i) => `<li class="reveal"><i>${i + 1}</i><b>${b}</b><span>${s}</span></li>`).join('')}</ol>`, 'band')}
${chapter(7, T.c7[0], `<div class="reveal"><h2 id="k7">${T.c7[1]}</h2><p class="sub">${T.c7[2]}</p></div>
<div class="tiles">${(['download', 'receipt', 'inbox'] as const).map((ic, i) => `<article class="tile reveal"><span class="ic">${icon(ic)}</span><h3>${T.portalTiles[i]?.[0] ?? ''}</h3><p>${T.portalTiles[i]?.[1] ?? ''}</p></article>`).join('')}</div>
<p class="links"><a href="/portal">${icon('lock', 'sm')} ${T.c7[3]}</a></p>`, 'band mist')}
<section class="cta-final" aria-labelledby="k8"><div class="chapter reveal"><h2 id="k8">${T.c8[0]}</h2><p class="sub">${T.c8[1]}</p><a class="btn" href="/anfrage">${T.ctaPrimary} ${icon('arrow', 'sm')}</a></div></section>`;
  const abs = (p: string): string => `${origin}${p}`;
  return page(T.title, body, {
    testMode: true, active: 'start', wide: true, extraCss: HOME_CSS, description: T.description, lang,
    canonical: origin ? abs(LANG_PATH[lang]) : undefined,
    alternates: origin ? [...LANGS.map((l) => ({ lang: l, href: abs(LANG_PATH[l]) })), { lang: 'x-default', href: abs('/') }] : undefined,
    langSwitch: LANGS.map((l) => ({ lang: l, href: LANG_PATH[l], label: l.toUpperCase(), current: l === lang })),
    ui: { nav: T.nav, banner: T.banner, footer: T.footer, trust: T.trust, verify: T.verify, admin: T.admin, skip: lang === 'de' ? 'Zum Inhalt springen' : lang === 'it' ? 'Vai al contenuto' : 'Skip to content', home: LANG_PATH[lang] },
  });
}

export type InquiryValues = Partial<Record<'name' | 'email' | 'company' | 'country' | 'title' | 'items' | 'margin' | 'message' | 'marketing' | 'format', string>>;

/** Lieferformate, die der Kunde wählen kann – nur was die Policy freigegeben hat (Freischaltung durch den Eigentümer). */
export const FORMATS: { id: string; label: string; text: string }[] = [
  { id: 'b2b-calc-csv', label: 'Tabelle (CSV, in Excel bearbeitbar)', text: 'Zum Weiterrechnen in Excel oder LibreOffice.' },
  { id: 'b2b-calc-pdf', label: 'Druckfertiges PDF', text: 'Zum Weitergeben, Drucken oder Ablegen.' },
  { id: 'b2b-calc-bundle', label: 'Paket: Tabelle und PDF (ZIP)', text: 'Beide Dateien; Preis aus dem tatsächlichen Mehraufwand, kein Rabatt-Versprechen.' },
];

/** Anfrageformular. Bei Fehlern bleiben alle Eingaben erhalten; Fehler stehen oben und am Positionsfeld. */
/** Produktberater: Wunsch in eigenen Worten beschreiben (DE/IT/EN). Ohne Skripte, ohne kostenpflichtige KI. */
export function renderAdvisor(text = '', error?: string): string {
  return page('Produktberater – INFINITY EARN', `<h1>Beschreiben Sie Ihren Wunsch</h1>
<p class="lead">In eigenen Worten, auf Deutsch, Italienisch oder Englisch. Der Berater erkennt Positionen, Aufschlag und Format, füllt die Anfrage für Sie vor und fragt nur nach, was noch fehlt.</p>
${error ? `<div class="card err" role="alert">${e(error)}</div>` : ''}
<form class="card" method="post" action="/berater">
<label for="wunsch">Ihr Wunsch</label>
<textarea id="wunsch" name="wunsch" required maxlength="5000" placeholder="Kalkulation Badsanierung als PDF: Fliesen 24 m² à 38 €, Arbeit 16 h à 52 €, Entsorgung pauschal 180 €, Aufschlag 15 %">${e(text)}</textarea>
<p class="muted">Beispiele: <span class="mono">2 x Montage à 45 €</span> · <span class="mono">Arbeit 16 h à 52 €</span> · <span class="mono">Entsorgung pauschal 180 €</span> · oder Zeilen direkt aus Excel.</p>
<p><button>Weiter</button></p>
<p class="muted">Es wird noch nichts gesendet. Im nächsten Schritt sehen und ändern Sie alles, bevor Sie die Anfrage abschicken.</p></form>
<p class="muted">Lieber direkt ausfüllen? <a href="/anfrage">Zum Anfrageformular</a></p>`, { testMode: true, active: 'anfrage' });
}

export function renderInquiryForm(errors: string[] = [], v: InquiryValues = {}, allowed: readonly string[] = ['b2b-calc-csv'], advisor?: { understood: string[]; questions: string[] }): string {
  const formats = FORMATS.filter((f) => allowed.includes(f.id));
  const chosen = formats.some((f) => f.id === v.format) ? v.format : formats[0]?.id;
  const val = (k: keyof InquiryValues, def = ''): string => e(v[k] ?? def);
  const itemErrors = errors.filter((x) => x.startsWith('Zeile') || x.startsWith('Mindestens'));
  return page(
    'Anfrage – INFINITY EARN',
    `<h1>Angebot anfordern</h1><p class="lead">Kalkulation aus Ihren Positionen – ${formats.length > 1 ? 'als Excel-Tabelle oder druckfertiges PDF' : 'als Tabelle (CSV, in Excel bearbeitbar)'}. Sie erhalten sofort ein unverbindliches Angebot.</p>
${errors.length ? `<div class="card err" role="alert"><strong>Bitte korrigieren – Ihre Eingaben sind erhalten geblieben:</strong><ul>${errors.map((x) => `<li>${e(x)}</li>`).join('')}</ul></div>` : ''}
${advisor ? `<div class="card" role="status"><h2>Das habe ich verstanden</h2>${advisor.understood.length ? `<ul>${advisor.understood.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : '<p class="muted">Noch keine konkreten Angaben erkannt.</p>'}${advisor.questions.length ? `<h3>Bitte noch ergänzen</h3><ul>${advisor.questions.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : ''}<p class="muted">Alles ist vorausgefüllt und änderbar. Gesendet wird erst mit „Anfrage senden“. <a href="/berater">Wunsch neu beschreiben</a></p></div>` : ''}
<form class="card" method="post" action="/anfrage">
<h2>Ihre Angaben</h2>
<label for="name">Name</label><input id="name" type="text" name="name" required maxlength="200" autocomplete="name" value="${val('name')}">
<label for="email">E-Mail</label><input id="email" type="email" name="email" required maxlength="254" autocomplete="email" value="${val('email')}">
<label for="company">Firma (optional)</label><input id="company" type="text" name="company" maxlength="200" autocomplete="organization" value="${val('company')}">
<label for="country">Land (ISO, z. B. DE)</label><input id="country" type="text" name="country" required maxlength="2" value="${val('country', 'DE')}">
<h2>Ihre Kalkulation</h2>
<label for="title">Titel der Kalkulation</label><input id="title" type="text" name="title" required maxlength="200" value="${val('title')}">
<label for="items">Positionen – eine pro Zeile: <span class="mono">Bezeichnung;Menge;Einzelpreis in EUR</span></label>
<p class="muted">Beispiel: <span class="mono">Montage;10;45.00</span> – auch Komma (45,00) oder aus Excel kopierte Zeilen (Tabulator) gehen.</p>
${itemErrors.length ? `<p class="err">${itemErrors.map((x) => e(x)).join('<br>')}</p>` : ''}
<textarea id="items" name="items" required placeholder="Montage;10;45.00&#10;Material;3;120.50">${val('items')}</textarea>
${formats.length > 1 ? `<fieldset><legend><strong>Lieferformat</strong></legend>${formats.map((f) => `<label><input type="radio" name="format" value="${f.id}"${f.id === chosen ? ' checked' : ''}> ${e(f.label)} – <span class="muted">${e(f.text)}</span></label>`).join('')}</fieldset>` : `<input type="hidden" name="format" value="${e(chosen ?? 'b2b-calc-csv')}">`}
<label for="margin">Gewünschter Aufschlag in %</label><input id="margin" type="text" name="margin" maxlength="5" value="${val('margin', '20')}">
<label for="message">Nachricht</label><textarea id="message" name="message" required maxlength="5000">${val('message')}</textarea>
<label><input type="checkbox" name="privacy" value="1" required> Ich habe den Datenschutzhinweis gelesen (Entwurf, Testmodus).</label>
<label><input type="checkbox" name="marketing" value="1"${v.marketing === '1' ? ' checked' : ''}> Ich möchte Neuigkeiten per E-Mail erhalten (freiwillig, jederzeit widerrufbar).</label>
<p><button>Anfrage senden</button></p><p class="muted">Kostenlos und unverbindlich. Wir schreiben Ihnen nur zu Ihrer Anfrage.</p></form>`,
    { testMode: true, active: 'anfrage' },
  );
}

export function renderInquiryResult(title: string, text: string, link?: { href: string; label: string }): string {
  return page('Anfrage – INFINITY EARN', `<h1>${e(title)}</h1><div class="card"><p>${e(text)}</p>${link ? `<p><a class="btn" href="${e(link.href)}">${e(link.label)}</a></p>` : ''}</div>`, { testMode: true, active: 'anfrage' });
}

const STEPS = ['Anfrage', 'Angebot', 'Bezahlt', 'In Arbeit', 'Geliefert'];
function progress(active: number): string {
  return `<ol class="progress-steps" aria-label="Fortschritt">${STEPS.map((s, i) => `<li class="${i < active ? 'done' : i === active ? 'now' : ''}"${i === active ? ' aria-current="step"' : ''}>${e(s)}</li>`).join('')}</ol>`;
}

/**
 * 043 Vorschau vor dem Kauf: zeigt die Kalkulation aus den eigenen Positionen des Kunden (keine fremden Daten),
 * ohne die Datei herauszugeben – das Vollprodukt gibt es erst nach bestätigter Zahlung.
 */
function quotePreview(q: QuoteRow): string {
  let input: CalcInput;
  try {
    input = asCalcInput(JSON.parse(q.scope));
  } catch {
    return '';
  }
  const t = computeTotals(input);
  const shown = input.items.slice(0, 8);
  return `<div class="card"><h3>Vorschau Ihrer Kalkulation</h3><p class="muted">So wird Ihre Datei aufgebaut – berechnet aus Ihren Angaben. Die fertige Datei erhalten Sie nach bestätigter Zahlung.</p>
<div class="table-wrap"><table class="cards"><caption class="sr-only">Vorschau der Kalkulation</caption><thead><tr><th scope="col">Position</th><th scope="col">Menge</th><th scope="col">Einzelpreis</th><th scope="col">Summe</th></tr></thead><tbody>
${shown.map((it, i) => `<tr><td data-label="Position">${e(it.name)}</td><td data-label="Menge">${it.quantity}</td><td data-label="Einzelpreis">${e(money(it.unit_cost_minor, input.currency))}</td><td data-label="Summe">${e(money(t.lines[i] as number, input.currency))}</td></tr>`).join('')}
${input.items.length > shown.length ? `<tr><td data-label="Hinweis" colspan="4" class="muted">… und ${input.items.length - shown.length} weitere Positionen</td></tr>` : ''}
</tbody></table></div>
<p style="margin:12px 0 0">Zwischensumme ${e(money(t.subtotal, input.currency))} · Aufschlag ${(input.margin_bps / 100).toFixed(2).replace('.', ',')} % = ${e(money(t.markup, input.currency))} · <strong>Kalkulierter Gesamtwert ${e(money(t.total, input.currency))}</strong></p>
<p class="muted" style="font-size:14px;margin:6px 0 0">Das ist der Inhalt Ihrer Kalkulation – nicht der Preis dieses Angebots.</p></div>`;
}

export function renderQuote(q: QuoteRow, token: string): string {
  const terms = JSON.parse(q.terms_json) as Record<string, unknown>;
  const scope = JSON.parse(q.scope) as { title?: string; items?: { name: string; quantity: number; unit_cost_minor: number }[] } | null;
  const statusText: Record<string, string> = { ISSUED: 'Gültig', ACCEPTED: 'Angenommen', EXPIRED: 'Abgelaufen', WITHDRAWN: 'Zurückgezogen' };
  return page(
    'Angebot – INFINITY EARN',
    `${progress(q.status === 'ACCEPTED' ? 2 : 1)}<h1>Ihr Angebot</h1><p class="lead">${e(friendlyTitle(q.description))} · ${e(scope?.title ?? '')}</p>
<div class="grid">
<div class="card"><div class="muted">Preis</div><div class="price">${e(money(q.gross_total_minor, q.currency))}</div><p class="muted">Steuer wird noch nicht berechnet (Steuerangaben im Testbetrieb nicht hinterlegt).</p>
<p><span class="tag ${q.status === 'ISSUED' ? 'ok' : 'neutral'}">${e(statusText[q.status] ?? q.status)}</span> <span class="muted">gültig bis ${e(q.valid_until.slice(0, 10))}</span></p></div>
<div class="card"><h3>Lieferumfang</h3><ul><li>${scope?.items?.length ?? 0} Positionen, Aufschlag und Summen</li><li>Lieferkriterien: ${e((terms.delivery_criteria as string[] | undefined)?.join(', ') ?? '')}</li><li>Lieferung ${e(String(terms.delivery_deadline_days))} Tage nach Zahlungseingang</li></ul></div></div>
${quotePreview(q)}
<div class="card"><h3>Bedingungen</h3><ul><li>Nutzungsrechte: ${e(terms.rights)}</li><li>Rückerstattung: ${e(terms.refund_criteria)}</li><li>${e(terms.withdrawal_notice)}</li><li>${e(terms.privacy_notice)}</li></ul>
<p class="err">${e(terms.notice ?? '')}</p></div>
${q.status === 'ISSUED' ? `<form class="card" method="post" action="/angebot/${e(q.quote_id)}/annehmen"><h2>Angebot annehmen</h2>
<input type="hidden" name="t" value="${e(token)}">
<label for="bname">Rechnungsname</label><input id="bname" type="text" name="buyer_name" required maxlength="200" autocomplete="organization">
<label for="baddr">Rechnungsadresse</label><input id="baddr" type="text" name="buyer_address" required maxlength="300" autocomplete="street-address">
<label for="bcountry">Land (ISO)</label><input id="bcountry" type="text" name="buyer_country" required maxlength="2" value="DE">
<label for="btype">Sie bestellen als</label><select id="btype" name="buyer_type"><option value="B2B">Unternehmen (B2B)</option><option value="B2C">Verbraucher (B2C)</option></select>
<label for="vat">USt-IdNr. (optional)</label><input id="vat" type="text" name="vat_id" maxlength="20">
<fieldset><legend><strong>Nur für Verbraucher (B2C) – Pflicht:</strong></legend>
<label><input type="checkbox" name="waiver_immediate" value="1"> Ich verlange ausdrücklich, dass mit der Bereitstellung der digitalen Inhalte vor Ablauf der Widerrufsfrist begonnen wird.</label>
<label><input type="checkbox" name="waiver_loss" value="1"> Mir ist bekannt, dass ich mit Beginn der Bereitstellung mein Widerrufsrecht verliere.</label>
<p class="muted">Entwurfstext – rechtliche Prüfung vor Livebetrieb (LA-07). Verkauf nur an Kunden mit Sitz in der EU.</p></fieldset>
<label><input type="checkbox" name="terms" value="1" required> Ich nehme dieses Angebot an (Testmodus – keine echte Zahlung).</label>
<p><button>Angebot annehmen und bezahlen</button></p><p class="muted">Sie werden zum Zahlungsanbieter weitergeleitet. Gearbeitet wird erst nach dessen Bestätigung.</p></form>` : ''}`,
    { testMode: true },
  );
}

export function renderMockCheckout(order: OrderRow): string {
  return page(
    'Testzahlung – INFINITY EARN',
    `${progress(1)}<h1>Testzahlung</h1><div class="card"><p>Auftrag <span class="mono">${e(order.order_id)}</span> · Betrag <strong>${e(money(order.amount_minor, order.currency))}</strong></p>
<p class="err">Dies ist KEIN echter Zahlungsvorgang. Es fließt kein Geld. Der Test-Zahlungsanbieter sendet eine signierte Testbestätigung.</p>
<form method="post" action="/checkout/mock/${e(order.checkout_session_id ?? '')}/pay" class="row">
<button name="outcome" value="paid">Testzahlung erfolgreich</button>
<button name="outcome" value="pending" class="secondary">Asynchron (ausstehend)</button>
<button name="outcome" value="failed" class="secondary">Zahlung fehlgeschlagen</button></form></div>`,
    { testMode: true },
  );
}

export function renderCheckoutReturn(order: OrderRow | undefined): string {
  const p = paymentLabel(order?.payment_state ?? 'UNPAID');
  return page(
    'Zahlungsstatus – INFINITY EARN',
    `${progress(order?.payment_state === 'CONFIRMED' ? 3 : 2)}<h1>Danke für Ihre Bestellung</h1>
<div class="card"><p>Aktueller Zahlungsstatus: <span class="tag ${tone(p.tone)}">${e(p.text)}</span></p>
<p class="muted">Die Zahlung wird ausschließlich über eine signierte Bestätigung des Zahlungsanbieters bestätigt – nicht über diese Seite. Das kann einen Moment dauern.</p>
${order ? `<div class="docs"><a href="/portal/vertrag/${e(order.order_id)}">${icon('doc', 'sm')}Vertragsbestätigung herunterladen (PDF)</a></div><p class="muted">Bitte speichern Sie die Vertragsbestätigung – sie ist Ihr Vertragsnachweis.</p>` : ''}
<p><a class="btn" href="/portal">Zum Kundenportal</a></p></div>`,
    { testMode: true, active: 'portal' },
  );
}

/** 084/047 Abnahme und 120/034 Rückmeldung – nur nach Lieferung, je Auftrag einmal, freiwillig. */
function renderAftercare(ctx: AppContext, orderId: string): string {
  const acc = getAcceptance(ctx, orderId);
  const fb = getFeedback(ctx, orderId);
  const accBlock = acc
    ? `<p style="margin:16px 0 0">${acc.decision === 'ACCEPTED' ? '<span class="tag ok">Abgenommen</span> Sie haben die Lieferung bestätigt.' : '<span class="tag">Mangel gemeldet</span> Wir kümmern uns um eine Nachbesserung oder Erstattung.'}</p>`
    : `<form method="post" action="/portal/abnahme" style="margin-top:18px"><h3>Passt die Lieferung?</h3><input type="hidden" name="order_id" value="${e(orderId)}">
<p class="muted" style="margin:0 0 8px">Bitte prüfen Sie die Datei. Wenn etwas nicht stimmt, beschreiben Sie es kurz – wir bessern nach oder erstatten.</p>
<label for="note-${e(orderId)}">Hinweis (bei Mangel bitte ausfüllen)</label><textarea id="note-${e(orderId)}" name="note" maxlength="2000" style="min-height:80px"></textarea>
<p class="row"><button name="decision" value="ok">Ja, alles in Ordnung</button><button name="decision" value="defect" class="secondary">Mangel melden</button></p></form>`;
  const fbBlock = fb
    ? `<p class="muted" style="margin:10px 0 0">Ihre Bewertung: ${'★'.repeat(fb.rating)}${'☆'.repeat(5 - fb.rating)} – danke!</p>`
    : acc?.decision === 'ACCEPTED'
      ? `<form method="post" action="/portal/rueckmeldung" style="margin-top:18px"><h3>Wie zufrieden sind Sie? (freiwillig)</h3><input type="hidden" name="order_id" value="${e(orderId)}">
<fieldset><legend>Bewertung</legend><div class="row">${[5, 4, 3, 2, 1].map((n) => `<label><input type="radio" name="rating" value="${n}" required> ${n} ${n === 1 ? 'Stern' : 'Sterne'}</label>`).join('')}</div></fieldset>
<label for="out-${e(orderId)}">Nutzen Sie die Kalkulation?</label><select id="out-${e(orderId)}" name="outcome"><option value="IN_USE">Ja, im Einsatz</option><option value="NOT_YET">Noch nicht</option><option value="NOT_USEFUL">Nein, hilft mir nicht</option></select>
<label for="com-${e(orderId)}">Kommentar (optional)</label><textarea id="com-${e(orderId)}" name="comment" maxlength="2000" style="min-height:80px"></textarea>
<label><input type="checkbox" name="consent_publish" value="1"> Mein Kommentar darf ohne Namen als Kundenstimme gezeigt werden (jederzeit widerrufbar).</label>
<p><button>Rückmeldung senden</button></p></form>`
      : '';
  const changeBlock = `<details style="margin-top:16px"><summary style="cursor:pointer;font-weight:600;min-height:32px">Erweiterung anfragen (Nachtrag)</summary>
<form method="post" action="/portal/nachtrag"><input type="hidden" name="order_id" value="${e(orderId)}">
<p class="muted" style="margin:6px 0 0">Zusätzliche Positionen werden als eigenes Angebot kalkuliert – mit demselben Aufschlag. Erst wenn Sie dieses Angebot annehmen und bezahlen, wird es beauftragt.</p>
<label for="ch-${e(orderId)}">Zusätzliche Positionen – eine pro Zeile: <span class="mono">Bezeichnung;Menge;Einzelpreis</span></label><textarea id="ch-${e(orderId)}" name="items" required maxlength="20000" style="min-height:90px"></textarea>
<label for="chn-${e(orderId)}">Hinweis (optional)</label><input id="chn-${e(orderId)}" type="text" name="note" maxlength="1000">
<p><button class="secondary">Nachtragsangebot erstellen</button></p></form></details>`;
  return accBlock + fbBlock + changeBlock;
}

/**
 * 124 Anleitung je Produkt: erklärt ausschließlich, was die gelieferte Datei tatsächlich enthält und kann
 * (Spalten/Zeilen genau so, wie die Produktion sie erzeugt) – keine erfundenen Funktionen.
 */
export const HELP: Record<string, { title: string; steps: string[]; contents: string[]; limits: string[] }> = {
  'b2b-calc-csv': {
    title: 'Kalkulationstabelle (CSV)',
    contents: ['Zeile 1: Titel und Währung', 'Zeile 2: Spalten Position, Menge, Einzelpreis, Summe', 'Danach eine Zeile je Position', 'Am Ende: Zwischensumme, Aufschlag (mit Prozentsatz) und Gesamt', 'Letzte Zeile: Herkunftshinweis „Erstellt mit INFINITY EARN“'],
    steps: [
      'Datei speichern (nicht direkt aus dem Browser öffnen).',
      'In Excel: Daten → Aus Text/CSV → Datei wählen.',
      'Dateiursprung „65001: Unicode (UTF-8)“, Trennzeichen „Komma“.',
      'Wichtig für deutsches Excel: Beträge stehen mit Punkt als Dezimaltrennzeichen (z. B. 45.00). Unter „Daten transformieren“ die Betragsspalten mit „Typ ändern → Mit Gebietsschema → Englisch (USA)“ umwandeln, damit Excel sie als Zahlen erkennt.',
      'LibreOffice: Datei öffnen, Zeichensatz UTF-8, Trennzeichen Komma, Sprache „Englisch (USA)“.',
    ],
    limits: ['Die Datei enthält Werte, keine Excel-Formeln – Summen ändern sich nicht automatisch, wenn Sie Werte bearbeiten.', 'Umsatzsteuer ist nicht enthalten.'],
  },
  'b2b-calc-pdf': {
    title: 'Kalkulation als PDF',
    contents: ['Titel', 'Eine Zeile je Position: Bezeichnung – Menge × Einzelpreis = Summe', 'Zwischensumme, Aufschlag und Gesamt', 'Hinweis: alle Beträge netto'],
    steps: ['Datei speichern.', 'Mit jedem PDF-Programm öffnen oder drucken (A4).', 'Zum Weitergeben einfach die Datei versenden.'],
    limits: ['Das PDF ist zum Lesen und Drucken gedacht – zum Weiterrechnen nutzen Sie die CSV-Tabelle.', 'Umsatzsteuer ist nicht enthalten.'],
  },
  'b2b-calc-bundle': {
    title: 'Kalkulationspaket (Tabelle + PDF)',
    contents: ['kalkulation.csv – die Tabelle zum Weiterrechnen', 'kalkulation.pdf – dieselbe Kalkulation druckfertig'],
    steps: ['ZIP-Datei speichern.', 'Rechtsklick → „Alle extrahieren“ (Windows) bzw. Doppelklick (Mac).', 'Für die CSV-Datei gelten die Hinweise zur Tabelle, für das PDF die Hinweise zum PDF.'],
    limits: ['Beide Dateien enthalten dieselben Werte; Umsatzsteuer ist nicht enthalten.'],
  },
};

export function renderHelp(product: string): string | null {
  const h = HELP[product];
  if (!h) return null;
  const list = (xs: string[], ordered = false): string => `<${ordered ? 'ol' : 'ul'}>${xs.map((x) => `<li>${e(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
  return page(`Anleitung: ${h.title} – INFINITY EARN`, `<h1>So nutzen Sie: ${e(h.title)}</h1>
<div class="card"><h2>Was die Datei enthält</h2>${list(h.contents)}</div>
<div class="card"><h2>Schritt für Schritt</h2>${list(h.steps, true)}</div>
<div class="card"><h2>Gut zu wissen</h2>${list(h.limits)}<p class="muted">Fragen? Im <a href="/portal">Kundenportal</a> unter „Frage, Reklamation oder Widerruf“.</p></div>`, { testMode: true, active: 'portal' });
}

/** 118 Vertrauensseite – nur überprüfbare Fakten (dieselben Daten wie /.well-known/infinity-earn.json). */
export function renderTrust(f: TrustFacts): string {
  const yesNo = (b: boolean): string => (b ? 'ja' : 'nein');
  return page('Vertrauen & Fakten – INFINITY EARN', `<h1>Vertrauen &amp; Fakten</h1><p class="lead">Was wir über unser Angebot belegen können – und was noch offen ist. Keine erfundenen Bewertungen, Partner oder Zertifikate.</p>
<div class="grid">
<div class="card"><h3>Anbieter</h3><p>${f.provider.verified ? `${e(f.provider.legal_name ?? '')}<br><span class="muted">${e(f.provider.registration ?? '')}</span>` : '<span class="tag">Noch nicht verifiziert</span>'}</p><p class="muted">${e(f.provider.note)}</p><p class="muted">Freigaben für den Echtbetrieb: ${f.live_approvals.done} von ${f.live_approvals.total}</p></div>
<div class="card"><h3>Bezahlung</h3><p>${e(f.payments.processor)}</p><p class="muted">${e(f.payments.confirmation)} Kartendaten speichern wir nicht.</p></div>
<div class="card"><h3>Qualität und Echtheit</h3><p class="muted">${e(f.quality)}</p><p><a href="${e(f.provenance_check_url)}">Echtheit einer Datei prüfen</a></p></div></div>
<div class="card"><h2>Produkte und Anleitungen</h2>${f.products.length ? `<ul>${f.products.map((p) => `<li><a href="${e(p.help_url)}">${e(p.name)}</a> – ${p.quality_checks} automatische Prüfungen vor jeder Lieferung</li>`).join('')}</ul>` : '<p class="muted">Derzeit keine Produkte freigegeben.</p>'}</div>
<div class="card"><h2>Bewertungen</h2><p>${f.feedback.live_reviews ? `${String(f.feedback.live_average).replace('.', ',')} von 5 Sternen aus ${f.feedback.live_reviews} echten Bewertungen` : e(f.feedback.note)}</p>
${f.feedback.published_comments.length ? `<ul>${f.feedback.published_comments.map((c) => `<li>„${e(c)}“</li>`).join('')}</ul>` : ''}<p class="muted">Bewertungen aus dem Testbetrieb werden hier nie gezeigt.</p></div>
<div class="card"><h2>Rechtliches und Datenschutz</h2><p class="muted">${e(f.legal_texts.status)}</p><ul><li>Datenauskunft selbst im Kundenportal: ${yesNo(f.data_protection.export_self_service)}</li><li>Tracking-Cookies: ${yesNo(f.data_protection.tracking_cookies)}</li></ul>
<p class="muted">Maschinenlesbar für Einkaufssysteme: <a href="/.well-known/infinity-earn.json">/.well-known/infinity-earn.json</a> · Stand ${e(f.generated_at.slice(0, 10))}</p></div>`, { testMode: true });
}

/** 108 Öffentliche Echtheitsprüfung – keine Kunden- oder Auftragsdaten. */
export function renderProvenance(p: ProvenancePassport | null, sha: string): string {
  const form = `<form class="card" method="get" action="/pruefen"><label for="hash">SHA-256-Prüfsumme der Datei</label><input id="hash" type="text" name="hash" maxlength="64" value="${e(sha)}" placeholder="64 Zeichen (0–9, a–f)"><p><button>Prüfen</button></p>
<p class="muted">Die Prüfsumme erhalten Sie z. B. unter Windows mit <span class="mono">certutil -hashfile Datei SHA256</span>.</p></form>`;
  if (!p) {
    return page('Echtheit prüfen – INFINITY EARN', `<h1>Echtheit einer Datei prüfen</h1><p class="lead">Prüfen Sie, ob eine Datei von INFINITY EARN erstellt und geprüft wurde.</p>
${sha ? '<div class="card err" role="alert">Zu dieser Prüfsumme ist keine von INFINITY EARN erstellte Datei bekannt.</div>' : ''}${form}`, { testMode: true });
  }
  const names: Record<string, string> = { 'b2b-calc-csv': 'Kalkulationstabelle (CSV)', 'b2b-calc-pdf': 'Kalkulation als PDF' };
  return page('Herkunftsnachweis – INFINITY EARN', `<h1>Herkunftsnachweis</h1>
<div class="card"><p>${p.complete ? '<span class="tag ok">Vollständig nachgewiesen</span>' : '<span class="tag">Nachweis unvollständig</span>'}${p.testMode ? ' <span class="tag neutral">Testbetrieb</span>' : ''}</p>
<table><caption class="sr-only">Herkunftsnachweis</caption><tbody>
<tr><th scope="row">Produkt</th><td>${e(names[p.product] ?? p.product)}</td></tr><tr><th scope="row">Erzeugt mit</th><td class="mono">${e(p.generator)}</td></tr>
<tr><th scope="row">Erstellt am</th><td>${e(p.createdDay)}</td></tr><tr><th scope="row">Größe</th><td>${p.bytes} Bytes · ${e(p.mediaType)}</td></tr>
<tr><th scope="row">Qualitätsprüfung</th><td>${p.qa ? `${p.qa.passed ? 'bestanden' : 'nicht bestanden'} – ${p.qa.checks.map((c) => `${e(c.check)} ${c.passed ? '✓' : '✗'}`).join(', ')}` : 'kein Protokoll'}</td></tr>
<tr><th scope="row">Rechte</th><td>${p.rights ? `${p.rights.origin === 'own_work' ? 'Eigenarbeit' : e(p.rights.origin)}; fremde Inhalte: ${p.rights.thirdPartyAssets.length ? e(p.rights.thirdPartyAssets.join(', ')) : 'keine'}` : 'nicht angegeben'}</td></tr>
<tr><th scope="row">KI-Werkzeuge</th><td>${p.aiTools.length ? e(p.aiTools.join(', ')) : 'keine – vollständig regelbasiert erzeugt'}</td></tr>
<tr><th scope="row">Prüfsumme</th><td class="mono">${e(p.sha256)}</td></tr></tbody></table>
${p.warnings.length ? `<ul class="err">${p.warnings.map((w) => `<li>${e(w)}</li>`).join('')}</ul>` : ''}</div>${form}`, { testMode: true });
}

export function renderPortal(ctx: AppContext, customer: CustomerRow | undefined, flash?: string): string {
  if (!customer) {
    return page('Kundenportal – INFINITY EARN', `<h1>Kundenportal</h1><div class="card"><p>In diesem Browser ist noch kein Kundenzugang gespeichert.</p><p class="muted">Der Zugang entsteht automatisch, wenn Sie ein Angebot annehmen. Verwenden Sie denselben Browser, um Vertragsbestätigung, Beleg und Datei abzurufen.</p><p><a class="btn" href="/anfrage">Angebot anfordern</a></p></div>`, { testMode: true, active: 'portal' });
  }
  const orders = ctx.db.all<OrderRow & { description: string; pipeline_state: string }>(
    `SELECT o.*, q.description, op.pipeline_state FROM orders o JOIN quotes q ON q.quote_id = o.quote_id JOIN opportunities op ON op.opportunity_id = o.opportunity_id WHERE o.customer_id = ? ORDER BY o.created_at DESC`,
    customer.customer_id,
  );
  const cards = orders.map((o) => {
    const d = getDeliveryByOrder(ctx, o.order_id);
    const pay = paymentLabel(o.payment_state);
    const stage = pipelineLabel(o.pipeline_state);
    const phase = o.fulfillment_state === 'DELIVERED' ? 4 : o.fulfillment_state === 'IN_PRODUCTION' || o.fulfillment_state === 'QUEUED' || o.fulfillment_state === 'QA_PASSED' ? 3 : o.payment_state === 'CONFIRMED' ? 3 : 1;
    const docs: string[] = [];
    if (ctx.db.get('SELECT 1 AS x FROM contract_confirmations WHERE order_id = ?', o.order_id)) docs.push(`<a href="/portal/vertrag/${e(o.order_id)}">${icon('doc', 'sm')}Vertragsbestätigung (PDF)</a>`);
    for (const inv of customerInvoices(ctx, o.order_id)) docs.push(`<a href="/portal/beleg/${e(inv.invoice_id)}">${icon('receipt', 'sm')}${inv.kind === 'CREDIT_NOTE' ? 'Gutschrift' : 'Beleg'} ${e(inv.invoice_number)} (PDF)</a>`);
    let aftercare = '';
    if (o.payment_state === 'UNPAID' || o.payment_state === 'FAILED') {
      aftercare += `<form method="post" action="/portal/zahlung" style="margin-top:14px"><input type="hidden" name="order_id" value="${e(o.order_id)}">
<p class="muted" style="margin:0 0 8px">${o.payment_state === 'FAILED' ? 'Die letzte Zahlung ist nicht zustande gekommen.' : 'Die Zahlung für diesen Auftrag ist noch offen.'} Sie können sie jederzeit hier fortsetzen.</p><button>Zahlung fortsetzen</button></form>`;
    }
    if (d && !d.revoked_at && o.payment_state === 'CONFIRMED') {
      const art = ctx.db.get<{ m: string; sha: string }>('SELECT media_type AS m, sha256 AS sha FROM artifacts WHERE artifact_id = ?', d.artifact_id);
      docs.push(`<a href="/download/${e(issueDownloadToken(ctx, d.delivery_id, customer.customer_id))}">${icon('download', 'sm')}Download: Ihre Kalkulation (${art?.m === 'application/pdf' ? 'PDF' : art?.m === 'application/zip' ? 'ZIP: Tabelle + PDF' : 'CSV'})</a>`);
      if (art) docs.push(`<a href="/pruefen/${e(art.sha)}">${icon('shield', 'sm')}Echtheit der Datei prüfen</a>`);
      const product = ctx.db.get<{ c: string }>('SELECT capability_id AS c FROM opportunities WHERE opportunity_id = ?', o.opportunity_id)?.c ?? '';
      if (HELP[product]) docs.push(`<a href="/hilfe/${e(product)}">${icon('info', 'sm')}Anleitung: So nutzen Sie die Datei</a>`);
      aftercare += renderAftercare(ctx, o.order_id);
    }
    return `<article class="card" aria-labelledby="o-${e(o.order_id)}"><div class="row" style="justify-content:space-between"><h2 id="o-${e(o.order_id)}" style="margin:0">${e(friendlyTitle(o.description))}</h2><strong>${e(money(o.amount_minor, o.currency))}</strong></div>
<p class="muted" style="margin:4px 0 10px">Auftrag <span class="mono">${e(o.order_id)}</span> · ${e(o.created_at.slice(0, 10))}</p>
${progress(phase)}<p><span class="tag ${tone(pay.tone)}">${e(pay.text)}</span> <span class="tag ${tone(stage.tone)}">${e(stage.text)}</span></p>
<h3>Ihre Dokumente</h3>${docs.length ? `<div class="docs">${docs.join('')}</div>` : '<p class="muted">Noch keine Dokumente – sie erscheinen hier automatisch.</p>'}${aftercare}</article>`;
  });
  return page(
    'Kundenportal – INFINITY EARN',
    `<h1>Kundenportal</h1><p class="lead">Alle Ihre Aufträge mit Vertragsbestätigung, Beleg und Datei – ohne Anmeldung in diesem Browser.</p>
${flash ? `<div class="card" role="status">${e(flash)}</div>` : ''}
${cards.join('') || '<div class="card"><p class="muted">Noch keine Aufträge.</p></div>'}
<div class="card"><h2>Ihre Daten</h2><p class="muted">Sie können jederzeit eine Kopie aller gespeicherten Daten abrufen.</p><div class="docs"><a href="/portal/datenexport">${icon('download', 'sm')}Meine Daten exportieren (JSON)</a></div></div>
${orders[0] ? `<form class="card" method="post" action="/portal/support"><h2>Frage, Reklamation oder Widerruf</h2>
<label for="order">Auftrag</label><select id="order" name="order_id">${orders.map((o) => `<option value="${e(o.order_id)}">${e(friendlyTitle(o.description))} · ${e(o.order_id)}</option>`).join('')}</select>
<label for="kind">Anliegen</label><select id="kind" name="kind"><option value="question">Frage</option><option value="complaint">Reklamation</option><option value="withdrawal">Widerruf</option></select>
<label for="msg">Nachricht</label><textarea id="msg" name="message" required maxlength="5000"></textarea><p><button>Senden</button></p>
<p class="muted">Ihre Nachricht geht direkt an uns. Erstattungen werden nach Prüfung über den Zahlungsanbieter ausgeführt.</p></form>` : ''}`,
    { testMode: true, active: 'portal' },
  );
}
