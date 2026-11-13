import { formatMinor } from '../../../packages/contracts/src/money.ts';
import { getStandard } from '../../../services/product-factory/src/quality-standard.ts';
import { icon } from '../../console/src/icons.ts';
import { e, page } from '../../shared/layout.ts';
import type { Lang } from './home-i18n.ts';
import { frame } from './i18n-pages.ts';

/**
 * Produktseite der Mini-Warenwirtschaft (P4, 151/152): echte Screenshots des gebauten Programms, interaktive Demo mit
 * Beispieldaten, Leistungsumfang aus der Standard-Akte, Festpreis und Bestellformular – Bestellung nur, wenn der
 * Eigentümer das Produkt freigegeben hat. Sonst ehrlicher Hinweis und Weg zur allgemeinen Anfrage (keine toten Knöpfe).
 */
export const WW_SLUG = '/produkte/warenwirtschaft';
export const WW_SHOTS = ['uebersicht', 'artikel', 'angebote', 'rechnungen', 'beleg', 'berichte'] as const;

const SHOT_LABEL: Record<Lang, Record<(typeof WW_SHOTS)[number], string>> = {
  de: { uebersicht: 'Übersicht mit Umsatz und offenen Posten', artikel: 'Artikel und Lagerbestand', angebote: 'Angebote', rechnungen: 'Rechnungen und Zahlungen', beleg: 'Druckansicht einer Rechnung', berichte: 'Berichte' },
  it: { uebersicht: 'Panoramica con fatturato e partite aperte', artikel: 'Articoli e giacenze', angebote: 'Offerte', rechnungen: 'Fatture e pagamenti', beleg: 'Stampa di una fattura', berichte: 'Report' },
  en: { uebersicht: 'Overview with revenue and open items', artikel: 'Items and stock', angebote: 'Quotes', rechnungen: 'Invoices and payments', beleg: 'Invoice print view', berichte: 'Reports' },
};

export interface WwOffer { sellable: boolean; priceMinor: number | null; currency: string }
export type WwValues = Partial<Record<'name' | 'email' | 'company' | 'country' | 'brand_company' | 'primary' | 'language' | 'tax' | 'term' | 'message' | 'marketing', string>>;

export const TAX_PRESETS: Record<string, { label: Record<Lang, string>; rates: { id: string; label: string; bps: number }[] }> = {
  IT: { label: { de: 'Italien (22 / 10 / 4 / 0 %)', it: 'Italia (22 / 10 / 4 / 0 %)', en: 'Italy (22 / 10 / 4 / 0 %)' }, rates: [{ id: 'std', label: 'IVA 22 %', bps: 2200 }, { id: 'red', label: 'IVA 10 %', bps: 1000 }, { id: 'min', label: 'IVA 4 %', bps: 400 }, { id: 'zero', label: '0 %', bps: 0 }] },
  DE: { label: { de: 'Deutschland (19 / 7 / 0 %)', it: 'Germania (19 / 7 / 0 %)', en: 'Germany (19 / 7 / 0 %)' }, rates: [{ id: 'std', label: 'USt 19 %', bps: 1900 }, { id: 'red', label: 'USt 7 %', bps: 700 }, { id: 'zero', label: '0 %', bps: 0 }] },
  AT: { label: { de: 'Österreich (20 / 13 / 10 / 0 %)', it: 'Austria (20 / 13 / 10 / 0 %)', en: 'Austria (20 / 13 / 10 / 0 %)' }, rates: [{ id: 'std', label: 'USt 20 %', bps: 2000 }, { id: 'mid', label: 'USt 13 %', bps: 1300 }, { id: 'red', label: 'USt 10 %', bps: 1000 }, { id: 'zero', label: '0 %', bps: 0 }] },
};

const T = {
  de: {
    title: 'Warenwirtschaft für kleine Betriebe – INFINITY EARN', eyebrow: 'Fachsoftware', h1: 'Ihre eigene Warenwirtschaft.', h1b: 'Im Design Ihrer Firma.',
    lead: 'Artikel, Lager, Kunden, Angebote, Aufträge, Lieferscheine, Rechnungen und Zahlungen – als Programm, das ohne Installation und ohne Internet im Browser läuft. Mit bebilderter Bedienungsanleitung.',
    demo: 'Demo ausprobieren', order: 'Jetzt bestellen', notYet: 'Noch nicht bestellbar', notYetText: 'Dieses Produkt ist fertig gebaut und geprüft, die Verkaufsfreigabe durch den Inhaber steht aber noch aus. Sie können die Demo schon ausprobieren oder uns Ihren Bedarf schreiben.',
    ask: 'Bedarf beschreiben', price: 'Festpreis', priceNote: 'Einmalig, inklusive Anpassung an Ihr Design und Bedienungsanleitung. Steuer wird im Testbetrieb noch nicht berechnet.',
    shotsH: 'So sieht das Programm aus', shotsSub: 'Echte Bildschirmfotos des gebauten Programms mit Beispieldaten – keine Entwürfe. Es sind Bilder; ausprobieren können Sie es in der Demo.',
    featH: 'Was Sie bekommen', featSub: 'Jede Zusage wird bei jeder Lieferung automatisch geprüft. Fällt eine Prüfung durch, wird nicht geliefert und der Betrag erstattet.',
    limitsH: 'Ehrliche Grenzen', limits: ['Die Daten liegen im Browser des Computers, auf dem Sie das Programm öffnen – regelmäßig eine Sicherung herunterladen.', 'Kein Mehrplatz-Server und keine Synchronisation zwischen Geräten.', 'Keine elektronische Rechnungsübermittlung (z. B. SdI/XRechnung).', 'Rechnungen und Steuersätze vor der Verwendung von Ihrer Steuerberatung prüfen lassen.'],
    formH: 'Bestellung', formSub: 'Sie erhalten sofort ein verbindliches Angebot. Bezahlt wird erst nach Ihrer Annahme – gearbeitet erst nach bestätigter Zahlung.',
    name: 'Ihr Name', email: 'E-Mail', company: 'Firma (Rechnung)', country: 'Land (ISO, z. B. IT)', brand: 'Firmenname im Programm', color: 'Ihre Firmenfarbe', lang: 'Sprache des Programms', tax: 'Steuersätze', term: 'Zahlungsziel Ihrer Rechnungen (Tage)', msg: 'Hinweise (optional)',
    privacy: 'Ich habe den Datenschutzhinweis gelesen: Meine Angaben werden nur zur Bearbeitung dieser Bestellung verwendet.', marketing: 'Ich möchte gelegentlich Neuigkeiten per E-Mail erhalten (jederzeit abbestellbar).', submit: 'Angebot erhalten',
    errH: 'Bitte prüfen Sie Ihre Angaben', colorHint: 'Zu helle Farben werden automatisch so abgedunkelt, dass Schrift auf Knöpfen gut lesbar bleibt (WCAG AA).',
    langs: { de: 'Deutsch', it: 'Italienisch', en: 'Englisch' }, sample: 'Beispiel: Anleitung als PDF ansehen',
  },
  it: {
    title: 'Gestione magazzino per piccole imprese – INFINITY EARN', eyebrow: 'Software gestionale', h1: 'Il vostro gestionale.', h1b: 'Con il design della vostra azienda.',
    lead: 'Articoli, magazzino, clienti, offerte, ordini, DDT, fatture e pagamenti – un programma che funziona nel browser senza installazione e senza Internet. Con manuale d’uso illustrato.',
    demo: 'Prova la demo', order: 'Ordina ora', notYet: 'Non ancora ordinabile', notYetText: 'Il prodotto è pronto e verificato, ma manca ancora l’autorizzazione alla vendita da parte del titolare. Potete già provare la demo o descriverci la vostra esigenza.',
    ask: 'Descrivi l’esigenza', price: 'Prezzo fisso', priceNote: 'Una tantum, incluso adattamento al vostro design e manuale d’uso. In modalità test l’IVA non viene ancora calcolata.',
    shotsH: 'Ecco il programma', shotsSub: 'Schermate reali del programma con dati di esempio – non bozze. Sono immagini; potete provarlo nella demo.',
    featH: 'Cosa ricevete', featSub: 'Ogni promessa viene verificata automaticamente a ogni consegna. Se un controllo fallisce, non consegniamo e rimborsiamo.',
    limitsH: 'Limiti dichiarati', limits: ['I dati restano nel browser del computer su cui aprite il programma – scaricate regolarmente un backup.', 'Nessun server multiutente e nessuna sincronizzazione tra dispositivi.', 'Nessuna trasmissione elettronica delle fatture (es. SdI).', 'Fate verificare fatture e aliquote dal vostro commercialista prima dell’uso.'],
    formH: 'Ordine', formSub: 'Ricevete subito un’offerta vincolante. Pagate solo dopo l’accettazione – lavoriamo solo dopo il pagamento confermato.',
    name: 'Il vostro nome', email: 'E-mail', company: 'Azienda (fattura)', country: 'Paese (ISO, es. IT)', brand: 'Nome azienda nel programma', color: 'Colore aziendale', lang: 'Lingua del programma', tax: 'Aliquote IVA', term: 'Termine di pagamento delle vostre fatture (giorni)', msg: 'Note (facoltative)',
    privacy: 'Ho letto l’informativa privacy: i miei dati sono usati solo per gestire questo ordine.', marketing: 'Desidero ricevere occasionalmente novità via e-mail (disiscrizione in ogni momento).', submit: 'Ricevi l’offerta',
    errH: 'Controllate i dati inseriti', colorHint: 'I colori troppo chiari vengono scuriti automaticamente per mantenere leggibile il testo sui pulsanti (WCAG AA).',
    langs: { de: 'Tedesco', it: 'Italiano', en: 'Inglese' }, sample: 'Esempio: vedi il manuale in PDF',
  },
  en: {
    title: 'Inventory management for small businesses – INFINITY EARN', eyebrow: 'Business software', h1: 'Your own inventory system.', h1b: 'In your company’s design.',
    lead: 'Items, stock, customers, quotes, orders, delivery notes, invoices and payments – a program that runs in the browser without installation and without internet. With an illustrated user manual.',
    demo: 'Try the demo', order: 'Order now', notYet: 'Not yet available to order', notYetText: 'This product is built and verified, but the owner’s release for sale is still pending. You can already try the demo or describe your needs.',
    ask: 'Describe your needs', price: 'Fixed price', priceNote: 'One-off, including adaptation to your design and user manual. Tax is not yet calculated in test mode.',
    shotsH: 'What the program looks like', shotsSub: 'Real screenshots of the built program with sample data – not mock-ups. These are images; try it for real in the demo.',
    featH: 'What you get', featSub: 'Every promise is checked automatically on every delivery. If a check fails, we do not deliver and refund the amount.',
    limitsH: 'Honest limits', limits: ['Data is stored in the browser of the computer where you open the program – download a backup regularly.', 'No multi-user server and no sync between devices.', 'No electronic invoice transmission (e.g. SdI).', 'Have invoices and tax rates checked by your tax adviser before use.'],
    formH: 'Order', formSub: 'You receive a binding quote immediately. You pay only after accepting – we start only after confirmed payment.',
    name: 'Your name', email: 'Email', company: 'Company (invoice)', country: 'Country (ISO, e.g. IT)', brand: 'Company name in the program', color: 'Your brand colour', lang: 'Program language', tax: 'Tax rates', term: 'Payment term of your invoices (days)', msg: 'Notes (optional)',
    privacy: 'I have read the privacy notice: my details are used only to process this order.', marketing: 'I would like to receive occasional news by email (unsubscribe at any time).', submit: 'Get quote',
    errH: 'Please check your details', colorHint: 'Colours that are too light are darkened automatically so button text stays readable (WCAG AA).',
    langs: { de: 'German', it: 'Italian', en: 'English' }, sample: 'Example: view the manual as PDF',
  },
} as const;

const FEATURE_TEXT: Record<Lang, Record<string, string>> = {
  de: {},
  it: {
    domain_selftest: 'Il flusso completo offerta → ordine → consegna → fattura → pagamento viene eseguito e ricalcolato con la vostra configurazione',
    ui_actions: 'Nessun pulsante senza funzione, ogni campo con etichetta',
    branding: 'Nome, colore e lingua della vostra azienda, contrasto leggibile',
    no_network: 'Nessun accesso a Internet: i dati non lasciano il computer',
    manual_pdf: 'Manuale d’uso illustrato con schermate reali',
    program_integrity: 'Il codice consegnato è esattamente la versione testata',
  },
  en: {
    domain_selftest: 'The full quote → order → delivery → invoice → payment flow is run and recalculated with your setup',
    ui_actions: 'No button without a function, every field labelled',
    branding: 'Your company name, colour and language, readable contrast',
    no_network: 'No internet access: data never leaves the computer',
    manual_pdf: 'Illustrated user manual with real screenshots',
    program_integrity: 'The delivered code is exactly the tested version',
  },
};

const money = (minor: number, currency: string): string => `${formatMinor(minor, currency).replace('.', ',')} ${currency === 'EUR' ? '€' : currency}`;

const CSS = `
.pp-hero{background:linear-gradient(160deg,#03161B,#0A2B31);color:#E8F4F2;border-radius:24px;padding:clamp(28px,5vw,56px);margin:8px 0 24px}
.pp-hero .eb{letter-spacing:3px;text-transform:uppercase;font-weight:700;font-size:13px;color:#7FE9DD}.pp-hero h1{color:#fff;font-size:clamp(30px,4.4vw,54px);line-height:1.08;margin:14px 0}
.pp-hero h1 span{display:block;color:#3FF0DC}.pp-hero p{color:#D5E7E4;max-width:760px;font-size:18px}
.pp-hero .btn{min-height:52px;font-size:17px;font-weight:700;background:linear-gradient(180deg,#0FA596,#0A7D74);border-color:#3FE6D4}.pp-hero .btn.secondary{background:transparent;color:#fff;border-color:rgba(255,255,255,.8)}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px}.shots figure{margin:0;background:#fff;border:1px solid var(--border);border-radius:14px;overflow:hidden}
.shots img{display:block;width:100%;height:auto}.shots figcaption{padding:8px 12px;font-size:13px;color:var(--muted)}
.feat{list-style:none;padding:0;margin:0;display:grid;gap:10px}.feat li{display:flex;gap:10px;align-items:flex-start}.feat .ico{color:var(--accent);margin-top:3px}
.pricebox .price{font-size:40px}
`;

export function renderWwProduct(lang: Lang, offer: WwOffer, opts: { errors?: string[]; values?: WwValues; shotSrc: (lang: Lang, name: string) => string; src?: string } = { shotSrc: () => '' }): string {
  const t = T[lang];
  const v = opts.values ?? {};
  const std = getStandard('mini-ww');
  const feats = (std?.features ?? []).filter((f) => f.verifiedBy !== 'checksum' && f.verifiedBy !== 'readme' && f.verifiedBy !== 'zip_structure');
  const featText = (f: { text: string; verifiedBy: string }): string => (lang === 'de' ? f.text : FEATURE_TEXT[lang][f.verifiedBy] ?? f.text);
  const q = lang === 'de' ? '' : `?lang=${lang}`;
  const sel = (name: string, cur: string | undefined, options: [string, string][]): string => options.map(([val, label]) => `<option value="${e(val)}"${(cur ?? '') === val ? ' selected' : ''}>${e(label)}</option>`).join('');
  const orderForm = offer.sellable && offer.priceMinor
    ? `<form class="card" id="bestellen" method="post" action="${WW_SLUG}/bestellen${q}"><h2>${t.formH}</h2><p class="muted">${t.formSub}</p>
${opts.errors?.length ? `<div class="card err" role="alert"><strong>${t.errH}</strong><ul>${opts.errors.map((x) => `<li>${e(x)}</li>`).join('')}</ul></div>` : ''}
<div class="grid">
<div><label for="w-name">${t.name}</label><input id="w-name" type="text" name="name" required maxlength="200" autocomplete="name" value="${e(v.name ?? '')}"></div>
<div><label for="w-email">${t.email}</label><input id="w-email" type="email" name="email" required maxlength="254" autocomplete="email" value="${e(v.email ?? '')}"></div>
<div><label for="w-company">${t.company}</label><input id="w-company" type="text" name="company" required maxlength="200" autocomplete="organization" value="${e(v.company ?? '')}"></div>
<div><label for="w-country">${t.country}</label><input id="w-country" type="text" name="country" required maxlength="2" value="${e(v.country ?? (lang === 'it' ? 'IT' : lang === 'en' ? 'GB' : 'DE'))}"></div>
<div><label for="w-brand">${t.brand}</label><input id="w-brand" type="text" name="brand_company" required maxlength="80" value="${e(v.brand_company ?? '')}"></div>
<div><label for="w-color">${t.color}</label><input id="w-color" type="color" name="primary" value="${e(/^#[0-9a-f]{6}$/i.test(v.primary ?? '') ? (v.primary as string) : '#1F5FA8')}" style="width:100%;min-height:46px"><span class="muted" style="font-size:13px">${t.colorHint}</span></div>
<div><label for="w-lang">${t.lang}</label><select id="w-lang" name="language">${sel('language', v.language ?? lang, [['de', t.langs.de], ['it', t.langs.it], ['en', t.langs.en]])}</select></div>
<div><label for="w-tax">${t.tax}</label><select id="w-tax" name="tax">${sel('tax', v.tax ?? (lang === 'de' ? 'DE' : 'IT'), Object.entries(TAX_PRESETS).map(([k, p]) => [k, p.label[lang]]))}</select></div>
<div><label for="w-term">${t.term}</label><input id="w-term" type="text" inputmode="numeric" name="term" required maxlength="3" value="${e(v.term ?? '14')}"></div>
</div>
<label for="w-msg">${t.msg}</label><textarea id="w-msg" name="message" maxlength="2000">${e(v.message ?? '')}</textarea>
<label><input type="checkbox" name="privacy" value="1" required> ${t.privacy}</label>
<label><input type="checkbox" name="marketing" value="1"${v.marketing === '1' ? ' checked' : ''}> ${t.marketing}</label>
${opts.src ? `<input type="hidden" name="src" value="${e(opts.src)}">` : ''}
<p><button>${t.submit} ${icon('arrow', 'sm')}</button></p></form>`
    : `<div class="card" id="bestellen"><h2>${t.notYet}</h2><p>${t.notYetText}</p><p class="row"><a class="btn" href="/demo/warenwirtschaft${q}">${t.demo}</a><a class="btn secondary" href="/berater${q}">${t.ask}</a></p></div>`;
  const body = `<section class="pp-hero" aria-labelledby="pp-h"><div class="eb">${t.eyebrow}</div><h1 id="pp-h">${t.h1}<span>${t.h1b}</span></h1><p>${t.lead}</p>
<p class="row"><a class="btn" href="/demo/warenwirtschaft${q}">${icon('arrow', 'sm')} ${t.demo}</a><a class="btn secondary" href="#bestellen">${offer.sellable ? t.order : t.notYet}</a></p></section>
<div class="grid">
<div class="card pricebox"><div class="muted">${t.price}</div>${offer.sellable && offer.priceMinor ? `<div class="price">${e(money(offer.priceMinor, offer.currency))}</div><p class="muted">${t.priceNote}</p>` : `<div class="price" style="font-size:24px">${t.notYet}</div>`}</div>
<div class="card"><h3>${t.limitsH}</h3><ul>${t.limits.map((l) => `<li>${l}</li>`).join('')}</ul></div>
</div>
<section class="card"><h2 style="margin-top:0">${t.featH}</h2><p class="muted">${t.featSub}</p><ul class="feat">${feats.map((f) => `<li>${icon('checkCircle')}<span>${e(featText(f))}</span></li>`).join('')}</ul></section>
<section><h2>${t.shotsH}</h2><p class="muted">${t.shotsSub}</p><div class="shots">${WW_SHOTS.map((s) => `<figure><img src="${e(opts.shotSrc(lang, s))}" alt="${e(`${t.shotsH}: ${SHOT_LABEL[lang][s]}`)}" loading="lazy" width="1100" height="720"><figcaption>${e(SHOT_LABEL[lang][s])}</figcaption></figure>`).join('')}</div></section>
${orderForm}`;
  return page(t.title, body, { testMode: true, extraCss: CSS, description: t.lead, ...frame(lang) });
}

export const WW_TEXTS = T;

// --- 135/151 Bedarfsseite und 148 Ratgeber -------------------------------------------------------------------
interface LandingView { slug: string; productHref: string; text: { title: string; h1: string; problem: string; points: string[]; cta: string } }
interface ArticleView { slug: string; title: string; intro: string; sections: { h: string; p: string; steps: string[] }[] }

const MORE: Record<Lang, { article: string; productLink: string; demo: string; ask: string; noFit: string }> = {
  de: { article: 'Ratgeber', productLink: 'Zum Produkt', demo: 'Demo ausprobieren', ask: 'Eigenen Bedarf beschreiben', noFit: 'Passt nicht ganz? Beschreiben Sie Ihren Bedarf – wir sagen ehrlich, ob wir es liefern können.' },
  it: { article: 'Guida', productLink: 'Vai al prodotto', demo: 'Prova la demo', ask: 'Descrivi la tua esigenza', noFit: 'Non è proprio quello che cercate? Descriveteci l’esigenza – vi diremo onestamente se possiamo fornirla.' },
  en: { article: 'Guide', productLink: 'Go to product', demo: 'Try the demo', ask: 'Describe your needs', noFit: 'Not quite right? Describe your needs – we will tell you honestly whether we can deliver.' },
};

const altLinks = (origin: string, path: string): { lang: string; href: string }[] =>
  origin ? [...(['de', 'it', 'en'] as const).map((l) => ({ lang: l, href: `${origin}${path}${l === 'de' ? '' : `?lang=${l}`}` })), { lang: 'x-default', href: `${origin}${path}` }] : [];

export function renderLanding(lang: Lang, l: LandingView, origin = ''): string {
  const m = MORE[lang];
  const q = lang === 'de' ? '' : `?lang=${lang}`;
  const path = `/loesungen/${l.slug}`;
  const sep = l.productHref.includes('?') ? '&' : '?';
  const body = `<section class="pp-hero" aria-labelledby="lp-h"><h1 id="lp-h">${e(l.text.h1)}</h1><p>${e(l.text.problem)}</p>
<p class="row"><a class="btn" href="${e(l.productHref)}${lang === 'de' ? `${sep}src=landing` : `${sep}lang=${lang}&src=landing`}">${icon('arrow', 'sm')} ${e(l.text.cta)}</a>${l.slug === 'lagerverwaltung' ? `<a class="btn secondary" href="/demo/warenwirtschaft${q}">${m.demo}</a>` : ''}</p></section>
<section class="card"><ul class="feat">${l.text.points.map((p) => `<li>${icon('checkCircle')}<span>${e(p)}</span></li>`).join('')}</ul></section>
<p class="muted">${m.noFit} <a href="/berater${q}">${m.ask}</a></p>`;
  return page(l.text.title, body, { testMode: true, extraCss: CSS, description: l.text.problem, canonical: origin ? `${origin}${path}${q}` : undefined, alternates: altLinks(origin, path), ...frame(lang) });
}

export function renderArticle(lang: Lang, a: ArticleView, origin = ''): string {
  const m = MORE[lang];
  const q = lang === 'de' ? '' : `?lang=${lang}`;
  const path = `/ratgeber/${a.slug}`;
  const body = `<article><p class="muted">${m.article}</p><h1>${e(a.title)}</h1><p class="lead">${e(a.intro)}</p>
${a.sections.map((s, i) => `<section class="card"><h2 style="margin-top:0">${i + 1}. ${e(s.h)}</h2><p>${e(s.p)}</p>${s.steps.length ? `<ol>${s.steps.map((x) => `<li>${e(x)}</li>`).join('')}</ol>` : ''}</section>`).join('')}
<p class="row"><a class="btn" href="${WW_SLUG}${q ? `${q}&` : '?'}src=content">${m.productLink}</a><a class="btn secondary" href="/demo/warenwirtschaft${q}">${m.demo}</a></p></article>`;
  return page(a.title, body, { testMode: true, extraCss: CSS, description: a.intro.slice(0, 160), canonical: origin ? `${origin}${path}${q}` : undefined, alternates: altLinks(origin, path), ...frame(lang) });
}
