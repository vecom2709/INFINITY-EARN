-- INFINITY EARN – 0005 Vertragsbestätigung auf dauerhaftem Datenträger (PDF)
-- Wird bei Angebotsannahme erzeugt, unveränderlich gespeichert, nur der Kunde kann sie abrufen; Abrufe werden protokolliert.

CREATE TABLE contract_confirmations (
  confirmation_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders (order_id),
  template_version TEXT NOT NULL,
  blob_locator TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  buyer_type TEXT NOT NULL CHECK (buyer_type IN ('B2B', 'B2C')),
  consumer_waiver_ref TEXT,
  first_downloaded_at TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK (buyer_type = 'B2B' OR consumer_waiver_ref IS NOT NULL)
);
CREATE TRIGGER contract_confirmations_immutable BEFORE UPDATE OF order_id, template_version, blob_locator, sha256, bytes, buyer_type, consumer_waiver_ref, test_mode, created_at ON contract_confirmations
BEGIN SELECT RAISE(ABORT, 'CONFIRMATION_IMMUTABLE'); END;
CREATE TRIGGER contract_confirmations_no_delete BEFORE DELETE ON contract_confirmations
BEGIN SELECT RAISE(ABORT, 'CONFIRMATION_IMMUTABLE'); END;
