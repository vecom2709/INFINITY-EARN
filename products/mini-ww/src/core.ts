import type { Line, Role, SequenceName, Store, Totals, User } from './model.ts';

/** Fachlicher Fehler mit stabilem Code (für Oberfläche und Tests) und verständlicher Meldung. */
export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = 'DomainError';
  }
}

export interface Ctx { userId: string; now: Date }

/**
 * Atomare Operation: läuft auf einer Kopie und wird nur bei Erfolg übernommen. Schlägt eine Regel fehl,
 * bleibt der Datenbestand unverändert – es gibt keine halben Buchungen.
 */
export function transact<T>(store: Store, fn: (draft: Store) => T): { store: Store; result: T } {
  const draft = structuredClone(store);
  const result = fn(draft);
  return { store: draft, result };
}

export function user(s: Store, ctx: Ctx): User {
  const u = s.users.find((x) => x.id === ctx.userId);
  if (!u) throw new DomainError('UNKNOWN_USER', 'Unbekannter Benutzer.');
  return u;
}

/** Ablaufregel (Offline-Fassung: kein Sicherheitsschutz, sondern Schutz vor Versehen). */
export function requireRole(s: Store, ctx: Ctx, role: Role, what: string): User {
  const u = user(s, ctx);
  if (role === 'OWNER' && u.role !== 'OWNER') throw new DomainError('FORBIDDEN', `Nur der Inhaber darf: ${what}.`);
  return u;
}

export function nextId(s: Store, prefix: string): string {
  s.seq += 1;
  return `${prefix}${s.seq}`;
}

/** Vergibt die nächste Nummer eines Nummernkreises – nur im Moment der Festschreibung, daher lückenlos. */
export function takeNumber(s: Store, name: SequenceName): string {
  const seq = s.settings.sequences[name];
  const n = `${seq.prefix}${String(seq.next).padStart(5, '0')}`;
  seq.next += 1;
  return n;
}

export function audit(s: Store, ctx: Ctx, action: string, ref: string, data: Record<string, unknown> = {}): void {
  s.seq += 1;
  s.audit.push({ seq: s.seq, at: ctx.now.toISOString(), userId: ctx.userId, action, ref, data });
}

export const iso = (d: Date): string => d.toISOString();
export const day = (d: Date): string => d.toISOString().slice(0, 10);
export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return day(d);
}

export function requirePositiveInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n <= 0) throw new DomainError('INVALID_QUANTITY', `${what} muss eine ganze Zahl größer 0 sein.`);
}

export function requireMoney(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new DomainError('INVALID_AMOUNT', `${what} muss ein Betrag ≥ 0 in Cent sein.`);
}

/** Kaufmännisch runden (half up) für ganze Cent. */
export function roundHalfUp(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
}

/** Summen: Netto je Zeile, Steuer je Steuersatz auf die Nettosumme gerundet, Brutto = Netto + Steuer. */
export function computeTotals(lines: Line[]): Totals {
  const byRate = new Map<number, number>();
  let net = 0;
  for (const l of lines) {
    const n = l.qty * l.priceMinor;
    net += n;
    byRate.set(l.taxBps, (byRate.get(l.taxBps) ?? 0) + n);
  }
  const rates = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([bps, netMinor]) => ({ bps, netMinor, taxMinor: roundHalfUp((netMinor * bps) / 10000) }));
  const tax = rates.reduce((a, r) => a + r.taxMinor, 0);
  return { netMinor: net, taxMinor: tax, grossMinor: net + tax, byRate: rates };
}

export function formatMoney(minor: number, currency = 'EUR'): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(abs % 100).padStart(2, '0')} ${currency === 'EUR' ? '€' : currency}`;
}
