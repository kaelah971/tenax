// Tenax judge-journey clarity regressions (source-level, no rendering).
//
// Locks the B7 fixes: the authority-separation message, AI-vs-fixture
// labeling derived from seated truth (never hardcoded), run↔proof↔receipt
// journey links, refusal-as-authority language, and zero write/AI-call
// surface in judge rendering. No live network, no writes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AUTHORITY_SEPARATION_LINE } from "../src/app/app/_copy";

const analysisSource = () => readFileSync("src/app/app/analysis/[id]/page.tsx", "utf8");
const receiptsSource = () => readFileSync("src/app/app/receipts/[id]/page.tsx", "utf8");
const protectSource = () => readFileSync("src/app/app/protect/nvidia/page.tsx", "utf8");
const proofDetailSource = () => readFileSync("src/app/app/proof/[id]/page.tsx", "utf8");
const runDetailSource = () => readFileSync("src/app/app/paper-trading/[runId]/page.tsx", "utf8");

describe("authority separation message", () => {
  it("states the core boundary in judge copy", () => {
    expect(AUTHORITY_SEPARATION_LINE).toBe(
      "AI can propose. It cannot authorize itself — deterministic rules decide.",
    );
  });

  it("renders the boundary at the Final Tenax Decision", () => {
    expect(analysisSource()).toContain("AUTHORITY_SEPARATION_LINE");
    expect(analysisSource()).toContain("FINAL TENAX DECISION");
  });
});

describe("AI vs fixture labeling from seated truth", () => {
  it("receipt derives AI labeling from the flow audit, never a hardcoded strip", () => {
    expect(receiptsSource()).toContain("aiAudit");
    expect(receiptsSource()).toContain('isModel ? "AI ANALYSIS" : "DEVELOPMENT ANALYSIS"');
    expect(receiptsSource()).toContain('isModel ? "AI MODEL" : "◇ DEV"');
  });

  it("protect page derives its analysis label from the server analysis mode", () => {
    expect(protectSource()).toContain("resolveAnalysisMode");
    expect(protectSource()).toContain('resolveAnalysisMode(process.env) === "ai" ? "AI ANALYSIS"');
  });

  it("proof detail derives AI labeling from the linked run decision source", () => {
    expect(proofDetailSource()).toContain("runIsAi");
    expect(proofDetailSource()).toContain('runIsAi ? "AI ANALYSIS" : "DEVELOPMENT ANALYSIS"');
  });
});

describe("journey links across receipt, run, and proof", () => {
  it("receipt links durable proof and canonical run when present", () => {
    expect(receiptsSource()).toContain("VIEW DURABLE PROOF");
    expect(receiptsSource()).toContain("VIEW PAPER-TRADING RUN");
    expect(receiptsSource()).toContain("paperTradingRunId");
  });

  it("run detail links its durable proof", () => {
    expect(runDetailSource()).toContain("VIEW DURABLE PROOF");
    expect(runDetailSource()).toContain("sourceProofId");
  });

  it("proof detail links its canonical run", () => {
    expect(proofDetailSource()).toContain("VIEW PAPER-TRADING RUN");
    expect(proofDetailSource()).toContain("paperTradingRunId");
  });

  it("proof authority sources render as human words, never raw enum noise", () => {
    expect(proofDetailSource()).toContain("Deterministic Mandate");
    expect(proofDetailSource()).toContain("Human Approval");
  });
});

describe("refusal stays authority outcome, never failure", () => {
  it("analysis refusal block refuses with reason and no-order truth", () => {
    expect(analysisSource()).toContain("TENAX REFUSED");
    expect(analysisSource()).toContain("NO ORDER SENT");
    expect(analysisSource()).toContain("Reason:");
  });

  it("run detail marks terminal authority outcomes as no-order stops", () => {
    expect(runDetailSource()).toContain("NO ORDER SENT");
    expect(runDetailSource()).toContain("AUTHORITY STOPPED THE ACTION");
  });
});

describe("judge rendering introduces no writes or AI calls", () => {
  it("edited surfaces contain no fetch, submit, or inference entry points", () => {
    for (const source of [
      analysisSource(),
      receiptsSource(),
      protectSource(),
      proofDetailSource(),
      runDetailSource(),
    ]) {
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("placeDemoShortOrder");
      expect(source).not.toContain("submitDemoHedgeOrder");
      expect(source).not.toContain("requestAiAnalysis");
      expect(source).not.toContain("runAiAnalysis");
    }
  });
});
