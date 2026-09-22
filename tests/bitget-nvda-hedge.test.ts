// Tenax Phase 2C — NVDAUSDT hedge discovery tests (offline, no network).
//
// Covers: instrument/ticker normalization, reference-price selection,
// position query signing, the three new GET allowlist entries, explicit
// POST rejection (set-leverage setter + order endpoints), empty position
// validity, settings normalization, PARTIAL on missing management
// permission, $100 sizing with floor-to-precision and minimum enforcement,
// UNKNOWN on absent fields, and secret-scrubbed script guard.
// Live-network verification lives in scripts/verify-bitget-demo-nvda-hedge.ts.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEMO_ACCOUNT_SETTINGS_PATH,
  DEMO_POSITION_CURRENT_PATH,
  DEMO_PRE_SET_LEVERAGE_PATH,
  DEMO_TRADE_UNFILLED_ORDERS_PATH,
  READ_ONLY_ALLOWLIST,
  assertReadOnlyRequest,
  evaluateUtaTradeReadProbe,
  fetchDemoReadOnly,
  isWritePath,
  signUtaRequest,
} from "../src/lib/bitget/demo-auth";
import {
  HEDGE_CATEGORY,
  HEDGE_TARGET_NOTIONAL_USDT,
  NVDAUSDT_SYMBOL,
  computeHedgeSizing,
  evaluateDiscoveryOverall,
  evaluatePositionProbe,
  floorToPrecision,
  normalizeAccountSettings,
  normalizeLeveragePreview,
  normalizeNvdaInstrument,
  normalizeNvdaPosition,
  normalizeNvdaTicker,
  selectReferencePrice,
} from "../src/lib/bitget/nvda-hedge";

const TEST_SECRET = "test-secret-key";
const TIMESTAMP = "1700000000000";
const CREDS = { apiKey: "test-api-key", secretKey: TEST_SECRET, passphrase: "test-pass" };

const FUTURES_INSTRUMENT_ROW = {
  symbol: NVDAUSDT_SYMBOL,
  category: HEDGE_CATEGORY,
  status: "online",
  isReality: "no",
  baseCoin: "NVDA",
  quoteCoin: "USDT",
  minOrderQty: "1",
  maxOrderQty: "100000",
  minOrderAmount: "5",
  pricePrecision: "2",
  quantityPrecision: "0",
  maxLeverage: "20",
  minLeverage: "1",
};

const FUTURES_TICKER_ROW = {
  symbol: NVDAUSDT_SYMBOL,
  lastPrice: "181.20",
  markPrice: "181.15",
  indexPrice: "181.10",
  bid1Price: "181.14",
  ask1Price: "181.16",
  fundingRate: "0.0001",
  ts: "1753102803148",
};

describe("NVDAUSDT instrument normalization", () => {
  it("captures the futures contract facts actually returned", () => {
    const instrument = normalizeNvdaInstrument({
      code: "00000",
      msg: "success",
      data: [FUTURES_INSTRUMENT_ROW],
    });
    expect(instrument).toEqual({
      symbol: "NVDAUSDT",
      category: "USDT-FUTURES",
      status: "online",
      isReality: false,
      baseCoin: "NVDA",
      quoteCoin: "USDT",
      minOrderQty: 1,
      maxOrderQty: 100000,
      minOrderAmount: 5,
      pricePrecision: 2,
      quantityPrecision: 0,
      contractMultiplier: null,
      maxLeverage: 20,
      minLeverage: 1,
    });
  });

  it("leaves missing fields null instead of inventing them", () => {
    const instrument = normalizeNvdaInstrument({
      data: [{ symbol: "NVDAUSDT", status: "online" }],
    });
    expect(instrument?.category).toBeNull();
    expect(instrument?.isReality).toBeNull();
    expect(instrument?.minOrderQty).toBeNull();
    expect(instrument?.pricePrecision).toBeNull();
    expect(instrument?.quantityPrecision).toBeNull();
    expect(instrument?.maxLeverage).toBeNull();
  });

  it("returns null when no NVDAUSDT row is present", () => {
    expect(normalizeNvdaInstrument({ data: [{ symbol: "BTCUSDT" }] })).toBeNull();
    expect(normalizeNvdaInstrument({ data: [] })).toBeNull();
    expect(normalizeNvdaInstrument({ data: null })).toBeNull();
    expect(normalizeNvdaInstrument(null)).toBeNull();
  });
});

describe("NVDAUSDT ticker normalization", () => {
  it("captures futures price fields actually returned", () => {
    const ticker = normalizeNvdaTicker({
      code: "00000",
      msg: "success",
      data: [FUTURES_TICKER_ROW],
    });
    expect(ticker).toEqual({
      symbol: "NVDAUSDT",
      lastPrice: "181.20",
      markPrice: "181.15",
      indexPrice: "181.10",
      bidPrice: "181.14",
      askPrice: "181.16",
      fundingRate: "0.0001",
      updatedAt: "1753102803148",
    });
  });

  it("leaves absent futures fields null", () => {
    const ticker = normalizeNvdaTicker({ data: [{ symbol: "NVDAUSDT", lastPrice: "10" }] });
    expect(ticker?.markPrice).toBeNull();
    expect(ticker?.indexPrice).toBeNull();
    expect(ticker?.fundingRate).toBeNull();
  });

  it("returns null when no NVDAUSDT row is present", () => {
    expect(normalizeNvdaTicker({ data: [{ symbol: "BTCUSDT" }] })).toBeNull();
    expect(normalizeNvdaTicker(null)).toBeNull();
  });
});

describe("reference price selection", () => {
  const base = {
    symbol: "NVDAUSDT",
    lastPrice: "181.20",
    markPrice: "181.15",
    indexPrice: "181.10",
    bidPrice: null,
    askPrice: null,
    fundingRate: null,
    updatedAt: null,
  };

  it("prefers markPrice, then lastPrice, then indexPrice", () => {
    expect(selectReferencePrice(base)).toEqual({ price: 181.15, source: "markPrice" });
    expect(selectReferencePrice({ ...base, markPrice: null })).toEqual({
      price: 181.2,
      source: "lastPrice",
    });
    expect(selectReferencePrice({ ...base, markPrice: null, lastPrice: null })).toEqual({
      price: 181.1,
      source: "indexPrice",
    });
  });

  it("reports null when no usable price exists", () => {
    expect(
      selectReferencePrice({ ...base, markPrice: null, lastPrice: null, indexPrice: null }),
    ).toEqual({ price: null, source: null });
    expect(selectReferencePrice({ ...base, markPrice: "0", lastPrice: "-5" })).toEqual({
      price: 181.1,
      source: "indexPrice",
    });
  });
});

describe("Phase 2C allowlist", () => {
  it("permits exactly the three new GET endpoints alongside existing ones", () => {
    expect([...READ_ONLY_ALLOWLIST]).toEqual([
      "/api/v3/account/info",
      "/api/v3/trade/unfilled-orders",
      "/api/v3/account/assets",
      "/api/v3/position/current-position",
      "/api/v3/account/settings",
      "/api/v3/account/pre-set-leverage",
      "/api/v3/trade/order-info",
    ]);
    for (const path of [
      DEMO_POSITION_CURRENT_PATH,
      DEMO_ACCOUNT_SETTINGS_PATH,
      DEMO_PRE_SET_LEVERAGE_PATH,
    ]) {
      expect(() => assertReadOnlyRequest("GET", path)).not.toThrow();
    }
  });

  it("refuses non-GET methods on all three new paths", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      for (const path of [
        DEMO_POSITION_CURRENT_PATH,
        DEMO_ACCOUNT_SETTINGS_PATH,
        DEMO_PRE_SET_LEVERAGE_PATH,
      ]) {
        expect(() => assertReadOnlyRequest(method, path)).toThrow();
      }
    }
  });

  it("explicitly rejects the POST leverage setter", () => {
    expect(isWritePath("/api/v3/account/set-leverage")).toBe(true);
    expect(() => assertReadOnlyRequest("POST", "/api/v3/account/set-leverage")).toThrow();
    expect(() => assertReadOnlyRequest("GET", "/api/v3/account/set-leverage")).toThrow();
  });

  it("carves out only the exact GET preview path from the write guard", () => {
    expect(isWritePath("/api/v3/account/pre-set-leverage")).toBe(false);
    expect(() => assertReadOnlyRequest("GET", "/api/v3/account/pre-set-leverage")).not.toThrow();
    expect(isWritePath("/api/v3/account/set-leverage")).toBe(true);
  });

  it("explicitly rejects all order POST endpoints", () => {
    for (const path of [
      "/api/v3/order/place-order",
      "/api/v3/order/cancel-order",
      "/api/v3/order/batch-order",
      "/api/v3/trade/place-order",
      "/api/v3/trade/cancel-order",
    ]) {
      expect(() => assertReadOnlyRequest("POST", path)).toThrow();
      expect(() => assertReadOnlyRequest("GET", path)).toThrow();
    }
  });

  it("signs the current-position query exactly", () => {
    expect(
      signUtaRequest({
        timestamp: TIMESTAMP,
        method: "GET",
        requestPath: "/api/v3/position/current-position",
        queryString: "category=USDT-FUTURES&symbol=NVDAUSDT",
        secretKey: TEST_SECRET,
      }),
    ).toBe("d2YSX2i3vOYSkYITFOOD7UEceQEW9rlc8c2fQtY2djs=");
  });

  it("signs the futures unfilled-orders query exactly", () => {
    expect(
      signUtaRequest({
        timestamp: TIMESTAMP,
        method: "GET",
        requestPath: "/api/v3/trade/unfilled-orders",
        queryString: "category=USDT-FUTURES&symbol=NVDAUSDT",
        secretKey: TEST_SECRET,
      }),
    ).toBe("z+Vi1tGxuIM01y343aKLHf1Yw0yYAcbFR7undS9cFWM=");
  });

  it("rejects every write method on every allowlisted path", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      for (const path of READ_ONLY_ALLOWLIST) {
        expect(() => assertReadOnlyRequest(method, path)).toThrow();
      }
    }
  });

  it("issues the position query with paptrading (injected fetch)", async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> =
      [];
    const query = `category=${HEDGE_CATEGORY}&symbol=${NVDAUSDT_SYMBOL}`;
    await fetchDemoReadOnly({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      tradingMode: "demo",
      requestPath: DEMO_POSITION_CURRENT_PATH,
      queryString: query,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { status: 200, text: async () => '{"code":"00000","data":{"list":[]}}' };
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://api.bitget.com/api/v3/position/current-position?${query}`,
    );
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers["paptrading"]).toBe("1");
  });
});

describe("NVDAUSDT position normalization", () => {
  it("treats an empty list as a valid no-position result", () => {
    expect(normalizeNvdaPosition({ code: "00000", data: { list: [] } })).toEqual({
      hasPosition: false,
      side: null,
      size: null,
      leverage: null,
      marginMode: null,
      markPrice: null,
      avgPrice: null,
    });
    expect(normalizeNvdaPosition({ code: "00000", data: [] })?.hasPosition).toBe(false);
  });

  it("exposes side/size/leverage only when actually returned", () => {
    const position = normalizeNvdaPosition({
      data: {
        list: [
          {
            category: "USDT-FUTURES",
            symbol: "NVDAUSDT",
            posSide: "short",
            total: "5",
            leverage: "1",
            marginMode: "crossed",
            markPrice: "181.15",
            avgPrice: "182.00",
          },
        ],
      },
    });
    expect(position).toEqual({
      hasPosition: true,
      side: "short",
      size: "5",
      leverage: "1",
      marginMode: "crossed",
      markPrice: "181.15",
      avgPrice: "182.00",
    });
  });

  it("ignores other symbols and zero-size rows", () => {
    const position = normalizeNvdaPosition({
      data: { list: [{ symbol: "BTCUSDT", total: "1" }, { symbol: "NVDAUSDT", total: "0" }] },
    });
    expect(position?.hasPosition).toBe(false);
  });

  it("returns null for unrecognized shapes", () => {
    expect(normalizeNvdaPosition(null)).toBeNull();
    expect(normalizeNvdaPosition({})).toBeNull();
    expect(normalizeNvdaPosition({ data: null })).toBeNull();
    expect(normalizeNvdaPosition({ code: "00000", data: {} })).toBeNull();
    expect(normalizeNvdaPosition({ code: "00000", data: { list: "nope" } })).toBeNull();
  });

  it("maps the observed after-close null container to a valid no-position result", () => {
    // Live shape after a full close: 200 + 00000 + data.list === null.
    const afterClose = { code: "00000", msg: "success", requestTime: 1759999999999, data: { list: null } };
    expect(normalizeNvdaPosition(afterClose)).toEqual({
      hasPosition: false,
      side: null,
      size: null,
      leverage: null,
      marginMode: null,
      markPrice: null,
      avgPrice: null,
    });
    expect(
      normalizeNvdaPosition({ code: "00000", data: { positions: null } })?.hasPosition,
    ).toBe(false);
  });
});

describe("position probe evaluation (no false negatives)", () => {
  it("passes with NONE on 200 + 00000 + empty list", () => {
    expect(
      evaluatePositionProbe({
        httpStatus: 200,
        body: { code: "00000", msg: "success", data: { list: [] } },
        transportError: null,
      }),
    ).toEqual({
      probe: "PASS",
      failureKind: "NONE",
      position: {
        hasPosition: false,
        side: null,
        size: null,
        leverage: null,
        marginMode: null,
        markPrice: null,
        avgPrice: null,
      },
    });
  });

  it("passes with NONE on 200 + 00000 + bare-array empty shape", () => {
    const result = evaluatePositionProbe({
      httpStatus: 200,
      body: { code: "00000", msg: "success", data: [] },
      transportError: null,
    });
    expect(result.probe).toBe("PASS");
    expect(result.position.hasPosition).toBe(false);
  });

  it("passes with NONE on 200 + 00000 + null data", () => {
    // The observed live empty shape: success without parseable rows is a
    // successful empty state, never UNKNOWN/failure.
    const result = evaluatePositionProbe({
      httpStatus: 200,
      body: { code: "00000", msg: "success", data: null },
      transportError: null,
    });
    expect(result.probe).toBe("PASS");
    expect(result.failureKind).toBe("NONE");
    expect(result.position.hasPosition).toBe(false);
  });

  it("passes with NONE on the observed after-close null-container shape", () => {
    const result = evaluatePositionProbe({
      httpStatus: 200,
      body: { code: "00000", msg: "success", requestTime: 1759999999999, data: { list: null } },
      transportError: null,
    });
    expect(result.probe).toBe("PASS");
    expect(result.failureKind).toBe("NONE");
    expect(result.position.hasPosition).toBe(false);
  });

  it("passes with PRESENT on a populated position", () => {
    const result = evaluatePositionProbe({
      httpStatus: 200,
      body: {
        code: "00000",
        data: { list: [{ symbol: "NVDAUSDT", posSide: "short", total: "5", leverage: "1" }] },
      },
      transportError: null,
    });
    expect(result.probe).toBe("PASS");
    expect(result.position).toMatchObject({ hasPosition: true, side: "short", size: "5" });
  });

  it("fails on non-00000 codes", () => {
    expect(
      evaluatePositionProbe({
        httpStatus: 403,
        body: { code: "40005", msg: "no permission for this endpoint" },
        transportError: null,
      }),
    ).toEqual({
      probe: "FAIL",
      failureKind: "PERMISSION_ERROR",
      position: {
        hasPosition: false,
        side: null,
        size: null,
        leverage: null,
        marginMode: null,
        markPrice: null,
        avgPrice: null,
      },
    });
  });

  it("fails on transport and server failures", () => {
    expect(
      evaluatePositionProbe({ httpStatus: 0, body: null, transportError: "fetch failed" })
        .failureKind,
    ).toBe("NETWORK_ERROR");
    expect(
      evaluatePositionProbe({ httpStatus: 500, body: null, transportError: null }).probe,
    ).toBe("FAIL");
  });
});

describe("account settings normalization", () => {
  it("extracts only safe relevant fields with the NVDAUSDT config", () => {
    const settings = normalizeAccountSettings({
      code: "00000",
      data: {
        userId: "123",
        holdMode: "hedge_mode",
        accountMode: "union",
        symbolConfigList: [
          { category: "USDT-FUTURES", symbol: "BTCUSDT", marginMode: "crossed", leverage: "20" },
          { category: "USDT-FUTURES", symbol: "NVDAUSDT", marginMode: "crossed", leverage: "1" },
        ],
      },
    });
    expect(settings).toEqual({
      accountMode: "union",
      accountLevel: null,
      holdMode: "hedge_mode",
      marginMode: null,
      nvdaLeverage: "1",
      nvdaMarginMode: "crossed",
      nvdaSymbolConfigFound: true,
      symbolConfigListPresent: true,
      symbolConfigCount: 2,
    });
    expect(Object.keys(settings ?? {}).sort()).toEqual([
      "accountLevel",
      "accountMode",
      "holdMode",
      "marginMode",
      "nvdaLeverage",
      "nvdaMarginMode",
      "nvdaSymbolConfigFound",
      "symbolConfigCount",
      "symbolConfigListPresent",
    ]);
  });

  it("reports a missing NVDAUSDT config without guessing", () => {
    const settings = normalizeAccountSettings({ data: { holdMode: "one_way_mode" } });
    expect(settings?.nvdaSymbolConfigFound).toBe(false);
    expect(settings?.nvdaLeverage).toBeNull();
    expect(settings?.nvdaMarginMode).toBeNull();
    expect(settings?.symbolConfigListPresent).toBe(false);
    expect(settings?.symbolConfigCount).toBe(0);
  });

  it("counts symbol configs structurally", () => {
    const settings = normalizeAccountSettings({
      data: { symbolConfigList: [{ symbol: "BTCUSDT" }, { symbol: "ETHUSDT" }] },
    });
    expect(settings?.symbolConfigListPresent).toBe(true);
    expect(settings?.symbolConfigCount).toBe(2);
    expect(settings?.nvdaSymbolConfigFound).toBe(false);
    const empty = normalizeAccountSettings({ data: { symbolConfigList: [] } });
    expect(empty?.symbolConfigListPresent).toBe(true);
    expect(empty?.symbolConfigCount).toBe(0);
  });

  it("returns null for unrecognized shapes", () => {
    expect(normalizeAccountSettings(null)).toBeNull();
    expect(normalizeAccountSettings({ data: null })).toBeNull();
  });
});

describe("leverage preview normalization", () => {
  it("captures estimate fields actually returned", () => {
    expect(
      normalizeLeveragePreview({
        data: { estMaxOpen: "55.1", requiredMargin: "181.15", marginChange: "0" },
      }),
    ).toEqual({ estMaxOpen: "55.1", requiredMargin: "181.15", marginChange: "0" });
  });

  it("returns null for unrecognized shapes", () => {
    expect(normalizeLeveragePreview(null)).toBeNull();
    expect(normalizeLeveragePreview({ data: null })).toBeNull();
  });
});

describe("$100 hedge sizing", () => {
  it("computes and floors quantity to instrument precision", () => {
    const sizing = computeHedgeSizing({
      targetNotional: HEDGE_TARGET_NOTIONAL_USDT,
      referencePrice: 180,
      priceSource: "markPrice",
      quantityPrecision: 2,
      minOrderQty: 0.01,
      minOrderAmount: null,
    });
    expect(sizing.rawQty).toBeCloseTo(100 / 180, 12);
    expect(sizing.normalizedQty).toBe(0.55);
    expect(sizing.resultingNotional).toBeCloseTo(99, 9);
    expect(sizing.meetsMinQty).toBe(true);
    expect(sizing.meetsMinNotional).toBeNull();
    expect(sizing.executableByInstrumentRules).toBe("YES");
  });

  it("rounds DOWN with exact decimal arithmetic", () => {
    expect(floorToPrecision(1.999, 2)).toBe(1.99);
    expect(floorToPrecision(1.009, 2)).toBe(1);
    expect(floorToPrecision(5, 0)).toBe(5);
    expect(floorToPrecision(5.9, 0)).toBe(5);
    expect(Number.isNaN(floorToPrecision(-1, 2))).toBe(true);
    expect(Number.isNaN(floorToPrecision(1, -1))).toBe(true);
  });

  it("enforces minimum quantity", () => {
    const sizing = computeHedgeSizing({
      targetNotional: 100,
      referencePrice: 100000,
      priceSource: "markPrice",
      quantityPrecision: 4,
      minOrderQty: 0.01,
      minOrderAmount: null,
    });
    expect(sizing.normalizedQty).toBe(0.001);
    expect(sizing.meetsMinQty).toBe(false);
    expect(sizing.executableByInstrumentRules).toBe("NO");
  });

  it("enforces minimum notional when the rule exists", () => {
    const sizing = computeHedgeSizing({
      targetNotional: 100,
      referencePrice: 180,
      priceSource: "markPrice",
      quantityPrecision: 2,
      minOrderQty: null,
      minOrderAmount: 100,
    });
    expect(sizing.resultingNotional).toBeCloseTo(99, 9);
    expect(sizing.meetsMinNotional).toBe(false);
    expect(sizing.executableByInstrumentRules).toBe("NO");
  });

  it("reports UNKNOWN when precision is absent", () => {
    const sizing = computeHedgeSizing({
      targetNotional: 100,
      referencePrice: 180,
      priceSource: "lastPrice",
      quantityPrecision: null,
      minOrderQty: 0.01,
      minOrderAmount: null,
    });
    expect(sizing.rawQty).toBeCloseTo(100 / 180, 12);
    expect(sizing.normalizedQty).toBeNull();
    expect(sizing.executableByInstrumentRules).toBe("UNKNOWN");
  });

  it("reports UNKNOWN when the reference price is unusable", () => {
    for (const price of [null, 0, -3, Number.NaN]) {
      const sizing = computeHedgeSizing({
        targetNotional: 100,
        referencePrice: price,
        priceSource: null,
        quantityPrecision: 2,
        minOrderQty: null,
        minOrderAmount: null,
      });
      expect(sizing.rawQty).toBeNull();
      expect(sizing.executableByInstrumentRules).toBe("UNKNOWN");
    }
  });
});

describe("futures trade-read probe semantics", () => {
  it("passes on an empty futures order list with code 00000", () => {
    expect(
      evaluateUtaTradeReadProbe({
        httpStatus: 200,
        body: { code: "00000", msg: "success", data: { list: [] } },
        transportError: null,
      }),
    ).toEqual({ probe: "PASS", failureKind: "NONE" });
  });

  it("passes on a futures-shaped empty position success", () => {
    expect(
      evaluateUtaTradeReadProbe({
        httpStatus: 200,
        body: { code: "00000", msg: "success", data: { list: [] } },
        transportError: null,
      }).probe,
    ).toBe("PASS");
  });

  it("fails honestly on a permission denial", () => {
    expect(
      evaluateUtaTradeReadProbe({
        httpStatus: 403,
        body: { code: "40005", msg: "no permission for this endpoint" },
        transportError: null,
      }),
    ).toEqual({ probe: "FAIL", failureKind: "PERMISSION_ERROR" });
  });

  it("queries the futures unfilled-orders path with paptrading (injected fetch)", async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> =
      [];
    const query = `category=${HEDGE_CATEGORY}&symbol=${NVDAUSDT_SYMBOL}`;
    await fetchDemoReadOnly({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      tradingMode: "demo",
      requestPath: DEMO_TRADE_UNFILLED_ORDERS_PATH,
      queryString: query,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return {
          status: 200,
          text: async () => '{"code":"00000","msg":"success","data":{"list":[]}}',
        };
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://api.bitget.com/api/v3/trade/unfilled-orders?${query}`,
    );
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers["paptrading"]).toBe("1");
  });
});

describe("overall discovery verdict", () => {
  const core = {
    instrument: "PASS",
    ticker: "PASS",
    position: "PASS",
    futuresTradeRead: "PASS",
    sizingEvaluable: true,
  } as const;

  it("passes only when everything is proven", () => {
    expect(evaluateDiscoveryOverall({ ...core, settings: "PASS" })).toBe("PASS");
  });

  it("is PARTIAL when management permission is missing", () => {
    expect(evaluateDiscoveryOverall({ ...core, settings: "PERMISSION_UNAVAILABLE" })).toBe(
      "PARTIAL",
    );
  });

  it("is PARTIAL when settings are inconclusive", () => {
    expect(evaluateDiscoveryOverall({ ...core, settings: "FAIL" })).toBe("PARTIAL");
  });

  it("fails when any required probe fails", () => {
    expect(evaluateDiscoveryOverall({ ...core, settings: "PASS", instrument: "FAIL" })).toBe(
      "FAIL",
    );
    expect(evaluateDiscoveryOverall({ ...core, settings: "PASS", ticker: "FAIL" })).toBe("FAIL");
    expect(evaluateDiscoveryOverall({ ...core, settings: "PASS", position: "FAIL" })).toBe("FAIL");
    expect(evaluateDiscoveryOverall({ ...core, settings: "PASS", futuresTradeRead: "FAIL" })).toBe(
      "FAIL",
    );
  });

  it("fails when sizing is not evaluable", () => {
    expect(
      evaluateDiscoveryOverall({ ...core, settings: "PASS", sizingEvaluable: false }),
    ).toBe("FAIL");
  });

  it("never lets a NOT_RUN preview turn valid discovery into FAIL", () => {
    // The preview is optional by design: core proven + settings inconclusive
    // stays PARTIAL regardless of preview state (preview is not an input).
    expect(evaluateDiscoveryOverall({ ...core, settings: "FAIL" })).toBe("PARTIAL");
  });
});

describe("hedge script stays safe and read-only", () => {
  const scriptSource = readFileSync(
    new URL("../scripts/verify-bitget-demo-nvda-hedge.ts", import.meta.url),
    "utf8",
  );

  it("uses the shared helpers for all five probes", () => {
    for (const marker of [
      "fetchDemoReadOnly",
      "DEMO_POSITION_CURRENT_PATH",
      "DEMO_TRADE_UNFILLED_ORDERS_PATH",
      "DEMO_ACCOUNT_SETTINGS_PATH",
      "DEMO_PRE_SET_LEVERAGE_PATH",
      "evaluateUtaTradeReadProbe",
      "normalizeNvdaInstrument",
      "normalizeNvdaTicker",
      "computeHedgeSizing",
      "overallDiscovery",
      "oneXPreview",
    ]) {
      expect(scriptSource).toContain(marker);
    }
  });

  it("exposes safe position diagnostics and the second futures probe", () => {
    for (const marker of [
      "positionHttpStatus",
      "positionApiCode",
      "positionMessage",
      "positionFailureKind",
      "futuresTradeReadProbe",
      "futuresTradeReadHttpStatus",
      "futuresTradeReadApiCode",
      "futuresTradeReadMessage",
      "futuresTradeReadFailureKind",
    ]) {
      expect(scriptSource).toContain(marker);
    }
  });

  it("exposes structural margin-mode facts without raw data", () => {
    for (const marker of [
      "settingsHasMarginMode",
      "symbolConfigList",
      "symbolConfigCount",
      "nvdaConfig",
    ]) {
      expect(scriptSource).toContain(marker);
    }
    expect(scriptSource).not.toContain("userId");
  });

  it("never prints raw response bodies", () => {
    expect(scriptSource).not.toContain("JSON.stringify");
  });

  it("scrubs output, reports honestly, and drains the loop", () => {
    expect(scriptSource).toContain("redactSecrets");
    expect(scriptSource).toContain("currentPosition");
    expect(scriptSource).toContain('"NONE"');
    expect(scriptSource).toContain("NOT_RUN");
    expect(scriptSource).toContain("process.exitCode");
    expect(scriptSource).not.toContain("process.exit(");
  });

  it("contains no order, setter, or write-method literals", () => {
    // NOTE: the bare "set-leverage" fragment is intentionally absent here:
    // the script legitimately references the GET preview path constant.
    for (const fragment of [
      "place-order",
      "cancel-order",
      "batch-order",
      "withdraw",
      "deposit",
      "transfer",
      "amend-order",
      '"POST"',
      '"PUT"',
      '"DELETE"',
      '"PATCH"',
      "ACCESS-SIGN",
    ]) {
      expect(scriptSource).not.toContain(fragment);
    }
    expect(scriptSource).toContain("never called");
  });
});
