/**
 * Rechtliches Produkt-Gate (Masterprompt §5 "Schutz"). Deterministisch, blockiert im Zweifel.
 */
export const PROHIBITED_CATEGORIES: ReadonlySet<string> = new Set([
  'medical_opinion',
  'legal_opinion',
  'financial_advice',
  'scientific_expert_report',
  'weapons',
  'counterfeit',
  'gambling',
  'adult',
  'personal_data_trade',
]);

export const ALLOWED_ASSET_LICENSES: ReadonlySet<string> = new Set(['own_work', 'cc0', 'customer_owned_with_rights', 'licensed_commercial']);

export interface ScopeAsset {
  name: string;
  license: string;
}

export interface LegalScope {
  category?: string;
  assets?: ScopeAsset[];
}

export function legalGate(scope: LegalScope): { ok: true } | { ok: false; reason: string } {
  if (scope.category && PROHIBITED_CATEGORIES.has(scope.category)) {
    return { ok: false, reason: `PROHIBITED_CATEGORY:${scope.category}` };
  }
  for (const a of scope.assets ?? []) {
    if (!ALLOWED_ASSET_LICENSES.has(a.license)) return { ok: false, reason: `ASSET_LICENSE_RISK:${a.name}:${a.license}` };
  }
  return { ok: true };
}
