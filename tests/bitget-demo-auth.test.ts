// Tenax Phase 2A — Bitget Demo auth helper tests (offline, no network).
//
// Covers: UTA signing vectors, `paptrading: 1` inclusion, secret redaction,
// GET-only/read-only enforcement for both allowlisted endpoints, no
// write-endpoint usage, failure classification for all 8 kinds, safe
// account-info extraction with UNAVAILABLE metadata, and UTA trade-read
// probe interpretation (empty order list still passes).
// Live-network verification lives in scripts/verify-bitget-demo-auth.ts.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEMO_AUTH_ACCOUNT_INFO_PATH,
  DEMO_PAPTRADING_HEADER,
  DEMO_TRADE_UNFILLED_ORDERS_PATH,
  READ_ONLY_ALLOWLIST,
  assertReadOnlyRequest,
  buildDemoAuthHeaders,
  buildUtaPrehash,
  classifyDemoAuthFailure,
  evaluateUtaTradeReadProbe,
  extractEnvelopeSafe,
  extractSafeAccountInfo,
  fetchDemoAccountInfo,
  fetchDemoReadOnly,
  isWritePath,
  redactSecrets,
  signUtaRequest,
} from "../src/lib/bitget/demo-auth";

const TEST_SECRET = "test-secret-key";
const TIMESTAMP = "1700000000000";

const CREDS = { apiKey: "test-api-key", secretKey: TEST_SECRET, passphrase: "test-pass" };

describe("UTA signing (HMAC-SHA256, Base64)", () => {
  it("matches the known-answer vector for GET /api/v3/account/info", () => {
    expect(
      signUtaRequest({
        timestamp: TIMESTAMP,
        method: "GET",
        requestPath: "/api/v3/account/info",
        secretKey: TEST_SECRET,
      }),
    ).toBe("7K3K300jUR0jdTH8S5qqCgGp9JAXFvzQ+4ayY/07x2I=");
  });

  it("uppercases the method before signing", () => {
    const lower = signUtaRequest({
      timestamp: TIMESTAMP,
      method: "get",
      requestPath: "/api/v3/account/info",
      secretKey: TEST_SECRET,
    });
    expect(lower).toBe("7K3K300jUR0jdTH8S5qqCgGp9JAXFvzQ+4ayY/07x2I=");
    expect(buildUtaPrehash({ timestamp: TIMESTAMP, method: "get", requestPath: "/api/x" })).toBe(
      `${TIMESTAMP}GET/api/x`,
    );
  });

  it("appends a non-empty query string to the prehash", () => {
    expect(
      buildUtaPrehash({
        timestamp: TIMESTAMP,
        method: "GET",
        requestPath: "/api/v3/account/info",
        queryString: "symbol=RNVDAUSDT",
      }),
    ).toBe(`${TIMESTAMP}GET/api/v3/account/info?symbol=RNVDAUSDT`);
    expect(
      signUtaRequest({
        timestamp: TIMESTAMP,
        method: "GET",
        requestPath: "/api/v3/account/info",
        queryString: "symbol=RNVDAUSDT",
        secretKey: TEST_SECRET,
      }),
    ).toBe("vJdnI0Uj0tHrgXCvCCcmri6GzmZrsT4b2JcOUCpivzk=");
  });

  it("treats empty query the same as absent query", () => {
    const withEmpty = buildUtaPrehash({
      timestamp: TIMESTAMP,
      method: "GET",
      requestPath: "/api/v3/account/info",
      queryString: "  ",
    });
    expect(withEmpty).toBe(`${TIMESTAMP}GET/api/v3/account/info`);
  });

  it("appends a non-empty body to the prehash", () => {
    expect(
      signUtaRequest({
        timestamp: TIMESTAMP,
        method: "POST",
        requestPath: "/api/v3/order/place-order",
        body: '{"size":"1"}',
        secretKey: TEST_SECRET,
      }),
    ).toBe("dsohKU2T6WUCONIqjGVisWx6Ijo7W7kHR9XY7ZU/6MU=");
  });

  it("matches the known-answer vector for the category=SPOT probe query", () => {
    expect(
      signUtaRequest({
        timestamp: TIMESTAMP,
        method: "GET",
        requestPath: "/api/v3/trade/unfilled-orders",
        queryString: "category=SPOT",
        secretKey: TEST_SECRET,
      }),
    ).toBe("o75OZxP4sVSggqFhqanUeFE6Ydj1N/YjZPkVLUgpDDQ=");
  });

  it("never echoes the secret as the signature", () => {
    const sig = signUtaRequest({
      timestamp: TIMESTAMP,
      method: "GET",
      requestPath: "/api/v3/account/info",
      secretKey: TEST_SECRET,
    });
    expect(sig).not.toContain(TEST_SECRET);
  });
});

describe("demo headers (`paptrading: 1`)", () => {
  it("includes paptrading: 1 for demo mode with all UTA headers", () => {
    const headers = buildDemoAuthHeaders({
      apiKey: CREDS.apiKey,
      passphrase: CREDS.passphrase,
      timestamp: TIMESTAMP,
      signature: "sig",
      tradingMode: "demo",
    });
    expect(headers[DEMO_PAPTRADING_HEADER]).toBe("1");
    expect(headers["ACCESS-KEY"]).toBe(CREDS.apiKey);
    expect(headers["ACCESS-SIGN"]).toBe("sig");
    expect(headers["ACCESS-TIMESTAMP"]).toBe(TIMESTAMP);
    expect(headers["ACCESS-PASSPHRASE"]).toBe(CREDS.passphrase);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("omits paptrading for live mode", () => {
    const headers = buildDemoAuthHeaders({
      apiKey: CREDS.apiKey,
      passphrase: CREDS.passphrase,
      timestamp: TIMESTAMP,
      signature: "sig",
      tradingMode: "live",
    });
    expect(DEMO_PAPTRADING_HEADER in headers).toBe(false);
  });
});

describe("secret redaction", () => {
  it("replaces every occurrence of each secret", () => {
    const out = redactSecrets("key=k1 secret=s3 pass=p9 k1 again", ["k1", "s3", "p9"]);
    expect(out).toBe("key=[REDACTED] secret=[REDACTED] pass=[REDACTED] [REDACTED] again");
  });

  it("skips empty secrets and leaves safe text intact", () => {
    expect(redactSecrets("code 00000 ok", ["", "zzz"])).toBe("code 00000 ok");
  });
});

describe("read-only boundary", () => {
  it("allows exactly the two Phase 2A GET endpoints", () => {
    expect(() => assertReadOnlyRequest("GET", DEMO_AUTH_ACCOUNT_INFO_PATH)).not.toThrow();
    expect(() => assertReadOnlyRequest("get", DEMO_AUTH_ACCOUNT_INFO_PATH)).not.toThrow();
    expect(() => assertReadOnlyRequest("GET", DEMO_TRADE_UNFILLED_ORDERS_PATH)).not.toThrow();
    expect(() => assertReadOnlyRequest("get", DEMO_TRADE_UNFILLED_ORDERS_PATH)).not.toThrow();
  });

  it("refuses non-GET methods on both allowed paths", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect(() => assertReadOnlyRequest(method, DEMO_AUTH_ACCOUNT_INFO_PATH)).toThrow();
      expect(() => assertReadOnlyRequest(method, DEMO_TRADE_UNFILLED_ORDERS_PATH)).toThrow();
    }
  });

  it("refuses every state-changing path even via GET", () => {
    const writePaths = [
      "/api/v3/order/place-order",
      "/api/v3/order/cancel-order",
      "/api/v3/order/batch-order",
      "/api/v3/account/set-leverage",
      "/api/v3/account/transfer",
      "/api/v3/account/withdraw",
      "/api/v3/account/deposit",
      "/api/v3/order/create-order",
      "/api/v3/order/amend-order",
    ];
    for (const path of writePaths) {
      expect(isWritePath(path)).toBe(true);
      expect(() => assertReadOnlyRequest("GET", path)).toThrow();
    }
  });

  it("refuses unknown paths", () => {
    expect(() => assertReadOnlyRequest("GET", "/api/v3/account/balance")).toThrow();
  });

  it("allowlist contains exactly the authenticated Demo read endpoints", () => {
    expect([...READ_ONLY_ALLOWLIST]).toEqual([
      "/api/v3/account/info",
      "/api/v3/trade/unfilled-orders",
      "/api/v3/account/assets",
      "/api/v3/position/current-position",
      "/api/v3/account/settings",
      "/api/v3/account/pre-set-leverage",
      "/api/v3/trade/order-info",
    ]);
  });
});

describe("fetchDemoAccountInfo (injected fetch, no network)", () => {
  it("issues exactly one GET to /api/v3/account/info with demo headers", async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> =
      [];
    const result = await fetchDemoAccountInfo({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com/",
      tradingMode: "demo",
      timestamp: TIMESTAMP,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { status: 200, text: async () => '{"code":"00000","msg":"success","data":{}}' };
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.bitget.com/api/v3/account/info");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers["paptrading"]).toBe("1");
    expect(calls[0]?.init.headers["ACCESS-TIMESTAMP"]).toBe(TIMESTAMP);
    expect(calls[0]?.init.headers["Content-Type"]).toBe("application/json");
    expect(result.httpStatus).toBe(200);
    expect(result.transportError).toBeNull();
  });

  it("surfaces transport failures without throwing", async () => {
    const result = await fetchDemoAccountInfo({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      tradingMode: "demo",
      fetchImpl: async () => {
        throw new Error("socket hang up");
      },
    });
    expect(result.httpStatus).toBe(0);
    expect(result.body).toBeNull();
    expect(result.transportError).toContain("socket hang up");
  });
});

describe("fetchDemoReadOnly (injected fetch, no network)", () => {
  it("signs and appends the category=SPOT query for the probe endpoint", async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> =
      [];
    const result = await fetchDemoReadOnly({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      tradingMode: "demo",
      requestPath: DEMO_TRADE_UNFILLED_ORDERS_PATH,
      queryString: "category=SPOT",
      timestamp: TIMESTAMP,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { status: 200, text: async () => '{"code":"00000","msg":"success","data":[]}' };
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://api.bitget.com/api/v3/trade/unfilled-orders?category=SPOT",
    );
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers["paptrading"]).toBe("1");
    // The transmitted signature covers the exact query string.
    expect(calls[0]?.init.headers["ACCESS-SIGN"]).toBe(
      signUtaRequest({
        timestamp: TIMESTAMP,
        method: "GET",
        requestPath: DEMO_TRADE_UNFILLED_ORDERS_PATH,
        queryString: "category=SPOT",
        secretKey: TEST_SECRET,
      }),
    );
    expect(result.httpStatus).toBe(200);
    expect(result.transportError).toBeNull();
  });

  it("refuses paths outside the allowlist before touching credentials", async () => {
    await expect(
      fetchDemoReadOnly({
        credentials: CREDS,
        baseUrl: "https://api.bitget.com",
        tradingMode: "demo",
        requestPath: "/api/v3/order/place-order",
        queryString: "category=SPOT",
        fetchImpl: async () => {
          throw new Error("must never be called");
        },
      }),
    ).rejects.toThrow();
  });
});

describe("UTA trade-read probe interpretation", () => {
  it("passes on HTTP 200 + code 00000 with an empty order list", () => {
    expect(
      evaluateUtaTradeReadProbe({
        httpStatus: 200,
        body: { code: "00000", msg: "success", data: [] },
        transportError: null,
      }),
    ).toEqual({ probe: "PASS", failureKind: "NONE" });
  });

  it("passes on HTTP 200 + code 00000 with open orders present", () => {
    expect(
      evaluateUtaTradeReadProbe({
        httpStatus: 200,
        body: { code: "00000", msg: "success", data: [{ orderId: "1" }] },
        transportError: null,
      }),
    ).toEqual({ probe: "PASS", failureKind: "NONE" });
  });

  it("fails with PERMISSION_ERROR on an explicit permission denial", () => {
    expect(
      evaluateUtaTradeReadProbe({
        httpStatus: 403,
        body: { code: "40005", msg: "no permission for this endpoint", data: null },
        transportError: null,
      }),
    ).toEqual({ probe: "FAIL", failureKind: "PERMISSION_ERROR" });
  });

  it("fails with NETWORK_ERROR on transport failure", () => {
    expect(
      evaluateUtaTradeReadProbe({
        httpStatus: 0,
        body: null,
        transportError: "fetch failed",
      }),
    ).toEqual({ probe: "FAIL", failureKind: "NETWORK_ERROR" });
  });

  it("classifies other rejections normally", () => {
    expect(
      evaluateUtaTradeReadProbe({
        httpStatus: 401,
        body: { code: "40004", msg: "invalid passphrase" },
        transportError: null,
      }),
    ).toEqual({ probe: "FAIL", failureKind: "BAD_CREDENTIALS" });
  });
});

describe("failure classification (all 8 kinds)", () => {
  it.each([
    [{ httpStatus: 0, transportError: "fetch failed" }, "NETWORK_ERROR"],
    [{ httpStatus: 500 }, "SERVER_ERROR"],
    [{ httpStatus: 503, bitgetCode: "500", message: "system busy" }, "SERVER_ERROR"],
    [{ httpStatus: 401, bitgetCode: "40001", message: "invalid sign" }, "BAD_SIGNATURE"],
    [
      { httpStatus: 400, bitgetCode: "40002", message: "request timestamp expired" },
      "TIMESTAMP_ERROR",
    ],
    [
      { httpStatus: 400, bitgetCode: "40003", message: "paptrading header missing for demo key" },
      "DEMO_HEADER_MISMATCH",
    ],
    [
      { httpStatus: 401, bitgetCode: "40004", message: "invalid passphrase" },
      "BAD_CREDENTIALS",
    ],
    [{ httpStatus: 401 }, "BAD_CREDENTIALS"],
    [
      { httpStatus: 403, bitgetCode: "40005", message: "no permission for this endpoint" },
      "PERMISSION_ERROR",
    ],
    [{ httpStatus: 403 }, "PERMISSION_ERROR"],
    [{ httpStatus: 400, bitgetCode: "49999", message: "something odd" }, "UNKNOWN"],
  ])("classifies %o as %s", (input, expected) => {
    expect(classifyDemoAuthFailure(input)).toBe(expected);
  });
});

describe("safe account-info extraction", () => {
  it("extracts only permType/permissions/hasUtaTrade/permissionMetadata", () => {
    const safe = extractSafeAccountInfo({
      code: "00000",
      msg: "success",
      data: {
        permType: "uta",
        permissions: ["uta_trade", "uta_loan"],
        userId: "123",
        ip: "1.2.3.4",
      },
    });
    expect(safe).toEqual({
      permType: "uta",
      permissions: ["uta_trade", "uta_loan"],
      hasUtaTrade: true,
      permissionMetadata: "AVAILABLE",
    });
    expect(Object.keys(safe ?? {}).sort()).toEqual([
      "hasUtaTrade",
      "permType",
      "permissionMetadata",
      "permissions",
    ]);
  });

  it("reports hasUtaTrade false only for an explicit array excluding uta_trade", () => {
    const safe = extractSafeAccountInfo({
      data: { permType: "spot", permissions: ["spot_trade"] },
    });
    expect(safe?.permissionMetadata).toBe("AVAILABLE");
    expect(safe?.hasUtaTrade).toBe(false);
    const empty = extractSafeAccountInfo({ data: { permissions: [] } });
    expect(empty?.permissionMetadata).toBe("AVAILABLE");
    expect(empty?.hasUtaTrade).toBe(false);
  });

  it("reports UNAVAILABLE with unknown hasUtaTrade when permissions are omitted", () => {
    // The observed Demo shape: success without permission fields.
    const omitted = extractSafeAccountInfo({
      code: "00000",
      msg: "success",
      data: { uid: "123" },
    });
    expect(omitted).toEqual({
      permType: null,
      permissions: null,
      hasUtaTrade: null,
      permissionMetadata: "UNAVAILABLE",
    });
    const emptyData = extractSafeAccountInfo({ code: "00000", msg: "success", data: {} });
    expect(emptyData?.permissionMetadata).toBe("UNAVAILABLE");
    expect(emptyData?.hasUtaTrade).toBeNull();
  });

  it("returns null for unrecognized shapes without throwing", () => {
    expect(extractSafeAccountInfo(null)).toBeNull();
    expect(extractSafeAccountInfo({})).toBeNull();
    expect(extractSafeAccountInfo({ data: null })).toBeNull();
  });

  it("reads only the envelope code/message", () => {
    expect(extractEnvelopeSafe({ code: "00000", msg: "success", data: {} })).toEqual({
      code: "00000",
      msg: "success",
    });
    expect(extractEnvelopeSafe(null)).toEqual({ code: null, msg: null });
  });
});

describe("verify script stays read-only", () => {
  const scriptSource = readFileSync(
    new URL("../scripts/verify-bitget-demo-auth.ts", import.meta.url),
    "utf8",
  );

  it("delegates to the shared helper for both allowed endpoints", () => {
    expect(scriptSource).toContain("fetchDemoAccountInfo");
    expect(scriptSource).toContain("fetchDemoReadOnly");
    expect(scriptSource).toContain("DEMO_AUTH_ACCOUNT_INFO_PATH");
    expect(scriptSource).toContain("DEMO_TRADE_UNFILLED_ORDERS_PATH");
    expect(scriptSource).toContain("category=SPOT");
  });

  it("reports the probe and metadata fields without inferring permission", () => {
    expect(scriptSource).toContain("utaTradeReadProbe");
    expect(scriptSource).toContain("permissionMetadata");
    expect(scriptSource).toContain("UNAVAILABLE");
    // Unknown (not false) unless Bitget explicitly lists permissions.
    expect(scriptSource).toContain("hasUtaTrade");
    expect(scriptSource).toContain('"unknown"');
  });

  it("lets the event loop drain instead of force-exiting", () => {
    expect(scriptSource).toContain("process.exitCode");
    expect(scriptSource).not.toContain("process.exit(");
  });

  it("contains no write-endpoint or write-method literals", () => {
    for (const fragment of [
      "place-order",
      "cancel-order",
      "batch-order",
      "set-leverage",
      "transfer",
      "withdraw",
      "deposit",
      "amend-order",
      '"POST"',
      '"PUT"',
      '"DELETE"',
      "ACCESS-SIGN",
    ]) {
      expect(scriptSource).not.toContain(fragment);
    }
  });

  it("scrubs every printed line", () => {
    expect(scriptSource).toContain("redactSecrets");
  });
});
