import { beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "@/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "@/lib/intelligence/snapshot";
import {
  analyzeProtectionIntent,
  createDevStore,
  createProtectionIntent,
  runProtectionAgentCycle,
} from "@/lib/tenax";
import {
  buildPaperTradingRun,
  type PaperTradingRun,
} from "@/lib/tenax/paper-trading-run";
import {
  getPaperTradingRunRepository,
  InMemoryPaperTradingRunRepository,
  PostgresPaperTradingRunRepository,
  resetPaperTradingRunRepositoryForTests,
} from "@/lib/tenax/paper-trading-run-repository";
import {
  persistPaperTradingRun,
  reconcilePaperTradingRuns,
} from "@/lib/tenax/paper-trading-run-service";
import type { JudgeProof } from "@/lib/proof/model";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const NOW = Date.parse("2026-09-21T12:00:00.000Z");

function activity(type: "STANDING_AUTHORITY_ESCALATED" | "STANDING_AUTHORITY_REFUSED" | "STANDING_REVIEW_REQUIRED" | "AUTONOMOUS_EXECUTION_FAILED" | "AUTONOMOUS_EXECUTION_FILLED" | "DECISION_RECEIPT_READY" | "AUTONOMOUS_EXECUTION_SUBMITTED", flowId: string, id: string) {
  return {
    id,
    type,
    flowId,
    createdAt: new Date(NOW).toISOString(),
    summary: type,
    receiptId: null,
    details: {
      mandateId: "smand-0001",
      reasonCodes: type === "STANDING_AUTHORITY_ESCALATED" ? ["exceeds_max_notional"] : [],
      proposedPct: 20,
      proposedUsd: 100,
      maxPct: 30,
      maxNotional: 150,
    },
  } as const;
}

function runForEvent(type: Parameters<typeof activity>[0], flowId: string, id: string): PaperTradingRun {
  const store = createDevStore();
  const event = activity(type, flowId, id);
  store.activities.push(event);
  return buildPaperTradingRun({ store, flowId, event, nowMs: NOW });
}

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

beforeEach(() => {
  resetPaperTradingRunRepositoryForTests();
});

describe("canonical paper-trading run ledger", () => {
  it("turns a completed no-mandate agent cycle into one idempotent run", async () => {
    const store = createDevStore();
    const { flowId } = createProtectionIntent(store, { rawText: "Protect NVIDIA through the event." });
    analyzeProtectionIntent(store, flowId, await testSnapshot());

    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: NOW });
    expect(result.outcome).toBe("NO_STANDING_MANDATE");

    const repository = getPaperTradingRunRepository();
    const first = await repository.listRuns();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      flowId,
      status: "REFUSED",
      authority: { outcome: "REFUSE", reasonCodes: ["no_standing_mandate"] },
      execution: { status: "NO_ORDER", submitted: false },
    });

    await runProtectionAgentCycle(store, { flowId }, { nowMs: NOW + 1 });
    expect(await repository.listRuns()).toHaveLength(1);
  });

  it("reconciles execute, escalate, refuse, review, and failed outcomes without provider writes", async () => {
    const store = createDevStore();
    store.activities.push(
      activity("STANDING_AUTHORITY_ESCALATED", "flow-0001", "act-0001"),
      activity("STANDING_AUTHORITY_REFUSED", "flow-0002", "act-0002"),
      activity("STANDING_REVIEW_REQUIRED", "flow-0003", "act-0003"),
      activity("AUTONOMOUS_EXECUTION_FAILED", "flow-0004", "act-0004"),
      activity("AUTONOMOUS_EXECUTION_FILLED", "flow-0005", "act-0005"),
    );
    const repository = new InMemoryPaperTradingRunRepository();

    const first = await reconcilePaperTradingRuns(store, repository, NOW);
    const second = await reconcilePaperTradingRuns(store, repository, NOW + 1);
    const runs = await repository.listRuns();

    expect(first.terminalCandidates).toBe(5);
    expect(first.persisted).toBe(5);
    expect(second.persisted).toBe(5);
    expect(runs).toHaveLength(5);
    expect(runs.map((run) => run.status)).toEqual([
      "ESCALATED",
      "REFUSED",
      "REVIEW_REQUIRED",
      "FAILED",
      "EXECUTED",
    ]);
    expect(runs.find((run) => run.status === "ESCALATED")?.execution.status).toBe("NO_ORDER");
    expect(runs.find((run) => run.status === "REFUSED")?.execution.submitted).toBe(false);
    expect(runs.find((run) => run.status === "FAILED")?.execution.status).toBe("FAILED");
    expect(await repository.listRuns({ status: "ESCALATED", symbol: "NVDAUSDT" })).toHaveLength(1);
    expect(await repository.summarizeRuns()).toEqual({
      totalRuns: 5,
      executes: 2,
      escalations: 1,
      refusals: 1,
      failedExecutions: 1,
    });
  });

  it("does not turn an accepted-but-unverified fill event into FILLED or invent outcomes", async () => {
    const store = createDevStore();
    store.activities.push(activity("AUTONOMOUS_EXECUTION_FILLED", "flow-0001", "act-0001"));
    const repository = new InMemoryPaperTradingRunRepository();

    await reconcilePaperTradingRuns(store, repository, NOW);
    const run = (await repository.listRuns())[0];

    expect(run.execution.status).toBe("UNKNOWN");
    expect(run.execution.status).not.toBe("FILLED");
    expect(run.execution.orderId).toBeNull();
    expect(run.outcome.markPrice).toBeNull();
    expect(run.outcome.realizedPnlUsdt).toBeNull();
    expect(run.provenance.execution).toBe("TENAX_DOMAIN");
  });

  it("skips incomplete historical submissions instead of fabricating a run", async () => {
    const store = createDevStore();
    store.activities.push(activity("AUTONOMOUS_EXECUTION_SUBMITTED", "flow-0001", "act-0001"));
    const repository = new InMemoryPaperTradingRunRepository();

    const result = await reconcilePaperTradingRuns(store, repository, NOW);

    expect(result.terminalCandidates).toBe(0);
    expect(result.persisted).toBe(0);
    expect(await repository.listRuns()).toEqual([]);
  });

  it("uses the additive Postgres schema and first-write-wins idempotency contract", async () => {
    const run = runForEvent("STANDING_AUTHORITY_REFUSED", "flow-0001", "act-0001");
    const queries: string[] = [];
    const repository = new PostgresPaperTradingRunRepository("postgres://owner@localhost/tenax", async () => ({
      connect: async () => {},
      end: async () => {},
      query: async (text: string) => {
        queries.push(text);
        if (text.startsWith("INSERT")) return { rows: [{ record: JSON.stringify(run) }] };
        if (text.startsWith("SELECT record")) return { rows: [{ record: JSON.stringify(run) }] };
        return { rows: [] };
      },
    }));

    expect(await repository.saveRun(run)).toEqual(run);
    expect(await repository.saveRun({ ...run, status: "EXECUTED" })).toEqual(run);
    expect(queries[0]).toContain("CREATE TABLE IF NOT EXISTS tenax_paper_trading_runs");
    expect(queries.some((query) => query.startsWith("INSERT"))).toBe(true);
  });
});

describe("proof-link backfill on first-write-wins races", () => {
  const FLOW = "flow-0009";

  function filledProof(): JudgeProof {
    return {
      id: "proof:v1:EXECUTION_FILLED:act-0009",
      version: 1,
      kind: "EXECUTION_FILLED",
      flowId: FLOW,
      subject: "NVDA",
      symbol: "NVDAUSDT",
      createdAt: new Date(NOW).toISOString(),
      outcome: "FILLED · VERIFIED",
      authority: {
        source: "STANDING_MANDATE",
        mode: "AUTO_WITHIN_MANDATE",
        mandateId: "smand-0001",
        mandateHash: "abc",
      },
      proposal: { protectionPct: 20, notionalUsd: 100, side: "sell", action: "SHORT_HEDGE" },
      mandateSnapshot: null,
      execution: {
        environment: "BITGET_DEMO",
        provider: "Bitget",
        providerOrderId: "demo-oid-9",
        quantity: "0.50",
        avgFillPrice: "201.5",
        executedValueUsdt: 100.75,
        status: "FILLED",
        fundsLabel: "DEMO · VIRTUAL FUNDS",
      },
      receiptId: null,
      reasonCodes: [],
      sourceActivityEventId: "act-0009",
      provenance: {
        evidenceSource: "TENAX_ACTIVITY_RECEIPT",
        recordedAt: new Date(NOW).toISOString(),
        imported: false,
        importSource: null,
      },
    };
  }

  it("backfills a missing sourceProofId when the proof-linked write arrives late", async () => {
    const repository = new InMemoryPaperTradingRunRepository();
    // Seed: the poorer proof-less record wins the race (observed live).
    const seedStore = createDevStore();
    const seedEvent = activity("AUTONOMOUS_EXECUTION_FILLED", FLOW, "act-0008");
    seedStore.activities.push(seedEvent);
    const seed = buildPaperTradingRun({ store: seedStore, flowId: FLOW, event: seedEvent, proof: null, nowMs: NOW });
    expect(seed.sourceProofId).toBeNull();
    await repository.saveRun(seed);
    // Late arrival: the rich proof-linked write for the same flow.
    const richStore = createDevStore();
    const richEvent = activity("AUTONOMOUS_EXECUTION_FILLED", FLOW, "act-0009");
    richStore.activities.push(richEvent);
    const proof = filledProof();
    const saved = await persistPaperTradingRun({
      store: richStore,
      event: richEvent,
      proof,
      repository,
      nowMs: NOW,
    });
    expect(saved?.sourceProofId).toBe(proof.id);
    expect(saved?.status).toBe("EXECUTED");
    // Link-only merge: the seed's own outcome fields are never rewritten.
    expect(saved?.execution.status).toBe("UNKNOWN");
    expect(saved?.sourceActivityEventId).toBe("act-0008");
    expect((await repository.getRun(saved?.runId ?? ""))?.sourceProofId).toBe(proof.id);
  });

  it("leaves already-linked runs untouched and never invents links", async () => {
    const repository = new InMemoryPaperTradingRunRepository();
    const store = createDevStore();
    const event = activity("AUTONOMOUS_EXECUTION_FILLED", FLOW, "act-0009");
    store.activities.push(event);
    const proof = filledProof();
    const first = await persistPaperTradingRun({ store, event, proof, repository, nowMs: NOW });
    expect(first?.sourceProofId).toBe(proof.id);
    // A later proof-less write for the same flow cannot strip the link.
    const poorer = await persistPaperTradingRun({ store, event, proof: null, repository, nowMs: NOW });
    expect(poorer?.sourceProofId).toBe(proof.id);
    // Refusals derive their proof deterministically from the event — the
    // link is earned, never fabricated (id binds kind + source event).
    const bare = await persistPaperTradingRun({
      store,
      event: activity("STANDING_AUTHORITY_REFUSED", "flow-0010", "act-0010"),
      proof: null,
      repository,
      nowMs: NOW,
    });
    expect(bare?.sourceProofId).toBe("proof:v1:AUTHORITY_REFUSED:act-0010");
  });
});
