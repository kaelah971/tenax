// Tenax Agentic Trading Evidence Slice 4 — read-only submission summary.
//
// Composes existing ledger access (repository + reconciliation), the
// canonical metrics module, and the export payload helpers. Adds no new
// evidence architecture, no authority, no execution, no provider access.
// Unknowns stay unknown: an empty ledger yields zeros + INSUFFICIENT DATA,
// never fabricated values.

import { getTenaxDevStore } from "./dev-store.ts";
import { calculatePaperTradingMetrics } from "./paper-trading-metrics.ts";
import { reconcilePaperTradingRuns } from "./paper-trading-run-service.ts";
import {
  getPaperTradingRunRepository,
  type PaperTradingRunDurabilityState,
  type PaperTradingRunRepository,
} from "./paper-trading-run-repository.ts";

export const SUBMISSION_SUMMARY_VERSION = 1 as const;
export const SUBMISSION_SUMMARY_EXPORT_CSV = "/api/paper-trading/export.csv" as const;
export const SUBMISSION_SUMMARY_EXPORT_JSON = "/api/paper-trading/export.json" as const;

export interface SubmissionSummary {
  readonly schemaVersion: typeof SUBMISSION_SUMMARY_VERSION;
  readonly exportedAt: string;
  readonly persistence: PaperTradingRunDurabilityState;
  readonly backend: "POSTGRES" | "MEMORY";
  readonly totals: {
    readonly totalRuns: number;
    readonly executes: number;
    readonly escalations: number;
    readonly refusals: number;
    readonly failedExecutions: number;
  };
  /** Deterministic risk-control prevention count (mandate-boundary codes only). */
  readonly riskViolationsPrevented: number;
  readonly realizedSampleSize: number;
  readonly sharpe: {
    readonly value: number | null;
    readonly status: "AVAILABLE" | "INSUFFICIENT_DATA";
    readonly sampleSize: number;
  };
  readonly drawdown: {
    readonly valuePct: number | null;
    readonly status: "AVAILABLE" | "INSUFFICIENT_DATA";
  };
  readonly latestRunAt: string | null;
  readonly exports: {
    readonly csv: typeof SUBMISSION_SUMMARY_EXPORT_CSV;
    readonly json: typeof SUBMISSION_SUMMARY_EXPORT_JSON;
  };
}

export async function loadSubmissionSummary(
  repository: PaperTradingRunRepository = getPaperTradingRunRepository(),
  nowMs: number = Date.now(),
): Promise<SubmissionSummary> {
  await reconcilePaperTradingRuns(getTenaxDevStore(), repository, nowMs);
  const [runs, summary] = await Promise.all([
    repository.listRuns({ limit: 5000 }),
    repository.summarizeRuns({}),
  ]);
  const metrics = calculatePaperTradingMetrics(runs);
  const latestRunAt = runs.reduce<string | null>(
    (latest, run) => (latest === null || run.createdAt > latest ? run.createdAt : latest),
    null,
  );
  return {
    schemaVersion: SUBMISSION_SUMMARY_VERSION,
    exportedAt: new Date(nowMs).toISOString(),
    persistence: repository.durabilityState,
    backend: repository.backend,
    totals: {
      totalRuns: summary.totalRuns,
      executes: summary.executes,
      escalations: summary.escalations,
      refusals: summary.refusals,
      failedExecutions: summary.failedExecutions,
    },
    riskViolationsPrevented: metrics.riskControl.riskViolationPreventionCount,
    realizedSampleSize: metrics.performance.realizedRunCount,
    sharpe: {
      value: metrics.performance.sharpe,
      status: metrics.performance.sharpeStatus,
      sampleSize: metrics.performance.sharpeSampleSize,
    },
    drawdown: {
      valuePct: metrics.performance.maxDrawdownPct,
      status: metrics.performance.maxDrawdownStatus,
    },
    latestRunAt,
    exports: {
      csv: SUBMISSION_SUMMARY_EXPORT_CSV,
      json: SUBMISSION_SUMMARY_EXPORT_JSON,
    },
  };
}
