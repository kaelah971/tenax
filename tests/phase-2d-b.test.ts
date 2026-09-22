// Tenax Phase 2D-B — execution wiring integration tests (offline, no network).
//
// Covers the service/orchestrator boundary the interrupted run left
// untested: server-side mode resolution (DRY_RUN default, DEMO explicit,
// LIVE impossible), UI-issued approval as the authoritative approval,
// binding refusals (missing/stale/tampered/mandate/mode), client-override
// immunity, leverage refusal, single-submit idempotency + read-only
// reconcile, 00000 != FILLED, receipt provenance/wording, secret safety.
// Live Demo submission is NEVER exercised: all Bitget I/O is injected.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import { isDemoTradingMode, resolveExecutionMode } from "../src/lib/tenax/execution";
import type { DemoHedgeMarketState } from "../src/lib/tenax/demo-executor";
import {
  analyzeProtectionIntent,
  approveProtectionProposal,
  createDevStore,
  createProtectionIntent,
  executeInputSchema,
  executeProtectionProposal,
  getDecisionReceipt,
} from "../src/lib/tenax/index";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const CREDS = { apiKey: "test-api-key", secretKey: "test-secret-key", passphrase: "test-pass" };

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

const DEMO_MARKET: DemoHedgeMarketState = {
  category: "USDT-FUTURES",
  symbol: "NVDAUSDT",
  holdMode: "hedge_mode",
  nvdaSymbolConfigFound: true,
  marginMode: "crossed",
  configuredLeverage: "1",
  position: { ...EMPTY_NVIDIA_POSITION },
  instrument: INSTRUMENT,
  ticker: TICKER,
};

const PLACE_OK =
  '{"code":"00000","msg":"success","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo"}}';
const INFO_FILLED =
  '{"code":"00000","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo","orderStatus":"filled","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50","avgPrice":"201.5","cumExecQty":"0.50","cumExecValue":"100.75"}}';
const INFO_LIVE =
  '{"code":"00000","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo","orderStatus":"live","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50"}}';

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

function stubFetch(calls: string[], placeBody: string, infoBody: string) {
  return {
    write: async (url: string) => {
      calls.push(`POST ${url}`);
      return { status: 200, text: async () => placeBody };
    },
    read: async (url: string) => {
      calls.push(`GET ${url}`);
      return { status: 200, text: async () => infoBody };
    },
  };
}

const demoDeps = (calls: string[], infoBody: string = INFO_FILLED) => {
  const stubs = stubFetch(calls, PLACE_OK, infoBody);
  return {
    credentials: CREDS,
    baseUrl: "https://api.bitget.com",
    tradingMode: "demo",
    executionMode: "BITGET_DEMO" as const,
    marketReader: async () => DEMO_MARKET,
    writeFetchImpl: stubs.write,
    readFetchImpl: stubs.read,
    nowMs: Date.now(),
  };
};

let savedTenaxMode: string | undefined;
let savedTradingMode: string | undefined;

beforeEach(() => {
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

async function setupApprovedDryRun() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  approveProtectionProposal(store, { flowId, actor: "human" });
  return { store, flowId };
}

async function setupApprovedDemo() {
  process.env.TENAX_EXECUTION_MODE = "BITGET_DEMO";
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  const { approval } = approveProtectionProposal(store, { flowId, actor: "human" });
  return { store, flowId, approval };
}

describe("execution-mode resolution", () => {
  it("defaults to DRY_RUN when unconfigured", () => {
    expect(resolveExecutionMode({})).toBe("DRY_RUN");
    expect(resolveExecutionMode({ TENAX_EXECUTION_MODE: "" })).toBe("DRY_RUN");
    expect(resolveExecutionMode({ TENAX_EXECUTION_MODE: "DRY_RUN" })).toBe("DRY_RUN");
  });

  it("selects BITGET_DEMO only on the explicit value", () => {
    expect(resolveExecutionMode({ TENAX_EXECUTION_MODE: "BITGET_DEMO" })).toBe("BITGET_DEMO");
  });

  it("makes LIVE impossible: unknown values fall back to DRY_RUN", () => {
    for (const mode of ["LIVE", "live", "BITGET_LIVE", "REAL", "PROD", "demo"]) {
      expect(resolveExecutionMode({ TENAX_EXECUTION_MODE: mode })).toBe("DRY_RUN");
    }
  });

  it("requires the demo trading backend separately", () => {
    expect(isDemoTradingMode({ BITGET_TRADING_MODE: "demo" })).toBe(true);
    expect(isDemoTradingMode({ BITGET_TRADING_MODE: "DEMO" })).toBe(true);
    expect(isDemoTradingMode({})).toBe(false);
    expect(isDemoTradingMode({ BITGET_TRADING_MODE: "live" })).toBe(false);
    expect(isDemoTradingMode({ BITGET_TRADING_MODE: "" })).toBe(false);
  });
});

describe("approval binding at the service boundary", () => {
  it("executes DRY_RUN on a valid fresh UI approval", async () => {
    const { store, flowId } = await setupApprovedDryRun();
    const executed = await executeProtectionProposal(store, { flowId });
    expect(executed.executionMode).toBe("DRY_RUN");
    expect(executed.disclaimer).toBe("DRY_RUN — NO FUNDS MOVED");
  });

  it("refuses execution with no approval (MANDATE_PASS is not enough)", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    await expect(executeProtectionProposal(store, { flowId })).rejects.toThrow(/FLOW_REJECTED/);
  });

  it("refuses a stale approval", async () => {
    const { store, flowId } = await setupApprovedDryRun();
    const farFuture = Date.now() + 16 * 60 * 1000;
    await expect(
      executeProtectionProposal(store, { flowId }, { nowMs: farFuture }),
    ).rejects.toThrow(/stale/);
  });

  it("refuses a tampered proposal (hash mismatch)", async () => {
    const { store, flowId } = await setupApprovedDryRun();
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed: no analysis");
    (analysis as unknown as { proposal: { proposedTradeValueUsdt: number } }).proposal
      .proposedTradeValueUsdt = 120;
    await expect(executeProtectionProposal(store, { flowId })).rejects.toThrow(/FLOW_REJECTED/);
  });

  it("refuses when the recomputed mandate is REFUSE", async () => {
    const { store, flowId } = await setupApprovedDryRun();
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed: no analysis");
    (analysis as unknown as { proposal: { proposedTradeValueUsdt: number } }).proposal
      .proposedTradeValueUsdt = 200;
    await expect(executeProtectionProposal(store, { flowId })).rejects.toThrow(
      /recomputed mandate verdict is REFUSE/,
    );
  });

  it("refuses a mode mismatch: DRY_RUN approval cannot authorize BITGET_DEMO", async () => {
    const { store, flowId } = await setupApprovedDryRun();
    const calls: string[] = [];
    await expect(
      executeProtectionProposal(store, { flowId }, demoDeps(calls)),
    ).rejects.toThrow(/executionMode/);
    expect(calls).toEqual([]);
  });

  it("refuses a mode mismatch in reverse: DEMO approval cannot run DRY_RUN", async () => {
    const { store, flowId } = await setupApprovedDemo();
    delete process.env.TENAX_EXECUTION_MODE;
    await expect(executeProtectionProposal(store, { flowId })).rejects.toThrow(/executionMode/);
  });

  it("never trusts client-supplied qty/symbol/side/leverage", async () => {
    const { store, flowId } = await setupApprovedDryRun();
    const parsed = executeInputSchema.parse({
      flowId,
      qty: "999.99",
      symbol: "BTCUSDT",
      side: "buy",
      leverage: 50,
    } as unknown as { flowId: string });
    expect(parsed).toEqual({ flowId });
    const executed = await executeProtectionProposal(store, { flowId });
    expect(executed.executionMode).toBe("DRY_RUN");
    if (executed.executionMode !== "DRY_RUN") throw new Error("expected DRY_RUN request shape");
    expect(executed.request.symbol).toBe("NVDAUSDT");
    expect(executed.request.category).toBe("USDT-FUTURES");
    expect(executed.request.side).toBe("sell");
    expect(executed.request.qty).not.toBe("999.99");
  });
});

describe("BITGET_DEMO execution (injected I/O only)", () => {
  it("submits once: exact NVDAUSDT short body, 1x crossed, virtual funds", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    let transmitted = "";
    const deps = demoDeps(calls);
    const executed = await executeProtectionProposal(store, { flowId }, {
      ...deps,
      writeFetchImpl: (async (url: string, init: { body: string }) => {
        calls.push(`POST ${url}`);
        transmitted = init.body;
        return { status: 200, text: async () => PLACE_OK };
      }) as typeof deps.writeFetchImpl,
    });
    expect(executed.executionMode).toBe("BITGET_DEMO");
    expect(executed.disclaimer).toBe("DEMO ORDER — VIRTUAL FUNDS ONLY");
    expect(JSON.parse(transmitted)).toMatchObject({
      category: "USDT-FUTURES",
      symbol: "NVDAUSDT",
      side: "sell",
      posSide: "short",
      orderType: "market",
    });
    expect(transmitted).not.toContain("marginMode");
    expect(transmitted).not.toContain("leverage");
    if (!("orderId" in executed)) throw new Error("expected Demo execution shape");
    expect(executed.orderId).toBe("demo-oid-111");
    expect(executed.filled).toBe(true);
    expect(executed.orderStatus).toBe("filled");
    const posts = calls.filter((c) => c.startsWith("POST"));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("/api/v3/trade/place-order");
  });

  it("treats 00000 as SUBMITTED, not FILLED, until order-info confirms", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    const executed = await executeProtectionProposal(store, { flowId }, demoDeps(calls, INFO_LIVE));
    if (!("orderId" in executed)) throw new Error("expected Demo execution shape");
    expect(executed.orderStatus).toBe("live");
    expect(executed.filled).toBe(false);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
  });

  it("refuses leverage != 1 without writing", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    const deps = demoDeps(calls);
    await expect(
      executeProtectionProposal(store, { flowId }, {
        ...deps,
        marketReader: async () => ({ ...DEMO_MARKET, configuredLeverage: "5" }),
      }),
    ).rejects.toThrow(/leverage_one/);
    expect(calls).toEqual([]);
  });

  it("refuses without the demo trading backend", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    const deps = demoDeps(calls);
    await expect(
      executeProtectionProposal(store, { flowId }, { ...deps, tradingMode: "live" }),
    ).rejects.toThrow(/BITGET_TRADING_MODE=demo/);
    expect(calls).toEqual([]);
  });

  it("refuses without server-side credentials and never writes", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    const deps = demoDeps(calls);
    await expect(
      executeProtectionProposal(store, { flowId }, { ...deps, credentials: undefined }),
    ).rejects.toThrow(/credentials/);
    expect(calls).toEqual([]);
  });

  it("duplicate Execute submits once and reconciles the stored record", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    const first = await executeProtectionProposal(store, { flowId }, demoDeps(calls));
    if (!("orderId" in first)) throw new Error("expected Demo execution shape");
    const second = await executeProtectionProposal(store, { flowId }, demoDeps(calls));
    if (!("orderId" in second)) throw new Error("expected Demo execution shape");
    expect(second.orderId).toBe(first.orderId);
    expect(second.clientOid).toBe(first.clientOid);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
  });

  it("retry refreshes status read-only: live -> filled without a second POST", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    const first = await executeProtectionProposal(store, { flowId }, demoDeps(calls, INFO_LIVE));
    if (!("filled" in first)) throw new Error("expected Demo execution shape");
    expect(first.filled).toBe(false);
    const postsBefore = calls.filter((c) => c.startsWith("POST")).length;
    const second = await executeProtectionProposal(store, { flowId }, demoDeps(calls, INFO_FILLED));
    if (!("filled" in second)) throw new Error("expected Demo execution shape");
    expect(second.filled).toBe(true);
    expect(second.orderStatus).toBe("filled");
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(postsBefore);
  });
});

describe("receipt provenance and wording", () => {
  it("emits an honest DRY_RUN receipt: no funds, would-be request", async () => {
    const { store, flowId } = await setupApprovedDryRun();
    await executeProtectionProposal(store, { flowId });
    const { receipt } = getDecisionReceipt(store, flowId);
    expect(receipt.executionMode).toBe("DRY_RUN");
    expect(receipt.fundsMoved).toBe(false);
    expect(receipt.demoExecution).toBeUndefined();
    expect(receipt.evidenceRefs.join(" ")).toContain("execution=DRY_RUN");
    expect(JSON.stringify(receipt)).not.toMatch(/orderId|transactionHash|executed successfully/i);
  });

  it("emits a truthful BITGET_DEMO receipt: virtual funds, 1x crossed, order facts", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    await executeProtectionProposal(store, { flowId }, demoDeps(calls));
    const { receipt } = getDecisionReceipt(store, flowId);
    expect(receipt.executionMode).toBe("BITGET_DEMO");
    expect(receipt.fundsMoved).toBe(true);
    expect(receipt.demoExecution).toMatchObject({
      orderId: "demo-oid-111",
      leverage: "1x",
      marginMode: "crossed",
      approvedNotionalUsdt: 100,
      fundsDisclaimer: "DEMO ORDER — VIRTUAL FUNDS ONLY",
    });
    expect(receipt.demoExecution?.filled).toBe(true);
    expect(receipt.demoExecution?.avgPrice).toBe("201.5");
    expect(receipt.evidenceRefs.join(" ")).toContain("execution=BITGET_DEMO");
    if (!("qty" in receipt.request) || receipt.request.mode !== "BITGET_DEMO") {
      throw new Error("expected Demo order request shape");
    }
    expect(receipt.request.symbol).toBe("NVDAUSDT");
  });

  it("never serializes secrets, signatures, or headers", async () => {
    const { store, flowId } = await setupApprovedDemo();
    const calls: string[] = [];
    const executed = await executeProtectionProposal(store, { flowId }, demoDeps(calls));
    const { receipt } = getDecisionReceipt(store, flowId);
    const serialized = JSON.stringify({ executed, receipt });
    for (const secret of [
      "test-secret-key",
      "test-pass",
      "ACCESS-SIGN",
      "ACCESS-KEY",
      "ACCESS-PASSPHRASE",
      "Authorization",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    // The API key itself must never be echoed either.
    expect(serialized).not.toContain("test-api-key");
  });
});
