// Tenax Phase 3A — canonical Exposure Graph tests (offline, no network).
//
// Covers: one subject across representations, SIMULATED exposure honesty,
// DEMO hedge mapping (actual verified qty/value only), ABSENT leg without
// execution, deterministic aggregation, unknown-stays-unknown, future-leaf
// attachment, secret-free serialization, and service derivation from
// canonical state. No order is ever submitted here.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { DecisionReceipt, DemoExecutionRecord } from "../src/lib/tenax/domain";
import {
  buildExposureGraph,
  roundToCents,
  withRepresentation,
  type GraphRepresentation,
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
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const CREDS = { apiKey: "test-api-key", secretKey: "test-secret-key", passphrase: "test-pass" };

function makeDemoExecution(overrides: Partial<DemoExecutionRecord> = {}): DemoExecutionRecord {
  return {
    orderId: "demo-oid-98",
    clientOid: "tenax-flow-0001-ph-test",
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
    ...overrides,
  };
}

function makeReceipt(
  executionMode: "DRY_RUN" | "BITGET_DEMO",
  demoExecution?: DemoExecutionRecord,
): DecisionReceipt {
  return {
    receiptId: "TENAX-1C-flow-0001",
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
    executionMode,
    fundsMoved: executionMode === "BITGET_DEMO",
    request:
      executionMode === "BITGET_DEMO"
        ? {
            mode: "BITGET_DEMO",
            operationId: "placeOrder",
            endpoint: "POST /api/v3/trade/place-order",
            category: "USDT-FUTURES",
            symbol: "NVDAUSDT",
            side: "sell",
            posSide: "short",
            orderType: "market",
            qty: "0.44",
            clientOid: "tenax-flow-0001-ph-test",
            kind: "DEMO order — submitted, virtual funds only",
          }
        : {
            mode: "DRY_RUN",
            operationId: "placeOrder",
            endpoint: "POST /api/v3/trade/place-order",
            category: "SPOT",
            symbol: "RNVDAUSDT",
            side: "sell",
            orderType: "market",
            qty: "0.4513",
            kind: "would-be payload only — NOT submitted",
          },
    demoExecution,
    rejectedAlternatives: [],
    evidenceRefs: ["execution=DEMO"],
  };
}

describe("subject and exposure leg", () => {
  it("maps one NVIDIA subject with a simulated rNVDA leg and no hedge", () => {
    const graph = buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE });
    expect(graph.subjectId).toBe("NVDA");
    expect(graph.canonicalTicker).toBe("NVDA");
    expect(graph.name).toBe("NVIDIA");
    expect(graph.representations).toHaveLength(1);
    const [leg] = graph.representations;
    expect(leg?.subjectId).toBe("NVDA");
    expect(leg?.role).toBe("exposure");
    expect(leg?.representationId).toBe("rNVDA");
    expect(leg?.symbol).toBe("RNVDAUSDT");
    expect(leg?.venue).toBe("Bitget Reality");
    expect(leg?.direction).toBe("long");
    expect(graph.protection).toBe("ABSENT");
    expect(graph.sourceFlowId).toBeNull();
  });

  it("keeps the simulated exposure SIMULATED — never live ownership", () => {
    const graph = buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE });
    const [leg] = graph.representations;
    expect(leg?.provenance).toBe("SIMULATED");
    expect(leg?.note).toMatch(/NOT LIVE OWNERSHIP/);
    expect(graph.grossExposureUsd).toBe(500);
    // Affirmative live-ownership claims must never appear; the honest
    // disclaimer ("NOT LIVE OWNERSHIP") is required, not forbidden.
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain('"provenance":"REAL"');
    expect(serialized).not.toMatch(/"(live|funded holding|real ownership)"/i);
    expect(serialized).toContain("NOT LIVE OWNERSHIP");
  });

  it("refuses non-NVIDIA subjects instead of mis-mapping them", () => {
    expect(() =>
      buildExposureGraph({
        exposure: { ...NVDA_EXPOSURE_FIXTURE, underlying: "AAPL" },
      }),
    ).toThrow(/GRAPH_UNSUPPORTED_SUBJECT/);
  });
});

describe("protection leg from verified Demo execution", () => {
  it("maps actual verified qty/value and stays DEMO with 1x crossed", () => {
    const graph = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeReceipt("BITGET_DEMO", makeDemoExecution()),
      flowId: "flow-0001",
    });
    expect(graph.representations).toHaveLength(2);
    for (const rep of graph.representations) {
      expect(rep.subjectId).toBe("NVDA");
    }
    const hedge = graph.representations.find((r) => r.role === "protection");
    expect(hedge).toMatchObject({
      representationId: "NVDAUSDT",
      symbol: "NVDAUSDT",
      venue: "Bitget Demo",
      ecosystem: "Bitget",
      instrumentType: "perpetual",
      direction: "short",
      quantity: "0.44",
      usdValue: 98.35,
      leverage: "1x",
      marginMode: "crossed",
      provenance: "DEMO",
    });
    expect(hedge?.note).toMatch(/VERIFIED/);
    expect(graph.protection).toBe("PRESENT");
    expect(graph.hedgeVerification).toBe("VERIFIED");
    expect(graph.sourceFlowId).toBe("flow-0001");
  });

  it("aggregates gross minus verified hedge with cent rounding", () => {
    const graph = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeReceipt("BITGET_DEMO", makeDemoExecution()),
      flowId: "flow-0001",
    });
    expect(graph.grossExposureUsd).toBe(500);
    expect(graph.protectedNotionalUsd).toBe(98.35);
    expect(graph.remainingExposureUsd).toBe(401.65);
    expect(roundToCents(500 - 98.35)).toBe(401.65);
  });
});

describe("no fake protection leg", () => {
  it("stays ABSENT with no receipt at all", () => {
    const graph = buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE, receipt: null });
    expect(graph.protection).toBe("ABSENT");
    expect(graph.representations).toHaveLength(1);
    expect(graph.protectedNotionalUsd).toBeNull();
    expect(graph.remainingExposureUsd).toBeNull();
  });

  it("stays ABSENT on a DRY_RUN receipt — a preview is not a hedge", () => {
    const graph = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeReceipt("DRY_RUN"),
      flowId: "flow-0001",
    });
    expect(graph.protection).toBe("ABSENT");
    expect(graph.representations.every((r) => r.role === "exposure")).toBe(true);
    // The graph still names the completed flow it reflects.
    expect(graph.sourceFlowId).toBe("flow-0001");
  });

  it("stays ABSENT when a Demo receipt carries no execution record", () => {
    const graph = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeReceipt("BITGET_DEMO"),
      flowId: "flow-0001",
    });
    expect(graph.protection).toBe("ABSENT");
    expect(graph.protectedNotionalUsd).toBeNull();
  });
});

describe("unknown stays unknown", () => {
  it("shows SUBMITTED with the requested qty but null aggregates until verified", () => {
    const graph = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeReceipt(
        "BITGET_DEMO",
        makeDemoExecution({
          filled: false,
          orderStatus: "live",
          avgPrice: null,
          cumExecQty: null,
          cumExecValue: null,
        }),
      ),
      flowId: "flow-0002",
    });
    expect(graph.protection).toBe("PRESENT");
    expect(graph.hedgeVerification).toBe("SUBMITTED");
    const hedge = graph.representations.find((r) => r.role === "protection");
    // Requested qty is shown as the submitted fact; value is NOT estimated.
    expect(hedge?.quantity).toBe("0.44");
    expect(hedge?.usdValue).toBeNull();
    expect(hedge?.note).toMatch(/AWAITING VERIFICATION/);
    expect(graph.protectedNotionalUsd).toBeNull();
    expect(graph.remainingExposureUsd).toBeNull();
  });

  it("does not multiply qty by price to invent a value", () => {
    const graph = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeReceipt(
        "BITGET_DEMO",
        makeDemoExecution({ filled: true, cumExecValue: null, cumExecQty: "0.44" }),
      ),
      flowId: "flow-0003",
    });
    // Even filled: without a provider-confirmed value, no notional is claimed.
    expect(graph.protectedNotionalUsd).toBeNull();
    expect(graph.remainingExposureUsd).toBeNull();
  });
});

describe("future extensibility", () => {
  const futureLeaf: GraphRepresentation = {
    representationId: "NVDA-ONCHAIN",
    subjectId: "NVDA",
    symbol: "NVDA",
    venue: "Future Chain",
    ecosystem: "unknown",
    instrumentType: "unknown",
    role: "exposure",
    direction: null,
    quantity: null,
    usdValue: null,
    leverage: null,
    marginMode: null,
    status: "unknown",
    provenance: "UNAVAILABLE",
    note: "NOT CONNECTED — FUTURE ADAPTER",
  };

  it("attaches a future leaf without changing the subject model", () => {
    const base = buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE });
    const extended = withRepresentation(base, futureLeaf);
    expect(extended.subjectId).toBe("NVDA");
    expect(extended.representations).toHaveLength(2);
    expect(extended.grossExposureUsd).toBe(500);
    expect(extended.protectedNotionalUsd).toBeNull();
    expect(base.representations).toHaveLength(1);
  });

  it("refuses cross-subject and duplicate leaves", () => {
    const base = buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE });
    expect(() =>
      withRepresentation(base, { ...futureLeaf, subjectId: "AAPL" as "NVDA" }),
    ).toThrow(/GRAPH_SUBJECT_MISMATCH/);
    expect(() =>
      withRepresentation(base, {
        ...futureLeaf,
        representationId: "rNVDA",
        subjectId: "NVDA",
      }),
    ).toThrow(/GRAPH_DUPLICATE_LEAF/);
  });
});

describe("no credentials in graph state", () => {
  it("serializes cleanly with no secret material", () => {
    const graph = buildExposureGraph({
      exposure: NVDA_EXPOSURE_FIXTURE,
      receipt: makeReceipt("BITGET_DEMO", makeDemoExecution()),
      flowId: "flow-0001",
    });
    const serialized = JSON.stringify(graph);
    for (const fragment of [
      "test-api-key",
      "test-secret-key",
      "test-pass",
      "ACCESS-SIGN",
      "ACCESS-KEY",
      "ACCESS-PASSPHRASE",
      "signature",
      "paptrading",
    ]) {
      expect(serialized).not.toContain(fragment);
    }
  });
});

// ---- Service derivation from canonical state ------------------------------

const INSTRUMENT: NvdaInstrument = {
  symbol: "NVDAUSDT",
  category: "USDT-FUTURES",
  status: "online",
  isReality: false,
  baseCoin: "NVDA",
  quoteCoin: "USDT",
  minOrderQty: 0.01,
  maxOrderQty: null,
  minOrderAmount: 5,
  pricePrecision: 2,
  quantityPrecision: 2,
  contractMultiplier: null,
  maxLeverage: 20,
  minLeverage: 1,
};

const TICKER: NvdaTicker = {
  symbol: "NVDAUSDT",
  lastPrice: "223.53",
  markPrice: "223.53",
  indexPrice: "223.53",
  bidPrice: null,
  askPrice: null,
  fundingRate: null,
  updatedAt: null,
};

const PLACE_OK =
  '{"code":"00000","msg":"success","data":{"orderId":"demo-oid-live","clientOid":"tenax-echo"}}';
const INFO_FILLED =
  '{"code":"00000","data":{"orderId":"demo-oid-live","clientOid":"tenax-echo","orderStatus":"filled","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.44","avgPrice":"223.53","cumExecQty":"0.44","cumExecValue":"98.35"}}';

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

let savedTenaxMode: string | undefined;
beforeEach(() => {
  savedTenaxMode = process.env.TENAX_EXECUTION_MODE;
  delete process.env.TENAX_EXECUTION_MODE;
});
afterEach(() => {
  if (savedTenaxMode === undefined) delete process.env.TENAX_EXECUTION_MODE;
  else process.env.TENAX_EXECUTION_MODE = savedTenaxMode;
});

describe("service derivation (canonical state only)", () => {
  it("returns an exposure-only graph when no flow has completed", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    const graph = getExposureGraph(store);
    expect(graph.protection).toBe("ABSENT");
    expect(graph.sourceFlowId).toBeNull();
    expect(graph.grossExposureUsd).toBe(500);
  });

  it("keeps the leg ABSENT after a DRY_RUN completion", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    approveProtectionProposal(store, { flowId, actor: "human" });
    await executeProtectionProposal(store, { flowId });
    const graph = getExposureGraph(store);
    expect(graph.protection).toBe("ABSENT");
    expect(graph.representations).toHaveLength(1);
    expect(graph.sourceFlowId).toBe(flowId);
  });

  it("feeds the leg from a verified Demo execution with stored values", async () => {
    process.env.TENAX_EXECUTION_MODE = "BITGET_DEMO";
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    approveProtectionProposal(store, { flowId, actor: "human" });
    const calls: string[] = [];
    await executeProtectionProposal(
      store,
      { flowId },
      {
        credentials: CREDS,
        baseUrl: "https://api.bitget.com",
        tradingMode: "demo",
        executionMode: "BITGET_DEMO",
        marketReader: async () => ({
          category: "USDT-FUTURES",
          symbol: "NVDAUSDT",
          holdMode: "hedge_mode",
          nvdaSymbolConfigFound: true,
          marginMode: "crossed",
          configuredLeverage: "1",
          position: { ...EMPTY_NVIDIA_POSITION },
          instrument: INSTRUMENT,
          ticker: TICKER,
        }),
        writeFetchImpl: async (url: string) => {
          calls.push(`POST ${url}`);
          return { status: 200, text: async () => PLACE_OK };
        },
        readFetchImpl: async (url: string) => {
          calls.push(`GET ${url}`);
          return { status: 200, text: async () => INFO_FILLED };
        },
        nowMs: Date.now(),
      },
    );
    const graph = getExposureGraph(store);
    expect(graph.protection).toBe("PRESENT");
    expect(graph.hedgeVerification).toBe("VERIFIED");
    expect(graph.sourceFlowId).toBe(flowId);
    const hedge = graph.representations.find((r) => r.role === "protection");
    expect(hedge?.quantity).toBe("0.44");
    expect(hedge?.usdValue).toBe(98.35);
    expect(hedge?.provenance).toBe("DEMO");
    expect(graph.protectedNotionalUsd).toBe(98.35);
    expect(graph.remainingExposureUsd).toBe(401.65);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
  });

  it("lets the latest COMPLETED flow win; incomplete flows never displace it", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const first = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, first.flowId, snapshot);
    approveProtectionProposal(store, { flowId: first.flowId, actor: "human" });
    await executeProtectionProposal(store, { flowId: first.flowId });
    // A newer flow that never completes must not hide the completed graph.
    const second = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, second.flowId, snapshot);
    const graph = getExposureGraph(store);
    expect(graph.sourceFlowId).toBe(first.flowId);
  });
});
