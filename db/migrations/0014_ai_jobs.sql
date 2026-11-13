-- INFINITY EARN 16.0 · KI-Produktion über das Claude-Abo (offizielle Claude-Code-Action in GitHub Actions).
-- Bauaufträge gelten jetzt auch für die Plattform 'ai-claude'. SQLite kann CHECK-Bedingungen nicht ändern:
-- Tabelle wird mit identischen Spalten neu angelegt und die Daten werden übernommen.

CREATE TABLE external_builds_v2 (
  build_id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE REFERENCES orders (order_id),
  job_id TEXT,
  capability_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'ai-claude')),
  kind TEXT NOT NULL CHECK (kind IN ('ORDER', 'PROBE')),
  spec_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'CLAIMED', 'DONE', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until TEXT,
  last_error TEXT,
  runner_ref TEXT,
  result_path TEXT,
  result_sha256 TEXT,
  qa_json TEXT,
  qa_passed INTEGER CHECK (qa_passed IN (0, 1)),
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'ORDER') = (order_id IS NOT NULL))
);
INSERT INTO external_builds_v2 SELECT * FROM external_builds;
DROP TABLE external_builds;
ALTER TABLE external_builds_v2 RENAME TO external_builds;
CREATE INDEX external_builds_state ON external_builds (platform, state, created_at);
