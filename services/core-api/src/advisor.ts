/**
 * Produktberater: versteht einen Wunsch in eigenen Worten (DE/IT/EN) und macht daraus eine vorausgefüllte Anfrage.
 * Regelbasiert und nachvollziehbar – keine kostenpflichtige KI-API. Er erfindet nichts: Was er nicht sicher erkennt,
 * fragt er nach. Wünsche außerhalb der lieferbaren Produkte werden ehrlich als „derzeit nicht lieferbar“ beantwortet.
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
const UNIT = String.raw`(?:m²|m2|qm|mq|h|std\.?|stunden|ore|hours?|stk\.?|stück|pz|pcs|pezzi|x|×)?`;
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
const FORMAT_WORDS: [RegExp, string][] = [
  [/\b(paket|zip|beides|beide|both|entrambi|pacchetto|bundle)\b/i, 'b2b-calc-bundle'],
  [/\bpdf\b/i, 'b2b-calc-pdf'],
  [/\b(tabelle|excel|csv|libreoffice|foglio|spreadsheet|tabella)\b/i, 'b2b-calc-csv'],
];
type Lang = 'de' | 'it' | 'en';
const MSG = {
  de: {
    fmt: { 'b2b-calc-csv': 'Tabelle (CSV)', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Paket aus Tabelle und PDF' } as Record<string, string>,
    items: (n: number) => `${n} Position${n === 1 ? '' : 'en'} mit Menge und Einzelpreis`,
    askItems: 'Welche Positionen sollen hinein? Bitte je Zeile: Bezeichnung;Menge;Einzelpreis',
    margin: (p: string) => `Aufschlag ${p} %`, askMargin: 'Welcher Aufschlag in Prozent? (0 %, wenn keiner gewünscht ist)',
    format: (f: string) => `Lieferformat: ${f}`, notOffered: (f: string) => `${f} ist derzeit nicht bestellbar – bitte ein verfügbares Format wählen.`,
    askFormat: 'In welchem Format möchten Sie die Kalkulation erhalten?', askContact: 'Ihr Name, Ihre E-Mail-Adresse und Ihr Land – für das Angebot.',
    out: (w: string) => `„${w}“ gehört derzeit nicht zu unseren lieferbaren Produkten. Wir liefern nur, was wir nachweislich herstellen und automatisch prüfen können: Kalkulationen als Tabelle, PDF oder Paket.`,
    title: 'Kalkulation',
  },
  it: {
    fmt: { 'b2b-calc-csv': 'Tabella (CSV)', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Pacchetto con tabella e PDF' } as Record<string, string>,
    items: (n: number) => `${n} ${n === 1 ? 'voce' : 'voci'} con quantità e prezzo unitario`,
    askItems: 'Quali voci devono essere incluse? Una per riga: Descrizione;Quantità;Prezzo unitario',
    margin: (p: string) => `Ricarico ${p} %`, askMargin: 'Quale ricarico in percentuale? (0 % se non desiderato)',
    format: (f: string) => `Formato di consegna: ${f}`, notOffered: (f: string) => `${f} non è attualmente ordinabile – scegliete un formato disponibile.`,
    askFormat: 'In quale formato desiderate ricevere il calcolo?', askContact: 'Nome, indirizzo e-mail e paese – per l’offerta.',
    out: (w: string) => `«${w}» al momento non rientra tra i nostri prodotti disponibili. Consegniamo solo ciò che possiamo produrre e verificare automaticamente: calcoli come tabella, PDF o pacchetto.`,
    title: 'Calcolo',
  },
  en: {
    fmt: { 'b2b-calc-csv': 'Spreadsheet (CSV)', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Bundle of spreadsheet and PDF' } as Record<string, string>,
    items: (n: number) => `${n} item${n === 1 ? '' : 's'} with quantity and unit price`,
    askItems: 'Which items should be included? One per line: Description;Quantity;Unit price',
    margin: (p: string) => `Markup ${p} %`, askMargin: 'What markup in percent? (0 % if none)',
    format: (f: string) => `Delivery format: ${f}`, notOffered: (f: string) => `${f} cannot currently be ordered – please choose an available format.`,
    askFormat: 'In which format would you like the calculation?', askContact: 'Your name, email address and country – for the quote.',
    out: (w: string) => `“${w}” is currently not one of our available products. We only deliver what we can demonstrably produce and verify automatically: calculations as spreadsheet, PDF or bundle.`,
    title: 'Calculation',
  },
};

function clean(s: string): string {
  return s.replace(/^[-•*\d.)\s]+(?=\D)/, '').replace(/\s+/g, ' ').trim();
}

export function understand(text: string, offered: readonly string[], lang: Lang = 'de'): AdvisorResult {
  const T = MSG[lang];
  const raw = text.slice(0, 5000);
  const segments = raw.split(/\r?\n|,\s+(?=\D)|;\s+(?=\D)|:\s+|(?<=[€\d])\.\s+(?=\D)|\s+(?:und|e|and)\s+(?=\D)/i).map((s) => s.trim()).filter(Boolean);
  const items: string[] = [];
  const rest: string[] = [];
  for (const seg of segments) {
    const s = seg.replace(/[.!]$/, '');
    const hit = PATTERNS.map((p) => s.match(p.re) ? p.map(s.match(p.re) as RegExpMatchArray) : null).find(Boolean);
    if (hit) {
      const [name, qty, price] = hit;
      const n = clean(name);
      if (n && !/(aufschlag|marge|ricarico|markup|margin)/i.test(n)) items.push(`${n};${qty};${price.replace(/\.(?=\d{3}\b)/g, '')}`);
      else rest.push(s);
    } else rest.push(s);
  }
  const m = raw.match(/(?:aufschlag|marge|ricarico|markup|margin|margine)\D{0,12}(\d{1,2}(?:[.,]\d+)?)\s*%/i) ?? raw.match(/(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:aufschlag|marge|ricarico|markup|margin|margine)/i);
  const marginPct = m ? Number((m[1] ?? '').replace(',', '.')) : null;
  const wanted = FORMAT_WORDS.find(([re]) => re.test(raw))?.[1] ?? null;
  const format = wanted && offered.includes(wanted) ? wanted : null;
  const scope = raw.match(OUT_OF_SCOPE)?.[1] ?? null;
  const firstLine = clean(rest.find((r) => r.length >= 4 && r.length <= 80 && !OUT_OF_SCOPE.test(r) && !/%/.test(r)) ?? '');
  const title = firstLine.replace(/^(ich brauche|ich möchte|bitte|mi serve|vorrei|i need|please)\s+/i, '').replace(/^(eine|einen|ein|una|un|a|an)\s+/i, '').slice(0, 120) || T.title;

  const understood: string[] = [];
  const questions: string[] = [];
  if (items.length) understood.push(T.items(items.length));
  else questions.push(T.askItems);
  if (marginPct !== null && marginPct >= 0 && marginPct <= 90) understood.push(T.margin(String(marginPct).replace('.', ',')));
  else questions.push(T.askMargin);
  if (format) understood.push(T.format(T.fmt[format] ?? format));
  else if (wanted && !offered.includes(wanted)) questions.push(T.notOffered(T.fmt[wanted] ?? wanted));
  else if (offered.length > 1) questions.push(T.askFormat);
  questions.push(T.askContact);
  const outOfScope = scope && items.length === 0 ? T.out(scope) : null;
  return { items, marginPct: marginPct !== null && marginPct >= 0 && marginPct <= 90 ? marginPct : null, format, title, understood, questions, outOfScope };
}
