// Tenax Phase 2B — account-assets discovery tests (offline, no network).
//
// Covers: assets endpoint allowlist, normalization across response shapes,
// zero balances, missing fields, rToken/RNVDA detection, secret-scrubbed
// script guard, and no write-endpoint usage.
// Live-network verification lives in scripts/verify-bitget-demo-assets.ts.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEMO_ACCOUNT_ASSETS_PATH,
  READ_ONLY_ALLOWLIST,
  assertReadOnlyRequest,
  fetchDemoReadOnly,
} from "../src/lib/bitget/demo-auth";
import {
  MAX_ASSET_ROWS,
  isNvdaRelatedCoin,
  isRealityAssetCoin,
  normalizeAccountAssets,
  normalizeCoinSymbol,
  parseAmount,
} from "../src/lib/bitget/demo-assets";

const CREDS = { apiKey: "test-api-key", secretKey: "test-secret-key", passphrase: "test-pass" };

describe("account-assets allowlist", () => {
  it("is one of exactly three allowlisted GET endpoints", () => {
    expect(READ_ONLY_ALLOWLIST).toContain(DEMO_ACCOUNT_ASSETS_PATH);
    expect(DEMO_ACCOUNT_ASSETS_PATH).toBe("/api/v3/account/assets");
    expect(() => assertReadOnlyRequest("GET", DEMO_ACCOUNT_ASSETS_PATH)).not.toThrow();
  });

  it("refuses non-GET methods on the assets path", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect(() => assertReadOnlyRequest(method, DEMO_ACCOUNT_ASSETS_PATH)).toThrow();
    }
  });

  it("issues exactly one GET to /api/v3/account/assets (injected fetch)", async () => {
    const calls: Array<{ url: string; init: { method: string; headers: Record<string, string> } }> =
      [];
    const result = await fetchDemoReadOnly({
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      tradingMode: "demo",
      requestPath: DEMO_ACCOUNT_ASSETS_PATH,
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { status: 200, text: async () => '{"code":"00000","msg":"success","data":[]}' };
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.bitget.com/api/v3/account/assets");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers["paptrading"]).toBe("1");
    expect(result.httpStatus).toBe(200);
    expect(result.transportError).toBeNull();
  });
});

describe("account-assets normalization", () => {
  it("normalizes a typical array payload with string amounts", () => {
    const normalized = normalizeAccountAssets({
      code: "00000",
      msg: "success",
      data: [
        { coin: "USDT", available: "1000.5", frozen: "0", equity: "1000.5", usdValue: "1000.5" },
        { coin: "BTC", available: "0.01", frozen: "0", equity: "0.01", usdValue: "600.00" },
      ],
    });
    expect(normalized?.skipped).toBe(0);
    expect(normalized?.assets).toHaveLength(2);
    expect(normalized?.assets[0]).toEqual({
      coin: "USDT",
      available: "1000.5",
      frozen: "0",
      equity: "1000.5",
      usdValue: "1000.5",
      isNonZero: true,
      isRealityAsset: false,
      isNvdaRelated: false,
    });
  });

  it("accepts numeric amounts and alternate field names", () => {
    const normalized = normalizeAccountAssets({
      data: [{ currency: "ETH", availableBalance: 2, lockedBalance: 0.5, totalEquity: 2.5 }],
    });
    expect(normalized?.assets[0]).toMatchObject({
      coin: "ETH",
      available: "2",
      frozen: "0.5",
      equity: "2.5",
      isNonZero: true,
    });
  });

  it("accepts an object-wrapped asset list", () => {
    const normalized = normalizeAccountAssets({
      data: { assets: [{ coin: "USDT", available: "10" }] },
    });
    expect(normalized?.assets).toHaveLength(1);
    expect(normalized?.assets[0]?.coin).toBe("USDT");
  });

  it("marks all-zero balances as zero without dropping the row", () => {
    const normalized = normalizeAccountAssets({
      data: [{ coin: "USDT", available: "0", frozen: "0.00", equity: "0" }],
    });
    expect(normalized?.assets).toHaveLength(1);
    expect(normalized?.assets[0]?.isNonZero).toBe(false);
  });

  it("leaves missing fields null instead of guessing", () => {
    const normalized = normalizeAccountAssets({ data: [{ coin: "USDT" }] });
    expect(normalized?.assets[0]).toEqual({
      coin: "USDT",
      available: null,
      frozen: null,
      equity: null,
      usdValue: null,
      isNonZero: false,
      isRealityAsset: false,
      isNvdaRelated: false,
    });
  });

  it("ignores non-numeric amount junk", () => {
    const normalized = normalizeAccountAssets({
      data: [{ coin: "USDT", available: "--", frozen: "", equity: "n/a" }],
    });
    expect(normalized?.assets[0]).toMatchObject({
      available: null,
      frozen: null,
      equity: null,
      isNonZero: false,
    });
  });

  it("returns null for unrecognized shapes", () => {
    expect(normalizeAccountAssets(null)).toBeNull();
    expect(normalizeAccountAssets({})).toBeNull();
    expect(normalizeAccountAssets({ code: "00000", data: null })).toBeNull();
    expect(normalizeAccountAssets({ data: { somethingElse: [] } })).toBeNull();
    expect(normalizeAccountAssets({ data: "oops" })).toBeNull();
  });

  it("counts unusable rows as skipped, never as assets", () => {
    const normalized = normalizeAccountAssets({
      data: [{ coin: "USDT", available: "5" }, { nope: true }, "junk", { coin: "" }, null],
    });
    expect(normalized?.assets.map((asset) => asset.coin)).toEqual(["USDT"]);
    expect(normalized?.skipped).toBe(4);
  });

  it("caps rows defensively", () => {
    const rows = Array.from({ length: MAX_ASSET_ROWS + 3 }, (_, i) => ({
      coin: `C${i}`,
      available: "1",
    }));
    const normalized = normalizeAccountAssets({ data: rows });
    expect(normalized?.assets).toHaveLength(MAX_ASSET_ROWS);
    expect(normalized?.skipped).toBe(3);
  });
});

describe("Reality/rToken detection", () => {
  it("flags RNVDA as Reality and NVDA-related", () => {
    const normalized = normalizeAccountAssets({
      data: [{ coin: "RNVDA", available: "10", frozen: "0", equity: "10" }],
    });
    expect(normalized?.assets[0]).toMatchObject({
      isRealityAsset: true,
      isNvdaRelated: true,
      isNonZero: true,
    });
  });

  it("flags NVDA as NVDA-related but not an rToken", () => {
    expect(isNvdaRelatedCoin("NVDA")).toBe(true);
    expect(isRealityAssetCoin("NVDA")).toBe(false);
  });

  it("normalizes case and tolerates a USDT pair suffix", () => {
    expect(normalizeCoinSymbol("  rnvda ")).toBe("RNVDA");
    expect(isRealityAssetCoin("rnvda")).toBe(true);
    expect(isNvdaRelatedCoin("RNVDAUSDT")).toBe(true);
  });

  it("does not prefix-guess ordinary R-coins as Reality assets", () => {
    for (const coin of ["ROSE", "RUNE", "RSR", "RAY", "RVN", "USDT", "BTC"]) {
      expect(isRealityAssetCoin(coin)).toBe(false);
      expect(isNvdaRelatedCoin(coin)).toBe(false);
    }
  });

  it("rejects unusable symbols", () => {
    expect(normalizeCoinSymbol(null)).toBeNull();
    expect(normalizeCoinSymbol("")).toBeNull();
    expect(normalizeCoinSymbol("has space")).toBeNull();
    expect(normalizeCoinSymbol("x".repeat(25))).toBeNull();
  });
});

describe("amount parsing", () => {
  it("parses decimals and rejects blanks and junk", () => {
    expect(parseAmount("1000.5")).toBe(1000.5);
    expect(parseAmount("0.00")).toBe(0);
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("  ")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
  });
});

describe("assets script stays safe and read-only", () => {
  const scriptSource = readFileSync(
    new URL("../scripts/verify-bitget-demo-assets.ts", import.meta.url),
    "utf8",
  );

  it("delegates to the shared helper and normalizer for the assets endpoint", () => {
    expect(scriptSource).toContain("fetchDemoReadOnly");
    expect(scriptSource).toContain("DEMO_ACCOUNT_ASSETS_PATH");
    expect(scriptSource).toContain("normalizeAccountAssets");
  });

  it("scrubs output and reports exposure honestly", () => {
    expect(scriptSource).toContain("redactSecrets");
    expect(scriptSource).toContain("rnvdaExposure: ABSENT");
    expect(scriptSource).toContain("no NVDA-related Reality exposure found");
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
});
