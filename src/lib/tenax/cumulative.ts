// Tenax Phase 4B-B2.2 — cumulative protection evaluation (pure, deterministic).
//
// A standing mandate caps TOTAL protection as a share of exposure, not
// just the size of each new action. Before any autonomous Demo write,
// Tenax must project: existing Demo short notional + proposed additional
// notional, and refuse when the projected total exceeds maxProtectionPct.
//
// Safety contract (do not weaken without owner approval):
// - Pure function: no LLM, no network, no credentials, no clock.
// - Existing protection is valued cautiously as size × current mark, only
//   for a confirmed same-direction (short) NVDAUSDT position with finite
//   positive size and mark. Anything else fails closed — never assume zero.
// - No netting engine: an opposite (long) or unconfirmed-side position is
//   UNKNOWN, never netted against the proposal.
// - No clamping, no auto-resize: over-limit projections refuse outright.
// - Approximations are labeled as such; this is mapped protection, never
//   a delta-neutrality claim.

import { parseAmount } from "../bitget/demo-assets.ts";
import type { NvdaPosition } from "../bitget/nvda-hedge.ts";

export interface CumulativeProtectionInput {
  readonly grossExposureUsd: number;
  /** Null when the position read failed or is unparseable — fails closed. */
  readonly existingPosition: NvdaPosition | null;
  readonly proposedAdditionalUsd: number;
  readonly maxProtectionPct: number;
}

export type CumulativeExistingKind = "NONE" | "UNDERSTOOD" | "UNKNOWN";

export type CumulativeUnknownReason = "unreadable" | "unvalued" | "opposite" | "invalid_inputs";

export type CumulativeReasonCode =
  | "within_projected_mandate"
  | "projected_protection_exceeds_mandate"
  | "position_unreadable"
  | "position_unvalued"
  | "opposite_position"
  | "invalid_inputs";

/**
 * Phase 4B-B4 routing classification for a failed cumulative projection.
 * Only an over-limit projection on otherwise readable state may escalate
 * to human review (and only under AUTO_WITH_ESCALATION). Unknown,
 * unvalued, opposite-side, and invalid projections are hard refusals in
 * every mode — the cycle fails closed and never asks a human to bless an
 * unreadable state.
 */
export type CumulativeRoute = "ESCALATABLE" | "HARD_REFUSAL";

export function classifyCumulativeRoute(reasonCode: CumulativeReasonCode): CumulativeRoute {
  return reasonCode === "projected_protection_exceeds_mandate" ? "ESCALATABLE" : "HARD_REFUSAL";
}

export interface CumulativeProtectionResult {
  readonly existingUsd: number | null;
  readonly proposedUsd: number;
  readonly projectedUsd: number | null;
  readonly projectedPct: number | null;
  readonly maxPct: number;
  readonly passes: boolean;
  readonly reasonCode: CumulativeReasonCode;
  readonly existingKind: CumulativeExistingKind;
  readonly unknownReason: CumulativeUnknownReason | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Project total protection and check it against the mandate ceiling.
 * Deterministic; fail-closed on any unknown. The 30% boundary itself
 * passes (<=, never <).
 */
export function evaluateCumulativeProtection(
  input: CumulativeProtectionInput,
): CumulativeProtectionResult {
  const { grossExposureUsd, proposedAdditionalUsd, maxProtectionPct } = input;
  const invalid =
    !Number.isFinite(grossExposureUsd) ||
    grossExposureUsd <= 0 ||
    !Number.isFinite(proposedAdditionalUsd) ||
    proposedAdditionalUsd < 0 ||
    !Number.isFinite(maxProtectionPct) ||
    maxProtectionPct < 0;
  if (invalid) {
    return {
      existingUsd: null,
      proposedUsd: proposedAdditionalUsd,
      projectedUsd: null,
      projectedPct: null,
      maxPct: maxProtectionPct,
      passes: false,
      reasonCode: "invalid_inputs",
      existingKind: "UNKNOWN",
      unknownReason: "invalid_inputs",
    };
  }

  const position = input.existingPosition;
  if (position === null) {
    return failUnknown("unreadable", "position_unreadable", input);
  }
  if (!position.hasPosition) {
    return project(0, "NONE", null, input);
  }
  if ((position.side ?? "").toLowerCase() !== "short") {
    // Opposite or unconfirmed side: never net, never assume — fail closed.
    return failUnknown("opposite", "opposite_position", input);
  }
  const size = parseAmount(position.size);
  const mark = parseAmount(position.markPrice);
  if (size === null || mark === null || size <= 0 || mark <= 0) {
    return failUnknown("unvalued", "position_unvalued", input);
  }
  return project(round2(size * mark), "UNDERSTOOD", null, input);
}

function project(
  existingUsd: number,
  kind: "NONE" | "UNDERSTOOD",
  unknownReason: null,
  input: CumulativeProtectionInput,
): CumulativeProtectionResult {
  const projectedUsd = round2(existingUsd + input.proposedAdditionalUsd);
  const capUsd = round2((input.grossExposureUsd * input.maxProtectionPct) / 100);
  const projectedPct = round2((projectedUsd / input.grossExposureUsd) * 100);
  const passes = projectedUsd <= capUsd;
  return {
    existingUsd,
    proposedUsd: input.proposedAdditionalUsd,
    projectedUsd,
    projectedPct,
    maxPct: input.maxProtectionPct,
    passes,
    reasonCode: passes ? "within_projected_mandate" : "projected_protection_exceeds_mandate",
    existingKind: kind,
    unknownReason,
  };
}

function failUnknown(
  reason: Exclude<CumulativeUnknownReason, "invalid_inputs">,
  code: CumulativeReasonCode,
  input: CumulativeProtectionInput,
): CumulativeProtectionResult {
  return {
    existingUsd: null,
    proposedUsd: input.proposedAdditionalUsd,
    projectedUsd: null,
    projectedPct: null,
    maxPct: input.maxProtectionPct,
    passes: false,
    reasonCode: code,
    existingKind: "UNKNOWN",
    unknownReason: reason,
  };
}
