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
const FORMAT_NAME: Record<string, string> = { 'b2b-calc-csv': 'Tabelle (CSV)', 'b2b-calc-pdf': 'PDF', 'b2b-calc-bundle': 'Paket aus Tabelle und PDF' };

function clean(s: string): string {
  return s.replace(/^[-•*\d.)\s]+(?=\D)/, '').replace(/\s+/g, ' ').trim();
}

export function understand(text: string, offered: readonly string[]): AdvisorResult {
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
  const title = firstLine.replace(/^(ich brauche|ich möchte|bitte|mi serve|vorrei|i need|please)\s+/i, '').replace(/^(eine|einen|ein|una|un|a|an)\s+/i, '').slice(0, 120) || 'Kalkulation';

  const understood: string[] = [];
  const questions: string[] = [];
  if (items.length) understood.push(`${items.length} Position${items.length === 1 ? '' : 'en'} mit Menge und Einzelpreis`);
  else questions.push('Welche Positionen sollen hinein? Bitte je Zeile: Bezeichnung;Menge;Einzelpreis');
  if (marginPct !== null && marginPct >= 0 && marginPct <= 90) understood.push(`Aufschlag ${String(marginPct).replace('.', ',')} %`);
  else questions.push('Welcher Aufschlag in Prozent? (0 %, wenn keiner gewünscht ist)');
  if (format) understood.push(`Lieferformat: ${FORMAT_NAME[format]}`);
  else if (wanted && !offered.includes(wanted)) questions.push(`${FORMAT_NAME[wanted]} ist derzeit nicht bestellbar – bitte ein verfügbares Format wählen.`);
  else if (offered.length > 1) questions.push('In welchem Format möchten Sie die Kalkulation erhalten?');
  questions.push('Ihr Name, Ihre E-Mail-Adresse und Ihr Land – für das Angebot.');
  const outOfScope = scope && items.length === 0
    ? `„${scope}“ gehört derzeit nicht zu unseren lieferbaren Produkten. Wir liefern nur, was wir nachweislich herstellen und automatisch prüfen können: Kalkulationen als Tabelle, PDF oder Paket.`
    : null;
  return { items, marginPct: marginPct !== null && marginPct >= 0 && marginPct <= 90 ? marginPct : null, format, title, understood, questions, outOfScope };
}
