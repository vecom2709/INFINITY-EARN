/**
 * Eigentümer-Policy. Liegt AUSSERHALB jeder LLM-Logik und kann von keinem Agenten verändert werden.
 * Fail-closed: Nur der exakte String "true" schaltet eine Erlaubnis ein.
 */
export interface QuotePolicy {
  currency: string;
  minMinor: number;
  maxMinor: number;
  minMarginBps: number;
}

export interface Policy {
  maxNewMonthlyFixedCostEur: number;
  allowPaidApis: boolean;
  allowAutoUpgrade: boolean;
  allowPaidAds: boolean;
  allowNewFinancialCommitments: boolean;
  liveSalesEnabled: boolean;
  autoMarketingOutreach: boolean;
  allowUnreviewedDeploy: boolean;
  quote: QuotePolicy;
  allowedCapabilities: readonly string[];
}

export const SAFE_DEFAULT_POLICY: Policy = Object.freeze({
  maxNewMonthlyFixedCostEur: 0,
  allowPaidApis: false,
  allowAutoUpgrade: false,
  allowPaidAds: false,
  allowNewFinancialCommitments: false,
  liveSalesEnabled: false,
  autoMarketingOutreach: false,
  allowUnreviewedDeploy: false,
  quote: Object.freeze({ currency: 'EUR', minMinor: 5000, maxMinor: 200000, minMarginBps: 3000 }),
  allowedCapabilities: Object.freeze(['b2b-calc-csv']),
});

const BOOL_ENV = {
  allowPaidApis: 'ALLOW_PAID_APIS',
  allowAutoUpgrade: 'ALLOW_AUTO_UPGRADE',
  allowPaidAds: 'ALLOW_PAID_ADS',
  allowNewFinancialCommitments: 'ALLOW_NEW_FINANCIAL_COMMITMENTS',
  liveSalesEnabled: 'LIVE_SALES_ENABLED',
  autoMarketingOutreach: 'AUTO_MARKETING_OUTREACH',
  allowUnreviewedDeploy: 'ALLOW_UNREVIEWED_DEPLOY',
} as const;

type Env = Record<string, string | undefined>;

function parseBool(env: Env, key: string, warnings: string[]): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '' || raw.trim() === 'false') return false;
  if (raw.trim() === 'true') return true;
  warnings.push(`${key}="${raw}" ist kein gültiger Wert – sicherer Standard (false) verwendet.`);
  return false;
}

function parseInt0(env: Env, key: string, def: number, min: number, max: number, warnings: string[]): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return def;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    warnings.push(`${key}="${raw}" ungültig – Standard ${def} verwendet.`);
    return def;
  }
  return n;
}

export function policyFromEnv(env: Env): { policy: Policy; warnings: string[] } {
  const warnings: string[] = [];
  const bools = Object.fromEntries(
    Object.entries(BOOL_ENV).map(([field, key]) => [field, parseBool(env, key, warnings)]),
  ) as Record<keyof typeof BOOL_ENV, boolean>;

  let maxCost = 0;
  const rawCost = env.MAX_NEW_MONTHLY_FIXED_COST_EUR;
  if (rawCost !== undefined && rawCost.trim() !== '') {
    const n = Number(rawCost.trim());
    if (Number.isFinite(n) && n >= 0) maxCost = n;
    else warnings.push(`MAX_NEW_MONTHLY_FIXED_COST_EUR="${rawCost}" ungültig – 0 verwendet.`);
  }

  const d = SAFE_DEFAULT_POLICY.quote;
  const currencyRaw = (env.QUOTE_CURRENCY ?? d.currency).trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : d.currency;
  const quote: QuotePolicy = {
    currency,
    minMinor: parseInt0(env, 'QUOTE_MIN_MINOR', d.minMinor, 0, 1e12, warnings),
    maxMinor: parseInt0(env, 'QUOTE_MAX_MINOR', d.maxMinor, 0, 1e12, warnings),
    minMarginBps: parseInt0(env, 'QUOTE_MIN_MARGIN_BPS', d.minMarginBps, 0, 9999, warnings),
  };
  const caps = (env.ALLOWED_CAPABILITIES ?? SAFE_DEFAULT_POLICY.allowedCapabilities.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const policy: Policy = { ...bools, maxNewMonthlyFixedCostEur: maxCost, quote, allowedCapabilities: caps };
  const problems = validatePolicy(policy);
  if (problems.length > 0) {
    warnings.push(...problems.map((p) => `Policy ungültig (${p}) – sichere Standard-Policy verwendet.`));
    return { policy: SAFE_DEFAULT_POLICY, warnings };
  }
  return { policy, warnings };
}

export function validatePolicy(p: Policy): string[] {
  const errs: string[] = [];
  if (!(p.maxNewMonthlyFixedCostEur >= 0)) errs.push('maxNewMonthlyFixedCostEur < 0');
  if (p.quote.maxMinor < p.quote.minMinor) errs.push('quote.maxMinor < quote.minMinor');
  if (p.quote.minMarginBps < 0 || p.quote.minMarginBps > 9999) errs.push('quote.minMarginBps außerhalb 0..9999');
  if (!/^[A-Z]{3}$/.test(p.quote.currency)) errs.push('quote.currency ungültig');
  return errs;
}

/** Die strengere von zwei Policies (Env ∩ freigegebene DB-Policy). Lockern erfordert beide Quellen. */
export function mostRestrictive(a: Policy, b: Policy): Policy {
  const sameCurrency = a.quote.currency === b.quote.currency;
  return {
    maxNewMonthlyFixedCostEur: Math.min(a.maxNewMonthlyFixedCostEur, b.maxNewMonthlyFixedCostEur),
    allowPaidApis: a.allowPaidApis && b.allowPaidApis,
    allowAutoUpgrade: a.allowAutoUpgrade && b.allowAutoUpgrade,
    allowPaidAds: a.allowPaidAds && b.allowPaidAds,
    allowNewFinancialCommitments: a.allowNewFinancialCommitments && b.allowNewFinancialCommitments,
    liveSalesEnabled: a.liveSalesEnabled && b.liveSalesEnabled,
    autoMarketingOutreach: a.autoMarketingOutreach && b.autoMarketingOutreach,
    allowUnreviewedDeploy: a.allowUnreviewedDeploy && b.allowUnreviewedDeploy,
    quote: {
      currency: a.quote.currency,
      minMinor: Math.max(a.quote.minMinor, b.quote.minMinor),
      // Abweichende Währungen -> keine Angebote möglich (fail-closed).
      maxMinor: sameCurrency ? Math.min(a.quote.maxMinor, b.quote.maxMinor) : 0,
      minMarginBps: Math.max(a.quote.minMarginBps, b.quote.minMarginBps),
    },
    allowedCapabilities: a.allowedCapabilities.filter((c) => b.allowedCapabilities.includes(c)),
  };
}

export function parsePolicyJson(json: string): Policy | null {
  try {
    const p = JSON.parse(json) as Policy;
    if (typeof p !== 'object' || p === null || typeof p.quote !== 'object' || !Array.isArray(p.allowedCapabilities)) return null;
    for (const k of Object.keys(BOOL_ENV)) {
      if (typeof (p as unknown as Record<string, unknown>)[k] !== 'boolean') return null;
    }
    return validatePolicy(p).length === 0 ? p : null;
  } catch {
    return null;
  }
}
