-- INFINITY EARN 15.0 · Kundennachrichten (Postausgang). Nur Nachrichten mit Rechtsgrundlage:
-- transaktional (zum eigenen Auftrag) oder Werbung NUR mit nachweisbarer Einwilligung. Keine Kaltakquise.
-- Empfänger wird nicht im Klartext gespeichert (Auflösung über den Lead erst beim Versand).
CREATE TABLE outbox_messages (
  message_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('transactional', 'marketing')),
  template TEXT NOT NULL,
  lead_id TEXT NOT NULL REFERENCES leads (lead_id),
  order_id TEXT REFERENCES orders (order_id),
  recipient_masked TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('HELD', 'SENT', 'BLOCKED', 'SUPPRESSED')),
  reason TEXT,
  legal_basis TEXT NOT NULL CHECK (legal_basis IN ('contract', 'consent')),
  idempotency_key TEXT NOT NULL UNIQUE,
  test_mode INTEGER NOT NULL CHECK (test_mode IN (0, 1)),
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX outbox_status ON outbox_messages (status, test_mode);
CREATE TRIGGER outbox_no_delete BEFORE DELETE ON outbox_messages BEGIN SELECT RAISE(ABORT, 'OUTBOX_APPEND_ONLY'); END;
-- Werbung ohne Einwilligung kann nicht einmal als Entwurf gespeichert werden.
CREATE TRIGGER outbox_marketing_requires_consent BEFORE INSERT ON outbox_messages
WHEN NEW.kind = 'marketing' AND NOT EXISTS (
  SELECT 1 FROM consents c JOIN leads l ON l.lead_id = c.lead_id
  WHERE c.lead_id = NEW.lead_id AND c.purpose = 'marketing_email' AND c.withdrawn_at IS NULL AND l.marketing_opt_out = 0)
BEGIN SELECT RAISE(ABORT, 'MARKETING_REQUIRES_CONSENT'); END;
-- Nur von außen bestätigter Versand darf „SENT“ setzen (es existiert derzeit kein freigegebener Versandkanal).
CREATE TRIGGER outbox_sent_requires_timestamp BEFORE UPDATE OF status ON outbox_messages
WHEN NEW.status = 'SENT' AND NEW.sent_at IS NULL
BEGIN SELECT RAISE(ABORT, 'SENT_REQUIRES_PROVIDER_CONFIRMATION'); END;
