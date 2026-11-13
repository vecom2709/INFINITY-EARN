/**
 * Lieferpaket „Lager & Rechnung für Windows“ (Funktion 157/158) – gemeinsam genutzt vom Bau-Agenten
 * (scripts/win-build-agent.ts, packt das Paket) und von der Abnahmeprüfung im Worker (capabilities/win-lager.ts).
 * Läuft ohne Node-Dateisystem (auch im Cloudflare-Worker).
 */
export type WinLang = 'de' | 'it' | 'en';
export type WinCountry = 'DE' | 'AT' | 'IT';

export const WIN_PRODUCT_ID = 'win-lager';
export const WIN_VERSION = '1.0.0';
/** So viele Fachtests muss jeder Bau bestanden haben (products/win-lager/tests/Tests.cs). */
export const WIN_MIN_UNIT_TESTS = 24;

/** Bauauftrag: nur diese vier Kundenangaben fließen in den Bau. */
export interface WinSpec { company: string; color: string; lang: WinLang; country: WinCountry }

export interface WinManifest {
  product: string; productName: string; version: string; company: string; language: string; builtAt: string; toolchain: string;
  signed: boolean; signature: string; files: { name: string; bytes: number; sha256: string }[]; unitTests: { passed: number; failed: number };
  /** vom Bau-Agenten ergänzt: Quellstand und Lauf, aus dem das Paket stammt */
  source?: { commit: string; run: string };
}

/** Prüft und vereinheitlicht einen Bauauftrag. Wirft „INVALID_INPUT: …“. */
export function validateWinSpec(raw: unknown): WinSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const e: string[] = [];
  const company = typeof r.company === 'string' ? r.company.trim() : '';
  if (!company || company.length > 80 || /[\r\n<>"\\]/.test(company) || [...company].some((ch) => ch.charCodeAt(0) < 0x20)) e.push('Firmenname: 1–80 Zeichen, keine Zeilenumbrüche, spitzen Klammern, Anführungszeichen oder Backslashes');
  const color = typeof r.color === 'string' ? r.color.toUpperCase() : '';
  if (!/^#[0-9A-F]{6}$/.test(color)) e.push('Farbe: #RRGGBB');
  const lang = r.lang ?? r.language;
  if (lang !== 'de' && lang !== 'it' && lang !== 'en') e.push('Sprache: de, it oder en');
  const country = r.country;
  if (country !== 'DE' && country !== 'AT' && country !== 'IT') e.push('Land: DE, AT oder IT');
  if (e.length) throw new Error(`INVALID_INPUT: ${e.join('; ')}`);
  return { company, color, lang: lang as WinLang, country: country as WinCountry };
}

export function winPackageNames(lang: WinLang, version = WIN_VERSION): { setup: string; manual: string; manifest: string; readme: string } {
  return { setup: `${WIN_PRODUCT_ID}-setup-${version}.exe`, manual: `${WIN_PRODUCT_ID}-anleitung-${lang}.pdf`, manifest: 'manifest.json', readme: 'LIESMICH.txt' };
}

/** LIESMICH im Paket: Start, Hinweis auf die fehlende Signatur, Prüfsummen. */
export function winReadme(lang: WinLang, company: string, setupSha: string, manualSha: string, version = WIN_VERSION): string {
  const n = winPackageNames(lang, version);
  const t = {
    de: `Lager & Rechnung für ${company}\r\n\r\nInhalt dieses Pakets\r\n- ${n.setup}: Installation per Doppelklick, ohne Administratorrechte.\r\n- ${n.manual}: bebilderte Bedienungsanleitung.\r\n- ${n.manifest}: Bauprotokoll mit Prüfsummen und Testergebnis.\r\n\r\nWichtig\r\n- Das Programm ist nicht digital signiert. Windows kann deshalb warnen; die Anleitung erklärt, wie Sie fortfahren.\r\n- Vor der ersten Rechnung im Bereich „Firma“ die Pflichtangaben eintragen. Rechnungen vor der Verwendung von Ihrer Steuerberatung prüfen lassen.\r\n\r\nPrüfsummen (SHA-256)\r\n`,
    it: `Magazzino & Fatture per ${company}\r\n\r\nContenuto del pacchetto\r\n- ${n.setup}: installazione con doppio clic, senza diritti di amministratore.\r\n- ${n.manual}: manuale d'uso illustrato.\r\n- ${n.manifest}: protocollo di build con checksum ed esito dei test.\r\n\r\nImportante\r\n- Il programma non è firmato digitalmente. Windows può quindi avvisare; il manuale spiega come procedere.\r\n- Prima della prima fattura inserire i dati obbligatori nell'area «Azienda». Far verificare le fatture dal proprio commercialista prima dell'uso.\r\n\r\nChecksum (SHA-256)\r\n`,
    en: `Stock & Invoices for ${company}\r\n\r\nPackage contents\r\n- ${n.setup}: install with a double-click, no administrator rights needed.\r\n- ${n.manual}: illustrated user guide.\r\n- ${n.manifest}: build record with checksums and test result.\r\n\r\nImportant\r\n- The program is not digitally signed, so Windows may warn; the guide explains how to continue.\r\n- Before the first invoice, enter the mandatory details in the “Company” area. Have invoices checked by your tax adviser before use.\r\n\r\nChecksums (SHA-256)\r\n`,
  }[lang];
  return `\uFEFF${t}${n.setup}: ${setupSha}\r\n${n.manual}: ${manualSha}\r\n`;
}

/** Firmenname so, wie er als C#-Zeichenkette im Programm steht (UTF-16LE) – für die Prüfung, dass der Bau dem Auftrag entspricht. */
export function utf16le(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >> 8;
  }
  return out;
}

export function containsBytes(hay: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  const first = needle[0];
  outer: for (let i = hay.indexOf(first as number); i !== -1 && i <= hay.length - needle.length; i = hay.indexOf(first as number, i + 1)) {
    for (let j = 1; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}
