import Link from "next/link";
import type { ReactElement } from "react";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import {
  reconcilePaperTradingRuns,
} from "@/lib/tenax/paper-trading-run-service";
import {
  getPaperTradingRunRepository,
  type PaperTradingRunFilter,
} from "@/lib/tenax/paper-trading-run-repository";
import type { PaperTradingRun } from "@/lib/tenax/paper-trading-run";
import { calculatePaperTradingMetrics } from "@/lib/tenax/paper-trading-metrics";
import { outcomeBadgeClass } from "../_components/signal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{
  environment?: string;
  authority?: string;
  execution?: string;
  symbol?: string;
}>;

const ENVIRONMENTS = ["ALL", "DRY_RUN", "BITGET_DEMO"] as const;
const AUTHORITIES = ["ALL", "EXECUTE", "ESCALATE", "REFUSE", "REVIEW", "NO_ACTION"] as const;
const EXECUTIONS = ["ALL", "NO_ORDER", "SUBMITTED", "FILLED", "FAILED", "UNKNOWN"] as const;

type Filters = {
  readonly environment: (typeof ENVIRONMENTS)[number];
  readonly authority: (typeof AUTHORITIES)[number];
  readonly execution: (typeof EXECUTIONS)[number];
  readonly symbol: string;
};

function parseFilters(params: Awaited<SearchParams>): Filters {
  const environment = ENVIRONMENTS.includes(params.environment as Filters["environment"])
    ? params.environment as Filters["environment"]
    : "ALL";
  const authority = AUTHORITIES.includes(params.authority as Filters["authority"])
    ? params.authority as Filters["authority"]
    : "ALL";
  const execution = EXECUTIONS.includes(params.execution as Filters["execution"])
    ? params.execution as Filters["execution"]
    : "ALL";
  return {
    environment,
    authority,
    execution,
    symbol: params.symbol?.trim() ?? "",
  };
}

function queryFor(filters: Filters, key: keyof Filters, value: string): string {
  const next = { ...filters, [key]: value };
  const query = new URLSearchParams();
  if (next.environment !== "ALL") query.set("environment", next.environment);
  if (next.authority !== "ALL") query.set("authority", next.authority);
  if (next.execution !== "ALL") query.set("execution", next.execution);
  if (next.symbol !== "") query.set("symbol", next.symbol);
  const serialized = query.toString();
  return `/app/paper-trading${serialized ? `?${serialized}` : ""}`;
}

function exportQuery(filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.environment !== "ALL") query.set("environment", filters.environment);
  if (filters.authority !== "ALL") query.set("authority", filters.authority);
  if (filters.execution !== "ALL") query.set("execution", filters.execution);
  if (filters.symbol !== "") query.set("symbol", filters.symbol);
  return query.toString() ? `?${query.toString()}` : "";
}

function time(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "UNKNOWN TIME" : parsed.toLocaleString();
}

function statusClass(status: PaperTradingRun["status"]): string {
  switch (status) {
    case "EXECUTED":
      return outcomeBadgeClass("done");
    case "ESCALATED":
      return outcomeBadgeClass("escalated");
    case "REVIEW_REQUIRED":
      return outcomeBadgeClass("review");
    case "REFUSED":
      return outcomeBadgeClass("refused");
    case "FAILED":
      return outcomeBadgeClass("failed");
    default:
      return "border border-ink/20 text-ink";
  }
}

function filterLink(filters: Filters, key: keyof Filters, value: string): ReactElement {
  const active = filters[key] === value;
  return (
    <Link
      key={`${key}:${value}`}
      href={queryFor(filters, key, value)}
      className={`font-syslabel rounded-[7px] px-3 py-2 text-[10px] uppercase tracking-[0.08em] ${active ? "bg-signal/10 font-bold text-signal shadow-[inset_0_0_0_1px_rgba(99,255,42,0.35)]" : "text-mutedink hover:bg-ink/5 hover:text-ink"}`}
      aria-current={active ? "page" : undefined}
    >
      {value.replaceAll("_", " ")}
    </Link>
  );
}

function repositoryLabel(state: string): string {
  if (state === "DURABLE") return "DURABLE · POSTGRES";
  if (state === "EPHEMERAL") return "EPHEMERAL · DEVELOPMENT MEMORY";
  return "UNAVAILABLE · POSTGRES UNAVAILABLE";
}

export default async function PaperTradingPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams);
  const repository = getPaperTradingRunRepository();
  const store = getTenaxDevStore();
  let runs: PaperTradingRun[] = [];
  let summary = { totalRuns: 0, executes: 0, escalations: 0, refusals: 0, failedExecutions: 0 };
  let metrics = calculatePaperTradingMetrics([]);
  let unavailable = false;

  try {
    await reconcilePaperTradingRuns(store, repository);
    const filter: PaperTradingRunFilter = {
      environment: filters.environment === "ALL" ? undefined : filters.environment,
      authorityOutcome: filters.authority === "ALL" ? undefined : filters.authority,
      executionStatus: filters.execution === "ALL" ? undefined : filters.execution,
      symbol: filters.symbol || undefined,
    };
    const allRuns = await repository.listRuns({ limit: 5000 });
    [runs, summary] = await Promise.all([repository.listRuns(filter), repository.summarizeRuns(filter)]);
    metrics = calculatePaperTradingMetrics(allRuns);
  } catch {
    unavailable = true;
  }

  const newestFirst = [...runs].reverse();
  const exports = exportQuery(filters);

  return (
    <div className="tx-observatory-entry flex flex-col gap-7 pt-7 sm:gap-10 sm:pt-10">
      <section className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PAPER TRADING EVIDENCE</p>
            <h1 className="mt-3 font-display text-[48px] font-bold leading-[0.9] tracking-[-0.01em] sm:text-[82px]">Event → Decision → Execution</h1>
            <p className="mt-4 max-w-2xl text-[16px] leading-[24px] text-mutedink">Durable record of Tenax agent cycles. This is a verifiable run log, not a backtest.</p>
          </div>
          <div className="grid min-w-[220px] gap-3 rounded-[12px] border border-ink/15 bg-softwhite/60 p-4">
            <Fact label="TRACK" value="AGENTIC TRADING" />
            <Fact label="SUB-THEME" value="CROSS-ASSET EXECUTION AGENT" />
            <Fact label="DATA SOURCE" value="TENAX RUN LEDGER" />
            <Fact label="PERSISTENCE" value={repositoryLabel(repository.durabilityState)} />
          </div>
        </div>
      </section>

      <section aria-label="Run summary" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Summary label="TOTAL RUNS" value={summary.totalRuns} />
        <Summary label="EXECUTED" value={summary.executes} />
        <Summary label="ESCALATED" value={summary.escalations} />
        <Summary label="REFUSED" value={summary.refusals} />
        <Summary label="FAILED" value={summary.failedExecutions} />
      </section>

      <section className="tx-material-light-frost rounded-[16px] p-4 sm:p-6" aria-label="Quantitative evidence">
        <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">QUANTITATIVE EVIDENCE</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <MetricPanel title="RISK CONTROL" rows={[
            ["ACTIONABLE PROPOSALS", String(metrics.riskControl.actionableProposals)],
            ["EXECUTION RATE", percent(metrics.riskControl.executionRate)],
            ["ESCALATION RATE", percent(metrics.riskControl.escalationRate)],
            ["REFUSAL RATE", percent(metrics.riskControl.refusalRate)],
            ["HUMAN TAKEOVER RATE", percent(metrics.riskControl.humanTakeoverRate)],
            ["RISK VIOLATION PREVENTION", String(metrics.riskControl.riskViolationPreventionCount)],
          ]} />
          <MetricPanel title="TRADING PERFORMANCE" rows={[
            ["REALIZED SAMPLE", String(metrics.performance.realizedRunCount)],
            ["WIN RATE", percent(metrics.performance.winRate)],
            ["GROSS REALIZED PNL", money(metrics.performance.grossRealizedPnl)],
            ["NET REALIZED PNL", money(metrics.performance.netRealizedPnl)],
            ["MAX DRAWDOWN", metrics.performance.maxDrawdownStatus === "AVAILABLE" ? percent(metrics.performance.maxDrawdownPct) : "INSUFFICIENT DATA"],
            ["SHARPE", metrics.performance.sharpeStatus === "AVAILABLE" ? `${metrics.performance.sharpe} · RUN-RETURN NON-ANNUALIZED` : "INSUFFICIENT DATA"],
            ["SHARPE SAMPLE", String(metrics.performance.sharpeSampleSize)],
          ]} />
        </div>
        <details className="mt-4 rounded-[8px] border border-ink/10 p-3">
          <summary className="font-syslabel cursor-pointer text-[10px] uppercase tracking-[0.08em] text-mutedink">METHODOLOGY</summary>
          <div className="mt-3 grid gap-2 text-[12px] leading-[18px] text-mutedink">
            <p>{metrics.methodology.actionableDenominator}</p>
            <p>{metrics.methodology.realizedSample}</p>
            <p>{metrics.methodology.drawdown}</p>
            <p>{metrics.methodology.sharpe}</p>
            <p>{metrics.methodology.unknowns}</p>
          </div>
        </details>
      </section>

      <section className="tx-material-light-frost rounded-[16px] p-4 sm:p-6" aria-label="Run filters">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">FILTER RUN LOG</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Environment filter">
            {ENVIRONMENTS.map((value) => filterLink(filters, "environment", value))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FilterGroup label="AUTHORITY" values={AUTHORITIES} filters={filters} filterKey="authority" />
          <FilterGroup label="EXECUTION" values={EXECUTIONS} filters={filters} filterKey="execution" />
        </div>
      </section>

      {unavailable ? (
        <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
          <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-clay">RUN LEDGER UNAVAILABLE</p>
          <p className="mt-3 max-w-2xl text-[16px] leading-[24px] text-mutedink">The run ledger could not be loaded. No evidence is fabricated.</p>
        </section>
      ) : newestFirst.length === 0 ? (
        <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
          <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">NO PAPER-TRADING RUNS RECORDED YET</p>
          <p className="mt-3 max-w-2xl text-[16px] leading-[24px] text-mutedink">Run the NVIDIA protection flow to create the first canonical evidence record.</p>
          <Link href="/app/protect/nvidia" className="btn-living mt-5 inline-flex min-h-11 items-center justify-center rounded-[9px] bg-signal px-4 py-3 text-[12px] font-bold text-ink">LAUNCH NVIDIA PROTECTION →</Link>
        </section>
      ) : (
        <section aria-label="Paper trading runs" className="tx-material-editorial border-t-2 border-ink">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 py-4">
            <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">VERIFIABLE RUN LOGS · {newestFirst.length}</p>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/paper-trading/export.csv${exports}`} className="font-syslabel rounded-[7px] bg-ink px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-softwhite">DOWNLOAD CSV</a>
              <a href={`/api/paper-trading/export.json${exports}`} className="font-syslabel rounded-[7px] border border-ink/30 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink">DOWNLOAD JSON</a>
              <a href="/api/paper-trading/summary" className="font-syslabel rounded-[7px] border border-ink/30 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink">SUMMARY JSON</a>
            </div>
          </div>
          <div className="hidden grid-cols-[120px_minmax(110px,0.8fr)_minmax(160px,1.2fr)_minmax(150px,1fr)_minmax(120px,0.8fr)] gap-4 border-b border-ink/10 py-3 font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink md:grid">
            <span>TIME</span><span>SYMBOL / ENV</span><span>EVENT → DECISION</span><span>AUTHORITY</span><span>EXECUTION</span>
          </div>
          <ol className="flex flex-col">
            {newestFirst.map((run) => <RunRow key={run.runId} run={run} />)}
          </ol>
        </section>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><p className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">{label}</p><p className="mt-1 text-[12px] font-bold leading-[16px]">{value}</p></div>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="tx-material-editorial border-t-2 border-ink p-4"><p className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">{label}</p><p className="mt-2 font-syslabel text-[32px] font-semibold leading-none tabular-nums">{value}</p></div>;
}

function MetricPanel({ title, rows }: { title: string; rows: ReadonlyArray<readonly [string, string]> }) {
  return <div className="rounded-[10px] border border-ink/10 bg-softwhite/50 p-4"><p className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">{title}</p><dl className="mt-3 grid gap-2">{rows.map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-3 border-b border-ink/10 pb-2"><dt className="font-syslabel text-[10px] uppercase tracking-[0.06em] text-mutedink">{label}</dt><dd className="text-right text-[13px] font-bold tabular-nums">{value}</dd></div>)}</dl></div>;
}

function percent(value: number | null): string {
  return value === null ? "INSUFFICIENT DATA" : `${(value * 100).toFixed(2)}%`;
}

function money(value: number | null): string {
  return value === null ? "INSUFFICIENT DATA" : `$${value.toFixed(2)}`;
}

function FilterGroup<T extends readonly string[]>({ label, values, filters, filterKey }: { label: string; values: T; filters: Filters; filterKey: keyof Filters }) {
  return <div><p className="font-syslabel mb-2 text-[10px] uppercase tracking-[0.08em] text-mutedink">{label}</p><div className="flex flex-wrap gap-1">{values.map((value) => <span key={value}>{filterLink(filters, filterKey, value)}</span>)}</div></div>;
}

function RunRow({ run }: { run: PaperTradingRun }) {
  return (
    <li className="border-b border-ink/10 py-4 last:border-b-0">
      <Link href={`/app/paper-trading/${encodeURIComponent(run.runId)}`} className="grid gap-3 rounded-[10px] p-2 transition-colors hover:bg-ink/[0.035] md:grid-cols-[120px_minmax(110px,0.8fr)_minmax(160px,1.2fr)_minmax(150px,1fr)_minmax(120px,0.8fr)] md:gap-4">
        <div><p className="font-syslabel text-[10px] uppercase tracking-[0.06em] text-mutedink md:hidden">TIME</p><p className="text-[12px] leading-[17px] text-mutedink">{time(run.createdAt)}</p></div>
        <div><p className="font-syslabel text-[10px] uppercase tracking-[0.06em] text-mutedink md:hidden">SYMBOL / ENV</p><p className="text-[13px] font-bold">{run.symbol}</p><p className="font-syslabel mt-1 text-[10px] uppercase tracking-[0.06em] text-mutedink">{run.environment ?? "UNKNOWN"}</p></div>
        <div><p className="font-syslabel text-[10px] uppercase tracking-[0.06em] text-mutedink md:hidden">EVENT → DECISION</p><p className="text-[13px] font-bold">{run.event.eventType}</p><p className="mt-1 text-[12px] leading-[17px] text-mutedink">{run.decision.decision ?? "DECISION UNKNOWN"} · {run.decision.proposedProtectionPct === null ? "UNKNOWN SIZE" : `${run.decision.proposedProtectionPct}% / $${run.decision.proposedNotionalUsdt ?? "?"}`}</p></div>
        <div><p className="font-syslabel text-[10px] uppercase tracking-[0.06em] text-mutedink md:hidden">AUTHORITY</p><span className={`inline-flex rounded-full px-2.5 py-1 font-syslabel text-[10px] font-bold uppercase tracking-[0.06em] ${statusClass(run.status)}`}>{run.authority.outcome}</span><p className="mt-1 text-[12px] leading-[17px] text-mutedink">{run.authority.reasonCodes.length ? run.authority.reasonCodes.join(" · ") : "No exception recorded"}</p></div>
        <div><p className="font-syslabel text-[10px] uppercase tracking-[0.06em] text-mutedink md:hidden">EXECUTION</p><p className="text-[13px] font-bold">{run.execution.status === "SUBMITTED" ? "SUBMITTED · FILL NOT VERIFIED" : run.execution.status}</p><p className="mt-1 text-[12px] leading-[17px] text-mutedink">{run.execution.orderId ?? (run.execution.status === "NO_ORDER" ? "NO ORDER SENT" : "ORDER UNKNOWN")}</p></div>
      </Link>
    </li>
  );
}

