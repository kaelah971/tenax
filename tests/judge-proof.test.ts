// Tenax Phase 4B-B6.1 — durable judge proof tests (offline, no network).
//
// Covers: verified-fill execution proofs (and only verified fills),
// escalation/refusal/review/failed truth, DRY_RUN exclusion, idempotent
// immutable writes, no-downgrade, secret-free records, storage-failure
// isolation, repository behavior (memory + recorded Postgres SQL),
// import validation, judge list/detail helpers, UI truth pins, and no
// provider POSTs anywhere in the proof path. Live Bitget submission is
// NEVER exercised: all I/O injected.
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type { NvdaInstrument, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { ActivityEvent } from "../src/lib/tenax/activity";
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
  emitActivityEvent,
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import {
  buildJudgeProof,
} from "../src/lib/proof/builder";
import {
  parseProofFilter,
  proofKindForFilter,
  proofKindLabel,
  proofTone,
} from "../src/lib/proof/display";
import { parseImportedProof } from "../src/lib/proof/import";
import {
  judgeProofSchema,
  proofIdFor,
  PROOF_KINDS,
  PROOF_VERSION,
} from "../src/lib/proof/model";
import {
  getProofRepository,
  InMemoryProofRepository,
  PostgresProofRepository,
  type ProofRepository,
} from "../src/lib/proof/repository";
import { ProofPersistenceError, recordJudgeProof } from "../src/lib/proof/seam";
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
const INFO_OPEN =
  '{"code":"00000","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo","orderStatus":"open","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50","avgPrice":"201.5","cumExecQty":"0.00","cumExecValue":"0.00"}}';

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

/** Activate an AUTO_WITHIN_MANDATE budget-1 mandate in the store. */
function setupActiveMandate(
  store: ReturnType<typeof createDevStore>,
  overrides: { authorityMode?: "AUTO_WITHIN_MANDATE" | "AUTO_WITH_ESCALATION" | "REVIEW_EVERY_ACTION"; maxExecutions?: number; maxProtectionPct?: number; maxNotionalUsdt?: number } = {},
) {
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1, ...overrides },
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

function filledEventFor(store: ReturnType<typeof createDevStore>, flowId: string): ActivityEvent {
  const event = store.activities.find((a) => a.type === "AUTONOMOUS_EXECUTION_FILLED" && a.flowId === flowId);
  if (!event) throw new Error("expected a FILLED activity event");
  return event;
}

const SECRET_LIKE = ["apikey", "api_key", "secret", "token", "passphrase", "private", "signature", "authorization", "cookie", "chainofthought", "reasoning_trace"];

function expectSecretFree(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const fragment of SECRET_LIKE) {
    expect(serialized).not.toContain(fragment);
  }
}

describe("verified fill creates exactly one execution proof", () => {
  it("records BITGET_DEMO fill truth with order, value, and authority", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("EXECUTED");
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, filledEventFor(store, flowId), repo);
    expect(proof).not.toBeNull();
    expect(proof).toMatchObject({
      version: PROOF_VERSION,
      kind: "EXECUTION_FILLED",
      flowId,
      subject: "NVDA",
      symbol: "NVDAUSDT",
      outcome: "FILLED · VERIFIED",
    });
    expect(proof?.id).toBe(proofIdFor("EXECUTION_FILLED", filledEventFor(store, flowId).id));
    expect(proof?.authority).toMatchObject({
      source: "STANDING_MANDATE",
      mandateId: mandate.id,
    });
    expect(proof?.authority.mandateHash).toBe(mandate.mandateHash);
    expect(proof?.proposal).toMatchObject({
      protectionPct: 20,
      notionalUsd: 100,
      side: "sell",
      action: "SHORT_HEDGE",
    });
    expect(proof?.mandateSnapshot).toMatchObject({
      mandateId: mandate.id,
      maxProtectionPct: 30,
      maxNotionalUsdt: 150,
      maxExecutions: 1,
    });
    expect(proof?.execution).toMatchObject({
      environment: "BITGET_DEMO",
      provider: "Bitget",
      providerOrderId: "demo-oid-111",
      quantity: "0.50",
      avgFillPrice: "201.5",
      executedValueUsdt: 100.75,
      status: "FILLED",
      fundsLabel: "DEMO · VIRTUAL FUNDS",
    });
    expect(proof?.provenance).toMatchObject({ evidenceSource: "TENAX_ACTIVITY_RECEIPT", imported: false });
    expectSecretFree(proof);
    expect(await repo.listProofs()).toHaveLength(1);
  });

  it("provider code 00000 without fill status creates no FILLED proof", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls, INFO_OPEN));
    expect(store.activities.some((a) => a.type === "AUTONOMOUS_EXECUTION_FILLED")).toBe(false);
    const failed = store.activities.find((a) => a.type === "AUTONOMOUS_EXECUTION_FAILED");
    expect(failed).toBeDefined();
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, failed!, repo);
    expect(proof?.kind).toBe("EXECUTION_FAILED");
    expect(proof?.execution).toBeNull();
    // The failed attempt links its receipt, but nothing durable may read
    // as a fill: no FILLED proof exists anywhere in the repository.
    expect(await repo.listProofs({ kind: "EXECUTION_FILLED" })).toHaveLength(0);
  });
});

describe("authority outcome proofs", () => {
  it("escalation persists proposal, bounds, reasons, and no-order truth", async () => {
    const { store, flowId } = await setupPassFlow();
    const mandate = setupActiveMandate(store, { authorityMode: "AUTO_WITH_ESCALATION", maxExecutions: 3 });
    store.mandates.set(mandate.id, {
      ...mandate,
      policy: { ...mandate.policy, maxProtectionPct: 10, maxNotionalUsdt: 50 },
    });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]);
    const event = store.activities.find((a) => a.type === "STANDING_AUTHORITY_ESCALATED");
    expect(event).toBeDefined();
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, event!, repo);
    expect(proof).toMatchObject({
      kind: "AUTHORITY_ESCALATED",
      outcome: "NO AUTONOMOUS ORDER SENT",
      proposal: { protectionPct: 20, notionalUsd: 100 },
      mandateSnapshot: { maxProtectionPct: 10, maxNotionalUsdt: 50 },
    });
    expect(proof?.reasonCodes).toContain("exceeds_max_protection_pct");
    expect(proof?.execution).toBeNull();
    expectSecretFree(proof);
  });

  it("refusal persists reasons with no order sent", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store, { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 10, maxNotionalUsdt: 50 });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("STANDING_REFUSED");
    expect(calls).toEqual([]);
    const event = store.activities.find((a) => a.type === "STANDING_AUTHORITY_REFUSED");
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, event!, repo);
    expect(proof).toMatchObject({ kind: "AUTHORITY_REFUSED", outcome: "NO ORDER SENT" });
    expect(proof?.execution).toBeNull();
  });

  it("review requirement persists human-review truth", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store, { authorityMode: "REVIEW_EVERY_ACTION" });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("STANDING_REVIEW");
    const event = store.activities.find((a) => a.type === "STANDING_REVIEW_REQUIRED");
    const repo = new InMemoryProofRepository();
    const proof = await recordJudgeProof(store, event!, repo);
    expect(proof).toMatchObject({
      kind: "REVIEW_REQUIRED",
      outcome: "HUMAN REVIEW REQUIRED — NO AUTONOMOUS ORDER SENT",
    });
  });

  it("DRY_RUN can never create EXECUTION_FILLED", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("EXECUTED");
    expect(store.activities.some((a) => a.type === "AUTONOMOUS_EXECUTION_FILLED")).toBe(false);
    const receiptEvent = store.activities.find((a) => a.type === "DECISION_RECEIPT_READY");
    const repo = new InMemoryProofRepository();
    expect(await recordJudgeProof(store, receiptEvent!, repo)).toBeNull();
    expect(await repo.listProofs()).toHaveLength(0);
  });

  it("non-proof events build nothing", async () => {
    const { store } = await setupPassFlow();
    const repo = new InMemoryProofRepository();
    for (const type of ["AI_ANALYSIS_COMPLETED", "STANDING_AUTHORITY_AUTHORIZED", "AUTONOMOUS_EXECUTION_SUBMITTED", "DECISION_RECEIPT_READY"] as const) {
      const event = emitActivityEvent(store, { type, flowId: "flow-0001", summary: "test" }, NOW);
      expect(buildJudgeProof(store, event)).toBeNull();
      expect(await recordJudgeProof(store, event, repo)).toBeNull();
    }
    expect(await repo.listProofs()).toHaveLength(0);
  });
});

describe("idempotency and immutability", () => {
  it("replays return the stored row without duplication or downgrade", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    const event = filledEventFor(store, flowId);
    const repo = new InMemoryProofRepository();
    const first = await recordJudgeProof(store, event, repo);
    const second = await recordJudgeProof(store, event, repo);
    expect(second).toEqual(first);
    expect(await repo.listProofs()).toHaveLength(1);
    // A conflicting payload under the same id cannot overwrite history.
    const tampered = { ...first!, outcome: "SUBMITTED · PENDING" };
    expect(await repo.saveProof(tampered)).toEqual(first);
    expect((await repo.getProof(first!.id))?.outcome).toBe("FILLED · VERIFIED");
  });

  it("proof identity derives from kind and source event", () => {
    expect(proofIdFor("EXECUTION_FILLED", "act-0007")).toBe("proof:v1:EXECUTION_FILLED:act-0007");
    expect(proofIdFor("AUTHORITY_REFUSED", "act-0007")).not.toBe(proofIdFor("EXECUTION_FILLED", "act-0007"));
  });
});

describe("storage failure isolation", () => {
  it("a throwing repository never affects the decision result", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    expect(result.outcome).toBe("EXECUTED");
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
    await expect(
      recordJudgeProof(store, filledEventFor(store, flowId), failing),
    ).rejects.toThrowError(ProofPersistenceError);
    expect(result.outcome).toBe("EXECUTED");
  });

  it("builder never throws on unknown shapes", async () => {
    const { store } = await setupPassFlow();
    const repo = new InMemoryProofRepository();
    const garbage = { id: "act-x", type: "SOMETHING_ELSE", flowId: "flow-0001" } as unknown as ActivityEvent;
    expect(buildJudgeProof(store, garbage)).toBeNull();
    expect(await recordJudgeProof(store, garbage, repo)).toBeNull();
  });
});

describe("repository behavior", () => {
  it("memory repository filters, finds, and labels itself non-durable", async () => {
    const repo = new InMemoryProofRepository();
    expect(repo.backend).toBe("MEMORY");
    expect(repo.durable).toBe(false);
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    const saved = await recordJudgeProof(store, filledEventFor(store, flowId), repo);
    expect(await repo.getProof(saved!.id)).toEqual(saved);
    expect(await repo.getProof("proof:v1:EXECUTION_FILLED:act-9999")).toBeNull();
    expect(await repo.findProofByReceiptId(saved!.receiptId!)).toEqual(saved);
    expect(await repo.findProofByFlowId(flowId)).toEqual(saved);
    expect(await repo.listProofs({ kind: "AUTHORITY_REFUSED" })).toHaveLength(0);
    expect(await repo.listProofs({ flowId })).toHaveLength(1);
  });

  it("resolves memory fallback without DATABASE_URL and Postgres with it", () => {
    const fallback = getProofRepository({});
    expect(fallback.backend).toBe("MEMORY");
    expect(fallback.durabilityState).toBe("EPHEMERAL");
    expect(fallback.durable).toBe(false);
    expect(fallback.reason).toMatch(/DATABASE_URL/);
    const postgresHandle = getProofRepository({ DATABASE_URL: "postgres://u:p@localhost:5432/tenax" });
    expect(postgresHandle.backend).toBe("POSTGRES");
    expect(postgresHandle.durabilityState).toBe("UNAVAILABLE");
    expect(postgresHandle.durable).toBe(false);
  });

  it("postgres repository emits only ledger SQL with safe parameters", async () => {
    const statements: Array<{ text: string; values: unknown[] }> = [];
    const rows = new Map<string, Record<string, unknown>>();
    const factory = async () => ({
      connect: async () => {},
      query: async (text: string, values: unknown[] = []) => {
        statements.push({ text, values });
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
          const receiptMatch = /WHERE receipt_id = \$1/.test(text);
          const flowMatch = /WHERE flow_id = \$1/.test(text);
          let selected = [...rows.values()];
          if (receiptMatch) selected = selected.filter((r) => r.receipt_id === values[0]);
          if (flowMatch) selected = selected.filter((r) => r.flow_id === values[0]);
          selected.sort((a, b) =>
            String(a.created_at) < String(b.created_at) ? 1 : -1,
          );
          const limitRaw = Number(values[values.length - 1]);
          return { rows: selected.slice(0, Number.isFinite(limitRaw) ? limitRaw : 100) };
        }
        throw new Error(`unexpected statement: ${head}`);
      },
      end: async () => {},
    });
    const repo = new PostgresProofRepository("postgres://u:p@localhost:5432/tenax", factory);
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    const proof = await recordJudgeProof(store, filledEventFor(store, flowId), repo);
    expect(proof?.kind).toBe("EXECUTION_FILLED");
    expect(await repo.getProof(proof!.id)).toEqual(proof);
    expect((await repo.listProofs()).map((p) => p.id)).toEqual([proof!.id]);
    expect(await repo.findProofByReceiptId(proof!.receiptId!)).toEqual(proof);
    expect(await repo.findProofByFlowId(flowId)).toEqual(proof);
    for (const statement of statements) {
      expect(statement.text.trimStart()).toMatch(/^(CREATE|INSERT|SELECT)/i);
    }
    expect(statements.some((s) => /ON CONFLICT \(id\) DO NOTHING/i.test(s.text))).toBe(true);
    expect(statements.filter((s) => s.text.trimStart().toUpperCase().startsWith("CREATE"))).toHaveLength(1);
    const serialized = JSON.stringify(statements);
    expect(serialized).not.toMatch(/api\.bitget|place-order|ACCESS-SIGN|paptrading/i);
  });
});

describe("import validation", () => {
  it("accepts a complete payload with import provenance stamped", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store);
    const calls: string[] = [];
    await runProtectionAgentCycle(store, { flowId }, agentDemoDeps(calls));
    const proof = await recordJudgeProof(store, filledEventFor(store, flowId), new InMemoryProofRepository());
    const imported = parseImportedProof({
      record: { ...proof, id: "proof:v1:EXECUTION_FILLED:act-manual-1", sourceActivityEventId: "act-manual-1" },
      importSource: "owner-attested 2026-09-20 Demo fill",
    });
    expect(imported?.provenance).toMatchObject({ imported: true, importSource: "owner-attested 2026-09-20 Demo fill" });
    expect(imported?.id).toBe("proof:v1:EXECUTION_FILLED:act-manual-1");
  });

  it("rejects empty provenance, non-objects, and incomplete payloads", () => {
    expect(parseImportedProof({ record: null, importSource: "x" })).toBeNull();
    expect(parseImportedProof({ record: { kind: "EXECUTION_FILLED" }, importSource: "x" })).toBeNull();
    expect(parseImportedProof({ record: {}, importSource: "   " })).toBeNull();
    const badKind = parseImportedProof({
      record: {
        id: "proof:v1:NOPE:act-1", version: 1, kind: "NOPE", flowId: "flow-1",
        subject: "NVDA", symbol: "NVDAUSDT", createdAt: new Date(NOW).toISOString(),
        outcome: "x", authority: { source: null, mode: null, mandateId: null, mandateHash: null },
        proposal: { protectionPct: null, notionalUsd: null, side: "sell", action: "SHORT_HEDGE" },
        mandateSnapshot: null, execution: null, receiptId: null, reasonCodes: [],
        sourceActivityEventId: "act-1",
        provenance: { evidenceSource: "TENAX_ACTIVITY_RECEIPT", recordedAt: new Date(NOW).toISOString(), imported: false, importSource: null },
      },
      importSource: "x",
    });
    expect(badKind).toBeNull();
  });
});

describe("judge display helpers", () => {
  it("labels, tones, filters, and formats stay truthful", () => {
    expect(PROOF_KINDS).toEqual([
      "EXECUTION_FILLED",
      "AUTHORITY_ESCALATED",
      "AUTHORITY_REFUSED",
      "POLICY_REFUSED",
      "REVIEW_REQUIRED",
      "EXECUTION_FAILED",
    ]);
    expect(proofKindLabel("EXECUTION_FILLED")).toBe("PROTECTION EXECUTED");
    expect(proofKindLabel("POLICY_REFUSED")).toBe("POLICY REFUSED — NO ORDER SENT");
    expect(proofTone("AUTHORITY_REFUSED")).toBe("refused");
    expect(proofTone("POLICY_REFUSED")).toBe("refused");
    expect(parseProofFilter("EXECUTED")).toBe("EXECUTED");
    expect(parseProofFilter("nope")).toBe("ALL");
    expect(parseProofFilter(null)).toBe("ALL");
    expect(proofKindForFilter("ALL")).toBeNull();
    expect(proofKindForFilter("FAILED")).toBe("EXECUTION_FAILED");
  });

  it("proof pages carry durability truth and no client writes", () => {
    const listSource = readFileSync(new URL("../src/app/app/proof/page.tsx", import.meta.url), "utf8");
    expect(listSource).toContain("EPHEMERAL PREVIEW — NOT DURABLE · SET DATABASE_URL FOR DURABLE JUDGE HISTORY");
    expect(listSource).toContain("UNAVAILABLE · POSTGRES CONNECTION FAILED");
    expect(listSource).toContain("DURABLE · POSTGRES");
    expect(listSource).not.toContain("fetch(");
    const detailSource = readFileSync(new URL("../src/app/app/proof/[id]/page.tsx", import.meta.url), "utf8");
    expect(detailSource).toContain("does not imply an open position");
    expect(detailSource).not.toContain("fetch(");
    const activitySource = readFileSync(new URL("../src/app/app/activity/page.tsx", import.meta.url), "utf8");
    expect(activitySource).toContain("VIEW DURABLE PROOFS");
    const receiptSource = readFileSync(new URL("../src/app/app/receipts/[id]/page.tsx", import.meta.url), "utf8");
    expect(receiptSource).toContain("VIEW DURABLE PROOF");
  });

  it("judgeProofSchema pins the versioned record shape", () => {
    expect(
      judgeProofSchema.safeParse({
        id: "proof:v1:EXECUTION_FILLED:act-1",
        version: PROOF_VERSION,
        kind: "EXECUTION_FILLED",
        flowId: "flow-0001",
        subject: "NVDA",
        symbol: "NVDAUSDT",
        createdAt: new Date(NOW).toISOString(),
        outcome: "FILLED · VERIFIED",
        authority: { source: "STANDING_MANDATE", mode: "AUTO_WITHIN_MANDATE", mandateId: "smand-0001", mandateHash: "abc" },
        proposal: { protectionPct: 20, notionalUsd: 100, side: "sell", action: "SHORT_HEDGE" },
        mandateSnapshot: {
          mandateId: "smand-0001", mode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 30,
          maxNotionalUsdt: 150, maxExecutions: 1, mandateHash: "abc",
        },
        execution: {
          environment: "BITGET_DEMO", provider: "Bitget", providerOrderId: "demo-oid-1",
          quantity: "0.50", avgFillPrice: "201.5", executedValueUsdt: 100.75,
          status: "FILLED", fundsLabel: "DEMO · VIRTUAL FUNDS",
        },
        receiptId: "TENAX-1C-flow-0001",
        reasonCodes: [],
        sourceActivityEventId: "act-1",
        provenance: { evidenceSource: "TENAX_ACTIVITY_RECEIPT", recordedAt: new Date(NOW).toISOString(), imported: false, importSource: null },
      }).success,
    ).toBe(true);
  });
});
