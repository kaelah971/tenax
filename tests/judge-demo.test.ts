// Tenax judge-demo regressions (offline, no network).
//
// Proves through the real service seam: one RUN DEMO produces terminal
// REFUSE evidence (activity + POLICY_REFUSED proof + NO_ORDER run) with
// canonical proposal values and DEVELOPMENT_FIXTURE provenance; reruns
// mint fresh identities without weakening retry protection; the demo
// module performs zero external I/O; landing/docs wire the real route,
// scripts, and env names. No live calls, no writes.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { hashProposal } from "../src/lib/tenax/approval";
import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import { createDevStore, getDecisionReceipt } from "../src/lib/tenax/index";
import {
  JUDGE_DEMO_PROVENANCE,
  runJudgeDemo,
  runJudgeExecutionDemo,
} from "../src/lib/tenax/judge-demo";
import { getProofRepository } from "../src/lib/proof/repository";
import {
  getPaperTradingRunRepository,
  InMemoryPaperTradingRunRepository,
  resetPaperTradingRunRepositoryForTests,
  type PaperTradingRunRepository,
} from "../src/lib/tenax/paper-trading-run-repository";
import type { PaperTradingRun } from "../src/lib/tenax/paper-trading-run";
import { POST as demoRunPost } from "../src/app/api/demo/run/route";
import { calculatePaperTradingMetrics } from "../src/lib/tenax/paper-trading-metrics";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const NOW_A = Date.parse("2026-10-07T12:00:00.000Z");
const NOW_B = Date.parse("2026-10-07T12:00:01.000Z");

beforeEach(() => {
  resetPaperTradingRunRepositoryForTests();
});

describe("judge demo terminal REFUSE", () => {
  it("produces linked activity + proof + run with canonical values", async () => {
    const store = createDevStore();
    const result = await runJudgeDemo(store, { nowMs: NOW_A });
    expect(result.authorityOutcome).toBe("REFUSE");
    expect(result.executionStatus).toBe("NO_ORDER");
    expect(result.mandateVerdict).toBe("REFUSE");
    expect(result.provenance).toBe("DEVELOPMENT_FIXTURE");
    expect(result.protectionPct).toBe(40);
    expect(result.proposedTradeValueUsdt).toBe(200);
    expect(result.failedRules).toEqual(expect.arrayContaining(["max_protection_pct", "max_trade_value"]));
    expect(result.proposalHash).toBe(
      hashProposal({ underlying: "NVDA", protectionPct: 40, proposedTradeValueUsdt: 200, leverageUsed: 1 }),
    );
    expect(result.stages).toHaveLength(6);
    expect(result.stages.every((stage) => stage.status === "COMPLETE")).toBe(true);
    expect(result.runId).toBe(`paper-run:v1:${result.flowId}`);
    expect(result.proofId).toContain("POLICY_REFUSED");

    const events = store.activities.filter((a) => a.flowId === result.flowId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: result.activityId,
      type: "DETERMINISTIC_POLICY_REFUSED",
    });

    const proofs = await getProofRepository().repo.listProofs({ flowId: result.flowId });
    const proof = proofs.find((p) => p.id === result.proofId);
    expect(proof).toMatchObject({
      kind: "POLICY_REFUSED",
      outcome: "NO ORDER SENT",
      execution: null,
      authority: { source: "DETERMINISTIC_MANDATE" },
      proposal: { protectionPct: 40, notionalUsd: 200 },
    });

    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: result.runId,
      status: "REFUSED",
      symbol: "NVDAUSDT",
      authority: { outcome: "REFUSE" },
      execution: { status: "NO_ORDER", submitted: false, orderId: null },
      outcome: { outcomeState: "NOT_OBSERVED" },
    });
    expect(runs[0]!.sourceActivityEventId).toBe(result.activityId);
    expect(runs[0]!.sourceProofId).toBe(result.proofId);
    expect(JUDGE_DEMO_PROVENANCE).toBe("DEVELOPMENT_FIXTURE");
  });

  it("reruns mint fresh identities with the same terminal verdict", async () => {
    const store = createDevStore();
    const first = await runJudgeDemo(store, { nowMs: NOW_A });
    const second = await runJudgeDemo(store, { nowMs: NOW_B });
    expect(second.flowId).not.toBe(first.flowId);
    expect(second.runId).not.toBe(first.runId);
    expect(second.proofId).not.toBe(first.proofId);
    expect(second.authorityOutcome).toBe("REFUSE");
    expect(second.executionStatus).toBe("NO_ORDER");
    expect(await getPaperTradingRunRepository().listRuns()).toHaveLength(2);
  });

  it("performs zero external I/O by construction", () => {
    const source = readFileSync("src/lib/tenax/judge-demo.ts", "utf8");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("GROQ");
    expect(source).not.toContain("OPENAI");
    expect(source).not.toContain("BITGET_API");
    const routeSource = readFileSync("src/app/api/demo/run/route.ts", "utf8");
    expect(routeSource).not.toContain("fetch(");
    expect(routeSource).not.toContain("process.env");
  });
});

describe("demo route wiring", () => {
  it("POST /api/demo/run returns terminal REFUSE evidence", async () => {
    const response = await demoRunPost();
    const body = (await response.json()) as { ok: boolean; authorityOutcome?: string; runId?: string };
    expect(body.ok).toBe(true);
    expect(body.authorityOutcome).toBe("REFUSE");
    expect(typeof body.runId).toBe("string");
  });

  it("demo page renders from response stages with real record links", () => {
    const runner = readFileSync("src/app/app/demo/DemoRunner.tsx", "utf8");
    expect(runner).toContain('fetch("/api/demo/run"');
    expect(runner).toContain("result.stages.map");
    expect(runner).toContain("/app/paper-trading/${encodeURIComponent(result.runId)}");
    expect(runner).toContain("/app/proof/${encodeURIComponent(result.proofId)}");
    expect(runner).toContain("NO ORDER SENT");
    expect(runner).not.toContain("setTimeout");
    expect(runner).not.toContain("setInterval");
  });
});

describe("landing and docs wiring", () => {
  it("landing SEE DEMO points to /app/demo without replacing OPEN APP", () => {
    const landing = readFileSync("src/app/page.tsx", "utf8");
    expect(landing).toContain("SEE DEMO");
    expect(landing).toContain('href="/app/demo"');
    expect(landing).toContain("OPEN APP");
  });

  it("judge docs reference real routes, scripts, and env names", () => {
    const docs = readFileSync("docs/JUDGE_QUICKSTART.md", "utf8");
    for (const token of [
      "SEE DEMO",
      "RUN DEMO",
      "/app/demo",
      "/api/health",
      "npm run dev",
      "localhost:3000",
      "DATABASE_URL",
      "TENAX_ANALYSIS_MODE",
      "GROQ_API_KEY",
      "BITGET_API_KEY",
      "BITGET_TRADING_MODE",
      "TENAX_EXECUTION_MODE",
      "[HOSTED_TENAX_URL]",
    ]) {
      expect(docs).toContain(token);
    }
    // Localhost belongs only to the local-inspection path.
    const primary = docs.split("## B.")[0] ?? "";
    expect(primary).not.toContain("localhost");
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("docs/JUDGE_QUICKSTART.md");
  });
});

describe("judge execution demo (authorized preview)", () => {
  async function testSnapshot() {
    return normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
    );
  }

  it("passes mandate and executes an honest DRY_RUN preview with receipt + run", async () => {
    const store = createDevStore();
    const result = await runJudgeExecutionDemo(store, {
      snapshot: await testSnapshot(),
    });
    expect(result.authorityOutcome).toBe("EXECUTE");
    expect(result.executionStatus).toBe("PREVIEW");
    expect(result.mandateVerdict).toBe("PASS");
    expect(result.provenance).toBe("DEVELOPMENT_FIXTURE");
    expect(result.protectionPct).toBe(20);
    expect(result.proposedTradeValueUsdt).toBe(100);
    expect(result.proposalHash).toBe(
      hashProposal({ underlying: "NVDA", protectionPct: 20, proposedTradeValueUsdt: 100, leverageUsed: 1 }),
    );
    expect(result.stages).toHaveLength(7);
    expect(result.stages.every((stage) => stage.status === "COMPLETE")).toBe(true);
    expect(result.runId).toBe(`paper-run:v1:${result.flowId}`);
    expect(result.receiptId).toBe(`TENAX-1C-${result.flowId}`);

    const { receipt } = getDecisionReceipt(store, result.flowId);
    expect(receipt.executionMode).toBe("DRY_RUN");
    expect(receipt.fundsMoved).toBe(false);

    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: result.runId,
      status: "EXECUTED",
      symbol: "NVDAUSDT",
      environment: "DRY_RUN",
      authority: { outcome: "EXECUTE" },
      execution: { status: "PREVIEW", submitted: false, orderId: null },
      outcome: { outcomeState: "NOT_OBSERVED" },
    });

    // Previews earn no execution proof — receipt + run are the records.
    const proofs = await getProofRepository().repo.listProofs({ flowId: result.flowId });
    expect(proofs).toEqual([]);
  });

  it("never fabricates fills, fees, or realized outcomes", async () => {
    const store = createDevStore();
    const result = await runJudgeExecutionDemo(store, {
      snapshot: await testSnapshot(),
    });
    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs[0]!.execution.status).not.toBe("FILLED");
    expect(runs[0]!.outcome.realizedPnlUsdt).toBeNull();
    expect(runs[0]!.outcome.exitPrice).toBeNull();
    const metrics = calculatePaperTradingMetrics(runs);
    expect(metrics.riskControl.executed).toBe(1);
    expect(metrics.performance.realizedRunCount).toBe(0);
    expect(metrics.performance.sharpeStatus).toBe("INSUFFICIENT_DATA");
    expect(result.executionStatus).toBe("PREVIEW");
  });

  it("reruns mint fresh flow and receipt identities on a shared mandate", async () => {
    const store = createDevStore();
    const first = await runJudgeExecutionDemo(store, {
      snapshot: await testSnapshot(),
    });
    const second = await runJudgeExecutionDemo(store, {
      snapshot: await testSnapshot(),
    });
    expect(second.flowId).not.toBe(first.flowId);
    expect(second.runId).not.toBe(first.runId);
    expect(second.receiptId).not.toBe(first.receiptId);
    expect(second.authorityOutcome).toBe("EXECUTE");
    // One shared mandate: the second run reused it instead of failing on
    // the single-active invariant, and DRY_RUN consumed no budget.
    expect(store.mandates.size).toBe(1);
    expect(await getPaperTradingRunRepository().listRuns()).toHaveLength(2);
  });

  it("rejects unknown demo scenarios at the route boundary", async () => {
    const response = await (
      await import("../src/app/api/demo/run/route")
    ).POST(
      new Request("http://localhost/api/demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "bogus" }),
      }) as never,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("demo page presents both scenarios with honest expectations", () => {
    const page = readFileSync("src/app/app/demo/page.tsx", "utf8");
    expect(page).toContain("RUN REFUSAL DEMO");
    expect(page).toContain("RUN EXECUTION DEMO");
    expect(page).toContain("SCENARIO 1 · AUTHORITY STOP");
    expect(page).toContain("SCENARIO 2 · AUTHORIZED EXECUTION");
    expect(page).toContain("PREVIEW, NEVER SUBMITTED");
    const runner = readFileSync("src/app/app/demo/DemoRunner.tsx", "utf8");
    expect(runner).toContain("VIEW DECISION RECEIPT");
    expect(runner).toContain("PREVIEW · NO FUNDS MOVED");
  });
});

describe("judge execution demo flow identity (serverless-safe)", () => {
  async function testSnapshot() {
    return normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
    );
  }

  function historicalFlow0001Run(): PaperTradingRun {
    return {
      version: 1,
      runId: "paper-run:v1:flow-0001",
      flowId: "flow-0001",
      createdAt: new Date(NOW_A).toISOString(),
      environment: "DRY_RUN",
      symbol: "NVDAUSDT",
      status: "REFUSED",
      sourceActivityEventId: "act-historical",
      sourceProofId: null,
      event: {
        eventType: "UNKNOWN",
        eventId: null,
        contextRefs: [],
        observedPrice: null,
        observedAt: null,
      },
      decision: {
        provider: null,
        model: null,
        decision: null,
        summary: null,
        direction: "UNKNOWN",
        proposedNotionalUsdt: null,
        proposedProtectionPct: null,
        reasoning: null,
        proposedAt: null,
      },
      authority: {
        mandateId: null,
        mandateHash: null,
        mode: null,
        outcome: "REFUSE",
        reasonCodes: ["historical"],
        bounds: null,
      },
      execution: {
        provider: null,
        orderId: null,
        status: "NO_ORDER",
        submitted: false,
        side: null,
        size: null,
        price: null,
        fees: null,
        submittedAt: null,
        verifiedAt: null,
        noOrderReason: "historical",
      },
      outcome: {
        outcomeState: "NOT_OBSERVED",
        markPrice: null,
        markAt: null,
        markSource: null,
        markPnlUsdt: null,
        markReturnPct: null,
        exitPrice: null,
        exitSize: null,
        exitAt: null,
        exitProviderOrderId: null,
        exitSource: null,
        realizedPnlUsdt: null,
        realizedReturnPct: null,
        feesUsdt: null,
        netRealizedPnlUsdt: null,
        pnlObservedAt: null,
        unrealizedPnlUsdt: null,
      },
      provenance: {
        event: "TENAX_DOMAIN",
        decision: "TENAX_DOMAIN",
        authority: "TENAX_DOMAIN",
        execution: "TENAX_DOMAIN",
        outcome: "DERIVED",
      },
    };
  }

  it("two cold serverless-like contexts never mint colliding flowIds", async () => {
    const firstStore = createDevStore();
    const secondStore = createDevStore();
    const snapshot = await testSnapshot();
    // Same millisecond on both "processes": only randomness separates them.
    const first = await runJudgeExecutionDemo(firstStore, { snapshot, nowMs: NOW_A });
    const second = await runJudgeExecutionDemo(secondStore, { snapshot, nowMs: NOW_A });
    expect(first.flowId).not.toBe("flow-0001");
    expect(first.flowId.startsWith("demo-")).toBe(true);
    expect(second.flowId).not.toBe(first.flowId);
    expect(second.runId).not.toBe(first.runId);
    expect(second.authorityOutcome).toBe("EXECUTE");
  });

  it("a historical flow-0001 record does not block a fresh execution demo", async () => {
    const repository = new InMemoryPaperTradingRunRepository();
    await repository.saveRun(historicalFlow0001Run());
    const store = createDevStore();
    const result = await runJudgeExecutionDemo(store, {
      snapshot: await testSnapshot(),
      runRepository: repository,
    });
    expect(result.flowId).not.toBe("flow-0001");
    expect(result.authorityOutcome).toBe("EXECUTE");
    expect(result.executionStatus).toBe("PREVIEW");
    expect(await repository.listRuns()).toHaveLength(2);
    // Historical record untouched.
    expect((await repository.getRun("paper-run:v1:flow-0001"))?.authority.reasonCodes).toEqual([
      "historical",
    ]);
  });

  it("a persisted preview is immediately retrievable as the exact record", async () => {
    const repository = new InMemoryPaperTradingRunRepository();
    const store = createDevStore();
    const result = await runJudgeExecutionDemo(store, {
      snapshot: await testSnapshot(),
      runRepository: repository,
    });
    const reread = await repository.getRun(result.runId);
    expect(reread?.flowId).toBe(result.flowId);
    expect(reread?.authority.outcome).toBe("EXECUTE");
    expect(reread?.execution.status).toBe("PREVIEW");
    expect(reread?.execution.submitted).toBe(false);
    expect(reread?.execution.orderId).toBeNull();
  });

  it("failed persistence cannot return demo success", async () => {
    class WriteFailingRuns extends InMemoryPaperTradingRunRepository {
      override async saveRun(): Promise<PaperTradingRun> {
        throw new Error("PAPER_RUN_STORE_UNAVAILABLE");
      }
      override async updateRun(): Promise<PaperTradingRun | null> {
        throw new Error("PAPER_RUN_STORE_UNAVAILABLE");
      }
    }
    const store = createDevStore();
    await expect(
      runJudgeExecutionDemo(store, {
        snapshot: await testSnapshot(),
        runRepository: new WriteFailingRuns() as PaperTradingRunRepository,
      }),
    ).rejects.toThrow(/not retrievable|was not recorded|UNAVAILABLE/);
  });
});
