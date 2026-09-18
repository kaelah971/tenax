// Tenax Phase 1D — centralized user-facing copy.
//
// Wording follows docs/tenax-brand-messaging.md §8, adapted to the locked
// development fixture (30% / $150). Tests assert the honesty invariants
// below: dry-run language never claims execution; dates never fabricated.

export const INTENT_LINE = "Protect my NVIDIA through earnings";

export const INTENT_PLACEHOLDER = "Protect my NVIDIA through earnings — max 30%, max $150.";

export const MANDATE_SUMMARY =
  "You're allowing up to 30% of this position, up to $150, no leverage, with your approval before anything executes.";

export const DRY_RUN_PRE_NOTICE = "Dry run — no funds will move.";

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
