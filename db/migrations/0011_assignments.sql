-- INFINITY EARN 15.0 · Gesamtprompt 157, Funktion 156 Universal Assignment Intelligence.
-- Prüfbare Auftragsanforderung (AssignmentSpec) je Kundenwunsch. Jede Scope-Version bleibt mit Originaltext erhalten (append-only);
-- die Kundenbestätigung ist ein eigener Beleg je Version. Kein Preis in der Anforderung: Preise kommen nur aus Policy/Freigabe.

CREATE TABLE assignment_specs (
  scope_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  lead_id TEXT REFERENCES leads (lead_id),
  channel TEXT NOT NULL CHECK (length(channel) BETWEEN 2 AND 40),
  dedupe_key TEXT NOT NULL,
  source_text TEXT NOT NULL CHECK (length(source_text) BETWEEN 1 AND 20000),
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  attachments_json TEXT NOT NULL DEFAULT '[]',
  domain TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ASSIGNMENT_AMBIGUOUS', 'REVIEW', 'CAPABILITY_PENDING', 'COST_APPROVAL_REQUIRED', 'CAPABILITY_BLOCKED', 'READY_FOR_QUOTE')),
  spec_json TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope_id, revision)
);
-- Doppelte Kanaleingänge desselben Wunsches erzeugen keine zweite Anforderung.
CREATE UNIQUE INDEX assignment_specs_dedupe ON assignment_specs (dedupe_key) WHERE revision = 1;
CREATE INDEX assignment_specs_lead ON assignment_specs (lead_id);
CREATE INDEX assignment_specs_created ON assignment_specs (created_at);
-- Einzige erlaubte Änderung: Löschantrag (DSGVO) entfernt Freitext und Analyse; Prüfsumme, Version und Stand bleiben als Nachweis.
CREATE TRIGGER assignment_specs_no_update BEFORE UPDATE ON assignment_specs
WHEN NOT (NEW.source_text = '[gelöscht]' AND NEW.spec_json = '{"erased":true}' AND NEW.attachments_json = '[]'
  AND NEW.scope_id = OLD.scope_id AND NEW.revision = OLD.revision AND NEW.source_sha256 = OLD.source_sha256 AND NEW.status = OLD.status
  AND NEW.domain = OLD.domain AND NEW.dedupe_key = OLD.dedupe_key AND NEW.channel = OLD.channel AND NEW.actor = OLD.actor
  AND NEW.created_at = OLD.created_at AND NEW.lead_id IS OLD.lead_id)
BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
CREATE TRIGGER assignment_specs_no_delete BEFORE DELETE ON assignment_specs BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;

CREATE TABLE assignment_confirmations (
  confirmation_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL,
  confirmed_by TEXT NOT NULL CHECK (confirmed_by IN ('customer', 'owner_recorded')),
  evidence TEXT NOT NULL CHECK (length(evidence) BETWEEN 3 AND 500),
  confirmed_at TEXT NOT NULL,
  UNIQUE (scope_id, revision),
  FOREIGN KEY (scope_id, revision) REFERENCES assignment_specs (scope_id, revision)
);
CREATE TRIGGER assignment_confirmations_no_update BEFORE UPDATE ON assignment_confirmations BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
CREATE TRIGGER assignment_confirmations_no_delete BEFORE DELETE ON assignment_confirmations BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
