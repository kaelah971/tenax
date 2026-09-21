// Tenax Phase 3B-B — NVDAx attachment tests (offline, no network).
//
// Covers: verified NVDAx attaches to subject NVDA as AVAILABLE (REAL but
// NOT OWNED), aggregates never move for available leaves, duplicate /
// cross-subject rejection, provider failure/timeout isolation, identity or
// address gaps preventing attachment, unknown price staying unknown, and
// secret-free serialization. The live provider is NEVER touched here —
// discovery is always injected. See scripts/verify-xstocks-nvdax.ts.
import { describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { DecisionReceipt } from "../src/lib/tenax/domain";
import {
  buildExposureGraph,
  withRepresentation,
} from "../src/lib/tenax/exposure-graph";
import { NVDA_EXPOSURE_FIXTURE } from "../src/lib/tenax/fixtures";
import {
  analyzeProtectionIntent,
  approveProtectionProposal,
  createDevStore,
  createProtectionIntent,
  executeProtectionProposal,
  getExposureGraph,
} from "../src/lib/tenax/index";
import {
  toAvailableRepresentation,
  toNvdaxDisplayFacts,
  type NvdaxAsset,
  type NvdaxDiscovery,
} from "../src/lib/xstocks/public";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const SOLANA_ADDRESS = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

const NVDAX_ASSET: NvdaxAsset = {
  symbol: "NVDAx",
  name: "NVIDIA xStock",
  isin: "CH1436219195",
  underlyingSymbol: "NVDA",
  underlyingName: "NVDA",
  isTradingHalted: false,
  tradingHalted: false,
  deployments: [{ network: "Solana", address: SOLANA_ADDRESS }],
};

function makeDiscovery(overrides: Partial<NvdaxDiscovery> = {}): NvdaxDiscovery {
  return {
    symbol: "NVDAx",
    network: "Solana",
    asset: NVDAX_ASSET,
    solana: { network: "Solana", address: SOLANA_ADDRESS },
    price: { quote: 223.93 },
    multiplier: {
      currentMultiplier: 1.001701196801074,
      newMultiplier: 0,
      activationDateTime: 0,
      reason: null,
    },
    systemStatus: {
      symbol: "NVDAx",
      isMarketTradingHalted: false,
      isAtomicTradingHalted: false,
    },
    oracles: [
      {
        network: "Solana",
        managedBy: "Pyth",
        reference: "4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f",
      },
      {
        network: "Solana",
        managedBy: "Chainlink",
        reference: "0x000a37a55df2ef907d8fa06af6632bc16da58a62b68be2e1994efaa037a0918a",
      },
    ],
    identity: { mapping: "PASS", subjectId: "NVDA", detail: "official underlyingSymbol=NVDA" },
    overall: "PASS",
    failedEndpoints: [],
    ...overrides,
  };
}

function makeVerifiedDemoReceipt(): DecisionReceipt {
  return {
    receiptId: "TENAX-1C-flow-0009",
    timestamp: "2026-09-21T10:00:02.000Z",
    underlying: "NVDA",
    representation: "RNVDAUSDT",
    exposureValueUsdt: 500,
    intent: "PROTECT_EVENT_RISK",
    proposedProtectionPct: 20,
    proposedTradeValueUsdt: 100,
    mandateResult: "PASS",
    mandateChecks: [],
    approval: "APPROVED",
    executionMode: "BITGET_DEMO",
    fundsMoved: true,
    request: {
      mode: "BITGET_DEMO",
      operationId: "placeOrder",
      endpoint: "POST /api/v3/trade/place-order",
      category: "USDT-FUTURES",
      symbol: "NVDAUSDT",
      side: "sell",
      posSide: "short",
      orderType: "market",
      qty: "0.44",
      clientOid: "tenax-flow-0009-ph-test",
      kind: "DEMO order — submitted, virtual funds only",
    },
    demoExecution: {
      orderId: "demo-oid-98",
      clientOid: "tenax-flow-0009-ph-test",
      orderStatus: "filled",
      filled: true,
      avgPrice: "223.53",
      cumExecQty: "0.44",
      cumExecValue: "98.35",
      leverage: "1x",
      marginMode: "crossed",
      approvedNotionalUsdt: 100,
      submittedAt: "2026-09-21T10:00:00.000Z",
      verifiedAt: "2026-09-21T10:00:01.000Z",
      fundsDisclaimer: "DEMO ORDER — VIRTUAL FUNDS ONLY",
    },
    rejectedAlternatives: [],
    evidenceRefs: ["execution=DEMO"],
  };
}

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

describe("verified NVDAx attaches as AVAILABLE (never owned)", () => {
  it("maps to subject NVDA with REAL provenance and no position fields", () => {
    const leaf = toAvailableRepresentation(makeDiscovery());
    expect(leaf).not.toBeNull();
    expect(leaf).toMatchObject({
      representationId: "NVDAx",
      subjectId: "NVDA",
      venue: "xStocks · Solana",
      role: "available",
      direction: null,
      quantity: null,
      usdValue: null,
      leverage: null,
      marginMode: null,
      provenance: "REAL",
    });
    expect(leaf?.symbol).toBe(SOLANA_ADDRESS);
    expect(leaf?.note).toMatch(/NOT OWNED/);
    expect(leaf?.note).toMatch(/NOT A POSITION/);
  });

  it("exposes provider-backed display facts without inventing unknowns", () => {
    const facts = toNvdaxDisplayFacts(makeDiscovery());
    expect(facts).toMatchObject({
      symbol: "NVDAx",
      network: "Solana",
      address: SOLANA_ADDRESS,
      price: 223.93,
      currentMultiplier: 1.001701196801074,
      tradingHalted: false,
      atomicHalted: false,
    });
    expect(facts?.oracleManagers).toEqual(["Pyth", "Chainlink"]);
  });

  it("forms the three-legged graph without moving any aggregate", () => {
    const base = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeVerifiedDemoReceipt(),
      flowId: "flow-0009",
    });
    expect(base.representations).toHaveLength(2);
    const leaf = toAvailableRepresentation(makeDiscovery());
    if (!leaf) throw new Error("expected an available leaf");
    const extended = withRepresentation(base, leaf);
    expect(extended.subjectId).toBe("NVDA");
    expect(extended.representations).toHaveLength(3);
    expect(extended.representations.map((r) => r.role)).toEqual([
      "exposure",
      "protection",
      "available",
    ]);
    expect(extended.grossExposureUsd).toBe(500);
    expect(extended.protectedNotionalUsd).toBe(98.35);
    expect(extended.remainingExposureUsd).toBe(401.65);
  });

  it("ignores even a hostile available leaf in the aggregates", () => {
    const base = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeVerifiedDemoReceipt(),
      flowId: "flow-0009",
    });
    const leaf = toAvailableRepresentation(makeDiscovery());
    if (!leaf) throw new Error("expected an available leaf");
    const hostile = { ...leaf, usdValue: 9999, quantity: "100" };
    const extended = withRepresentation(base, hostile);
    expect(extended.grossExposureUsd).toBe(500);
    expect(extended.protectedNotionalUsd).toBe(98.35);
    expect(extended.remainingExposureUsd).toBe(401.65);
  });

  it("rejects duplicate and cross-subject available leaves", () => {
    const base = buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE });
    const leaf = toAvailableRepresentation(makeDiscovery());
    if (!leaf) throw new Error("expected an available leaf");
    const once = withRepresentation(base, leaf);
    expect(() => withRepresentation(once, leaf)).toThrow(/GRAPH_DUPLICATE_LEAF/);
    expect(() =>
      withRepresentation(base, { ...leaf, subjectId: "AAPL" as "NVDA" }),
    ).toThrow(/GRAPH_SUBJECT_MISMATCH/);
  });
});

describe("attachment gaps fail safe", () => {
  it("prevents attachment when identity fails", () => {
    const discovery = makeDiscovery({
      identity: { mapping: "FAIL", subjectId: null, detail: "foreign underlying" },
      overall: "FAIL",
    });
    expect(toAvailableRepresentation(discovery)).toBeNull();
    expect(toNvdaxDisplayFacts(discovery)).toBeNull();
  });

  it("prevents attachment when the token address is missing", () => {
    const discovery = makeDiscovery({
      solana: null,
      overall: "PARTIAL",
      failedEndpoints: ["asset"],
    });
    expect(toAvailableRepresentation(discovery)).toBeNull();
    expect(toNvdaxDisplayFacts(discovery)).toBeNull();
  });

  it("still attaches when only the price is unknown", () => {
    const discovery = makeDiscovery({ price: null, overall: "PARTIAL", failedEndpoints: ["price-data"] });
    const leaf = toAvailableRepresentation(discovery);
    expect(leaf?.role).toBe("available");
    expect(toNvdaxDisplayFacts(discovery)?.price).toBeNull();
  });
});

describe("service attach with injected discovery", () => {
  async function setupCompletedDryRun() {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    approveProtectionProposal(store, { flowId, actor: "human" });
    await executeProtectionProposal(store, { flowId });
    return { store, flowId };
  }

  it("attaches the verified leaf through the service with facts", async () => {
    const { store } = await setupCompletedDryRun();
    const { graph, nvdax } = await getExposureGraph(store, {
      discoverNvdax: async () => makeDiscovery(),
    });
    expect(graph.representations).toHaveLength(2);
    expect(graph.representations.map((r) => r.role)).toEqual(["exposure", "available"]);
    expect(graph.grossExposureUsd).toBe(500);
    expect(graph.protectedNotionalUsd).toBeNull();
    expect(graph.remainingExposureUsd).toBeNull();
    expect(nvdax?.address).toBe(SOLANA_ADDRESS);
    expect(nvdax?.price).toBe(223.93);
  });

  it("keeps the core graph when discovery throws", async () => {
    const { store } = await setupCompletedDryRun();
    const { graph, nvdax } = await getExposureGraph(store, {
      discoverNvdax: async () => {
        throw new Error("provider down");
      },
    });
    expect(graph.representations).toHaveLength(1);
    expect(graph.grossExposureUsd).toBe(500);
    expect(nvdax).toBeNull();
  });

  it("keeps the core graph when discovery times out", async () => {
    const { store } = await setupCompletedDryRun();
    const { graph, nvdax } = await getExposureGraph(store, {
      discoverNvdax: () => new Promise(() => {}),
      discoveryTimeoutMs: 5,
    });
    expect(graph.representations).toHaveLength(1);
    expect(nvdax).toBeNull();
  });

  it("attaches nothing when identity fails at runtime", async () => {
    const { store } = await setupCompletedDryRun();
    const { graph, nvdax } = await getExposureGraph(store, {
      discoverNvdax: async () =>
        makeDiscovery({
          identity: { mapping: "FAIL", subjectId: null, detail: "foreign" },
          overall: "FAIL",
        }),
    });
    expect(graph.representations).toHaveLength(1);
    expect(nvdax).toBeNull();
  });
});

describe("no secret material in graph output", () => {
  it("serializes the view cleanly", async () => {
    const base = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeVerifiedDemoReceipt(),
      flowId: "flow-0009",
    });
    const leaf = toAvailableRepresentation(makeDiscovery());
    if (!leaf) throw new Error("expected an available leaf");
    const serialized = JSON.stringify({
      graph: withRepresentation(base, leaf),
      nvdax: toNvdaxDisplayFacts(makeDiscovery()),
    });
    // The official mint address is public provider data and must be present exactly.
    expect(serialized).toContain(SOLANA_ADDRESS);
    for (const fragment of ["X-API-KEY", "ApiKeyAuth", "Authorization", "Bearer ", "secretKey", "passphrase"]) {
      expect(serialized).not.toContain(fragment);
    }
  });
});
