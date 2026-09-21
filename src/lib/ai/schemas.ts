// Tenax Phase 4B-A — strict AI output contract (Zod, FAIL CLOSED).
//
// Output ownership split (the model must never author audit metadata):
// - AiModelPayload: the ONLY thing the model may produce — semantic
//   analysis (subject, decision, pct, rationale, drivers, risks, missing
//   evidence, evidence refs). .strict() rejects everything else, including
//   provider/model/generatedAt/provenance/evidencePackHash/outputHash and
//   any execution field (symbol, side, qty, leverage, margin, endpoints,
//   oids, approval, verdict) or chain-of-thought smuggling.
// - AiProtectionAnalysis: the Tenax-owned envelope — payload fields plus
//   system-attached audit metadata (provider/model from resolved server
//   config, server timestamp, provenance "AI", precomputed evidence hash).
//   Constructed deterministically by code AFTER validation, never echoed.
// - WAIT / NO_ACTION must carry pct null (non-actionable by construction);
//   PROTECT requires a finite 0..100 pct. Values above the mandate are NOT
//   clamped here — the Mandate Engine refuses them downstream, on purpose.

import { z } from "zod";

export const AI_DECISIONS = ["PROTECT", "WAIT", "NO_ACTION"] as const;
export type AiDecision = (typeof AI_DECISIONS)[number];

/** Model-authored semantic payload. Nothing else is accepted. */
export const aiModelPayloadSchema = z
  .object({
    subjectId: z.literal("NVDA"),
    decision: z.enum(AI_DECISIONS),
    recommendedProtectionPct: z.number().min(0).max(100).nullable(),
    rationale: z.string().min(1).max(1000),
    keyDrivers: z.array(z.string().min(1).max(300)).min(1).max(10),
    risks: z.array(z.string().min(1).max(300)).min(1).max(10),
    missingEvidence: z.array(z.string().min(1).max(300)).max(10),
    evidenceRefs: z.array(z.string().min(1).max(300)).max(20),
  })
  .strict();

export type AiModelPayload = z.infer<typeof aiModelPayloadSchema>;

/**
 * Tenax-owned envelope: validated payload plus system-attached audit
 * metadata. Built by code, never by the model.
 */
export const aiProtectionAnalysisSchema = aiModelPayloadSchema.extend({
  generatedAt: z.string().min(1).max(64),
  provider: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  provenance: z.literal("AI"),
  evidencePackHash: z.string().min(1).max(128),
}).strict();

export type AiProtectionAnalysis = z.infer<typeof aiProtectionAnalysisSchema>;

/** Stored audit trail for a validated model analysis (no secrets, no CoT). */
export interface AiAnalysisAudit {
  readonly provider: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly evidencePackHash: string;
  readonly outputHash: string;
  readonly decision: AiDecision;
  readonly recommendedProtectionPct: number | null;
  readonly rationale: string;
  readonly keyDrivers: readonly string[];
  readonly risks: readonly string[];
  readonly missingEvidence: readonly string[];
}
