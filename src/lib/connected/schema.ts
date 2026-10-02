// Tenax Connected Mode — durable Postgres schema.
//
// Connected state is intentionally separate from the shared Demo store and
// proof ledger. Ownership is enforced by foreign keys and by session-scoped
// queries; no credential column exists in this schema.
export const CONNECTED_MODE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenax_connected_users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS tenax_connected_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tenax_connected_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS tenax_connected_sessions_expiry_idx
  ON tenax_connected_sessions (token_hash, expires_at, revoked_at);
CREATE UNIQUE INDEX IF NOT EXISTS tenax_connected_sessions_owner_idx
  ON tenax_connected_sessions (id, user_id);
CREATE TABLE IF NOT EXISTS tenax_bitget_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tenax_connected_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'BITGET'),
  provider_user_id TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('PAIRING', 'CONNECTED', 'STALE', 'DISCONNECTED', 'ERROR')),
  access_mode TEXT NOT NULL CHECK (access_mode = 'READ_ONLY'),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  disconnected_at TIMESTAMPTZ NULL,
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS tenax_bitget_connections_user_idx
  ON tenax_bitget_connections (user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS tenax_connected_pairings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tenax_connected_users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  connection_id TEXT NULL,
  FOREIGN KEY (session_id, user_id)
    REFERENCES tenax_connected_sessions (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (connection_id, user_id)
    REFERENCES tenax_bitget_connections (id, user_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tenax_connected_pairings_owner_idx
  ON tenax_connected_pairings (user_id, session_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS tenax_connected_account_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES tenax_connected_users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (connection_id, user_id)
    REFERENCES tenax_bitget_connections (id, user_id)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tenax_connected_snapshots_latest_idx
  ON tenax_connected_account_snapshots (user_id, connection_id, synced_at DESC);
`.trim();
