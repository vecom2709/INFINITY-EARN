import { Buffer } from 'node:buffer';
import { hmacHex, newId, safeEqual, sha256Hex } from '../../../packages/shared/src/crypto.ts';
import type { AppContext } from '../../core-api/src/context.ts';
import { WorkflowError } from '../../core-api/src/errors.ts';
import { tryTransition } from '../../core-api/src/opportunities.ts';
import { getOrder, setFulfillmentState } from '../../core-api/src/orders.ts';
import { decide } from '../../core-api/src/policy-store.ts';
import { readVerifiedArtifact } from './artifacts.ts';

export interface DeliveryRow {
  delivery_id: string;
  order_id: string;
  artifact_id: string;
  customer_id: string;
  released_at: string;
  first_download_at: string | null;
  download_count: number;
  revoked_at: string | null;
  revoke_reason: string | null;
  test_mode: number;
}

/** Signierter, zeitlich begrenzter, kundengebundener Download-Token (IE-054, IE-055). */
export function issueDownloadToken(ctx: AppContext, deliveryId: string, customerId: string, ttlMinutes = ctx.config.downloadTtlMinutes): string {
  const exp = Math.floor(ctx.clock().getTime() / 1000) + ttlMinutes * 60;
  const payload = Buffer.from(JSON.stringify({ d: deliveryId, c: customerId, e: exp })).toString('base64url');
  return `${payload}.${hmacHex(ctx.config.downloadSigningKey, payload)}`;
}

export function verifyDownloadToken(ctx: AppContext, token: string): { ok: true; deliveryId: string; customerId: string } | { ok: false; reason: 'BAD_TOKEN' | 'EXPIRED' } {
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, hmacHex(ctx.config.downloadSigningKey, payload))) return { ok: false, reason: 'BAD_TOKEN' };
  let data: { d?: unknown; c?: unknown; e?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof data;
  } catch {
    return { ok: false, reason: 'BAD_TOKEN' };
  }
  if (typeof data.d !== 'string' || typeof data.c !== 'string' || typeof data.e !== 'number') return { ok: false, reason: 'BAD_TOKEN' };
  if (Math.floor(ctx.clock().getTime() / 1000) > data.e) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, deliveryId: data.d, customerId: data.c };
}

export function getDeliveryByOrder(ctx: AppContext, orderId: string): DeliveryRow | undefined {
  return ctx.db.get<DeliveryRow>('SELECT * FROM deliveries WHERE order_id = ?', orderId);
}

/** Lieferung freigeben: nur mit bestätigter Zahlung und bestandener QA; ein Lieferbeleg pro Auftrag (IE-051, IE-056, IE-059). */
export function releaseDelivery(ctx: AppContext, orderId: string, artifactId: string): { delivery: DeliveryRow; created: boolean } {
  const order = getOrder(ctx, orderId);
  const existing = getDeliveryByOrder(ctx, orderId);
  if (existing) return { delivery: existing, created: false };
  // Verbraucher: keine Bereitstellung ohne Vertragsbestätigung auf dauerhaftem Datenträger (Voraussetzung für das Erlöschen des Widerrufsrechts).
  const buyerType = ctx.db.get<{ buyer_type: string | null }>('SELECT buyer_type FROM customers WHERE customer_id = ?', order.customer_id)?.buyer_type;
  if (buyerType === 'B2C' && !ctx.db.get('SELECT 1 AS x FROM contract_confirmations WHERE order_id = ?', orderId)) {
    ctx.audit.record({ type: 'delivery.blocked', actor: 'system', subjectType: 'order', subjectId: orderId, data: { reason: 'CONFIRMATION_MISSING' }, testMode: ctx.config.testMode });
    throw new WorkflowError('DELIVERY_BLOCKED', 'CONFIRMATION_MISSING – Vertragsbestätigung für Verbraucher fehlt.');
  }
  const qa = ctx.db.get<{ passed: number }>('SELECT passed FROM qa_runs WHERE artifact_id = ? ORDER BY created_at DESC LIMIT 1', artifactId);
  const d = decide(ctx, { action: 'delivery.release', paymentState: order.payment_state, qaPassed: qa?.passed === 1 }, 'system', { type: 'order', id: orderId });
  if (!d.allowed) throw new WorkflowError('DELIVERY_BLOCKED', `${d.rule} – ${d.reason}`);
  const row: DeliveryRow = {
    delivery_id: newId('dlv'),
    order_id: orderId,
    artifact_id: artifactId,
    customer_id: order.customer_id,
    released_at: ctx.clock().toISOString(),
    first_download_at: null,
    download_count: 0,
    revoked_at: null,
    revoke_reason: null,
    test_mode: order.test_mode,
  };
  ctx.db.tx(() => {
    ctx.db.run(
      'INSERT INTO deliveries (delivery_id, order_id, artifact_id, customer_id, released_at, test_mode) VALUES (?, ?, ?, ?, ?, ?)',
      row.delivery_id, row.order_id, row.artifact_id, row.customer_id, row.released_at, row.test_mode,
    );
    setFulfillmentState(ctx, orderId, 'DELIVERED');
    tryTransition(ctx, order.opportunity_id, 'DELIVERED', 'system', `Lieferung ${row.delivery_id} freigegeben`);
  });
  ctx.audit.record({ type: 'delivery.completed', actor: 'system', subjectType: 'order', subjectId: orderId, data: { delivery_id: row.delivery_id, artifact_id: artifactId }, testMode: ctx.config.testMode });
  return { delivery: row, created: true };
}

export function revokeDelivery(ctx: AppContext, orderId: string, reason: string): void {
  const r = ctx.db.run('UPDATE deliveries SET revoked_at = ?, revoke_reason = ? WHERE order_id = ? AND revoked_at IS NULL', ctx.clock().toISOString(), reason, orderId);
  if (r.changes > 0) ctx.audit.record({ type: 'delivery.revoked', actor: 'system', subjectType: 'order', subjectId: orderId, data: { reason }, testMode: ctx.config.testMode });
}

export type DownloadResult =
  | { ok: true; bytes: Uint8Array; filename: string; mediaType: string }
  | { ok: false; status: 400 | 403 | 404 | 410 | 500; reason: string };

/** Download mit Token + Kundenschlüssel; prüft Zahlung, Widerruf und Prüfsumme bei jedem Abruf. */
export function downloadArtifact(ctx: AppContext, token: string, customerKey: string | undefined): DownloadResult {
  const v = verifyDownloadToken(ctx, token);
  if (!v.ok) return { ok: false, status: v.reason === 'EXPIRED' ? 410 : 400, reason: v.reason };
  const keyOwner = customerKey
    ? ctx.db.get<{ customer_id: string }>('SELECT customer_id FROM customers WHERE access_key_hash = ?', sha256Hex(customerKey))
    : undefined;
  const delivery = ctx.db.get<DeliveryRow>('SELECT * FROM deliveries WHERE delivery_id = ?', v.deliveryId);
  if (!delivery) return { ok: false, status: 404, reason: 'NOT_FOUND' };
  if (!keyOwner || keyOwner.customer_id !== v.customerId || delivery.customer_id !== v.customerId) {
    ctx.audit.record({ type: 'security.download_denied', actor: 'customer', subjectType: 'delivery', subjectId: delivery.delivery_id, data: { reason: 'CUSTOMER_MISMATCH' }, testMode: ctx.config.testMode });
    return { ok: false, status: 403, reason: 'FORBIDDEN' };
  }
  if (delivery.revoked_at) return { ok: false, status: 403, reason: 'REVOKED' };
  const order = getOrder(ctx, delivery.order_id);
  if (order.payment_state !== 'CONFIRMED') return { ok: false, status: 403, reason: 'PAYMENT_NOT_CONFIRMED' };
  const art = readVerifiedArtifact(ctx, delivery.artifact_id);
  if (!art.ok) {
    ctx.audit.record({ type: 'alert.artifact_integrity', actor: 'system', subjectType: 'delivery', subjectId: delivery.delivery_id, data: { reason: art.reason }, testMode: ctx.config.testMode });
    return { ok: false, status: 500, reason: art.reason };
  }
  const now = ctx.clock().toISOString();
  ctx.db.run('UPDATE deliveries SET download_count = download_count + 1, first_download_at = COALESCE(first_download_at, ?) WHERE delivery_id = ?', now, delivery.delivery_id);
  ctx.audit.record({ type: 'delivery.downloaded', actor: 'customer', subjectType: 'order', subjectId: delivery.order_id, data: { delivery_id: delivery.delivery_id }, testMode: ctx.config.testMode });
  const ext = art.row.media_type.startsWith('text/csv') ? 'csv' : art.row.media_type === 'application/pdf' ? 'pdf' : art.row.media_type === 'application/zip' ? 'zip' : 'bin';
  return { ok: true, bytes: art.bytes, filename: `infinity-earn-${delivery.order_id}-v${art.row.version}.${ext}`, mediaType: art.row.media_type };
}

/** Sicherheitslücke im Lieferprodukt: isolieren, Zugriff sperren, Nachbearbeitung (IE-060). */
export function quarantineArtifact(ctx: AppContext, orderId: string, reason: string, actor: 'owner' | 'system'): void {
  const order = getOrder(ctx, orderId);
  ctx.db.tx(() => {
    ctx.db.run('UPDATE artifacts SET quarantined_at = ? WHERE order_id = ? AND quarantined_at IS NULL', ctx.clock().toISOString(), orderId);
    revokeDelivery(ctx, orderId, `SECURITY:${reason}`);
    ctx.db.run(
      `INSERT INTO support_tickets (ticket_id, order_id, customer_id, kind, message, status, test_mode, created_at) VALUES (?, ?, ?, 'security', ?, 'OPEN', ?, ?)`,
      newId('tkt'), orderId, order.customer_id, `Artefakt isoliert: ${reason}`, order.test_mode, ctx.clock().toISOString(),
    );
    tryTransition(ctx, order.opportunity_id, 'MANUAL_REVIEW', actor === 'owner' ? 'owner' : 'system', `Sicherheitsisolierung: ${reason}`);
  });
  ctx.audit.record({ type: 'security.artifact_quarantined', actor, subjectType: 'order', subjectId: orderId, data: { reason }, testMode: ctx.config.testMode });
}
