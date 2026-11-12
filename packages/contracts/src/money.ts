/**
 * Money is always handled as integer minor units (e.g. cents). No floats.
 * Unknown currencies are rejected instead of guessed (IE-030).
 */
const MINOR_UNITS: Readonly<Record<string, number>> = {
  EUR: 2, USD: 2, GBP: 2, CHF: 2, SEK: 2, DKK: 2, PLN: 2, CZK: 2,
  JPY: 0, KRW: 0, HUF: 2,
  KWD: 3, BHD: 3, TND: 3, JOD: 3, OMR: 3,
};

export function minorUnits(currency: string): number {
  const digits = MINOR_UNITS[currency];
  if (digits === undefined) throw new Error(`UNSUPPORTED_CURRENCY:${currency}`);
  return digits;
}

export function assertMinor(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value)) throw new Error(`INVALID_MINOR_AMOUNT:${label}`);
}

/** Parses a decimal string ("12.5") into minor units without floating point. */
export function toMinor(amount: string, currency: string): number {
  const digits = minorUnits(currency);
  const m = /^(-?)(\d{1,15})(?:[.,](\d+))?$/.exec(amount.trim());
  if (!m) throw new Error('INVALID_AMOUNT');
  const sign = m[1] ?? '';
  const intPart = m[2] ?? '0';
  const frac = m[3] ?? '';
  if (frac.length > digits) throw new Error('TOO_MANY_DECIMALS');
  const minor = Number(BigInt(intPart + frac.padEnd(digits, '0')));
  if (!Number.isSafeInteger(minor)) throw new Error('AMOUNT_OUT_OF_RANGE');
  return sign === '-' ? -minor : minor;
}

export function formatMinor(minor: number, currency: string): string {
  assertMinor(minor);
  const digits = minorUnits(currency);
  const neg = minor < 0;
  const abs = String(Math.abs(minor)).padStart(digits + 1, '0');
  const int = digits === 0 ? abs : abs.slice(0, -digits);
  const frac = digits === 0 ? '' : `.${abs.slice(-digits)}`;
  return `${neg ? '-' : ''}${int}${frac}`;
}

/** Minimal price so that (price - cost) / price >= marginBps / 10000, rounded up. */
export function priceFromCost(costMinor: number, marginBps: number): number {
  assertMinor(costMinor, 'cost');
  if (!Number.isInteger(marginBps) || marginBps < 0 || marginBps >= 10000) throw new Error('INVALID_MARGIN_BPS');
  const denom = 10000n - BigInt(marginBps);
  const price = (BigInt(costMinor) * 10000n + denom - 1n) / denom;
  return Number(price);
}

/** Margin in basis points, floored. Non-positive price -> -Infinity (never profitable). */
export function marginBps(priceMinor: number, costMinor: number): number {
  if (priceMinor <= 0) return Number.NEGATIVE_INFINITY;
  return Math.floor(((priceMinor - costMinor) * 10000) / priceMinor);
}

/** Exact integer percentage of an amount in bps, rounded up. */
export function bpsOf(amountMinor: number, bps: number): number {
  return Number((BigInt(amountMinor) * BigInt(bps) + 9999n) / 10000n);
}
