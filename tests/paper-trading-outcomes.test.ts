import { beforeEach, describe, expect, it } from "vitest";

import {
  applyTrustedOutcomeObservation,
  type TrustedOutcomeObservation,
} from "@/lib/tenax/paper-trading-outcomes";
import { calculatePaperTradingMetrics } from "@/lib/tenax/paper-trading-metrics";
import { buildPaperTradingRun, paperTradingRunSchema, type PaperTradingRun } from "@/lib/tenax/paper-trading-run";
import { InMemoryPaperTradingRunRepository, resetPaperTradingRunRepositoryForTests } from "@/lib/tenax/paper-trading-run-repository";
import { reconcilePaperTradingOutcomes } from "@/lib/tenax/paper-trading-outcome-service";
import { createDevStore } from "@/lib/tenax/dev-store";

const NOW = "2026-10-05T12:00:00.000Z";

function baseRun(): PaperTradingRun {
  const store = createDevStore();
  const event = {
    id: "act-0001",
    type: "AUTONOMOUS_EXECUTION_FILLED" as const,
    flowId: "flow-0001",
    createdAt: NOW,
    summary: "Demo execution terminal state",
    receiptId: "receipt-0001",
    details: null,
  };
  store.activities.push(event);
  return paperTradingRunSchema.parse({
    ...buildPaperTradingRun({ store, flowId: event.flowId, event }),
    status: "EXECUTED",
    authority: { ...buildPaperTradingRun({ store, flowId: event.flowId, event }).authority, outcome: "EXECUTE" },
    execution: {
      provider: "Bitget",
      orderId: "entry-0001",
      status: "FILLED",
      submitted: true,
      side: "sell",
      size: "0.5",
      price: 200,
      fees: null,
      submittedAt: NOW,
      verifiedAt: NOW,
      noOrderReason: null,
    },
    outcome: {
      ...buildPaperTradingRun({ store, flowId: event.flowId, event }).outcome,
      outcomeState: "NOT_OBSERVED",
    },
  });
}

function observation(overrides: Partial<TrustedOutcomeObservation>): TrustedOutcomeObservation {
  return {
    runId: "paper-run:v1:flow-0001",
    kind: "MARK",
    source: "BITGET_PUBLIC",
    observedAt: "2026-10-05T13:00:00.000Z",
    price: 190,
    positionState: "OPEN",
    ...overrides,
  };
}

beforeEach(() => resetPaperTradingRunRepositoryForTests());

describe("trusted paper-trading outcomes", () => {
  it("records a trusted short open mark as unrealized and never realized", () => {
    const run = baseRun();
    const marked = applyTrustedOutcomeObservation(run, observation({}));

    expect(marked?.outcome.outcomeState).toBe("OPEN_MARK");
    expect(marked?.outcome.markPnlUsdt).toBe(5);
    expect(marked?.outcome.markReturnPct).toBe(5);
    expect(marked?.outcome.realizedPnlUsdt).toBeNull();
    expect(marked?.outcome.markSource).toBe("BITGET_PUBLIC");
  });

  it("requires explicit exit attribution and trusted fill facts for realized outcome", async () => {
    const repository = new InMemoryPaperTradingRunRepository();
    const run = baseRun();
    await repository.saveRun(run);
    const ambiguous = await reconcilePaperTradingOutcomes(repository, [observation({ kind: "EXIT", source: "BITGET_DEMO_PRIVATE", price: 180, size: "0.5", orderId: "exit-ambiguous", attributableToRun: false })]);
    expect(ambiguous.updated).toBe(0);
    expect((await repository.getRun(run.runId))?.outcome.outcomeState).toBe("NOT_OBSERVED");

    const realized = await reconcilePaperTradingOutcomes(repository, [observation({ kind: "EXIT", source: "BITGET_DEMO_PRIVATE", price: 180, size: "0.5", orderId: "exit-0001", attributableToRun: true, feesUsdt: 1 })]);
    const stored = await repository.getRun(run.runId);
    expect(realized.updated).toBe(1);
    expect(stored?.outcome.outcomeState).toBe("REALIZED");
    expect(stored?.outcome.realizedPnlUsdt).toBe(10);
    expect(stored?.outcome.realizedReturnPct).toBe(10);
    expect(stored?.outcome.netRealizedPnlUsdt).toBe(9);
    expect(stored?.outcome.exitProviderOrderId).toBe("exit-0001");
  });

  it("does not downgrade realized evidence to a later mark", async () => {
    const repository = new InMemoryPaperTradingRunRepository();
    const run = baseRun();
    await repository.saveRun(run);
    await reconcilePaperTradingOutcomes(repository, [observation({ kind: "EXIT", source: "BITGET_DEMO_PRIVATE", price: 180, size: "0.5", orderId: "exit-0001", attributableToRun: true })]);
    const result = await reconcilePaperTradingOutcomes(repository, [observation({ price: 195, observedAt: "2026-10-05T14:00:00.000Z" })]);
    expect(result.updated).toBe(0);
    expect((await repository.getRun(run.runId))?.outcome.outcomeState).toBe("REALIZED");
  });

  it("marks closed-without-attributable-exit unavailable and keeps missing fees unknown", async () => {
    const repository = new InMemoryPaperTradingRunRepository();
    const run = baseRun();
    await repository.saveRun(run);
    const closed = await reconcilePaperTradingOutcomes(repository, [observation({ positionState: "CLOSED" })]);
    expect(closed.updated).toBe(1);
    expect((await repository.getRun(run.runId))?.outcome.outcomeState).toBe("UNAVAILABLE");

    const second = paperTradingRunSchema.parse({ ...run, runId: "paper-run:v1:flow-0002", flowId: "flow-0002" });
    await repository.saveRun(second);
    await reconcilePaperTradingOutcomes(repository, [observation({ runId: second.runId, kind: "EXIT", source: "BITGET_DEMO_PRIVATE", price: 180, size: "0.5", orderId: "exit-0002", attributableToRun: true })]);
    expect((await repository.getRun(second.runId))?.outcome.netRealizedPnlUsdt).toBeNull();
  });

  it("calculates risk-control and realized-only performance metrics honestly", () => {
    const winner = baseRun();
    const loser = paperTradingRunSchema.parse({
      ...winner,
      runId: "paper-run:v1:flow-0002",
      flowId: "flow-0002",
      createdAt: "2026-10-06T12:00:00.000Z",
      outcome: { ...winner.outcome, outcomeState: "REALIZED", realizedPnlUsdt: -5, realizedReturnPct: -5 },
    });
    const escalated = buildPaperTradingRun({
      store: createDevStore(),
      flowId: "flow-0003",
      event: {
        id: "act-0003",
        type: "STANDING_AUTHORITY_ESCALATED",
        flowId: "flow-0003",
        createdAt: "2026-10-07T12:00:00.000Z",
        summary: "exceeds_max_notional",
        receiptId: null,
        details: { reasonCodes: ["exceeds_max_notional"] },
      },
    });
    const failed = paperTradingRunSchema.parse({
      ...winner,
      runId: "paper-run:v1:flow-0004",
      flowId: "flow-0004",
      status: "FAILED",
      execution: { ...winner.execution, status: "FAILED" },
    });
    const metrics = calculatePaperTradingMetrics([winner, loser, escalated, failed]);

    expect(metrics.riskControl.actionableProposals).toBe(4);
    expect(metrics.riskControl.executionRate).toBe(3 / 4);
    expect(metrics.riskControl.humanTakeoverRate).toBe(1 / 4);
    expect(metrics.riskControl.riskViolationPreventionCount).toBe(1);
    expect(metrics.performance.realizedRunCount).toBe(1);
    expect(metrics.performance.winRate).toBe(0);
    expect(metrics.performance.sharpeStatus).toBe("INSUFFICIENT_DATA");
    expect(metrics.performance.maxDrawdownPct).toBe(-5);
  });
});
