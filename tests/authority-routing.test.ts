// Tenax Phase 4B-B4 — authority mode routing tests (offline).
//
// Proves the three standing-mandate modes behave distinctly end to end:
// REVIEW never auto-submits but approves through the normal one-time
// human flow; WITHIN auto-executes in bounds and hard-refuses outside;
// ESCALATION auto-executes in bounds and routes out-of-bounds (standing
// or cumulative) to human review without POSTs, budget draw, or mandate
// mutation; hard failures (unreadable/opposite state, forbidden actions)
// refuse in every mode. All provider I/O is injected fakes — no network,
// no orders, no live calls.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaPosition, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { DemoHedgeMarketState } from "../src/lib/tenax/demo-executor";
import { classifyCumulativeRoute } from "../src/lib/tenax/cumulative";
import { evaluateCumulativeProtection } from "../src/lib/tenax/cumulative";
import {
  __resetStandingMandateCounterForTests,
  classifyStandingRoute,
  evaluateStandingAuthority,
  type StandingAuthorityAction,
  type StandingAuthorityMode,
} from "../src/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  approveProtectionProposal,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  executeProtectionProposal,
  getDecisionReceipt,
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

/** Golden MANDATE_PASS flow (fixture analysis, 20%/$100, 1x, NVDA). */
async function setupPassFlow() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  return { store, flowId };
}

function setupMandate(
  store: ReturnType<typeof createDevStore>,
  policy: {
    authorityMode: StandingAuthorityMode;
    maxProtectionPct?: number;
    maxNotionalUsdt?: number;
    maxExecutions?: number;
  },
) {
  const created = createStandingMandateRecord(
    store,
    {
      authorityMode: policy.authorityMode,
      maxProtectionPct: policy.maxProtectionPct ?? 30,
      maxNotionalUsdt: policy.maxNotionalUsdt ?? 150,
      maxExecutions: policy.maxExecutions ?? 3,
    },
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

describe("cumulative routing classification", () => {
  it("escalates only over-limit projections, never unknowns", () => {
    expect(classifyCumulativeRoute("projected_protection_exceeds_mandate")).toBe("ESCALATABLE");
    for (const code of [
      "position_unreadable",
      "position_unvalued",
      "opposite_position",
      "invalid_inputs",
    ] as const) {
      expect(classifyCumulativeRoute(code)).toBe("HARD_REFUSAL");
    }
  });

  it("evaluates cumulative overflow against the standing policy ceiling", () => {
    // 20% proposal against a 15% standing max: over even with no existing.
    const result = evaluateCumulativeProtection({
      grossExposureUsd: 500,
      existingPosition: { ...EMPTY_NVIDIA_POSITION },
      proposedAdditionalUsd: 100,
      maxProtectionPct: 15,
    });
    expect(result.passes).toBe(false);
    expect(result.projectedPct).toBe(20);
    expect(result.reasonCode).toBe("projected_protection_exceeds_mandate");
  });
});

describe("standing routing classification", () => {
  it("escalates only user-authority boundary conflicts", () => {
    expect(classifyStandingRoute(["exceeds_max_protection_pct"])).toBe("AUTHORITY_BOUNDARY");
    expect(classifyStandingRoute(["exceeds_max_notional"])).toBe("AUTHORITY_BOUNDARY");
    expect(
      classifyStandingRoute(["exceeds_max_protection_pct", "exceeds_max_notional"]),
    ).toBe("AUTHORITY_BOUNDARY");
  });

  it("treats the ordinary review path as in-bounds, never an escalation", () => {
    expect(classifyStandingRoute(["human_review_required"])).toBe("IN_BOUNDS");
    expect(classifyStandingRoute([])).toBe("IN_BOUNDS");
  });

  it("hard-refuses every safety/validity reason, even mixed with bounds", () => {
    for (const codes of [
      ["proposal_stale"],
      ["exceeds_max_leverage"],
      ["forbidden_spot_sale"],
      ["forbidden_transfer"],
      ["forbidden_leverage_change"],
      ["subject_mismatch"],
      ["symbol_not_allowed"],
      ["action_not_allowed"],
      ["mandate_expired"],
      ["mandate_exhausted"],
      ["something_unknown"],
      ["exceeds_max_protection_pct", "proposal_stale"],
      ["human_review_required", "proposal_stale"],
    ] as const) {
      expect(classifyStandingRoute([...codes])).toBe("SAFETY_REFUSAL");
    }
  });
});

describe("stale evidence never escalates", () => {
  // Age the cycle 20 minutes past analysis (freshness bound is 15).
  const staleNowMs = () => Date.now() + 20 * 60 * 1000;

  function staleDemoDeps(calls: string[], position: NvdaPosition | null) {
    const deps = demoDeps(calls, position);
    return { ...deps, nowMs: staleNowMs() };
  }

  it("refuses stale proposals under AUTO_WITH_ESCALATION with zero side effects", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, { authorityMode: "AUTO_WITH_ESCALATION" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      staleDemoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.evaluation.failedRules).toContain("proposal_stale");
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
    expect(store.flows.get(flowId)?.getContext().standingEscalation).toBeNull();
    expect(
      store.activities.some(
        (a) => a.type === "STANDING_AUTHORITY_ESCALATED" && a.flowId === flowId,
      ),
    ).toBe(false);
  });

  it("refuses stale proposals under REVIEW instead of requesting approval", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "REVIEW_EVERY_ACTION" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      staleDemoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    expect(calls).toEqual([]);
  });

  it("refuses stale proposals under AUTO_WITHIN_MANDATE", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "AUTO_WITHIN_MANDATE" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      staleDemoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.evaluation.failedRules).toContain("proposal_stale");
    expect(calls).toEqual([]);
  });

  it("still escalates genuine boundary conflicts under AUTO_WITH_ESCALATION", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "AUTO_WITH_ESCALATION", maxProtectionPct: 15 });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]);
  });
});

describe("REVIEW_EVERY_ACTION", () => {
  it("returns HUMAN_APPROVAL_REQUIRED in-bounds with zero POSTs and no record", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, { authorityMode: "REVIEW_EVERY_ACTION" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_REVIEW");
    if (result.outcome !== "STANDING_REVIEW") throw new Error("expected STANDING_REVIEW");
    expect(result.note).toBe("HUMAN APPROVAL REQUIRED");
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.flows.get(flowId)?.getContext().standingEscalation).toBeNull();
    expect(
      store.activities.some((a) => a.type === "STANDING_REVIEW_REQUIRED" && a.flowId === flowId),
    ).toBe(true);
  });

  it("skips the live position read entirely (no auto evaluation to fail)", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "REVIEW_EVERY_ACTION" });
    const stubs = stubFetch([]);
    const reads: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      {
        credentials: CREDS,
        baseUrl: "https://api.bitget.com",
        tradingMode: "demo",
        executionMode: "BITGET_DEMO" as const,
        marketReader: async () => {
          reads.push("READ");
          throw new Error("must not be read");
        },
        writeFetchImpl: stubs.write,
        readFetchImpl: stubs.read,
        nowMs: Date.now(),
      },
    );
    expect(result.outcome).toBe("STANDING_REVIEW");
    expect(reads).toEqual([]);
  });

  it("executes through the normal one-time approval with HUMAN_APPROVAL source", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, { authorityMode: "REVIEW_EVERY_ACTION" });
    const before = JSON.stringify(store.mandates.get(mandate.id)?.policy);
    process.env.TENAX_EXECUTION_MODE = "BITGET_DEMO";
    process.env.BITGET_TRADING_MODE = "demo";
    try {
      const approved = approveProtectionProposal(store, { flowId, actor: "human" });
      expect(approved.approval.state).toBe("APPROVED");
      const stubs = stubFetch([]);
      const executed = await executeProtectionProposal(
        store,
        { flowId },
        {
          credentials: CREDS,
          baseUrl: "https://api.bitget.com",
          tradingMode: "demo",
          executionMode: "BITGET_DEMO" as const,
          marketReader: async () => marketWith({ ...EMPTY_NVIDIA_POSITION }),
          writeFetchImpl: stubs.write,
          readFetchImpl: stubs.read,
          nowMs: Date.now(),
        },
      );
      expect(executed.submitted).toBe(true);
      const { receipt } = getDecisionReceipt(store, flowId);
      expect(receipt.authoritySource).toBe("HUMAN_APPROVAL");
      expect(receipt.standingMandateId).toBeNull();
      expect(receipt.standingEscalation ?? null).toBeNull();
    } finally {
      delete process.env.TENAX_EXECUTION_MODE;
      delete process.env.BITGET_TRADING_MODE;
    }
    // Review approval never touches the standing budget or policy.
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(JSON.stringify(store.mandates.get(mandate.id)?.policy)).toBe(before);
  });
});

describe("AUTO_WITHIN_MANDATE", () => {
  it("auto-executes inside bounds with STANDING_MANDATE source", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, { authorityMode: "AUTO_WITHIN_MANDATE" });
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
    expect(result.authority.authoritySource).toBe("STANDING_MANDATE");
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(1);
  });

  it("refuses outside pct with zero POSTs and zero consumption", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, {
      authorityMode: "AUTO_WITHIN_MANDATE",
      maxProtectionPct: 15,
    });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
  });

  it("refuses outside notional with zero POSTs", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "AUTO_WITHIN_MANDATE", maxNotionalUsdt: 50 });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.evaluation.failedRules).toContain("exceeds_max_notional");
    expect(calls).toEqual([]);
  });

  it("refuses cumulative overflow against the policy ceiling", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, { authorityMode: "AUTO_WITHIN_MANDATE" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, shortPosition("0.44", "225")),
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.cumulative?.reasonCode).toBe("projected_protection_exceeds_mandate");
    expect(result.cumulative?.maxPct).toBe(30);
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
  });
});

describe("AUTO_WITH_ESCALATION", () => {
  it("auto-executes inside bounds exactly like WITHIN", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, { authorityMode: "AUTO_WITH_ESCALATION" });
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
    expect(result.authority.authoritySource).toBe("STANDING_MANDATE");
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(1);
  });

  it("escalates outside pct with conflict, record, and zero POSTs", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, {
      authorityMode: "AUTO_WITH_ESCALATION",
      maxProtectionPct: 15,
    });
    const before = JSON.stringify({
      policy: store.mandates.get(mandate.id)?.policy,
      hash: store.mandates.get(mandate.id)?.mandateHash,
    });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_ESCALATE");
    if (result.outcome !== "STANDING_ESCALATE") throw new Error("expected STANDING_ESCALATE");
    expect(result.note).toBe("HUMAN REVIEW REQUIRED");
    expect(result.conflict).toMatchObject({
      proposedPct: 20,
      proposedUsd: 100,
      maxPct: 15,
      maxNotional: 150,
    });
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
    expect(
      JSON.stringify({
        policy: store.mandates.get(mandate.id)?.policy,
        hash: store.mandates.get(mandate.id)?.mandateHash,
      }),
    ).toBe(before);
    const record = store.flows.get(flowId)?.getContext().standingEscalation;
    expect(record).toMatchObject({
      mandateId: mandate.id,
      proposedProtectionPct: 20,
      proposedTradeValueUsdt: 100,
    });
    expect(record?.reasonCodes).toContain("exceeds_max_protection_pct");
  });

  it("escalates outside notional with zero POSTs", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "AUTO_WITH_ESCALATION", maxNotionalUsdt: 50 });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("STANDING_ESCALATE");
    if (result.outcome !== "STANDING_ESCALATE") throw new Error("expected STANDING_ESCALATE");
    expect(result.conflict).toMatchObject({ maxNotional: 50 });
    expect(result.evaluation.reasonCodes).toContain("exceeds_max_notional");
    expect(calls).toEqual([]);
  });

  it("escalates cumulative overflow with payload and zero POSTs", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, { authorityMode: "AUTO_WITH_ESCALATION" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, shortPosition("0.44", "225")),
    );
    expect(result.outcome).toBe("STANDING_ESCALATE");
    if (result.outcome !== "STANDING_ESCALATE") throw new Error("expected STANDING_ESCALATE");
    expect(result.cumulative?.reasonCode).toBe("projected_protection_exceeds_mandate");
    expect(result.cumulative?.existingUsd).toBe(99);
    expect(result.cumulative?.projectedUsd).toBe(199);
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(
      store.flows.get(flowId)?.getContext().standingEscalation?.reasonCodes,
    ).toContain("projected_protection_exceeds_mandate");
  });

  it("stays idempotent across escalation retries", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, {
      authorityMode: "AUTO_WITH_ESCALATION",
      maxProtectionPct: 15,
    });
    const first: string[] = [];
    const one = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(first, { ...EMPTY_NVIDIA_POSITION }),
    );
    const second: string[] = [];
    const two = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(second, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(one.outcome).toBe("STANDING_ESCALATE");
    expect(two.outcome).toBe("STANDING_ESCALATE");
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
    const escalations = store.activities.filter(
      (a) => a.type === "STANDING_AUTHORITY_ESCALATED" && a.flowId === flowId,
    );
    expect(escalations).toHaveLength(2);
  });

  it("executes an approved escalation as HUMAN_APPROVAL without touching standing state", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupMandate(store, {
      authorityMode: "AUTO_WITH_ESCALATION",
      maxProtectionPct: 15,
      maxExecutions: 3,
    });
    const policyBefore = JSON.stringify(store.mandates.get(mandate.id)?.policy);
    const hashBefore = store.mandates.get(mandate.id)?.mandateHash;
    const noPost: string[] = [];
    const escalated = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(noPost, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(escalated.outcome).toBe("STANDING_ESCALATE");
    expect(noPost).toEqual([]);
    process.env.TENAX_EXECUTION_MODE = "BITGET_DEMO";
    process.env.BITGET_TRADING_MODE = "demo";
    try {
      approveProtectionProposal(store, { flowId, actor: "human" });
      const stubs = stubFetch([]);
      const executed = await executeProtectionProposal(
        store,
        { flowId },
        {
          credentials: CREDS,
          baseUrl: "https://api.bitget.com",
          tradingMode: "demo",
          executionMode: "BITGET_DEMO" as const,
          marketReader: async () => marketWith({ ...EMPTY_NVIDIA_POSITION }),
          writeFetchImpl: stubs.write,
          readFetchImpl: stubs.read,
          nowMs: Date.now(),
        },
      );
      expect(executed.submitted).toBe(true);
      const { receipt } = getDecisionReceipt(store, flowId);
      expect(receipt.authoritySource).toBe("HUMAN_APPROVAL");
      expect(receipt.standingMandateId).toBeNull();
      expect(receipt.standingEscalation).toMatchObject({
        mandateId: mandate.id,
        proposedProtectionPct: 20,
        proposedTradeValueUsdt: 100,
      });
      expect(receipt.standingEscalation?.reasonCodes).toContain("exceeds_max_protection_pct");
    } finally {
      delete process.env.TENAX_EXECUTION_MODE;
      delete process.env.BITGET_TRADING_MODE;
    }
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(JSON.stringify(store.mandates.get(mandate.id)?.policy)).toBe(policyBefore);
    expect(store.mandates.get(mandate.id)?.mandateHash).toBe(hashBefore);
    expect(store.mandates.get(mandate.id)?.status).toBe("ACTIVE");
  });
});

describe("hard refusals in every mode", () => {
  const modes: StandingAuthorityMode[] = [
    "REVIEW_EVERY_ACTION",
    "AUTO_WITHIN_MANDATE",
    "AUTO_WITH_ESCALATION",
  ];

  it("fails closed on unreadable position state, never escalating", async () => {
    for (const authorityMode of ["AUTO_WITHIN_MANDATE", "AUTO_WITH_ESCALATION"] as const) {
      const { store, flowId } = await setupPassFlow();
      const mandate = setupMandate(store, { authorityMode });
      const stubs = stubFetch([]);
      const result = await runProtectionAgentCycle(
        store,
        { flowId },
        {
          credentials: CREDS,
          baseUrl: "https://api.bitget.com",
          tradingMode: "demo",
          executionMode: "BITGET_DEMO" as const,
          marketReader: async (): Promise<DemoHedgeMarketState> => {
            throw new Error("transport down");
          },
          writeFetchImpl: stubs.write,
          readFetchImpl: stubs.read,
          nowMs: Date.now(),
        },
      );
      expect(result.outcome).toBe("STANDING_REFUSED");
      if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
      expect(result.cumulative?.reasonCode).toBe("position_unreadable");
      expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    }
  });

  it("fails closed on an unexpected long position, never escalating", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "AUTO_WITH_ESCALATION" });
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

  it("refuses forbidden operations in all three modes at evaluation", () => {
    for (const authorityMode of modes) {
      const base: StandingAuthorityAction = {
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
      };
      const mandate = {
        id: "smand-0001",
        policy: {
          subjectId: "NVDA",
          intentType: "PROTECT_EVENT_RISK",
          maxProtectionPct: 30,
          maxNotionalUsdt: 150,
          maxLeverage: 1,
          allowedSymbols: ["NVDAUSDT"],
          allowedActionTypes: ["SHORT_HEDGE"],
          sellUnderlyingAllowed: false,
          transfersAllowed: false,
          leverageChangesAllowed: false,
          authorityMode,
          maxExecutions: 3,
        },
        status: "ACTIVE",
        executionCount: 0,
        reservation: null,
        createdAt: new Date(NOW).toISOString(),
        activatedAt: new Date(NOW).toISOString(),
        expiresAt: null,
        revokedAt: null,
        mandateHash: "hash",
      } as const;
      const forbidden: Partial<StandingAuthorityAction>[] = [
        { requestsSellUnderlying: true },
        { requestsTransfer: true },
        { requestsLeverageChange: true },
        { subjectId: "AAPL" },
        { symbol: "BTCUSDT" },
        { actionType: "SPOT_BUY" },
      ];
      for (const override of forbidden) {
        const evaluation = evaluateStandingAuthority(
          { ...mandate, policy: { ...mandate.policy } },
          { ...base, ...override },
          NOW,
        );
        expect(evaluation.decision).toBe("REFUSED");
      }
    }
  });

  it("serializes routing results with no secret material", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "AUTO_WITH_ESCALATION", maxProtectionPct: 15 });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    const serialized = JSON.stringify({ result, context: store.flows.get(flowId)?.getContext() });
    for (const fragment of [
      "test-api-key",
      "test-secret-key",
      "test-pass",
      "Bearer ",
      "ACCESS-SIGN",
      "paptrading",
    ]) {
      expect(serialized).not.toContain(fragment);
    }
  });
});
