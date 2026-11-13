-- INFINITY EARN 15.0 · Funktion 157/158: Bau je Auftrag auf einem externen Windows-Rechner (GitHub-Windows-Server).
-- Der Worker kann keine Windows-Programme übersetzen. Er legt einen Bauauftrag an; ein Bau-Agent holt ihn mit
-- eigenem Schlüssel ab, baut, testet und lädt das Ergebnis hoch. Erst die Abnahmeprüfung im Worker gibt die
-- Lieferung frei. Probebauten (order_id NULL) belegen den Weg mit Musterdaten, ohne Kundenauftrag.

CREATE TABLE external_builds (
  build_id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE REFERENCES orders (order_id),
  job_id TEXT,
  capability_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows')),
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
CREATE INDEX external_builds_state ON external_builds (state, created_at);
