import { newId } from '../../../packages/shared/src/crypto.ts';
import { MANUAL_TEXTS } from '../../../products/mini-ww/manual.ts';
import { tr as wwTr } from '../../../products/mini-ww/ui/i18n.ts';
import { channelStatus } from '../../core-api/src/channels.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { isSellable } from '../../core-api/src/releases.ts';
import { getCapability } from '../../product-factory/src/registry.ts';

/**
 * Sichtbarkeit ohne Werbebudget (Gesamtprompt 15.0, Anlage G):
 *   135/151 Bedarfsseiten für echte Leistungen · 147 Suchabsichten aus echten Anfragen · 148 Ratgeber aus echten
 *   Produktfunktionen · 149 Verbreitung nur über verbundene eigene Kanäle.
 * Keine Doorway-Seiten, keine erfundenen Volumina, Kunden, Bewertungen oder Experten. Veröffentlicht wird nur nach QA.
 */
type Lang = 'de' | 'it' | 'en';
const LANGS: readonly Lang[] = ['de', 'it', 'en'];

// ---------------------------------------------------------------------------------------------------------------
// 147 Suchabsichten
const COMMERCIAL = /\b(kaufen|bestellen|preis|kosten|angebot|software für|programm für|lizenz|acquist|comprare|ordinare|prezzo|costo|preventivo|buy|order|price|pricing|cost|quote|purchase)\b/i;
const COMPARISON = /\b(vergleich|alternative|vs\.?|oder|besser|confronto|alternativa|migliore|compare|comparison|versus|better)\b/i;
const INFORMATIONAL = /\b(was ist|wie|anleitung|erklärung|cos'è|come|guida|what is|how to|how|guide|tutorial)\b/i;

/** Kapazitäts-Schlüsselwörter → Produktart. Nur Produktarten, die es wirklich gibt. */
const CAPABILITY_TERMS: [string, RegExp][] = [
  ['mini-ww', /\b(warenwirtschaft|lager|lagerverwaltung|bestand|inventar|rechnungsprogramm|magazzino|gestionale|giacenz|inventory|stock|warehouse|invoicing software)\b/i],
  ['b2b-calc-bundle', /\b(paket|zip|pacchetto|bundle|package)\b.*\b(kalkulation|calcolo|calculation)\b|\b(kalkulation|calcolo|calculation)\b.*\b(paket|pacchetto|bundle|package)\b/i],
  ['b2b-calc-pdf', /\b(kalkulation|calcolo|preventivo|calculation|quote)\b.*\bpdf\b|\bpdf\b.*\b(kalkulation|calcolo|calculation)\b/i],
  ['b2b-calc-csv', /\b(kalkulation|kalkulieren|aufschlag|calcolo|ricarico|preventivo|calculation|markup|excel|csv|tabelle|tabella|spreadsheet)\b/i],
];

export type IntentClass = 'COMMERCIAL' | 'COMPARISON' | 'INFORMATIONAL' | 'UNKNOWN';

export function classifyIntent(text: string): { intentClass: IntentClass; capability: string | null; mappingState: 'MAPPED' | 'FEASIBILITY_CHECK' | 'REVIEW' } {
  const q = text.toLowerCase();
  const intentClass: IntentClass = COMMERCIAL.test(q) ? 'COMMERCIAL' : COMPARISON.test(q) ? 'COMPARISON' : INFORMATIONAL.test(q) ? 'INFORMATIONAL' : 'UNKNOWN';
  const capability = CAPABILITY_TERMS.find(([, re]) => re.test(q))?.[0] ?? null;
  // Ohne passende echte Leistung: Machbarkeitsprüfung statt falscher Verkaufsseite; ohne Klasse: Prüfung.
  const mappingState = capability && getCapability(capability) ? 'MAPPED' : intentClass === 'UNKNOWN' ? 'REVIEW' : 'FEASIBILITY_CHECK';
  return { intentClass, capability: mappingState === 'MAPPED' ? capability : null, mappingState };
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

/** Übernimmt Anfragen (eigene Formulare, Berater) als Suchabsichten. Kein Personenbezug: nur normalisierter Text ohne E-Mail/Zahlen-Folgen. */
export function ingestIntents(ctx: AppContext): number {
  const rows = ctx.db.all<{ lead_id: string; message: string | null; created_at: string; test_mode: number }>(
    `SELECT lead_id, message, created_at, test_mode FROM leads WHERE source_id = 'src_inbound_form' AND message IS NOT NULL AND erased_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM search_intents s WHERE s.source = 'inquiry' AND s.source_ref = leads.lead_id) LIMIT 500`);
  for (const r of rows) {
    const text = normalize((r.message ?? '').replace(/\S+@\S+/g, ' ').replace(/\d{5,}/g, ' '));
    if (!text) continue;
    const c = classifyIntent(text);
    ctx.db.run(
      `INSERT OR IGNORE INTO search_intents (intent_id, query_norm, intent_class, source, source_ref, observed_at, mapped_capability, mapping_state, test_mode) VALUES (?, ?, ?, 'inquiry', ?, ?, ?, ?, ?)`,
      newId('int'), text.slice(0, 160), c.intentClass, r.lead_id, r.created_at, c.capability, c.mappingState, r.test_mode,
    );
  }
  return rows.length;
}

export function intentClusters(ctx: AppContext, test?: boolean): { capability: string | null; intentClass: IntentClass; count: number; lastSeen: string; examples: string[] }[] {
  const mode = (test ?? ctx.config.testMode) ? 1 : 0;
  const rows = ctx.db.all<{ mapped_capability: string | null; intent_class: IntentClass; query_norm: string; observed_at: string }>('SELECT mapped_capability, intent_class, query_norm, observed_at FROM search_intents WHERE test_mode = ? ORDER BY observed_at DESC', mode);
  const map = new Map<string, { capability: string | null; intentClass: IntentClass; count: number; lastSeen: string; examples: string[] }>();
  for (const r of rows) {
    const k = `${r.mapped_capability ?? '-'}|${r.intent_class}`;
    const c = map.get(k) ?? { capability: r.mapped_capability, intentClass: r.intent_class, count: 0, lastSeen: r.observed_at, examples: [] };
    c.count++;
    if (c.examples.length < 3) c.examples.push(r.query_norm.slice(0, 80));
    map.set(k, c);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------------------------------------------
// 135/151 Bedarfsseiten
export interface LandingDef { slug: string; cluster: string; intent: string; capability: string; productHref: string; text: Record<Lang, { title: string; h1: string; problem: string; points: string[]; cta: string }> }

export const LANDING_DEFS: LandingDef[] = [
  {
    slug: 'lagerverwaltung', cluster: 'warenwirtschaft-klein', intent: 'Kleiner Betrieb sucht einfache Lager- und Rechnungssoftware ohne Abo', capability: 'mini-ww', productHref: '/produkte/warenwirtschaft',
    text: {
      de: { title: 'Lagerverwaltung für kleine Betriebe – ohne Abo, ohne Installation', h1: 'Lager, Angebote und Rechnungen – in einem einfachen Programm.', problem: 'Viele kleine Betriebe führen Bestand und Rechnungen in getrennten Tabellen. Dabei gehen Lieferungen verloren oder werden doppelt berechnet.', points: ['Bestand ergibt sich aus gebuchten Wareneingängen und Lieferungen', 'Rechnungen entstehen aus Lieferungen – nichts doppelt, nichts vergessen', 'Läuft im Browser, ohne Internet, im Design Ihrer Firma', 'Mit bebilderter Bedienungsanleitung'], cta: 'Produkt und Demo ansehen' },
      it: { title: 'Gestione magazzino per piccole imprese – senza abbonamento, senza installazione', h1: 'Magazzino, offerte e fatture – in un unico programma semplice.', problem: 'Molte piccole imprese gestiscono giacenze e fatture in fogli separati. Così le consegne si perdono o vengono fatturate due volte.', points: ['La giacenza risulta da carichi e consegne registrati', 'Le fatture nascono dalle consegne – niente doppioni, niente dimenticanze', 'Funziona nel browser, senza Internet, con il design della vostra azienda', 'Con manuale d’uso illustrato'], cta: 'Vedi prodotto e demo' },
      en: { title: 'Inventory management for small businesses – no subscription, no installation', h1: 'Stock, quotes and invoices – in one simple program.', problem: 'Many small businesses keep stock and invoices in separate spreadsheets, so deliveries get lost or billed twice.', points: ['Stock is derived from booked receipts and deliveries', 'Invoices are created from deliveries – nothing twice, nothing forgotten', 'Runs in the browser, offline, in your company design', 'With an illustrated user manual'], cta: 'See product and demo' },
    },
  },
  {
    slug: 'kalkulation-angebot', cluster: 'kalkulation-b2b', intent: 'Betrieb braucht eine saubere, nachgerechnete Kalkulation als Tabelle oder PDF', capability: 'b2b-calc-csv', productHref: '/anfrage',
    text: {
      de: { title: 'Kalkulation als Excel-Tabelle oder PDF – nachgerechnet', h1: 'Ihre Kalkulation, sauber aufbereitet und nachgerechnet.', problem: 'Positionen sammeln, Aufschlag rechnen, ordentlich für Kunden oder Buchhaltung aufbereiten: Routinearbeit, die trotzdem fehlerfrei sein muss.', points: ['Positionen einfach untereinander schreiben oder aus Excel kopieren', 'Festes Angebot vor der Zahlung', 'Datei automatisch geprüft, mit Herkunftsnachweis', 'Als Tabelle (CSV), PDF oder beides'], cta: 'Angebot anfragen' },
      it: { title: 'Calcolo come tabella Excel o PDF – ricalcolato', h1: 'Il vostro calcolo, ordinato e ricalcolato.', problem: 'Raccogliere le voci, calcolare il ricarico, preparare tutto per clienti o contabilità: lavoro di routine che deve comunque essere senza errori.', points: ['Scrivete le voci una sotto l’altra o copiatele da Excel', 'Offerta a prezzo fisso prima del pagamento', 'File verificato automaticamente, con certificato di origine', 'Come tabella (CSV), PDF o entrambi'], cta: 'Richiedi un’offerta' },
      en: { title: 'Calculation as Excel spreadsheet or PDF – recalculated', h1: 'Your calculation, neatly prepared and recalculated.', problem: 'Collecting line items, calculating the markup and preparing it for customers or accounting is routine work that still has to be error-free.', points: ['Write line items one per line or paste from Excel', 'Fixed quote before payment', 'File checked automatically, with proof of origin', 'As spreadsheet (CSV), PDF or both'], cta: 'Request a quote' },
    },
  },
];

export interface LandingQa { check: string; passed: boolean; detail: string }

/** Inhaltliche QA einer Bedarfsseite – veröffentlicht wird nur, wenn alles besteht. */
export function landingQa(ctx: AppContext, def: LandingDef): LandingQa[] {
  const cap = getCapability(def.capability);
  const all = LANGS.map((l) => def.text[l]);
  const joined = JSON.stringify(def.text);
  const dupes = LANDING_DEFS.filter((d) => d.capability === def.capability && d.slug !== def.slug);
  return [
    { check: 'real_offer', passed: !!cap && isSellable(ctx, def.capability), detail: cap ? (isSellable(ctx, def.capability) ? 'Leistung freigegeben und bestellbar' : 'Leistung noch nicht freigegeben – Seite bleibt unveröffentlicht') : 'Leistung unbekannt' },
    { check: 'no_doorway', passed: dupes.length === 0, detail: dupes.length ? `Gleiche Leistung schon auf ${dupes.map((d) => d.slug).join(', ')}` : 'Eine Seite je Leistung' },
    { check: 'languages', passed: all.every((x) => x.title && x.h1 && x.problem && x.points.length >= 3 && x.cta), detail: 'DE/IT/EN vollständig' },
    { check: 'no_fake_claims', passed: !/(kunden vertrauen|\d+\s*\+?\s*kunden|★|bewertung|garantie|garantiert|clienti soddisfatti|garantit|guarantee|testimonial|award)/i.test(joined), detail: 'Keine Referenzen, Bewertungen oder Garantien' },
    { check: 'length', passed: all.every((x) => x.title.length <= 90 && x.problem.length >= 60), detail: 'Titel ≤ 90 Zeichen, Problem verständlich beschrieben' },
  ];
}

/** Gleicht den Status aller Bedarfsseiten mit dem echten Angebot ab (veröffentlichen, zurückstellen). */
export function syncLandingPages(ctx: AppContext): { slug: string; status: string }[] {
  const now = ctx.clock().toISOString();
  return LANDING_DEFS.map((d) => {
    const qa = landingQa(ctx, d);
    const ok = qa.every((q) => q.passed);
    const prev = ctx.db.get<{ status: string; published_at: string | null }>('SELECT status, published_at FROM landing_pages WHERE slug = ?', d.slug);
    const status = ok ? 'PUBLISHED' : prev?.status === 'PUBLISHED' ? 'UNDER_REVIEW' : 'QA_BLOCKED';
    ctx.db.run(
      `INSERT INTO landing_pages (slug, cluster_id, primary_intent, capability_id, status, qa_json, capability_version, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET status = excluded.status, qa_json = excluded.qa_json, capability_version = excluded.capability_version, published_at = COALESCE(landing_pages.published_at, excluded.published_at), updated_at = excluded.updated_at`,
      d.slug, d.cluster, d.intent, d.capability, status, JSON.stringify(qa), getCapability(d.capability)?.version ?? 0, ok ? now : null, now,
    );
    return { slug: d.slug, status };
  });
}

export function publishedLanding(ctx: AppContext, slug: string): LandingDef | null {
  const def = LANDING_DEFS.find((d) => d.slug === slug);
  if (!def) return null;
  syncLandingPages(ctx);
  return ctx.db.get<{ status: string }>('SELECT status FROM landing_pages WHERE slug = ?', slug)?.status === 'PUBLISHED' ? def : null;
}

export function landingStatus(ctx: AppContext): { slug: string; status: string; capability: string; qa: LandingQa[]; publishedAt: string | null }[] {
  syncLandingPages(ctx);
  return ctx.db.all<{ slug: string; status: string; capability_id: string; qa_json: string; published_at: string | null }>('SELECT slug, status, capability_id, qa_json, published_at FROM landing_pages ORDER BY slug')
    .map((r) => ({ slug: r.slug, status: r.status, capability: r.capability_id, qa: JSON.parse(r.qa_json) as LandingQa[], publishedAt: r.published_at }));
}

// ---------------------------------------------------------------------------------------------------------------
// 148 Ratgeber aus echten Produktfunktionen (Bedienungsanleitung der Mini-Warenwirtschaft).
export interface Article { slug: string; lang: Lang; title: string; intro: string; sections: { h: string; p: string; steps: string[] }[]; capability: string; capabilityVersion: number }

const ART_TITLE: Record<Lang, { title: string; intro: string }> = {
  de: { title: 'Vom Angebot zur bezahlten Rechnung: so funktioniert eine einfache Warenwirtschaft', intro: 'Diese Anleitung beschreibt Schritt für Schritt, wie Angebote, Aufträge, Lieferungen und Rechnungen zusammenhängen – am Beispiel unserer Mini-Warenwirtschaft. Jeder Schritt entspricht einer Funktion, die bei jeder Lieferung automatisch getestet wird.' },
  it: { title: 'Dall’offerta alla fattura pagata: come funziona un gestionale semplice', intro: 'Questa guida descrive passo per passo come offerte, ordini, consegne e fatture sono collegati – con l’esempio del nostro gestionale. Ogni passo corrisponde a una funzione testata automaticamente a ogni consegna.' },
  en: { title: 'From quote to paid invoice: how a simple inventory system works', intro: 'This guide explains step by step how quotes, orders, deliveries and invoices fit together – using our inventory program as the example. Every step corresponds to a function that is tested automatically on every delivery.' },
};
const ARTICLE_CHAPTERS = ['artikel', 'angebote', 'auftraege', 'rechnungen', 'daten'];
export const ARTICLE_SLUG = 'angebot-bis-rechnung';

const labels = (lang: Lang, s: string): string => s.replace(/\[\[([^\]]+)\]\]/g, (_m, k: string) => `„${wwTr(lang, k)}“`);

export function buildArticle(lang: Lang): Article {
  const chapters = MANUAL_TEXTS[lang].chapters.filter((c) => ARTICLE_CHAPTERS.includes(c.id));
  return {
    slug: ARTICLE_SLUG, lang, title: ART_TITLE[lang].title, intro: ART_TITLE[lang].intro, capability: 'mini-ww', capabilityVersion: getCapability('mini-ww')?.version ?? 0,
    sections: chapters.map((c) => ({ h: c.title, p: labels(lang, c.intro), steps: (c.steps ?? c.bullets ?? []).map((x) => labels(lang, x)) })),
  };
}

/** Redaktionelle Prüfung: echte, getestete Funktion · keine erfundenen Berichte · eigenständiger Nutzen · aktuell. */
export function reviewArticle(a: Article): LandingQa[] {
  const text = JSON.stringify(a);
  const cap = getCapability(a.capability);
  return [
    { check: 'real_function', passed: !!cap && a.sections.length === ARTICLE_CHAPTERS.length, detail: `${a.sections.length} Kapitel aus der Anleitung des gelieferten Programms` },
    { check: 'no_fabrication', passed: !/(kunde [A-ZÄÖÜ][a-zäöü]+ sagt|unsere kunden|testimonial|erfahrungsbericht|ha detto|our customers say|\d+\s*%\s*(mehr|weniger|more|less|in più))/i.test(text), detail: 'Keine erfundenen Kundenberichte oder Prozentversprechen' },
    { check: 'useful', passed: a.sections.reduce((s, x) => s + x.steps.length, 0) >= 8, detail: 'Konkrete Arbeitsschritte statt Werbetext' },
    { check: 'current', passed: !!cap && a.capabilityVersion === cap.version, detail: `Programmversion ${a.capabilityVersion}` },
  ];
}

export function syncContent(ctx: AppContext): { lang: Lang; status: string }[] {
  const now = ctx.clock().toISOString();
  return LANGS.map((lang) => {
    const a = buildArticle(lang);
    const review = reviewArticle(a);
    const prev = ctx.db.get<{ capability_version: number; status: string }>('SELECT capability_version, status FROM content_pages WHERE slug = ? AND lang = ?', a.slug, lang);
    const cap = getCapability(a.capability);
    // Produktänderung → bestehender Artikel wird zur Wiedervorlage markiert, bevor er neu geprüft veröffentlicht wird.
    if (prev && cap && prev.capability_version !== cap.version && prev.status === 'PUBLISHED') {
      ctx.db.run(`UPDATE content_pages SET status = 'NEEDS_REVIEW', updated_at = ? WHERE slug = ? AND lang = ?`, now, a.slug, lang);
    }
    const status = review.every((r) => r.passed) ? 'PUBLISHED' : 'REVIEW_BLOCKED';
    ctx.db.run(
      `INSERT INTO content_pages (slug, lang, capability_id, capability_version, title, body_json, status, review_json, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug, lang) DO UPDATE SET capability_version = excluded.capability_version, title = excluded.title, body_json = excluded.body_json, status = excluded.status, review_json = excluded.review_json,
       published_at = CASE WHEN excluded.status = 'PUBLISHED' THEN COALESCE(content_pages.published_at, excluded.published_at) ELSE content_pages.published_at END, updated_at = excluded.updated_at`,
      a.slug, lang, a.capability, a.capabilityVersion, a.title, JSON.stringify(a), status, JSON.stringify(review), status === 'PUBLISHED' ? now : null, now,
    );
    return { lang, status };
  });
}

export function publishedArticle(ctx: AppContext, slug: string, lang: Lang): Article | null {
  syncContent(ctx);
  const r = ctx.db.get<{ body_json: string; status: string }>('SELECT body_json, status FROM content_pages WHERE slug = ? AND lang = ?', slug, lang);
  return r && r.status === 'PUBLISHED' ? (JSON.parse(r.body_json) as Article) : null;
}

export function contentStatus(ctx: AppContext): { slug: string; lang: string; status: string; review: LandingQa[]; publishedAt: string | null }[] {
  syncContent(ctx);
  return ctx.db.all<{ slug: string; lang: string; status: string; review_json: string; published_at: string | null }>('SELECT slug, lang, status, review_json, published_at FROM content_pages ORDER BY slug, lang')
    .map((r) => ({ slug: r.slug, lang: r.lang, status: r.status, review: JSON.parse(r.review_json) as LandingQa[], publishedAt: r.published_at }));
}

// ---------------------------------------------------------------------------------------------------------------
// 149 Verbreitung über eigene Kanäle
export const DISTRIBUTION_CHANNELS = [
  { id: 'linkedin', name: 'LinkedIn-Unternehmensseite' }, { id: 'instagram', name: 'Instagram' }, { id: 'youtube', name: 'YouTube' }, { id: 'newsletter', name: 'Newsletter (mit Einwilligung)' },
] as const;

/** Kampagnenlink ohne personenbezogene Daten: nur Kanal und Inhalt. */
export function campaignLink(origin: string, path: string, channel: string, slug: string): string {
  return `${origin}${path}?src=${encodeURIComponent(channel === 'newsletter' ? 'newsletter' : 'social')}&cmp=${encodeURIComponent(`${channel}-${slug}`.slice(0, 40))}`;
}

/** Plant Beiträge. Ohne verbundenen Adapter: NOT_CONNECTED (nichts wird veröffentlicht). Direktnachrichten sind nie erlaubt. */
export function planDistribution(ctx: AppContext, origin: string, contentSlug: string, kind: 'post' | 'dm' = 'post'): { channel: string; status: string; reason: string; link: string }[] {
  const connected = new Set(channelStatus(ctx).filter((c) => c.state === 'CONNECTED').map((c) => c.id));
  return DISTRIBUTION_CHANNELS.map((ch) => {
    const link = campaignLink(origin, contentSlug === ARTICLE_SLUG ? `/ratgeber/${ARTICLE_SLUG}` : `/loesungen/${contentSlug}`, ch.id, contentSlug);
    const status = kind === 'dm' ? 'BLOCKED' : connected.has(ch.id) ? 'PLANNED' : 'NOT_CONNECTED';
    const reason = kind === 'dm' ? 'Automatisierte Direktnachrichten sind nicht erlaubt (kein Spam, Plattformregeln)' : status === 'NOT_CONNECTED' ? 'Kanal nicht verbunden – der Eigentümer verbindet ihn mit eigenem Konto und erlaubter Schnittstelle' : 'Bereit zur Veröffentlichung über den verbundenen Kanal';
    const key = `${ch.id}:${contentSlug}:${kind}`;
    ctx.db.run(
      `INSERT INTO distribution_posts (post_id, channel, content_slug, link_url, status, reason, publish_receipt, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(idempotency_key) DO UPDATE SET status = CASE WHEN distribution_posts.status = 'PUBLISHED' THEN distribution_posts.status ELSE excluded.status END, reason = excluded.reason`,
      newId('pst'), ch.id, contentSlug, link, status, reason, key, ctx.clock().toISOString(),
    );
    return { channel: ch.id, status, reason, link };
  });
}

/** Veröffentlichung braucht eine Quittung des Kanals; ohne Adapter gibt es keine – daher hier nur die Sperre. */
export function markPublished(ctx: AppContext, postId: string, receipt: string | null): void {
  if (!receipt) throw new WorkflowError('PUBLISH_RECEIPT_MISSING', 'Ohne Quittung des Kanals gilt nichts als veröffentlicht.');
  ctx.db.run(`UPDATE distribution_posts SET status = 'PUBLISHED', publish_receipt = ? WHERE post_id = ? AND status = 'PLANNED'`, receipt, postId);
}

export function distributionStatus(ctx: AppContext): { channel: string; content: string; status: string; reason: string | null; link: string }[] {
  return ctx.db.all<{ channel: string; content_slug: string; status: string; reason: string | null; link_url: string }>('SELECT channel, content_slug, status, reason, link_url FROM distribution_posts ORDER BY created_at DESC LIMIT 50')
    .map((r) => ({ channel: r.channel, content: r.content_slug, status: r.status, reason: r.reason, link: r.link_url }));
}
