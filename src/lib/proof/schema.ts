// Tenax Phase 4B-B6.1 — proof ledger SQL.
//
// Single table, no migrations framework: the repository runs this
// idempotent DDL (CREATE TABLE / INDEX IF NOT EXISTS) lazily on first
// use, so any DATABASE_URL-backed deployment self-provisions without
// owner credentials or manual steps. The same statement is the migration
// record — review it here, not in a separate tool.
//
// Identity and immutability live in constraints, not application code:
// - PRIMARY KEY (id): deterministic proof identity; replays address the
//   same row.
// - UNIQUE (source_activity_event_id): one event → at most one proof row,
//   even across kinds.
// - Writers use INSERT ... ON CONFLICT DO NOTHING and return the stored
//   row, so the first write always wins and a FILLED proof can never be
//   overwritten or downgraded by a replay.

export const PROOF_LEDGER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenax_judge_proofs (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL,
  authority JSONB NOT NULL,
  proposal JSONB NOT NULL,
  mandate_snapshot JSONB NULL,
  execution JSONB NULL,
  receipt_id TEXT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]',
  source_activity_event_id TEXT NULL UNIQUE,
  provenance JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenax_judge_proofs_flow_idx
  ON tenax_judge_proofs (flow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenax_judge_proofs_receipt_idx
  ON tenax_judge_proofs (receipt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenax_judge_proofs_kind_idx
  ON tenax_judge_proofs (kind, created_at DESC);
`.trim();
