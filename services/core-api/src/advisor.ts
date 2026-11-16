/**
 * Produktberater: versteht einen Wunsch in eigenen Worten (DE/IT/EN) und macht daraus eine vorausgefüllte Anfrage.
 * Regelbasiert und nachvollziehbar – keine kostenpflichtige KI-API. Er erfindet nichts: Was er nicht sicher erkennt,
 * fragt er nach. Wünsche außerhalb der lieferbaren Produkte werden ehrlich als „derzeit nicht lieferbar“ beantwortet.
 *
 * Grundsatz seit der Tiefenprüfung vom 16.11.2026: lieber nachfragen als falsch zuordnen. Eine Position entsteht nur,
 * wenn in einem Satzteil genau eine Menge und genau ein Preis eindeutig erkennbar sind. Stehen mehrere Positionen in
 * einem Satz, werden sie getrennt; was mehrdeutig bleibt, wird dem Kunden wörtlich zur Prüfung genannt.
 */
export interface AdvisorResult {
  items: string[];
  marginPct: number | null;
  format: string | null;
  title: string;
  understood: string[];
  questions: string[];
  outOfScope: string | null;
}

const NUM = String.raw`(\d+(?:[.,]\d{1,2})?)`;
const CUR = String.raw`\s*(?:€|eur|euro)?`;
const UNIT_WORDS = String.raw`m²|m2|qm|mq|h|std\.?|stunden?|ore|ora|hours?|stk\.?|stück|pz|pcs|pieces?|pezzi|pezzo|tage?|giorni|giorno|days?|rollen?|meter|metri|kg|liter|litri|x|×`;
const UNIT = String.raw`(?:${UNIT_WORDS})?`;
const PER = String.raw`(?:à|a|@|je|zu|per|for|x|×|:)`;

const PATTERNS: { re: RegExp; map: (m: RegExpMatchArray) => [string, string, string] }[] = [
  // „Montage;2;45,00“ / Tabulator / |
  { re: /^([^;\t|]+)[;\t|]\s*(\d+)\s*[;\t|]\s*([\d.,]+)\s*(?:€|eur)?$/i, map: (m) => [m[1] ?? '', m[2] ?? '', m[3] ?? ''] },
  // „2 x Montage à 45 €“
  { re: new RegExp(String.raw`^(\d+)\s*${UNIT}\s+(.+?)\s+${PER}\s*${NUM}${CUR}$`, 'i'), map: (m) => [m[2] ?? '', m[1] ?? '', m[3] ?? ''] },
  // „Fliesen 24 m² à 38 €“ / „Arbeit 16 h à 52 €“
  { re: new RegExp(String.raw`^(.+?)\s+(\d+)\s*${UNIT}\s*${PER}\s*${NUM}${CUR}$`, 'i'), map: (m) => [m[1] ?? '', m[2] ?? '', m[3] ?? ''] },
  // „Entsorgung pauschal 180 €“
  { re: new RegExp(String.raw`^(.+?)\s+(?:pauschal|forfait|forfettario|a corpo|flat|lump sum)\s*${NUM}${CUR}$`, 'i'), map: (m) => [m[1] ?? '', '1', m[2] ?? ''] },
];

const OUT_OF_SCOPE = /\b(website|webseite|homepage|sito web|landing ?page|app|software|programm|api|logo|grafik|grafica|design|video|film|audio|podcast|3d|animation|animazione|broschüre|brochure|flyer|präsentation|presentazione|presentation|abo|abonnement)\b/i;
/** Rechts- und Steuerdienstleistungen: regulierte Tätigkeiten, die nie angeboten werden. */
const REGULATED = /(steuererklärung|steuerberatung|buchführung|jahresabschluss|rechtsberatung|rechtsgutachten|mietvertrag|arbeitsvertrag|kaufvertrag|vertrag|abmahnung|mahnbescheid|dichiarazione dei redditi|consulenza fiscale|consulenza legale|contratto|tax return|tax advice|legal advice|bookkeeping|contract)/i;
const FORMAT_WORDS: [RegExp, string][] = [
  [/\b(paket|zip|beides|beide|both|entrambi|pacchetto|bundle)\b/i, 'b2b-calc-bundle'],
  [/\bpdf\b/i, 'b2b-calc-pdf'],
  [/\b(excel|xlsx)\b/i, 'b2b-calc-xlsx'],
  [/\b(tabelle|csv|libreoffice|foglio|spreadsheet|tabella)\b/i, 'b2b-calc-csv'],
];
type Lang = 'de' | 'it' | 'en';
const MSG = {
  de: {
    fmt: { 'b2b-calc-csv': 'Tabelle (CSV)', 'b2b-calc-xlsx': 'Excel-Datei mit Formeln (XLSX)', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Paket aus Tabelle und PDF' } as Record<string, string>,
    items: (n: number) => `${n} Position${n === 1 ? '' : 'en'} mit Menge und Einzelpreis`,
    askItems: 'Welche Positionen sollen hinein? Bitte je Zeile: Bezeichnung;Menge;Einzelpreis',
    unclear: (s: string) => `Diese Angabe konnte ich nicht sicher zuordnen: „${s}“. Bitte als eigene Zeile eintragen: Bezeichnung;Menge;Einzelpreis`,
    margin: (p: string) => `Aufschlag ${p} %`, askMargin: 'Welcher Aufschlag in Prozent? (0 %, wenn keiner gewünscht ist)',
    format: (f: string) => `Lieferformat: ${f}`, notOffered: (f: string) => `${f} ist derzeit nicht bestellbar – bitte ein verfügbares Format wählen.`,
    askFormat: 'In welchem Format möchten Sie die Kalkulation erhalten?', askContact: 'Ihr Name, Ihre E-Mail-Adresse und Ihr Land – für das Angebot.',
    out: (w: string) => `„${w}“ gehört derzeit nicht zu unseren lieferbaren Produkten. Wir liefern nur, was wir nachweislich herstellen und automatisch prüfen können: Kalkulationen als Tabelle, PDF oder Paket.`,
    regulated: (w: string) => `„${w}“ ist eine Rechts- oder Steuerdienstleistung. Solche Leistungen erbringen wir nicht – bitte wenden Sie sich dafür an eine Anwalts- oder Steuerkanzlei.`,
    title: 'Kalkulation',
  },
  it: {
    fmt: { 'b2b-calc-csv': 'Tabella (CSV)', 'b2b-calc-xlsx': 'File Excel con formule (XLSX)', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Pacchetto con tabella e PDF' } as Record<string, string>,
    items: (n: number) => `${n} ${n === 1 ? 'voce' : 'voci'} con quantità e prezzo unitario`,
    askItems: 'Quali voci devono essere incluse? Una per riga: Descrizione;Quantità;Prezzo unitario',
    unclear: (s: string) => `Non ho potuto attribuire con certezza questa indicazione: «${s}». Inseritela come riga separata: Descrizione;Quantità;Prezzo unitario`,
    margin: (p: string) => `Ricarico ${p} %`, askMargin: 'Quale ricarico in percentuale? (0 % se non desiderato)',
    format: (f: string) => `Formato di consegna: ${f}`, notOffered: (f: string) => `${f} non è attualmente ordinabile – scegliete un formato disponibile.`,
    askFormat: 'In quale formato desiderate ricevere il calcolo?', askContact: 'Nome, indirizzo e-mail e paese – per l’offerta.',
    out: (w: string) => `«${w}» al momento non rientra tra i nostri prodotti disponibili. Consegniamo solo ciò che possiamo produrre e verificare automaticamente: calcoli come tabella, PDF o pacchetto.`,
    regulated: (w: string) => `«${w}» è una prestazione legale o fiscale. Non forniamo questo tipo di servizi – rivolgetevi a uno studio legale o a un commercialista.`,
    title: 'Calcolo',
  },
  en: {
    fmt: { 'b2b-calc-csv': 'Spreadsheet (CSV)', 'b2b-calc-xlsx': 'Excel file with formulas (XLSX)', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Bundle of spreadsheet and PDF' } as Record<string, string>,
    items: (n: number) => `${n} item${n === 1 ? '' : 's'} with quantity and unit price`,
    askItems: 'Which items should be included? One per line: Description;Quantity;Unit price',
    unclear: (s: string) => `I could not assign this with certainty: “${s}”. Please enter it as its own line: Description;Quantity;Unit price`,
    margin: (p: string) => `Markup ${p} %`, askMargin: 'What markup in percent? (0 % if none)',
    format: (f: string) => `Delivery format: ${f}`, notOffered: (f: string) => `${f} cannot currently be ordered – please choose an available format.`,
    askFormat: 'In which format would you like the calculation?', askContact: 'Your name, email address and country – for the quote.',
    out: (w: string) => `“${w}” is currently not one of our available products. We only deliver what we can demonstrably produce and verify automatically: calculations as spreadsheet, PDF or bundle.`,
    regulated: (w: string) => `“${w}” is a legal or tax service. We do not provide such services – please contact a law firm or a tax adviser.`,
    title: 'Calculation',
  },
};

function clean(s: string): string {
  return s.replace(/^[-•*\d.)\s]+(?=\D)/, '').replace(/\s+/g, ' ').trim();
}

const hasDigit = (s: string): boolean => /\d/.test(s);

/** Teilt einen Satzteil an „und/e/and/sowie/plus“ und an Kommas – aber nur, wenn auf beiden Seiten Zahlen stehen („Material und Arbeit 2 x 50 €“ bleibt ganz). */
function splitJoined(seg: string): string[] {
  const m = /\s+(?:und|sowie|plus|e|ed|and)\s+|,\s+/i.exec(seg);
  if (!m) return [seg];
  const from = 0;
  const re = /\s+(?:und|sowie|plus|e|ed|and)\s+|,\s+/gi;
  for (let hit = re.exec(seg); hit; hit = re.exec(seg)) {
    const left = seg.slice(from, hit.index);
    const right = seg.slice(hit.index + hit[0].length);
    if (hasDigit(left) && hasDigit(right)) return [left, ...splitJoined(right)];
  }
  return [seg];
}

const NUMBER = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
const INTRO = /^(?:ich brauche|ich möchte|ich hätte gern|bitte|wir brauchen|mi serve|vorrei|ci serve|i need|we need|please|kalkulation|angebot|preventivo|calcolo|quote|offer|calculation|eine|einen|ein|una|un|an|a|für|per|for|als|come|as|di|del|della|von|of|excel-datei|excel|datei)\b[\s:,-]*/i;
const UNIT_RE = new RegExp(String.raw`^\s*(${UNIT_WORDS})(?![\p{L}\d])`, 'iu');
const PRICE_AFTER = /^\s*(?:,-|€|eur\b|euro\b)/i;
const PRICE_BEFORE = /(?:^|\s)(?:à|@|je|zu|für je|a|al|per|for|at|pro)\s*$/i;
const EACH_AFTER = /^\s*(?:€|eur|euro)?\s*(?:each|cad\.?|cadauno|l’uno|l'uno|pro stück|je stück)/i;

function toNumber(tok: string, lang: Lang): number {
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(tok) && lang !== 'en') return Number(tok.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(tok) && lang === 'en') return Number(tok.replace(/,/g, ''));
  return Number(tok.replace(',', '.'));
}

/** Entfernt Einleitungen („Kalkulation für …“, „Ich brauche eine …“, „di …“) und Satzzeichen am Rand einer Bezeichnung. */
function tidyName(raw: string): string {
  let name = raw.replace(/[,:;.!?]+$/g, '').trim();
  for (let prev = ''; prev !== name; ) {
    prev = name;
    name = name.replace(INTRO, '').trim();
  }
  return name;
}

/** Liest aus einem Satzteil genau eine Position – oder gibt null zurück, wenn Menge und Preis nicht eindeutig sind. */
export function extractItem(seg: string, lang: Lang): [string, string, string] | null {
  if (/-\s*\d/.test(` ${seg}`.replace(/\d\s*-\s*\d|,-/g, 'x')) || /rabatt|sconto|discount|nachlass/i.test(seg)) return null; // negative Zahlen, Rabatte: nie raten
  const body = seg.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ').replace(/(aufschlag|marge|ricarico|markup|margine|margin)/gi, ' ');
  const nums: { value: number; price: boolean; start: number; end: number; unit: string | null }[] = [];
  for (const m of body.matchAll(NUMBER)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const after = body.slice(end);
    const before = body.slice(0, start);
    const unit = UNIT_RE.exec(after);
    const price = PRICE_AFTER.test(after) || EACH_AFTER.test(after) || (PRICE_BEFORE.test(before) && !unit);
    nums.push({ value: toNumber(m[0], lang), price, start, end: unit && !price ? end + unit[0].length : end, unit: unit && !price ? (unit[1] ?? null) : null });
  }
  const prices = nums.filter((x) => x.price);
  const others = nums.filter((x) => !x.price);
  if (prices.length !== 1 || others.length > 1) return null;
  const price = prices[0] as (typeof nums)[number];
  const qty = others[0];
  const quantity = qty ? qty.value : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price.value) || price.value < 0) return null;
  let name = body;
  for (const x of [...nums].sort((a, b) => b.start - a.start)) name = `${name.slice(0, x.start)} ${name.slice(x.end)}`;
  name = name.replace(/,-|€|\b(?:eur|euro|each|cad\.?|cadauno)\b/gi, ' ').replace(/(?:^|\s)(?:à|@|je|zu|für je|al|per|for|at|pro|x|×)(?=\s|$)/gi, ' ').replace(/\s+a\s*$/i, ' ').replace(/[,:;.!?]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  name = tidyName(name);
  if (!name && qty?.unit) name = qty.unit;
  if (!name || !/\p{L}/u.test(name)) return null;
  return [name.slice(0, 120), String(quantity), price.value.toFixed(2)];
}

export function understand(text: string, offered: readonly string[], lang: Lang = 'de'): AdvisorResult {
  const T = MSG[lang];
  const raw = text.slice(0, 5000);
  const segments = raw.split(/\r?\n|,\s+(?=\D)|;\s+(?=\D)|:\s+|(?<=[€\d])\.\s+(?=\D)|\s+(?:und|e|and)\s+(?=\D)/i).map((s) => s.trim()).filter(Boolean);
  const items: string[] = [];
  const rest: string[] = [];
  const unclear: string[] = [];
  for (const seg of segments) {
    const s = seg.replace(/[.!]$/, '');
    const hit = PATTERNS.map((p) => s.match(p.re) ? p.map(s.match(p.re) as RegExpMatchArray) : null).find(Boolean);
    // Ein Treffer der festen Muster gilt nur, wenn der Satzteil nicht mehrere Positionen enthält (sonst würden Zahlen falsch kombiniert).
    if (hit && splitJoined(s).length === 1 && Number(hit[1]) >= 1 && !/%|rabatt|sconto|discount|nachlass/i.test(hit[0])) {
      const [name, qty, price] = hit;
      const n = tidyName(clean(name));
      if (n && !/(aufschlag|marge|ricarico|markup|margin)/i.test(n)) items.push(`${n};${qty};${price.replace(/\.(?=\d{3}\b)/g, '')}`);
      else rest.push(s);
      continue;
    }
    for (const part of splitJoined(s)) {
      const found = extractItem(part, lang);
      if (found) items.push(found.join(';'));
      else {
        rest.push(part);
        const withoutPct = part.replace(/\d+(?:[.,]\d+)?\s*%/g, '');
        if ((withoutPct.match(NUMBER) ?? []).length >= 2 || /(?:€|eur\b|euro\b)/i.test(withoutPct)) unclear.push(part.trim().slice(0, 120));
      }
    }
  }
  const m = raw.match(/(?:aufschlag|marge|ricarico|markup|margin|margine)\D{0,12}(\d{1,2}(?:[.,]\d+)?)\s*%/i) ?? raw.match(/(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:aufschlag|marge|ricarico|markup|margin|margine)/i);
  const marginPct = m ? Number((m[1] ?? '').replace(',', '.')) : null;
  const named = FORMAT_WORDS.find(([re]) => re.test(raw))?.[1] ?? null;
  // „Excel“ meint die Excel-Datei mit Formeln; ist sie nicht bestellbar, ist die Tabelle (CSV) die nächste Entsprechung.
  const wanted = named === 'b2b-calc-xlsx' && !offered.includes(named) ? 'b2b-calc-csv' : named;
  const format = wanted && offered.includes(wanted) ? wanted : null;
  const scope = raw.match(OUT_OF_SCOPE)?.[1] ?? null;
  const regulated = raw.match(REGULATED)?.[1] ?? null;
  const firstLine = clean(rest.find((r) => r.length >= 4 && r.length <= 80 && !OUT_OF_SCOPE.test(r) && !/%/.test(r) && !unclear.includes(r.trim())) ?? '');
  const title = firstLine.replace(/^(ich brauche|ich möchte|bitte|mi serve|vorrei|i need|please)\s+/i, '').replace(/^(eine|einen|ein|una|un|a|an)\s+/i, '').slice(0, 120) || T.title;

  const understood: string[] = [];
  const questions: string[] = [];
  if (items.length) understood.push(T.items(items.length));
  else if (unclear.length === 0) questions.push(T.askItems);
  for (const u of unclear.slice(0, 5)) questions.push(T.unclear(u));
  if (marginPct !== null && marginPct >= 0 && marginPct <= 90) understood.push(T.margin(String(marginPct).replace('.', ',')));
  else questions.push(T.askMargin);
  if (format) understood.push(T.format(T.fmt[format] ?? format));
  else if (wanted && !offered.includes(wanted)) questions.push(T.notOffered(T.fmt[wanted] ?? wanted));
  else if (offered.length > 1) questions.push(T.askFormat);
  questions.push(T.askContact);
  const outOfScope = items.length > 0 ? null : regulated ? T.regulated(regulated) : scope ? T.out(scope) : null;
  return { items, marginPct: marginPct !== null && marginPct >= 0 && marginPct <= 90 ? marginPct : null, format, title, understood, questions, outOfScope };
}
