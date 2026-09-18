// Tenax Phase 1B — deterministic Event Intelligence builder.
//
// Consumes a normalized NVIDIA market snapshot and returns an
// EARNINGS event context compatible with the Phase 1A MarketEvent type.
//
// Hard rule: occursAt is ALWAYS null until a verified earnings-date source
// is integrated. Bitget earnings-forecast data (fiscalYear, eps, revenue,
// publicationDeadline) is forecast/fundamentals CONTEXT — publicationDeadline
// was observed null and must never become an event date.

import type { MarketEvent } from "../tenax/domain";
import type { MarketSessionState } from "./market-state";
import type { NvidiaMarketSnapshot, SectionAvailability } from "./snapshot";

export interface ForecastContext {
  readonly available: boolean;
  readonly fiscalYear: string | number | null;
  readonly publicationDeadline: unknown;
  readonly isActual: boolean | null;
  readonly eps: string | null;
  readonly revenue: string | null;
  readonly currency: string | null;
  /** Always false: forecast data is context, never timing. */
  readonly isDateContext: false;
}

export interface EarningsEventContext {
  readonly eventType: "EARNINGS";
  readonly underlying: "NVDA";
  /** Always null until a verified date source is integrated. */
  readonly occursAt: null;
  readonly occursAtStatus: "UNAVAILABLE";
  readonly forecast: ForecastContext | null;
  readonly sessionState: MarketSessionState;
  readonly sessionStateAuthoritative: boolean;
  readonly calendarAvailable: boolean;
  readonly availability: SectionAvailability;
  readonly evidenceRefs: readonly string[];
  readonly warnings: readonly string[];
}

const EARNINGS_DATE_UNAVAILABLE_WARNING =
  "No verified NVIDIA earnings date is available; occursAt is null. " +
  "Earnings-forecast data is fundamentals context only and must not be read as timing.";

const FORECAST_CONTEXT_WARNING =
  "publicationDeadline is a forecast field, not the confirmed earnings date.";

/**
 * Build the EARNINGS event context from a normalized snapshot.
 * Pure function: no I/O, no clock reads. Missing data degrades explicitly —
 * sections become null/unavailable, the builder never throws on gaps.
 */
export function buildEarningsEventContext(
  snapshot: NvidiaMarketSnapshot,
): EarningsEventContext {
  const warnings: string[] = [EARNINGS_DATE_UNAVAILABLE_WARNING];

  const forecast: ForecastContext | null =
    snapshot.earningsForecast.availability === "AVAILABLE" &&
    snapshot.earningsForecast.data !== null
      ? {
          available: true,
          fiscalYear: snapshot.earningsForecast.data.fiscalYear,
          publicationDeadline: snapshot.earningsForecast.data.publicationDeadline,
          isActual: snapshot.earningsForecast.data.isActual,
          eps: snapshot.earningsForecast.data.eps,
          revenue: snapshot.earningsForecast.data.revenue,
          currency: snapshot.earningsForecast.data.currency,
          isDateContext: false,
        }
      : null;
  if (forecast) warnings.push(FORECAST_CONTEXT_WARNING);

  const sessionState: MarketSessionState =
    snapshot.sessions.availability === "AVAILABLE" && snapshot.sessions.data !== null
      ? snapshot.sessions.data.currentState
      : "UNKNOWN";
  const sessionStateAuthoritative =
    snapshot.sessions.availability === "AVAILABLE" &&
    snapshot.sessions.data !== null &&
    snapshot.sessions.data.currentStateAuthoritative;

  const evidenceRefs = snapshot.sourceRefs.map((s) => `${s.endpoint} [${s.status}]`);

  return {
    eventType: "EARNINGS",
    underlying: "NVDA",
    occursAt: null,
    occursAtStatus: "UNAVAILABLE",
    forecast,
    sessionState,
    sessionStateAuthoritative,
    calendarAvailable: snapshot.calendar.availability === "AVAILABLE",
    availability: snapshot.availability,
    evidenceRefs,
    warnings,
  };
}

/** Project the event context onto the Phase 1A MarketEvent shape. */
export function toMarketEvent(context: EarningsEventContext): MarketEvent {
  return {
    id: "event-nvda-earnings",
    type: context.eventType,
    underlying: context.underlying,
    occursAt: context.occursAt,
    source: "bitget-reality-public",
  };
}
