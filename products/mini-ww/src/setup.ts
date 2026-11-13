import { DomainError } from './core.ts';
import type { SequenceName, Store, TaxRate } from './model.ts';

/**
 * Einrichtung aus dem Kundenauftrag (Pilot P3): Steuersätze, Nummernkreise und Zahlungsziel werden beim Bau des
 * Programms festgelegt und beim ersten Start angewendet. Ungültige Angaben werden abgelehnt – nie stillschweigend ersetzt.
 */
export interface Setup {
  taxRates: TaxRate[];
  prefixes: Record<SequenceName, string>;
  paymentTermDays: number;
}

export const SEQUENCE_NAMES: readonly SequenceName[] = ['quote', 'order', 'delivery', 'invoice', 'credit'];

export const DEFAULT_SETUP: Setup = {
  taxRates: [{ id: 'std', label: 'Standard 22 %', bps: 2200 }, { id: 'red', label: 'Ermäßigt 10 %', bps: 1000 }, { id: 'zero', label: '0 %', bps: 0 }],
  prefixes: { quote: 'AN-', order: 'AU-', delivery: 'LS-', invoice: 'RE-', credit: 'GU-' },
  paymentTermDays: 14,
};

const fail = (msg: string): never => {
  throw new DomainError('INVALID_SETUP', msg);
};

/** Prüft Rohdaten aus dem Auftrag; fehlende Teile werden mit den Standardwerten ergänzt. */
export function validateSetup(raw: unknown): Setup {
  if (raw === undefined || raw === null) return structuredClone(DEFAULT_SETUP);
  if (typeof raw !== 'object' || Array.isArray(raw)) return fail('Einrichtung muss ein Objekt sein.');
  const r = raw as { taxRates?: unknown; prefixes?: unknown; paymentTermDays?: unknown };
  let taxRates = DEFAULT_SETUP.taxRates;
  if (r.taxRates !== undefined) {
    if (!Array.isArray(r.taxRates) || r.taxRates.length < 1 || r.taxRates.length > 6) fail('1 bis 6 Steuersätze erforderlich.');
    taxRates = (r.taxRates as unknown[]).map((t) => {
      const x = t as Partial<TaxRate>;
      if (typeof x.id !== 'string' || !/^[a-z0-9]{1,8}$/.test(x.id)) fail(`Steuersatz-Kennung ungültig: ${String(x.id)}`);
      if (typeof x.label !== 'string' || !x.label.trim() || x.label.length > 40) fail(`Bezeichnung des Steuersatzes ${String(x.id)} fehlt oder ist zu lang.`);
      if (!Number.isSafeInteger(x.bps) || (x.bps as number) < 0 || (x.bps as number) > 10000) fail(`Steuersatz ${String(x.id)} muss zwischen 0 und 100 % liegen.`);
      return { id: x.id as string, label: (x.label as string).trim(), bps: x.bps as number };
    });
    if (new Set(taxRates.map((t) => t.id)).size !== taxRates.length) fail('Steuersatz-Kennungen doppelt.');
    if (!taxRates.some((t) => t.id === 'std')) fail('Ein Standardsteuersatz mit der Kennung „std“ ist erforderlich.');
  }
  const prefixes = { ...DEFAULT_SETUP.prefixes };
  if (r.prefixes !== undefined) {
    if (typeof r.prefixes !== 'object' || r.prefixes === null || Array.isArray(r.prefixes)) fail('Nummernkreise müssen ein Objekt sein.');
    for (const [k, v] of Object.entries(r.prefixes as Record<string, unknown>)) {
      if (!SEQUENCE_NAMES.includes(k as SequenceName)) fail(`Unbekannter Nummernkreis: ${k}`);
      if (typeof v !== 'string' || !/^[A-Z0-9][A-Z0-9/-]{0,7}$/.test(v)) fail(`Präfix für ${k} ungültig (1–8 Zeichen A–Z, 0–9, - oder /).`);
      prefixes[k as SequenceName] = v as string;
    }
    if (new Set(Object.values(prefixes)).size !== SEQUENCE_NAMES.length) fail('Jeder Nummernkreis braucht ein eigenes Präfix.');
  }
  let paymentTermDays = DEFAULT_SETUP.paymentTermDays;
  if (r.paymentTermDays !== undefined) {
    if (!Number.isSafeInteger(r.paymentTermDays) || (r.paymentTermDays as number) < 1 || (r.paymentTermDays as number) > 120) fail('Zahlungsziel muss 1 bis 120 Tage betragen.');
    paymentTermDays = r.paymentTermDays as number;
  }
  return { taxRates: taxRates.map((t) => ({ ...t })), prefixes, paymentTermDays };
}

/** Wendet die Einrichtung auf einen noch leeren Bestand an (Erststart). */
export function applySetup(store: Store, setup: Setup): Store {
  if (store.articles.length || store.invoices.length || store.quotes.length || store.orders.length) fail('Einrichtung nur bei leerem Bestand möglich.');
  const s = structuredClone(store);
  s.settings.taxRates = setup.taxRates.map((t) => ({ ...t }));
  for (const n of SEQUENCE_NAMES) s.settings.sequences[n] = { prefix: setup.prefixes[n], next: 1 };
  s.settings.paymentTermDays = setup.paymentTermDays;
  return s;
}
