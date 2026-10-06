import type { PaperTradingRun } from "./paper-trading-run.ts";
import type { PaperTradingRunDurabilityState, PaperTradingRunSummary } from "./paper-trading-run-repository.ts";

export const PAPER_TRADING_CSV_FIELDS = [
  "run_id",
  "flow_id",
  "created_at",
  "environment",
  "symbol",
  "event_type",
  "event_time",
  "event_price",
  "ai_provider",
  "ai_model",
  "proposal_direction",
  "proposal_notional",
  "proposal_protection_pct",
  "authority_mode",
  "authority_result",
  "authority_reason_codes",
  "execution_state",
  "provider",
  "provider_order_id",
  "side",
  "size",
  "fill_price",
  "fees",
  "outcome_status",
  "mark_price",
  "exit_price",
  "pnl",
  "pnl_observed_at",
] as const;

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const stringValue = Array.isArray(value) ? value.join(";") : String(value);
  return /[",\r\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function csvRow(run: PaperTradingRun): string[] {
  const pnl = run.outcome.realizedPnlUsdt ?? run.outcome.unrealizedPnlUsdt;
  const pnlObservedAt = run.outcome.realizedPnlUsdt !== null ? run.outcome.exitAt : run.outcome.markAt;
  return [
    run.runId,
    run.flowId,
    run.createdAt,
    run.environment,
    run.symbol,
    run.event.eventType,
    run.event.observedAt,
    run.event.observedPrice,
    run.decision.provider,
    run.decision.model,
    run.decision.direction,
    run.decision.proposedNotionalUsdt,
    run.decision.proposedProtectionPct,
    run.authority.mode,
    run.authority.outcome,
    run.authority.reasonCodes,
    run.execution.status,
    run.execution.provider,
    run.execution.orderId,
    run.execution.side,
    run.execution.size,
    run.execution.price,
    run.execution.fees,
    run.status,
    run.outcome.markPrice,
    run.outcome.exitPrice,
    pnl,
    pnlObservedAt,
  ].map(csvValue);
}

export function paperTradingRunsToCsv(runs: readonly PaperTradingRun[]): string {
  return [PAPER_TRADING_CSV_FIELDS.join(","), ...[...runs].reverse().map((run) => csvRow(run).join(","))].join("\r\n") + "\r\n";
}

export function paperTradingExportPayload(input: {
  readonly exportedAt: string;
  readonly persistence: PaperTradingRunDurabilityState;
  readonly aggregates: PaperTradingRunSummary;
  readonly runs: readonly PaperTradingRun[];
}) {
  return {
    schemaVersion: 1,
    exportedAt: input.exportedAt,
    source: "TENAX_RUN_LEDGER" as const,
    persistence: input.persistence,
    aggregates: input.aggregates,
    runs: [...input.runs].reverse(),
  };
}
