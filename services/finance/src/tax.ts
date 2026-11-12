/**
 * Steuerkontext-Auflösung. Grundsatz: KEINE pauschale USt-Berechnung (IE-066).
 * In M0 existieren keine fachlich freigegebenen Steuerregeln; ohne Freigabe -> Prüfung.
 */
export const EU_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

export interface TaxInput {
  sellerCountry: string | null;
  buyerCountry: string;
  buyerType: 'B2B' | 'B2C';
  buyerVatId: string | null;
  jurisdictionConfigured: boolean;
  sdiChannelConfigured: boolean;
  testMode: boolean;
}

export type TaxResolution =
  | { status: 'TEST_NO_TAX'; context: 'TEST_NO_TAX_CALCULATION'; requiredFormat: 'NONE' }
  | { status: 'REVIEW'; context: string; reason: string; requiredFormat: 'NONE' | 'XML_FATTURAPA' };

export function resolveTaxContext(i: TaxInput): TaxResolution {
  const italian = i.sellerCountry === 'IT' || i.buyerCountry === 'IT';
  if (italian && !i.sdiChannelConfigured) {
    return { status: 'REVIEW', context: 'IT_SDI_REQUIRED', reason: 'SDI_CHANNEL_MISSING', requiredFormat: 'XML_FATTURAPA' };
  }
  if (i.buyerType === 'B2C' && EU_COUNTRIES.has(i.buyerCountry) && i.sellerCountry !== i.buyerCountry) {
    return { status: 'REVIEW', context: 'EU_B2C_CROSS_BORDER', reason: 'OSS_REVIEW_REQUIRED', requiredFormat: 'NONE' };
  }
  if (!i.jurisdictionConfigured) {
    return i.testMode
      ? { status: 'TEST_NO_TAX', context: 'TEST_NO_TAX_CALCULATION', requiredFormat: 'NONE' }
      : { status: 'REVIEW', context: 'UNCONFIGURED', reason: 'JURISDICTION_NOT_CONFIGURED', requiredFormat: 'NONE' };
  }
  return { status: 'REVIEW', context: 'NO_VERIFIED_RULE', reason: 'NO_VERIFIED_TAX_RULE', requiredFormat: 'NONE' };
}

/** PDF/JSON allein reicht nicht, wenn XML (FatturaPA via SdI) erforderlich ist (IE-065). */
export function checkOutputFormat(required: 'NONE' | 'XML_FATTURAPA', produced: ReadonlyArray<'PDF' | 'JSON' | 'TEXT' | 'XML_FATTURAPA'>): { ok: boolean; reason?: string } {
  if (required === 'XML_FATTURAPA' && !produced.includes('XML_FATTURAPA')) return { ok: false, reason: 'XML_REQUIRED_PDF_INSUFFICIENT' };
  return { ok: true };
}
