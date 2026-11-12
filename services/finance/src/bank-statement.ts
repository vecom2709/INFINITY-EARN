import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { findOrder } from '../../core-api/src/orders.ts';
import { tryTransition } from '../../core-api/src/opportunities.ts';

/**
 * Bankabgleich (15.0, Zustand BANK_CREDIT_VERIFIED): Eine Auszahlungsmeldung des Zahlungsanbieters ist KEIN
 * Bankeingang. Bestätigt wird erst durch eine passende Gutschrift auf einem gesondert importierten Kontoauszug.
 *
 * Formate: CSV (deutsche Bankexporte: Semikolon, Dezimalkomma) und ISO 20022 camt.053 (XML).
 * Sicherheit: XML wird ohne DTD/Entitäten per Muster gelesen (kein XXE), Größe begrenzt, Rohdatei nicht gespeichert,
 * IBAN maskiert, Gegenpartei gekürzt. Im Testbetrieb nur Auszüge, die ausdrücklich als TEST gekennzeichnet sind.
 *
 * Abgleichregeln (deterministisch, ohne KI):
 *  R1 REFERENCE        Gutschrift enthält die Auszahlungs-ID des Anbieters, Betrag und Währung gleich.
 *  R2 AMOUNT_DATE      Betrag/Währung gleich, Buchung 0–10 Tage nach Auszahlungsmeldung, genau EIN Kandidat
 *                      und die Buchung passt zu keiner anderen offenen Auszahlung.
 *  Mehrdeutig/unpassend → keine Zuordnung, Hinweis zur Prüfung. Nie zwei Buchungen für eine Auszahlung.
 */
export const MAX_STATEMENT_BYTES = 60_000;
/** Offensichtlich ungültige Platzhalter-IBAN für Test-Auszüge (zur Laufzeit zusammengesetzt). */
const TEST_IBAN = ['DE00', 'TEST', '0'.repeat(16)].join('');
const DATE_WINDOW_DAYS = 10;

export interface ParsedTxn {
  lineNo: number;
  bookingDate: string; // YYYY-MM-DD
  amountMinor: number; // immer positiv
  currency: string;
  direction: 'CRDT' | 'DBIT';
  reference: string;
  counterparty: string | null;
  bankRef: string | null;
}

export interface ParsedStatement {
  format: 'CSV' | 'CAMT053';
  accountMasked: string | null;
  statementRef: string | null;
  markedTest: boolean;
  txns: ParsedTxn[];
  errors: string[];
}

export function maskIban(iban: string | null | undefined): string | null {
  const s = (iban ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return null;
  return `${s.slice(0, 4)} •••• ${s.slice(-4)}`;
}

/** "1.234,56" | "1234.56" | "-12,00" → Cent (Vorzeichen getrennt). */
export function parseAmount(raw: string): { minor: number; negative: boolean } | null {
  let s = raw.replace(/[\s€]|EUR/gi, '');
  const negative = s.startsWith('-') || s.endsWith('-');
  s = s.replace(/^[+-]|-$/g, '');
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})*\.\d{1,2}$/.test(s)) s = s.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int = '0', frac = ''] = s.split('.');
  return { minor: Number(int) * 100 + Number(frac.padEnd(2, '0')), negative };
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\.(\d{2})\.(\d{2,4})$/.exec(s);
  if (m) return `${(m[3] ?? '').length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function clip(s: string | null | undefined, n: number): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, n) : null;
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const COLS = {
  date: /^(buchungstag|buchungsdatum|datum|booking ?date|date)$/i,
  amount: /^(betrag|umsatz|amount|betrag \(eur\))$/i,
  currency: /^(währung|waehrung|currency|whrg\.?)$/i,
  reference: /^(verwendungszweck|buchungstext|referenz|reference|purpose|description)$/i,
  counterparty: /^(auftraggeber|empfänger|beguenstigter|begünstigter\/zahlungspflichtiger|name|counterparty|zahlungspflichtiger)$/i,
  iban: /^(iban|kontonummer\/iban|auftragskonto)$/i,
};

export function parseCsvStatement(text: string): ParsedStatement {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const errors: string[] = [];
  const markedTest = /\bTEST(DATEN|BELEG|AUSZUG)?\b/i.test(lines.slice(0, 3).join(' '));
  const headerIdx = lines.findIndex((l) => /betrag|amount|umsatz/i.test(l) && /(datum|buchung|date)/i.test(l));
  if (headerIdx < 0) return { format: 'CSV', accountMasked: null, statementRef: null, markedTest, txns: [], errors: ['Kopfzeile mit Datum und Betrag nicht gefunden'] };
  const headerLine = lines[headerIdx] ?? '';
  const sep = (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitCsvLine(headerLine, sep).map((h) => h.replace(/^"|"$/g, ''));
  const idx = (re: RegExp): number => header.findIndex((h) => re.test(h));
  const c = { date: idx(COLS.date), amount: idx(COLS.amount), currency: idx(COLS.currency), reference: idx(COLS.reference), counterparty: idx(COLS.counterparty), iban: idx(COLS.iban) };
  if (c.date < 0 || c.amount < 0) errors.push('Spalten „Datum“ und „Betrag“ werden benötigt');
  let accountMasked: string | null = null;
  for (const l of lines.slice(0, headerIdx)) accountMasked ??= maskIban(/([A-Z]{2}\d{2}[A-Z0-9 ]{10,40})/.exec(l)?.[1]);
  const txns: ParsedTxn[] = [];
  lines.slice(headerIdx + 1).forEach((line, i) => {
    const cells = splitCsvLine(line, sep);
    const date = parseDate(cells[c.date] ?? '');
    const amt = parseAmount(cells[c.amount] ?? '');
    if (!date || !amt) {
      errors.push(`Zeile ${headerIdx + i + 2}: Datum oder Betrag unlesbar`);
      return;
    }
    txns.push({
      lineNo: i + 1, bookingDate: date, amountMinor: amt.minor, direction: amt.negative ? 'DBIT' : 'CRDT',
      currency: ((c.currency >= 0 ? cells[c.currency] : 'EUR') || 'EUR').toUpperCase().slice(0, 3),
      reference: clip(c.reference >= 0 ? cells[c.reference] : '', 300) ?? '', counterparty: clip(c.counterparty >= 0 ? cells[c.counterparty] : '', 60), bankRef: null,
    });
    accountMasked ??= c.iban >= 0 ? maskIban(cells[c.iban]) : null;
  });
  return { format: 'CSV', accountMasked, statementRef: null, markedTest, txns, errors };
}

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml);
  return m ? m[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? null : null;
};
const decodeXml = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function parseCamt053(xml: string): ParsedStatement {
  const errors: string[] = [];
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { format: 'CAMT053', accountMasked: null, statementRef: null, markedTest: false, txns: [], errors: ['DTD/Entitäten sind nicht erlaubt'] };
  if (!/camt\.053/.test(xml) && !/<(?:\w+:)?BkToCstmrStmt\b/.test(xml)) errors.push('Kein camt.053-Kontoauszug erkannt');
  const stmt = tag(xml, 'Stmt') ?? xml;
  const acct = tag(stmt, 'Acct');
  const msgId = tag(xml, 'MsgId');
  const addtl = tag(xml, 'AddtlInf') ?? tag(stmt, 'AddtlStmtInf') ?? '';
  const markedTest = /\bTEST/i.test(`${msgId ?? ''} ${addtl}`);
  const txns: ParsedTxn[] = [];
  const entries = [...stmt.matchAll(/<(?:\w+:)?Ntry\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Ntry>/g)];
  entries.forEach((m, i) => {
    const e = m[1] ?? '';
    const amtM = /<(?:\w+:)?Amt\b[^>]*Ccy="([A-Z]{3})"[^>]*>([\d.]+)<\/(?:\w+:)?Amt>/.exec(e);
    const dir = tag(e, 'CdtDbtInd');
    const date = parseDate(tag(tag(e, 'BookgDt') ?? '', 'Dt') ?? tag(tag(e, 'BookgDt') ?? '', 'DtTm') ?? '');
    const amt = amtM ? parseAmount(amtM[2] ?? '') : null;
    if (!amtM || !amt || !date || (dir !== 'CRDT' && dir !== 'DBIT')) {
      errors.push(`Buchung ${i + 1}: Betrag, Richtung oder Datum fehlt`);
      return;
    }
    const ustrd = [...e.matchAll(/<(?:\w+:)?Ustrd>([\s\S]*?)<\/(?:\w+:)?Ustrd>/g)].map((u) => u[1] ?? '').join(' ');
    const ref = [ustrd, tag(e, 'AddtlNtryInf') ?? '', tag(e, 'EndToEndId') ?? ''].filter((x) => x && x !== 'NOTPROVIDED').join(' ');
    txns.push({
      lineNo: i + 1, bookingDate: date, amountMinor: amt.minor, currency: amtM[1] ?? 'EUR', direction: dir,
      reference: clip(decodeXml(ref), 300) ?? '', counterparty: clip(decodeXml(tag(tag(e, dir === 'CRDT' ? 'Dbtr' : 'Cdtr') ?? '', 'Nm') ?? ''), 60),
      bankRef: clip(tag(e, 'AcctSvcrRef') ?? tag(e, 'NtryRef'), 80),
    });
  });
  return { format: 'CAMT053', accountMasked: maskIban(tag(acct ?? '', 'IBAN')), statementRef: clip(tag(stmt, 'Id') ?? msgId, 80), markedTest, txns, errors };
}

export function parseStatement(text: string): ParsedStatement {
  return /^\s*(<\?xml|<(?:\w+:)?Document\b)/.test(text) ? parseCamt053(text) : parseCsvStatement(text);
}

interface OpenPayout { payout_id: string; provider_payout_id: string; amount_minor: number; currency: string; created_at: string; order_ids_json: string }

export interface ImportResult {
  statementId: string;
  format: 'CSV' | 'CAMT053';
  entries: number;
  credits: number;
  matched: { payoutId: string; providerPayoutId: string; rule: 'REFERENCE' | 'AMOUNT_DATE'; amountMinor: number }[];
  review: string[];
  closedOrders: string[];
}

function daysBetween(fromIso: string, toDate: string): number {
  return Math.floor((Date.parse(`${toDate}T23:59:59Z`) - Date.parse(fromIso)) / 86_400_000);
}

/**
 * Kontoauszug importieren und mit offenen Auszahlungen abgleichen. Idempotent über die Datei-Prüfsumme.
 * Im Echtbetrieb gesperrt, bis die Bankanbindung freigegeben ist (LA-03/LA-04).
 */
export function importBankStatement(ctx: AppContext, text: string, actor: 'owner' | 'system' = 'owner'): ImportResult {
  if (!ctx.config.testMode) throw new WorkflowError('LIVE_BANK_IMPORT_LOCKED', 'Echte Kontoauszüge erst nach Freigabe der Bankanbindung (LA-03/LA-04).');
  if (!text.trim()) throw new WorkflowError('STATEMENT_EMPTY', 'Bitte einen Kontoauszug einfügen.');
  if (new TextEncoder().encode(text).length > MAX_STATEMENT_BYTES) throw new WorkflowError('STATEMENT_TOO_LARGE', 'Der Auszug ist zu groß (max. 60 KB).');
  const parsed = parseStatement(text);
  if (parsed.txns.length === 0) throw new WorkflowError('STATEMENT_UNREADABLE', parsed.errors.slice(0, 3).join('; ') || 'Keine Buchungen gefunden.');
  if (!parsed.markedTest) throw new WorkflowError('STATEMENT_NOT_MARKED_TEST', 'Im Testbetrieb werden nur ausdrücklich als TEST gekennzeichnete Kontoauszüge angenommen.');
  const t = 1;
  const sha = sha256Hex(text);
  const dup = ctx.db.get<{ statement_id: string }>('SELECT statement_id FROM bank_statements WHERE file_sha256 = ? AND test_mode = ?', sha, t);
  if (dup) throw new WorkflowError('STATEMENT_DUPLICATE', 'Dieser Kontoauszug wurde bereits importiert.');
  const now = ctx.clock().toISOString();
  const statementId = newId('bst');
  const result: ImportResult = { statementId, format: parsed.format, entries: parsed.txns.length, credits: parsed.txns.filter((x) => x.direction === 'CRDT').length, matched: [], review: [...parsed.errors], closedOrders: [] };

  ctx.db.tx(() => {
    ctx.db.run(
      `INSERT INTO bank_statements (statement_id, source_format, file_sha256, account_masked, statement_ref, marked_test, entries, credits, imported_by, test_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      statementId, parsed.format, sha, parsed.accountMasked, parsed.statementRef, parsed.markedTest ? 1 : 0, result.entries, result.credits, actor, t, now,
    );
    const ids = new Map<number, string>();
    for (const x of parsed.txns) {
      const id = newId('btx');
      ids.set(x.lineNo, id);
      ctx.db.run(
        `INSERT INTO bank_transactions (txn_id, statement_id, line_no, booking_date, amount_minor, currency, direction, reference, counterparty, bank_ref, test_mode, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, statementId, x.lineNo, x.bookingDate, x.amountMinor, x.currency, x.direction, x.reference, x.counterparty, x.bankRef, t, now,
      );
    }
    const open = (): OpenPayout[] => ctx.db.all<OpenPayout>(`SELECT payout_id, provider_payout_id, amount_minor, currency, created_at, order_ids_json FROM payouts WHERE test_mode = ? AND status = 'SENT' AND bank_credit_confirmed = 0`, t);
    const credits = parsed.txns.filter((x) => x.direction === 'CRDT');
    const used = new Set<number>();
    const confirm = (p: OpenPayout, x: ParsedTxn, rule: 'REFERENCE' | 'AMOUNT_DATE'): void => {
      const txnId = ids.get(x.lineNo) as string;
      ctx.db.run('UPDATE bank_transactions SET matched_payout_id = ?, match_rule = ? WHERE txn_id = ?', p.payout_id, rule, txnId);
      ctx.db.run('UPDATE payouts SET bank_txn_id = ?, bank_verified_at = ?, bank_credit_confirmed = 1, updated_at = ? WHERE payout_id = ?', txnId, now, now, p.payout_id);
      used.add(x.lineNo);
      result.matched.push({ payoutId: p.payout_id, providerPayoutId: p.provider_payout_id, rule, amountMinor: p.amount_minor });
      for (const oid of JSON.parse(p.order_ids_json) as string[]) {
        const o = findOrder(ctx, oid);
        if (o && tryTransition(ctx, o.opportunity_id, 'CLOSED', 'system', `Bankeingang bestätigt (${rule === 'REFERENCE' ? 'Referenz' : 'Betrag und Datum'}, Kontoauszug ${statementId})`)) result.closedOrders.push(oid);
      }
      ctx.audit.record({ type: 'bank.credit_verified', actor, subjectType: 'payout', subjectId: p.provider_payout_id, data: { statement_id: statementId, txn_id: txnId, rule, amount: p.amount_minor, booking_date: x.bookingDate }, testMode: ctx.config.testMode });
    };
    // R1: Referenz enthält die Auszahlungs-ID
    for (const p of open()) {
      const x = credits.find((c) => !used.has(c.lineNo) && c.reference.includes(p.provider_payout_id));
      if (!x) continue;
      if (x.amountMinor !== p.amount_minor || x.currency !== p.currency) {
        result.review.push(`Auszahlung ${p.provider_payout_id}: Referenz gefunden, aber Betrag/Währung weicht ab (${x.amountMinor} ${x.currency} statt ${p.amount_minor} ${p.currency})`);
        used.add(x.lineNo);
        continue;
      }
      confirm(p, x, 'REFERENCE');
    }
    // R2: eindeutiger Betrag + Datumsfenster
    const remaining = open();
    for (const p of remaining) {
      const cands = credits.filter((c) => !used.has(c.lineNo) && c.amountMinor === p.amount_minor && c.currency === p.currency && daysBetween(p.created_at, c.bookingDate) >= 0 && daysBetween(p.created_at, c.bookingDate) <= DATE_WINDOW_DAYS);
      if (cands.length === 0) continue;
      const rivals = remaining.filter((q) => q.payout_id !== p.payout_id && q.amount_minor === p.amount_minor && q.currency === p.currency);
      if (cands.length > 1 || rivals.length > 0) {
        result.review.push(`Auszahlung ${p.provider_payout_id}: mehrere mögliche Buchungen über ${(p.amount_minor / 100).toFixed(2)} ${p.currency} – bitte prüfen, keine automatische Zuordnung`);
        continue;
      }
      confirm(p, cands[0] as ParsedTxn, 'AMOUNT_DATE');
    }
    ctx.db.run('UPDATE bank_statements SET matched = ? WHERE statement_id = ?', result.matched.length, statementId);
  });
  ctx.audit.record({ type: 'bank.statement_imported', actor, subjectType: 'bank_statement', subjectId: statementId, data: { format: parsed.format, entries: result.entries, credits: result.credits, matched: result.matched.length, review: result.review.length, marked_test: parsed.markedTest }, testMode: ctx.config.testMode });
  return result;
}

/** Hat es in diesem Modus jemals einen erfolgreich importierten Kontoauszug gegeben? (= Bankabgleich eingerichtet) */
export function bankReconciliationActive(ctx: AppContext, test: boolean): boolean {
  return !!ctx.db.get('SELECT 1 AS x FROM bank_statements WHERE test_mode = ? LIMIT 1', test ? 1 : 0);
}

/**
 * NUR TESTBETRIEB: erzeugt einen eindeutig als TEST gekennzeichneten camt.053-Auszug mit je einer Gutschrift pro
 * offener Auszahlung (Buchung einen Tag nach der Meldung). Dient als „gesonderter Bank-Testbeleg“ (End-to-End-Plan A.10).
 */
export function buildTestCamt053(ctx: AppContext): string {
  if (!ctx.config.testMode) throw new WorkflowError('TEST_ONLY');
  const open = ctx.db.all<OpenPayout>(`SELECT payout_id, provider_payout_id, amount_minor, currency, created_at, order_ids_json FROM payouts WHERE test_mode = 1 AND status = 'SENT' AND bank_credit_confirmed = 0 ORDER BY created_at`);
  const day = (iso: string): string => new Date(Date.parse(iso) + 86_400_000).toISOString().slice(0, 10);
  const id = `TEST-${ctx.clock().toISOString().slice(0, 10)}-${open.length}`;
  const entries = open.map((p, i) => `
      <Ntry><NtryRef>${i + 1}</NtryRef><Amt Ccy="${p.currency}">${(p.amount_minor / 100).toFixed(2)}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>${day(p.created_at)}</Dt></BookgDt><ValDt><Dt>${day(p.created_at)}</Dt></ValDt><AcctSvcrRef>TESTBANK-${i + 1}</AcctSvcrRef>
        <NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Zahlungsanbieter (Test)</Nm></Dbtr></RltdPties><RmtInf><Ustrd>Auszahlung ${p.provider_payout_id}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>${id}</MsgId><CreDtTm>${ctx.clock().toISOString()}</CreDtTm><AddtlInf>TESTDATEN – kein echter Kontoauszug</AddtlInf></GrpHdr>
    <Stmt><Id>${id}</Id><Acct><Id><IBAN>${TEST_IBAN}</IBAN></Id></Acct>${entries}
    </Stmt>
  </BkToCstmrStmt>
</Document>
`;
}
