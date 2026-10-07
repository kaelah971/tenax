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
import { createDevStore } from "../src/lib/tenax/index";
import {
  JUDGE_DEMO_PROVENANCE,
  runJudgeDemo,
} from "../src/lib/tenax/judge-demo";
import { getProofRepository } from "../src/lib/proof/repository";
import {
  getPaperTradingRunRepository,
  resetPaperTradingRunRepositoryForTests,
} from "../src/lib/tenax/paper-trading-run-repository";
import { POST as demoRunPost } from "../src/app/api/demo/run/route";

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
