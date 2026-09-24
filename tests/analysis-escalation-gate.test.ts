// Tenax B6.2 Final QA — analysis escalation-gate regression coverage (offline, no network).
//
// Gate truth under test:
//   Projection-only ESCALATE renders RunAgentPanel ("PROJECTED OVER MANDATE",
//   "PROJECTION ONLY"); only a post-cycle ESCALATE backed by a real
//   STANDING_AUTHORITY_ESCALATED activity event renders REVIEW ACTION.
//   Service/cumulative/standing semantics are untouched: cumulative overflow
//   (existing ~$96.80 + $100 over a 30% ceiling) escalates with zero provider
//   calls and a persisted JudgeProof, and no provider submit exists upstream
//   of the cumulative refusal/escalation returns.
// Zero network, zero credentials, zero Bitget/AI/Telegram: injected fakes only.
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaPosition, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { TenaxDevStore } from "../src/lib/tenax/dev-store";
import type { DemoHedgeMarketState } from "../src/lib/tenax/demo-executor";
import {
  __resetStandingMandateCounterForTests,
} from "../src/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  evaluateStandingAuthorityForProposal,
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import {
  InMemoryProofRepository,
  getProofRepository,
} from "../src/lib/proof/repository";
import { recordJudgeProof } from "../src/lib/proof/seam";
import { buildJudgeProof } from "../src/lib/proof/builder";
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

const DEMO_MARKET: DemoHedgeMarketState = {
  category: "USDT-FUTURES",
  symbol: "NVDAUSDT",
  holdMode: "hedge_mode",
  nvdaSymbolConfigFound: true,
  marginMode: "crossed",
  configuredLeverage: "1",
  position: { ...EMPTY_NVIDIA_POSITION },
  instrument: INSTRUMENT,
  ticker: TICKER,
};

/** Existing Demo protection (~$96.80 = 0.44 x $220). */
const CUMULATIVE_SHORT: NvdaPosition = {
  hasPosition: true,
  side: "short",
  size: "0.44",
  leverage: "1",
  marginMode: "crossed",
  markPrice: "220",
  avgPrice: "223.53",
};

const PLACE_OK =
  '{"code":"00000","msg":"success","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo"}}';
const INFO_FILLED =
  '{"code":"00000","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo","orderStatus":"filled","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50","avgPrice":"201.5","cumExecQty":"0.50","cumExecValue":"100.75"}}';

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

function stubFetch(calls: string[], placeBody: string, infoBody: string) {
  return {
    write: async (url: string) => {
      calls.push(`POST ${url}`);
      return { status: 200, text: async () => placeBody };
    },
    read: async (url: string) => {
      calls.push(`GET ${url}`);
      return { status: 200, text: async () => infoBody };
    },
  };
}

let savedTenaxMode: string | undefined;
let savedTradingMode: string | undefined;
let savedDatabaseUrl: string | undefined;

beforeEach(() => {
  __resetStandingMandateCounterForTests();
  savedTenaxMode = process.env.TENAX_EXECUTION_MODE;
  savedTradingMode = process.env.BITGET_TRADING_MODE;
  savedDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.TENAX_EXECUTION_MODE;
  delete process.env.BITGET_TRADING_MODE;
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  if (savedTenaxMode === undefined) delete process.env.TENAX_EXECUTION_MODE;
  else process.env.TENAX_EXECUTION_MODE = savedTenaxMode;
  if (savedTradingMode === undefined) delete process.env.BITGET_TRADING_MODE;
  else process.env.BITGET_TRADING_MODE = savedTradingMode;
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
});

/** Golden MANDATE_PASS flow (fixture analysis, 20%/$100). */
async function setupPassFlow() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  return { store, flowId };
}

/**
 * Second flow on a fresh store: the 30% bound AUTHORIZES the single 20%/$100
 * fixture proposal at the standing gate, so the cycle reaches the cumulative
 * check where existing ~$96.80 + $100 projects to ~$196.80 (39.36%) and
 * escalates.
 */
async function setupCumulativeOverflowFlow() {
  const { store } = await setupPassFlow();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITH_ESCALATION", maxExecutions: 3, maxProtectionPct: 30 },
    NOW,
  );
  activateStandingMandateRecord(store, { id: created.id }, NOW);
  return { store, flowId };
}

/** agentDemoDeps-style deps, but the Demo market carries the existing protection. */
function cumulativeDeps(calls: string[]) {
  const stubs = stubFetch(calls, PLACE_OK, INFO_FILLED);
  return {
    credentials: CREDS,
    baseUrl: "https://api.bitget.com",
    tradingMode: "demo",
    executionMode: "BITGET_DEMO" as const,
    marketReader: async () => ({ ...DEMO_MARKET, position: { ...CUMULATIVE_SHORT } }),
    writeFetchImpl: stubs.write,
    readFetchImpl: stubs.read,
    nowMs: Date.now(),
  };
}

/** Standing-gate deps: empty Demo position, provider calls recorded. */
function standingGateDeps(calls: string[]) {
  const stubs = stubFetch(calls, PLACE_OK, INFO_FILLED);
  return {
    credentials: CREDS,
    baseUrl: "https://api.bitget.com",
    tradingMode: "demo",
    executionMode: "BITGET_DEMO" as const,
    marketReader: async () => DEMO_MARKET,
    writeFetchImpl: stubs.write,
    readFetchImpl: stubs.read,
    nowMs: Date.now(),
  };
}

function analysisPageSource(): string {
  return readFileSync(
    new URL("../src/app/app/analysis/[id]/page.tsx", import.meta.url),
    "utf8",
  );
}

/** Slice a single conditional branch: from its head to its closing `) : null}`. */
function branchSegment(source: string, head: string): string {
  const start = source.indexOf(head);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(") : null}", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const PROJECTION_COND =
  'finalState === "ESCALATE" && (!cycleEvent || cycleEvent.type !== "STANDING_AUTHORITY_ESCALATED")';
const POST_CYCLE_COND =
  'finalState === "ESCALATE" && cycleEvent?.type === "STANDING_AUTHORITY_ESCALATED"';

describe("projection-only cumulative overflow renders RUN TENAX AGENT", () => {
  it("projection branch carries RunAgentPanel and the fixed projection copy", () => {
    const source = analysisPageSource();
    expect(source).toContain(PROJECTION_COND);
    const segment = branchSegment(
      source,
      '(!cycleEvent || cycleEvent.type !== "STANDING_AUTHORITY_ESCALATED")',
    );
    expect(segment).toContain("RunAgentPanel");
    expect(segment).toContain("PROJECTED OVER MANDATE");
    expect(segment).toContain("PROJECTION ONLY");
    expect(segment).toContain("Run the deterministic cycle");
  });
});

describe("projection-only never renders REVIEW ACTION as terminal truth", () => {
  it("projection branch contains no REVIEW ACTION link", () => {
    const source = analysisPageSource();
    const segment = branchSegment(
      source,
      '(!cycleEvent || cycleEvent.type !== "STANDING_AUTHORITY_ESCALATED")',
    );
    expect(segment).not.toContain("REVIEW ACTION");
  });
});

describe("cumulative overflow service path escalates with proof before resolve", () => {
  it("runs STANDING_ESCALATE, persists JudgeProof, sends nothing", async () => {
    const { store, flowId } = await setupCumulativeOverflowFlow();
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, cumulativeDeps(calls));
    expect(result.outcome).toBe("STANDING_ESCALATE");
    if (result.outcome !== "STANDING_ESCALATE") throw new Error("expected STANDING_ESCALATE");
    // Cumulative branch: existing ~$96.80 + $100 projects over the 30% ceiling.
    expect(result.cumulative?.reasonCode).toBe("projected_protection_exceeds_mandate");
    expect(result.cumulative?.existingUsd).toBe(96.8);
    expect(result.cumulative?.projectedUsd).toBe(196.8);
    expect(calls).toEqual([]);
    const escalations = store.activities.filter(
      (a) => a.type === "STANDING_AUTHORITY_ESCALATED" && a.flowId === flowId,
    );
    expect(escalations).toHaveLength(1);
    const event = escalations[0]!;
    // The cycle awaits proof persistence before resolving: the shared repo
    // already holds the escalation proof the moment the cycle returns.
    const settled = await getProofRepository().repo.listProofs({ flowId });
    expect(settled).toHaveLength(1);
    expect(settled[0]?.outcome).toBe("NO AUTONOMOUS ORDER SENT");
    expect(settled[0]?.execution).toBeNull();
    // Injected-fake path: the escalation event builds terminal truth with no
    // autonomous order and null execution.
    const built = buildJudgeProof(store, event);
    expect(built).not.toBeNull();
    expect(built!.outcome).toBe("NO AUTONOMOUS ORDER SENT");
    expect(built!.execution).toBeNull();
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, event, repo);
    expect(proof).not.toBeNull();
    expect(await repo.listProofs()).toEqual([proof]);
  });
});

describe("post-cycle ESCALATE renders REVIEW ACTION without RunAgentPanel", () => {
  it("post-cycle branch keys off the escalated event and links review only", () => {
    const source = analysisPageSource();
    expect(source).toContain(POST_CYCLE_COND);
    const segment = branchSegment(
      source,
      'cycleEvent?.type === "STANDING_AUTHORITY_ESCALATED"',
    );
    expect(segment).toContain("REVIEW ACTION");
    expect(segment).toContain("/app/approval/");
    expect(segment).not.toContain("RunAgentPanel");
  });
});

describe("cumulative overflow has no executable provider path", () => {
  it("cumulative refusal/escalation returns precede any submit in service source", () => {
    const service = readFileSync(
      new URL("../src/lib/tenax/service.ts", import.meta.url),
      "utf8",
    );
    const head = service.indexOf("if (!cumulative.passes)");
    expect(head).toBeGreaterThan(-1);
    const tail = service.slice(head);
    const escalateIdx = tail.indexOf('outcome: "STANDING_ESCALATE"');
    const refusedIdx = tail.indexOf('outcome: "STANDING_REFUSED"');
    expect(escalateIdx).toBeGreaterThan(-1);
    expect(refusedIdx).toBeGreaterThan(escalateIdx);
    // No provider submit between the branch head and the terminal returns.
    expect(tail.slice(0, refusedIdx).toLowerCase()).not.toContain("submit");
    // The only submit path (autonomous execution) sits after the block.
    expect(tail.slice(refusedIdx)).toContain("executeAutonomous");
  });

  it("cycled overflow performs zero provider calls", async () => {
    const { store, flowId } = await setupCumulativeOverflowFlow();
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, cumulativeDeps(calls));
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]);
  });
});

describe("in-bounds flow still authorizes under a generous mandate", () => {
  it("AUTO_WITHIN_MANDATE with 100%/large-notional bounds authorizes the fixture", () => {
    const store: TenaxDevStore = createDevStore();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 3, maxProtectionPct: 100, maxNotionalUsdt: 100_000 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: created.id }, NOW);
    const evaluation = evaluateStandingAuthorityForProposal(
      store,
      { underlying: "NVDA", protectionPct: 20, tradeValueUsdt: 100, leverageUsed: 1 },
      NOW,
    );
    expect(evaluation?.decision).toBe("AUTHORIZED");
  });
});

describe("standing-bound escalation stays safe", () => {
  it("15% bound with the 20% fixture escalates at the standing gate, no provider calls", async () => {
    const { store, flowId } = await setupPassFlow();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITH_ESCALATION", maxExecutions: 3, maxProtectionPct: 15 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: created.id }, NOW);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, standingGateDeps(calls));
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]);
    // Standing-level escalation: no cumulative projection involved.
    expect("cumulative" in result).toBe(false);
    const escalations = store.activities.filter(
      (a) => a.type === "STANDING_AUTHORITY_ESCALATED" && a.flowId === flowId,
    );
    expect(escalations).toHaveLength(1);
  });
});
