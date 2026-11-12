import { assertMinor } from '../../../packages/contracts/src/money.ts';
import { newId } from '../../../packages/shared/src/crypto.ts';
import { isUniqueViolation } from '../../../packages/storage/src/errors.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { effectivePolicy } from '../../core-api/src/policy-store.ts';

export type LedgerAccount = 'customer_payments' | 'provider_fees' | 'refunds' | 'disputes' | 'payouts' | 'operating_costs';
export type LedgerSource = 'payment_event' | 'payout_event' | 'owner_manual';

export interface LedgerEntryInput {
  orderId: string | null;
  account: LedgerAccount;
  amountMinor: number;
  currency: string;
  sourceType: LedgerSource;
  sourceRef: string;
  description: string;
}

export function accountingCurrency(ctx: AppContext): string {
  return effectivePolicy(ctx)?.quote.currency ?? ctx.config.policy.quote.currency;
}

/**
 * Append-only Buchung. Doppelte (source_type, source_ref, account) werden nicht erneut gebucht (IE-075).
 * Gibt null zurück, wenn bereits gebucht.
 */
export function appendLedger(ctx: AppContext, e: LedgerEntryInput): string | null {
  assertMinor(e.amountMinor);
  if (e.currency !== accountingCurrency(ctx)) throw new WorkflowError('CURRENCY_MISMATCH', `Buchungswährung ${e.currency} ≠ ${accountingCurrency(ctx)}`);
  const id = newId('led');
  try {
    ctx.db.run(
      `INSERT INTO ledger_entries (entry_id, order_id, account, amount_minor, currency, source_type, source_ref, description, test_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, e.orderId, e.account, e.amountMinor, e.currency, e.sourceType, e.sourceRef, e.description, ctx.config.testMode ? 1 : 0, ctx.clock().toISOString(),
    );
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
  return id;
}

export function ledgerSums(ctx: AppContext, testMode: boolean): Record<LedgerAccount, number> {
  const rows = ctx.db.all<{ account: LedgerAccount; total: number }>(
    'SELECT account, COALESCE(SUM(amount_minor), 0) AS total FROM ledger_entries WHERE test_mode = ? GROUP BY account',
    testMode ? 1 : 0,
  );
  const sums: Record<LedgerAccount, number> = { customer_payments: 0, provider_fees: 0, refunds: 0, disputes: 0, payouts: 0, operating_costs: 0 };
  for (const r of rows) sums[r.account] = r.total;
  return sums;
}
