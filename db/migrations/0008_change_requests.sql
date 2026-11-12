-- INFINITY EARN 15.0 · 092 Nachtragsangebote: zusätzliche Kundenwünsche werden zu einem eigenen, transparenten Angebot.
-- Verknüpft Original-Auftrag und neue Gelegenheit; ein Nachtrag gilt erst nach Annahme UND bestätigter Zahlung als beauftragt
-- (über den regulären Auftragsablauf – hier wird nichts stillschweigend beauftragt).
CREATE TABLE change_requests (
  change_id TEXT PRIMARY KEY,
  original_order_id TEXT NOT NULL REFERENCES orders (order_id),
  opportunity_id TEXT NOT NULL UNIQUE REFERENCES opportunities (opportunity_id),
  description TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX change_requests_original ON change_requests (original_order_id);
CREATE TRIGGER change_requests_immutable BEFORE UPDATE ON change_requests BEGIN SELECT RAISE(ABORT, 'CHANGE_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER change_requests_no_delete BEFORE DELETE ON change_requests BEGIN SELECT RAISE(ABORT, 'CHANGE_REQUEST_IMMUTABLE'); END;
