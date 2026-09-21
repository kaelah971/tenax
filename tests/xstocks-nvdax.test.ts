// Tenax Phase 3B-A — xStocks NVDAx discovery tests (offline, no network).
//
// Covers: explicit-underlying identity mapping (never ticker heuristics),
// Solana deployment normalization with exact address retention,
// UNAVAILABLE-on-absent, price/multiplier/halt parsing, availability-vs-
// ownership distinction, GET-only enforcement, safe malformed handling,
// and discovery overall semantics. Live verification is NEVER exercised
// here — see scripts/verify-xstocks-nvdax.ts (owner-run, GET-only).
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  XSTOCKS_NVDAX_SYMBOL,
  assertXstocksPublicAllowed,
  evaluateNvdaxIdentity,
  fetchNvdaxDiscovery,
  normalizeNvdaxAsset,
  normalizeNvdaxMultiplier,
  normalizeNvdaxOracles,
  normalizeNvdaxPrice,
  normalizeNvdaxSystemStatus,
  normalizeSolanaDeployment,
  toAvailableRepresentation,
  type NvdaxAsset,
  type XstocksPublicClient,
} from "../src/lib/xstocks/public";
import { withRepresentation } from "../src/lib/tenax/index";
import { NVDA_EXPOSURE_FIXTURE } from "../src/lib/tenax/fixtures";
import { buildExposureGraph } from "../src/lib/tenax/exposure-graph";

// Observed official shapes (trimmed to the fields Tenax normalizes).
const ASSET_OK: Record<string, unknown> = {
  name: "NVIDIA xStock",
  symbol: "NVDAx",
  isin: "CH1436219195",
  underlyingSymbol: "NVDA",
  underlying: { symbol: "NVDA", isin: "US67066G1040", currency: "USD", listingCountry: "US" },
  isTradingHalted: false,
  trading: { isTradingHalted: false },
  deployments: [
    { address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d", network: "Ethereum" },
    { address: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", network: "Solana" },
  ],
};

const TSLA_ASSET: Record<string, unknown> = {
  ...ASSET_OK,
  name: "Tesla xStock",
  symbol: "TSLAx",
  underlyingSymbol: "TSLA",
  underlying: { symbol: "TSLA", isin: "US88160R1014", currency: "USD", listingCountry: "US" },
};

function stubClient(
  responses: Record<string, { status: number; body: unknown }>,
  calls: string[] = [],
): XstocksPublicClient {
  return {
    async getJson(url: string) {
      calls.push(`GET ${url}`);
      const path = url.replace(/^https?:\/\/[^/]+\/api\/v2/, "");
      const hit = responses[path.split("?")[0] as string];
      if (!hit) return { httpStatus: 404, body: { error: "not found" } };
      return { httpStatus: hit.status, body: hit.body };
    },
  };
}

const FULL_DISCOVERY_BODIES = {
  "/public/assets/NVDAx": { status: 200, body: ASSET_OK },
  "/public/assets/NVDAx/price-data": { status: 200, body: { quote: 223.93 } },
  "/public/assets/NVDAx/multiplier": {
    status: 200,
    body: { currentMultiplier: 1.001701196801074, newMultiplier: 0, activationDateTime: 0, reason: null },
  },
  "/public/system/status/NVDAx": {
    status: 200,
    body: { symbol: "NVDAx", isMarketTradingHalted: false, isAtomicTradingHalted: false },
  },
  "/public/oracles/NVDAx": {
    status: 200,
    body: {
      nodes: [
        { network: "Solana", managedBy: "Pyth", metadata: { hermesId: "4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f" }, collateral: { symbol: "NVDA" } },
        { network: "Solana", managedBy: "Chainlink", metadata: { feedId: "0x000a37a55df2ef907d8fa06af6632bc16da58a62b68be2e1994efaa037a0918a" }, collateral: { symbol: "NVDA" } },
        { network: "Ethereum", managedBy: "Chainlink", metadata: { feedId: "0x000a37a55df2ef907d8fa06af6632bc16da58a62b68be2e1994efaa037a0918a" }, collateral: { symbol: "NVDA" } },
      ],
    },
  },
};

describe("identity check (explicit metadata only)", () => {
  it("maps NVDAx to subject NVDA on the explicit official underlying", () => {
    const asset = normalizeNvdaxAsset(ASSET_OK);
    expect(asset?.underlyingSymbol).toBe("NVDA");
    const identity = evaluateNvdaxIdentity(asset);
    expect(identity.mapping).toBe("PASS");
    expect(identity.subjectId).toBe("NVDA");
  });

  it("accepts the deprecated underlyingSymbol field as fallback", () => {
    const asset = normalizeNvdaxAsset({ ...ASSET_OK, underlying: null });
    expect(asset?.underlyingSymbol).toBe("NVDA");
    expect(evaluateNvdaxIdentity(asset).mapping).toBe("PASS");
  });

  it("refuses an unrelated ticker even with a valid shape", () => {
    const asset = normalizeNvdaxAsset(TSLA_ASSET);
    const identity = evaluateNvdaxIdentity(asset);
    expect(identity.mapping).toBe("FAIL");
    expect(identity.subjectId).toBeNull();
  });

  it("uses no ticker-prefix heuristics: NVDA-like symbol, foreign underlying FAILs", () => {
    const asset = normalizeNvdaxAsset({
      ...ASSET_OK,
      symbol: "NVDAxyz",
      underlyingSymbol: "OTHER",
      underlying: { symbol: "OTHER" },
    });
    expect(evaluateNvdaxIdentity(asset).mapping).toBe("FAIL");
  });

  it("fails safely when metadata is absent", () => {
    expect(evaluateNvdaxIdentity(null).mapping).toBe("FAIL");
  });
});

describe("Solana deployment normalization", () => {
  it("retains the official mint address exactly", () => {
    const asset = normalizeNvdaxAsset(ASSET_OK);
    const solana = normalizeSolanaDeployment(asset);
    expect(solana?.network).toBe("Solana");
    expect(solana?.address).toBe("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
  });

  it("matches the network case-insensitively", () => {
    const asset = normalizeNvdaxAsset(ASSET_OK);
    expect(normalizeSolanaDeployment(asset, "solana")?.address).toBe(
      "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    );
  });

  it("reports UNAVAILABLE (null) when the address or network is absent", () => {
    const asset = normalizeNvdaxAsset(ASSET_OK);
    expect(normalizeSolanaDeployment(asset, "Base") ?? null).toBeNull();
    const noAddress = normalizeNvdaxAsset({
      ...ASSET_OK,
      deployments: [{ network: "Solana", address: "" }],
    });
    expect(normalizeSolanaDeployment(noAddress)?.address).toBeNull();
    expect(normalizeSolanaDeployment(null)).toBeNull();
  });
});

describe("price and multiplier parsing", () => {
  it("parses the indicative quote and rejects non-prices", () => {
    expect(normalizeNvdaxPrice({ quote: 223.93 })?.quote).toBe(223.93);
    expect(normalizeNvdaxPrice({ quote: "223.93" })?.quote).toBe(223.93);
    for (const bad of [{}, { quote: 0 }, { quote: -1 }, { quote: "n/a" }, null, []]) {
      expect(normalizeNvdaxPrice(bad)).toBeNull();
    }
  });

  it("parses the Solana multiplier, keeping an explicit zero pending value", () => {
    const parsed = normalizeNvdaxMultiplier({
      currentMultiplier: 1.001701196801074,
      newMultiplier: 0,
      activationDateTime: 0,
      reason: null,
    });
    expect(parsed?.currentMultiplier).toBe(1.001701196801074);
    expect(parsed?.newMultiplier).toBe(0);
    expect(parsed?.reason).toBeNull();
    expect(normalizeNvdaxMultiplier({})).toBeNull();
    expect(normalizeNvdaxMultiplier(null)).toBeNull();
  });
});

describe("halt state parsing", () => {
  it("reads halt flags from asset and system status", () => {
    expect(normalizeNvdaxAsset(ASSET_OK)?.isTradingHalted).toBe(false);
    expect(normalizeNvdaxAsset({ ...ASSET_OK, isTradingHalted: true })?.isTradingHalted).toBe(true);
    expect(normalizeNvdaxAsset({ ...ASSET_OK, isTradingHalted: "yes" })?.isTradingHalted).toBeNull();
    const status = normalizeNvdaxSystemStatus({
      symbol: "NVDAx",
      isMarketTradingHalted: false,
      isAtomicTradingHalted: true,
    });
    expect(status?.isMarketTradingHalted).toBe(false);
    expect(status?.isAtomicTradingHalted).toBe(true);
    expect(normalizeNvdaxSystemStatus({})).toBeNull();
  });
});

describe("oracle normalization", () => {
  it("keeps Solana refs with manager and feed reference", () => {
    const refs = normalizeNvdaxOracles(
      (FULL_DISCOVERY_BODIES["/public/oracles/NVDAx"] as { body: unknown }).body,
      "Solana",
    );
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.managedBy).sort()).toEqual(["Chainlink", "Pyth"]);
    for (const ref of refs) {
      expect(ref.network).toBe("Solana");
      expect(ref.reference).not.toBeNull();
    }
  });

  it("excludes other networks and fails safe on malformed shapes", () => {
    const refs = normalizeNvdaxOracles(
      (FULL_DISCOVERY_BODIES["/public/oracles/NVDAx"] as { body: unknown }).body,
      "Base",
    );
    expect(refs).toEqual([]);
    expect(normalizeNvdaxOracles(null)).toEqual([]);
    expect(normalizeNvdaxOracles({ nodes: "nope" })).toEqual([]);
  });
});

describe("availability is not ownership", () => {
  async function availableDiscovery() {
    return fetchNvdaxDiscovery(stubClient(FULL_DISCOVERY_BODIES), { gapMs: 0 });
  }

  it("builds an AVAILABLE leaf that is not an owned exposure", async () => {
    const discovery = await availableDiscovery();
    expect(discovery.overall).toBe("PASS");
    const leaf = toAvailableRepresentation(discovery);
    expect(leaf).not.toBeNull();
    expect(leaf).toMatchObject({
      representationId: XSTOCKS_NVDAX_SYMBOL,
      subjectId: "NVDA",
      venue: "xStocks · Solana",
      role: "available",
      direction: null,
      quantity: null,
      usdValue: null,
      leverage: null,
      marginMode: null,
    });
    expect(leaf?.role).not.toBe("exposure");
    expect(leaf?.note).toMatch(/NOT OWNED/);
  });

  it("attaches to the graph without changing the subject or aggregates", async () => {
    const discovery = await availableDiscovery();
    const leaf = toAvailableRepresentation(discovery);
    if (!leaf) throw new Error("expected an available leaf");
    const base = buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE });
    const extended = withRepresentation(base, leaf);
    expect(extended.subjectId).toBe("NVDA");
    expect(extended.representations).toHaveLength(2);
    expect(extended.grossExposureUsd).toBe(500);
    expect(extended.protectedNotionalUsd).toBeNull();
  });

  it("proves nothing when identity fails or the address is absent", async () => {
    const badIdentity = await fetchNvdaxDiscovery(
      stubClient({
        ...FULL_DISCOVERY_BODIES,
        "/public/assets/NVDAx": { status: 200, body: TSLA_ASSET },
      }),
      { gapMs: 0 },
    );
    expect(badIdentity.identity.mapping).toBe("FAIL");
    expect(toAvailableRepresentation(badIdentity)).toBeNull();
    const noAddress = await fetchNvdaxDiscovery(
      stubClient({
        ...FULL_DISCOVERY_BODIES,
        "/public/assets/NVDAx": {
          status: 200,
          body: { ...ASSET_OK, deployments: [{ network: "Ethereum", address: "0xabc" }] },
        },
      }),
      { gapMs: 0 },
    );
    expect(noAddress.solana).toBeNull();
    expect(toAvailableRepresentation(noAddress)).toBeNull();
  });
});

describe("GET-only boundary and no credentials", () => {
  const adapterSource = readFileSync(
    new URL("../src/lib/xstocks/public.ts", import.meta.url),
    "utf8",
  );

  it("allows exactly the documented public GETs", () => {
    expect(() =>
      assertXstocksPublicAllowed("GET", "/public/assets/NVDAx"),
    ).not.toThrow();
    expect(() =>
      assertXstocksPublicAllowed("GET", "/public/assets/NVDAx/multiplier?network=Solana"),
    ).not.toThrow();
    expect(() => assertXstocksPublicAllowed("POST", "/public/assets/NVDAx")).toThrow(/refused/);
    expect(() => assertXstocksPublicAllowed("GET", "/public/assets/NVDAx/mint")).toThrow(/refused/);
    expect(() => assertXstocksPublicAllowed("GET", "/client/registered-wallets")).toThrow(/refused/);
  });

  it("requires no API key and carries no auth material", () => {
    for (const fragment of ["X-API-KEY", "ApiKeyAuth", "Authorization:", "Bearer "]) {
      expect(adapterSource).not.toContain(fragment);
    }
    expect(adapterSource).not.toContain('"POST"');
    expect(adapterSource).not.toContain("PUT");
    const scriptSource = readFileSync(
      new URL("../scripts/verify-xstocks-nvdax.ts", import.meta.url),
      "utf8",
    );
    expect(scriptSource).not.toContain("X-API-KEY");
    expect(scriptSource).not.toContain("process.exit(");
    expect(scriptSource).toContain("process.exitCode");
  });
});

describe("malformed provider data fails safely", () => {
  it("normalizers return null (never throw) on hostile shapes", () => {
    const hostile: unknown[] = [null, undefined, 42, "nope", [], { nodes: [] }];
    for (const body of hostile) {
      expect(() => normalizeNvdaxAsset(body)).not.toThrow();
      expect(normalizeNvdaxAsset(body)).toBeNull();
      expect(normalizeNvdaxPrice(body)).toBeNull();
      expect(normalizeNvdaxMultiplier(body)).toBeNull();
      expect(normalizeNvdaxSystemStatus(body)).toBeNull();
      expect(normalizeNvdaxOracles(body)).toEqual([]);
    }
    const asset: NvdaxAsset | null = null;
    expect(normalizeSolanaDeployment(asset)).toBeNull();
  });
});

describe("discovery overall semantics", () => {
  it("reports PASS when all five endpoints normalize", async () => {
    const calls: string[] = [];
    const discovery = await fetchNvdaxDiscovery(stubClient(FULL_DISCOVERY_BODIES, calls), {
      gapMs: 0,
    });
    expect(discovery.overall).toBe("PASS");
    expect(discovery.failedEndpoints).toEqual([]);
    expect(discovery.asset?.symbol).toBe("NVDAx");
    expect(discovery.price?.quote).toBe(223.93);
    expect(discovery.multiplier?.currentMultiplier).toBe(1.001701196801074);
    expect(discovery.systemStatus?.isMarketTradingHalted).toBe(false);
    expect(discovery.solana?.address).toBe("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
    const posts = calls.filter((c) => !c.startsWith("GET"));
    expect(posts).toEqual([]);
    expect(calls).toHaveLength(5);
  });

  it("reports PARTIAL when the asset is proven but an auxiliary endpoint gaps", async () => {
    const discovery = await fetchNvdaxDiscovery(
      stubClient({
        ...FULL_DISCOVERY_BODIES,
        "/public/assets/NVDAx/price-data": { status: 500, body: { error: "boom" } },
      }),
      { gapMs: 0 },
    );
    expect(discovery.overall).toBe("PARTIAL");
    expect(discovery.failedEndpoints).toContain("price-data");
    expect(discovery.identity.mapping).toBe("PASS");
  });

  it("reports FAIL when the asset is missing or identity fails", async () => {
    const missing = await fetchNvdaxDiscovery(
      stubClient({
        ...FULL_DISCOVERY_BODIES,
        "/public/assets/NVDAx": { status: 404, body: { error: "nope" } },
      }),
      { gapMs: 0 },
    );
    expect(missing.overall).toBe("FAIL");
    expect(missing.failedEndpoints).toContain("asset");
    const wrongSubject = await fetchNvdaxDiscovery(
      stubClient({
        ...FULL_DISCOVERY_BODIES,
        "/public/assets/NVDAx": { status: 200, body: TSLA_ASSET },
      }),
      { gapMs: 0 },
    );
    expect(wrongSubject.overall).toBe("FAIL");
  });
});
