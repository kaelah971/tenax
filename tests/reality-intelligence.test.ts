// Tenax Phase 1B — Reality adapter + intelligence tests (no network).
//
// All payloads come from tests/fixtures/reality-payloads.ts (Phase 0A/0B
// observed fields only). Live-network checks live in
// scripts/spikes/bitget-reality-verify.mjs, never in this suite.
import { describe, expect, it } from "vitest";

import {
  BITGET_BASE_URL,
  fetchRealityBundle,
} from "../src/lib/bitget/reality";
import {
  buildEarningsEventContext,
  toMarketEvent,
} from "../src/lib/intelligence/event-intelligence";
import {
  classifyMarketState,
  mapSessionNameToState,
} from "../src/lib/intelligence/market-state";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import {
  COMPANY_OVERVIEW_PAYLOAD,
  EARNINGS_FORECAST_PAYLOAD,
  FULL_PAYLOADS,
  INSTRUMENTS_PAYLOAD,
  MALFORMED_PAYLOAD,
  MARKET_CALENDAR_PAYLOAD,
  MARKET_STATES_PAYLOAD,
  MISSING_ROW_PAYLOAD,
  PROVIDER_ERROR_PAYLOAD,
  STOCK_INFO_PAYLOAD,
  TICKER_PAYLOAD,
  VALUATION_PAYLOAD,
  stubClientFor,
} from "./fixtures/reality-payloads";

const noGap = { gapMs: 0 };

describe("reality public adapter (injected fetch)", () => {
  it("hits all 8 public endpoints exactly once, with no credential material", async () => {
    const stub = stubClientFor(FULL_PAYLOADS);
    await fetchRealityBundle(stub, noGap);
    expect(stub.urls).toHaveLength(8);
    expect(new Set(stub.urls).size).toBe(8);
    for (const url of stub.urls) {
      expect(url.startsWith(`${BITGET_BASE_URL}/api/v3/`)).toBe(true);
      expect(url.toLowerCase()).not.toMatch(/apikey|secret|sign|passphrase|token|auth/);
    }
    const byPath = new Map(stub.urls.map((u) => [new URL(u).pathname, new URL(u)]));
    expect(byPath.get("/api/v3/market/instruments")?.searchParams.get("symbol")).toBe("RNVDAUSDT");
    expect(byPath.get("/api/v3/market/tickers")?.searchParams.get("category")).toBe("SPOT");
    expect(byPath.get("/api/v3/reality/market/stock-info")?.searchParams.get("symbol")).toBe(
      "RNVDAUSDT",
    );
    expect(byPath.get("/api/v3/reality/market/earnings-forecast")?.searchParams.get("code")).toBe(
      "NVDA",
    );
  });

  it("normalizes the RNVDAUSDT instrument with verified constraints", async () => {
    const bundle = await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), noGap);
    expect(bundle.instruments.status).toBe("OK");
    expect(bundle.instruments.data).toMatchObject({
      symbol: "RNVDAUSDT",
      category: "SPOT",
      status: "online",
      isReality: true,
      baseCoin: "rNVDA",
      quoteCoin: "USDT",
      minOrderQty: 0.0001,
      minOrderAmount: 10,
      pricePrecision: 2,
      quantityPrecision: 4,
    });
  });

  it("normalizes the live-shape ticker payload", async () => {
    const bundle = await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), noGap);
    expect(bundle.ticker.status).toBe("OK");
    expect(bundle.ticker.data).toMatchObject({
      symbol: "RNVDAUSDT",
      lastPrice: "221.57",
      highPrice24h: "222.73",
      lowPrice24h: "219.15",
      bidPrice: "221.53",
      askPrice: "221.54",
      updatedAt: "1789763496561",
    });
  });

  it("maps stock-info RNVDAUSDT to NVDA with session metadata", async () => {
    const bundle = await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), noGap);
    expect(bundle.stockInfo.status).toBe("OK");
    expect(bundle.stockInfo.data).toMatchObject({
      symbol: "RNVDAUSDT",
      code: "NVDA",
      weekendTradable: true,
      name: null,
    });
    expect(bundle.stockInfo.data?.tradingPeriods).toEqual([
      "overnight",
      "pre_market",
      "regular",
      "after_hours",
    ]);
  });

  it("normalizes session and calendar context", async () => {
    const bundle = await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), noGap);
    expect(bundle.marketStates.status).toBe("OK");
    expect(bundle.marketStates.data?.market).toBe("US");
    expect(bundle.marketStates.data?.daylightType).toBe("standard");
    expect(bundle.marketStates.data?.sessions).toHaveLength(2);
    expect(bundle.marketCalendar.status).toBe("OK");
    expect(bundle.marketCalendar.data).toMatchObject({
      timeZone: "EST",
      weekendClosure: ["SATURDAY", "SUNDAY"],
      specificEntryCount: 3,
    });
  });

  it("normalizes company and valuation enrichment surfaces", async () => {
    const bundle = await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), noGap);
    expect(bundle.companyOverview.data).toMatchObject({
      code: "NVDA",
      name: "Nvidia",
      listingDate: "1999-01-22",
      employees: "42000",
      peRatio: "27.5",
      high52Week: "241.01",
      low52Week: "162.94",
    });
    expect(bundle.valuationIndicators.status).toBe("OK");
    expect(bundle.valuationIndicators.data?.observedKeys).toEqual(
      expect.arrayContaining(["pe", "pb", "peTtmEd", "dividendYieldTtm"]),
    );
    expect(bundle.valuationIndicators.data?.dividendYieldTtm).toBe("0.0004");
  });

  it("classifies a non-00000 Bitget code as PROVIDER_ERROR", async () => {
    const bundle = await fetchRealityBundle(
      stubClientFor({ ...FULL_PAYLOADS, "/api/v3/market/tickers": PROVIDER_ERROR_PAYLOAD }),
      noGap,
    );
    expect(bundle.ticker.status).toBe("PROVIDER_ERROR");
    expect(bundle.ticker.data).toBeNull();
    expect(bundle.ticker.bitgetCode).toBe("40001");
  });

  it("classifies a non-envelope body as SCHEMA_ERROR", async () => {
    const bundle = await fetchRealityBundle(
      stubClientFor({ ...FULL_PAYLOADS, "/api/v3/market/tickers": MALFORMED_PAYLOAD }),
      noGap,
    );
    expect(bundle.ticker.status).toBe("SCHEMA_ERROR");
    expect(bundle.ticker.data).toBeNull();
  });

  it("classifies a missing RNVDAUSDT row as NOT_FOUND", async () => {
    const bundle = await fetchRealityBundle(
      stubClientFor({ ...FULL_PAYLOADS, "/api/v3/market/instruments": MISSING_ROW_PAYLOAD }),
      noGap,
    );
    expect(bundle.instruments.status).toBe("NOT_FOUND");
    expect(bundle.instruments.data).toBeNull();
  });
});

describe("normalized snapshot", () => {
  it("is AVAILABLE with all sections when every endpoint succeeds", async () => {
    const snapshot = normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), noGap),
    );
    expect(snapshot.underlying).toBe("NVDA");
    expect(snapshot.representation).toBe("RNVDAUSDT");
    expect(snapshot.venue).toBe("Bitget Reality");
    expect(snapshot.availability).toBe("AVAILABLE");
    for (const section of [
      snapshot.instrument,
      snapshot.ticker,
      snapshot.trading,
      snapshot.sessions,
      snapshot.calendar,
      snapshot.earningsForecast,
      snapshot.company,
      snapshot.valuation,
    ]) {
      expect(section.availability).toBe("AVAILABLE");
      expect(section.data).not.toBeNull();
    }
    expect(snapshot.trading.data?.underlyingCode).toBe("NVDA");
    expect(snapshot.sourceRefs).toHaveLength(8);
  });

  it("degrades to PARTIAL when an optional endpoint fails, keeping core data", async () => {
    const failing = {
      async getJson(url: string) {
        if (new URL(url).pathname === "/api/v3/reality/market/company-overview") {
          throw new Error("fetch failed");
        }
        const path = new URL(url).pathname;
        return { httpStatus: 200, body: FULL_PAYLOADS[path] };
      },
    };
    const snapshot = normalizeNvidiaSnapshot(await fetchRealityBundle(failing, noGap));
    expect(snapshot.availability).toBe("PARTIAL");
    expect(snapshot.instrument.availability).toBe("AVAILABLE");
    expect(snapshot.ticker.availability).toBe("AVAILABLE");
    expect(snapshot.company.availability).toBe("UNAVAILABLE");
    expect(snapshot.company.data).toBeNull();
  });

  it("is UNAVAILABLE without core data on total provider failure, without throwing", async () => {
    const down = {
      async getJson() {
        throw new Error("fetch failed");
      },
    };
    const snapshot = normalizeNvidiaSnapshot(await fetchRealityBundle(down, noGap));
    expect(snapshot.availability).toBe("UNAVAILABLE");
    expect(snapshot.instrument.data).toBeNull();
    expect(snapshot.ticker.data).toBeNull();
    expect(snapshot.sourceRefs).toHaveLength(8);
    expect(snapshot.sourceRefs.every((s) => s.status === "TRANSPORT_ERROR")).toBe(true);
  });
});

describe("event intelligence", () => {
  it("keeps forecast as context-only with the observed null deadline", async () => {
    const snapshot = normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), noGap),
    );
    expect(snapshot.earningsForecast.data).toMatchObject({
      fiscalYear: 2029,
      publicationDeadline: null,
      isActual: false,
      eps: "25.2300",
      revenue: "1025950.0000",
      currency: "USD",
      isDateContext: false,
    });
  });

  it("never turns a null publicationDeadline into an earnings date", async () => {
    const snapshot = normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), noGap),
    );
    const context = buildEarningsEventContext(snapshot);
    expect(context.eventType).toBe("EARNINGS");
    expect(context.occursAt).toBeNull();
    expect(context.occursAtStatus).toBe("UNAVAILABLE");
    expect(context.forecast?.isDateContext).toBe(false);
    expect(context.warnings.join(" ")).toMatch(/must not be read as timing|not the confirmed earnings date/);
    const event = toMarketEvent(context);
    expect(event).toMatchObject({
      type: "EARNINGS",
      underlying: "NVDA",
      occursAt: null,
      source: "bitget-reality-public",
    });
  });
});

describe("market-state classification", () => {
  it("falls back to UNKNOWN with no active marker, without reading any clock", () => {
    const sessions = [
      { name: "pre_market", hours: "EST 04:00–09:30", markedActive: false },
      { name: "regular", hours: "EST 09:30–16:00", markedActive: false },
    ];
    const first = classifyMarketState(sessions);
    const second = classifyMarketState(sessions);
    expect(first).toEqual(second);
    expect(first.state).toBe("UNKNOWN");
    expect(first.authoritative).toBe(false);
    expect(first.reason).toMatch(/no authoritative current-state field/);
  });

  it("maps an explicitly marked session to its state", () => {
    const result = classifyMarketState([
      { name: "pre_market", hours: "EST 04:00–09:30", markedActive: false },
      { name: "regular", hours: "EST 09:30–16:00", markedActive: true },
    ]);
    expect(result.state).toBe("REGULAR");
    expect(result.authoritative).toBe(true);
    expect(mapSessionNameToState("after_hours")).toBe("AFTER_HOURS");
    expect(mapSessionNameToState("overnight")).toBe("OVERNIGHT");
    expect(mapSessionNameToState("pre_market")).toBe("PRE_MARKET");
    expect(mapSessionNameToState("something-else")).toBe("UNKNOWN");
  });
});

describe("fixture provenance", () => {
  it("fixtures carry only observed keys (spot-check against spike extracts)", () => {
    expect(Object.keys(INSTRUMENTS_PAYLOAD.data[0])).toEqual(
      expect.arrayContaining(["symbol", "category", "status", "isReality", "baseCoin"]),
    );
    expect(Object.keys(TICKER_PAYLOAD.data[0])).toEqual(
      expect.arrayContaining(["lastPrice", "bid1Price", "ask1Price", "ts"]),
    );
    expect(Object.keys(STOCK_INFO_PAYLOAD.data[0])).toEqual(
      expect.arrayContaining(["symbol", "code", "tradingPeriod", "weekendTradable"]),
    );
    expect(Object.keys(EARNINGS_FORECAST_PAYLOAD.data[0])).toEqual(
      expect.arrayContaining(["fiscalYear", "publicationDeadline", "isActual", "eps", "revenue"]),
    );
    expect(Object.keys(COMPANY_OVERVIEW_PAYLOAD.data[0])).toEqual(
      expect.arrayContaining(["code", "name", "listingDate", "employees"]),
    );
    expect(MARKET_STATES_PAYLOAD.data.stateList).toHaveLength(2);
    expect(MARKET_CALENDAR_PAYLOAD.data.specificConfig).toHaveLength(3);
    expect(VALUATION_PAYLOAD.data[0].dividendYieldTtm).toBe("0.0004");
  });
});
