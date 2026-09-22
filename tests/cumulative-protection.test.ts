// Tenax Phase 4B-B2.2 — cumulative protection gate tests (offline).
//
// Covers: pure projection math (zero/existing/boundary/over), fail-closed
// unknowns (unreadable/unvalued/opposite), the DEMO-only service gate with
// zero POSTs and zero budget draw on refusal, DRY_RUN preview immunity,
// retry idempotency, unlinked-position graph truth, and secret-free
// results. Live Bitget submission is NEVER exercised: all I/O injected.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaPosition, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { DemoHedgeMarketState } from "../src/lib/tenax/demo-executor";
import { evaluateCumulativeProtection } from "../src/lib/tenax/cumulative";
import { protectionLegDisplay } from "../src/lib/tenax/visuals";
import {
  __resetStandingMandateCounterForTests,
} from "../src/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const CREDS = { apiKey: "test-api-key", secretKey: "test-secret-key", passphrase: "test-pass" };
const NOW = Date.parse("2026-09-21T12:00:00.000Z");

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
  lastPrice: "200",
  markPrice: "200",
  indexPrice: "200",
  bidPrice: null,
  askPrice: null,
  fundingRate: null,
  updatedAt: null,
};

function shortPosition(size: string, mark: string | null): NvdaPosition {
  return {
    hasPosition: true,
    side: "short",
    size,
    leverage: "1",
    marginMode: "crossed",
    markPrice: mark,
    avgPrice: "223.53",
  };
}

function marketWith(position: NvdaPosition | null): DemoHedgeMarketState {
  return {
    category: "USDT-FUTURES",
    symbol: "NVDAUSDT",
    holdMode: "hedge_mode",
    nvdaSymbolConfigFound: true,
    marginMode: "crossed",
    configuredLeverage: "1",
    position,
    instrument: INSTRUMENT,
    ticker: TICKER,
  };
}

const PLACE_OK =
  '{"code":"00000","msg":"success","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo"}}';
const INFO_FILLED =
  '{"code":"00000","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo","orderStatus":"filled","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50","avgPrice":"201.5","cumExecQty":"0.50","cumExecValue":"100.75"}}';

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

function stubFetch(calls: string[]) {
  return {
    write: async (url: string) => {
      calls.push(`POST ${url}`);
      return { status: 200, text: async () => PLACE_OK };
    },
    read: async (url: string) => {
      calls.push(`GET ${url}`);
      return { status: 200, text: async () => INFO_FILLED };
    },
  };
}

let savedTenaxMode: string | undefined;
let savedTradingMode: string | undefined;

beforeEach(() => {
  __resetStandingMandateCounterForTests();
  savedTenaxMode = process.env.TENAX_EXECUTION_MODE;
  savedTradingMode = process.env.BITGET_TRADING_MODE;
  delete process.env.TENAX_EXECUTION_MODE;
  delete process.env.BITGET_TRADING_MODE;
});

afterEach(() => {
  if (savedTenaxMode === undefined) delete process.env.TENAX_EXECUTION_MODE;
  else process.env.TENAX_EXECUTION_MODE = savedTenaxMode;
  if (savedTradingMode === undefined) delete process.env.BITGET_TRADING_MODE;
  else process.env.BITGET_TRADING_MODE = savedTradingMode;
});

/** Golden MANDATE_PASS flow (fixture analysis, 20%/$100). */
async function setupPassFlow() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  return { store, flowId };
}

/** Activate an AUTO_WITHIN_MANDATE budget-3 mandate (room for consumes). */
function setupActiveMandate(store: ReturnType<typeof createDevStore>) {
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 3 },
    NOW,
  );
  return activateStandingMandateRecord(store, { id: created.id }, NOW);
}

function demoDeps(calls: string[], position: NvdaPosition | null) {
  const stubs = stubFetch(calls);
  return {
    credentials: CREDS,
    baseUrl: "https://api.bitget.com",
    tradingMode: "demo",
    executionMode: "BITGET_DEMO" as const,
    marketReader: async () => marketWith(position),
    writeFetchImpl: stubs.write,
    readFetchImpl: stubs.read,
    nowMs: Date.now(),
  };
}

describe("cumulative projection math", () => {
  it("projects zero existing plus 20% within bounds", () => {
    const result = evaluateCumulativeProtection({
      grossExposureUsd: 500,
      existingPosition: { ...EMPTY_NVIDIA_POSITION },
      proposedAdditionalUsd: 100,
      maxProtectionPct: 30,
    });
    expect(result.passes).toBe(true);
    expect(result.existingUsd).toBe(0);
    expect(result.projectedUsd).toBe(100);
    expect(result.projectedPct).toBe(20);
    expect(result.reasonCode).toBe("within_projected_mandate");
  });

  it("refuses ~$99 existing plus $100 against a 30% ceiling", () => {
    const result = evaluateCumulativeProtection({
      grossExposureUsd: 500,
      existingPosition: shortPosition("0.44", "225"),
      proposedAdditionalUsd: 100,
      maxProtectionPct: 30,
    });
    expect(result.passes).toBe(false);
    expect(result.existingUsd).toBe(99);
    expect(result.projectedUsd).toBe(199);
    expect(result.projectedPct).toBeCloseTo(39.8, 2);
    expect(result.reasonCode).toBe("projected_protection_exceeds_mandate");
  });

  it("passes the exact 30% projected boundary", () => {
    const result = evaluateCumulativeProtection({
      grossExposureUsd: 500,
      existingPosition: shortPosition("0.25", "200"),
      proposedAdditionalUsd: 100,
      maxProtectionPct: 30,
    });
    expect(result.passes).toBe(true);
    expect(result.projectedUsd).toBe(150);
    expect(result.projectedPct).toBe(30);
  });

  it("fails closed on unreadable, unvalued, opposite, and invalid inputs", () => {
    const base = {
      grossExposureUsd: 500,
      existingPosition: { ...EMPTY_NVIDIA_POSITION },
      proposedAdditionalUsd: 100,
      maxProtectionPct: 30,
    };
    expect(
      evaluateCumulativeProtection({ ...base, existingPosition: null }).reasonCode,
    ).toBe("position_unreadable");
    expect(
      evaluateCumulativeProtection({
        ...base,
        existingPosition: shortPosition("0.44", null),
      }).reasonCode,
    ).toBe("position_unvalued");
    expect(
      evaluateCumulativeProtection({
        ...base,
        existingPosition: { ...shortPosition("0.44", "225"), side: "long" },
      }).reasonCode,
    ).toBe("opposite_position");
    expect(
      evaluateCumulativeProtection({
        ...base,
        existingPosition: { ...shortPosition("0.44", "225"), side: null },
      }).reasonCode,
    ).toBe("opposite_position");
    expect(
      evaluateCumulativeProtection({ ...base, grossExposureUsd: 0 }).reasonCode,
    ).toBe("invalid_inputs");
    for (const bad of [
      evaluateCumulativeProtection({ ...base, existingPosition: null }),
      evaluateCumulativeProtection({
        ...base,
        existingPosition: { ...shortPosition("0.44", "225"), side: "long" },
      }),
    ]) {
      expect(bad.passes).toBe(false);
      expect(bad.projectedUsd).toBeNull();
      expect(bad.projectedPct).toBeNull();
    }
  });
});

describe("agent-cycle cumulative gate (DEMO writes only)", () => {
  it("executes when no existing short is present", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("EXECUTED");
    if (result.outcome !== "EXECUTED" || result.executionMode !== "BITGET_DEMO") {
      throw new Error("expected BITGET_DEMO execution");
    }
    expect(result.submitted).toBe(true);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(1);
  });

  it("refuses ~$99 existing plus $100 with zero POSTs and zero budget draw", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, shortPosition("0.44", "225")),
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.cumulative).toMatchObject({
      existingUsd: 99,
      proposedUsd: 100,
      projectedUsd: 199,
      maxPct: 30,
      reasonCode: "projected_protection_exceeds_mandate",
    });
    expect(result.cumulative?.projectedPct).toBeCloseTo(39.8, 2);
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
    const refused = store.activities.filter((a) => a.type === "STANDING_AUTHORITY_REFUSED");
    expect(refused).toHaveLength(1);
  });

  it("fails closed when the position read fails", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const stubs = stubFetch([]);
    const throwingCalls: string[] = [];
    const throwingReader = async (): Promise<DemoHedgeMarketState> => {
      throwingCalls.push("READ");
      throw new Error("transport down");
    };
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      {
        credentials: CREDS,
        baseUrl: "https://api.bitget.com",
        tradingMode: "demo",
        executionMode: "BITGET_DEMO" as const,
        marketReader: throwingReader,
        writeFetchImpl: stubs.write,
        readFetchImpl: stubs.read,
        nowMs: Date.now(),
      },
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.cumulative?.reasonCode).toBe("position_unreadable");
    expect(throwingCalls).toEqual(["READ"]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
  });

  it("fails closed on an unexpected long position", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...shortPosition("0.44", "225"), side: "long" }),
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.cumulative?.reasonCode).toBe("opposite_position");
    expect(calls).toEqual([]);
  });

  it("DRY_RUN previews skip the live-state gate and move nothing", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("EXECUTED");
    if (result.outcome !== "EXECUTED" || result.executionMode !== "DRY_RUN") {
      throw new Error("expected DRY_RUN execution");
    }
    expect(result.submitted).toBe(false);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
  });

  it("refused retries stay idempotent with no consumption", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const first: string[] = [];
    const one = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(first, shortPosition("0.44", "225")),
    );
    const second: string[] = [];
    const two = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(second, shortPosition("0.44", "225")),
    );
    expect(one.outcome).toBe("STANDING_REFUSED");
    expect(two.outcome).toBe("STANDING_REFUSED");
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
  });

  it("serializes the refusal with no secret material", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, shortPosition("0.44", "225")),
    );
    const serialized = JSON.stringify(result);
    for (const fragment of ["test-api-key", "test-secret-key", "test-pass", "Bearer ", "ACCESS-SIGN", "paptrading"]) {
      expect(serialized).not.toContain(fragment);
    }
  });
});

describe("protection-leg presence truth", () => {
  it("labels receipt, unlinked-live, and absent states distinctly", () => {
    expect(protectionLegDisplay(true, true)).toBe("LINKED");
    expect(protectionLegDisplay(true, false)).toBe("LINKED");
    expect(protectionLegDisplay(false, true)).toBe("UNLINKED");
    expect(protectionLegDisplay(false, false)).toBe("ABSENT");
  });

  it("creates no receipt association for unlinked live positions", async () => {
    const { store, flowId } = await setupPassFlow();
    // No execution ran: no receipt exists, so nothing can be linked.
    expect(() => store.flows.get(flowId)?.getReceipt()).toThrow();
    expect(store.flows.get(flowId)?.getContext().demoExecution).toBeNull();
  });
});
