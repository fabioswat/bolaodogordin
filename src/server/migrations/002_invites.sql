-- Convites de cadastro: link de uso único, com validade, que já inclui a pessoa no bolão.
-- Só o hash SHA-256 do token é guardado.
CREATE TABLE invites (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  pool_id INTEGER NOT NULL REFERENCES pools(id),
  note TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by INTEGER REFERENCES users(id),
  revoked_at TEXT
);
CREATE INDEX invites_pool ON invites (pool_id);
