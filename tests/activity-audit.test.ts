// Tenax Phase 4B-B4 — activity audit trail tests (offline).
//
// Proves /app/activity logic without rendering: the latest meaningful
// authority/action event (not the earlier lifecycle chip) drives each
// flow's card; numbers render from structured event details only;
// COMPLETED flows keep receipt truth; event-less flows keep the
// lifecycle fallback. All provider I/O is injected fakes — no network,
// no orders, no live calls.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaPosition, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { DemoHedgeMarketState } from "../src/lib/tenax/demo-executor";
import type { ActivityEvent } from "../src/lib/tenax/activity";
import {
  __resetStandingMandateCounterForTests,
  type StandingAuthorityMode,
} from "../src/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import {
  auditCardFor,
  flowAuditView,
  latestMeaningfulEvent,
} from "../src/app/app/_components/ui";
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

const PLACE_OK =
  '{"code":"00000","msg":"success","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo"}}';
const INFO_FILLED =
  '{"code":"00000","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo","orderStatus":"filled","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50","avgPrice":"201.5","cumExecQty":"0.50","cumExecValue":"100.75"}}';

function stubFetch(calls: string[]) {
  return {
    write: async (url: string) => {
      calls.push(`POST ${url}`);
      return { status: 200, text: async () => PLACE_OK };
    },
    read: async (url: string) => {
      calls.push(`GET ${url}`);
      return { status: 200, text: async () => INFO_FILLED };
    },
  };
}

function marketWith(position: NvdaPosition | null): DemoHedgeMarketState {
  return {
    category: "USDT-FUTURES",
    symbol: "NVDAUSDT",
    holdMode: "hedge_mode",
    nvdaSymbolConfigFound: true,
    marginMode: "crossed",
    configuredLeverage: "1",
    position,
    instrument: INSTRUMENT,
    ticker: TICKER,
  };
}

function shortPosition(size: string, mark: string | null): NvdaPosition {
  return {
    hasPosition: true,
    side: "short",
    size,
    leverage: "1",
    marginMode: "crossed",
    markPrice: mark,
    avgPrice: "223.53",
  };
}

function demoDeps(calls: string[], position: NvdaPosition | null) {
  const stubs = stubFetch(calls);
  return {
    credentials: CREDS,
    baseUrl: "https://api.bitget.com",
    tradingMode: "demo",
    executionMode: "BITGET_DEMO" as const,
    marketReader: async () => marketWith(position),
    writeFetchImpl: stubs.write,
    readFetchImpl: stubs.read,
    nowMs: Date.now(),
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

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

async function setupPassFlow() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  return { store, flowId };
}

function setupMandate(
  store: ReturnType<typeof createDevStore>,
  policy: {
    authorityMode: StandingAuthorityMode;
    maxProtectionPct?: number;
    maxNotionalUsdt?: number;
    maxExecutions?: number;
  },
) {
  const created = createStandingMandateRecord(
    store,
    {
      authorityMode: policy.authorityMode,
      maxProtectionPct: policy.maxProtectionPct ?? 30,
      maxNotionalUsdt: policy.maxNotionalUsdt ?? 150,
      maxExecutions: policy.maxExecutions ?? 3,
    },
    NOW,
  );
  return activateStandingMandateRecord(store, { id: created.id }, NOW);
}

function testEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "act-0001",
    type: "STANDING_AUTHORITY_ESCALATED",
    flowId: "flow-0001",
    createdAt: new Date(NOW).toISOString(),
    summary: "Standing smand-0001 escalated — human review required",
    receiptId: null,
    details: null,
    ...overrides,
  };
}

describe("latest meaningful event", () => {
  it("prefers the latest authority event over earlier lifecycle state", () => {
    const events = [
      testEvent({ id: "act-0001", type: "AI_ANALYSIS_COMPLETED" }),
      testEvent({ id: "act-0002", type: "STANDING_AUTHORITY_ESCALATED" }),
    ];
    expect(latestMeaningfulEvent(events, "flow-0001")?.id).toBe("act-0002");
  });

  it("ignores other flows and non-audit types", () => {
    const events = [
      testEvent({ id: "act-0001", type: "STANDING_AUTHORITY_ESCALATED", flowId: "flow-9" }),
      testEvent({ id: "act-0002", type: "STANDING_AUTHORITY_AUTHORIZED" }),
      testEvent({ id: "act-0003", type: "AI_ANALYSIS_COMPLETED" }),
    ];
    expect(latestMeaningfulEvent(events, "flow-0001")).toBeNull();
  });

  it("returns null when no meaningful event exists", () => {
    expect(latestMeaningfulEvent([], "flow-0001")).toBeNull();
  });
});

describe("audit cards", () => {
  it("renders escalation with structured conflict facts and review CTA", () => {
    const card = auditCardFor(
      testEvent({
        details: {
          proposedPct: 20,
          proposedUsd: 100,
          maxPct: 15,
          maxNotional: 60,
          reasonCodes: ["projected_protection_exceeds_mandate"],
          outcome: "STANDING_ESCALATE",
        },
      }),
      "flow-0004",
    );
    expect(card.badge).toBe("STANDING AUTHORITY ESCALATED");
    expect(card.title).toMatch(/human review required/i);
    expect(card.facts).toContainEqual(["PROPOSED", "20% · $100"]);
    expect(card.facts).toContainEqual(["MANDATE MAX", "15% · $60"]);
    expect(card.result).toBe("NO AUTONOMOUS ORDER SENT");
    expect(card.cta).toMatchObject({ label: "REVIEW ACTION", href: "/app/approval/flow-0004" });
  });

  it("omits facts whose structured values are absent instead of inventing", () => {
    const card = auditCardFor(testEvent({ details: null }), "flow-0001");
    expect(card.facts).toEqual([]);
    expect(card.badge).toBe("STANDING AUTHORITY ESCALATED");
  });

  it("renders review requirements without escalation wording", () => {
    const card = auditCardFor(
      testEvent({
        type: "STANDING_REVIEW_REQUIRED",
        details: { reasonCodes: ["human_review_required"], outcome: "STANDING_REVIEW" },
      }),
      "flow-0002",
    );
    expect(card.badge).toBe("HUMAN REVIEW REQUIRED");
    expect(`${card.badge} ${card.title} ${card.result}`).not.toMatch(/escalat/i);
    expect(card.cta).toMatchObject({ href: "/app/approval/flow-0002" });
  });

  it("renders refusals with reasons and no order sent", () => {
    const card = auditCardFor(
      testEvent({
        type: "STANDING_AUTHORITY_REFUSED",
        details: { reasonCodes: ["exceeds_max_protection_pct"], outcome: "STANDING_REFUSED" },
      }),
      "flow-0003",
    );
    expect(card.badge).toBe("TENAX REFUSED");
    expect(card.result).toBe("NO ORDER SENT");
    expect(card.facts).toContainEqual(["REASONS", "EXCEEDS_MAX_PROTECTION_PCT"]);
    expect(card.cta).toMatchObject({ label: "VIEW ANALYSIS", href: "/app/analysis/flow-0003" });
  });
});

describe("flow audit view", () => {
  it("keeps COMPLETED receipt truth above any earlier authority event", () => {
    const event = testEvent({ type: "STANDING_AUTHORITY_ESCALATED" });
    expect(flowAuditView("COMPLETED", event)).toEqual({ kind: "receipt" });
    expect(flowAuditView("COMPLETED", null)).toEqual({ kind: "receipt" });
  });

  it("prefers the event card for open flows and falls back without events", () => {
    const event = testEvent({ type: "STANDING_AUTHORITY_REFUSED" });
    const withEvent = flowAuditView("MANDATE_PASS", event);
    expect(withEvent.kind).toBe("event");
    if (withEvent.kind !== "event") throw new Error("expected event view");
    expect(withEvent.card.badge).toBe("TENAX REFUSED");
    expect(flowAuditView("MANDATE_PASS", null)).toEqual({ kind: "fallback" });
  });
});

describe("audit trail from live cycles", () => {
  it("shows the owner flow-0004 shape: escalated 20/100 vs 15/60, no order", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, {
      authorityMode: "AUTO_WITH_ESCALATION",
      maxProtectionPct: 15,
      maxNotionalUsdt: 60,
    });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, shortPosition("0.44", "225")),
    );
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]);
    const state = store.flows.get(flowId)?.getFlowState();
    const view = flowAuditView(state ?? "UNKNOWN", latestMeaningfulEvent(store.activities, flowId));
    expect(view.kind).toBe("event");
    if (view.kind !== "event") throw new Error("expected event view");
    expect(view.card.badge).toBe("STANDING AUTHORITY ESCALATED");
    // Facts derive from the stored event details — built here from the
    // same structured values, never hardcoded page literals.
    const details = latestMeaningfulEvent(store.activities, flowId)?.details;
    expect(details?.proposedPct).toBe(20);
    expect(details?.proposedUsd).toBe(100);
    expect(details?.maxPct).toBe(15);
    expect(details?.maxNotional).toBe(60);
    expect(view.card.facts).toContainEqual(["PROPOSED", "20% · $100"]);
    expect(view.card.facts).toContainEqual(["MANDATE MAX", "15% · $60"]);
    expect(view.card.result).toBe("NO AUTONOMOUS ORDER SENT");
  });

  it("shows review-required distinctly for REVIEW mode", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "REVIEW_EVERY_ACTION" });
    const calls: string[] = [];
    await runProtectionAgentCycle(store, { flowId }, demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }));
    const view = flowAuditView(
      store.flows.get(flowId)?.getFlowState() ?? "UNKNOWN",
      latestMeaningfulEvent(store.activities, flowId),
    );
    expect(view.kind).toBe("event");
    if (view.kind !== "event") throw new Error("expected event view");
    expect(view.card.badge).toBe("HUMAN REVIEW REQUIRED");
    expect(`${view.card.badge} ${view.card.title}`).not.toMatch(/escalat/i);
  });

  it("shows TENAX REFUSED for WITHIN-mode overflow", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 15 });
    const calls: string[] = [];
    await runProtectionAgentCycle(store, { flowId }, demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }));
    const view = flowAuditView(
      store.flows.get(flowId)?.getFlowState() ?? "UNKNOWN",
      latestMeaningfulEvent(store.activities, flowId),
    );
    expect(view.kind).toBe("event");
    if (view.kind !== "event") throw new Error("expected event view");
    expect(view.card.badge).toBe("TENAX REFUSED");
    expect(view.card.result).toBe("NO ORDER SENT");
  });

  it("preserves COMPLETED execution truth with receipt CTA", async () => {
    const { store, flowId } = await setupPassFlow();
    setupMandate(store, { authorityMode: "AUTO_WITHIN_MANDATE" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      demoDeps(calls, { ...EMPTY_NVIDIA_POSITION }),
    );
    expect(result.outcome).toBe("EXECUTED");
    const view = flowAuditView(
      store.flows.get(flowId)?.getFlowState() ?? "UNKNOWN",
      latestMeaningfulEvent(store.activities, flowId),
    );
    expect(view).toEqual({ kind: "receipt" });
  });

  it("falls back to lifecycle state with no meaningful event", async () => {
    const { store, flowId } = await setupPassFlow();
    expect(
      flowAuditView(
        store.flows.get(flowId)?.getFlowState() ?? "UNKNOWN",
        latestMeaningfulEvent(store.activities, flowId),
      ),
    ).toEqual({ kind: "fallback" });
  });
});

describe("activity surface truth", () => {
  const pageSource = readFileSync(
    new URL("../src/app/app/activity/page.tsx", import.meta.url),
    "utf8",
  );

  it("derives cards from events with lifecycle as secondary metadata", () => {
    expect(pageSource).toContain("latestMeaningfulEvent");
    expect(pageSource).toContain("flowAuditView");
    expect(pageSource).toContain("FLOW STATE:");
  });

  it("introduces no POST or provider paths", () => {
    expect(pageSource).not.toContain("fetch(");
    expect(pageSource).not.toContain("/api/");
    expect(pageSource).not.toMatch(/bitget/i);
  });
});
