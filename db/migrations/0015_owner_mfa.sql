-- INFINITY EARN · Zweiter Faktor für den Eigentümer per Passkey (WebAuthn): Windows Hello, Handy-Entsperrung,
-- Sicherheitsschlüssel – ohne zusätzliche App. Gespeichert wird nur der öffentliche Schlüssel des Geräts.
-- Wiederherstellungscodes nur als SHA-256-Hash, jeder genau einmal verwendbar.

CREATE TABLE owner_passkeys (
  cred_id TEXT PRIMARY KEY,
  public_key_spki TEXT NOT NULL,
  alg INTEGER NOT NULL CHECK (alg IN (-7, -257)),
  sign_count INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE owner_recovery_codes (
  code_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  used_at TEXT
);

-- Stufe 2 der Anmeldung nach richtigem Passwort (Cookie), höchstens 5 Versuche
CREATE TABLE owner_mfa_challenges (
  token_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Einmalige WebAuthn-Herausforderungen (Registrierung bzw. Anmeldung)
CREATE TABLE webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  expires_at TEXT NOT NULL
);
