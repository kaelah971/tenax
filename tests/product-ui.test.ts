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
  analyzeInputSchema,
  approveProtectionProposal,
  createDevStore,
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
  formatPct,
  formatUsd,
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

describe("honesty copy", () => {
  it("dry-run language never claims execution", () => {
    expect(DRY_RUN_PRE_NOTICE).toMatch(/no funds/i);
    expect(DRY_RUN_PRE_NOTICE).not.toMatch(/execut/i);
  });

  it("earnings timing stays explicitly unavailable", () => {
    expect(DATE_UNAVAILABLE_LINE).toMatch(/unavailable/i);
    expect(DATE_UNAVAILABLE_LINE).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("covers the full decision chain including the gate", () => {
    expect([...CHAIN_STEPS]).toEqual(
      expect.arrayContaining(["Exposure", "Mandate", "Approval", "Receipt"]),
    );
    expect(CHAIN_STEPS).toHaveLength(8);
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
