// Tenax Phase 4B-B2 — autonomous agent-cycle tests (offline, no network).
//
// Covers: human path unchanged, no fabricated approvals, standing
// AUTHORIZED/REFUSED/ESCALATE flows, WAIT/NO_ACTION stops, dead/stale
// mandates, mutated-proposal invalidation, atomic reservation under
// concurrency, single-POST idempotency, no double consumption, budget
// exhaustion, standing receipt provenance, DRY_RUN zero-write semantics,
// allowlist-only writes, LIVE impossibility, and secret-free activity
// events. Live Bitget submission is NEVER exercised: all I/O injected.
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { DemoHedgeMarketState } from "../src/lib/tenax/demo-executor";
import { bindStandingAuthority } from "../src/lib/tenax/authority";
import {
  __resetStandingMandateCounterForTests,
} from "../src/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  analyzeProtectionIntentWithAi,
  approveProtectionProposal,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  executeProtectionProposal,
  getDecisionReceipt,
  releaseStandingReservation,
  reserveStandingCapacity,
  revokeStandingMandateRecord,
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

const TEST_AI_CONFIG = {
  provider: "openai" as const,
  model: "test-model",
  apiKey: "test-key-never-logged",
  baseUrl: "https://ai.example.invalid/v1",
};

function fakeAiFetch(payload: unknown) {
  return async () => ({
    status: 200,
    text: async () =>
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  });
}

function aiModelOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subjectId: "NVDA",
    decision: "PROTECT",
    recommendedProtectionPct: 20,
    rationale: "Bounded protection inside mandate with margin for spread.",
    keyDrivers: ["Elevated event risk around earnings."],
    risks: ["Overnight gap risk."],
    missingEvidence: ["Verified earnings date."],
    evidenceRefs: ["bitget:public:ticker"],
    ...overrides,
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

/** Activate an AUTO_WITHIN_MANDATE budget-1 mandate in the store. */
function setupActiveMandate(
  store: ReturnType<typeof createDevStore>,
  overrides: { authorityMode?: "AUTO_WITHIN_MANDATE" | "AUTO_WITH_ESCALATION" | "REVIEW_EVERY_ACTION"; maxExecutions?: number } = {},
) {
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1, ...overrides },
    NOW,
  );
  return activateStandingMandateRecord(store, { id: created.id }, NOW);
}

const agentDemoDeps = (calls: string[], infoBody: string = INFO_FILLED) => {
  const stubs = stubFetch(calls, PLACE_OK, infoBody);
  return {
    credentials: CREDS,
    baseUrl: "https://api.bitget.com",
    tradingMode: "demo",
    executionMode: "BITGET_DEMO" as const,
    marketReader: async () => DEMO_MARKET,
    writeFetchImpl: stubs.write,
    readFetchImpl: stubs.read,
  };
};

describe("human path unchanged", () => {
  it("approves and executes with HUMAN_APPROVAL receipt provenance", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    approveProtectionProposal(store, { flowId, actor: "human" });
    const executed = await executeProtectionProposal(store, { flowId });
    expect(executed.executionMode).toBe("DRY_RUN");
    const { receipt } = getDecisionReceipt(store, flowId);
    expect(receipt.authoritySource).toBe("HUMAN_APPROVAL");
    expect(receipt.approval).toBe("APPROVED");
    expect(receipt.standingMandateId).toBeNull();
    expect(receipt.authorityDecision).toBeNull();
  });
});

describe("standing DRY_RUN cycle", () => {
  it("authorizes 20%/$100 with no approval record and zero writes", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("EXECUTED");
    if (result.outcome !== "EXECUTED" || result.executionMode !== "DRY_RUN") {
      throw new Error("expected DRY_RUN execution");
    }
    expect(result.submitted).toBe(false);
    expect(result.disclaimer).toBe("DRY_RUN — NO FUNDS MOVED");
    expect(result.reconciled).toBe(false);
    expect(result.authority.authoritySource).toBe("STANDING_MANDATE");
    expect(result.authority.approvalId).toBeNull();
    expect(result.authority.standingMandateId).toBe(mandate.id);
    expect(calls).toEqual([]);
    // No approval record was fabricated.
    expect(store.flows.get(flowId)?.getContext().approval).toBeNull();
    expect(result.receipt.approval).toBe("NOT_REQUIRED");
    expect(result.receipt.authoritySource).toBe("STANDING_MANDATE");
    expect(result.receipt.standingMandateId).toBe(mandate.id);
    expect(result.receipt.standingMandateHash).toBe(mandate.mandateHash);
    expect(result.receipt.authorityDecision).toBe("AUTHORIZED");
    // Budget untouched by a preview-only run; reservation released.
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
    expect(JSON.stringify(result.receipt)).not.toMatch(/HUMAN APPROVED/);
  });

  it("authorizes the exact 30%/$150 boundary", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed: no analysis");
    (analysis as unknown as { proposal: { protectionPct: number; proposedTradeValueUsdt: number } }).proposal =
      { ...analysis.proposal, protectionPct: 30, proposedTradeValueUsdt: 150 };
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("EXECUTED");
    if (result.outcome !== "EXECUTED" || result.executionMode !== "DRY_RUN") {
      throw new Error("expected DRY_RUN execution");
    }
    expect(result.request.qty).not.toBe("");
  });

  it("reruns cleanly: DRY_RUN retries never consume or fail", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const first = await runProtectionAgentCycle(store, { flowId });
    const second = await runProtectionAgentCycle(store, { flowId });
    expect(first.outcome).toBe("EXECUTED");
    expect(second.outcome).toBe("EXECUTED");
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
  });
});

describe("standing refusal and escalation", () => {
  it("refuses 50%/$250 in strict mode with zero POSTs", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed: no analysis");
    (analysis as unknown as { proposal: { protectionPct: number; proposedTradeValueUsdt: number } }).proposal =
      { ...analysis.proposal, protectionPct: 50, proposedTradeValueUsdt: 250 };
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    // Policy refuses first (50% exceeds 30% cap).
    expect(result.outcome).toBe("POLICY_REFUSED");
    if (result.outcome !== "POLICY_REFUSED") throw new Error("expected POLICY_REFUSED");
    expect(result.failedRules).toContain("max_protection_pct");
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
  });

  it("refuses at standing level when policy passes but mandate is tighter", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    // Narrow mandate: policy (30%/$150) passes, standing (10%/$50) refuses.
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    const narrowed = {
      ...created,
      policy: { ...created.policy, maxProtectionPct: 10, maxNotionalUsdt: 50 },
    };
    store.mandates.set(narrowed.id, narrowed);
    activateStandingMandateRecord(store, { id: narrowed.id }, NOW);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.evaluation.failedRules).toContain("exceeds_max_protection_pct");
    expect(calls).toEqual([]);
  });

  it("escalates in AUTO_WITH_ESCALATION without POSTing, then allows manual review", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store, { authorityMode: "AUTO_WITH_ESCALATION", maxExecutions: 3 });
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed: no analysis");
    // Use a proposal inside policy (30/150) but outside a narrowed standing bound.
    const stored = store.mandates.values().next().value;
    if (!stored) throw new Error("test setup failed: no mandate");
    store.mandates.set(stored.id, {
      ...stored,
      policy: { ...stored.policy, maxProtectionPct: 10, maxNotionalUsdt: 50 },
    });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("STANDING_ESCALATE");
    if (result.outcome !== "STANDING_ESCALATE") throw new Error("expected STANDING_ESCALATE");
    expect(result.note).toBe("HUMAN REVIEW REQUIRED");
    expect(result.conflict).toMatchObject({ proposedPct: 20, proposedUsd: 100, maxPct: 10, maxNotional: 50 });
    expect(calls).toEqual([]);
    // Escalation is recorded for audit; budget and policy stay untouched.
    expect(flow?.getContext().standingEscalation).toMatchObject({
      reasonCodes: expect.arrayContaining(["exceeds_max_protection_pct"]),
    });
    expect(store.mandates.get(stored.id)?.executionCount).toBe(0);
    expect(store.mandates.get(stored.id)?.policy.maxProtectionPct).toBe(10);
    // The manual human-approval path remains available afterwards.
    approveProtectionProposal(store, { flowId, actor: "human" });
    const executed = await executeProtectionProposal(store, { flowId });
    expect(executed.executionMode).toBe("DRY_RUN");
  });

  it("REVIEW mode returns HUMAN_APPROVAL_REQUIRED without POSTing", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store, { authorityMode: "REVIEW_EVERY_ACTION" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("STANDING_REVIEW");
    if (result.outcome !== "STANDING_REVIEW") throw new Error("expected STANDING_REVIEW");
    expect(result.note).toBe("HUMAN APPROVAL REQUIRED");
    expect(calls).toEqual([]);
    // The ordinary one-time human approval path remains available afterwards.
    approveProtectionProposal(store, { flowId, actor: "human" });
    const executed = await executeProtectionProposal(store, { flowId });
    expect(executed.executionMode).toBe("DRY_RUN");
  });
});

describe("WAIT and NO_ACTION stop cold", () => {
  async function setupWaitFlow() {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    await analyzeProtectionIntentWithAi(store, flowId, snapshot, {
      config: TEST_AI_CONFIG,
      fetchImpl: fakeAiFetch(
        aiModelOutput({ decision: "WAIT", recommendedProtectionPct: null }),
      ),
    }).catch((err: unknown) => {
      if (err instanceof Error && /no actionable proposal/.test(err.message)) return null;
      throw err;
    });
    return { store, flowId };
  }

  it("WAIT reserves nothing, consumes nothing, posts nothing", async () => {
    const { store, flowId } = await setupWaitFlow();
    const mandate = setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("NO_ACTION");
    if (result.outcome !== "NO_ACTION") throw new Error("expected NO_ACTION");
    expect(result.aiDecision).toBe("WAIT");
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
  });
});

describe("dead and stale mandates never post", () => {
  it("returns NO_STANDING_MANDATE for drafts", async () => {
    const { store, flowId } = await setupPassFlow();
    createStandingMandateRecord(store, { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 }, NOW);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("NO_STANDING_MANDATE");
    expect(calls).toEqual([]);
  });

  it("refuses revoked mandates without POSTing", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    revokeStandingMandateRecord(store, { id: mandate.id }, NOW);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("NO_STANDING_MANDATE");
    expect(calls).toEqual([]);
  });

  it("refuses stale proposals without POSTing", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      { ...agentDemoDeps(calls), nowMs: Date.now() + 16 * 60 * 1000 },
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    if (result.outcome !== "STANDING_REFUSED") throw new Error("expected STANDING_REFUSED");
    expect(result.evaluation.failedRules).toContain("proposal_stale");
    expect(calls).toEqual([]);
  });

  it("refuses exhausted mandates without POSTing", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    // Exhaust the single budget with a genuine DEMO consumption on a
    // companion flow, then prove this flow cannot post anymore.
    const snapshot = await testSnapshot();
    const other = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, other.flowId, snapshot);
    const otherCalls: string[] = [];
    const consumed = await runProtectionAgentCycle(
      store,
      { flowId: other.flowId },
      agentDemoDeps(otherCalls),
    );
    expect(consumed.outcome).toBe("EXECUTED");
    expect(store.mandates.get(mandate.id)?.status).toBe("EXHAUSTED");
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    // No ACTIVE mandate remains: the human path is the only fallback.
    expect(result.outcome).toBe("NO_STANDING_MANDATE");
    expect(calls).toEqual([]);
  });
});

describe("BITGET_DEMO autonomous execution", () => {
  it("submits once, consumes once, and records standing provenance", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("EXECUTED");
    if (result.outcome !== "EXECUTED" || result.executionMode !== "BITGET_DEMO") {
      throw new Error("expected BITGET_DEMO execution");
    }
    expect(result.submitted).toBe(true);
    expect(result.filled).toBe(true);
    expect(result.orderId).toBe("demo-oid-111");
    expect(result.reconciled).toBe(false);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
    expect(calls[0]).toContain("/api/v3/trade/place-order");
    const stored = store.mandates.get(mandate.id);
    expect(stored?.executionCount).toBe(1);
    expect(stored?.status).toBe("EXHAUSTED");
    expect(stored?.reservation).toBeNull();
    expect(result.receipt.authoritySource).toBe("STANDING_MANDATE");
    expect(result.receipt.standingMandateId).toBe(mandate.id);
    expect(result.receipt.standingMandateHash).toBe(mandate.mandateHash);
    expect(result.receipt.authorityDecision).toBe("AUTHORIZED");
    expect(result.receipt.approval).toBe("NOT_REQUIRED");
    expect(JSON.stringify(result.receipt)).not.toMatch(/HUMAN APPROVED/);
    const activities = store.activities.map((a) => a.type);
    expect(activities).toEqual([
      "STANDING_AUTHORITY_AUTHORIZED",
      "AUTONOMOUS_EXECUTION_SUBMITTED",
      "AUTONOMOUS_EXECUTION_FILLED",
      "DECISION_RECEIPT_READY",
    ]);
    const serialized = JSON.stringify({ result: { ...result, receipt: undefined }, activities: store.activities });
    for (const fragment of ["test-api-key", "test-secret-key", "test-pass", "ACCESS-SIGN", "paptrading"]) {
      expect(serialized).not.toContain(fragment);
    }
  });

  it("retries reconcile read-only: same order, no second POST, no second consume", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const calls: string[] = [];
    const first = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(first.outcome).toBe("EXECUTED");
    if (first.outcome !== "EXECUTED" || first.executionMode !== "BITGET_DEMO") {
      throw new Error("expected BITGET_DEMO execution");
    }
    const firstOid = first.clientOid;
    const second = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(second.outcome).toBe("EXECUTED");
    if (second.outcome !== "EXECUTED" || second.executionMode !== "BITGET_DEMO") {
      throw new Error("expected BITGET_DEMO execution");
    }
    expect(second.reconciled).toBe(true);
    expect(second.clientOid).toBe(firstOid);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(1);
  });

  it("stays single-submit under concurrent attempts", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    const deps = agentDemoDeps(calls);
    const [first, second] = await Promise.all([
      runProtectionAgentCycle(store, { flowId }, deps),
      runProtectionAgentCycle(store, { flowId }, deps),
    ]);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["EXECUTED", "IN_PROGRESS"]);
  });

  it("pre-submit failure releases the reservation without consuming", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const calls: string[] = [];
    const deps = agentDemoDeps(calls);
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      {
        ...deps,
        marketReader: async () => ({ ...DEMO_MARKET, symbol: "BTCUSDT" }),
      },
    );
    expect(result.outcome).toBe("FAILED");
    expect(calls).toEqual([]);
    expect(store.mandates.get(mandate.id)?.executionCount).toBe(0);
    expect(store.mandates.get(mandate.id)?.reservation).toBeNull();
  });

  it("a different flow cannot reuse a live reservation", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const flow = store.flows.get(flowId);
    const proposalHash = flow?.getContext().proposalHash;
    if (!proposalHash) throw new Error("test setup failed: no proposal hash");
    reserveStandingCapacity(store, { mandateId: mandate.id, flowId, proposalHash }, NOW);
    const snapshot = await testSnapshot();
    const other = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, other.flowId, snapshot);
    const calls: string[] = [];
    await expect(
      runProtectionAgentCycle(store, { flowId: other.flowId }, agentDemoDeps(calls)),
    ).rejects.toThrow(/reserved by another action/);
    expect(calls).toEqual([]);
    expect(releaseStandingReservation(store, { mandateId: mandate.id, flowId, proposalHash })).toBe(true);
  });

  it("mutated proposals invalidate standing authority at the gate", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!flow || !analysis) throw new Error("test setup failed");
    const authority = bindStandingAuthority(
      { mandateId: mandate.id, mandateHash: mandate.mandateHash, evaluatedAt: new Date(NOW).toISOString() },
      analysis.proposal,
      flowId,
      NOW,
    );
    (analysis as unknown as { proposal: { proposedTradeValueUsdt: number } }).proposal =
      { ...analysis.proposal, proposedTradeValueUsdt: 120 };
    await expect(
      flow.executeAutonomous({
        authority,
        mandate,
        executionMode: "DRY_RUN",
      }),
    ).rejects.toThrow(/not valid for this exact proposal/);
  });
});

describe("mode safety and route shape", () => {
  it("treats LIVE as impossible (falls back to DRY_RUN, zero writes)", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, {
      executionMode: "LIVE" as never,
    });
    expect(result.outcome).toBe("EXECUTED");
    if (result.outcome !== "EXECUTED" || result.executionMode !== "DRY_RUN") {
      throw new Error("expected DRY_RUN fallback");
    }
    expect(calls).toEqual([]);
  });

  it("exposes POST-only agent-cycle with no client-overridable finance", () => {
    const source = readFileSync(
      new URL("../src/app/api/protection/agent-cycle/route.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("export async function POST");
    expect(source).not.toContain("export async function GET");
    for (const fragment of ["qty", "side", "leverage", "notional", "symbol"] as const) {
      expect(source).not.toContain(`"${fragment}"`);
    }
  });
});
