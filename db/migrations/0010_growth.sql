-- INFINITY EARN 15.0 · P4 Verkaufsfreigabe und Wachstumsfunktionen 132, 135, 138–140, 147–149, 151, 155.
-- Grundsätze: nur echte Belege, append-only wo Nachweise entstehen, nichts zählt als Umsatz ohne bestätigtes Zahlungsereignis.

-- P4: Verkaufsfreigabe je Produktart durch den Eigentümer (nach Vorschau und bestandener Musterprüfung).
CREATE TABLE product_releases (
  release_id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  capability_version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('RELEASED', 'REVOKED')),
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor > 0),
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),
  sample_qa_json TEXT,
  reason TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (action = 'REVOKED' OR (price_minor IS NOT NULL AND currency IS NOT NULL AND sample_qa_json IS NOT NULL))
);
CREATE INDEX product_releases_cap ON product_releases (capability_id, created_at);
CREATE TRIGGER product_releases_no_update BEFORE UPDATE ON product_releases BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
CREATE TRIGGER product_releases_no_delete BEFORE DELETE ON product_releases BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;

-- 135/151: Bedarfsseiten – nur für echte, freigegebene Leistungen; veröffentlicht erst nach inhaltlicher QA.
CREATE TABLE landing_pages (
  slug TEXT PRIMARY KEY CHECK (slug GLOB '[a-z0-9-]*' AND length(slug) BETWEEN 3 AND 60),
  cluster_id TEXT NOT NULL,
  primary_intent TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'QA_BLOCKED', 'PUBLISHED', 'UNDER_REVIEW', 'RETIRED')),
  qa_json TEXT NOT NULL DEFAULT '[]',
  capability_version INTEGER NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL
);

-- 147: Suchabsichten aus echten Quellen (eigene Anfragen, Berater-Eingaben, später Search Console) – nie erfundene Volumina.
CREATE TABLE search_intents (
  intent_id TEXT PRIMARY KEY,
  query_norm TEXT NOT NULL,
  intent_class TEXT NOT NULL CHECK (intent_class IN ('COMMERCIAL', 'COMPARISON', 'INFORMATIONAL', 'UNKNOWN')),
  source TEXT NOT NULL CHECK (source IN ('inquiry', 'advisor', 'search_console')),
  source_ref TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  mapped_capability TEXT,
  mapping_state TEXT NOT NULL CHECK (mapping_state IN ('MAPPED', 'FEASIBILITY_CHECK', 'REVIEW')),
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  UNIQUE (source, source_ref)
);

-- 148: Fachinhalte (Ratgeber) – Entwurf, Prüfung, Veröffentlichung, Wiedervorlage bei Produktänderung.
CREATE TABLE content_pages (
  slug TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('de', 'it', 'en')),
  capability_id TEXT NOT NULL,
  capability_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'REVIEW_BLOCKED', 'PUBLISHED', 'NEEDS_REVIEW', 'RETIRED')),
  review_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (slug, lang)
);

-- 149: Verbreitung nur über vom Eigentümer verbundene Kanäle; ohne Adapter bleibt alles NOT_CONNECTED.
CREATE TABLE distribution_posts (
  post_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  content_slug TEXT NOT NULL,
  link_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PLANNED', 'NOT_CONNECTED', 'BLOCKED', 'PUBLISHED', 'RATE_LIMITED')),
  reason TEXT,
  publish_receipt TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  CHECK (status <> 'PUBLISHED' OR publish_receipt IS NOT NULL)
);

-- 139: Partnernetzwerk – nur mit ausdrücklicher Teilnahme und Vertrag; Provision nur aus verifizierten Zahlungen.
CREATE TABLE partners (
  partner_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  consent_ref TEXT NOT NULL,
  contract_ref TEXT NOT NULL,
  territory TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  commission_bps INTEGER NOT NULL CHECK (commission_bps BETWEEN 0 AND 3000),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED')),
  referral_code TEXT NOT NULL UNIQUE,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE TABLE referrals (
  referral_id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners (partner_id),
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads (lead_id),
  attribution_rule TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE partner_commissions (
  commission_id TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL REFERENCES referrals (referral_id),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders (order_id),
  base_minor INTEGER NOT NULL CHECK (base_minor >= 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  payment_event_ref TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING_OWNER', 'APPROVED', 'VOID')),
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL
);

-- 140: Erste-Kunden-Experimente – Budget fest 0 €, Ergebnis nur aus echten bezahlten Aufträgen.
CREATE TABLE first_customer_experiments (
  experiment_id TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  primary_metric TEXT NOT NULL,
  permitted_channels_json TEXT NOT NULL,
  max_spend_eur INTEGER NOT NULL DEFAULT 0 CHECK (max_spend_eur = 0),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('EXPERIMENT_PROPOSED', 'RUNNING', 'FIRST_PAID_ORDER_VERIFIED', 'NO_DEMAND', 'STOPPED', 'SCALE_ELIGIBLE')),
  decided_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (end_at > start_at)
);

-- Herkunft einer Anfrage (Kanal/Kampagne) für 155 – nur datensparsame, freiwillig mitgegebene Parameter.
ALTER TABLE leads ADD COLUMN acquisition_channel TEXT;
ALTER TABLE leads ADD COLUMN acquisition_campaign TEXT;
