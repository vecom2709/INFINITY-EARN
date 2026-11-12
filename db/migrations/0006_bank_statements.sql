-- INFINITY EARN 15.0 · M1: Bankabgleich mit gesondertem Kontoauszug (BANK_CREDIT_VERIFIED).
-- Ein Auszahlungsereignis des Zahlungsanbieters beweist keinen Bankeingang. Erst eine passende Gutschrift
-- auf einem importierten Kontoauszug bestätigt ihn. Rohdatei wird nicht gespeichert (nur Prüfsumme),
-- IBAN nur maskiert, Gegenparteien gekürzt (Datensparsamkeit).

CREATE TABLE bank_statements (
  statement_id TEXT PRIMARY KEY,
  source_format TEXT NOT NULL CHECK (source_format IN ('CSV', 'CAMT053')),
  file_sha256 TEXT NOT NULL,
  account_masked TEXT,
  statement_ref TEXT,
  marked_test INTEGER NOT NULL CHECK (marked_test IN (0, 1)),
  entries INTEGER NOT NULL CHECK (entries >= 0),
  credits INTEGER NOT NULL CHECK (credits >= 0),
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched >= 0),
  imported_by TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (file_sha256, test_mode)
);
CREATE TRIGGER bank_statements_no_delete BEFORE DELETE ON bank_statements BEGIN SELECT RAISE(ABORT, 'BANK_DATA_APPEND_ONLY'); END;
CREATE TRIGGER bank_statements_live_guard BEFORE INSERT ON bank_statements
WHEN NEW.test_mode = 0 AND (SELECT live_enabled FROM system_mode WHERE id = 1) = 0
BEGIN SELECT RAISE(ABORT, 'LIVE_MODE_DISABLED'); END;

CREATE TABLE bank_transactions (
  txn_id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL REFERENCES bank_statements (statement_id),
  line_no INTEGER NOT NULL,
  booking_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  direction TEXT NOT NULL CHECK (direction IN ('CRDT', 'DBIT')),
  reference TEXT NOT NULL,
  counterparty TEXT,
  bank_ref TEXT,
  matched_payout_id TEXT REFERENCES payouts (payout_id),
  match_rule TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (statement_id, line_no)
);
CREATE UNIQUE INDEX bank_transactions_one_per_payout ON bank_transactions (matched_payout_id) WHERE matched_payout_id IS NOT NULL;
CREATE TRIGGER bank_transactions_no_delete BEFORE DELETE ON bank_transactions BEGIN SELECT RAISE(ABORT, 'BANK_DATA_APPEND_ONLY'); END;
-- Buchungsdaten sind unveränderlich; nur die Zuordnung darf einmalig von NULL gesetzt werden.
CREATE TRIGGER bank_transactions_immutable BEFORE UPDATE OF statement_id, line_no, booking_date, amount_minor, currency, direction, reference, test_mode ON bank_transactions
BEGIN SELECT RAISE(ABORT, 'BANK_DATA_APPEND_ONLY'); END;
CREATE TRIGGER bank_transactions_match_once BEFORE UPDATE OF matched_payout_id ON bank_transactions
WHEN OLD.matched_payout_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'BANK_MATCH_FINAL'); END;

ALTER TABLE payouts ADD COLUMN bank_txn_id TEXT REFERENCES bank_transactions (txn_id);
ALTER TABLE payouts ADD COLUMN bank_verified_at TEXT;
-- Bankbestätigung nur mit Bankbuchung als Nachweis; einmal bestätigt bleibt bestätigt.
CREATE TRIGGER payouts_bank_confirm_requires_txn BEFORE UPDATE OF bank_credit_confirmed ON payouts
WHEN NEW.bank_credit_confirmed = 1 AND (NEW.bank_txn_id IS NULL OR NEW.bank_verified_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'BANK_CONFIRM_REQUIRES_EVIDENCE'); END;
CREATE TRIGGER payouts_bank_confirm_final BEFORE UPDATE OF bank_credit_confirmed, bank_txn_id ON payouts
WHEN OLD.bank_credit_confirmed = 1
BEGIN SELECT RAISE(ABORT, 'BANK_MATCH_FINAL'); END;
