import { resolve } from 'node:path';
import { policyFromEnv, type Policy } from '../../../packages/policies/src/policy.ts';
import { randomToken } from '../../../packages/shared/src/crypto.ts';

/** In M0 existiert kein Live-Modus. Jeder Versuch, ihn einzuschalten, verweigert den Start. */
export const LIVE_MODE_IMPLEMENTED = false as const;

export type Environment = 'development' | 'test' | 'staging';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface SellerConfig {
  name: string | null;
  address: string | null;
  taxId: string | null;
  country: string | null;
  /** Für FatturaPA (Sitz Italien): CAP, Comune, Provinz, Codice Fiscale, Steuerregime RF01/RF19. */
  postcode: string | null;
  city: string | null;
  province: string | null;
  fiscalCode: string | null;
  regime: 'RF01' | 'RF19' | null;
}

export interface AppConfig {
  environment: Environment;
  testMode: true;
  host: string;
  port: number;
  publicOrigin: string;
  secureCookies: boolean;
  dbPath: string;
  migrationsDir: string;
  artifactsDir: string;
  exportsDir: string;
  ownerPasswordHash: string | null;
  sessionTtlMinutes: number;
  downloadSigningKey: string;
  downloadTtlMinutes: number;
  payment: { provider: 'mock' | 'stripe'; webhookSecret: string; stripeKeyMode: 'unset' | 'test'; stripeSecretKey: string | null; stripeApiBase: string };
  seller: SellerConfig;
  legalJurisdiction: string | null;
  ownerBusinessVerified: boolean;
  /** Vom Eigentümer per Konfiguration erteilte Entscheidungen (werden beim Start einmalig, protokolliert angewendet). */
  ownerDecisions: { seatCountry: string | null; allowedCapabilities: string[] | null; tedTermsLabel: string | null; reference: string };
  sdiChannelConfigured: boolean;
  taxReserveEstimateBps: number | null;
  /** Auszahlungsfrist des Zahlungsanbieters in Tagen (vom Eigentümer eingetragen); null = kein Datum vorhersagen. */
  payoutDelayDays: number | null;
  ai: { dailyTaskLimit: number };
  freeTier: { dailyRequestLimit: number; throttleAtBps: number };
  policy: Policy;
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const unset = (v: string | undefined): boolean => {
  const t = (v ?? '').trim();
  return t === '' || t === 'NOT_SET' || t === 'NOT_CONFIGURED' || t.startsWith('REPLACE_ME');
};

function intEnv(env: Env, key: string, def: number, min: number, max: number, warnings: string[]): number {
  const raw = env[key];
  if (unset(raw)) return def;
  const n = Number((raw as string).trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    warnings.push(`${key} ungültig – Standard ${def} verwendet.`);
    return def;
  }
  return n;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const warnings: string[] = [];
  const rawEnv = (env.ENVIRONMENT ?? 'development').trim();
  if (rawEnv === 'live' || rawEnv === 'production') {
    throw new ConfigError('ENVIRONMENT=live ist in M0 gesperrt. Live-Betrieb erst nach M3 (docs/compliance/live-activation-checklist.md).');
  }
  if (rawEnv !== 'development' && rawEnv !== 'test' && rawEnv !== 'staging') {
    throw new ConfigError(`Unbekannte ENVIRONMENT "${rawEnv}" (erlaubt: development, test, staging).`);
  }
  const environment: Environment = rawEnv;
  const strict = environment === 'staging';

  const { policy, warnings: pw } = policyFromEnv(env);
  warnings.push(...pw);
  if (policy.liveSalesEnabled || !LIVE_MODE_IMPLEMENTED && env.LIVE_SALES_ENABLED?.trim() === 'true') {
    throw new ConfigError('LIVE_SALES_ENABLED=true ist gesperrt, bis die Live-Aktivierungs-Checkliste (M3) vollständig freigegeben ist.');
  }

  const stripeKey = (env.STRIPE_SECRET_KEY ?? '').trim();
  if (/^(sk|rk)_live_/.test(stripeKey) || /^whsec_live/.test((env.STRIPE_WEBHOOK_SECRET ?? '').trim())) {
    throw new ConfigError('Live-Zahlungsschlüssel in Nicht-Live-Umgebung erkannt – Start verweigert (Test/Live-Trennung).');
  }
  const stripeKeyMode: 'unset' | 'test' = /^(sk|rk)_test_/.test(stripeKey) ? 'test' : 'unset';

  const provider = (env.PAYMENT_PROVIDER ?? 'mock').trim();
  if (provider !== 'mock' && provider !== 'stripe') {
    throw new ConfigError(`PAYMENT_PROVIDER=${provider} ist unbekannt (erlaubt: mock, stripe).`);
  }

  let webhookSecret: string;
  let stripeSecretKey: string | null = null;
  if (provider === 'stripe') {
    // M2: ausschließlich Stripe-TESTMODUS. Live-Schlüssel wurden oben bereits abgewiesen.
    if (stripeKeyMode !== 'test') throw new ConfigError('PAYMENT_PROVIDER=stripe erfordert einen Test-Schlüssel (sk_test_… oder rk_test_…) in STRIPE_SECRET_KEY.');
    const whsec = (env.STRIPE_WEBHOOK_SECRET ?? '').trim();
    if (!/^whsec_[A-Za-z0-9]{16,}$/.test(whsec)) throw new ConfigError('PAYMENT_PROVIDER=stripe erfordert STRIPE_WEBHOOK_SECRET (whsec_…) aus dem Stripe-Testmodus bzw. der Stripe CLI.');
    webhookSecret = whsec;
    stripeSecretKey = stripeKey;
  } else {
    webhookSecret = (env.MOCK_WEBHOOK_SECRET ?? '').trim();
    if (unset(webhookSecret) || webhookSecret.length < 24) {
      if (strict) throw new ConfigError('MOCK_WEBHOOK_SECRET fehlt oder ist kürzer als 24 Zeichen.');
      webhookSecret = `whsec_dev_${randomToken(24)}`;
      warnings.push('MOCK_WEBHOOK_SECRET nicht gesetzt – zufälliger Prozess-Schlüssel erzeugt.');
    }
  }

  let downloadSigningKey = (env.DOWNLOAD_SIGNING_KEY ?? '').trim();
  if (unset(downloadSigningKey) || downloadSigningKey.length < 32) {
    if (strict) throw new ConfigError('DOWNLOAD_SIGNING_KEY fehlt oder ist kürzer als 32 Zeichen.');
    downloadSigningKey = randomToken(32);
    warnings.push('DOWNLOAD_SIGNING_KEY nicht gesetzt – zufälliger Prozess-Schlüssel erzeugt (Links ungültig nach Neustart).');
  }

  const rawHash = (env.OWNER_PASSWORD_HASH ?? '').trim();
  const ownerPasswordHash = rawHash.startsWith('scrypt$') ? rawHash : null;
  if (!ownerPasswordHash) warnings.push('OWNER_PASSWORD_HASH nicht gesetzt – Owner-Login deaktiviert (npm run owner:password).');

  const dbUrl = (env.DATABASE_URL ?? '').trim();
  const dbPath = unset(dbUrl) ? './data/infinity-earn.sqlite' : dbUrl.replace(/^file:/, '');
  const port = intEnv(env, 'PORT', 8787, 0, 65535, warnings);
  const host = unset(env.HOST) ? '127.0.0.1' : (env.HOST as string).trim();
  const publicOrigin = unset(env.APP_PUBLIC_ORIGIN) ? `http://localhost:${port}` : (env.APP_PUBLIC_ORIGIN as string).trim();

  const reserveRaw = env.TAX_RESERVE_ESTIMATE_BPS;
  const taxReserveEstimateBps = unset(reserveRaw) ? null : intEnv(env, 'TAX_RESERVE_ESTIMATE_BPS', 0, 0, 9999, warnings);
  const payoutDelayDays = unset(env.PAYOUT_DELAY_DAYS) ? null : intEnv(env, 'PAYOUT_DELAY_DAYS', 7, 0, 60, warnings);

  return {
    environment,
    testMode: true,
    host,
    port,
    publicOrigin,
    secureCookies: publicOrigin.startsWith('https://'),
    dbPath: dbPath === ':memory:' ? dbPath : resolve(dbPath),
    migrationsDir: resolve(unset(env.MIGRATIONS_DIR) ? './db/migrations' : (env.MIGRATIONS_DIR as string)),
    artifactsDir: resolve(unset(env.ARTIFACTS_DIR) ? './data/artifacts' : (env.ARTIFACTS_DIR as string)),
    exportsDir: resolve(unset(env.EXPORTS_DIR) ? './data/exports' : (env.EXPORTS_DIR as string)),
    ownerPasswordHash,
    sessionTtlMinutes: intEnv(env, 'SESSION_TTL_MINUTES', 480, 5, 1440, warnings),
    downloadSigningKey,
    downloadTtlMinutes: intEnv(env, 'DOWNLOAD_TTL_MINUTES', 1440, 1, 10080, warnings),
    payment: { provider, webhookSecret, stripeKeyMode, stripeSecretKey, stripeApiBase: unset(env.STRIPE_API_BASE) ? 'https://api.stripe.com' : (env.STRIPE_API_BASE as string).trim() },
    seller: {
      name: unset(env.SELLER_NAME) ? null : (env.SELLER_NAME as string).trim(),
      address: unset(env.SELLER_ADDRESS) ? null : (env.SELLER_ADDRESS as string).trim(),
      taxId: unset(env.SELLER_TAX_ID) ? null : (env.SELLER_TAX_ID as string).trim(),
      country: unset(env.SELLER_COUNTRY) ? null : (env.SELLER_COUNTRY as string).trim().toUpperCase(),
      postcode: unset(env.SELLER_POSTCODE) ? null : (env.SELLER_POSTCODE as string).trim(),
      city: unset(env.SELLER_CITY) ? null : (env.SELLER_CITY as string).trim(),
      province: unset(env.SELLER_PROVINCE) ? null : (env.SELLER_PROVINCE as string).trim().toUpperCase(),
      fiscalCode: unset(env.SELLER_FISCAL_CODE) ? null : (env.SELLER_FISCAL_CODE as string).trim().toUpperCase(),
      regime: env.SELLER_REGIME === 'RF01' || env.SELLER_REGIME === 'RF19' ? env.SELLER_REGIME : null,
    },
    legalJurisdiction: unset(env.LEGAL_JURISDICTION) ? null : (env.LEGAL_JURISDICTION as string).trim(),
    ownerBusinessVerified: (env.OWNER_BUSINESS_STATUS ?? '').trim() === 'VERIFIED',
    ownerDecisions: {
      seatCountry: unset(env.OWNER_SEAT_COUNTRY) ? null : (env.OWNER_SEAT_COUNTRY as string).trim().toUpperCase(),
      allowedCapabilities: unset(env.OWNER_ALLOWED_CAPABILITIES) ? null : (env.OWNER_ALLOWED_CAPABILITIES as string).split(',').map((s) => s.trim()).filter(Boolean),
      tedTermsLabel: unset(env.OWNER_APPROVE_TED_TERMS) ? null : (env.OWNER_APPROVE_TED_TERMS as string).trim(),
      reference: unset(env.OWNER_DECISION_REF) ? 'Konfiguration' : (env.OWNER_DECISION_REF as string).trim().slice(0, 200),
    },
    sdiChannelConfigured: (env.SDI_CHANNEL_CONFIGURED ?? '').trim() === 'true',
    taxReserveEstimateBps,
    payoutDelayDays,
    ai: { dailyTaskLimit: intEnv(env, 'AI_DAILY_TASK_LIMIT', 0, 0, 100000, warnings) },
    freeTier: {
      dailyRequestLimit: intEnv(env, 'FREE_TIER_DAILY_REQUEST_LIMIT', 100000, 1, 1e9, warnings),
      throttleAtBps: intEnv(env, 'FREE_TIER_THROTTLE_AT_BPS', 8000, 1, 10000, warnings),
    },
    policy,
    warnings,
  };
}
