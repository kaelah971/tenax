// Tenax product-clarity regressions (source-level, no rendering).
//
// Locks the B8 copy contract: orientation lines teach the mental model,
// proposal-vs-permission stays explicit, refusal compares proposal against
// mandate bounds from live values, misleading live/online labels are gone,
// and the demo teaches while it runs. Copy-only; no behavior asserted
// here beyond what existing domain tests already pin.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEMO_TAKEAWAY_LINE,
  OVER_AUTHORITY_LINE,
  PROPOSAL_NOT_PERMISSION_LINE,
} from "../src/app/app/_copy";

const capital = () => readFileSync("src/app/app/page.tsx", "utf8");
const events = () => readFileSync("src/app/app/events/page.tsx", "utf8");
const analysis = () => readFileSync("src/app/app/analysis/[id]/page.tsx", "utf8");
const proof = () => readFileSync("src/app/app/proof/page.tsx", "utf8");
const demoService = () => readFileSync("src/lib/tenax/judge-demo.ts", "utf8");
const demoRunner = () => readFileSync("src/app/app/demo/DemoRunner.tsx", "utf8");

describe("orientation copy", () => {
  it("defines the exact teaching sentences", () => {
    expect(PROPOSAL_NOT_PERMISSION_LINE).toBe("This is a proposal, not permission to trade.");
    expect(OVER_AUTHORITY_LINE).toBe("The AI asked for more authority than it had.");
    expect(DEMO_TAKEAWAY_LINE).toBe(
      "The AI could recommend the action. It did not have permission to execute it.",
    );
  });

  it("capital page orients first-time users", () => {
    expect(capital()).toContain("lets AI propose actions");
    expect(capital()).toContain("checks every proposal against your limits");
  });

  it("event room connects events to proposals without granting authority", () => {
    expect(events()).toContain("Events create risk");
    expect(events()).toContain("still has no authority to trade");
    expect(events()).toContain("ANALYZE PROTECTION");
    expect(events()).not.toContain("PROTECT THIS POSITION");
  });

  it("proof page answers why the evidence matters", () => {
    expect(proof()).toContain("what the AI proposed, what the authority layer decided");
  });
});

describe("proposal vs permission", () => {
  it("analysis states the boundary next to the proposed values", () => {
    expect(analysis()).toContain("PROPOSAL_NOT_PERMISSION_LINE");
  });

  it("refusal compares live proposal numbers against live mandate bounds", () => {
    expect(analysis()).toContain("AI PROPOSED");
    expect(analysis()).toContain("MANDATE ALLOWS");
    expect(analysis()).toContain("OVER_AUTHORITY_LINE");
    expect(analysis()).toContain("NO ORDER SENT");
  });
});

describe("honest connectivity language", () => {
  it("names market-data connectivity explicitly", () => {
    expect(capital()).toContain("MARKET DATA · LIVE");
    expect(capital()).not.toContain("LIVE · ${");
  });

  it("names analysis readiness instead of agent status", () => {
    expect(capital()).toContain("AI ANALYSIS");
    expect(capital()).not.toContain("ASSESSMENT AVAILABLE");
    expect(capital()).not.toContain("AGENT STATUS");
  });
});

describe("demo teaches the story", () => {
  it("stages read as meaning, not just labels", () => {
    expect(demoService()).toContain("01 · CAPITAL");
    expect(demoService()).toContain("02 · EVENT");
    expect(demoService()).toContain("03 · AI INTENT");
    expect(demoService()).toContain("04 · AUTHORITY");
    expect(demoService()).toContain("05 · DECISION");
    expect(demoService()).toContain("06 · EVIDENCE");
    expect(demoService()).toContain("fixture input, not model output");
  });

  it("completion states the takeaway", () => {
    expect(demoRunner()).toContain("DEMO_TAKEAWAY_LINE");
  });
});
