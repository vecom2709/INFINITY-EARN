-- INFINITY EARN – 0004 M3: Live-Freigaben mit Nachweis, Unternehmensprofil, Verbraucher-Zustimmung digitale Inhalte
-- WICHTIG: Freigaben schalten LIVE NICHT frei. Dafür bleibt eine eigene, geprüfte Migration nötig (system_mode ist gesperrt).

CREATE TABLE live_activation_items (
  item_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  responsible TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'APPROVED', 'NOT_APPLICABLE')),
  evidence_ref TEXT,
  note TEXT,
  approved_by TEXT,
  updated_at TEXT NOT NULL,
  CHECK (status NOT IN ('APPROVED', 'NOT_APPLICABLE') OR (evidence_ref IS NOT NULL AND length(evidence_ref) >= 5 AND approved_by = 'owner'))
);
INSERT INTO live_activation_items (item_id, title, responsible, status, updated_at) VALUES
  ('LA-01', 'Betriebsland / steuerlicher Sitz / Betriebsstätte festgelegt', 'Eigentümer + Steuerberatung', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-02', 'Rechtsform, Gewerbe- und Steuerregistrierung (Partita IVA bzw. Gewerbe + USt-IdNr.)', 'Eigentümer', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-03', 'Zahlungsanbieter-Vertrag und KYC durch Eigentümer im Provider-UI (Stripe Live-Konto INFINITY EARN)', 'Eigentümer', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-04', 'Auszahlungskonto (SEPA) im Provider-UI hinterlegt', 'Eigentümer', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-05', 'Offizielle Rechnungslösung je Sitz/Kundenland (SdI/FatturaPA bzw. E-Rechnung) geprüft', 'Steuerberatung', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-06', 'USt/OSS/Reverse-Charge-Regeln je Kundentyp und EU-Land fachlich freigegeben', 'Steuerberatung', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-07', 'AGB, Widerrufsbelehrung inkl. Verzicht bei digitalen Inhalten, Impressum geprüft', 'Rechtsberatung', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-08', 'Datenschutzerklärung, Verarbeitungsverzeichnis, Aufbewahrungs-/Löschfristen', 'Rechtsberatung / DSB', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-09', 'Produkt- und Lizenzbedingungen b2b-calc-csv (Nutzungsrechte, Haftung, Erstattung)', 'Rechtsberatung', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-10', 'Stripe-Testmodus End-to-End bestanden; Live-Keys getrennt im Secret-Store', 'Technik + Eigentümer', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-11', 'Staging-Deployment mit Sicherheitsprüfung, Backup/Restore-Test', 'Technik', 'OPEN', '2026-11-12T00:00:00.000Z'),
  ('LA-12', 'Eigentümer-Freigabe der Live-Policy (Preisgrenzen, Budget = 0, Märkte, Notstopps getestet)', 'Eigentümer', 'OPEN', '2026-11-12T00:00:00.000Z');

CREATE TABLE live_activation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES live_activation_items (item_id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  evidence_ref TEXT,
  note TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER live_activation_history_no_update BEFORE UPDATE ON live_activation_history BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;
CREATE TRIGGER live_activation_history_no_delete BEFORE DELETE ON live_activation_history BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END;

-- Eigentümer-Grundentscheidungen (M3-Fragebogen 12.11.2026).
CREATE TABLE business_profile (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL
);
INSERT INTO business_profile (key, value, decided_by, decided_at) VALUES
  ('seat_country', 'OPEN', 'owner', '2026-11-12T00:00:00.000Z'),
  ('legal_entity', 'NEW_INDEPENDENT_ENTITY', 'owner', '2026-11-12T00:00:00.000Z'),
  ('customer_types', 'B2B,B2C', 'owner', '2026-11-12T00:00:00.000Z'),
  ('markets', 'EU', 'owner', '2026-11-12T00:00:00.000Z');

-- Verbraucher (B2C): ausdrückliche Zustimmung zur sofortigen Ausführung + Kenntnisnahme des Erlöschens des Widerrufsrechts.
ALTER TABLE quotes ADD COLUMN consumer_waiver_ref TEXT;
