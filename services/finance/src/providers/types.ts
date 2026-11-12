import type { OrderRow } from '../../../core-api/src/orders.ts';

/** Gemeinsame Schnittstelle der Zahlungsanbieter. Zahlungsstatus kommt NIE aus diesen Aufrufen, nur aus Webhooks. */
export interface PaymentProvider {
  readonly name: 'mock' | 'stripe';
  createCheckout(order: OrderRow, urls: { successUrl: string; cancelUrl: string }, productName: string): Promise<{ sessionId: string; url: string }>;
  /** Fordert eine Rückerstattung an. Bestätigung + Buchung erst über den Webhook `charge.refunded`. */
  requestRefund(order: OrderRow, amountMinor: number, refundRequestId: string, alreadyRefundedMinor: number): Promise<{ providerRefundId: string; status: string }>;
  /** Vom Provider bestätigte Gebühr zur Zahlung, oder null wenn (noch) nicht verfügbar. */
  fetchFee(paymentRef: string, currency: string): Promise<{ feeMinor: number; ref: string } | null>;
}

export type HttpFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class ProviderError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.code = code;
    this.name = 'ProviderError';
  }
}
