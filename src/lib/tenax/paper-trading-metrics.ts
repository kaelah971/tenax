import type { PaperTradingRun } from "./paper-trading-run.ts";

export interface PaperTradingRiskMetrics {
  readonly totalRuns: number;
  readonly actionableProposals: number;
  readonly executed: number;
  readonly escalated: number;
  readonly refused: number;
  readonly reviewRequired: number;
  readonly noAction: number;
  readonly failedExecution: number;
  readonly executionRate: number | null;
  readonly escalationRate: number | null;
  readonly refusalRate: number | null;
  readonly humanTakeoverRate: number | null;
  readonly riskViolationPreventionCount: number;
}

export interface PaperTradingPerformanceMetrics {
  readonly realizedRunCount: number;
  readonly winningRuns: number;
  readonly losingRuns: number;
  readonly flatRuns: number;
  readonly winRate: number | null;
  readonly grossRealizedPnl: number | null;
  readonly netRealizedPnl: number | null;
  readonly averageRealizedReturnPct: number | null;
  readonly cumulativeRealizedReturnPct: number | null;
  readonly maxDrawdownPct: number | null;
  readonly maxDrawdownStatus: "AVAILABLE" | "INSUFFICIENT_DATA";
  readonly sharpe: number | null;
  readonly sharpeStatus: "AVAILABLE" | "INSUFFICIENT_DATA";
  readonly sharpeSampleSize: number;
}

export interface PaperTradingMetrics {
  readonly riskControl: PaperTradingRiskMetrics;
  readonly performance: PaperTradingPerformanceMetrics;
  readonly methodology: {
    readonly actionableDenominator: string;
    readonly executionRate: string;
    readonly humanTakeoverRate: string;
    readonly riskViolationPrevention: string;
    readonly realizedSample: string;
    readonly drawdown: string;
    readonly sharpe: string;
    readonly unknowns: string;
  };
}

const RISK_BOUNDARY_REASON = /(^|_)(max|exceeds|cumulative|leverage|forbidden|mandate|underlying_allowed|protection)(_|$)/i;

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function realizedRuns(runs: readonly PaperTradingRun[]): PaperTradingRun[] {
  return [...runs]
    .filter((run) => run.outcome.outcomeState === "REALIZED")
    .filter((run) => run.outcome.realizedPnlUsdt !== null && run.outcome.realizedReturnPct !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function maxDrawdownPct(returns: readonly number[]): number | null {
  if (returns.length === 0) return null;
  let equity = 1;
  let peak = 1;
  let drawdown = 0;
  for (const returnPct of returns) {
    equity *= 1 + returnPct / 100;
    peak = Math.max(peak, equity);
    drawdown = Math.min(drawdown, (equity - peak) / peak);
  }
  return round(drawdown * 100);
}

function sharpeNonAnnualized(returns: readonly number[]): number | null {
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const standardDeviation = Math.sqrt(variance);
  if (!(standardDeviation > 0)) return null;
  return round(mean / standardDeviation);
}

export function calculatePaperTradingMetrics(runs: readonly PaperTradingRun[]): PaperTradingMetrics {
  const actionable = runs.filter((run) => ["EXECUTE", "ESCALATE", "REFUSE", "REVIEW"].includes(run.authority.outcome));
  const executed = runs.filter((run) => run.authority.outcome === "EXECUTE").length;
  const escalated = runs.filter((run) => run.authority.outcome === "ESCALATE").length;
  const refused = runs.filter((run) => run.authority.outcome === "REFUSE").length;
  const reviewRequired = runs.filter((run) => run.authority.outcome === "REVIEW").length;
  const noAction = runs.filter((run) => run.authority.outcome === "NO_ACTION").length;
  const failedExecution = runs.filter((run) => run.execution.status === "FAILED" || run.status === "FAILED").length;
  const riskViolationPreventionCount = runs.filter((run) =>
    ["ESCALATE", "REFUSE", "REVIEW"].includes(run.authority.outcome) &&
    run.authority.reasonCodes.some((code) => RISK_BOUNDARY_REASON.test(code)),
  ).length;

  const realized = realizedRuns(runs);
  const returns = realized.map((run) => run.outcome.realizedReturnPct as number);
  const pnl = realized.map((run) => run.outcome.realizedPnlUsdt as number);
  const wins = pnl.filter((value) => value > 0).length;
  const losses = pnl.filter((value) => value < 0).length;
  const flats = pnl.filter((value) => value === 0).length;
  const netComplete = realized.every((run) => run.outcome.netRealizedPnlUsdt !== null);
  const cumulative = returns.reduce((total, value) => total * (1 + value / 100), 1) - 1;

  return {
    riskControl: {
      totalRuns: runs.length,
      actionableProposals: actionable.length,
      executed,
      escalated,
      refused,
      reviewRequired,
      noAction,
      failedExecution,
      executionRate: ratio(executed, actionable.length),
      escalationRate: ratio(escalated, actionable.length),
      refusalRate: ratio(refused, actionable.length),
      humanTakeoverRate: ratio(escalated + reviewRequired, actionable.length),
      riskViolationPreventionCount,
    },
    performance: {
      realizedRunCount: realized.length,
      winningRuns: wins,
      losingRuns: losses,
      flatRuns: flats,
      winRate: ratio(wins, realized.length),
      grossRealizedPnl: realized.length > 0 ? round(pnl.reduce((sum, value) => sum + value, 0)) : null,
      netRealizedPnl: realized.length > 0 && netComplete
        ? round(realized.reduce((sum, run) => sum + (run.outcome.netRealizedPnlUsdt as number), 0))
        : null,
      averageRealizedReturnPct: returns.length > 0 ? round(returns.reduce((sum, value) => sum + value, 0) / returns.length) : null,
      cumulativeRealizedReturnPct: returns.length > 0 ? round(cumulative * 100) : null,
      maxDrawdownPct: maxDrawdownPct(returns),
      maxDrawdownStatus: returns.length > 0 ? "AVAILABLE" : "INSUFFICIENT_DATA",
      sharpe: sharpeNonAnnualized(returns),
      sharpeStatus: returns.length >= 2 && sharpeNonAnnualized(returns) !== null ? "AVAILABLE" : "INSUFFICIENT_DATA",
      sharpeSampleSize: returns.length,
    },
    methodology: {
      actionableDenominator: "EXECUTE + ESCALATE + REFUSE + REVIEW; NO_ACTION and UNKNOWN excluded.",
      executionRate: "EXECUTE authority outcomes divided by actionable proposals; it is not a fill rate.",
      humanTakeoverRate: "ESCALATE + REVIEW divided by actionable proposals.",
      riskViolationPrevention: "ESCALATE/REFUSE/REVIEW runs with deterministic mandate-boundary reason codes only.",
      realizedSample: "REALIZED runs with verified entry and attributable verified exit price, size, and timestamp.",
      drawdown: "Percentage drawdown of the chronological compounded realized-return curve; no unrealized marks included.",
      sharpe: "RUN-RETURN SHARPE · NON-ANNUALIZED: mean realized run return divided by sample standard deviation; no annualization.",
      unknowns: "Missing fills, prices, fees, exits, and outcomes remain UNKNOWN/INSUFFICIENT DATA; no zero is inferred.",
    },
  };
}
