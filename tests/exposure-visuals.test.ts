// Tenax Phase 4A — unified exposure visual helper tests (offline).
//
// Covers: coverage derived from canonical graph aggregates (98.35/500),
// available leaves contributing zero, unknown-protected implying unknown
// coverage, mandate rows rendering canonical evaluated values, refusal
// surfacing only from canonical refusal state, market provenance labeling
// (synthetic series never pass as real), and evaluation absence. Live
// market data and execution are NEVER exercised here.
import { describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import {
  MANDATE_FIXTURE,
  NVDA_EXPOSURE_FIXTURE,
  PROPOSAL_PASS_FIXTURE,
} from "../src/lib/tenax/fixtures";
import { evaluateMandate } from "../src/lib/tenax/mandate";
import {
  coveragePercent,
  mandateVisualRows,
  marketPanelModel,
} from "../src/lib/tenax/visuals";
import {
  analyzeProtectionIntent,
  approveProtectionProposal,
  createDevStore,
  createProtectionIntent,
  executeProtectionProposal,
  getLatestMandateEvaluation,
} from "../src/lib/tenax/index";
import { buildExposureGraph, withRepresentation } from "../src/lib/tenax/exposure-graph";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

const AVAILABLE_LEAF = {
  representationId: "NVDAx",
  subjectId: "NVDA",
  symbol: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  venue: "xStocks · Solana",
  ecosystem: "unknown",
  instrumentType: "unknown",
  role: "available",
  direction: null,
  quantity: null,
  usdValue: null,
  leverage: null,
  marginMode: null,
  status: "online",
  provenance: "REAL",
  note: "AVAILABLE — NOT OWNED · NOT A POSITION",
} as const;

describe("coverage derives from canonical graph values", () => {
  it("computes 98.35 / 500 as 19.67%", () => {
    expect(coveragePercent(98.35, 500)).toBe(19.67);
  });

  it("treats an attached available leaf as contributing zero", () => {
    const base = buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE });
    const extended = withRepresentation(base, { ...AVAILABLE_LEAF });
    expect(coveragePercent(extended.protectedNotionalUsd, extended.grossExposureUsd)).toBeNull();
    expect(extended.grossExposureUsd).toBe(500);
    expect(extended.protectedNotionalUsd).toBeNull();
  });

  it("keeps coverage unknown when the protected value is unknown", () => {
    expect(coveragePercent(null, 500)).toBeNull();
    expect(coveragePercent(98.35, null)).toBeNull();
    expect(coveragePercent(null, null)).toBeNull();
    expect(coveragePercent(0, 500)).toBe(0);
    expect(coveragePercent(98.35, 0)).toBeNull();
  });
});

describe("mandate visuals reflect canonical evaluated values", () => {
  function canonicalInput() {
    const decision = evaluateMandate(PROPOSAL_PASS_FIXTURE, MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE);
    expect(decision.verdict).toBe("PASS");
    return {
      proposalPct: 20,
      tradeValueUsdt: 100,
      leverageUsed: 1,
      approval: "APPROVED" as const,
      checks: decision.checks.map((c) => ({ id: c.id, pass: c.pass })),
      maxPct: MANDATE_FIXTURE.maxProtectionPct,
      maxTradeValueUsdt: MANDATE_FIXTURE.maxTradeValueUsdt,
      maxLeverage: MANDATE_FIXTURE.maxLeverage,
    };
  }

  it("renders evaluated-vs-bound rows with canonical pass states", () => {
    const rows = mandateVisualRows(canonicalInput());
    expect(rows.map((r) => r.id)).toEqual(["protection", "trade", "leverage", "approval"]);
    expect(rows[0]).toMatchObject({ evaluated: "20%", bound: "MAX 30%", pass: true });
    expect(rows[1]).toMatchObject({ evaluated: "$100", bound: "MAX $150", pass: true });
    expect(rows[2]).toMatchObject({ evaluated: "1X", bound: "1X MAX", pass: true });
    expect(rows[3]).toMatchObject({ evaluated: "HUMAN APPROVED", pass: true });
    for (const row of rows.slice(0, 3)) {
      expect(row.fraction).toBeGreaterThan(0);
      expect(row.fraction).toBeLessThanOrEqual(1);
    }
  });

  it("renders unevaluated rows honestly when nothing evaluated yet", () => {
    const rows = mandateVisualRows({
      proposalPct: null,
      tradeValueUsdt: null,
      leverageUsed: null,
      approval: null,
      checks: null,
      maxPct: 30,
      maxTradeValueUsdt: 150,
      maxLeverage: 1,
    });
    for (const row of rows) {
      expect(row.evaluated).toBe("—");
      expect(row.pass).toBeNull();
    }
  });
});

describe("refusal surfaces only from canonical refusal state", () => {
  async function testSnapshot() {
    return normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
    );
  }

  it("returns null with no completed flow — no invented refusal", async () => {
    const store = createDevStore();
    expect(getLatestMandateEvaluation(store)).toBeNull();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    expect(getLatestMandateEvaluation(store)).toBeNull();
  });

  it("carries the canonical rejected alternative after completion", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    approveProtectionProposal(store, { flowId, actor: "human" });
    await executeProtectionProposal(store, { flowId });
    const evaluation = getLatestMandateEvaluation(store);
    expect(evaluation?.proposalPct).toBe(20);
    expect(evaluation?.tradeValueUsdt).toBe(100);
    expect(evaluation?.leverageUsed).toBe(1);
    expect(evaluation?.approval).toBe("APPROVED");
    expect(evaluation?.rejected).toMatchObject({ value: 200, pct: 40 });
    expect(evaluation?.rejected?.failedRules).toContain("max_trade_value");
  });
});

describe("market provenance labeling", () => {
  const points = [
    { t: 1789833600000, close: 221.16 },
    { t: 1789920000000, close: 223.93 },
  ];
  const action = { qty: "0.44", avgPrice: 223.53, submittedAt: "2026-09-21T10:00:00.000Z" };

  it("labels provider series REAL and keeps the action mark", () => {
    const model = marketPanelModel({ provenance: "REAL", points }, action);
    expect(model.state).toBe("READY");
    expect(model.provenanceLabel).toMatch(/BITGET PUBLIC CANDLES/);
    expect(model.action).toEqual(action);
  });

  it("quarantines synthetic series and drops the action mark", () => {
    const model = marketPanelModel({ provenance: "SAMPLE", points }, action);
    expect(model.provenanceLabel).toMatch(/NOT REAL MARKET DATA/);
    expect(model.action).toBeNull();
  });

  it("reports UNAVAILABLE on missing or empty series", () => {
    expect(marketPanelModel(null, action)).toMatchObject({
      state: "NO_MARKET",
      provenanceLabel: "MARKET DATA UNAVAILABLE",
    });
    expect(marketPanelModel({ provenance: "REAL", points: [] }, action).state).toBe("NO_MARKET");
  });
});
