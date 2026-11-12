-- INFINITY EARN – 0002 M1: Quellenfreigabe, Abrufläufe, Quellnachweise, Bewertung, Angebotsentwürfe

ALTER TABLE sources ADD COLUMN connector TEXT;
ALTER TABLE sources ADD COLUMN approved_by TEXT;
ALTER TABLE sources ADD COLUMN approval_evidence TEXT;

UPDATE sources SET connector = 'inbound_form', approved_by = 'owner:system-seed' WHERE source_id = 'src_inbound_form';

-- TED wird NICHT vorab freigegeben: Freigabe nur durch den Eigentümer (Dashboard).
INSERT INTO sources (source_id, name, base_url, source_license, automation_allowed, terms_url, terms_hash, terms_checked_at, status, created_at, connector, approval_evidence)
VALUES (
  'src_ted_eu',
  'TED – Tenders Electronic Daily (EU-Amtsblatt S, Search-API v3)',
  'https://ted.europa.eu/',
  'Bekanntmachungen frei wiederverwendbar, kommerziell und nicht-kommerziell (Wiederverwendungsbeschluss der Kommission vom 12.12.2011, 2011/833/EU). Search-API anonym, ohne Schlüssel. Fair Use: max. 700 HTTP-Anfragen/Minute.',
  1,
  'https://ted.europa.eu/en/legal-notice',
  NULL,
  NULL,
  'PENDING_REVIEW',
  '2026-11-12T00:00:00.000Z',
  'ted_v3',
  '{"legal_notice":"https://ted.europa.eu/en/legal-notice","api_docs":"https://docs.ted.europa.eu/api/latest/index.html","auth":"The Search API does not require a key.","fair_use":"https://ted.europa.eu/en/simap/developers-corner-for-reusers","reuse_decision":"https://eur-lex.europa.eu/eli/dec/2011/833/oj","checked_at":"2026-11-12"}'
);

CREATE TABLE source_fetch_runs (
  run_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources (source_id),
  mode TEXT NOT NULL CHECK (mode IN ('PERSIST', 'PREVIEW')),
  status TEXT NOT NULL CHECK (status IN ('OK', 'BLOCKED', 'ERROR')),
  request_json TEXT NOT NULL,
  items_seen INTEGER NOT NULL DEFAULT 0,
  items_new INTEGER NOT NULL DEFAULT 0,
  items_relevant INTEGER NOT NULL DEFAULT 0,
  leads_created INTEGER NOT NULL DEFAULT 0,
  total_available INTEGER,
  error TEXT,
  actor TEXT NOT NULL,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);

-- Jede abgerufene Bekanntmachung bleibt als prüfbarer Nachweis erhalten (öffentliche, frei wiederverwendbare Daten).
CREATE TABLE source_items (
  item_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources (source_id),
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  buyer TEXT,
  country TEXT,
  cpv_json TEXT NOT NULL,
  notice_type TEXT,
  published_at TEXT,
  deadline_at TEXT,
  raw_sha256 TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  fetched_run_id TEXT NOT NULL REFERENCES source_fetch_runs (run_id),
  lead_id TEXT REFERENCES leads (lead_id),
  fit_score INTEGER NOT NULL,
  evidence_score INTEGER NOT NULL,
  risk_score INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  relevant INTEGER NOT NULL CHECK (relevant IN (0, 1)),
  score_reasons_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_id, external_id)
);
CREATE INDEX source_items_rank ON source_items (relevant, total_score);

CREATE TABLE offer_drafts (
  draft_id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities (opportunity_id),
  content_md TEXT NOT NULL,
  price_minor INTEGER,
  currency TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT_FOR_REVIEW', 'APPROVED_FOR_MANUAL_SUBMISSION', 'REJECTED')),
  reviewed_by TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER offer_drafts_content_immutable BEFORE UPDATE OF content_md, price_minor, opportunity_id ON offer_drafts
BEGIN SELECT RAISE(ABORT, 'DRAFT_CONTENT_IMMUTABLE'); END;
