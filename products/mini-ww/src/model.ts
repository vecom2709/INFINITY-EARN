/**
 * Mini-Warenwirtschaft – Domänenmodell (Pilot, Gesamtprompt §4).
 * Reine Daten, JSON-serialisierbar, ohne Node-Abhängigkeiten (läuft später unverändert im Browser).
 * Beträge in Cent (ganze Zahlen), Mengen in ganzen Einheiten.
 */
export const SCHEMA_VERSION = 1;

export type Role = 'OWNER' | 'STAFF';
export interface User { id: string; name: string; role: Role }

export interface TaxRate { id: string; label: string; bps: number }
export interface Sequence { prefix: string; next: number }
export type SequenceName = 'quote' | 'order' | 'delivery' | 'invoice' | 'credit';

export interface Settings {
  company: string;
  currency: string;
  taxRates: TaxRate[];
  sequences: Record<SequenceName, Sequence>;
  paymentTermDays: number;
  /** Tage nach Fälligkeit für Mahnstufe 1, 2, 3 */
  dunningDays: [number, number, number];
}

export interface Party { id: string; number: string; name: string; email: string | null; address: string | null; vatId: string | null; active: boolean }

export interface Article { id: string; sku: string; name: string; unit: string; priceMinor: number; costMinor: number; taxRateId: string; active: boolean }

export type MovementType = 'RECEIPT' | 'ISSUE' | 'ADJUST' | 'RESERVE' | 'RELEASE' | 'RETURN';
export interface Movement { seq: number; at: string; type: MovementType; articleId: string; qty: number; ref: string; reason: string | null; userId: string }

export interface Line { articleId: string; name: string; qty: number; priceMinor: number; taxBps: number }

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
export interface Quote { id: string; number: string | null; customerId: string; lines: Line[]; status: QuoteStatus; validUntil: string; createdAt: string }

export type OrderStatus = 'OPEN' | 'PARTIAL' | 'DELIVERED' | 'CANCELLED';
export interface OrderLine extends Line { delivered: number }
export interface Order { id: string; number: string; quoteId: string | null; customerId: string; lines: OrderLine[]; status: OrderStatus; createdAt: string }

export interface DeliveryLine { articleId: string; qty: number }
export interface Delivery { id: string; number: string; orderId: string; customerId: string; lines: DeliveryLine[]; at: string; clientRef: string; invoiceId: string | null }

export type InvoiceKind = 'INVOICE' | 'CREDIT_NOTE';
export interface Totals { netMinor: number; taxMinor: number; grossMinor: number; byRate: { bps: number; netMinor: number; taxMinor: number }[] }
export interface Invoice {
  id: string; number: string | null; kind: InvoiceKind; customerId: string; deliveryIds: string[]; refInvoiceId: string | null;
  lines: Line[]; totals: Totals; status: 'DRAFT' | 'FINAL'; createdAt: string; finalizedAt: string | null; dueDate: string | null;
  /** nur Gutschrift: Ware zurück ins Lager gebucht */
  restock: boolean; reason: string | null;
}

export interface Payment { id: string; invoiceId: string; amountMinor: number; at: string; method: string; note: string | null; userId: string }

export interface AuditEntry { seq: number; at: string; userId: string; action: string; ref: string; data: Record<string, unknown> }

export interface Store {
  schema: number;
  seq: number;
  settings: Settings;
  users: User[];
  customers: Party[];
  suppliers: Party[];
  articles: Article[];
  movements: Movement[];
  quotes: Quote[];
  orders: Order[];
  deliveries: Delivery[];
  invoices: Invoice[];
  payments: Payment[];
  audit: AuditEntry[];
}

export function emptyStore(company: string, owner: { id: string; name: string } = { id: 'u1', name: 'Inhaber' }): Store {
  return {
    schema: SCHEMA_VERSION,
    seq: 0,
    settings: {
      company,
      currency: 'EUR',
      taxRates: [{ id: 'std', label: 'Standard 22 %', bps: 2200 }, { id: 'red', label: 'Ermäßigt 10 %', bps: 1000 }, { id: 'zero', label: '0 %', bps: 0 }],
      sequences: { quote: { prefix: 'AN-', next: 1 }, order: { prefix: 'AU-', next: 1 }, delivery: { prefix: 'LS-', next: 1 }, invoice: { prefix: 'RE-', next: 1 }, credit: { prefix: 'GU-', next: 1 } },
      paymentTermDays: 14,
      dunningDays: [7, 21, 35],
    },
    users: [{ id: owner.id, name: owner.name, role: 'OWNER' }],
    customers: [], suppliers: [], articles: [], movements: [], quotes: [], orders: [], deliveries: [], invoices: [], payments: [], audit: [],
  };
}
