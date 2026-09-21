// Tenax Phase 4A — NVDAUSDT daily candle adapter tests (offline, no network).
//
// Covers: documented envelope normalization, strict row validation,
// malformed shapes failing safe, GET-only boundary, and fetch-level
// failure isolation (transport/HTTP/provider gaps all yield null — the
// page renders UNAVAILABLE instead). Live candles are NEVER fetched here.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertMarketSeriesAllowed,
  CANDLE_INTERVAL_MS,
  fetchNvdaCandles,
  fetchNvdaDailySeries,
  fetchNvdaFuturesTicker,
  normalizeCandleResponse,
  normalizeFuturesTicker,
  normalizeOhlcResponse,
  resolveCandleInterval,
  tickerChangePct,
} from "../src/lib/bitget/market-series";

// Provider-faithful shape (trimmed observed response).
const ENVELOPE_OK: Record<string, unknown> = {
  code: "00000",
  msg: "success",
  data: [
    ["1789833600000", "222.42", "222.56", "220.32", "221.16", "29893.94", "6617286.2079"],
    ["1789920000000", "221.16", "225.14", "220.95", "223.93", "35590.77", "7952663.0709"],
  ],
};

describe("candle normalization", () => {
  it("extracts validated (timestamp, close) pairs in time order", () => {
    const points = normalizeCandleResponse(ENVELOPE_OK);
    expect(points).toEqual([
      { t: 1789833600000, close: 221.16 },
      { t: 1789920000000, close: 223.93 },
    ]);
  });

  it("accepts an empty but valid envelope as an honest gap", () => {
    expect(normalizeCandleResponse({ code: "00000", data: [] })).toEqual([]);
  });

  it("rejects non-00000 envelopes and malformed rows without guessing", () => {
    expect(normalizeCandleResponse({ code: "40001", data: [] })).toBeNull();
    expect(normalizeCandleResponse({ code: "00000", data: [["1789920000000", "x"]] })).toBeNull();
    expect(
      normalizeCandleResponse({ code: "00000", data: [["1789920000000", "1", "2", "3", "-5"]] }),
    ).toBeNull();
    expect(normalizeCandleResponse({ code: "00000", data: [["0", "1", "2", "3", "4"]] })).toBeNull();
    for (const bad of [null, [], "nope", {}, { code: "00000" }, { code: "00000", data: "nope" }]) {
      expect(normalizeCandleResponse(bad)).toBeNull();
    }
  });
});

describe("read-only boundary", () => {
  it("allows exactly the public candles + ticker GETs and nothing else", () => {
    expect(() => assertMarketSeriesAllowed("GET", "/api/v3/market/candles")).not.toThrow();
    expect(() =>
      assertMarketSeriesAllowed("GET", "/api/v3/market/candles?category=USDT-FUTURES"),
    ).not.toThrow();
    expect(() => assertMarketSeriesAllowed("GET", "/api/v3/market/tickers")).not.toThrow();
    expect(() => assertMarketSeriesAllowed("POST", "/api/v3/market/candles")).toThrow(/refused/);
    expect(() => assertMarketSeriesAllowed("GET", "/api/v3/market/tickers?category=SPOT")).not.toThrow();
    expect(() => assertMarketSeriesAllowed("GET", "/api/v3/trade/place-order")).toThrow(/refused/);
    expect(() => assertMarketSeriesAllowed("GET", "/api/v3/position/current-position")).toThrow(
      /refused/,
    );
  });

  it("carries no auth material in the adapter source", () => {
    const source = readFileSync(
      new URL("../src/lib/bitget/market-series.ts", import.meta.url),
      "utf8",
    );
    for (const fragment of ["X-API-KEY", "ApiKeyAuth", "Authorization:", "Bearer ", "ACCESS-SIGN"]) {
      expect(source).not.toContain(fragment);
    }
  });
});

describe("fetch failure isolation", () => {
  it("returns the REAL series on a clean provider response", async () => {
    const series = await fetchNvdaDailySeries({
      getJson: async () => ({
        httpStatus: 200,
        body: ENVELOPE_OK,
      }),
    });
    expect(series?.provenance).toBe("REAL");
    expect(series?.symbol).toBe("NVDAUSDT");
    expect(series?.points).toHaveLength(2);
  });

  it("returns null on transport, HTTP, and provider failures", async () => {
    const throwing = {
      getJson: async (): Promise<never> => {
        throw new Error("network down");
      },
    };
    expect(await fetchNvdaDailySeries(throwing)).toBeNull();
    expect(
      await fetchNvdaDailySeries({ getJson: async () => ({ httpStatus: 500, body: {} }) }),
    ).toBeNull();
    expect(
      await fetchNvdaDailySeries({
        getJson: async () => ({ httpStatus: 200, body: { code: "40001" } }),
      }),
    ).toBeNull();
  });
});

describe("OHLC normalization", () => {
  it("preserves open/high/low/close accurately in time order", () => {
    const candles = normalizeOhlcResponse({
      code: "00000",
      data: [
        ["1789920000000", "221.16", "225.14", "220.95", "223.93", "35590.77", "7952663.0709"],
        ["1789833600000", "222.42", "222.56", "220.32", "221.16", "29893.94", "6617286.2079"],
      ],
    });
    expect(candles).toEqual([
      { t: 1789833600000, o: 222.42, h: 222.56, l: 220.32, c: 221.16, vol: 29893.94 },
      { t: 1789920000000, o: 221.16, h: 225.14, l: 220.95, c: 223.93, vol: 35590.77 },
    ]);
  });

  it("rejects short rows, bad numbers, and inverted ranges", () => {
    expect(
      normalizeOhlcResponse({ code: "00000", data: [["1789920000000", "1", "2", "3"]] }),
    ).toBeNull();
    expect(
      normalizeOhlcResponse({ code: "00000", data: [["1789920000000", "x", "2", "1", "1.5", "1"]] }),
    ).toBeNull();
    expect(
      normalizeOhlcResponse({ code: "00000", data: [["1789920000000", "1", "1", "2", "1.5", "1"]] }),
    ).toBeNull();
    expect(normalizeOhlcResponse({ code: "40001", data: [] })).toBeNull();
    expect(normalizeOhlcResponse(null)).toBeNull();
  });

  it("fetches interval candles with validated rows", async () => {
    const series = await fetchNvdaCandles(
      {
        getJson: async () => ({ httpStatus: 200, body: ENVELOPE_OK }),
      },
      "5m",
      96,
    );
    expect(series?.provenance).toBe("REAL");
    expect(series?.interval).toBe("5m");
    expect(series?.candles).toHaveLength(2);
    expect(series?.candles[0]).toMatchObject({ o: 222.42, h: 222.56, l: 220.32, c: 221.16 });
  });

  it("resolves intervals with a 5m default and known durations", () => {
    expect(resolveCandleInterval("5m")).toBe("5m");
    expect(resolveCandleInterval("1H")).toBe("1H");
    expect(resolveCandleInterval("daily")).toBe("5m");
    expect(resolveCandleInterval(null)).toBe("5m");
    expect(resolveCandleInterval(undefined)).toBe("5m");
    expect(CANDLE_INTERVAL_MS["5m"]).toBe(300_000);
    expect(CANDLE_INTERVAL_MS["1H"]).toBe(3_600_000);
  });
});

const TICKER_OK: Record<string, unknown> = {
  code: "00000",
  data: [
    {
      symbol: "NVDAUSDT",
      lastPrice: "223.62",
      markPrice: "223.62",
      indexPrice: "223.3974992350951888",
      bid1Price: "223.64",
      ask1Price: "223.65",
      fundingRate: "0.000238",
      price24hPcnt: "0.01401",
      highPrice24h: "225.14",
      lowPrice24h: "220.35",
      openInterest: "74364.54",
      ts: "1789996993848",
    },
  ],
};

describe("futures ticker normalization", () => {
  it("picks live snapshot fields with nothing guessed", () => {
    const ticker = normalizeFuturesTicker(TICKER_OK);
    expect(ticker).toMatchObject({
      symbol: "NVDAUSDT",
      lastPrice: "223.62",
      markPrice: "223.62",
      indexPrice: "223.3974992350951888",
      bidPrice: "223.64",
      askPrice: "223.65",
      fundingRate: "0.000238",
      change24h: "0.01401",
      high24h: "225.14",
      low24h: "220.35",
      openInterest: "74364.54",
    });
    expect(tickerChangePct(ticker!)).toBe(1.4);
  });

  it("keeps absent fields null and rejects foreign rows", () => {
    const sparse = normalizeFuturesTicker({ code: "00000", data: [{ symbol: "NVDAUSDT" }] });
    expect(sparse?.lastPrice).toBeNull();
    expect(tickerChangePct(sparse!)).toBeNull();
    expect(normalizeFuturesTicker({ code: "00000", data: [{ symbol: "BTCUSDT" }] })).toBeNull();
    expect(normalizeFuturesTicker({ code: "40001", data: [] })).toBeNull();
    expect(normalizeFuturesTicker(null)).toBeNull();
  });

  it("fetches the ticker snapshot read-only", async () => {
    const fetched = await fetchNvdaFuturesTicker({
      getJson: async () => ({ httpStatus: 200, body: TICKER_OK }),
    });
    expect(fetched?.provenance).toBe("REAL");
    expect(fetched?.ticker.lastPrice).toBe("223.62");
    expect(
      await fetchNvdaFuturesTicker({
        getJson: async (): Promise<never> => {
          throw new Error("down");
        },
      }),
    ).toBeNull();
  });
});
