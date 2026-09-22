// Tenax Phase 4A.2 — live Demo market surface tests (offline, no network).
//
// Covers: NVDAUSDT-short position selection and display parsing, honest
// empty states, ticker/change helpers via the surface, execution-candle
// mapping (inside-only anchoring), sanitizer whitelisting with no secret
// material, route read-only shape, and failure isolation. Live Bitget and
// real credentials are NEVER exercised here — every boundary is injected.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  fetchDemoPositionView,
  normalizeDemoPositionView,
} from "../src/lib/bitget/demo-position";
import { locateExecutionCandle } from "../src/lib/tenax/visuals";
import {
  getDemoSurfaceView,
  toSurfaceResponse,
} from "../src/lib/tenax/demo-surface";

const CREDS = { apiKey: "k", secretKey: "s", passphrase: "p" };

const POSITION_OK: Record<string, unknown> = {
  code: "00000",
  data: [
    {
      symbol: "NVDAUSDT",
      posSide: "short",
      total: "0.44",
      avgPrice: "223.53",
      markPrice: "223.62",
      leverage: "1",
      marginMode: "crossed",
      unrealisedPnl: "-1.23",
      roe: "-0.55",
      liqPx: "890.12",
      uTime: "1789997000000",
    },
  ],
};

const TICKER_OK: Record<string, unknown> = {
  code: "00000",
  data: [
    {
      symbol: "NVDAUSDT",
      lastPrice: "223.62",
      markPrice: "223.62",
      indexPrice: "223.40",
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

describe("Demo position parsing", () => {
  it("selects the NVDAUSDT short with safe display facts", () => {
    const view = normalizeDemoPositionView(POSITION_OK);
    expect(view).toMatchObject({
      state: "POSITION",
      symbol: "NVDAUSDT",
      side: "short",
      size: "0.44",
      avgEntryPrice: "223.53",
      markPrice: "223.62",
      leverage: "1",
      marginMode: "crossed",
      upnl: "-1.23",
      upnlRoi: "-0.55",
      liqPrice: "890.12",
    });
  });

  it("reads alternate provider aliases and keeps absences null", () => {
    const view = normalizeDemoPositionView({
      code: "00000",
      data: [
        {
          symbol: "NVDAUSDT",
          holdSide: "Short",
          size: "0.44",
          openPriceAvg: "223.53",
          markPrice: "223.62",
          leverage: "1",
          marginMode: "crossed",
          unrealizedPnl: "2.5",
          updatedTime: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(view?.state).toBe("POSITION");
    expect(view?.side).toBe("Short");
    expect(view?.upnl).toBe("2.5");
    expect(view?.upnlRoi).toBeNull();
    expect(view?.liqPrice).toBeNull();
    expect(view?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reports NO_POSITION honestly for empty, zero-size, or non-short rows", () => {
    expect(normalizeDemoPositionView({ code: "00000", data: [] })?.state).toBe("NO_POSITION");
    expect(
      normalizeDemoPositionView({
        code: "00000",
        data: [{ symbol: "NVDAUSDT", posSide: "short", total: "0" }],
      })?.state,
    ).toBe("NO_POSITION");
    expect(
      normalizeDemoPositionView({
        code: "00000",
        data: [{ symbol: "NVDAUSDT", posSide: "long", total: "1.5" }],
      })?.state,
    ).toBe("NO_POSITION");
    expect(
      normalizeDemoPositionView({
        code: "00000",
        data: [{ symbol: "BTCUSDT", posSide: "short", total: "1" }],
      })?.state,
    ).toBe("NO_POSITION");
  });

  it("maps the observed after-close null container to NO_POSITION", () => {
    // Live shape after a full close: 200 + 00000 + data.list === null.
    const afterClose = {
      code: "00000",
      msg: "success",
      requestTime: 1759999999999,
      data: { list: null },
    };
    expect(normalizeDemoPositionView(afterClose)?.state).toBe("NO_POSITION");
    expect(
      normalizeDemoPositionView({ code: "00000", data: { positions: null } })?.state,
    ).toBe("NO_POSITION");
  });

  it("returns null on malformed shapes (UNAVAILABLE upstream)", () => {
    for (const bad of [null, {}, { code: "00000" }, { code: "00000", data: "nope" }]) {
      expect(normalizeDemoPositionView(bad)).toBeNull();
    }
    // No recognized container key stays unrecognized — never guessed empty.
    expect(normalizeDemoPositionView({ code: "00000", data: {} })).toBeNull();
    expect(normalizeDemoPositionView({ code: "00000", data: { list: "nope" } })).toBeNull();
    expect(normalizeDemoPositionView({ code: "00000", data: null })).toBeNull();
  });

  it("isolates transport, HTTP, and provider failures as UNAVAILABLE", async () => {
    const throwingFetch = async (): Promise<never> => {
      throw new Error("down");
    };
    const base = { credentials: CREDS, baseUrl: "https://api.bitget.com" } as const;
    expect((await fetchDemoPositionView({ ...base, fetchImpl: throwingFetch })).state).toBe(
      "UNAVAILABLE",
    );
    expect(
      (
        await fetchDemoPositionView({
          ...base,
          fetchImpl: async () => ({ status: 500, text: async () => "{}" }),
        })
      ).state,
    ).toBe("UNAVAILABLE");
    expect(
      (
        await fetchDemoPositionView({
          ...base,
          fetchImpl: async () => ({ status: 200, text: async () => '{"code":"40001"}' }),
        })
      ).state,
    ).toBe("UNAVAILABLE");    const ok = await fetchDemoPositionView({
      ...base,
      fetchImpl: async () => ({ status: 200, text: async () => JSON.stringify(POSITION_OK) }),
    });
    expect(ok.state).toBe("POSITION");
    expect(ok.size).toBe("0.44");
  });

  it("resolves the after-close empty container to NO_POSITION end to end", async () => {
    const base = { credentials: CREDS, baseUrl: "https://api.bitget.com" } as const;
    const afterClose = JSON.stringify({
      code: "00000",
      msg: "success",
      requestTime: 1759999999999,
      data: { list: null },
    });
    const view = await fetchDemoPositionView({
      ...base,
      fetchImpl: async () => ({ status: 200, text: async () => afterClose }),
    });
    expect(view.state).toBe("NO_POSITION");
    expect(view.size).toBeNull();
  });
});

describe("surface composition and sanitizer", () => {
  function stubTicker(body: unknown, httpStatus = 200) {
    return { getJson: async () => ({ httpStatus, body }) };
  }

  function stubPosition(body: unknown, status = 200) {
    return async () => ({ status, text: async () => JSON.stringify(body) });
  }

  it("composes ticker and position with injected boundaries only", async () => {
    const view = await getDemoSurfaceView({
      credentials: CREDS,
      tickerClient: stubTicker(TICKER_OK),
      positionFetchImpl: stubPosition(POSITION_OK),
    });
    expect(view.ticker?.lastPrice).toBe("223.62");
    expect(view.position.state).toBe("POSITION");
    expect(view.position.size).toBe("0.44");
    expect(view.fetchedAt).not.toBe("");
  });

  it("keeps the ticker when credentials are absent (position UNAVAILABLE)", async () => {
    const saved = {
      key: process.env.BITGET_API_KEY,
      secret: process.env.BITGET_SECRET_KEY,
      pass: process.env.BITGET_PASSPHRASE,
    };
    delete process.env.BITGET_API_KEY;
    delete process.env.BITGET_SECRET_KEY;
    delete process.env.BITGET_PASSPHRASE;
    try {
      const view = await getDemoSurfaceView({ tickerClient: stubTicker(TICKER_OK) });
      expect(view.ticker?.lastPrice).toBe("223.62");
      expect(view.position.state).toBe("UNAVAILABLE");
    } finally {
      if (saved.key !== undefined) process.env.BITGET_API_KEY = saved.key;
      if (saved.secret !== undefined) process.env.BITGET_SECRET_KEY = saved.secret;
      if (saved.pass !== undefined) process.env.BITGET_PASSPHRASE = saved.pass;
    }
  });

  it("serializes an exact whitelist with no secret material", async () => {
    const view = await getDemoSurfaceView({
      credentials: { apiKey: "SECRET-A", secretKey: "SECRET-B", passphrase: "SECRET-C" },
      tickerClient: stubTicker(TICKER_OK),
      positionFetchImpl: stubPosition(POSITION_OK),
    });
    const res = toSurfaceResponse(view);
    expect(Object.keys(res).sort()).toEqual(["fetchedAt", "position", "ticker"]);
    expect(Object.keys(res.position).sort()).toEqual(
      [
        "avgEntryPrice",
        "leverage",
        "liqPrice",
        "marginMode",
        "markPrice",
        "side",
        "size",
        "state",
        "symbol",
        "upnl",
        "upnlRoi",
        "updatedAt",
      ].sort(),
    );
    expect(Object.keys(res.ticker ?? {}).sort()).toEqual(
      [
        "askPrice",
        "bidPrice",
        "change24h",
        "fundingRate",
        "high24h",
        "indexPrice",
        "lastPrice",
        "low24h",
        "markPrice",
        "openInterest",
        "symbol",
        "updatedAt",
      ].sort(),
    );
    const serialized = JSON.stringify(res);
    for (const fragment of ["SECRET-A", "SECRET-B", "SECRET-C", "ACCESS-SIGN", "ACCESS-KEY", "passphrase", "paptrading"]) {
      expect(serialized).not.toContain(fragment);
    }
    expect(serialized).not.toMatch(/LIVE MONEY|live money|real money/i);
  });
});

describe("execution-candle mapping", () => {
  const candles = [{ t: 1000 }, { t: 2000 }, { t: 3000 }];

  it("anchors only when the timestamp falls inside a visible interval", () => {
    expect(locateExecutionCandle(candles, new Date(2500).toISOString(), 1000)).toBe(1);
    expect(locateExecutionCandle(candles, new Date(1000).toISOString(), 1000)).toBe(0);
    expect(locateExecutionCandle(candles, new Date(3999).toISOString(), 1000)).toBe(2);
  });

  it("returns null outside the window or on bad input", () => {
    expect(locateExecutionCandle(candles, new Date(999).toISOString(), 1000)).toBeNull();
    expect(locateExecutionCandle(candles, new Date(4000).toISOString(), 1000)).toBeNull();
    expect(locateExecutionCandle(candles, "not-a-time", 1000)).toBeNull();
    expect(locateExecutionCandle(candles, null, 1000)).toBeNull();
    expect(locateExecutionCandle([], new Date(2000).toISOString(), 1000)).toBeNull();
  });
});

describe("route read-only shape", () => {
  const source = readFileSync(
    new URL("../src/app/api/market/demo-surface/route.ts", import.meta.url),
    "utf8",
  );

  it("exposes GET only and never touches write or auth material", () => {
    expect(source).toContain("export async function GET");
    for (const fragment of [
      "export async function POST",
      "export async function PUT",
      "export async function DELETE",
      "export async function PATCH",
      "place-order",
      "ACCESS-SIGN",
      "X-API-KEY",
    ]) {
      expect(source).not.toContain(fragment);
    }
  });
});
