// Tenax Phase 4B-B6.1 — optional historical proof import (validation only).
//
// There is deliberately NO automatic backfill: test fixtures must never
// become "verified live history", and no provider calls happen here. This
// module validates an externally supplied proof payload so a future
// explicit, owner-approved import can ingest it through the same
// idempotent repository upsert. Imported records always carry
// provenance.imported = true plus a human-supplied source note.

import { judgeProofSchema, PROOF_VERSION, type JudgeProof } from "./model";

export interface ImportedProofInput {
  readonly record: unknown;
  /** Human-supplied provenance note, e.g. "owner-attested 2026-09-20 Demo fill". */
  readonly importSource: string;
}

/**
 * Validate an external proof payload. Returns the canonical record with
 * import provenance stamped, or null when the payload is not a valid
 * proof. Never throws, never writes, never fabricates missing fields.
 */
export function parseImportedProof(input: ImportedProofInput): JudgeProof | null {
  if (typeof input.importSource !== "string" || input.importSource.trim() === "") return null;
  if (typeof input.record !== "object" || input.record === null) return null;
  const candidate = {
    ...(input.record as Record<string, unknown>),
    version: PROOF_VERSION,
    provenance: {
      evidenceSource: "TENAX_ACTIVITY_RECEIPT",
      recordedAt: new Date().toISOString(),
      imported: true,
      importSource: input.importSource.trim().slice(0, 200),
    },
  };
  const parsed = judgeProofSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
