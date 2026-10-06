// Tenax Agentic Trading Evidence Slice 4 — submission evidence QA.
//
// Offline end-to-end proof over injected boundaries only: one fake
// EXECUTE cycle reaches the canonical run ledger, is durably queryable,
// and appears in CSV/JSON exports and the submission summary; ESCALATE
// and REFUSE produce NO_ORDER evidence with zero provider writes; judge
// DTOs carry no secret material. No network, no credentials, no writes.
import { beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "@/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "@/lib/intelligence/snapshot";
import {
  __resetStandingMandateCounterForTests,
} from "@/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  runProtectionAgentCycle,
} from "@/lib/tenax/index";
import {
  getPaperTradingRunRepository,
  resetPaperTradingRunRepositoryForTests,
} from "@/lib/tenax/paper-trading-run-repository";
import { loadSubmissionSummary } from "@/lib/tenax/paper-trading-submission-summary";
import { calculatePaperTradingMetrics } from "@/lib/tenax/paper-trading-metrics";
import {
  paperTradingExportPayload,
  paperTradingRunsToCsv,
} from "@/lib/tenax/paper-trading-run-export";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const NOW = Date.parse("2026-09-21T12:00:00.000Z");
// Marker that must never appear in any judge-facing DTO.
const MARKER = "marker-secret-never-in-dto-9f8";
const MARKER_CREDS = {
  apiKey: `${MARKER}-key`,
  secretKey: `${MARKER}-secret`,
  passphrase: `${MARKER}-pass`,
};

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

function activateMandate(
  store: ReturnType<typeof createDevStore>,
  overrides: {
    authorityMode?: "AUTO_WITHIN_MANDATE" | "AUTO_WITH_ESCALATION" | "REVIEW_EVERY_ACTION";
    maxExecutions?: number;
    maxProtectionPct?: number;
    maxNotionalUsdt?: number;
  } = {},
) {
  const { maxProtectionPct, maxNotionalUsdt, ...rest } = overrides;
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1, ...rest },
    NOW,
  );
  const narrowed =
    maxProtectionPct !== undefined || maxNotionalUsdt !== undefined
      ? {
          ...created,
          policy: {
            ...created.policy,
            maxProtectionPct: maxProtectionPct ?? created.policy.maxProtectionPct,
            maxNotionalUsdt: maxNotionalUsdt ?? created.policy.maxNotionalUsdt,
          },
        }
      : created;
  store.mandates.set(narrowed.id, narrowed);
  return activateStandingMandateRecord(store, { id: narrowed.id }, NOW);
}

function recordingImpl(calls: string[]) {
  return async (url: string) => {
    calls.push(url);
    return { status: 200, text: async () => "{}" };
  };
}

beforeEach(() => {
  resetPaperTradingRunRepositoryForTests();
  __resetStandingMandateCounterForTests();
});

describe("submission evidence QA", () => {
  it("one fake EXECUTE cycle reaches canonical evidence, query, exports, and summary", async () => {
    const { store, flowId } = await setupPassFlow();
    activateMandate(store);
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      {
        // Live timestamp: the standing freshness gate compares against
        // analyzedAt seated just above — a fixed past instant would read
        // as stale evidence and refuse by design.
        nowMs: Date.now(),
        credentials: MARKER_CREDS,
        writeFetchImpl: recordingImpl(calls),
        readFetchImpl: recordingImpl(calls),
      },
    );
    expect(result.outcome).toBe("EXECUTED");
    if (result.outcome !== "EXECUTED" || result.executionMode !== "DRY_RUN") {
      throw new Error("expected fake DRY_RUN EXECUTE");
    }
    expect(result.submitted).toBe(false);
    expect(calls).toEqual([]);

    const repository = getPaperTradingRunRepository();
    const runs = await repository.listRuns();
    expect(runs).toHaveLength(1);
    const run = runs[0];
    expect(run.flowId).toBe(flowId);
    expect(run.symbol).toBe("NVDAUSDT");
    expect(run.environment).toBe("DRY_RUN");
    expect(run.status).toBe("EXECUTED");
    expect(run.authority.outcome).toBe("EXECUTE");
    expect(run.execution.status).toBe("PREVIEW");
    expect(run.execution.submitted).toBe(false);
    expect(run.outcome.outcomeState).toBe("NOT_OBSERVED");

    // Durable query path returns the captured run.
    expect(await repository.getRun(run.runId)).toEqual(run);
    expect(await repository.summarizeRuns()).toMatchObject({
      totalRuns: 1,
      executes: 1,
      escalations: 0,
      refusals: 0,
    });

    // Exports contain the run; unknowns stay blank, never zero-filled.
    const csv = paperTradingRunsToCsv(runs);
    expect(csv).toContain(run.runId);
    expect(csv).toContain("NVDAUSDT");
    const payload = paperTradingExportPayload({
      exportedAt: new Date(NOW).toISOString(),
      persistence: repository.durabilityState,
      aggregates: await repository.summarizeRuns({}),
      metrics: calculatePaperTradingMetrics(runs),
      runs,
    });
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0].runId).toBe(run.runId);
    expect(payload.metrics.performance.sharpeStatus).toBe("INSUFFICIENT_DATA");
    expect(payload.metrics.performance.maxDrawdownStatus).toBe("INSUFFICIENT_DATA");

    // Submission summary composes the same canonical truth.
    const summary = await loadSubmissionSummary(repository);
    expect(summary.totals).toMatchObject({
      totalRuns: 1,
      executes: 1,
      escalations: 0,
      refusals: 0,
      failedExecutions: 0,
    });
    expect(summary.riskViolationsPrevented).toBe(0);
    expect(summary.realizedSampleSize).toBe(0);
    expect(summary.sharpe).toMatchObject({ value: null, status: "INSUFFICIENT_DATA" });
    expect(summary.drawdown).toMatchObject({ valuePct: null, status: "INSUFFICIENT_DATA" });
    expect(summary.latestRunAt).toBe(run.createdAt);
    expect(summary.exports).toEqual({
      csv: "/api/paper-trading/export.csv",
      json: "/api/paper-trading/export.json",
    });

    // No secret material enters any judge DTO.
    const serialized = JSON.stringify({ run, csv, payload, summary });
    expect(serialized).not.toContain(MARKER);
  });

  it("ESCALATE produces NO_ORDER evidence with zero provider writes", async () => {
    const { store, flowId } = await setupPassFlow();
    activateMandate(store, {
      authorityMode: "AUTO_WITH_ESCALATION",
      maxExecutions: 3,
      maxProtectionPct: 10,
      maxNotionalUsdt: 50,
    });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      {
        nowMs: Date.now(),
        credentials: MARKER_CREDS,
        writeFetchImpl: recordingImpl(calls),
        readFetchImpl: recordingImpl(calls),
      },
    );
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(calls).toEqual([]); // standing routing precedes every market read

    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      flowId,
      status: "ESCALATED",
      authority: { outcome: "ESCALATE" },
      execution: { status: "NO_ORDER", submitted: false },
    });
    expect(JSON.stringify(runs[0])).not.toContain(MARKER);

    const summary = await loadSubmissionSummary(getPaperTradingRunRepository());
    expect(summary.totals).toMatchObject({ totalRuns: 1, escalations: 1, executes: 0 });
    expect(summary.riskViolationsPrevented).toBe(1);
  });

  it("REFUSE produces NO_ORDER evidence with zero provider writes", async () => {
    const { store, flowId } = await setupPassFlow();
    activateMandate(store, { maxProtectionPct: 10, maxNotionalUsdt: 50 });
    const calls: string[] = [];
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      {
        nowMs: Date.now(),
        credentials: MARKER_CREDS,
        writeFetchImpl: recordingImpl(calls),
        readFetchImpl: recordingImpl(calls),
      },
    );
    expect(result.outcome).toBe("STANDING_REFUSED");
    expect(calls).toEqual([]);

    const runs = await getPaperTradingRunRepository().listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      flowId,
      status: "REFUSED",
      authority: { outcome: "REFUSE" },
      execution: { status: "NO_ORDER", submitted: false },
    });
    expect(JSON.stringify(runs[0])).not.toContain(MARKER);

    const summary = await loadSubmissionSummary(getPaperTradingRunRepository());
    expect(summary.totals).toMatchObject({ totalRuns: 1, refusals: 1, executes: 0 });
    expect(summary.riskViolationsPrevented).toBe(1);
  });

  it("an empty ledger stays honest: zeros, null latest, INSUFFICIENT DATA", async () => {
    const repository = getPaperTradingRunRepository();
    expect(await repository.listRuns()).toEqual([]);
    const summary = await loadSubmissionSummary(repository);
    expect(summary.totals).toMatchObject({
      totalRuns: 0,
      executes: 0,
      escalations: 0,
      refusals: 0,
      failedExecutions: 0,
    });
    expect(summary.latestRunAt).toBeNull();
    expect(summary.sharpe.status).toBe("INSUFFICIENT_DATA");
    expect(summary.drawdown.status).toBe("INSUFFICIENT_DATA");
    expect(summary.riskViolationsPrevented).toBe(0);
    expect(summary.realizedSampleSize).toBe(0);
  });
});
