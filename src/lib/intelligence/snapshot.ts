// Tenax Phase 1B — normalized NVIDIA / rNVDA market-context snapshot.
//
// The snapshot is the ONLY market-data shape the rest of Tenax consumes.
// Raw Bitget provider shapes never leave src/lib/bitget/reality.ts.
//
// Availability model:
// - AVAILABLE — core instrument + ticker sections available AND every
//   optional section available.
// - PARTIAL — core instrument + ticker available, but at least one optional
//   section missing. A failed optional endpoint never crashes the snapshot.
// - UNAVAILABLE — core instrument or ticker missing. All sections are null
//   except source refs; consumers must surface "unavailable", never fabricate.

import type {
  ParsedCompanyOverview,
  ParsedEarningsForecast,
  ParsedInstrument,
  ParsedMarketCalendar,
  ParsedMarketStates,
  ParsedStockInfo,
  ParsedTicker,
  ParsedValuation,
  RealityEndpointOutcome,
  RealityPublicBundle,
} from "../bitget/reality";
import {
  type MarketSessionState,
  type MarketStateClassification,
  classifyMarketState,
} from "./market-state";

export type SectionAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

export interface SnapshotSection<T> {
  readonly availability: "AVAILABLE" | "UNAVAILABLE";
  readonly data: T | null;
}

export interface InstrumentSection {
  readonly status: string;
  readonly isReality: boolean;
  readonly baseCoin: string | null;
  readonly quoteCoin: string | null;
  readonly minOrderQty: number | null;
  readonly minOrderAmount: number | null;
  readonly pricePrecision: number | null;
  readonly quantityPrecision: number | null;
}

export interface TickerSection {
  readonly lastPrice: string | null;
  readonly openPrice24h: string | null;
  readonly highPrice24h: string | null;
  readonly lowPrice24h: string | null;
  readonly bidPrice: string | null;
  readonly askPrice: string | null;
  readonly priceChangePct24h: string | null;
  readonly volume24h: string | null;
  readonly turnover24h: string | null;
  readonly updatedAt: string | null;
}

export interface TradingSection {
  /** Maps RNVDAUSDT to its underlying stock code (observed: NVDA). */
  readonly underlyingCode: string;
  readonly tradingPeriods: readonly string[];
  readonly weekendTradable: boolean | null;
}

export interface SessionDefinition {
  readonly name: string | null;
  readonly hours: string | null;
}

export interface SessionsSection {
  readonly market: string | null;
  readonly daylightType: string | null;
  readonly definitions: readonly SessionDefinition[];
  readonly currentState: MarketSessionState;
  readonly currentStateReason: string;
  readonly currentStateAuthoritative: boolean;
}

export interface CalendarSection {
  readonly timeZone: string | null;
  readonly weekendClosure: readonly string[];
  readonly specificEntryCount: number;
}

export interface EarningsForecastSection {
  readonly fiscalYear: string | number | null;
  /** Verbatim provider value (observed null). NEVER an event date. */
  readonly publicationDeadline: unknown;
  readonly isActual: boolean | null;
  readonly eps: string | null;
  readonly revenue: string | null;
  readonly currency: string | null;
  /** Always false: forecast data is context, not timing. */
  readonly isDateContext: false;
}

export interface CompanySection {
  readonly code: string | null;
  readonly name: string | null;
  readonly listingDate: string | null;
  readonly employees: string | null;
  readonly peRatio: string | null;
  readonly pbRatio: string | null;
  readonly high52Week: string | null;
  readonly low52Week: string | null;
}

export interface ValuationSection {
  readonly observedKeys: readonly string[];
  readonly dividendYieldTtm: unknown;
}

export interface SourceRef {
  readonly endpoint: string;
  readonly status: string;
  readonly fetchedAt: string;
}

export interface NvidiaMarketSnapshot {
  readonly underlying: "NVDA";
  readonly representation: "RNVDAUSDT";
  readonly venue: "Bitget Reality";
  readonly fetchedAt: string;
  readonly availability: SectionAvailability;
  readonly instrument: SnapshotSection<InstrumentSection>;
  readonly ticker: SnapshotSection<TickerSection>;
  readonly trading: SnapshotSection<TradingSection>;
  readonly sessions: SnapshotSection<SessionsSection>;
  readonly calendar: SnapshotSection<CalendarSection>;
  readonly earningsForecast: SnapshotSection<EarningsForecastSection>;
  readonly company: SnapshotSection<CompanySection>;
  readonly valuation: SnapshotSection<ValuationSection>;
  readonly sourceRefs: readonly SourceRef[];
}

function section<T, U>(
  outcome: RealityEndpointOutcome<T>,
  build: (data: T) => U | null,
): SnapshotSection<U> {
  if (outcome.status !== "OK" || outcome.data === null) {
    return { availability: "UNAVAILABLE", data: null };
  }
  const data = build(outcome.data);
  return data === null
    ? { availability: "UNAVAILABLE", data: null }
    : { availability: "AVAILABLE", data };
}

function mapInstrument(data: ParsedInstrument): InstrumentSection {
  return {
    status: data.status,
    isReality: data.isReality,
    baseCoin: data.baseCoin,
    quoteCoin: data.quoteCoin,
    minOrderQty: data.minOrderQty,
    minOrderAmount: data.minOrderAmount,
    pricePrecision: data.pricePrecision,
    quantityPrecision: data.quantityPrecision,
  };
}

function mapTicker(data: ParsedTicker): TickerSection {
  return {
    lastPrice: data.lastPrice,
    openPrice24h: data.openPrice24h,
    highPrice24h: data.highPrice24h,
    lowPrice24h: data.lowPrice24h,
    bidPrice: data.bidPrice,
    askPrice: data.askPrice,
    priceChangePct24h: data.priceChangePct24h,
    volume24h: data.volume24h,
    turnover24h: data.turnover24h,
    updatedAt: data.updatedAt,
  };
}

function mapTrading(stockInfo: ParsedStockInfo): TradingSection {
  return {
    underlyingCode: stockInfo.code,
    tradingPeriods: stockInfo.tradingPeriods,
    weekendTradable: stockInfo.weekendTradable,
  };
}

function mapSessions(data: ParsedMarketStates): SessionsSection {
  const classification: MarketStateClassification = classifyMarketState(data.sessions);
  return {
    market: data.market,
    daylightType: data.daylightType,
    definitions: data.sessions.map((s) => ({ name: s.name, hours: s.hours })),
    currentState: classification.state,
    currentStateReason: classification.reason,
    currentStateAuthoritative: classification.authoritative,
  };
}

function mapCalendar(data: ParsedMarketCalendar): CalendarSection {
  return {
    timeZone: data.timeZone,
    weekendClosure: data.weekendClosure,
    specificEntryCount: data.specificEntryCount,
  };
}

function mapForecast(data: ParsedEarningsForecast): EarningsForecastSection {
  return {
    fiscalYear: data.fiscalYear,
    publicationDeadline: data.publicationDeadline,
    isActual: data.isActual,
    eps: data.eps,
    revenue: data.revenue,
    currency: data.currency,
    isDateContext: false,
  };
}

function mapCompany(data: ParsedCompanyOverview): CompanySection {
  return {
    code: data.code,
    name: data.name,
    listingDate: data.listingDate,
    employees: data.employees,
    peRatio: data.peRatio,
    pbRatio: data.pbRatio,
    high52Week: data.high52Week,
    low52Week: data.low52Week,
  };
}

function mapValuation(data: ParsedValuation): ValuationSection {
  return {
    observedKeys: data.observedKeys,
    dividendYieldTtm: data.dividendYieldTtm,
  };
}

/**
 * Normalize a fetched Reality bundle into the Tenax-facing snapshot.
 * Pure function: no I/O, no clock reads beyond the bundle's own timestamps.
 */
export function normalizeNvidiaSnapshot(bundle: RealityPublicBundle): NvidiaMarketSnapshot {
  const instrument = section(bundle.instruments, mapInstrument);
  const ticker = section(bundle.ticker, mapTicker);
  const trading = section(bundle.stockInfo, (data) => mapTrading(data));
  const sessions = section(bundle.marketStates, mapSessions);
  const calendar = section(bundle.marketCalendar, mapCalendar);
  const earningsForecast = section(bundle.earningsForecast, mapForecast);
  const company = section(bundle.companyOverview, mapCompany);
  const valuation = section(bundle.valuationIndicators, mapValuation);

  const coreOk =
    instrument.availability === "AVAILABLE" && ticker.availability === "AVAILABLE";
  const optionalSections = [trading, sessions, calendar, earningsForecast, company, valuation];
  const allOptionalOk = optionalSections.every((s) => s.availability === "AVAILABLE");

  const availability: SectionAvailability = !coreOk
    ? "UNAVAILABLE"
    : allOptionalOk
      ? "AVAILABLE"
      : "PARTIAL";

  const sourceRefs: SourceRef[] = [
    bundle.instruments,
    bundle.ticker,
    bundle.stockInfo,
    bundle.marketStates,
    bundle.marketCalendar,
    bundle.earningsForecast,
    bundle.companyOverview,
    bundle.valuationIndicators,
  ].map((o) => ({ endpoint: o.endpoint, status: o.status, fetchedAt: o.fetchedAt }));

  return {
    underlying: "NVDA",
    representation: "RNVDAUSDT",
    venue: "Bitget Reality",
    fetchedAt: bundle.fetchedAt,
    availability,
    instrument,
    ticker,
    trading,
    sessions,
    calendar,
    earningsForecast,
    company,
    valuation,
    sourceRefs,
  };
}
