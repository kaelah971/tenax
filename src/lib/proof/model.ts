// Tenax Phase 4B-B6.1 — canonical JudgeProof record.
//
// A JudgeProof is a sanitized, versioned snapshot of one FINAL,
// user-facing Tenax outcome (executed fill, escalation, refusal, review
// requirement, or execution failure). It carries display facts only:
// numbers, codes, ids, routes, timestamps. It never carries credentials,
// tokens, headers, raw bodies, chain-of-thought, or wallet data.
//
// Records are immutable once written: identity derives deterministically
// from the source evidence, and repositories must keep the first write
// (INSERT ... ON CONFLICT DO NOTHING semantics).

import { z } from "zod";

export const PROOF_VERSION = 1;

export const PROOF_KINDS = [
  "EXECUTION_FILLED",
  "AUTHORITY_ESCALATED",
  "AUTHORITY_REFUSED",
  "REVIEW_REQUIRED",
  "EXECUTION_FAILED",
] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

const finiteNumber = z.number().finite();
const nullableFiniteNumber = z.number().finite().nullable();

export const proofAuthoritySchema = z.object({
  source: z.enum(["STANDING_MANDATE", "HUMAN_APPROVAL"]).nullable(),
  mode: z.string().nullable(),
  mandateId: z.string().nullable(),
  mandateHash: z.string().nullable(),
});
export type ProofAuthority = z.infer<typeof proofAuthoritySchema>;

export const proofProposalSchema = z.object({
  protectionPct: nullableFiniteNumber,
  notionalUsd: nullableFiniteNumber,
  side: z.literal("sell"),
  action: z.literal("SHORT_HEDGE"),
});
export type ProofProposal = z.infer<typeof proofProposalSchema>;

export const proofMandateSnapshotSchema = z.object({
  mandateId: z.string(),
  mode: z.string(),
  maxProtectionPct: finiteNumber,
  maxNotionalUsdt: finiteNumber,
  maxExecutions: z.number().int(),
  mandateHash: z.string().nullable(),
});
export type ProofMandateSnapshot = z.infer<typeof proofMandateSnapshotSchema>;

export const proofExecutionSchema = z.object({
  environment: z.literal("BITGET_DEMO"),
  provider: z.literal("Bitget"),
  providerOrderId: z.string().nullable(),
  quantity: z.string().nullable(),
  avgFillPrice: z.string().nullable(),
  executedValueUsdt: nullableFiniteNumber,
  status: z.enum(["FILLED", "FAILED"]),
  fundsLabel: z.literal("DEMO · VIRTUAL FUNDS"),
});
export type ProofExecution = z.infer<typeof proofExecutionSchema>;

export const proofProvenanceSchema = z.object({
  evidenceSource: z.literal("TENAX_ACTIVITY_RECEIPT"),
  recordedAt: z.string(),
  imported: z.boolean(),
  importSource: z.string().nullable(),
});
export type ProofProvenance = z.infer<typeof proofProvenanceSchema>;

export const judgeProofSchema = z.object({
  id: z.string().min(1).max(128),
  version: z.literal(PROOF_VERSION),
  kind: z.enum(PROOF_KINDS),
  flowId: z.string().min(1).max(64),
  subject: z.literal("NVDA"),
  symbol: z.literal("NVDAUSDT"),
  createdAt: z.string(),
  outcome: z.string().min(1).max(200),
  authority: proofAuthoritySchema,
  proposal: proofProposalSchema,
  mandateSnapshot: proofMandateSnapshotSchema.nullable(),
  execution: proofExecutionSchema.nullable(),
  receiptId: z.string().nullable(),
  reasonCodes: z.array(z.string()).max(20),
  sourceActivityEventId: z.string().min(1).max(64),
  provenance: proofProvenanceSchema,
});
export type JudgeProof = z.infer<typeof judgeProofSchema>;

/**
 * Deterministic proof identity: version + kind + source activity event.
 * The same event replay always addresses the same row, so replays can
 * never duplicate or fork history.
 */
export function proofIdFor(kind: ProofKind, sourceActivityEventId: string): string {
  return `proof:v${PROOF_VERSION}:${kind}:${sourceActivityEventId}`;
}
