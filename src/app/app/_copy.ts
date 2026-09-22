// Tenax Phase 1D — centralized user-facing copy.
//
// Wording follows docs/tenax-brand-messaging.md §8, adapted to the locked
// development fixture (30% / $150). Tests assert the honesty invariants
// below: dry-run language never claims execution; dates never fabricated.

import type { StandingAuthorityMode } from "@/lib/tenax/standing-mandate";

export const INTENT_LINE = "Protect my NVIDIA through earnings";

export const INTENT_PLACEHOLDER = "Protect my NVIDIA through earnings — max 30%, max $150.";

export const MANDATE_SUMMARY =
  "You're allowing up to 30% of this position, up to $150, max 1x leverage, with your approval before anything executes.";

export const DRY_RUN_PRE_NOTICE = "Dry run — no funds will move.";

export const DEMO_FUNDS_NOTICE = "Demo order — virtual funds only.";

export const EXECUTION_PREVIEW_CREATED = "Execution preview created — no funds moved.";

export const NOT_ADVICE = "Not investment advice. Tenax executes only within your mandate.";

export const DATE_UNAVAILABLE_LINE = "Date unavailable — no verified NVIDIA earnings date.";

export const EVENT_UNAVAILABLE_LINE =
  "Event data unavailable. Tenax will not propose actions on stale data.";

export const SESSION_ONLY_NOTICE =
  "Current session only — activity resets when the server restarts. No database yet.";

// Tenax Decision Rail stages (DESIGN.md beta-signal): six technical stages.
export const CHAIN_STEPS = [
  "EXPOSURE",
  "INTENT",
  "INTELLIGENCE",
  "MANDATE",
  "ACTION",
  "RECEIPT",
] as const;

export function approveCta(tradeValueUsdt: number): string {
  return `Approve $${tradeValueUsdt} protection`;
}

export function refusalSentence(failedRules: readonly string[], limitUsdt = 150): string {
  if (failedRules.includes("max_trade_value")) {
    return `Refused — the hedge exceeded your $${limitUsdt} limit. No action was taken.`;
  }
  if (failedRules.includes("max_protection_pct")) {
    return "Refused — the hedge exceeded your maximum hedge percentage. No action was taken.";
  }
  if (failedRules.includes("underlying_allowed")) {
    return "Refused — the exposure is not covered by your mandate. No action was taken.";
  }
  return "Refused — the proposal breached your mandate. No action was taken.";
}

// ---- Standing authority display ---------------------------------------------
//
// The cockpit must reflect the actual authority configuration — never the
// stale static "human approval required" card while a standing mandate is
// ACTIVE. Display only; authority logic lives in standing-mandate.ts.

export interface AuthorityCopy {
  readonly title: string;
  readonly lines: readonly string[];
}

/** Pure mapping from the active standing mandate mode (null = none). */
export function standingAuthorityCopy(mode: StandingAuthorityMode | null): AuthorityCopy {
  switch (mode) {
    case "AUTO_WITHIN_MANDATE":
      return {
        title: "AUTHORITY",
        lines: ["Standing mandate active", "Per-action approval: NOT REQUIRED WITHIN BOUNDS"],
      };
    case "AUTO_WITH_ESCALATION":
      return {
        title: "AUTHORITY",
        lines: ["Automatic within bounds", "Human review outside bounds"],
      };
    case "REVIEW_EVERY_ACTION":
      return {
        title: "AUTHORITY",
        lines: ["Human review required for every action"],
      };
    default:
      return {
        title: "PER-ACTION AUTHORITY",
        lines: ["Human approval required"],
      };
  }
}

// ---- Current-authority display (mandate page) ---------------------------------
//
// The top authority card must reflect the actual configuration — never the
// stale static "human approval required" while a standing mandate is or
// was the relevant authority. Display only; lifecycle lives in
// standing-mandate.ts.

export interface CurrentAuthorityCopy {
  readonly term: string;
  readonly value: string;
  readonly note: string | null;
}

/** Pure mapping from mandate-store state to the authority card row. */
export function currentAuthorityCopy(input: {
  readonly hasActiveMandate: boolean;
  readonly hasExhaustedMandate: boolean;
}): CurrentAuthorityCopy {
  if (input.hasActiveMandate) {
    return {
      term: "Per-action approval",
      value: "NOT REQUIRED WITHIN BOUNDS",
      note: null,
    };
  }
  if (input.hasExhaustedMandate) {
    return {
      term: "Standing authority",
      value: "EXHAUSTED",
      note: "New autonomous actions require a new mandate.",
    };
  }
  return { term: "Human approval", value: "REQUIRED", note: null };
}

// ---- Cumulative-gate refusal ------------------------------------------------
//
// Deterministic gate sentences for the post-cycle cumulative refusal. The
// refusal belongs to Tenax's cumulative protection gate — never attributed
// to the AI recommendation.

/** Pure mapping from the cumulative reason code to a user-facing sentence. */
export function cumulativeRefusalSentence(reasonCode: string): string {
  switch (reasonCode) {
    case "projected_protection_exceeds_mandate":
      return "Projected protection exceeds your mandate. No order sent.";
    case "position_unreadable":
      return "Live position could not be read — Tenax fails closed. No order sent.";
    case "position_unvalued":
      return "Live position could not be valued — Tenax fails closed. No order sent.";
    case "opposite_position":
      return "Unexpected position direction — Tenax fails closed. No order sent.";
    case "invalid_inputs":
      return "Projection inputs invalid — Tenax fails closed. No order sent.";
    default:
      return "Tenax refused this action. No order sent.";
  }
}
