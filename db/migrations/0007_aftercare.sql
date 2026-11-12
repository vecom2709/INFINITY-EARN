-- INFINITY EARN 15.0: Abnahme durch den Kunden (084/047) und echte Rückmeldungen (120/034).
-- Nur vom Kunden selbst abgegeben, unveränderlich, keine erfundenen Bewertungen möglich (eine je Auftrag).

CREATE TABLE delivery_acceptances (
  order_id TEXT PRIMARY KEY REFERENCES orders (order_id),
  decision TEXT NOT NULL CHECK (decision IN ('ACCEPTED', 'DEFECT_REPORTED')),
  note TEXT,
  ticket_id TEXT REFERENCES support_tickets (ticket_id),
  decided_by TEXT NOT NULL CHECK (decided_by = 'customer'),
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER delivery_acceptances_immutable BEFORE UPDATE ON delivery_acceptances BEGIN SELECT RAISE(ABORT, 'ACCEPTANCE_FINAL'); END;
CREATE TRIGGER delivery_acceptances_no_delete BEFORE DELETE ON delivery_acceptances BEGIN SELECT RAISE(ABORT, 'ACCEPTANCE_FINAL'); END;

CREATE TABLE customer_feedback (
  feedback_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders (order_id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  outcome TEXT NOT NULL CHECK (outcome IN ('IN_USE', 'NOT_YET', 'NOT_USEFUL')),
  comment TEXT,
  consent_publish INTEGER NOT NULL CHECK (consent_publish IN (0, 1)),
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER customer_feedback_immutable BEFORE UPDATE OF order_id, rating, outcome, comment, test_mode, created_at ON customer_feedback BEGIN SELECT RAISE(ABORT, 'FEEDBACK_IMMUTABLE'); END;
CREATE TRIGGER customer_feedback_no_delete BEFORE DELETE ON customer_feedback BEGIN SELECT RAISE(ABORT, 'FEEDBACK_IMMUTABLE'); END;
-- Rückmeldung nur zu einem tatsächlich gelieferten Auftrag.
CREATE TRIGGER customer_feedback_requires_delivery BEFORE INSERT ON customer_feedback
WHEN NOT EXISTS (SELECT 1 FROM deliveries WHERE order_id = NEW.order_id)
BEGIN SELECT RAISE(ABORT, 'FEEDBACK_REQUIRES_DELIVERY'); END;
