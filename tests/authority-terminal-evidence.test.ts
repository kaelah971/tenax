// Tenax authority-terminal-evidence regressions (offline, fake AI only).
//
// Proves through the real service path (the same functions the routes
// call, in order): EXECUTE/PREVIEW unchanged; AI-over-mandate REFUSE and
// agent-cycle POLICY_REFUSED/NO_STANDING_MANDATE produce activity +
// POLICY_REFUSED proof + NO_ORDER run with zero provider writes;
// ESCALATE/REVIEW keep durable evidence; provenance labels AI vs fixture
// truthfully; WAIT records no refusal. No live calls, no writes.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import {
  __resetStandingMandateCounterForTests,
} from "../src/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  analyzeProtectionIntentWithAi,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  recordDeterministicRefusal,
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import { getProofRepository } from "../src/lib/proof/repository";
import {
  getPaperTradingRunRepository,
  resetPaperTradingRunRepositoryForTests,
} from "../src/lib/tenax/paper-trading-run-repository";
import { calculatePaperTradingMetrics } from "../src/lib/tenax/paper-trading-metrics";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const NOW = Date.now();
const TEST_AI_CONFIG = {
  provider: "groq" as const,
  model: "openai/gpt-oss-120b",
  apiKey: "test-key-never-logged",
  baseUrl: "https://ai.example.invalid/v1",
};

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

function fakeAiFetch(
  payload: Record<string, unknown>,
  calls: Array<{ url: string; method: string; body: string }>,
) {
  return async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, method: init.method, body: init.body });
    return {
      status: 200,
      text: async () =>
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    };
  };
}

function aiModelOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subjectId: "NVDA",
    decision: "PROTECT",
    recommendedProtectionPct: 40,
    rationale: "Strong event conviction with an available hedge.",
    keyDrivers: ["Elevated event risk around earnings."],
    risks: ["Overnight gap risk."],
    missingEvidence: ["Verified earnings date."],
    evidenceRefs: ["bitget:public:ticker"],
    ...overrides,
  };
}

/** Genuine-shape AI REFUSE run: 40%/$200 over the 30%/$150 mandate. */
async function setupAiRefuseFlow(calls: Array<{ url: string; method: string; body: string }>) {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  const result = await analyzeProtectionIntentWithAi(store, flowId, snapshot, {
    config: TEST_AI_CONFIG,
    fetchImpl: fakeAiFetch(aiModelOutput(), calls),
    nowMs: NOW,
  });
  return { store, flowId, result };
}

function activateMandate(
  store: ReturnType<typeof createDevStore>,
  overrides: {
    authorityMode?: "AUTO_WITHIN_MANDATE" | "AUTO_WITH_ESCALATION" | "REVIEW_EVERY_ACTION";
    maxExecutions?: number;
    maxProtectionPct?: number;
    maxNotionalUsdt?: number;
  } = {},
) {
  const { maxProtectionPct, maxNotionalUsdt, ...rest } = overrides;
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1, ...rest },
    NOW,
  );
  const narrowed =
    maxProtectionPct !== undefined || maxNotionalUsdt !== undefined
      ? {
          ...created,
          policy: {
            ...created.policy,
            maxProtectionPct: maxProtectionPct ?? created.policy.maxProtectionPct,
            maxNotionalUsdt: maxNotionalUsdt ?? created.policy.maxNotionalUsdt,
          },
        }
      : created;
  store.mandates.set(narrowed.id, narrowed);
  return activateStandingMandateRecord(store, { id: narrowed.id }, NOW);
}

async function setupPassFlow() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  return { store, flowId };
}

beforeEach(() => {
  resetPaperTradingRunRepositoryForTests();
  __resetStandingMandateCounterForTests();
});

describe("EXECUTE/PREVIEW path unchanged", () => {
  it("in-mandate DRY_RUN cycle still executes with PREVIEW evidence and no refusal", async () => {
    const { store, flowId } = await setupPassFlow();
    activateMandate(store);
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("EXECUTED");
    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      flowId,
      status: "EXECUTED",
      authority: { outcome: "EXECUTE" },
      execution: { status: "PREVIEW", submitted: false },
    });
    expect(
      store.activities.some((a) => a.type === "DETERMINISTIC_POLICY_REFUSED"),
    ).toBe(false);
  });
});

describe("genuine AI REFUSE produces durable NO_ORDER evidence", () => {
  it("40%/$200 PROTECT records activity + POLICY_REFUSED proof + run with zero provider POSTs", async () => {
    const calls: Array<{ url: string; method: string; body: string }> = [];
    const { store, flowId, result } = await setupAiRefuseFlow(calls);
    expect(result.mandateVerdict).toBe("REFUSE");
    expect(result.provenance.analysis).toBe("AI_MODEL");
    expect(result.proposal).toMatchObject({ protectionPct: 40, proposedTradeValueUsdt: 200 });

    // Exactly what POST /api/protection/analyze does on a REFUSE verdict.
    const recorded = await recordDeterministicRefusal(store, flowId, { nowMs: Date.now() });
    expect(recorded).not.toBeNull();
    const event = recorded!.event;
    expect(event.type).toBe("DETERMINISTIC_POLICY_REFUSED");
    expect(event.flowId).toBe(flowId);
    expect(event.details).toMatchObject({
      mandateId: null,
      proposedPct: 40,
      proposedUsd: 200,
      maxPct: 30,
      maxNotional: 150,
      outcome: "POLICY_REFUSED",
    });
    expect(event.details?.reasonCodes).toEqual(
      expect.arrayContaining(["max_protection_pct", "max_trade_value"]),
    );

    // Proof persisted through the canonical seam.
    const proofs = await getProofRepository().repo.listProofs({ flowId });
    const proof = proofs.find((p) => p.sourceActivityEventId === event.id);
    expect(proof).toBeDefined();
    expect(proof).toMatchObject({
      kind: "POLICY_REFUSED",
      outcome: "NO ORDER SENT",
      execution: null,
      receiptId: null,
      authority: { source: "DETERMINISTIC_MANDATE" },
      proposal: { protectionPct: 40, notionalUsd: 200, side: "sell", action: "SHORT_HEDGE" },
    });

    // Canonical run: REFUSE + NO_ORDER, AI attribution preserved.
    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      flowId,
      status: "REFUSED",
      symbol: "NVDAUSDT",
      authority: { outcome: "REFUSE" },
      execution: { status: "NO_ORDER", submitted: false, orderId: null },
      outcome: { outcomeState: "NOT_OBSERVED" },
      decision: { provider: "groq", model: "openai/gpt-oss-120b", direction: "SHORT" },
    });
    expect(runs[0]!.authority.reasonCodes).toEqual(
      expect.arrayContaining(["max_protection_pct", "max_trade_value"]),
    );
    expect(runs[0]!.sourceActivityEventId).toBe(event.id);
    expect(runs[0]!.sourceProofId).toBe(proof!.id);

    // Retry-safe: a second record call writes nothing new.
    expect(await recordDeterministicRefusal(store, flowId, { nowMs: Date.now() })).toBeNull();
    expect(
      store.activities.filter(
        (a) => a.type === "DETERMINISTIC_POLICY_REFUSED" && a.flowId === flowId,
      ),
    ).toHaveLength(1);

    // One model call only; no Bitget touch of any kind.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("ai.example.invalid");
    expect(JSON.stringify({ event, proof, run: runs[0] })).not.toContain("test-key-never-logged");
  });

  it("refusals feed risk metrics but never the realized sample", async () => {
    const calls: Array<{ url: string; method: string; body: string }> = [];
    const { store, flowId } = await setupAiRefuseFlow(calls);
    await recordDeterministicRefusal(store, flowId, { nowMs: Date.now() });
    const runs = await getPaperTradingRunRepository().listRuns();
    const metrics = calculatePaperTradingMetrics(runs);
    expect(metrics.riskControl.refused).toBe(1);
    expect(metrics.riskControl.riskViolationPreventionCount).toBe(1);
    expect(metrics.performance.realizedRunCount).toBe(0);
    expect(metrics.performance.sharpeStatus).toBe("INSUFFICIENT_DATA");
    expect(metrics.performance.maxDrawdownStatus).toBe("INSUFFICIENT_DATA");
  });

  it("WAIT records no refusal evidence", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    const network: Array<{ url: string; method: string; body: string }> = [];
    await expect(
      analyzeProtectionIntentWithAi(store, flowId, snapshot, {
        config: TEST_AI_CONFIG,
        fetchImpl: fakeAiFetch(
          aiModelOutput({ decision: "WAIT", recommendedProtectionPct: null }),
          network,
        ),
        nowMs: NOW,
      }),
    ).rejects.toThrow(/no actionable proposal/);
    expect(await recordDeterministicRefusal(store, flowId, { nowMs: Date.now() })).toBeNull();
    expect(
      store.activities.some((a) => a.type === "DETERMINISTIC_POLICY_REFUSED"),
    ).toBe(false);
    expect(await getPaperTradingRunRepository().listRuns()).toEqual([]);
  });
});

describe("agent-cycle terminal authority evidence", () => {
  it("POLICY_REFUSED persists POLICY_REFUSED proof + NO_ORDER run", async () => {
    const { store, flowId } = await setupPassFlow();
    activateMandate(store);
    const flow = store.flows.get(flowId);
    const analysis = flow?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed");
    (analysis as unknown as { proposal: { protectionPct: number; proposedTradeValueUsdt: number } }).proposal =
      { ...analysis.proposal, protectionPct: 50, proposedTradeValueUsdt: 250 };
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("POLICY_REFUSED");
    const event = store.activities.find((a) => a.type === "DETERMINISTIC_POLICY_REFUSED");
    expect(event?.details?.reasonCodes).toEqual(expect.arrayContaining(["max_protection_pct"]));
    const proofs = await getProofRepository().repo.listProofs({ flowId });
    expect(proofs.find((p) => p.sourceActivityEventId === event?.id)?.kind).toBe("POLICY_REFUSED");
    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "REFUSED",
      execution: { status: "NO_ORDER", submitted: false },
    });
  });

  it("NO_STANDING_MANDATE persists refusal evidence with its reason code", async () => {
    const { store, flowId } = await setupPassFlow();
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("NO_STANDING_MANDATE");
    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "REFUSED",
      authority: { outcome: "REFUSE", reasonCodes: ["no_standing_mandate"] },
      execution: { status: "NO_ORDER", submitted: false },
    });
    const event = store.activities.find((a) => a.type === "DETERMINISTIC_POLICY_REFUSED");
    expect(event?.details?.reasonCodes).toEqual(["no_standing_mandate"]);
  });

  it("ESCALATE keeps proof + NO_ORDER run with zero provider writes", async () => {
    const { store, flowId } = await setupPassFlow();
    activateMandate(store, {
      authorityMode: "AUTO_WITH_ESCALATION",
      maxExecutions: 3,
      maxProtectionPct: 10,
      maxNotionalUsdt: 50,
    });
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("STANDING_ESCALATE");
    const proofs = await getProofRepository().repo.listProofs({ flowId });
    expect(proofs.some((p) => p.kind === "AUTHORITY_ESCALATED" && p.execution === null)).toBe(true);
    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "ESCALATED",
      execution: { status: "NO_ORDER", submitted: false },
    });
  });

  it("REVIEW keeps proof + NO_ORDER run with zero provider writes", async () => {
    const { store, flowId } = await setupPassFlow();
    activateMandate(store, { authorityMode: "REVIEW_EVERY_ACTION" });
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("STANDING_REVIEW");
    const proofs = await getProofRepository().repo.listProofs({ flowId });
    expect(proofs.some((p) => p.kind === "REVIEW_REQUIRED" && p.execution === null)).toBe(true);
    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "REVIEW_REQUIRED",
      execution: { status: "NO_ORDER", submitted: false },
    });
  });
});

describe("provenance truth and judge surfaces", () => {
  it("fixture analysis stays explicitly DEVELOPMENT_FIXTURE", async () => {
    const store = createDevStore();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    const result = analyzeProtectionIntent(store, flowId, await testSnapshot());
    expect(result.provenance.analysis).toBe("DEVELOPMENT_FIXTURE");
    expect(result.reasoning.kind).toBe("development-fixture");
  });

  it("judge surfaces render NO ORDER SENT for terminal authority outcomes", () => {
    const listSource = readFileSync("src/app/app/paper-trading/page.tsx", "utf8");
    const detailSource = readFileSync("src/app/app/paper-trading/[runId]/page.tsx", "utf8");
    const proofSource = readFileSync("src/lib/proof/display.ts", "utf8");
    expect(listSource).toContain("NO ORDER SENT");
    expect(detailSource).toContain("NO ORDER SENT · AUTHORITY STOPPED THE ACTION");
    expect(proofSource).toContain("POLICY REFUSED — NO ORDER SENT");
  });
});

describe("fixture event provenance is classified by ref shape", () => {
  it("demo fixture refs stay TENAX_DOMAIN while keeping the fixture marker", async () => {
    const { runJudgeDemo } = await import("../src/lib/tenax/judge-demo");
    const store = createDevStore();
    const result = await runJudgeDemo(store, { nowMs: Date.now() });
    expect(result.authorityOutcome).toBe("REFUSE");
    const runs = await getPaperTradingRunRepository().listRuns();
    const run = runs.find((r) => r.flowId === result.flowId);
    expect(run?.provenance.event).toBe("TENAX_DOMAIN");
    expect(run?.event.contextRefs).toEqual(
      expect.arrayContaining(["demo:controlled-fixture"]),
    );
    expect(run?.status).toBe("REFUSED");
    expect(run?.execution.status).toBe("NO_ORDER");
  });

  it("genuine snapshot refs keep BITGET_PUBLIC provenance", async () => {
    const { store, flowId } = await setupPassFlow();
    activateMandate(store);
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("EXECUTED");
    const runs = await getPaperTradingRunRepository().listRuns();
    const run = runs.find((r) => r.flowId === flowId);
    // Fixture analysis evidence refs are snapshot endpoint rows (GET …),
    // i.e. genuinely public market data consumed as sample context.
    expect(run?.provenance.event).toBe("BITGET_PUBLIC");
    expect(run?.event.contextRefs.some((ref) => ref.trim().toLowerCase().startsWith("get "))).toBe(true);
  });

  it("model bitget:public refs keep BITGET_PUBLIC on an AI refusal run", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    const calls: Array<{ url: string; method: string; body: string }> = [];
    const analyzed = await analyzeProtectionIntentWithAi(store, flowId, snapshot, {
      config: TEST_AI_CONFIG,
      fetchImpl: fakeAiFetch(aiModelOutput(), calls),
      nowMs: NOW,
    });
    expect(analyzed.mandateVerdict).toBe("REFUSE");
    const { recordDeterministicRefusal } = await import("../src/lib/tenax/index");
    await recordDeterministicRefusal(store, flowId, { nowMs: Date.now() });
    const runs = await getPaperTradingRunRepository().listRuns();
    const run = runs.find((r) => r.flowId === flowId);
    expect(run?.provenance.event).toBe("BITGET_PUBLIC");
    expect(run?.decision.provider).toBe("groq");
  });

  it("free-form model refs without public markers stay TENAX_DOMAIN", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    const calls: Array<{ url: string; method: string; body: string }> = [];
    const analyzed = await analyzeProtectionIntentWithAi(store, flowId, snapshot, {
      config: TEST_AI_CONFIG,
      fetchImpl: fakeAiFetch(
        aiModelOutput({ evidenceRefs: ["operator note: watch earnings chatter"] }),
        calls,
      ),
      nowMs: NOW,
    });
    expect(analyzed.mandateVerdict).toBe("REFUSE");
    const { recordDeterministicRefusal } = await import("../src/lib/tenax/index");
    await recordDeterministicRefusal(store, flowId, { nowMs: Date.now() });
    const runs = await getPaperTradingRunRepository().listRuns();
    const run = runs.find((r) => r.flowId === flowId);
    expect(run?.provenance.event).toBe("TENAX_DOMAIN");
    expect(run?.event.contextRefs).toEqual(["operator note: watch earnings chatter"]);
  });
});

describe("preview run preserves standing authority metadata", () => {
  it("DRY_RUN EXECUTED run carries mandate id, mode, bounds, and hash", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = activateMandate(store);
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("EXECUTED");
    // The receipt-ready event carries proven mandate facts.
    const event = store.activities.find(
      (a) => a.flowId === flowId && a.type === "DECISION_RECEIPT_READY",
    );
    expect(event?.details).toMatchObject({
      mandateId: mandate.id,
      mode: "AUTO_WITHIN_MANDATE",
      maxPct: 30,
      maxNotional: 150,
      maxExecutions: 1,
    });
    expect(typeof event?.details?.mandateHash).toBe("string");
    expect(event?.details?.reasonCodes).toEqual([]);
    // The durable run preserves them verbatim.
    const runs = await getPaperTradingRunRepository().listRuns();
    const run = runs.find((r) => r.flowId === flowId);
    expect(run?.status).toBe("EXECUTED");
    expect(run?.authority.outcome).toBe("EXECUTE");
    expect(run?.authority.mandateId).toBe(mandate.id);
    expect(run?.authority.mode).toBe("AUTO_WITHIN_MANDATE");
    expect(run?.authority.mandateHash).toBe(mandate.mandateHash);
    expect(run?.authority.bounds).toMatchObject({
      maxProtectionPct: 30,
      maxNotionalUsdt: 150,
      maxExecutions: 1,
    });
    expect(run?.authority.reasonCodes).toEqual([]);
    // Preview truth unchanged: no order, no fill, no proof.
    expect(run?.execution.status).toBe("PREVIEW");
    expect(run?.execution.submitted).toBe(false);
    expect(run?.execution.orderId).toBeNull();
    const ownEventIds = new Set(store.activities.map((a) => a.id));
    const proofs = await getProofRepository().repo.listProofs({ flowId });
    expect(proofs.filter((p) => ownEventIds.has(p.sourceActivityEventId))).toEqual([]);
  });
});
