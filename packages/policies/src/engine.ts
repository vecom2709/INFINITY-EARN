import { marginBps } from '../../contracts/src/money.ts';
import type { Policy } from './policy.ts';

/**
 * Deterministische Policy-Engine. Kein LLM entscheidet hier. Jede Aktion mit externer,
 * finanzieller oder rechtlicher Wirkung muss durch evaluate() laufen.
 */
export type Actor = 'ai' | 'system' | 'owner' | 'customer' | 'provider';

export const STOP_NAMES = ['PAUSE_ACQUISITION', 'PAUSE_PRODUCTION', 'PAUSE_PAYMENTS', 'STOP_ALL_JOBS'] as const;
export type StopName = (typeof STOP_NAMES)[number];

export type PaymentState = 'UNPAID' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED' | 'DISPUTED';
export type LegalBasis = 'consent' | 'permitted_inbound' | 'other_reviewed' | 'none';

export type ActionRequest =
  | { action: 'quote.issue'; priceMinor: number; costMinor: number; currency: string }
  | {
      action: 'lead.contact';
      purpose: 'marketing' | 'transactional';
      legalBasis: LegalBasis;
      consentProofRef: string | null;
      consentWithdrawn: boolean;
      optedOut: boolean;
      automated: boolean;
    }
  | { action: 'marketing.outreach'; recipients: number }
  | { action: 'paid_api.enable'; service: string; monthlyCostEur: number }
  | { action: 'cost.commit'; amountEur: number; recurring: boolean; description: string }
  | { action: 'transfer.funds'; beneficiary: string; amountMinor: number }
  | { action: 'payout.beneficiary.change' }
  | { action: 'dependency.install'; name: string; license: string; requiresPayment: boolean }
  | { action: 'capability.use'; capabilityId: string }
  | { action: 'checkout.create'; testMode: boolean }
  | { action: 'production.start'; paymentState: PaymentState; feasibilityApproved: boolean; scopeValid: boolean }
  | { action: 'delivery.release'; paymentState: PaymentState; qaPassed: boolean }
  | { action: 'invoice.issue'; testMode: boolean }
  | { action: 'live.sale' }
  | { action: 'deploy'; target: 'staging' | 'live'; testsPassed: boolean; reviewed: boolean }
  | { action: 'job.run'; kind: string; production: boolean }
  | { action: 'refund.initiate'; amountMinor: number; capturedMinor: number; alreadyRefundedMinor: number };

export type ActionName = ActionRequest['action'];

export interface Decision {
  allowed: boolean;
  rule: string;
  reason: string;
}

export interface EngineContext {
  policy: Policy | null;
  stops: ReadonlySet<StopName>;
  actor: Actor;
}

const allow = (rule: string, reason = 'erlaubt'): Decision => ({ allowed: true, rule, reason });
const deny = (rule: string, reason: string): Decision => ({ allowed: false, rule, reason });

export const ALLOWED_DEPENDENCY_LICENSES: ReadonlySet<string> = new Set([
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'CC0-1.0', 'BlueOak-1.0.0',
]);

export function evaluate(req: ActionRequest, ctx: EngineContext): Decision {
  // Absolute Verbote – unabhängig von jeder Policy.
  if (req.action === 'transfer.funds') {
    return deny('NO_SOFTWARE_TRANSFERS', 'Überweisungen an Begünstigte sind nie automatisiert; nur Eigentümer im Provider-UI.');
  }
  if (req.action === 'payout.beneficiary.change') {
    return deny('OWNER_PROVIDER_UI_ONLY', 'Auszahlungskonto nur durch Eigentümer mit KYC im Provider-UI änderbar.');
  }

  const p = ctx.policy;
  if (!p) return deny('NO_POLICY', 'Keine gültige Eigentümer-Policy geladen – alle Aktionen blockiert.');
  const stopAll = ctx.stops.has('STOP_ALL_JOBS');

  switch (req.action) {
    case 'quote.issue': {
      if (stopAll || ctx.stops.has('PAUSE_ACQUISITION')) return deny('EMERGENCY_STOP', 'Notstopp aktiv.');
      if (req.currency !== p.quote.currency) return deny('QUOTE_CURRENCY', `Nur ${p.quote.currency} zulässig.`);
      if (!Number.isSafeInteger(req.priceMinor) || !Number.isSafeInteger(req.costMinor)) return deny('QUOTE_INVALID', 'Ungültige Beträge.');
      if (req.priceMinor - req.costMinor <= 0) return deny('NEGATIVE_MARGIN', 'Negativer Deckungsbeitrag.');
      if (marginBps(req.priceMinor, req.costMinor) < p.quote.minMarginBps) return deny('MARGIN_BELOW_MIN', 'Marge unter Policy-Minimum.');
      if (req.priceMinor > p.quote.maxMinor) return deny('QUOTE_ABOVE_MAX', 'Preis über Maximalwert der Policy.');
      if (req.priceMinor < p.quote.minMinor) return deny('QUOTE_BELOW_MIN', 'Preis unter Mindestwert der Policy.');
      return allow('QUOTE_WITHIN_POLICY');
    }
    case 'lead.contact': {
      if (stopAll || ctx.stops.has('PAUSE_ACQUISITION')) return deny('EMERGENCY_STOP', 'Notstopp aktiv.');
      if (req.purpose === 'marketing') {
        if (req.optedOut || req.consentWithdrawn) return deny('OPTED_OUT', 'Abmeldung/Widerruf liegt vor.');
        if (req.legalBasis !== 'consent' || !req.consentProofRef) return deny('CONSENT_MISSING', 'Keine nachweisbare Einwilligung.');
        if (req.automated && !p.autoMarketingOutreach) return deny('AUTO_OUTREACH_DISABLED', 'Automatisierte Werbung per Policy aus.');
        return allow('MARKETING_CONSENT_VALID');
      }
      if (req.legalBasis === 'consent' || req.legalBasis === 'permitted_inbound') return allow('TRANSACTIONAL_BASIS');
      return deny('NO_LEGAL_BASIS', 'Keine Rechtsgrundlage für Kontaktaufnahme.');
    }
    case 'marketing.outreach':
      if (stopAll || ctx.stops.has('PAUSE_ACQUISITION')) return deny('EMERGENCY_STOP', 'Notstopp aktiv.');
      return p.autoMarketingOutreach ? allow('AUTO_OUTREACH_ENABLED') : deny('AUTO_OUTREACH_DISABLED', 'AUTO_MARKETING_OUTREACH=false.');
    case 'paid_api.enable':
      if (!p.allowPaidApis) return deny('PAID_APIS_DISABLED', 'ALLOW_PAID_APIS=false – keine Zahlungsdaten werden abgerufen.');
      if (req.monthlyCostEur > p.maxNewMonthlyFixedCostEur) return deny('FIXED_COST_LIMIT', 'Überschreitet Fixkostenlimit.');
      return allow('PAID_API_WITHIN_LIMIT');
    case 'cost.commit':
      if (!(req.amountEur > 0)) return allow('ZERO_COST');
      if (!p.allowNewFinancialCommitments) return deny('COST_NOT_APPROVED', 'Kosten > 0 ohne Eigentümerfreigabe.');
      if (req.recurring && req.amountEur > p.maxNewMonthlyFixedCostEur) return deny('FIXED_COST_LIMIT', 'Überschreitet Fixkostenlimit.');
      return allow('COST_APPROVED');
    case 'dependency.install':
      if (req.requiresPayment) return deny('PAID_DEPENDENCY', 'Kostenpflichtige Bibliothek – nicht installieren.');
      if (!ALLOWED_DEPENDENCY_LICENSES.has(req.license)) return deny('LICENSE_REVIEW', `Lizenz ${req.license} erfordert Prüfung.`);
      return allow('DEPENDENCY_OK');
    case 'capability.use':
      return p.allowedCapabilities.includes(req.capabilityId)
        ? allow('CAPABILITY_ALLOWED')
        : deny('CAPABILITY_NOT_ALLOWED', 'Produktklasse nicht durch Policy freigegeben.');
    case 'checkout.create':
      if (stopAll || ctx.stops.has('PAUSE_PAYMENTS')) return deny('EMERGENCY_STOP', 'Zahlungen pausiert.');
      if (!req.testMode && !p.liveSalesEnabled) return deny('LIVE_SALES_DISABLED', 'LIVE_SALES_ENABLED=false.');
      return allow('CHECKOUT_ALLOWED');
    case 'production.start':
      if (stopAll || ctx.stops.has('PAUSE_PRODUCTION')) return deny('EMERGENCY_STOP', 'Produktion pausiert.');
      if (req.paymentState !== 'CONFIRMED') return deny('PAYMENT_NOT_CONFIRMED', 'Produktion nur nach verifizierter Zahlung.');
      if (!req.feasibilityApproved || !req.scopeValid) return deny('SCOPE_NOT_APPROVED', 'Machbarkeit/Scope nicht freigegeben.');
      return allow('PRODUCTION_ALLOWED');
    case 'delivery.release':
      if (stopAll) return deny('EMERGENCY_STOP', 'Notstopp aktiv.');
      if (req.paymentState !== 'CONFIRMED') return deny('PAYMENT_NOT_CONFIRMED', 'Keine Lieferung ohne bestätigte Zahlung.');
      if (!req.qaPassed) return deny('QA_NOT_PASSED', 'Keine Lieferung ohne bestandene QA.');
      return allow('DELIVERY_ALLOWED');
    case 'invoice.issue':
      if (!req.testMode && !p.liveSalesEnabled) return deny('LIVE_SALES_DISABLED', 'Live-Rechnungen gesperrt bis M3.');
      return allow('INVOICE_ALLOWED');
    case 'live.sale':
      return p.liveSalesEnabled ? allow('LIVE_SALES_ENABLED') : deny('LIVE_SALES_DISABLED', 'LIVE_SALES_ENABLED=false.');
    case 'deploy':
      if (!req.testsPassed) return deny('TESTS_FAILED', 'Rote Tests – kein Release, Rollback.');
      if (req.target === 'live' && !req.reviewed && !p.allowUnreviewedDeploy) {
        return deny('UNREVIEWED_DEPLOY', 'Ungeprüfter Live-Deploy gesperrt.');
      }
      if (req.target === 'live' && ctx.actor === 'ai' && !req.reviewed) return deny('AI_UNREVIEWED_DEPLOY', 'KI darf nicht ungeprüft live deployen.');
      return allow('DEPLOY_ALLOWED');
    case 'job.run':
      if (stopAll) return deny('EMERGENCY_STOP', 'STOP_ALL_JOBS aktiv.');
      if (req.production && ctx.stops.has('PAUSE_PRODUCTION')) return deny('EMERGENCY_STOP', 'Produktion pausiert.');
      return allow('JOB_ALLOWED');
    case 'refund.initiate':
      // Rückerstattungen reduzieren Risiko und bleiben auch bei Notstopp möglich – aber nur durch den Eigentümer.
      if (ctx.actor !== 'owner') return deny('REFUND_OWNER_ONLY', 'Rückerstattungen löst nur der Eigentümer aus.');
      if (!Number.isSafeInteger(req.amountMinor) || req.amountMinor <= 0) return deny('REFUND_INVALID', 'Ungültiger Betrag.');
      if (req.amountMinor > req.capturedMinor - req.alreadyRefundedMinor) return deny('REFUND_EXCEEDS_CAPTURED', 'Betrag übersteigt den erstattbaren Rest.');
      return allow('REFUND_ALLOWED');
    default: {
      const _exhaustive: never = req;
      return deny('UNKNOWN_ACTION', `Unbekannte Aktion ${String(_exhaustive)}`);
    }
  }
}
