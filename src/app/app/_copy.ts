// Tenax Phase 1D — centralized user-facing copy.
//
// Wording follows docs/tenax-brand-messaging.md §8, adapted to the locked
// development fixture (30% / $150). Tests assert the honesty invariants
// below: dry-run language never claims execution; dates never fabricated.

import type { StandingAuthorityMode } from "@/lib/tenax/standing-mandate";
import type { FinalActionState } from "@/lib/tenax/visuals";

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

export const LIVE_EVENT_SOURCE_UNAVAILABLE_LINE =
  "Live event source unavailable — the Bitget calendar feed is unreachable. No AI decision generated from events.";

export const NO_ELIGIBLE_EVENT_LINE =
  "No eligible upcoming NVIDIA event found in the verified calendar. No AI decision generated from events.";

export const SESSION_ONLY_NOTICE =
  "Session activity resets when the server restarts. Verified decision proof is stored separately in durable history.";

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
  /** Short approval cell for authority consoles. */
  readonly approval: string;
  /** One-line narrative of what the mode permits. */
  readonly narrative: string;
}

/** Pure mapping from the active standing mandate mode (null = none). */
export function standingAuthorityCopy(mode: StandingAuthorityMode | null): AuthorityCopy {
  switch (mode) {
    case "AUTO_WITHIN_MANDATE":
      return {
        title: "AUTHORITY",
        lines: ["Standing mandate active", "Per-action approval: NOT REQUIRED WITHIN BOUNDS"],
        approval: "NOT REQUIRED WITHIN BOUNDS",
        narrative: "Actions inside these bounds may execute automatically.",
      };
    case "AUTO_WITH_ESCALATION":
      return {
        title: "AUTHORITY",
        lines: ["Automatic within bounds", "Human review outside bounds"],
        approval: "AUTOMATIC WITHIN BOUNDS",
        narrative: "Actions inside bounds may execute automatically; outside bounds go to human review.",
      };
    case "REVIEW_EVERY_ACTION":
      return {
        title: "AUTHORITY",
        lines: ["Human review required for every action"],
        approval: "REQUIRED",
        narrative: "Every action requires human approval.",
      };
    default:
      return {
        title: "PER-ACTION AUTHORITY",
        lines: ["Human approval required"],
        approval: "REQUIRED",
        narrative: "Human approval required.",
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
  /** Active policy mode; required for truthful wording when a mandate is active. */
  readonly authorityMode?: StandingAuthorityMode | null;
}): CurrentAuthorityCopy {
  if (input.hasActiveMandate) {
    switch (input.authorityMode ?? "AUTO_WITHIN_MANDATE") {
      case "REVIEW_EVERY_ACTION":
        return {
          term: "Per-action approval",
          value: "REQUIRED FOR EVERY ACTION",
          note: "Every action still requires human approval.",
        };
      case "AUTO_WITH_ESCALATION":
        return {
          term: "Per-action approval",
          value: "AUTOMATIC WITHIN BOUNDS",
          note: "Human review outside bounds.",
        };
      default:
        return {
          term: "Per-action approval",
          value: "NOT REQUIRED WITHIN BOUNDS",
          note: null,
        };
    }
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

// ---- Mandate class card -------------------------------------------------------
//
// The standing-mandate class card shows the ACTIVE policy's numeric bounds
// plus the permanently locked execution-class facts. With no ACTIVE
// mandate it shows honest placeholders — never fixture defaults, never an
// exhausted/draft mandate presented as current authority.

export interface ClassCardPolicy {
  readonly maxProtectionPct: number;
  readonly maxNotionalUsdt: number;
}

/** Term/value rows: numeric bounds from the active policy (or gaps). */
export function mandateClassCardValues(
  policy: ClassCardPolicy | null,
): Array<[string, string]> {
  return [
    ["MAX PROTECTION", policy === null ? "—" : `${policy.maxProtectionPct}%`],
    ["MAX ACTION", policy === null ? "—" : `$${policy.maxNotionalUsdt}`],
    ["MAX LEVERAGE", "1X"],
    ["ALLOWED", "NVDAUSDT"],
    ["SELL UNDERLYING", "NEVER"],
    ["TRANSFERS", "NEVER"],
    ["LEVERAGE CHANGES", "NEVER"],
  ];
}

// ---- Mandate builder summary --------------------------------------------------
//
// Live plain-English preview of the draft being built. Pure formatting of
// user-chosen values — the AI never chooses limits; enforcement stays in
// the deterministic evaluator.

export interface MandateSummaryPreviewInput {
  readonly maxProtectionPct: number;
  readonly maxNotionalUsdt: number;
  readonly maxExecutions: number;
  readonly expiresAt: string | null;
  readonly authorityMode: StandingAuthorityMode;
}

/** Human-readable expiry: readable form plus the raw authoritative timestamp. */
export function formatExpiryPreview(expiresAt: string | null): string {
  if (expiresAt === null) return "No expiry.";
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return "Invalid expiry.";
  return `Expires ${new Date(ms).toUTCString()} (${expiresAt}).`;
}

/** Plain-English lines describing exactly what the draft would permit. */
export function mandateSummaryPreview(input: MandateSummaryPreviewInput): readonly string[] {
  const executions = input.maxExecutions === 1 ? "1 execution" : `${input.maxExecutions} executions`;
  const lines = [
    `Tenax may protect up to ${input.maxProtectionPct}% of your NVIDIA exposure, ` +
      `use at most $${input.maxNotionalUsdt} per action, at 1x leverage, for up to ${executions}.`,
    formatExpiryPreview(input.expiresAt),
  ];
  if (input.authorityMode === "REVIEW_EVERY_ACTION") {
    lines.push("Every action still requires human approval.");
  } else {
    lines.push("Actions inside these bounds do not require per-trade approval.");
  }
  return lines;
}

// ---- Projection status copy -----------------------------------------------------
//
// Mode-aware projection line for the decision cockpit. Driven by the real
// derived route (finalState) plus the active mode — never inferred from
// percentages in JSX. Hard safety outcomes keep REFUSE wording in every
// mode; only a genuine boundary escalation under AUTO_WITH_ESCALATION
// promises human review.

/** Pure mapping from projection state + route to one status line. */
export function projectionStatusCopy(input: {
  readonly overLimit: boolean | null;
  readonly authorityMode: StandingAuthorityMode | null;
  readonly finalState: FinalActionState;
}): string {
  if (input.overLimit === true) {
    if (input.finalState === "REFUSED") {
      return "PROJECTED OVER MANDATE — CYCLE WILL REFUSE · NO ORDER SENT";
    }
    if (input.authorityMode === "AUTO_WITH_ESCALATION") {
      return "PROJECTED OVER MANDATE — CYCLE WILL ESCALATE FOR HUMAN REVIEW · NO AUTONOMOUS ORDER SENT";
    }
    if (input.authorityMode === "REVIEW_EVERY_ACTION") {
      return "PROJECTED OVER MANDATE — HUMAN REVIEW REQUIRED BEFORE EXECUTION · NO ORDER SENT";
    }
    return "PROJECTED OVER MANDATE — CYCLE WILL REFUSE · NO ORDER SENT";
  }
  if (input.overLimit === false) {
    return "WITHIN MANDATE ON THIS CHECK — AUTHORITATIVE CHECK RUNS AT CYCLE TIME";
  }
  return "POSITION UNKNOWN — CYCLE FAILS CLOSED · NO ORDER SENT";
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
