// Tenax Phase 1D — product UI/integration tests (no network, no browser).
//
// Component rendering needs a browser environment the unit suite does not
// have, so this file pins the testable UI contracts instead: cached data
// flow, display mappings, honesty copy, route surface, and unknown-flow
// handling. Rendering behavior stays covered by typecheck + production build.
import { describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { createSnapshotCache } from "../src/lib/bitget/snapshot-cache";
import { MANDATE_CHECK_IDS, type MandateCheck } from "../src/lib/tenax/domain";
import {
  MANDATE_FIXTURE,
  NVDA_EXPOSURE_FIXTURE,
  PROPOSAL_PASS_FIXTURE,
  PROPOSAL_REFUSE_VALUE_FIXTURE,
  analyzeInputSchema,
  approveProtection,
  approveProtectionProposal,
  createApprovalRequest,
  createDevStore,
  dryRunAdapter,
  evaluateMandate,
  getCapitalContext,
  getDecisionReceipt,
} from "../src/lib/tenax/index";
import { GET as capitalGet } from "../src/app/api/capital/nvda/route";
import { POST as analyzePost } from "../src/app/api/protection/analyze/route";
import { POST as approvePost } from "../src/app/api/protection/approve/route";
import { POST as executePost } from "../src/app/api/protection/execute/route";
import {
  approveCta,
  CHAIN_STEPS,
  DATE_UNAVAILABLE_LINE,
  DRY_RUN_PRE_NOTICE,
  refusalSentence,
} from "../src/app/app/_copy";
import {
  CHECK_TITLES,
  checkDisplay,
  formatCompact,
  formatMarketTime,
  formatPct,
  formatUsd,
  ledgerRows,
  provenanceDisplay,
  provenanceMarker,
  railStages,
  rulesCleared,
} from "../src/app/app/_components/ui";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

describe("snapshot cache", () => {
  it("fetches once within the TTL", async () => {
    let calls = 0;
    const cache = createSnapshotCache(
      60_000,
      {
        async getJson(url: string) {
          calls += 1;
          return stubClientFor(FULL_PAYLOADS).getJson(url);
        },
      },
      { gapMs: 0 },
    );
    const firstBundle = await cache.getBundle();
    const secondBundle = await cache.getBundle();
    expect(calls).toBe(8);
    expect(secondBundle).toBe(firstBundle);
    const snapshot = await cache.getSnapshot();
    expect(calls).toBe(8);
    expect(snapshot.instrument.availability).toBe("AVAILABLE");
  });

  it("refetches when the TTL is zero", async () => {
    let calls = 0;
    const cache = createSnapshotCache(
      0,
      {
        async getJson(url: string) {
          calls += 1;
          return stubClientFor(FULL_PAYLOADS).getJson(url);
        },
      },
      { gapMs: 0 },
    );
    await cache.getSnapshot();
    await cache.getSnapshot();
    expect(calls).toBe(16);
  });
});

describe("display mappings", () => {
  it("titles every mandate check without inventing rules", () => {
    expect(Object.keys(CHECK_TITLES).sort()).toEqual([...MANDATE_CHECK_IDS].sort());
    for (const title of Object.values(CHECK_TITLES)) {
      expect(title.length).toBeGreaterThan(0);
    }
  });

  it("renders PASS, REFUSED, and REQUIRED distinctly", () => {
    const pass: MandateCheck = { id: "max_trade_value", pass: true, detail: "x" };
    expect(checkDisplay(pass)).toMatchObject({ tone: "pass", label: "PASS" });
    const refused: MandateCheck = { id: "max_trade_value", pass: false, detail: "x" };
    expect(checkDisplay(refused)).toMatchObject({ tone: "refused", label: "REFUSED" });
    const approval: MandateCheck = { id: "approval_required", pass: true, detail: "x" };
    expect(checkDisplay(approval)).toMatchObject({ tone: "dryrun", label: "REQUIRED" });
  });

  it("formats money and percentages for tabular display", () => {
    expect(formatUsd(100)).toBe("$100");
    expect(formatUsd(102.5)).toBe("$102.50");
    expect(formatPct(20)).toBe("20%");
  });
});

describe("decision rail", () => {
  it("marks active, completed, and future stages", () => {
    const stages = railStages("MANDATE");
    expect(stages.map((s) => `${s.index} ${s.label}:${s.state}`)).toEqual([
      "01 EXPOSURE:done",
      "02 INTENT:done",
      "03 INTELLIGENCE:done",
      "04 MANDATE:active",
      "05 ACTION:todo",
      "06 RECEIPT:todo",
    ]);
  });

  it("stays quiet on unknown stages", () => {
    expect(railStages("SOMETHING_ELSE").every((s) => s.state === "todo")).toBe(true);
  });
});

describe("provenance markers", () => {
  it("keeps the four required truths with distinct markers", () => {
    expect(provenanceMarker("LIVE BITGET DATA")).toMatchObject({ glyph: "●", hot: true });
    expect(provenanceMarker("SIMULATED PORTFOLIO").glyph).toBe("○");
    expect(provenanceMarker("DEVELOPMENT ANALYSIS").glyph).toBe("◇");
    expect(provenanceMarker("DRY_RUN EXECUTION").glyph).toBe("□");
    expect(provenanceMarker("BITGET DATA UNAVAILABLE")).toMatchObject({ alert: true });
  });
});

describe("market display helpers", () => {
  it("compacts large figures without inventing precision", () => {
    expect(formatCompact("145580319.3223")).toBe("145.58M");
    expect(formatCompact("2500000000")).toBe("2.50B");
    expect(formatCompact("1500")).toBe("1.50K");
    expect(formatCompact("221.57")).toBe("221.57");
    expect(formatCompact(null)).toBe("—");
    expect(formatCompact("not-a-number")).toBe("—");
  });

  it("renders compact UTC product time with exact ISO behind it", () => {
    expect(formatMarketTime("2026-09-18T23:01:00.000Z")).toBe("23:01 UTC");
    expect(formatMarketTime("not-a-date")).toBe("—");
    expect(formatMarketTime(null)).toBe("—");
  });

  it("displays the execution mode as DRY RUN, never DRY_RUN", () => {
    expect(provenanceDisplay("DRY_RUN EXECUTION")).toBe("DRY RUN EXECUTION");
    expect(provenanceDisplay("LIVE BITGET DATA")).toBe("LIVE BITGET DATA");
  });
});

describe("permission ledger", () => {
  it("indexes every rule with proposal-derived values, approval always WAITING", () => {
    const decision = evaluateMandate(
      PROPOSAL_PASS_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    const rows = ledgerRows(decision, PROPOSAL_PASS_FIXTURE, { maxPct: 30, maxTrade: 150 });
    expect(rows.map((r) => r.index)).toEqual(["01", "02", "03", "04", "05", "06"]);
    expect(rows.map((r) => r.title)).toEqual(
      expect.arrayContaining(["EXPOSURE", "MAX HEDGE", "MAX TRADE", "LEVERAGE", "HUMAN APPROVAL"]),
    );
    expect(rows.find((r) => r.title === "MAX TRADE")).toMatchObject({
      value: "$100 / $150",
      state: "PASS",
    });
    expect(rows.find((r) => r.title === "HUMAN APPROVAL")).toMatchObject({
      value: "REQUIRED",
      state: "WAITING",
    });
  });

  it("counts cleared rules truthfully from the decision", () => {
    const pass = evaluateMandate(PROPOSAL_PASS_FIXTURE, MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE);
    expect(rulesCleared(pass)).toEqual({ cleared: 6, total: 6 });
    const refuse = evaluateMandate(
      PROPOSAL_REFUSE_VALUE_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    const counted = rulesCleared(refuse);
    expect(counted.total).toBe(6);
    expect(counted.cleared).toBeLessThan(6);
    const rows = ledgerRows(refuse, PROPOSAL_REFUSE_VALUE_FIXTURE, { maxPct: 30, maxTrade: 150 });
    expect(rows.find((r) => r.title === "MAX TRADE")).toMatchObject({
      value: "$200 / $150",
      state: "REFUSED",
    });
  });
});

describe("approval transition", () => {
  it("moves WAITING to APPROVED with a timestamp, human only", () => {
    const decision = evaluateMandate(
      PROPOSAL_PASS_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    const pending = createApprovalRequest("intent-1", PROPOSAL_PASS_FIXTURE, decision);
    expect(pending.state).toBe("REQUIRED");
    expect(pending.approvedAt).toBeNull();
    const granted = approveProtection(pending, "human", "2026-09-18T00:00:00.000Z");
    expect(granted.state).toBe("APPROVED");
    expect(granted.approvedAt).toBe("2026-09-18T00:00:00.000Z");
  });
});

describe("execution preview honesty", () => {
  it("exposes only the would-be request shape, no fake identifiers", () => {
    const result = dryRunAdapter.executeProtection({ qty: "0.4513" });
    expect(Object.keys(result.request).sort()).toEqual(
      ["category", "endpoint", "kind", "mode", "operationId", "orderType", "posSide", "qty", "side", "symbol"],
    );
    expect(result.request).toMatchObject({
      category: "USDT-FUTURES",
      symbol: "NVDAUSDT",
      side: "sell",
      posSide: "short",
      orderType: "market",
    });
    expect(JSON.stringify(result)).not.toMatch(/orderId|txHash|transactionHash|success/i);
    expect(result.disclaimer).toMatch(/NO FUNDS MOVED/);
  });
});

describe("honesty copy", () => {
  it("dry-run language never claims execution", () => {
    expect(DRY_RUN_PRE_NOTICE).toMatch(/no funds/i);
    expect(DRY_RUN_PRE_NOTICE).not.toMatch(/execut/i);
  });

  it("earnings timing stays explicitly unavailable", () => {
    expect(DATE_UNAVAILABLE_LINE).toMatch(/unavailable/i);
    expect(DATE_UNAVAILABLE_LINE).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("covers the six-stage decision rail including the gate", () => {
    expect([...CHAIN_STEPS]).toEqual(["EXPOSURE", "INTENT", "INTELLIGENCE", "MANDATE", "ACTION", "RECEIPT"]);
  });

  it("names the failed rule in refusal sentences", () => {
    expect(refusalSentence(["max_trade_value"])).toMatch(/\$150.*No action was taken/);
    expect(refusalSentence(["underlying_allowed"])).toMatch(/not covered.*No action was taken/);
    expect(approveCta(100)).toBe("Approve $100 protection");
  });
});

describe("route surface", () => {
  it("exposes GET capital and POST protection handlers", () => {
    expect(typeof capitalGet).toBe("function");
    expect(typeof analyzePost).toBe("function");
    expect(typeof approvePost).toBe("function");
    expect(typeof executePost).toBe("function");
  });

  it("rejects unknown flowIds without leaking state", () => {
    const store = createDevStore();
    expect(() => getDecisionReceipt(store, "flow-9999")).toThrow(/unknown flowId/);
    expect(() =>
      approveProtectionProposal(store, { flowId: "flow-9999", actor: "human" }),
    ).toThrow(/unknown flowId/);
  });

  it("validates analyze input before touching any flow", () => {
    expect(analyzeInputSchema.safeParse({ rawText: "" }).success).toBe(false);
    expect(analyzeInputSchema.safeParse({ rawText: "x".repeat(501) }).success).toBe(false);
  });
});

describe("capital provenance", () => {
  it("labels market, portfolio, analysis, and execution honesty", async () => {
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
  });
});
