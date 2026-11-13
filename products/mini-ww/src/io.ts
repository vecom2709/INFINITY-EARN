import { audit, computeTotals, type Ctx, DomainError, transact, user } from './core.ts';
import { stockOf, validateArticle } from './inventory.ts';
import { paidAmount } from './billing.ts';
import { SCHEMA_VERSION, type SequenceName, type Store } from './model.ts';
import { addArticle, addCustomer } from './inventory.ts';

/**
 * Sicherung, Wiederherstellung, CSV-Export/-Import und Integritätsprüfung.
 * Eine Sicherung enthält eine Prüfsumme; beim Wiederherstellen wird der gesamte Bestand gegen sein eigenes
 * Journal geprüft. Fehlerhafte oder manipulierte Sicherungen werden abgelehnt.
 */

/** FNV-1a (32 Bit) – Integritätsprüfung gegen versehentliche Beschädigung (kein Kryptoschutz). */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Prüft alle fachlichen Invarianten. Leere Liste = konsistent. */
export function verifyStore(s: Store): string[] {
  const issues: string[] = [];
  for (const a of s.articles) {
    const st = stockOf(s, a.id);
    if (st.onHand < 0) issues.push(`${a.sku}: negativer Bestand ${st.onHand}`);
    if (st.reserved < 0) issues.push(`${a.sku}: negative Reservierung`);
    if (st.reserved > st.onHand) issues.push(`${a.sku}: mehr reserviert als vorhanden`);
  }
  for (const o of s.orders) {
    for (const l of o.lines) if (l.delivered > l.qty || l.delivered < 0) issues.push(`${o.number}: Liefermenge außerhalb des Auftrags`);
    const delivered = new Map<string, number>();
    for (const d of s.deliveries.filter((x) => x.orderId === o.id)) for (const l of d.lines) delivered.set(l.articleId, (delivered.get(l.articleId) ?? 0) + l.qty);
    for (const l of o.lines) if ((delivered.get(l.articleId) ?? 0) !== l.delivered) issues.push(`${o.number}: Lieferungen und Auftragsstand stimmen nicht überein`);
  }
  const seqCheck = (name: SequenceName, numbers: (string | null)[]): void => {
    const seq = s.settings.sequences[name];
    const nums = numbers.filter((n): n is string => !!n).map((n) => Number(n.slice(seq.prefix.length))).sort((a, b) => a - b);
    nums.forEach((n, i) => { if (n !== i + 1) issues.push(`Nummernkreis ${name}: Lücke oder Doppelnummer bei ${n}`); });
    if (nums.length && seq.next !== nums.length + 1) issues.push(`Nummernkreis ${name}: nächste Nummer ${seq.next} passt nicht zu ${nums.length} vergebenen`);
  };
  seqCheck('invoice', s.invoices.filter((i) => i.kind === 'INVOICE' && i.status === 'FINAL').map((i) => i.number));
  seqCheck('credit', s.invoices.filter((i) => i.kind === 'CREDIT_NOTE' && i.status === 'FINAL').map((i) => i.number));
  seqCheck('order', s.orders.map((o) => o.number));
  seqCheck('delivery', s.deliveries.map((d) => d.number));
  seqCheck('quote', s.quotes.map((q) => q.number));
  for (const i of s.invoices) {
    if (i.status === 'DRAFT' && i.number) issues.push(`Entwurf mit Nummer ${i.number}`);
    if (i.status === 'FINAL' && JSON.stringify(computeTotals(i.lines)) !== JSON.stringify(i.totals)) issues.push(`${i.number}: Summen stimmen nicht mit den Positionen überein`);
    if (i.kind === 'INVOICE' && i.status === 'FINAL' && paidAmount(s, i.id) > i.totals.grossMinor) issues.push(`${i.number}: mehr bezahlt als berechnet`);
  }
  const refs = new Set(s.deliveries.map((d) => d.clientRef));
  if (refs.size !== s.deliveries.length) issues.push('Doppelt gebuchte Lieferreferenz');
  return issues;
}

export function exportBackup(s: Store): string {
  const body = JSON.stringify(s);
  return JSON.stringify({ format: 'mini-ww-backup', schema: SCHEMA_VERSION, checksum: fnv1a(body), store: s });
}

export function restoreBackup(text: string): Store {
  let parsed: { format?: unknown; schema?: unknown; checksum?: unknown; store?: Store };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new DomainError('BACKUP_INVALID', 'Die Datei ist keine gültige Sicherung.');
  }
  if (parsed.format !== 'mini-ww-backup' || !parsed.store) throw new DomainError('BACKUP_INVALID', 'Die Datei ist keine Sicherung dieses Programms.');
  if (parsed.schema !== SCHEMA_VERSION) throw new DomainError('BACKUP_VERSION', `Sicherung hat Version ${String(parsed.schema)}, erwartet ${SCHEMA_VERSION}.`);
  if (fnv1a(JSON.stringify(parsed.store)) !== parsed.checksum) throw new DomainError('BACKUP_CORRUPT', 'Die Sicherung ist beschädigt oder wurde verändert.');
  const issues = verifyStore(parsed.store);
  if (issues.length) throw new DomainError('BACKUP_INCONSISTENT', `Sicherung ist nicht konsistent: ${issues.slice(0, 3).join('; ')}`);
  return parsed.store;
}

// --- CSV (Semikolon, für Excel/LibreOffice in DE/IT) ---------------------------------------------

const cell = (v: string | number | null): string => {
  const t = v === null ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; // Formel-Injektion verhindern
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const money = (minor: number): string => `${minor < 0 ? '-' : ''}${Math.floor(Math.abs(minor) / 100)},${String(Math.abs(minor) % 100).padStart(2, '0')}`;

export function exportCsv(s: Store, kind: 'articles' | 'customers' | 'invoices'): string {
  const rows: (string | number | null)[][] =
    kind === 'articles' ? [['Artikelnummer', 'Bezeichnung', 'Einheit', 'Verkaufspreis', 'Einkaufspreis', 'Steuersatz', 'Bestand', 'Reserviert'], ...s.articles.map((a) => { const st = stockOf(s, a.id); return [a.sku, a.name, a.unit, money(a.priceMinor), money(a.costMinor), a.taxRateId, st.onHand, st.reserved]; })]
      : kind === 'customers' ? [['Kundennummer', 'Name', 'E-Mail', 'Adresse', 'USt-IdNr'], ...s.customers.map((c) => [c.number, c.name, c.email, c.address, c.vatId])]
        : [['Nummer', 'Art', 'Kunde', 'Datum', 'Netto', 'Steuer', 'Brutto', 'Bezahlt'], ...s.invoices.filter((i) => i.status === 'FINAL').map((i) => [i.number, i.kind === 'INVOICE' ? 'Rechnung' : 'Gutschrift', s.customers.find((c) => c.id === i.customerId)?.number ?? '', (i.finalizedAt ?? '').slice(0, 10), money(i.totals.netMinor), money(i.totals.taxMinor), money(i.totals.grossMinor), money(i.kind === 'INVOICE' ? paidAmount(s, i.id) : 0)])];
  return `${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}

export function parseCsv(text: string, sep = ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let c = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(c); if (row.some((x) => x !== '')) rows.push(row); row = []; c = ''; }
    else c += ch;
  }
  if (c !== '' || row.length) { row.push(c); if (row.some((x) => x !== '')) rows.push(row); }
  return rows;
}

export function parseMoney(t: string): number {
  const s = t.trim().replace(/€|\s/g, '');
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(s)) return -1;
  const [a = '0', b = ''] = s.split(/[.,]/);
  return Number(a) * 100 + Number(b.padEnd(2, '0'));
}

/**
 * Artikel-Import: Kopfzeile Artikelnummer;Bezeichnung;Einheit;Verkaufspreis;Einkaufspreis;Steuersatz.
 * Alles oder nichts: bei einem Fehler wird nichts übernommen; jede fehlerhafte Zeile wird gemeldet.
 */
export function importArticlesCsv(store: Store, ctx: Ctx, text: string): { store: Store; result: { imported: number } } {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  const [head, ...data] = rows;
  if (!head || head[0]?.trim().toLowerCase() !== 'artikelnummer') throw new DomainError('CSV_HEADER', 'Erste Zeile muss die Kopfzeile sein: Artikelnummer;Bezeichnung;Einheit;Verkaufspreis;Einkaufspreis;Steuersatz');
  let s = store;
  const errors: string[] = [];
  data.forEach((r, i) => {
    const [sku = '', name = '', unit = '', price = '', cost = '', tax = ''] = r;
    const input = { sku, name, unit, priceMinor: parseMoney(price), costMinor: cost.trim() ? parseMoney(cost) : 0, taxRateId: tax.trim() || 'std' };
    try {
      validateArticle(s, input);
      s = addArticle(s, ctx, input).store;
    } catch (e) {
      errors.push(`Zeile ${i + 2}: ${e instanceof DomainError ? e.message.replace(/^[A-Z_]+: /, '') : String(e)}`);
    }
  });
  if (errors.length) throw new DomainError('CSV_ROWS', errors.slice(0, 10).join(' | '));
  return transact(s, (d) => {
    user(d, ctx);
    audit(d, ctx, 'import.articles', 'csv', { rows: data.length });
    return { imported: data.length };
  });
}

export function importCustomersCsv(store: Store, ctx: Ctx, text: string): { store: Store; result: { imported: number } } {
  const [head, ...data] = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!head || head[0]?.trim().toLowerCase() !== 'name') throw new DomainError('CSV_HEADER', 'Erste Zeile muss die Kopfzeile sein: Name;E-Mail;Adresse;USt-IdNr');
  let s = store;
  const errors: string[] = [];
  data.forEach((r, i) => {
    const [name = '', email = '', address = '', vatId = ''] = r;
    try {
      s = addCustomer(s, ctx, { name, email: email || null, address: address || null, vatId: vatId || null }).store;
    } catch (e) {
      errors.push(`Zeile ${i + 2}: ${e instanceof DomainError ? e.message.replace(/^[A-Z_]+: /, '') : String(e)}`);
    }
  });
  if (errors.length) throw new DomainError('CSV_ROWS', errors.slice(0, 10).join(' | '));
  return transact(s, (d) => {
    audit(d, ctx, 'import.customers', 'csv', { rows: data.length });
    return { imported: data.length };
  });
}
