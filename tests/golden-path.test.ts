// Tenax Phase 1C — golden-path orchestration tests (no network).
//
// Market context comes from injected stub snapshots built on Phase 0A/0B
// observed fixtures. Route handlers are not exercised here (they would call
// live Bitget); all authority boundaries are tested at service/orchestrator
// level, which is exactly what the routes delegate to.
import { describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import {
  MANDATE_FIXTURE,
  NVDA_EXPOSURE_FIXTURE,
  PROPOSAL_REFUSE_VALUE_FIXTURE,
} from "../src/lib/tenax/fixtures";
import { evaluateMandate } from "../src/lib/tenax/mandate";
import {
  analysisReasoningSchema,
  analyzeProtectionIntent,
  approveProtection,
  approveProtectionProposal,
  createApprovalRequest,
  createDevStore,
  createProtectionIntent,
  evaluateProtectionProposal,
  executeProtectionProposal,
  getCapitalContext,
  getDecisionReceipt,
  hashProposal,
  isApprovalValidFor,
  ProtectionFlow,
} from "../src/lib/tenax/index";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

async function setupGolden() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const created = createProtectionIntent(store, { rawText: RAW_TEXT });
  return { store, snapshot, flowId: created.flowId };
}

describe("golden path", () => {
  it("runs Exposure → … → Receipt with honest labels throughout", async () => {
    const { store, snapshot, flowId } = await setupGolden();

    const created = store.flows.get(flowId)?.getFlowState();
    expect(created).toBe("INTENT_READY");

    const analyzed = analyzeProtectionIntent(store, flowId, snapshot);
    expect(analyzed.state).toBe("MANDATE_PASS");
    expect(analyzed.mandateVerdict).toBe("PASS");
    expect(analyzed.proposal).toMatchObject({ underlying: "NVDA", protectionPct: 20 });
    expect(analyzed.calculatedTradeValueUsdt).toBe(100);
    expect(analyzed.reasoning.kind).toBe("development-fixture");

    const approved = approveProtectionProposal(store, { flowId, actor: "human" });
    expect(approved.state).toBe("APPROVED");
    expect(approved.approval.state).toBe("APPROVED");
    expect(approved.approval.actor).toBe("human");
    expect(approved.approval.approvedAt).not.toBeNull();

    const executed = await executeProtectionProposal(store, { flowId });
    expect(executed.state).toBe("COMPLETED");
    expect(executed.executionMode).toBe("DRY_RUN");
    expect(executed.fundsMoved).toBe(false);
    expect(executed.submitted).toBe(false);
    expect(executed.disclaimer).toBe("DRY_RUN — NO FUNDS MOVED");
    if (executed.executionMode !== "DRY_RUN") throw new Error("expected DRY_RUN shape");
    expect(executed.request.symbol).toBe("RNVDAUSDT");

    const { receipt } = getDecisionReceipt(store, flowId);
    expect(receipt).toMatchObject({
      underlying: "NVDA",
      representation: "RNVDAUSDT",
      exposureValueUsdt: 500,
      intent: "PROTECT_EVENT_RISK",
      proposedProtectionPct: 20,
      proposedTradeValueUsdt: 100,
      mandateResult: "PASS",
      approval: "APPROVED",
      executionMode: "DRY_RUN",
      fundsMoved: false,
    });
    expect(receipt.receiptId).toContain(flowId);
    expect(receipt.rejectedAlternatives).toHaveLength(1);
    expect(receipt.rejectedAlternatives[0]?.mandateResult).toBe("REFUSE");
    expect(receipt.evidenceRefs.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toMatch(/orderId|transactionHash|executed successfully/i);
  });
});

describe("execution gates", () => {
  it("blocks execution before approval", async () => {
    const { store, snapshot, flowId } = await setupGolden();
    analyzeProtectionIntent(store, flowId, snapshot);
    // State is MANDATE_PASS; approval was never requested nor granted.
    await expect(executeProtectionProposal(store, { flowId })).rejects.toThrow(/FLOW_REJECTED/);
  });

  it("blocks the whole tail on a REFUSE decision", async () => {
    const snapshot = await testSnapshot();
    const flow = new ProtectionFlow("flow-refuse");
    flow.loadExposure(NVDA_EXPOSURE_FIXTURE);
    flow.createIntent(RAW_TEXT);
    flow.analyze(snapshot, { ...MANDATE_FIXTURE, maxTradeValueUsdt: 50 });
    expect(flow.evaluate().verdict).toBe("REFUSE");
    expect(flow.getFlowState()).toBe("MANDATE_REFUSED");
    expect(() => flow.requestApproval()).toThrow(/FLOW_REJECTED/);
    expect(() => flow.approve()).toThrow(/FLOW_REJECTED/);
    await expect(flow.execute()).rejects.toThrow(/FLOW_REJECTED/);
  });

  it("never lets a REFUSE decision enter approval", () => {
    const refuse = evaluateMandate(
      PROPOSAL_REFUSE_VALUE_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    expect(refuse.verdict).toBe("REFUSE");
    expect(() =>
      createApprovalRequest("intent-1", PROPOSAL_REFUSE_VALUE_FIXTURE, refuse),
    ).toThrow(/APPROVAL_REFUSED/);
  });
});

describe("approval binding", () => {
  it("binds approval to the exact proposal and PASS decision", async () => {
    const { store, snapshot, flowId } = await setupGolden();
    const analyzed = analyzeProtectionIntent(store, flowId, snapshot);
    const { approval } = approveProtectionProposal(store, { flowId, actor: "human" });
    expect(approval.proposalHash).toBe(hashProposal(analyzed.proposal));
    expect(
      isApprovalValidFor(approval, analyzed.proposal, {
        verdict: "PASS",
        pendingHumanApproval: false,
        failedRules: [],
        checks: analyzed.mandateChecks,
        evaluatedAt: "test",
      }),
    ).toBe(true);
  });

  it("invalidates approval when the proposal is mutated", async () => {
    const { store, snapshot, flowId } = await setupGolden();
    analyzeProtectionIntent(store, flowId, snapshot);
    approveProtectionProposal(store, { flowId, actor: "human" });
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed: no analysis");
    // Simulate untrusted mutation of the proposal after approval.
    (analysis as unknown as { proposal: { proposedTradeValueUsdt: number } }).proposal
      .proposedTradeValueUsdt = 999;
    await expect(executeProtectionProposal(store, { flowId })).rejects.toThrow(/FLOW_REJECTED/);
  });

  it("rejects double approval and non-human actors", async () => {
    const { store, snapshot, flowId } = await setupGolden();
    analyzeProtectionIntent(store, flowId, snapshot);
    approveProtectionProposal(store, { flowId, actor: "human" });
    expect(() => approveProtectionProposal(store, { flowId, actor: "human" })).toThrow();
    const pending = createApprovalRequest(
      "intent-x",
      { underlying: "NVDA", protectionPct: 20, proposedTradeValueUsdt: 100, leverageUsed: 1 },
      evaluateMandate(
        { underlying: "NVDA", protectionPct: 20, proposedTradeValueUsdt: 100, leverageUsed: 1 },
        MANDATE_FIXTURE,
        NVDA_EXPOSURE_FIXTURE,
      ),
    );
    expect(() =>
      approveProtection(pending, "agent" as unknown as "human"),
    ).toThrow(/human approval only/);
  });
});

describe("server-side re-verification", () => {
  it("recomputes the mandate instead of trusting cached verdicts", async () => {
    const { store, snapshot, flowId } = await setupGolden();
    analyzeProtectionIntent(store, flowId, snapshot);
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed: no analysis");
    (analysis as unknown as { proposal: { proposedTradeValueUsdt: number } }).proposal
      .proposedTradeValueUsdt = 200;
    const rechecked = evaluateProtectionProposal(store, flowId);
    expect(rechecked.mandateVerdict).toBe("REFUSE");
    expect(rechecked.failedRules).toContain("max_trade_value");
  });
});

describe("provenance", () => {
  it("labels market REAL, exposure SIMULATED, analysis fixture", async () => {
    const context = await getCapitalContext(async () =>
      fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
    );
    expect(context.provenance).toMatchObject({
      marketData: "REAL",
      exposure: "SIMULATED",
      analysis: "DEVELOPMENT_FIXTURE",
      execution: "NOT_EXECUTED",
    });
    expect(context.exposure.valueSource).toBe("fixture");
    expect(context.exposure.exposureValueUsdt).toBe(500);
    expect(context.snapshot.availability).toBe("AVAILABLE");
  });

  it("refuses to analyze when market data is UNAVAILABLE", async () => {
    const down = { async getJson(): Promise<never> { throw new Error("fetch failed"); } };
    const context = await getCapitalContext(async () => fetchRealityBundle(down, { gapMs: 0 }));
    expect(context.provenance.marketData).toBe("UNAVAILABLE");
    const store = createDevStore();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    expect(() => analyzeProtectionIntent(store, flowId, context.snapshot)).toThrow(
      /ANALYSIS_BLOCKED/,
    );
  });
});

describe("receipt discipline", () => {
  it("emits a receipt only after a valid completed flow", async () => {
    const { store, flowId } = await setupGolden();
    expect(() => getDecisionReceipt(store, flowId)).toThrow(/FLOW_REJECTED/);
  });
});

describe("state machine", () => {
  it("rejects out-of-order and repeated transitions", async () => {
    const flow = new ProtectionFlow("flow-order");
    expect(() => flow.createIntent(RAW_TEXT)).toThrow(/FLOW_REJECTED/);
    flow.loadExposure(NVDA_EXPOSURE_FIXTURE);
    expect(() => flow.loadExposure(NVDA_EXPOSURE_FIXTURE)).toThrow(/FLOW_REJECTED/);
    expect(() => flow.approve()).toThrow(/FLOW_REJECTED/);

    const snapshot = await testSnapshot();
    flow.createIntent(RAW_TEXT);
    flow.analyze(snapshot, MANDATE_FIXTURE);
    flow.evaluate();
    flow.requestApproval();
    flow.approve();
    await flow.execute();
    expect(flow.getFlowState()).toBe("COMPLETED");
    // Re-execution reconciles the stored result instead of resubmitting:
    // DRY_RUN returns the identical stored record, never a second action.
    const again = await flow.execute();
    expect(flow.getFlowState()).toBe("COMPLETED");
    expect(again).toEqual(await flow.execute());
    expect(() => flow.approve()).toThrow(/FLOW_REJECTED/);
  });
});

describe("analysis contract", () => {
  it("constrains future model output while marking the fixture honestly", async () => {
    const { store, snapshot, flowId } = await setupGolden();
    const analyzed = analyzeProtectionIntent(store, flowId, snapshot);
    expect(analyzed.reasoning.kind).toBe("development-fixture");
    const modelShape = {
      kind: "model",
      summary: "Elevated event risk around earnings.",
      riskObservations: ["After-hours information gap."],
      proposedProtectionPct: 20,
      rationale: "Bounded hedge inside mandate.",
      evidenceRefs: ["GET /api/v3/market/tickers [OK]"],
    };
    expect(analysisReasoningSchema.safeParse(modelShape).success).toBe(true);
    expect(
      analysisReasoningSchema.safeParse({ ...modelShape, proposedProtectionPct: 101 }).success,
    ).toBe(false);
  });
});

describe("dev store isolation", () => {
  it("keeps flows namespaced per store", async () => {
    const { store: storeA, flowId } = await setupGolden();
    const storeB = createDevStore();
    expect(storeB.flows.has(flowId)).toBe(false);
    expect(storeA.flows.has(flowId)).toBe(true);
  });
});
