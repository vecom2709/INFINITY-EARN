import { approveSource, getSource } from '../../acquisition/src/sources.ts';
import { routeCapability } from '../../product-factory/src/registry.ts';
import type { AppContext } from './context.ts';
import { activeDbPolicy, approvePolicy, proposePolicy } from './policy-store.ts';
import { businessProfile, setSeatCountry } from './readiness.ts';

/**
 * Wendet Entscheidungen an, die der Eigentümer per Konfiguration erteilt hat (z. B. per Chat-Anweisung, eingetragen
 * in wrangler.jsonc). Idempotent, jede Anwendung wird mit Referenz protokolliert. Bewusst NICHT möglich:
 * Live-Freigaben (LA-xx auf „freigegeben“), Live-Verkauf, Zahlungs-/Bankkonten, bezahlte Dienste, Werbung –
 * diese bleiben an Nachweise bzw. die Konsole gebunden.
 */
export interface AppliedDecision { kind: 'seat_country' | 'capabilities' | 'ted_source'; detail: string }

export function applyOwnerDecisions(ctx: AppContext): AppliedDecision[] {
  const d = ctx.config.ownerDecisions;
  const applied: AppliedDecision[] = [];
  const log = (a: AppliedDecision): void => {
    applied.push(a);
    ctx.audit.record({ type: 'owner.decision_applied', actor: 'owner', subjectType: 'owner_decision', subjectId: a.kind, data: { detail: a.detail, reference: d.reference }, testMode: ctx.config.testMode });
  };

  if (d.seatCountry && businessProfile(ctx).seat_country !== d.seatCountry) {
    setSeatCountry(ctx, d.seatCountry, 'owner');
    log({ kind: 'seat_country', detail: `Sitzland ${d.seatCountry}; LA-01 „In Arbeit“ bis zur Bestätigung der Steuerberatung` });
  }

  if (d.allowedCapabilities?.length) {
    const active = activeDbPolicy(ctx);
    const wanted = d.allowedCapabilities.filter((id) => routeCapability(id).ok);
    if (active && wanted.some((id) => !active.allowedCapabilities.includes(id))) {
      const next = { ...active, allowedCapabilities: [...new Set([...active.allowedCapabilities, ...wanted])] };
      const v = proposePolicy(ctx, next, 'owner');
      approvePolicy(ctx, v, 'owner');
      log({ kind: 'capabilities', detail: `Produktarten freigegeben: ${next.allowedCapabilities.join(', ')} (Policy-Version ${v})` });
    }
  }

  if (d.tedTermsLabel) {
    try {
      const src = getSource(ctx, 'src_ted_eu');
      if (src.status !== 'APPROVED') {
        approveSource(ctx, 'src_ted_eu', d.tedTermsLabel, 'owner');
        log({ kind: 'ted_source', detail: `TED-Ausschreibungen freigegeben (${d.tedTermsLabel})` });
      }
    } catch {
      // Quelle (noch) nicht registriert → nichts tun; wird beim nächsten Start erneut versucht.
    }
  }
  return applied;
}
