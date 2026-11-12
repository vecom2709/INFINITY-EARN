import { EU_COUNTRIES } from '../../finance/src/tax.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';
import { LIVE_MODE_IMPLEMENTED } from './config.ts';

/**
 * M3 – Business Readiness. Verwaltet die Live-Freigaben LA-01 … LA-12 mit Nachweis und Historie.
 * Freigeben kann nur der Eigentümer. Auch wenn alles freigegeben ist, bleibt LIVE technisch gesperrt,
 * bis eine eigene, geprüfte Migration system_mode freischaltet.
 */
export type ItemStatus = 'OPEN' | 'IN_PROGRESS' | 'APPROVED' | 'NOT_APPLICABLE';

export interface ActivationItem {
  item_id: string;
  title: string;
  responsible: string;
  status: ItemStatus;
  evidence_ref: string | null;
  note: string | null;
  approved_by: string | null;
  updated_at: string;
}

const STATUSES: readonly ItemStatus[] = ['OPEN', 'IN_PROGRESS', 'APPROVED', 'NOT_APPLICABLE'];

export function listActivationItems(ctx: AppContext): ActivationItem[] {
  return ctx.db.all<ActivationItem>('SELECT * FROM live_activation_items ORDER BY item_id');
}

export function updateActivationItem(ctx: AppContext, itemId: string, status: string, evidenceRef: string, note: string, actor: 'owner' | 'ai' | 'system'): void {
  if (actor !== 'owner') {
    ctx.audit.record({ type: 'readiness.update_denied', actor, subjectType: 'live_activation', subjectId: itemId, testMode: ctx.config.testMode });
    throw new WorkflowError('OWNER_REQUIRED', 'Live-Freigaben setzt nur der Eigentümer.');
  }
  if (!(STATUSES as readonly string[]).includes(status)) throw new WorkflowError('INVALID_STATUS');
  const item = ctx.db.get<ActivationItem>('SELECT * FROM live_activation_items WHERE item_id = ?', itemId);
  if (!item) throw new WorkflowError('ITEM_NOT_FOUND');
  const evidence = evidenceRef.trim().slice(0, 500);
  const finalStatus = status === 'APPROVED' || status === 'NOT_APPLICABLE';
  if (finalStatus && evidence.length < 5) {
    throw new WorkflowError('EVIDENCE_REQUIRED', 'Freigabe nur mit Nachweis (z. B. Dokument, Registriernummer, Beratungsprotokoll).');
  }
  const now = ctx.clock().toISOString();
  ctx.db.tx(() => {
    ctx.db.run(
      'UPDATE live_activation_items SET status = ?, evidence_ref = ?, note = ?, approved_by = ?, updated_at = ? WHERE item_id = ?',
      status, evidence || null, note.trim().slice(0, 1000) || null, finalStatus ? 'owner' : null, now, itemId,
    );
    ctx.db.run(
      'INSERT INTO live_activation_history (item_id, from_status, to_status, evidence_ref, note, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      itemId, item.status, status, evidence || null, note.trim().slice(0, 1000) || null, actor, now,
    );
  });
  ctx.audit.record({ type: 'readiness.item_updated', actor, subjectType: 'live_activation', subjectId: itemId, data: { from: item.status, to: status }, testMode: ctx.config.testMode });
}

export interface ReadinessSummary {
  total: number;
  done: number;
  open: string[];
  allItemsDone: boolean;
  liveTechnicallyLocked: true;
  message: string;
}

export function readinessSummary(ctx: AppContext): ReadinessSummary {
  const items = listActivationItems(ctx);
  const open = items.filter((i) => i.status !== 'APPROVED' && i.status !== 'NOT_APPLICABLE').map((i) => i.item_id);
  const liveRow = ctx.db.get<{ live_enabled: number }>('SELECT live_enabled FROM system_mode WHERE id = 1');
  const locked = !LIVE_MODE_IMPLEMENTED || liveRow?.live_enabled !== 1;
  return {
    total: items.length,
    done: items.length - open.length,
    open,
    allItemsDone: open.length === 0,
    liveTechnicallyLocked: locked as true,
    message: open.length
      ? `${open.length} Freigaben offen – LIVE gesperrt.`
      : 'Alle Freigaben erteilt. LIVE bleibt technisch gesperrt, bis eine geprüfte Freischalt-Migration eingespielt wird.',
  };
}

/**
 * LA-01: Sitzland festhalten – NUR durch den Eigentümer. Setzt LA-01 auf „In Arbeit“ (die endgültige Freigabe
 * braucht die schriftliche Bestätigung der Steuerberatung als Nachweis und erfolgt separat).
 */
export function setSeatCountry(ctx: AppContext, country: string, actor: 'owner' | 'ai' | 'system'): void {
  if (actor !== 'owner') {
    ctx.audit.record({ type: 'readiness.update_denied', actor, subjectType: 'business_profile', subjectId: 'seat_country', testMode: ctx.config.testMode });
    throw new WorkflowError('OWNER_REQUIRED', 'Das Sitzland legt nur der Eigentümer fest.');
  }
  const c = country.trim().toUpperCase();
  if (!EU_COUNTRIES.has(c)) throw new WorkflowError('INVALID_COUNTRY', 'Bitte ein EU-Land wählen.');
  const now = ctx.clock().toISOString();
  ctx.db.tx(() => {
    ctx.db.run(`INSERT INTO business_profile (key, value, decided_by, decided_at) VALUES ('seat_country', ?, 'owner', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, decided_by = 'owner', decided_at = excluded.decided_at`, c, now);
    const la = ctx.db.get<{ status: string }>(`SELECT status FROM live_activation_items WHERE item_id = 'LA-01'`);
    if (la && la.status === 'OPEN') updateActivationItem(ctx, 'LA-01', 'IN_PROGRESS', '', `Sitzland ${c} vom Eigentümer gewählt (${now.slice(0, 10)}). Freigabe nach schriftlicher Bestätigung der Steuerberatung.`, 'owner');
  });
  ctx.audit.record({ type: 'business.seat_country_set', actor: 'owner', subjectType: 'business_profile', subjectId: 'seat_country', data: { country: c }, testMode: ctx.config.testMode });
}

export function businessProfile(ctx: AppContext): Record<string, string> {
  return Object.fromEntries(ctx.db.all<{ key: string; value: string }>('SELECT key, value FROM business_profile').map((r) => [r.key, r.value]));
}

/** Zulässige Kundenländer laut Eigentümerentscheidung (M3: EU). Unbekannte Einstellung -> nichts erlaubt (fail-closed). */
export function marketAllows(ctx: AppContext, country: string, buyerType: 'B2B' | 'B2C'): { ok: true } | { ok: false; reason: string } {
  const p = businessProfile(ctx);
  const types = (p.customer_types ?? '').split(',');
  if (!types.includes(buyerType)) return { ok: false, reason: `CUSTOMER_TYPE_NOT_ALLOWED:${buyerType}` };
  if (p.markets === 'EU') return EU_COUNTRIES.has(country) ? { ok: true } : { ok: false, reason: `MARKET_NOT_ALLOWED:${country}` };
  return { ok: false, reason: 'MARKETS_NOT_CONFIGURED' };
}
