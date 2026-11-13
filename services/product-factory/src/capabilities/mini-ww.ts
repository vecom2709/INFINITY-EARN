import { validate, type JsonSchema } from '../../../../packages/contracts/src/schemas.ts';
import { sha256Hex } from '../../../../packages/shared/src/crypto.ts';
import { pdfString } from '../../../../packages/shared/src/pdf.ts';
import { createZip, readZip } from '../../../../packages/shared/src/zip.ts';
import { MINI_WW_BUNDLE, MINI_WW_BUNDLE_SHA256 } from '../../../../products/mini-ww/generated/bundle.ts';
import { CSP, embeddedBundle, htmlFromBundle, readBundle, readConfig } from '../../../../products/mini-ww/html.ts';
import { buildManual, MANUAL_TEXTS } from '../../../../products/mini-ww/manual.ts';
import { SHOT_NAMES } from '../../../../products/mini-ww/manual-shots.ts';
import { domainSelftest, uiSelfcheck } from '../../../../products/mini-ww/selfcheck.ts';
import { validateSetup, type Setup } from '../../../../products/mini-ww/src/setup.ts';
import { brandColors, safeLogo, type Brand } from '../../../../products/mini-ww/ui/brand.ts';
import type { ProductCapability, QaCheckResult } from '../types.ts';

/**
 * Pilot-Fachsoftware (P3): Mini-Warenwirtschaft als Offline-Programm im Design des Kunden.
 * Lieferpaket (ZIP): das Programm als eine HTML-Datei, die bebilderte Bedienungsanleitung (PDF) und LIESMICH.txt.
 * Der Programmcode ist die vorab gebaute und getestete Fassung (SHA-256 geprüft); je Auftrag ändern sich nur
 * Firmenname, Farbe, Logo, Sprache und die Einrichtung (Steuersätze, Nummernkreise, Zahlungsziel).
 * Verkauf gesperrt, bis der Eigentümer nach der Vorschau (P4) Produktseite und Preis freigibt.
 */
export const MINI_WW_FILES = { html: 'warenwirtschaft.html', pdf: 'bedienungsanleitung.pdf', readme: 'LIESMICH.txt' } as const;
export const MINI_WW_VERSION = 1;

export interface MiniWwInput { company: string; primary: string; language: 'de' | 'it' | 'en'; logo_data_url?: string | null; setup?: unknown }

export const miniWwInputSchema: JsonSchema = {
  type: 'object',
  required: ['company', 'primary', 'language'],
  properties: {
    company: { type: 'string', minLength: 1, maxLength: 80 },
    primary: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    language: { enum: ['de', 'it', 'en'] },
    logo_data_url: { type: ['string', 'null'], maxLength: 200_000 },
    setup: { type: 'object' },
  },
};

export function asMiniWwInput(raw: unknown): { brand: Brand; setup: Setup } {
  const errors = validate(miniWwInputSchema, raw);
  if (errors.length) throw new Error(`INVALID_INPUT: ${errors.join('; ')}`);
  const i = raw as MiniWwInput;
  if (!i.company.trim()) throw new Error('INVALID_INPUT: Firmenname leer');
  if (i.logo_data_url && !safeLogo(i.logo_data_url)) throw new Error('INVALID_INPUT: Logo nur als PNG/JPEG/WebP-Data-URL bis 200 KB');
  let setup: Setup;
  try {
    setup = validateSetup(i.setup);
  } catch (e) {
    throw new Error(`INVALID_INPUT: ${(e as Error).message}`, { cause: e });
  }
  return { brand: { company: i.company.trim(), primary: i.primary.toUpperCase(), logoDataUrl: i.logo_data_url ?? null, lang: i.language }, setup };
}

const versionLabel = (): string => `mini-ww@${MINI_WW_VERSION} · ${MINI_WW_BUNDLE_SHA256.slice(0, 12)}`;

const README: Record<Brand['lang'], (company: string, htmlSha: string, pdfSha: string) => string> = {
  de: (c, h, p) => `Warenwirtschaft für ${c}\r\n\r\nInhalt dieses Pakets\r\n- ${MINI_WW_FILES.html}: das Programm. Per Doppelklick im Browser öffnen (Edge, Chrome, Firefox, Safari). Keine Installation, kein Internet nötig.\r\n- ${MINI_WW_FILES.pdf}: bebilderte Bedienungsanleitung.\r\n\r\nWichtig\r\n- Ihre Daten werden nur im Browser dieses Computers gespeichert. Laden Sie regelmäßig unter „Daten“ eine Sicherung herunter.\r\n- Rechnungen und Steuersätze vor der Verwendung von Ihrer Steuerberatung prüfen lassen.\r\n\r\nPrüfsummen (SHA-256)\r\n${MINI_WW_FILES.html}: ${h}\r\n${MINI_WW_FILES.pdf}: ${p}\r\nProgrammfassung: ${versionLabel()}\r\n`,
  it: (c, h, p) => `Gestione magazzino per ${c}\r\n\r\nContenuto del pacchetto\r\n- ${MINI_WW_FILES.html}: il programma. Aprire con doppio clic nel browser (Edge, Chrome, Firefox, Safari). Nessuna installazione, nessuna connessione Internet necessaria.\r\n- ${MINI_WW_FILES.pdf}: manuale d’uso illustrato.\r\n\r\nImportante\r\n- I dati vengono salvati solo nel browser di questo computer. Scaricate regolarmente un backup in «Dati».\r\n- Fate verificare fatture e aliquote dal vostro commercialista prima dell’uso.\r\n\r\nChecksum (SHA-256)\r\n${MINI_WW_FILES.html}: ${h}\r\n${MINI_WW_FILES.pdf}: ${p}\r\nVersione del programma: ${versionLabel()}\r\n`,
  en: (c, h, p) => `Inventory management for ${c}\r\n\r\nPackage contents\r\n- ${MINI_WW_FILES.html}: the program. Double-click to open in your browser (Edge, Chrome, Firefox, Safari). No installation, no internet required.\r\n- ${MINI_WW_FILES.pdf}: illustrated user manual.\r\n\r\nImportant\r\n- Your data is stored only in this computer’s browser. Download a backup regularly under “Data”.\r\n- Have invoices and tax rates checked by your tax adviser before use.\r\n\r\nChecksums (SHA-256)\r\n${MINI_WW_FILES.html}: ${h}\r\n${MINI_WW_FILES.pdf}: ${p}\r\nProgram version: ${versionLabel()}\r\n`,
};

function generate(raw: unknown): Uint8Array {
  const { brand, setup } = asMiniWwInput(raw);
  const html = new TextEncoder().encode(htmlFromBundle(MINI_WW_BUNDLE, brand, { setup }));
  const pdf = buildManual(brand, setup, { version: versionLabel() }).bytes;
  const readme = new TextEncoder().encode(`\uFEFF${README[brand.lang](brand.company, sha256Hex(html), sha256Hex(pdf))}`);
  return createZip([{ name: MINI_WW_FILES.html, bytes: html }, { name: MINI_WW_FILES.pdf, bytes: pdf }, { name: MINI_WW_FILES.readme, bytes: readme }]);
}

/** Prüft das PDF der Anleitung: Struktur, Verweistabelle, Seiten, echte Bilder, Kapitel in der Kundensprache. */
export function checkManualPdf(bytes: Uint8Array, lang: Brand['lang']): QaCheckResult {
  const s = new TextDecoder('latin1').decode(bytes);
  const problems: string[] = [];
  if (!s.startsWith('%PDF-1.4') || !s.trimEnd().endsWith('%%EOF')) problems.push('Kopf/Ende');
  const xref = /startxref\n(\d+)\n%%EOF/.exec(s);
  const table = xref ? s.slice(Number(xref[1])) : '';
  const offs = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  if (!table.startsWith('xref') || offs.length < 10) problems.push('Verweistabelle');
  offs.forEach((o, i) => {
    if (!s.startsWith(`${i + 1} 0 obj`, o)) problems.push(`Objekt ${i + 1} falsch verwiesen`);
  });
  const pages = (s.match(/\/Type \/Page /g) ?? []).length;
  const images = (s.match(/\/Subtype \/Image [^>]*\/Filter \/DCTDecode/g) ?? []).length;
  if (pages < 12 || pages > 40) problems.push(`${pages} Seiten`);
  if (images < SHOT_NAMES.length) problems.push(`${images} Bilder statt ${SHOT_NAMES.length}`);
  if (!s.includes(`/Lang (${lang})`)) problems.push('Sprache');
  if (/\/JavaScript|\/JS |\/Launch|\/OpenAction|\/EmbeddedFile/.test(s)) problems.push('aktive Inhalte');
  const missing = MANUAL_TEXTS[lang].chapters.filter((c, i) => !s.includes(`(${pdfString(`${i + 1} ${c.title}`)})`)).map((c) => c.id);
  if (missing.length) problems.push(`Kapitel fehlen: ${missing.join(', ')}`);
  return { check: 'manual_pdf', passed: problems.length === 0, detail: problems.length ? problems.slice(0, 6).join('; ') : `${pages} Seiten, ${images} Screenshots, ${MANUAL_TEXTS[lang].chapters.length} Kapitel (${lang})` };
}

function runQa(bytes: Uint8Array, raw: unknown): QaCheckResult[] {
  let input: { brand: Brand; setup: Setup };
  try {
    input = asMiniWwInput(raw);
  } catch (e) {
    return [{ check: 'input', passed: false, detail: (e as Error).message }];
  }
  let entries: ReturnType<typeof readZip>;
  try {
    entries = readZip(bytes);
  } catch (e) {
    return [{ check: 'zip_structure', passed: false, detail: (e as Error).message }];
  }
  const names = entries.map((x) => x.name).sort();
  const expected = Object.values(MINI_WW_FILES).sort();
  const structureOk = names.join('|') === expected.join('|') && entries.every((x) => x.crcOk);
  const results: QaCheckResult[] = [{ check: 'zip_structure', passed: structureOk, detail: structureOk ? '3 Dateien (Programm, Anleitung, LIESMICH), CRC32 geprüft, keine ausführbaren Dateien' : `Inhalt: ${names.join(', ')}` }];
  const file = (n: string): Uint8Array | undefined => entries.find((x) => x.name === n)?.bytes;
  const htmlBytes = file(MINI_WW_FILES.html);
  const pdfBytes = file(MINI_WW_FILES.pdf);
  const readmeBytes = file(MINI_WW_FILES.readme);
  const html = htmlBytes ? new TextDecoder().decode(htmlBytes) : '';

  // Programmcode = die gebaute und getestete Fassung
  const embedded = readBundle(html);
  const integrity = sha256Hex(MINI_WW_BUNDLE) === MINI_WW_BUNDLE_SHA256 && embedded === embeddedBundle(MINI_WW_BUNDLE);
  results.push({ check: 'program_integrity', passed: integrity, detail: integrity ? `Programmcode unverändert (${versionLabel()})` : 'Programmcode weicht von der getesteten Fassung ab' });

  // Kundendesign
  const cfg = readConfig(html);
  const colors = brandColors(input.brand.primary);
  const brandProblems: string[] = [];
  if (!cfg) brandProblems.push('Konfiguration nicht lesbar');
  else {
    if (cfg.brand.company !== input.brand.company) brandProblems.push('Firmenname');
    if (cfg.brand.lang !== input.brand.lang || !html.startsWith(`<!doctype html><html lang="${input.brand.lang}">`)) brandProblems.push('Sprache');
    if (cfg.brand.primary !== input.brand.primary) brandProblems.push('Farbe');
    if (cfg.brand.logoDataUrl !== null && safeLogo(cfg.brand.logoDataUrl) === null) brandProblems.push('Logo unsicher');
    if (cfg.demo || cfg.seed !== undefined) brandProblems.push('Demo- oder Beispieldaten enthalten');
    if (JSON.stringify(cfg.setup) !== JSON.stringify(input.setup)) brandProblems.push('Einrichtung');
  }
  if (colors.contrast < 4.5) brandProblems.push(`Kontrast ${colors.contrast}`);
  results.push({ check: 'branding', passed: brandProblems.length === 0, detail: brandProblems.length ? brandProblems.join('; ') : `${input.brand.company}, Farbe ${colors.primary} (Kontrast ${colors.contrast}:1${colors.adjusted ? ', angepasst' : ''}), Sprache ${input.brand.lang}` });

  // Kein Netzwerkzugriff möglich
  const netOk = html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`) && /default-src 'none'/.test(CSP) && !/connect-src|https?:/.test(CSP)
    && !/<script[^>]+src=|<link[^>]+href=|<iframe|<object|<embed/i.test(html) && !/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(embedded ?? '');
  results.push({ check: 'no_network', passed: netOk, detail: netOk ? 'CSP default-src none, keine externen Quellen, keine Netzwerkaufrufe im Code' : 'Netzwerkzugriff möglich oder CSP fehlt' });

  // Fachlicher Selbsttest und Oberfläche mit der Einrichtung des Kunden
  const now = new Date();
  const self = domainSelftest(input.brand.company, input.brand.lang, cfg?.setup ?? input.setup, now);
  results.push({ check: 'domain_selftest', passed: self.passed, detail: self.detail });
  const ui = self.state ? uiSelfcheck(self.state, now.toISOString().slice(0, 10)) : { passed: false, detail: 'kein Zustand aus dem Selbsttest' };
  results.push({ check: 'ui_actions', passed: ui.passed, detail: ui.detail });

  // Bebilderte Anleitung
  results.push(pdfBytes ? checkManualPdf(pdfBytes, input.brand.lang) : { check: 'manual_pdf', passed: false, detail: 'fehlt' });

  // LIESMICH mit korrekten Prüfsummen
  const readme = readmeBytes ? new TextDecoder().decode(readmeBytes) : '';
  const readmeOk = !!htmlBytes && !!pdfBytes && readme.includes(input.brand.company) && readme.includes(sha256Hex(htmlBytes)) && readme.includes(sha256Hex(pdfBytes));
  results.push({ check: 'readme', passed: readmeOk, detail: readmeOk ? 'Anleitung zum Start und Prüfsummen stimmen' : 'LIESMICH fehlt oder Prüfsummen falsch' });
  return results;
}

export const miniWw: ProductCapability = {
  capability_id: 'mini-ww',
  version: MINI_WW_VERSION,
  inputs_schema: miniWwInputSchema,
  output_schema: { media_type: 'application/zip', extension: 'zip' },
  licensing_requirements: 'Eigenentwicklung ohne Fremdbibliotheken im ausgelieferten Programm; Logo nur vom Kunden selbst geliefert.',
  required_tools: ['node'],
  estimated_duration_minutes: 1,
  max_complexity: 1,
  qa_suite: ['zip_structure', 'program_integrity', 'branding', 'no_network', 'domain_selftest', 'ui_actions', 'manual_pdf', 'readme', 'checksum'],
  supported_languages: ['de', 'it', 'en'],
  data_privacy: 'Enthält nur Firmenname, Farbe, Logo und Einrichtung des Kunden. Geschäftsdaten bleiben später ausschließlich im Browser des Kunden.',
  artifact_storage: 'Blob-Speicher pro Auftrag, SHA-256 geprüft.',
  refund_criteria: 'Rückerstattung, wenn das Paket die Abnahmeprüfungen nach der Wiederholung nicht besteht oder das Programm die zugesagten Abläufe nicht ausführt.',
  disabled_reason: 'Verkaufsfreigabe durch den Eigentümer steht aus (P4: Vorschau, Produktseite, Preis).',
  owner: 'services/product-factory',
  estimatedCostMinor: () => 0,
  complexity: () => 1,
  generate,
  runQa,
};
