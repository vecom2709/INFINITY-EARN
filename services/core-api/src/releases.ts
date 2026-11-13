import { newId, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import { acceptanceGate } from '../../product-factory/src/quality-standard.ts';
import { getCapability, routeCapability } from '../../product-factory/src/registry.ts';
import type { QaCheckResult } from '../../product-factory/src/types.ts';
import type { AppContext } from './context.ts';
import { WorkflowError } from './errors.ts';
import { activeDbPolicy, approvePolicy, effectivePolicy, proposePolicy } from './policy-store.ts';

/**
 * P4 – Verkaufsfreigabe durch den Eigentümer. Eine Produktart wird erst bestellbar, wenn
 *  1. ihre Standard-Akte vollständig ist (routeCapability),
 *  2. ein frisch erzeugtes Musterpaket ALLE Abnahmeprüfungen besteht (wird bei der Freigabe ausgeführt und gespeichert),
 *  3. der Eigentümer einen Festpreis innerhalb der Preisgrenzen der Policy festlegt.
 * Die Freigabe trägt die Produktart in die freigegebene Policy ein; Widerruf nimmt sie wieder heraus. Append-only.
 */
export const SAMPLE_INPUTS: Record<string, unknown> = {
  'mini-ww': { company: 'Musterfirma', primary: '#1F5FA8', language: 'de' },
  'b2b-calc-csv': { title: 'Muster', currency: 'EUR', margin_bps: 1500, language: 'de', items: [{ name: 'Montage', quantity: 2, unit_cost_minor: 4500 }] },
  'b2b-calc-pdf': { title: 'Muster', currency: 'EUR', margin_bps: 1500, language: 'de', items: [{ name: 'Montage', quantity: 2, unit_cost_minor: 4500 }] },
  'b2b-calc-bundle': { title: 'Muster', currency: 'EUR', margin_bps: 1500, language: 'de', items: [{ name: 'Montage', quantity: 2, unit_cost_minor: 4500 }] },
};

export interface SampleQa { capabilityId: string; version: number; sha256: string; bytes: number; checks: QaCheckResult[]; passed: boolean }

/** Erzeugt ein Musterpaket und prüft es mit der echten QA plus Abnahme-Gate der Standard-Akte. */
export function sampleQa(capabilityId: string): SampleQa {
  const cap = getCapability(capabilityId);
  const input = SAMPLE_INPUTS[capabilityId];
  if (!cap || input === undefined) throw new WorkflowError('NO_SAMPLE', capabilityId);
  const bytes = cap.generate(input);
  const sha = sha256Hex(bytes);
  const checks = [...cap.runQa(bytes, input), { check: 'checksum', passed: sha256Hex(bytes) === sha, detail: sha.slice(0, 16) }];
  const gate = acceptanceGate(capabilityId, checks);
  const all = [...checks, gate];
  return { capabilityId, version: cap.version, sha256: sha, bytes: bytes.length, checks: all, passed: all.every((c) => c.passed) };
}

export interface ReleaseRow { release_id: string; capability_id: string; capability_version: number; action: 'RELEASED' | 'REVOKED'; price_minor: number | null; currency: string | null; sample_qa_json: string | null; reason: string | null; actor: string; created_at: string }

/** Letzte Entscheidung je Produktart; aktiv nur, wenn RELEASED und dieselbe Produktversion. */
export function activeRelease(ctx: AppContext, capabilityId: string): ReleaseRow | null {
  const r = ctx.db.get<ReleaseRow>('SELECT * FROM product_releases WHERE capability_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', capabilityId);
  const cap = getCapability(capabilityId);
  if (!r || r.action !== 'RELEASED' || !cap || r.capability_version !== cap.version) return null;
  return r;
}

export function releaseHistory(ctx: AppContext, capabilityId: string): ReleaseRow[] {
  return ctx.db.all<ReleaseRow>('SELECT * FROM product_releases WHERE capability_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20', capabilityId);
}

function setPolicyCapability(ctx: AppContext, capabilityId: string, on: boolean): void {
  const active = activeDbPolicy(ctx);
  if (!active) throw new WorkflowError('NO_POLICY');
  const has = active.allowedCapabilities.includes(capabilityId);
  if (has === on) return;
  const next = { ...active, allowedCapabilities: on ? [...active.allowedCapabilities, capabilityId] : active.allowedCapabilities.filter((c) => c !== capabilityId) };
  approvePolicy(ctx, proposePolicy(ctx, next, 'owner'), 'owner');
}

export function releaseProduct(ctx: AppContext, capabilityId: string, priceMinor: number, actor: 'owner' = 'owner'): { release: ReleaseRow; sellable: boolean; ceilingMissing: boolean } {
  const cap = getCapability(capabilityId);
  if (!cap) throw new WorkflowError('CAPABILITY_UNKNOWN');
  const route = routeCapability(capabilityId);
  if (!route.ok) throw new WorkflowError('STANDARD_INCOMPLETE', route.reason);
  const policy = effectivePolicy(ctx) ?? activeDbPolicy(ctx);
  if (!policy) throw new WorkflowError('NO_POLICY');
  if (!Number.isSafeInteger(priceMinor) || priceMinor < policy.quote.minMinor || priceMinor > policy.quote.maxMinor) {
    throw new WorkflowError('PRICE_OUT_OF_POLICY', `Preis muss zwischen ${policy.quote.minMinor / 100} und ${policy.quote.maxMinor / 100} ${policy.quote.currency} liegen.`);
  }
  const qa = sampleQa(capabilityId);
  if (!qa.passed) throw new WorkflowError('SAMPLE_QA_FAILED', qa.checks.filter((c) => !c.passed).map((c) => c.check).join(', '));
  const id = newId('rel');
  ctx.db.run(
    `INSERT INTO product_releases (release_id, capability_id, capability_version, action, price_minor, currency, sample_qa_json, reason, actor, created_at) VALUES (?, ?, ?, 'RELEASED', ?, ?, ?, NULL, ?, ?)`,
    id, capabilityId, cap.version, priceMinor, policy.quote.currency, JSON.stringify(qa), actor, ctx.clock().toISOString(),
  );
  setPolicyCapability(ctx, capabilityId, true);
  ctx.audit.record({ type: 'product.released', actor, subjectType: 'capability', subjectId: capabilityId, data: { price_minor: priceMinor, version: cap.version, sample_sha256: qa.sha256 }, testMode: ctx.config.testMode });
  // Die Umgebungs-Obergrenze (ALLOWED_CAPABILITIES) muss die Produktart ebenfalls erlauben (zwei Schlüssel).
  const ceilingMissing = !ctx.config.policy.allowedCapabilities.includes(capabilityId);
  const release = activeRelease(ctx, capabilityId) as ReleaseRow;
  return { release, sellable: !ceilingMissing, ceilingMissing };
}

export function revokeProduct(ctx: AppContext, capabilityId: string, reason: string, actor: 'owner' = 'owner'): void {
  const cap = getCapability(capabilityId);
  if (!cap) throw new WorkflowError('CAPABILITY_UNKNOWN');
  if (!reason.trim()) throw new WorkflowError('REASON_REQUIRED');
  ctx.db.run(
    `INSERT INTO product_releases (release_id, capability_id, capability_version, action, price_minor, currency, sample_qa_json, reason, actor, created_at) VALUES (?, ?, ?, 'REVOKED', NULL, NULL, NULL, ?, ?, ?)`,
    newId('rel'), capabilityId, cap.version, reason.trim().slice(0, 300), actor, ctx.clock().toISOString(),
  );
  setPolicyCapability(ctx, capabilityId, false);
  ctx.audit.record({ type: 'product.revoked', actor, subjectType: 'capability', subjectId: capabilityId, data: { reason }, testMode: ctx.config.testMode });
}

/** Produktarten, die eine Freigabe mit Festpreis brauchen (Fachsoftware); Kalkulationen werden aus dem Aufwand berechnet. */
export const RELEASE_REQUIRED = new Set(['mini-ww', 'win-lager', 'ai-texte']);

/** Bestellbar = Policy erlaubt + Akte vollständig + (falls nötig) aktive Freigabe der aktuellen Version. */
export function isSellable(ctx: AppContext, capabilityId: string): boolean {
  const allowed = effectivePolicy(ctx)?.allowedCapabilities.includes(capabilityId) ?? false;
  if (!allowed || !routeCapability(capabilityId).ok) return false;
  return !RELEASE_REQUIRED.has(capabilityId) || activeRelease(ctx, capabilityId) !== null;
}
