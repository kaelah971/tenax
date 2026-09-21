// Tenax Phase 4A — pure view helpers for the unified exposure narrative.
//
// These helpers shape canonical domain values for visualization only.
// They never recompute business truth: coverage divides the graph's own
// aggregates, mandate rows render evaluated checks, and the market panel
// labels provenance it is given. Unknown stays unknown throughout.

import type { ApprovalState } from "./domain";

/**
 * Protection coverage in percent (protected / gross * 100), rounded to two
 * decimals. Null when either aggregate is unknown — an unknown hedge maps
 * to unknown coverage, never zero. Available representations contribute
 * nothing: they never enter the graph aggregates this divides.
 */
export function coveragePercent(
  protectedNotionalUsd: number | null,
  grossExposureUsd: number | null,
): number | null {
  if (protectedNotionalUsd === null || grossExposureUsd === null) return null;
  if (!Number.isFinite(protectedNotionalUsd) || !Number.isFinite(grossExposureUsd)) return null;
  if (grossExposureUsd <= 0) return null;
  return Math.round((protectedNotionalUsd / grossExposureUsd) * 100 * 100) / 100;
}

// ---- Mandate comparison rows ----------------------------------------------

export interface MandateVisualInput {
  readonly proposalPct: number | null;
  readonly tradeValueUsdt: number | null;
  readonly leverageUsed: number | null;
  readonly approval: ApprovalState | null;
  /** Canonical evaluated checks (receipt.mandateChecks); pass renders from these. */
  readonly checks: readonly { readonly id: string; readonly pass: boolean }[] | null;
  readonly maxPct: number;
  readonly maxTradeValueUsdt: number;
  readonly maxLeverage: number;
}

export interface MandateVisualRow {
  readonly id: "protection" | "trade" | "leverage" | "approval";
  readonly label: string;
  readonly evaluated: string;
  readonly bound: string;
  /** Bare bound value for compact "evaluated / bound" tracks. */
  readonly boundValue: string;
  /** Canonical result; null when nothing was evaluated yet. */
  readonly pass: boolean | null;
  /** 0..1 fill for the comparison bar; null when not quantifiable. */
  readonly fraction: number | null;
}

function checkPass(
  checks: readonly { readonly id: string; readonly pass: boolean }[] | null,
  id: string,
): boolean | null {
  return checks?.find((c) => c.id === id)?.pass ?? null;
}

/**
 * Four mandate comparison rows. Bounds always come from the canonical
 * mandate; evaluated values and pass states come from the canonical
 * evaluated receipt when present, otherwise render as unevaluated ("—",
 * pass null) — never invented.
 */
export function mandateVisualRows(input: MandateVisualInput): readonly MandateVisualRow[] {
  const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
  return [
    {
      id: "protection",
      label: "PROTECTION",
      evaluated: input.proposalPct === null ? "—" : `${input.proposalPct}%`,
      bound: `MAX ${input.maxPct}%`,
      boundValue: `${input.maxPct}%`,
      pass: checkPass(input.checks, "max_protection_pct"),
      fraction: input.proposalPct === null ? null : clamp01(input.proposalPct / input.maxPct),
    },
    {
      id: "trade",
      label: "TRADE VALUE",
      evaluated: input.tradeValueUsdt === null ? "—" : `$${input.tradeValueUsdt}`,
      bound: `MAX $${input.maxTradeValueUsdt}`,
      boundValue: `$${input.maxTradeValueUsdt}`,
      pass: checkPass(input.checks, "max_trade_value"),
      fraction:
        input.tradeValueUsdt === null ? null : clamp01(input.tradeValueUsdt / input.maxTradeValueUsdt),
    },
    {
      id: "leverage",
      label: "LEVERAGE",
      evaluated: input.leverageUsed === null ? "—" : `${input.leverageUsed}X`,
      bound: `${input.maxLeverage}X MAX`,
      boundValue: `${input.maxLeverage}X`,
      pass: checkPass(input.checks, "max_leverage"),
      fraction: input.leverageUsed === null ? null : clamp01(input.leverageUsed / input.maxLeverage),
    },
    {
      id: "approval",
      label: "APPROVAL",
      evaluated:
        input.approval === null
          ? "—"
          : input.approval === "APPROVED"
            ? "HUMAN APPROVED"
            : input.approval,
      bound: "HUMAN REQUIRED",
      boundValue: "HUMAN",
      pass: checkPass(input.checks, "approval_required"),
      fraction: null,
    },
  ];
}

// ---- Market panel model ----------------------------------------------------

export type SeriesProvenance = "REAL" | "SAMPLE" | "UNAVAILABLE";

export interface ChartPoint {
  readonly t: number;
  readonly close: number;
}

export interface ActionMark {
  readonly qty: string;
  readonly avgPrice: number;
  readonly submittedAt: string | null;
}

export interface MarketPanelModel {
  readonly state: "READY" | "NO_MARKET";
  /**
   * The ONLY market-data claim the chart may render. REAL is emitted
   * exclusively for provider-fetched series; SAMPLE is quarantined with
   * an explicit not-real disclaimer; missing data is UNAVAILABLE.
   */
  readonly provenanceLabel: string;
  readonly points: readonly ChartPoint[];
  readonly action: ActionMark | null;
}

export function marketPanelModel(
  series: { readonly provenance: SeriesProvenance; readonly points: readonly ChartPoint[] } | null,
  action: ActionMark | null,
): MarketPanelModel {
  if (!series || series.points.length === 0) {
    return { state: "NO_MARKET", provenanceLabel: "MARKET DATA UNAVAILABLE", points: [], action: null };
  }
  if (series.provenance === "SAMPLE") {
    return {
      state: "READY",
      provenanceLabel: "SAMPLE SERIES — NOT REAL MARKET DATA",
      points: series.points,
      action: null,
    };
  }
  return {
    state: "READY",
    provenanceLabel: "BITGET PUBLIC CANDLES · NVDAUSDT · DAILY",
    points: series.points,
    action,
  };
}

/**
 * Locate the candle interval containing an execution timestamp: the index
 * of the candle with the greatest start time <= submittedAt, valid only
 * when submittedAt falls before the end of the last candle's interval.
 * Returns null for missing/unparseable timestamps, empty series, or an
 * execution outside the visible window — callers render an
 * outside-window note instead of an arbitrary marker.
 */
export function locateExecutionCandle(
  candles: readonly { readonly t: number }[],
  submittedAt: string | null,
  intervalMs: number,
): number | null {
  if (!submittedAt || candles.length === 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return null;
  }
  const at = Date.parse(submittedAt);
  if (!Number.isFinite(at)) return null;
  const last = candles[candles.length - 1];
  if (!last || at < (candles[0]?.t ?? Number.POSITIVE_INFINITY)) return null;
  if (at >= last.t + intervalMs) return null;
  let index = 0;
  for (let i = 0; i < candles.length; i += 1) {
    const t = candles[i]?.t;
    if (t === undefined || t > at) break;
    index = i;
  }
  return index;
}
