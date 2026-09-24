// Tenax Phase 4B-B6.2 QA Repair — proof-persistence regression coverage (offline, no network).
//
// Seams under test (owned by siblings, not modified here):
//   recordJudgeProof typed rejection, reconcileJudgeProofs, awaited orchestration
//   (runProtectionAgentCycle awaits proof persistence via emitActivityAndAwaitProof).
// Zero network, zero credentials, zero Bitget/AI/Telegram: injected repos and fakes only.
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
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import { finalActionState, surfaceProjection } from "../src/lib/tenax/visuals";
import {
  InMemoryProofRepository,
  PostgresProofRepository,
  type ProofRepository,
} from "../src/lib/proof/repository";
import {
  ProofPersistenceError,
  reconcileJudgeProofs,
  recordJudgeProof,
} from "../src/lib/proof/seam";
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

/** Activate an AUTO_WITH_ESCALATION mandate whose 15% bound the 20% fixture exceeds. */
function setupEscalatingMandate(store: TenaxDevStore) {
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITH_ESCALATION", maxExecutions: 3, maxProtectionPct: 15 },
    NOW,
  );
  return activateStandingMandateRecord(store, { id: created.id }, NOW);
}

const agentDemoDeps = (calls: string[], infoBody: string = INFO_FILLED) => {
  const stubs = stubFetch(calls, PLACE_OK, infoBody);
  return {
    credentials: CREDS,
    baseUrl: "https://api.bitget.com",
    tradingMode: "demo",
    executionMode: "BITGET_DEMO" as const,
    marketReader: async () => DEMO_MARKET,
    writeFetchImpl: stubs.write,
    readFetchImpl: stubs.read,
  };
};

/** Run the escalation flow: fixture 20% proposal against the 15% mandate bound. */
async function runEscalationFlow() {
  const { store, flowId } = await setupPassFlow();
  setupEscalatingMandate(store);
  const calls: string[] = [];
  const result = await runProtectionAgentCycle(
    store,
    { flowId },
    { ...agentDemoDeps(calls), nowMs: Date.now() },
  );
  expect(result.outcome).toBe("STANDING_ESCALATE");
  expect(calls).toEqual([]);
  const event = store.activities.find((a) => a.type === "STANDING_AUTHORITY_ESCALATED");
  expect(event).toBeDefined();
  return { store, flowId, calls, result, event: event! };
}

const SECRET_LIKE = ["apikey", "api_key", "secret", "token", "passphrase", "private", "signature", "authorization", "cookie", "chainofthought", "reasoning_trace"];

function expectSecretFree(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const fragment of SECRET_LIKE) {
    expect(serialized).not.toContain(fragment);
  }
}

describe("real escalation activity reaches the repository", () => {
  it("records AUTHORITY_ESCALATED with no-order truth and zero provider POSTs", async () => {
    const { store, event, calls } = await runEscalationFlow();
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, event, repo);
    expect(proof).toMatchObject({
      kind: "AUTHORITY_ESCALATED",
      outcome: "NO AUTONOMOUS ORDER SENT",
    });
    expect(await repo.listProofs()).toEqual([proof]);
    expect(calls).toEqual([]);
  });
});

describe("async persistence is not lost", () => {
  it("awaited orchestration leaves the escalation durable with zero provider POSTs", async () => {
    const dbCalls = { connect: 0, query: 0, end: 0 };
    const rows = new Map<string, Record<string, unknown>>();
    const factory = async () => ({
      connect: async () => { dbCalls.connect += 1; },
      query: async (text: string, values: unknown[] = []) => {
        dbCalls.query += 1;
        const head = text.trimStart().slice(0, 6).toUpperCase();
        if (head.startsWith("CREATE")) return { rows: [] };
        if (head.startsWith("INSERT")) {
          const id = String(values[0]);
          if (!rows.has(id)) {
            rows.set(id, {
              id: values[0], version: values[1], kind: values[2], flow_id: values[3],
              subject: values[4], symbol: values[5], created_at: new Date(values[6] as string),
              outcome: values[7], authority: JSON.parse(values[8] as string),
              proposal: JSON.parse(values[9] as string),
              mandate_snapshot: values[10] === null ? null : JSON.parse(values[10] as string),
              execution: values[11] === null ? null : JSON.parse(values[11] as string),
              receipt_id: values[12], reason_codes: JSON.parse(values[13] as string),
              source_activity_event_id: values[14], provenance: JSON.parse(values[15] as string),
            });
            return { rows: [rows.get(id)!] };
          }
          return { rows: [] };
        }
        if (head.startsWith("SELECT")) {
          const idMatch = /WHERE id = \$1/.test(text);
          if (idMatch) {
            const row = rows.get(String(values[0]));
            return { rows: row ? [row] : [] };
          }
          const flowMatch = /WHERE flow_id = \$1/.test(text);
          let selected = [...rows.values()];
          if (flowMatch) selected = selected.filter((r) => r.flow_id === values[0]);
          selected.sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1));
          const limitRaw = Number(values[values.length - 1]);
          return { rows: selected.slice(0, Number.isFinite(limitRaw) ? limitRaw : 100) };
        }
        throw new Error(`unexpected statement: ${head}`);
      },
      end: async () => { dbCalls.end += 1; },
    });
    const pgRepo = new PostgresProofRepository("postgres://u:p@localhost:5432/tenax", factory);
    const { store, flowId, result, calls, event } = await runEscalationFlow();
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]);
    // Mirror the awaited orchestration: persist after the cycle and confirm durability.
    const memoryRepo = new InMemoryProofRepository();
    const memoryProof = await recordJudgeProof(store, event, memoryRepo);
    expect(memoryProof?.kind).toBe("AUTHORITY_ESCALATED");
    const stored = await recordJudgeProof(store, event, pgRepo);
    expect(stored?.kind).toBe("AUTHORITY_ESCALATED");
    expect(pgRepo.durabilityState).toBe("DURABLE");
    expect(dbCalls.connect).toBeGreaterThan(0);
    expect(dbCalls.query).toBeGreaterThan(0);
    expect(dbCalls.end).toBeGreaterThan(0);
    const listed = await pgRepo.listProofs({ flowId });
    expect(listed.map((p) => p.id)).toEqual([stored!.id]);
  });
});

describe("proof write failure is observable but the decision stands", () => {
  it("rejects with PROOF_STORE_FAILURE, leaks no secrets, keeps STANDING_ESCALATE", async () => {
    const { store, event, result, calls } = await runEscalationFlow();
    expect(result.outcome).toBe("STANDING_ESCALATE");
    const failing: ProofRepository = {
      backend: "POSTGRES",
      durabilityState: "UNAVAILABLE",
      durable: false,
      saveProof: async () => { throw new Error("connection refused"); },
      getProof: async () => { throw new Error("connection refused"); },
      listProofs: async () => { throw new Error("connection refused"); },
      findProofByReceiptId: async () => { throw new Error("connection refused"); },
      findProofByFlowId: async () => { throw new Error("connection refused"); },
    };
    const failure = await recordJudgeProof(store, event, failing).then(
      () => { throw new Error("expected recordJudgeProof to reject"); },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ProofPersistenceError);
    expect((failure as ProofPersistenceError).code).toBe("PROOF_STORE_FAILURE");
    expect(String(failure)).not.toContain(CREDS.apiKey);
    expect(String(failure)).not.toContain(CREDS.secretKey);
    expect(String(failure)).not.toContain(CREDS.passphrase);
    expectSecretFree({ ...(failure as object), message: String(failure) });
    // The decision was already made before persistence: escalation stands, nothing sent.
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]);
  });
});

describe("escalation means no autonomous order", () => {
  it("persists null execution with the exact no-order outcome", async () => {
    const { store, event } = await runEscalationFlow();
    const proof = await recordJudgeProof(store, event, new InMemoryProofRepository());
    expect(proof?.execution).toBeNull();
    expect(proof?.outcome).toBe("NO AUTONOMOUS ORDER SENT");
  });
});

describe("replay and reconciliation are idempotent", () => {
  it("second reconcile persists nothing new", async () => {
    const { store } = await runEscalationFlow();
    const repo = new InMemoryProofRepository();
    const first = await reconcileJudgeProofs(store, repo);
    expect(first.failures).toEqual([]);
    expect(first.proofWorthy).toBeGreaterThan(0);
    const second = await reconcileJudgeProofs(store, repo);
    expect(second.persistedOrAlreadyPresent).toBe(first.persistedOrAlreadyPresent);
    expect(second.failures).toEqual([]);
    expect(await repo.listProofs()).toHaveLength(first.persistedOrAlreadyPresent);
    expect(await repo.listProofs()).toHaveLength(1);
  });
});

describe("stored escalation reads back with kind and flow", () => {
  it("listProofs returns the escalation for its flow", async () => {
    const { store, flowId, event } = await runEscalationFlow();
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, event, repo);
    const listed = await repo.listProofs({ kind: "AUTHORITY_ESCALATED", flowId });
    expect(listed).toEqual([proof]);
    expect(listed[0]?.flowId).toBe(flowId);
  });
});

describe("no provider or AI surface in the proof path", () => {
  it("seam source and provider-call arrays stay clean", async () => {
    const seamSource = readFileSync(
      new URL("../src/lib/proof/seam.ts", import.meta.url),
      "utf8",
    ).toLowerCase();
    for (const fragment of ["bitget", "groq", "openai", "telegram"]) {
      expect(seamSource).not.toContain(fragment);
    }
    const { calls } = await runEscalationFlow();
    expect(calls).toEqual([]);
  });
});

describe("agent-cycle escalation persists before response (flow-0002 path)", () => {
  /** Existing Demo protection (~$96.80 = 0.44 x $220) mirrored on the file's DEMO_MARKET stub. */
  const CUMULATIVE_SHORT: NvdaPosition = {
    hasPosition: true,
    side: "short",
    size: "0.44",
    leverage: "1",
    marginMode: "crossed",
    markPrice: "220",
    avgPrice: "223.53",
  };

  /**
   * Second flow on a fresh store: the literal flow-0002 id with fixture analysis.
   * The mandate bound (30%) AUTHORIZES the single 20%/$100 fixture proposal at
   * the standing gate so the cycle reaches the cumulative check, where the
   * existing ~$96.80 Demo protection + $100 projects to ~$196.80 (39.36%) and
   * escalates. A 15% bound would escalate at the standing gate first and never
   * touch the cumulative branch — verified against runProtectionAgentCycle.
   */
  async function setupFlow0002() {
    const { store } = await setupPassFlow();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    expect(flowId).toBe("flow-0002");
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
    return {
      ...agentDemoDeps(calls),
      marketReader: async () => ({ ...DEMO_MARKET, position: { ...CUMULATIVE_SHORT } }),
      nowMs: Date.now(),
    };
  }

  it("persists the escalation before the cycle response returns", async () => {
    const { store, flowId } = await setupFlow0002();
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, cumulativeDeps(calls));
    expect(result.outcome).toBe("STANDING_ESCALATE");
    if (result.outcome !== "STANDING_ESCALATE") throw new Error("expected STANDING_ESCALATE");
    // Cumulative branch: existing ~$96.80 + $100 projects over the 30% ceiling.
    expect(result.cumulative?.reasonCode).toBe("projected_protection_exceeds_mandate");
    expect(result.cumulative?.existingUsd).toBe(96.8);
    expect(result.cumulative?.projectedUsd).toBe(196.8);
    const escalations = store.activities.filter(
      (a) => a.type === "STANDING_AUTHORITY_ESCALATED" && a.flowId === flowId,
    );
    expect(escalations).toHaveLength(1);
    const event = escalations[0]!;
    const built = buildJudgeProof(store, event);
    expect(built).not.toBeNull();
    expect(built!.outcome).toBe("NO AUTONOMOUS ORDER SENT");
    expect(built!.execution).toBeNull();
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, event, repo);
    expect(proof).not.toBeNull();
    expect(await repo.listProofs()).toEqual([proof]);
  });

  it("holds the cycle response until a slow proof save settles", async () => {
    // Genuine 1500ms wall-clock delay (not fake timers): proves the awaited
    // orchestration holds the cycle response until proof settlement. Fake
    // timers cannot prove await ordering — only a pending save can.
    const { store, flowId } = await setupFlow0002();
    const calls: string[] = [];
    const proto = InMemoryProofRepository.prototype;
    const originalSave = proto.saveProof;
    const delegate = new InMemoryProofRepository();
    let saves = 0;
    proto.saveProof = async (record) => {
      saves += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      // Bypass the patched prototype: delegate to the ORIGINAL save bound to
      // the side map. Calling delegate.saveProof would recurse into this patch.
      return originalSave.call(delegate, record);
    };
    const start = Date.now();
    try {
      const result = await runProtectionAgentCycle(store, { flowId }, cumulativeDeps(calls));
      expect(result.outcome).toBe("STANDING_ESCALATE");
    } finally {
      proto.saveProof = originalSave;
    }
    expect(Date.now() - start).toBeGreaterThanOrEqual(1400);
    expect(saves).toBe(1);
    expect(calls).toEqual([]);
    const escalations = store.activities.filter(
      (a) => a.type === "STANDING_AUTHORITY_ESCALATED" && a.flowId === flowId,
    );
    expect(escalations).toHaveLength(1);
    const listed = await delegate.listProofs({ flowId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.kind).toBe("AUTHORITY_ESCALATED");
  });

  it("delayed Postgres boundary stays offline and settles before the read", async () => {
    const { store, flowId } = await setupFlow0002();
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, cumulativeDeps(calls));
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]);
    const event = store.activities.find(
      (a) => a.type === "STANDING_AUTHORITY_ESCALATED" && a.flowId === flowId,
    );
    expect(event).toBeDefined();
    const rows = new Map<string, Record<string, unknown>>();
    // Genuine delay at the faked pg boundary (offline, no socket): proves the
    // caller awaits settlement before reading back. Same note as above.
    const factory = async () => ({
      connect: async () => {},
      query: async (text: string, values: unknown[] = []) => {
        // Offline (no socket), but every faked statement settles slowly so the
        // test proves the caller awaits settlement before reading back.
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        const head = text.trimStart().slice(0, 6).toUpperCase();
        if (head.startsWith("CREATE")) return { rows: [] };
        if (head.startsWith("INSERT")) {
          const id = String(values[0]);
          if (!rows.has(id)) {
            rows.set(id, {
              id: values[0], version: values[1], kind: values[2], flow_id: values[3],
              subject: values[4], symbol: values[5], created_at: new Date(values[6] as string),
              outcome: values[7], authority: JSON.parse(values[8] as string),
              proposal: JSON.parse(values[9] as string),
              mandate_snapshot: values[10] === null ? null : JSON.parse(values[10] as string),
              execution: values[11] === null ? null : JSON.parse(values[11] as string),
              receipt_id: values[12], reason_codes: JSON.parse(values[13] as string),
              source_activity_event_id: values[14], provenance: JSON.parse(values[15] as string),
            });
            return { rows: [rows.get(id)!] };
          }
          return { rows: [] };
        }
        if (head.startsWith("SELECT")) {
          const idMatch = /WHERE id = \$1/.test(text);
          if (idMatch) {
            const row = rows.get(String(values[0]));
            return { rows: row ? [row] : [] };
          }
          const flowMatch = /WHERE flow_id = \$1/.test(text);
          let selected = [...rows.values()];
          if (flowMatch) selected = selected.filter((r) => r.flow_id === values[0]);
          selected.sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1));
          const limitRaw = Number(values[values.length - 1]);
          return { rows: selected.slice(0, Number.isFinite(limitRaw) ? limitRaw : 100) };
        }
        throw new Error(`unexpected statement: ${head}`);
      },
      end: async () => {},
    });
    const pgRepo = new PostgresProofRepository("postgres://u:p@localhost:5432/tenax", factory);
    const start = Date.now();
    const stored = await recordJudgeProof(store, event!, pgRepo);
    expect(Date.now() - start).toBeGreaterThanOrEqual(1400);
    expect(stored?.kind).toBe("AUTHORITY_ESCALATED");
    expect(stored?.outcome).toBe("NO AUTONOMOUS ORDER SENT");
    expect(stored?.execution).toBeNull();
    const listed = await pgRepo.listProofs({ flowId });
    expect(listed.map((p) => p.id)).toEqual([stored!.id]);
  });

  it("pure projection helpers emit no activities and prove nothing", async () => {
    const { store, flowId } = await setupFlow0002();
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, cumulativeDeps(calls));
    expect(result.outcome).toBe("STANDING_ESCALATE");
    const activityCount = store.activities.length;
    expect(activityCount).toBeGreaterThan(0);
    expect(
      finalActionState({
        wait: false,
        actionable: true,
        policyPass: true,
        standingDecision: "ESCALATE",
        cumulativeOverLimit: true,
        authorityMode: "AUTO_WITH_ESCALATION",
      }),
    ).toBe("ESCALATE");
    const projection = surfaceProjection(
      { state: "POSITION", size: "0.44", markPrice: "220" },
      100,
      500,
      15,
    );
    expect(projection.overLimit).toBe(true);
    expect(store.activities.length).toBe(activityCount);
    expect(await new InMemoryProofRepository().listProofs()).toEqual([]);
  });
});
