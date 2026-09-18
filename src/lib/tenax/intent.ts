// Tenax Phase 1A — first intent only (deterministic, no LLM).
//
// PROTECT_EVENT_RISK is interpreted without a model: the raw text is stored
// verbatim and bound to the given exposure. Model integration comes later;
// this module must not gain network or credential access.

import type { Exposure, ProtectionIntent } from "./domain";

let intentCounter = 0;

export function createProtectEventRiskIntent(
  exposure: Exposure,
  rawText: string,
  eventId: string | null = null,
  createdAt: string = new Date().toISOString(),
): ProtectionIntent {
  if (exposure.underlying !== "NVDA") {
    throw new Error(
      `Phase 1A supports NVDA exposure only (got ${exposure.underlying})`,
    );
  }
  intentCounter += 1;
  return {
    id: `intent-protect-${String(intentCounter).padStart(4, "0")}`,
    type: "PROTECT_EVENT_RISK",
    exposureId: exposure.id,
    eventId,
    rawText,
    createdAt,
  };
}

/** Reset the in-memory counter (tests only). */
export function __resetIntentCounterForTests(): void {
  intentCounter = 0;
}
