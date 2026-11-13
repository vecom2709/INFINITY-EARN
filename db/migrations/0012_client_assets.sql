-- INFINITY EARN 15.0 · Gesamtprompt 157, Funktion 161 Secure Client Asset & Access Concierge.
-- Dateien und Zugänge werden beim zugeordneten Kunden angefordert, geprüft und nur befristet, widerruflich und
-- auftragsbezogen an die Produktion freigegeben. Zugangsdaten (Passwörter, Schlüssel) werden nie angenommen.

CREATE TABLE asset_requests (
  request_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (customer_id),
  order_id TEXT REFERENCES orders (order_id),
  kind TEXT NOT NULL CHECK (kind IN ('logo', 'document', 'data', 'access')),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 2 AND 120),
  purpose TEXT NOT NULL CHECK (length(purpose) BETWEEN 2 AND 300),
  rights_required INTEGER NOT NULL CHECK (rights_required IN (0, 1)),
  blocks_production INTEGER NOT NULL CHECK (blocks_production IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX asset_requests_customer ON asset_requests (customer_id, created_at);
CREATE INDEX asset_requests_order ON asset_requests (order_id);

CREATE TABLE client_assets (
  asset_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES asset_requests (request_id),
  customer_id TEXT NOT NULL REFERENCES customers (customer_id),
  version INTEGER NOT NULL CHECK (version >= 1),
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  blob_locator TEXT,
  note TEXT,
  scan_status TEXT NOT NULL CHECK (scan_status IN ('ACCEPTED', 'REJECTED')),
  scan_reason TEXT,
  rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (rights_confirmed IN (0, 1)),
  rights_confirmed_at TEXT,
  created_at TEXT NOT NULL,
  erased_at TEXT,
  UNIQUE (request_id, version),
  -- Abgelehnte Dateien werden nie gespeichert.
  CHECK (scan_status = 'ACCEPTED' OR blob_locator IS NULL)
);
CREATE INDEX client_assets_customer ON client_assets (customer_id);

CREATE TABLE asset_grants (
  grant_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES client_assets (asset_id),
  order_id TEXT REFERENCES orders (order_id),
  grantee TEXT NOT NULL CHECK (grantee IN ('production')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  revoke_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX asset_grants_asset ON asset_grants (asset_id);
