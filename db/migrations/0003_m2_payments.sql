-- INFINITY EARN – 0003 M2: Provider-Referenzen, Rückerstattungsanträge

ALTER TABLE orders ADD COLUMN payment_provider TEXT;
ALTER TABLE orders ADD COLUMN provider_payment_ref TEXT;
CREATE INDEX orders_provider_payment_ref ON orders (provider_payment_ref);

-- Rückerstattungen: Antrag -> Eigentümerentscheidung -> Provider-Aufruf -> Bestätigung NUR per Webhook.
CREATE TABLE refund_requests (
  refund_request_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (order_id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  origin TEXT NOT NULL CHECK (origin IN ('customer_withdrawal', 'complaint', 'qa_failure', 'owner')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING_OWNER', 'REQUESTED', 'CONFIRMED', 'REJECTED', 'FAILED')),
  provider_refund_id TEXT,
  ticket_id TEXT REFERENCES support_tickets (ticket_id),
  decided_by TEXT,
  decision_note TEXT,
  decided_at TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX refund_requests_order ON refund_requests (order_id, status);
CREATE TRIGGER refund_requests_core_immutable BEFORE UPDATE OF order_id, amount_minor, currency, origin ON refund_requests
BEGIN SELECT RAISE(ABORT, 'REFUND_REQUEST_IMMUTABLE'); END;
