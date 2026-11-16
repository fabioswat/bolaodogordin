CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'participant')),
  must_change_password INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pools (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  contest_number INTEGER NOT NULL,
  draw_date TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  max_games_per_participant INTEGER NOT NULL CHECK (max_games_per_participant >= 1),
  status TEXT NOT NULL CHECK (status IN ('open', 'locked', 'closed')),
  result_numbers TEXT,
  result_registered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pool_members (
  pool_id INTEGER NOT NULL REFERENCES pools(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  paid_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  pool_id INTEGER NOT NULL REFERENCES pools(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  public_code TEXT NOT NULL UNIQUE,
  numbers TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- A mesma combinação só pode existir uma vez entre os jogos ativos de um bolão.
CREATE UNIQUE INDEX games_unique_active_combination ON games (pool_id, numbers) WHERE status = 'active';
CREATE INDEX games_pool_user ON games (pool_id, user_id, status);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id),
  pool_id INTEGER REFERENCES pools(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_logs_pool ON audit_logs (pool_id, created_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
