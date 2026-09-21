// Tenax Phase 1C — analysis / proposal contract (no LLM provider yet).
//
// The contract separates what reasoning MAY say from what authority computes:
// - AnalysisReasoning: summary, risk observations, proposed pct, rationale,
//   evidence refs. A future LLM must conform to analysisReasoningSchema;
//   prose NEVER determines execution values.
// - AnalysisAuthority: trade value, mandate decision, approval requirement,
//   execution eligibility — computed deterministically by code.
//
// The development golden path uses analyzeProtectionFixture: a deterministic
// stand-in clearly marked kind "development-fixture", informed by real
// snapshot fields but never presented as live AI output.

import { z } from "zod";

import type {
  Exposure,
  Mandate,
  MandateDecision,
  ProtectionIntent,
  ProtectionProposal,
} from "./domain";
import { evaluateMandate } from "./mandate.ts";
import type { NvidiaMarketSnapshot } from "../intelligence/snapshot";

/** Reasoning output shape a future model must conform to. */
export interface AnalysisReasoning {
  readonly kind: "development-fixture" | "model";
  readonly summary: string;
  readonly riskObservations: readonly string[];
  readonly proposedProtectionPct: number;
  readonly rationale: string;
  readonly evidenceRefs: readonly string[];
}

/** Zod contract for any future LLM analysis output (prose side only). */
export const analysisReasoningSchema = z.object({
  kind: z.literal("model"),
  summary: z.string().min(1).max(500),
  riskObservations: z.array(z.string().min(1).max(300)).min(1).max(10),
  proposedProtectionPct: z.number().min(0).max(100),
  rationale: z.string().min(1).max(1000),
  evidenceRefs: z.array(z.string().min(1)).max(20),
});

/** Deterministic authority derived by code from reasoning + mandate. */
export interface AnalysisAuthority {
  readonly calculatedTradeValueUsdt: number;
  readonly mandateDecision: MandateDecision;
  readonly approvalRequired: boolean;
  readonly executionEligible: boolean;
}

export interface ProtectionAnalysis {
  readonly reasoning: AnalysisReasoning;
  readonly proposal: ProtectionProposal;
  readonly authority: AnalysisAuthority;
  /** Oversized alternative evaluated alongside, expected to REFUSE. */
  readonly consideredAlternative: {
    readonly proposal: ProtectionProposal;
    readonly decision: MandateDecision;
  };
}

export function round2Usdt(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic development analysis fixture for the golden path.
 * 500 USDT exposure at 20% -> 100 USDT. Throws when the market snapshot is
 * UNAVAILABLE rather than reasoning on stale/missing data.
 */
export function analyzeProtectionFixture(
  exposure: Exposure,
  intent: ProtectionIntent,
  mandate: Mandate,
  snapshot: NvidiaMarketSnapshot,
  evaluatedAt: string = new Date().toISOString(),
): ProtectionAnalysis {
  if (snapshot.availability === "UNAVAILABLE") {
    throw new Error(
      "ANALYSIS_BLOCKED: market snapshot UNAVAILABLE — refusing to reason without market data",
    );
  }
  if (intent.exposureId !== exposure.id) {
    throw new Error("ANALYSIS_BLOCKED: intent does not belong to this exposure");
  }

  const proposedProtectionPct = 20;
  const calculatedTradeValueUsdt = round2Usdt(
    (exposure.exposureValueUsdt * proposedProtectionPct) / 100,
  );
  const proposal: ProtectionProposal = {
    underlying: exposure.underlying,
    protectionPct: proposedProtectionPct,
    proposedTradeValueUsdt: calculatedTradeValueUsdt,
    leverageUsed: 1,
  };
  const mandateDecision = evaluateMandate(proposal, mandate, exposure, evaluatedAt);

  const lastPrice = snapshot.ticker.data?.lastPrice ?? "unavailable";
  const sessionState =
    snapshot.sessions.data?.currentState ?? "UNKNOWN";
  const reasoning: AnalysisReasoning = {
    kind: "development-fixture",
    summary:
      "Development fixture: bounded 20% earnings protection proposed for NVIDIA exposure.",
    riskObservations: [
      `RNVDAUSDT last price ${lastPrice} (Bitget public ticker, sample context).`,
      `US session state ${sessionState} (Bitget-native context; UNKNOWN means no authoritative marker).`,
      "No verified earnings date; timing risk cannot be quantified from forecast data.",
    ],
    proposedProtectionPct,
    rationale:
      "20% sits inside the 30% / 150 USDT mandate with margin for spread and drift. " +
      "This is fixture reasoning, not live AI output.",
    evidenceRefs: snapshot.sourceRefs.map((s) => `${s.endpoint} [${s.status}]`),
  };

  // Canonical oversized alternative: recorded as considered-and-refused so
  // receipts show restraint, per the 90-second demo narrative.
  const alternativeProposal: ProtectionProposal = {
    underlying: exposure.underlying,
    protectionPct: 40,
    proposedTradeValueUsdt: 200,
    leverageUsed: 1,
  };

  return {
    reasoning,
    proposal,
    authority: {
      calculatedTradeValueUsdt,
      mandateDecision,
      approvalRequired: mandate.approvalRequired,
      executionEligible: mandateDecision.verdict === "PASS",
    },
    consideredAlternative: {
      proposal: alternativeProposal,
      decision: evaluateMandate(alternativeProposal, mandate, exposure, evaluatedAt),
    },
  };
}
