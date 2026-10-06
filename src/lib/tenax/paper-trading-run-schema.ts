// Additive Postgres schema for the canonical paper/Demo run ledger.
// The repository applies this idempotent DDL lazily, like the proof ledger.

export const PAPER_TRADING_RUN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenax_paper_trading_runs (
  run_id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  environment TEXT NULL,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL,
  authority_outcome TEXT NOT NULL,
  execution_status TEXT NOT NULL,
  source_activity_event_id TEXT NULL UNIQUE,
  source_proof_id TEXT NULL,
  record JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS tenax_paper_trading_runs_created_idx
  ON tenax_paper_trading_runs (created_at ASC);
CREATE INDEX IF NOT EXISTS tenax_paper_trading_runs_filter_idx
  ON tenax_paper_trading_runs (environment, status, symbol, created_at ASC);
`.trim();
