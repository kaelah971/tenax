// Tenax Phase 4B-B2.1 — canonical protection-action regression tests.
// Proves preview and execution share one NVDAUSDT derivation: Reality
// evidence may carry RNVDAUSDT, but no execution request ever does.
// All Bitget I/O is injected; zero provider writes occur here.
import { beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import {
  deriveCanonicalProtectionAction,
  type DemoHedgeMarketState,
} from "../src/lib/tenax/demo-executor";
import { NVDA_EXPOSURE_FIXTURE } from "../src/lib/tenax/fixtures";
import {
  __resetStandingMandateCounterForTests,
  activateStandingMandate,
  createStandingMandate,
  evaluateStandingAuthority,
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

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

async function setupPassFlow() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  return { store, flowId };
}

function setupActiveMandate(store: ReturnType<typeof createDevStore>) {
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 5 },
    NOW,
  );
  return activateStandingMandateRecord(store, { id: created.id }, NOW);
}

beforeEach(() => {
  __resetStandingMandateCounterForTests();
});

describe("canonical protection action", () => {
  it("resolves NVDAUSDT even though exposure evidence is RNVDAUSDT", () => {
    expect(NVDA_EXPOSURE_FIXTURE.representation.symbol).toBe("RNVDAUSDT");
    const action = deriveCanonicalProtectionAction(
      { underlying: "NVDA", protectionPct: 20, proposedTradeValueUsdt: 100, leverageUsed: 1 },
      INSTRUMENT,
      TICKER,
    );
    expect(action).toEqual({
      symbol: "NVDAUSDT",
      category: "USDT-FUTURES",
      side: "sell",
      posSide: "short",
      orderType: "market",
      qty: "0.50",
    });
  });

  it("invents no qty when instrument rules are missing", () => {
    expect(() =>
      deriveCanonicalProtectionAction(
        { underlying: "NVDA", protectionPct: 20, proposedTradeValueUsdt: 100, leverageUsed: 1 },
        null,
        null,
      ),
    ).toThrow(/ACTION_UNEVALUABLE/);
  });
});

describe("standing authority binds the hedge symbol", () => {
  function activeMandate() {
    return activateStandingMandate(
      createStandingMandate(
        {
          maxProtectionPct: 30,
          maxNotionalUsdt: 150,
          maxLeverage: 1,
          allowedSymbols: ["NVDAUSDT"],
          allowedActionTypes: ["SHORT_HEDGE"],
          authorityMode: "AUTO_WITHIN_MANDATE",
          maxExecutions: 1,
        },
        NOW,
      ),
      NOW,
    );
  }

  function baseAction(overrides: Record<string, unknown> = {}) {
    return {
      subjectId: "NVDA",
      intentType: "PROTECT_EVENT_RISK",
      protectionPct: 20,
      notionalUsdt: 100,
      leverage: 1,
      symbol: "NVDAUSDT",
      actionType: "SHORT_HEDGE",
      requestsSellUnderlying: false,
      requestsTransfer: false,
      requestsLeverageChange: false,
      proposalAtMs: NOW,
      ...overrides,
    };
  }

  it("authorizes NVDAUSDT and refuses RNVDAUSDT in every mode", () => {
    for (const mode of ["AUTO_WITHIN_MANDATE", "AUTO_WITH_ESCALATION", "REVIEW_EVERY_ACTION"] as const) {
      const mandate = activateStandingMandate(
        createStandingMandate(
          {
            maxProtectionPct: 30,
            maxNotionalUsdt: 150,
            maxLeverage: 1,
            allowedSymbols: ["NVDAUSDT"],
            allowedActionTypes: ["SHORT_HEDGE"],
            authorityMode: mode,
            maxExecutions: 1,
          },
          NOW,
        ),
        NOW,
      );
      const allowed = evaluateStandingAuthority(mandate, baseAction(), NOW);
      expect(allowed.decision).toBe(mode === "REVIEW_EVERY_ACTION" ? "ESCALATE" : "AUTHORIZED");
      const refused = evaluateStandingAuthority(
        mandate,
        baseAction({ symbol: "RNVDAUSDT" }),
        NOW,
      );
      expect(refused.decision).toBe("REFUSED");
      expect(refused.failedRules).toContain("symbol_not_allowed");
    }
    expect(activeMandate().policy.allowedSymbols).toEqual(["NVDAUSDT"]);
  });
});

describe("autonomous preview matches executable intent", () => {
  it("DRY_RUN preview uses NVDAUSDT with market-derived qty", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      { marketReader: async () => DEMO_MARKET },
    );
    expect(result.outcome).toBe("EXECUTED");
    if (result.outcome !== "EXECUTED" || result.executionMode !== "DRY_RUN") {
      throw new Error("expected DRY_RUN execution");
    }
    expect(result.request.symbol).toBe("NVDAUSDT");
    expect(result.request.category).toBe("USDT-FUTURES");
    expect(result.request.side).toBe("sell");
    expect(result.request.posSide).toBe("short");
    expect(result.request.orderType).toBe("market");
    expect(result.request.qty).toBe("0.50");
  });

  it("preview and submission agree field-for-field on identical state", async () => {
    const previewCalls: string[] = [];
    const previewStore = createDevStore();
    const previewSnapshot = await testSnapshot();
    const previewCreated = createProtectionIntent(previewStore, { rawText: RAW_TEXT });
    analyzeProtectionIntent(previewStore, previewCreated.flowId, previewSnapshot);
    const previewMandate = setupActiveMandate(previewStore);
    const preview = await runProtectionAgentCycle(
      previewStore,
      { flowId: previewCreated.flowId },
      { marketReader: async () => DEMO_MARKET },
    );
    expect(preview.outcome).toBe("EXECUTED");
    if (preview.outcome !== "EXECUTED" || preview.executionMode !== "DRY_RUN") {
      throw new Error("expected DRY_RUN preview");
    }
    expect(previewMandate).toBeDefined();
    expect(previewCalls).toEqual([]);

    const execCalls: string[] = [];
    const stubs = stubFetch(execCalls);
    const execStore = createDevStore();
    const execSnapshot = await testSnapshot();
    const execCreated = createProtectionIntent(execStore, { rawText: RAW_TEXT });
    analyzeProtectionIntent(execStore, execCreated.flowId, execSnapshot);
    setupActiveMandate(execStore);
    const executed = await runProtectionAgentCycle(
      execStore,
      { flowId: execCreated.flowId },
      {
        credentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
        baseUrl: "https://api.bitget.com",
        tradingMode: "demo",
        executionMode: "BITGET_DEMO",
        marketReader: async () => DEMO_MARKET,
        writeFetchImpl: stubs.write,
        readFetchImpl: stubs.read,
      },
    );
    expect(executed.outcome).toBe("EXECUTED");
    if (executed.outcome !== "EXECUTED" || executed.executionMode !== "BITGET_DEMO") {
      throw new Error("expected BITGET_DEMO execution");
    }
    expect({
      symbol: "NVDAUSDT",
      category: "USDT-FUTURES",
      side: "sell",
      posSide: "short",
      orderType: "market",
      qty: executed.qty,
    }).toEqual({
      symbol: preview.request.symbol,
      category: preview.request.category,
      side: preview.request.side,
      posSide: preview.request.posSide,
      orderType: preview.request.orderType,
      qty: preview.request.qty,
    });
    expect(execCalls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
  });

  it("refuses a wrong-symbol market with zero POSTs", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    const stubs = stubFetch(calls);
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      {
        credentials: { apiKey: "k", secretKey: "s", passphrase: "p" },
        baseUrl: "https://api.bitget.com",
        tradingMode: "demo",
        executionMode: "BITGET_DEMO",
        marketReader: async () => ({ ...DEMO_MARKET, symbol: "RNVDAUSDT" }),
        writeFetchImpl: stubs.write,
        readFetchImpl: stubs.read,
      },
    );
    expect(result.outcome).toBe("FAILED");
    expect(calls).toEqual([]);
  });
});
