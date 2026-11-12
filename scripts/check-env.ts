import { readFileSync } from 'node:fs';
import { containsSecret } from '../packages/events/src/redact.ts';
import { ConfigError, loadConfig } from '../services/core-api/src/config.ts';

/** Env-/Schema-Check: Konfiguration laden (fail-closed) und .env.example auf echte Geheimnisse prüfen. */
let failed = false;
try {
  const c = loadConfig();
  console.log(`OK  ENVIRONMENT=${c.environment} · Modus=TEST · Provider=${c.payment.provider} · DB=${c.dbPath}`);
  console.log(`OK  Policy: Fixkosten=${c.policy.maxNewMonthlyFixedCostEur} €, PaidAPIs=${c.policy.allowPaidApis}, Live=${c.policy.liveSalesEnabled}, Outreach=${c.policy.autoMarketingOutreach}, UnreviewedDeploy=${c.policy.allowUnreviewedDeploy}`);
  c.warnings.forEach((w) => console.log(`WARN ${w}`));
} catch (e) {
  failed = true;
  console.error(e instanceof ConfigError ? `FAIL ${e.message}` : e);
}
const example = readFileSync('.env.example', 'utf8');
if (containsSecret(example)) {
  failed = true;
  console.error('FAIL .env.example enthält einen echt aussehenden Schlüssel.');
} else console.log('OK  .env.example enthält keine Geheimnisse.');
process.exit(failed ? 1 : 0);
