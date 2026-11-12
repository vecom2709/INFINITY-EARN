-- INFINITY EARN – 0001 Grundschema (SQLite / Cloudflare-D1-kompatibel)
-- Invarianten: Beträge als Integer-Minor-Units, test_mode auf allen Geschäftszeilen,
-- append-only Ledger/Audit/Zahlungsereignisse, eindeutige Provider-Event-IDs und Rechnungsnummern,
-- Live-Zeilen sind per Trigger gesperrt, solange system_mode.live_enabled = 0.

CREATE TABLE system_mode (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  live_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_enabled IN (0, 1)),
  note TEXT NOT NULL
);
INSERT INTO system_mode (id, live_enabled, note) VALUES (1, 0, 'M0: Live-Betrieb gesperrt. Freischaltung nur per eigener Migration nach M3-Freigabe.');
CREATE TRIGGER system_mode_locked BEFORE UPDATE ON system_mode
BEGIN SELECT RAISE(ABORT, 'LIVE_ACTIVATION_REQUIRES_M3_MIGRATION'); END;
CREATE TRIGGER system_mode_no_delete BEFORE DELETE ON system_mode
BEGIN SELECT RAISE(ABORT, 'LIVE_ACTIVATION_REQUIRES_M3_MIGRATION'); END;

-- Governance -----------------------------------------------------------------
CREATE TABLE policy_versions (
  version INTEGER PRIMARY KEY,
  policy_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'ACTIVE', 'SUPERSEDED', 'REJECTED')),
  proposed_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT
);
CREATE UNIQUE INDEX policy_one_active ON policy_versions (status) WHERE status = 'ACTIVE';

CREATE TABLE emergency_stops (
  stop TEXT PRIMARY KEY CHECK (stop IN ('PAUSE_ACQUISITION', 'PAUSE_PRODUCTION', 'PAUSE_PAYMENTS', 'STOP_ALL_JOBS')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  changed_by TEXT,
  changed_at TEXT
);
INSERT INTO emergency_stops (stop, active) VALUES
  ('PAUSE_ACQUISITION', 0), ('PAUSE_PRODUCTION', 0), ('PAUSE_PAYMENTS', 0), ('STOP_ALL_JOBS', 0);

CREATE TABLE owner_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Akquise --------------------------------------------------------------------
CREATE TABLE sources (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  source_license TEXT NOT NULL,
  automation_allowed INTEGER NOT NULL CHECK (automation_allowed IN (0, 1)),
  terms_url TEXT,
  terms_hash TEXT,
  terms_checked_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('APPROVED', 'PENDING_REVIEW', 'PAUSED_TOS_CHANGED', 'BLOCKED')),
  created_at TEXT NOT NULL
);
INSERT INTO sources (source_id, name, base_url, source_license, automation_allowed, terms_url, terms_hash, terms_checked_at, status, created_at)
VALUES ('src_inbound_form', 'Eigenes Anfrageformular (Inbound)', '/anfrage', 'own_inbound_form', 1, NULL, 'own', '2026-11-12T00:00:00.000Z', 'APPROVED', '2026-11-12T00:00:00.000Z');

CREATE TABLE leads (
  lead_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources (source_id),
  source_url TEXT NOT NULL,
  source_terms_checked INTEGER NOT NULL CHECK (source_terms_checked IN (0, 1)),
  contact_legal_basis TEXT NOT NULL CHECK (contact_legal_basis IN ('consent', 'permitted_inbound', 'other_reviewed', 'none')),
  consent_proof_ref TEXT,
  buyer_signal TEXT,
  purchase_intent_evidence TEXT,
  intent_verified INTEGER NOT NULL DEFAULT 0 CHECK (intent_verified IN (0, 1)),
  email TEXT,
  email_hash TEXT,
  name TEXT,
  company TEXT,
  country TEXT,
  message TEXT,
  status TEXT NOT NULL CHECK (status IN ('DISCOVERED', 'SOURCE_COMPLIANT', 'QUALIFIED', 'BLOCKED', 'CLOSED')),
  marketing_opt_out INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_out IN (0, 1)),
  processing_restricted INTEGER NOT NULL DEFAULT 0 CHECK (processing_restricted IN (0, 1)),
  erased_at TEXT,
  expires_at TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX leads_one_profile_per_email ON leads (email_hash, test_mode) WHERE email_hash IS NOT NULL;

CREATE TABLE consents (
  consent_id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads (lead_id),
  purpose TEXT NOT NULL CHECK (purpose IN ('marketing_email', 'transactional')),
  proof_ref TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  withdrawn_at TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1))
);

-- Pipeline -------------------------------------------------------------------
CREATE TABLE opportunities (
  opportunity_id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads (lead_id),
  capability_id TEXT,
  scope_json TEXT,
  scope_hash TEXT,
  open_points_json TEXT,
  pipeline_state TEXT NOT NULL CHECK (pipeline_state IN (
    'DISCOVERED', 'SOURCE_COMPLIANT', 'QUALIFIED', 'FEASIBILITY_APPROVED', 'QUOTED', 'CUSTOMER_ACCEPTED',
    'PAYMENT_CONFIRMED', 'PRODUCTION_QUEUED', 'IN_PRODUCTION', 'QA_PASSED', 'DELIVERED', 'INVOICE_RECORDED',
    'LEDGER_RECONCILED', 'PAYOUT_RECORDED', 'CLOSED',
    'UNAUTHORIZED_SOURCE', 'CONSENT_MISSING', 'OUT_OF_SCOPE', 'LICENCE_RISK', 'NO_CAPACITY', 'COST_LIMIT',
    'PAYMENT_FAILED', 'CANCELLED', 'QA_FAILED', 'REFUND_PENDING', 'DISPUTE', 'TAX_REVIEW', 'MANUAL_REVIEW')),
  state_reason TEXT,
  estimated_cost_minor INTEGER CHECK (estimated_cost_minor IS NULL OR estimated_cost_minor >= 0),
  currency TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE state_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id TEXT NOT NULL REFERENCES opportunities (opportunity_id),
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TRIGGER state_transitions_no_update BEFORE UPDATE ON state_transitions BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
CREATE TRIGGER state_transitions_no_delete BEFORE DELETE ON state_transitions BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;

CREATE TABLE quotes (
  quote_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities (opportunity_id),
  lead_id TEXT NOT NULL REFERENCES leads (lead_id),
  description TEXT NOT NULL,
  scope TEXT NOT NULL,
  terms_json TEXT NOT NULL,
  gross_total_minor INTEGER NOT NULL CHECK (gross_total_minor >= 0),
  cost_minor INTEGER NOT NULL CHECK (cost_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  acceptance_token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ISSUED', 'ACCEPTED', 'EXPIRED', 'WITHDRAWN')),
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0, 1)),
  customer_acceptance_ref TEXT,
  accepted_at TEXT,
  valid_until TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE customers (
  customer_id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads (lead_id),
  name TEXT,
  email TEXT,
  address TEXT,
  country TEXT,
  buyer_type TEXT CHECK (buyer_type IS NULL OR buyer_type IN ('B2B', 'B2C')),
  vat_id TEXT,
  access_key_hash TEXT UNIQUE,
  processing_restricted INTEGER NOT NULL DEFAULT 0 CHECK (processing_restricted IN (0, 1)),
  erased_at TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL UNIQUE REFERENCES quotes (quote_id),
  customer_id TEXT NOT NULL REFERENCES customers (customer_id),
  opportunity_id TEXT NOT NULL REFERENCES opportunities (opportunity_id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  payment_state TEXT NOT NULL CHECK (payment_state IN ('UNPAID', 'PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'DISPUTED')),
  fulfillment_state TEXT NOT NULL CHECK (fulfillment_state IN ('NOT_STARTED', 'QUEUED', 'IN_PRODUCTION', 'QA_FAILED', 'QA_PASSED', 'DELIVERED', 'CANCELLED')),
  checkout_session_id TEXT UNIQUE,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TRIGGER orders_live_guard BEFORE INSERT ON orders
WHEN NEW.test_mode = 0 AND (SELECT live_enabled FROM system_mode WHERE id = 1) = 0
BEGIN SELECT RAISE(ABORT, 'LIVE_MODE_DISABLED'); END;
CREATE TRIGGER orders_test_mode_immutable BEFORE UPDATE OF test_mode, amount_minor, currency, quote_id ON orders
BEGIN SELECT RAISE(ABORT, 'ORDER_CORE_IMMUTABLE'); END;

-- Zahlungen ------------------------------------------------------------------
CREATE TABLE payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  order_id TEXT REFERENCES orders (order_id),
  amount_minor INTEGER,
  fee_minor INTEGER,
  currency TEXT,
  livemode INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  payload_sha256 TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  received_at TEXT NOT NULL,
  UNIQUE (provider, provider_event_id)
);
CREATE TRIGGER payment_events_no_update BEFORE UPDATE ON payment_events BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
CREATE TRIGGER payment_events_no_delete BEFORE DELETE ON payment_events BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
CREATE TRIGGER payment_events_live_guard BEFORE INSERT ON payment_events
WHEN (NEW.test_mode = 0 OR NEW.livemode = 1) AND (SELECT live_enabled FROM system_mode WHERE id = 1) = 0
BEGIN SELECT RAISE(ABORT, 'LIVE_MODE_DISABLED'); END;

-- Jobs -----------------------------------------------------------------------
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders (order_id),
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRY', 'DEAD_LETTER', 'HUMAN_REVIEW', 'REJECTED', 'BLOCKED_CAPACITY')),
  priority INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  requires_ai INTEGER NOT NULL DEFAULT 0 CHECK (requires_ai IN (0, 1)),
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  budget_eur_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_eur_cents >= 0),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_run_at TEXT,
  reason TEXT,
  last_error TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX jobs_runnable ON jobs (state, kind, next_run_at);

-- Produktion / QA / Lieferung -----------------------------------------------
CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (order_id),
  capability_id TEXT NOT NULL,
  capability_version INTEGER NOT NULL,
  version INTEGER NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  rights_json TEXT NOT NULL,
  quarantined_at TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (order_id, version)
);

CREATE TABLE qa_runs (
  qa_run_id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts (artifact_id),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  results_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE deliveries (
  delivery_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders (order_id),
  artifact_id TEXT NOT NULL REFERENCES artifacts (artifact_id),
  customer_id TEXT NOT NULL REFERENCES customers (customer_id),
  released_at TEXT NOT NULL,
  first_download_at TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  revoke_reason TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1))
);

-- Rechnungen -----------------------------------------------------------------
CREATE TABLE invoice_series (
  series TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL CHECK (next_number >= 1),
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1))
);

CREATE TABLE invoices (
  invoice_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (order_id),
  kind TEXT NOT NULL CHECK (kind IN ('INVOICE', 'CREDIT_NOTE')),
  references_invoice_id TEXT REFERENCES invoices (invoice_id),
  series TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  issued_by_registered_business INTEGER NOT NULL CHECK (issued_by_registered_business IN (0, 1)),
  seller_json TEXT NOT NULL,
  buyer_json TEXT NOT NULL,
  lines_json TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  net_minor INTEGER NOT NULL,
  tax_minor INTEGER,
  gross_minor INTEGER NOT NULL,
  tax_context TEXT NOT NULL,
  sdi_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'TAX_REVIEW', 'ISSUED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'CREDITED')),
  status_reason TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (series, invoice_number),
  CHECK (kind = 'INVOICE' OR references_invoice_id IS NOT NULL)
);
CREATE TRIGGER invoices_immutable BEFORE UPDATE OF invoice_id, order_id, kind, references_invoice_id, series, invoice_number,
  issued_by_registered_business, seller_json, buyer_json, lines_json, currency, net_minor, tax_minor, gross_minor, test_mode, created_at ON invoices
BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE'); END;
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices BEGIN SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE'); END;
CREATE TRIGGER invoices_live_guard BEFORE INSERT ON invoices
WHEN NEW.test_mode = 0 AND (SELECT live_enabled FROM system_mode WHERE id = 1) = 0
BEGIN SELECT RAISE(ABORT, 'LIVE_MODE_DISABLED'); END;

CREATE TABLE invoice_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT NOT NULL REFERENCES invoices (invoice_id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER invoice_history_no_update BEFORE UPDATE ON invoice_status_history BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
CREATE TRIGGER invoice_history_no_delete BEFORE DELETE ON invoice_status_history BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;

-- Ledger / Auszahlungen ------------------------------------------------------
CREATE TABLE ledger_entries (
  entry_id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders (order_id),
  account TEXT NOT NULL CHECK (account IN ('customer_payments', 'provider_fees', 'refunds', 'disputes', 'payouts', 'operating_costs')),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  source_type TEXT NOT NULL CHECK (source_type IN ('payment_event', 'payout_event', 'owner_manual')),
  source_ref TEXT NOT NULL,
  description TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (source_type, source_ref, account)
);
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'LEDGER_APPEND_ONLY'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'LEDGER_APPEND_ONLY'); END;
CREATE TRIGGER ledger_live_guard BEFORE INSERT ON ledger_entries
WHEN NEW.test_mode = 0 AND (SELECT live_enabled FROM system_mode WHERE id = 1) = 0
BEGIN SELECT RAISE(ABORT, 'LIVE_MODE_DISABLED'); END;

CREATE TABLE payouts (
  payout_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_payout_id TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  failure_reason TEXT,
  order_ids_json TEXT NOT NULL DEFAULT '[]',
  bank_credit_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (bank_credit_confirmed IN (0, 1)),
  provider_event_id TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TRIGGER payouts_live_guard BEFORE INSERT ON payouts
WHEN NEW.test_mode = 0 AND (SELECT live_enabled FROM system_mode WHERE id = 1) = 0
BEGIN SELECT RAISE(ABORT, 'LIVE_MODE_DISABLED'); END;

CREATE TABLE reconciliation_runs (
  run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('OK', 'REVIEW')),
  details_json TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);

-- Support / Audit / Kontingente ----------------------------------------------
CREATE TABLE support_tickets (
  ticket_id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders (order_id),
  customer_id TEXT REFERENCES customers (customer_id),
  kind TEXT NOT NULL CHECK (kind IN ('complaint', 'question', 'withdrawal', 'security')),
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  data_json TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX audit_subject ON audit_events (subject_id);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;

CREATE TABLE usage_counters (
  counter TEXT NOT NULL,
  window_key TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (counter, window_key)
);
