-- INFINITY EARN · Auftragsart „Programm nach Vorlage“ (Analyse eines vorhandenen Programms und Neubau).
-- Angenommen wird nur mit ausdrücklicher Rechte-Erklärung des Kunden; jede Anfrage wartet auf die Entscheidung
-- des Eigentümers. Es wird keine Programmdatei gespeichert – die Vorlage wird erst nach Annahme übergeben.
-- Der Statuslink des Kunden ist nur als SHA-256-Hash gespeichert.

CREATE TABLE rebuild_requests (
  request_id TEXT PRIMARY KEY,
  status_token_hash TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  program_name TEXT NOT NULL,
  program_kind TEXT NOT NULL CHECK (program_kind IN ('dotnet', 'javascript', 'web', 'native', 'unknown')),
  description TEXT NOT NULL,
  rights_basis TEXT NOT NULL CHECK (rights_basis IN ('OWN_SOFTWARE', 'LICENSE_PERMITS')),
  rights_detail TEXT NOT NULL,
  rights_text_version TEXT NOT NULL,
  rights_confirmed_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('OWNER_APPROVAL_REQUIRED', 'ACCEPTED', 'DECLINED')),
  owner_note TEXT,
  decided_at TEXT,
  test_mode INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_rebuild_requests_state ON rebuild_requests (state, created_at);
