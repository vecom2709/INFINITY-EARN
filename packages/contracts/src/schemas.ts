/**
 * JSON-Schema-Verträge (Teilmenge von Draft 2020-12) + minimaler Validator ohne Fremdabhängigkeit.
 * Die Dateien unter packages/contracts/schemas/*.json sind die veröffentlichte Form;
 * tests/unit/contracts.test.ts stellt sicher, dass beide identisch bleiben.
 */
export interface JsonSchema {
  $schema?: string;
  title?: string;
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  enum?: readonly unknown[];
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(expected: string, v: unknown): boolean {
  const actual = typeOf(v);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return expected === actual;
}

export function validate(schema: JsonSchema, value: unknown, path = '$'): string[] {
  const errors: string[] = [];
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(t, value))) {
      return [`${path}: erwartet ${types.join('|')}, erhalten ${typeOf(value)}`];
    }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: Wert nicht erlaubt`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: zu kurz`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: zu lang`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: Format ungültig`);
    if (schema.format === 'uri') {
      try {
        new URL(value);
      } catch {
        errors.push(`${path}: keine gültige URI`);
      }
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: kleiner als ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: größer als ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: zu wenige Einträge`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: zu viele Einträge`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      errors.push(`${path}: Einträge nicht eindeutig`);
    }
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items as JsonSchema, item, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj) || obj[key] === undefined) errors.push(`${path}.${key}: fehlt`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in obj && obj[key] !== undefined) errors.push(...validate(sub, obj[key], `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in (schema.properties ?? {}))) errors.push(`${path}.${key}: unbekanntes Feld`);
      }
    }
  }
  return errors;
}

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

export const leadSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'Lead',
  type: 'object',
  required: ['lead_id', 'source_url', 'source_terms_checked', 'contact_legal_basis', 'status'],
  properties: {
    lead_id: { type: 'string' },
    source_url: { type: 'string', format: 'uri' },
    source_terms_checked: { type: 'boolean' },
    contact_legal_basis: { enum: ['consent', 'permitted_inbound', 'other_reviewed', 'none'] },
    consent_proof_ref: { type: ['string', 'null'] },
    buyer_signal: { type: 'string' },
    status: { enum: ['DISCOVERED', 'SOURCE_COMPLIANT', 'QUALIFIED', 'BLOCKED', 'CLOSED'] },
  },
};

export const quoteSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'Quote',
  type: 'object',
  required: ['quote_id', 'lead_id', 'description', 'gross_total_minor', 'currency', 'scope', 'accepted'],
  properties: {
    quote_id: { type: 'string' },
    lead_id: { type: 'string' },
    description: { type: 'string' },
    gross_total_minor: { type: 'integer', minimum: 0 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    scope: { type: 'string' },
    accepted: { type: 'boolean' },
    customer_acceptance_ref: { type: ['string', 'null'] },
  },
};

export const orderSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'Order',
  type: 'object',
  required: ['order_id', 'quote_id', 'payment_state', 'fulfillment_state', 'test_mode'],
  properties: {
    order_id: { type: 'string' },
    quote_id: { type: 'string' },
    payment_state: { enum: ['UNPAID', 'PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'DISPUTED'] },
    fulfillment_state: { enum: ['NOT_STARTED', 'QUEUED', 'IN_PRODUCTION', 'QA_FAILED', 'QA_PASSED', 'DELIVERED', 'CANCELLED'] },
    provider_event_ids: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    test_mode: { type: 'boolean' },
  },
};

export const invoiceSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'Invoice',
  type: 'object',
  required: ['invoice_id', 'order_id', 'issued_by_registered_business', 'invoice_number', 'currency', 'tax_context', 'status', 'test_mode'],
  properties: {
    invoice_id: { type: 'string' },
    order_id: { type: 'string' },
    issued_by_registered_business: { type: 'boolean' },
    invoice_number: { type: 'string' },
    currency: { type: 'string' },
    tax_context: { type: 'string' },
    sdi_reference: { type: ['string', 'null'] },
    status: { enum: ['DRAFT', 'TAX_REVIEW', 'ISSUED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'CREDITED'] },
    test_mode: { type: 'boolean' },
  },
};

export const CONTRACT_SCHEMAS = { lead: leadSchema, quote: quoteSchema, order: orderSchema, invoice: invoiceSchema } as const;
