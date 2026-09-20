// Tenax Phase 2D-A — Demo write-client tests (offline, no network).
//
// Covers: DEMO-only construction, exact single-endpoint write allowlist,
// exact market short-body shape (sell/short, no marginMode, no leverage),
// clientOid validity, sign-what-you-send, order-info fetch + normalization,
// FILLED-only-on-filled, and no secret-logging surface.
// Live Demo submission is NEVER exercised here.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { signUtaRequest } from "../src/lib/bitget/demo-auth";
import {
  DEMO_ORDER_INFO_PATH,
  DEMO_PLACE_ORDER_PATH,
  DEMO_WRITE_ALLOWLIST,
  assertWriteAllowed,
  buildDemoShortOrderBody,
  createDemoClientOid,
  extractPlacedOrderIds,
  fetchDemoOrderInfo,
  isFilledOrderStatus,
  isValidClientOid,
  normalizeDemoOrderInfo,
  placeDemoShortOrder,
} from "../src/lib/bitget/demo-trade";

const CREDS = { apiKey: "test-api-key", secretKey: "test-secret-key", passphrase: "test-pass" };
const TIMESTAMP = "1700000000000";

describe("Demo write allowlist", () => {
  it("contains exactly POST place-order", () => {
    expect(DEMO_PLACE_ORDER_PATH).toBe("/api/v3/trade/place-order");
    expect([...DEMO_WRITE_ALLOWLIST]).toEqual([
      { method: "POST", path: "/api/v3/trade/place-order" },
    ]);
  });

  it("permits only POST place-order", () => {
    expect(() => assertWriteAllowed("POST", DEMO_PLACE_ORDER_PATH)).not.toThrow();
  });

  it("refuses everything else, including lookalikes", () => {
    const refusals: Array<[string, string]> = [
      ["GET", DEMO_PLACE_ORDER_PATH],
      ["PUT", DEMO_PLACE_ORDER_PATH],
      ["DELETE", DEMO_PLACE_ORDER_PATH],
      ["PATCH", DEMO_PLACE_ORDER_PATH],
      ["POST", "/api/v3/trade/order-info"],
      ["POST", "/api/v3/trade/cancel-order"],
      ["POST", "/api/v3/trade/batch-order"],
      ["POST", "/api/v3/account/set-leverage"],
      ["POST", "/api/v3/account/transfer"],
      ["POST", "/api/v3/order/place-order"],
      ["POST", "/api/v3/reality/order/place"],
    ];
    for (const [method, path] of refusals) {
      expect(() => assertWriteAllowed(method, path)).toThrow();
    }
  });
});

describe("short order body", () => {
  it("builds the exact hedge body with no marginMode and no leverage", () => {
    const body = buildDemoShortOrderBody({ qty: "0.45", clientOid: "tenax-1-abc123" });
    expect(body).toEqual({
      category: "USDT-FUTURES",
      symbol: "NVDAUSDT",
      side: "sell",
      posSide: "short",
      orderType: "market",
      qty: "0.45",
      clientOid: "tenax-1-abc123",
    });
    expect(Object.keys(body).sort()).toEqual(
      ["category", "clientOid", "orderType", "posSide", "qty", "side", "symbol"].sort(),
    );
  });

  it("rejects bad quantities", () => {
    for (const qty of ["", "abc", "0", "0.00", "-1", "1,000", "  ", "NaN"]) {
      expect(() => buildDemoShortOrderBody({ qty, clientOid: "tenax-1-abc" })).toThrow();
    }
  });

  it("rejects bad clientOids", () => {
    for (const clientOid of ["", "has space", "x".repeat(65), "semi;colon", "quo\"te"]) {
      expect(() => buildDemoShortOrderBody({ qty: "0.45", clientOid })).toThrow();
    }
  });
});

describe("clientOid", () => {
  it("validates the conservative charset", () => {
    expect(isValidClientOid("tenax-1758300000000-a1b2c3")).toBe(true);
    expect(isValidClientOid("ABC_xyz-012")).toBe(true);
    expect(isValidClientOid("")).toBe(false);
    expect(isValidClientOid("has space")).toBe(false);
    expect(isValidClientOid("x".repeat(65))).toBe(false);
  });

  it("generates unique valid IDs", () => {
    const first = createDemoClientOid(1758300000000, "a1b2c3");
    const second = createDemoClientOid(1758300000000, "d4e5f6");
    expect(first).toBe("tenax-1758300000000-a1b2c3");
    expect(isValidClientOid(first)).toBe(true);
    expect(second).not.toBe(first);
    expect(isValidClientOid(createDemoClientOid())).toBe(true);
  });
});

describe("place-order transport (injected fetch)", () => {
  it("POSTs the exact signed body with paptrading: 1 and no extra keys", async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> =
      [];
    const body = buildDemoShortOrderBody({ qty: "0.45", clientOid: "tenax-1-abc123" });
    const result = await placeDemoShortOrder({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com/",
      body,
      timestamp: TIMESTAMP,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return {
          status: 200,
          text: async () => '{"code":"00000","msg":"success","data":{"orderId":"111","clientOid":"tenax-1-abc123"}}',
        };
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.bitget.com/api/v3/trade/place-order");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers["paptrading"]).toBe("1");
    expect(calls[0]?.init.headers["Content-Type"]).toBe("application/json");
    // Sign-what-you-send: the transmitted string parses to the exact body
    // and carries the signature computed over that same string.
    const transmitted = JSON.parse(calls[0]?.init.body ?? "") as Record<string, unknown>;
    expect(transmitted).toEqual({ ...body });
    expect(Object.keys(transmitted)).toHaveLength(7);
    expect("marginMode" in transmitted).toBe(false);
    expect("leverage" in transmitted).toBe(false);
    expect(calls[0]?.init.headers["ACCESS-SIGN"]).toBe(
      signUtaRequest({
        timestamp: TIMESTAMP,
        method: "POST",
        requestPath: "/api/v3/trade/place-order",
        body: calls[0]?.init.body,
        secretKey: "test-secret-key",
      }),
    );
    expect(result.httpStatus).toBe(200);
    expect(result.transportError).toBeNull();
  });

  it("surfaces transport failures without throwing", async () => {
    const result = await placeDemoShortOrder({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      body: buildDemoShortOrderBody({ qty: "0.45", clientOid: "tenax-1-abc123" }),
      fetchImpl: async () => {
        throw new Error("socket hang up");
      },
    });
    expect(result.httpStatus).toBe(0);
    expect(result.transportError).toContain("socket hang up");
  });
});

describe("placed order IDs", () => {
  it("extracts orderId/clientOid without throwing", () => {
    expect(
      extractPlacedOrderIds({ data: { orderId: "111", clientOid: "tenax-1-abc" } }),
    ).toEqual({ orderId: "111", clientOid: "tenax-1-abc" });
    expect(extractPlacedOrderIds({ code: "40001" })).toEqual({
      orderId: null,
      clientOid: null,
    });
    expect(extractPlacedOrderIds(null)).toEqual({ orderId: null, clientOid: null });
  });
});

describe("order-info fetch (injected fetch)", () => {
  it("queries by orderId and clientOid over the allowlisted GET path", async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> =
      [];
    const result = await fetchDemoOrderInfo({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      orderId: "111",
      clientOid: "tenax-1-abc",
      timestamp: TIMESTAMP,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { status: 200, text: async () => '{"code":"00000","data":{}}' };
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.url).toBe(
      `https://api.bitget.com${DEMO_ORDER_INFO_PATH}?orderId=111&clientOid=tenax-1-abc`,
    );
    expect(calls[0]?.init.headers["paptrading"]).toBe("1");
    expect(result.httpStatus).toBe(200);
  });

  it("refuses to query blindly without any identifier", async () => {
    await expect(
      fetchDemoOrderInfo({
        credentials: CREDS,
        baseUrl: "https://api.bitget.com",
        fetchImpl: async () => {
          throw new Error("must never be called");
        },
      }),
    ).rejects.toThrow();
  });
});

describe("order-info normalization", () => {
  const ROW = {
    orderId: "111",
    clientOid: "tenax-1-abc",
    orderStatus: "filled",
    symbol: "NVDAUSDT",
    side: "sell",
    posSide: "short",
    qty: "0.45",
    avgPrice: "221.30",
    cumExecQty: "0.45",
    cumExecValue: "99.585",
    marginMode: "crossed",
    holdMode: "hedge_mode",
    createdTime: "1758300000000",
    updatedTime: "1758300001000",
  };

  it("extracts exactly the safe verification fields", () => {
    expect(normalizeDemoOrderInfo({ code: "00000", data: ROW })).toEqual({ ...ROW });
  });

  it("accepts list-wrapped records", () => {
    expect(normalizeDemoOrderInfo({ data: { list: [ROW] } })?.orderStatus).toBe("filled");
  });

  it("returns null for unrecognized shapes", () => {
    expect(normalizeDemoOrderInfo(null)).toBeNull();
    expect(normalizeDemoOrderInfo({ data: null })).toBeNull();
    expect(normalizeDemoOrderInfo({ data: { list: [] } })).toBeNull();
  });
});

describe("fill determination", () => {
  it("is FILLED only on an explicit filled status", () => {
    expect(isFilledOrderStatus("filled")).toBe(true);
    expect(isFilledOrderStatus("FILLED")).toBe(true);
    expect(isFilledOrderStatus("live")).toBe(false);
    expect(isFilledOrderStatus("partially_filled")).toBe(false);
    expect(isFilledOrderStatus("cancelled")).toBe(false);
    expect(isFilledOrderStatus(null)).toBe(false);
    expect(isFilledOrderStatus("")).toBe(false);
  });
});

describe("write module never logs secrets", () => {
  const helperSource = readFileSync(new URL("../src/lib/bitget/demo-trade.ts", import.meta.url), "utf8");

  it("has no logging surface at all", () => {
    expect(helperSource).not.toContain("console.");
    expect(helperSource).not.toContain("process.stdout");
  });

  it("serializes the body only for signing and transmission", () => {
    const occurrences = helperSource.split("JSON.stringify").length - 1;
    expect(occurrences).toBe(1);
  });
});
