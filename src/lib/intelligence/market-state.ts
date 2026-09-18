// Tenax Phase 1B — deterministic current market-state classification.
//
// The classifier reads Bitget session data ONLY. It never consults the local
// machine clock: if the payload does not directly expose which session is
// currently active, the result is UNKNOWN — never an invented state.

export type MarketSessionState =
  | "PRE_MARKET"
  | "REGULAR"
  | "AFTER_HOURS"
  | "OVERNIGHT"
  | "CLOSED"
  | "UNKNOWN";

export interface MarketStateClassification {
  readonly state: MarketSessionState;
  readonly reason: string;
  /** True only when Bitget itself marked a session as active. */
  readonly authoritative: boolean;
}

export function mapSessionNameToState(name: string | null): MarketSessionState {
  if (!name) return "UNKNOWN";
  const n = name.trim().toLowerCase();
  if (n.includes("pre_market") || n.includes("premarket") || n === "pre") return "PRE_MARKET";
  if (n === "regular" || n.includes("regular")) return "REGULAR";
  if (n.includes("after_hours") || n.includes("afterhours") || n === "after") return "AFTER_HOURS";
  if (n.includes("overnight") || n === "overnight") return "OVERNIGHT";
  if (n.includes("clos")) return "CLOSED";
  return "UNKNOWN";
}

/**
 * Classify the current session from normalized Bitget session definitions.
 * Only a session Bitget explicitly marked active (see the adapter's
 * markedActive flag) may determine the state; anything else — including
 * recognizable session names with no active marker — yields UNKNOWN.
 */
export interface ClassifiableSession {
  readonly name: string | null;
  readonly markedActive: boolean;
  readonly hours?: string | null;
}

export function classifyMarketState(
  sessions: readonly ClassifiableSession[],
): MarketStateClassification {
  for (const session of sessions) {
    if (session.markedActive) {
      const state = mapSessionNameToState(session.name);
      return {
        state,
        reason: `Bitget marked session "${session.name ?? "unnamed"}" as active`,
        authoritative: true,
      };
    }
  }
  return {
    state: "UNKNOWN",
    reason:
      "no authoritative current-state field observed in Bitget market-states payload; local clock not used",
    authoritative: false,
  };
}
