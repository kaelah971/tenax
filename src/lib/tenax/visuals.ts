// Tenax Phase 4A — pure view helpers for the unified exposure narrative.
// Phase 4B-B2.2 — protection-leg presence helper for the unlinked case.
// Phase 4B-B2.3 — cockpit helpers: instrument roles, live-surface projection,
// evidence summary. Display only: they never authorize, never execute, and
// never invent market truth. Unknown stays unknown throughout.
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

// ---- Protection-leg presence ------------------------------------------------

/** How the NVDAUSDT protection leg should read: receipt-linked, live-but-
 * unlinked, or absent. A live Demo short with no stored receipt is real
 * but unmapped — never "NOT EXECUTED", never linked to a receipt. */
export type ProtectionLegDisplay = "LINKED" | "UNLINKED" | "ABSENT";

export function protectionLegDisplay(
  hasReceiptLeg: boolean,
  liveShortPresent: boolean,
): ProtectionLegDisplay {
  if (hasReceiptLeg) return "LINKED";
  if (liveShortPresent) return "UNLINKED";
  return "ABSENT";
}

// ---- Instrument roles ------------------------------------------------------
//
// NVDAUSDT (USDT-FUTURES, Bitget Demo) is the protection instrument — the
// only thing Tenax can trade. RNVDA (Bitget Reality) is exposure/reference
// evidence — simulated, never owned live. These constants keep every
// cockpit labeling the same; they carry no market data.

export const PROTECTION_INSTRUMENT = {
  symbol: "NVDAUSDT",
  category: "USDT-FUTURES",
  venue: "BITGET",
  role: "PROTECTION",
} as const;

export const EXPOSURE_REFERENCE = {
  symbol: "RNVDA",
  venue: "BITGET REALITY",
  role: "EXPOSURE",
} as const;

// ---- Market viewports ---------------------------------------------------------
//
// Centered-terminal philosophy shared by both live surfaces: the module is
// width-constrained and centered, the chart narrower still and centered
// within it, tall enough for candles to breathe. Stats live inside the
// module so header + position + candles read as ONE terminal — never
// page-wide stats beside a narrow chart.
//
// The two surfaces are related but intentionally different sizes: the
// exposure page observes (slightly roomier), the analysis cockpit decides
// (tighter focus). Same mechanism, two tuned presets — never duplicated
// inline values.

export interface MarketViewport {
  /** Outer module cap, px. */
  readonly moduleMaxWidthPx: number;
  /** Centered chart column cap, px. */
  readonly maxWidthPx: number;
  /** CandleChart viewBox height for this viewport. */
  readonly chartHeightPx: number;
}

/** Analysis cockpit: tight focus. Renders 920 × ~487px at max width. */
export const FOCUS_VIEWPORT: MarketViewport = {
  moduleMaxWidthPx: 1024,
  maxWidthPx: 920,
  chartHeightPx: 360,
};

/** Exposure surface: same language, slightly more room. Renders 950 × ~475px. */
export const EXPOSURE_VIEWPORT: MarketViewport = {
  moduleMaxWidthPx: 1040,
  maxWidthPx: 950,
  chartHeightPx: 340,
};

// ---- Live-surface projection ------------------------------------------------
//
// Pre-cycle projection for the decision cockpit, derived from the same
// canonical read-only state the agent cycle will read: the live Demo
// position view plus the proposal. Display only — the authoritative
// cumulative check runs inside runProtectionAgentCycle at cycle time.
// Unknown stays unknown: an unreadable position never renders as zero.

export interface SurfacePositionInput {
  readonly state: "POSITION" | "NO_POSITION" | "UNAVAILABLE";
  readonly size: string | null;
  readonly markPrice: string | null;
}

export interface SurfaceProjection {
  readonly existingUsd: number | null;
  readonly projectedUsd: number | null;
  readonly projectedPct: number | null;
  readonly positionState: "NONE" | "POSITION" | "UNKNOWN";
  /** Why the projection is unknown (null when known). */
  readonly unknownReason: "unreadable" | "unvalued" | null;
  /** Null when the projection itself is unknown. Boundary (<=) is not over. */
  readonly overLimit: boolean | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parsePositive(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function surfaceProjection(
  position: SurfacePositionInput,
  proposedUsd: number,
  grossUsd: number,
  maxPct: number,
): SurfaceProjection {
  const unknown = (
    positionState: SurfaceProjection["positionState"],
    unknownReason: SurfaceProjection["unknownReason"],
  ): SurfaceProjection => ({
    existingUsd: null,
    projectedUsd: null,
    projectedPct: null,
    positionState,
    unknownReason,
    overLimit: null,
  });
  if (
    !Number.isFinite(proposedUsd) ||
    proposedUsd < 0 ||
    !Number.isFinite(grossUsd) ||
    grossUsd <= 0 ||
    !Number.isFinite(maxPct) ||
    maxPct < 0
  ) {
    return unknown("UNKNOWN", null);
  }
  if (position.state === "UNAVAILABLE") return unknown("UNKNOWN", "unreadable");
  if (position.state === "NO_POSITION") {
    const projectedUsd = round2(proposedUsd);
    const capUsd = round2((grossUsd * maxPct) / 100);
    return {
      existingUsd: 0,
      projectedUsd,
      projectedPct: round2((projectedUsd / grossUsd) * 100),
      positionState: "NONE",
      unknownReason: null,
      overLimit: projectedUsd > capUsd,
    };
  }
  const size = parsePositive(position.size);
  const mark = parsePositive(position.markPrice);
  if (size === null || mark === null) return unknown("UNKNOWN", "unvalued");
  const existingUsd = round2(size * mark);
  const projectedUsd = round2(existingUsd + proposedUsd);
  const capUsd = round2((grossUsd * maxPct) / 100);
  return {
    existingUsd,
    projectedUsd,
    projectedPct: round2((projectedUsd / grossUsd) * 100),
    positionState: "POSITION",
    unknownReason: null,
    overLimit: projectedUsd > capUsd,
  };
}

// ---- Final action state -------------------------------------------------------
//
// ONE user-facing authority state for the decision cockpit, derived from
// every known deterministic gate with safety-first precedence. The UI must
// never present AUTHORIZED as final when a later gate already proves the
// cycle would refuse. Display derivation only — server execution gates are
// unchanged and authoritative.

export type FinalActionState =
  | "AUTHORIZED"
  | "REFUSED"
  | "ESCALATE"
  | "WAIT"
  | "NO_ACTION"
  | "NO_MANDATE"
  | "UNKNOWN";

export type StandingDecision = "AUTHORIZED" | "ESCALATE" | "REFUSED";

export interface FinalActionInput {
  /** Model chose to wait (no recommendation yet). */
  readonly wait: boolean;
  /** Proposal carries a positive protection action. */
  readonly actionable: boolean;
  /** Deterministic mandate verdict passed. */
  readonly policyPass: boolean;
  /** Fresh standing evaluation (null = no active mandate). */
  readonly standingDecision: StandingDecision | null;
  /** Live cumulative projection vs mandate max (null = unknown). */
  readonly cumulativeOverLimit: boolean | null;
}

/**
 * Derive the single final state. Precedence: WAIT → NO_ACTION →
 * mandate REFUSE → NO_MANDATE → standing REFUSE → ESCALATE (manual path
 * preserved; cumulative governs autonomous execution only) → cumulative
 * over-limit REFUSE → unknown UNKNOWN (fail closed, never AUTHORIZED).
 */
export function finalActionState(input: FinalActionInput): FinalActionState {
  if (input.wait) return "WAIT";
  if (!input.actionable) return "NO_ACTION";
  if (!input.policyPass) return "REFUSED";
  if (input.standingDecision === null) return "NO_MANDATE";
  if (input.standingDecision === "REFUSED") return "REFUSED";
  if (input.standingDecision === "ESCALATE") return "ESCALATE";
  if (input.cumulativeOverLimit === true) return "REFUSED";
  if (input.cumulativeOverLimit === null) return "UNKNOWN";
  return "AUTHORIZED";
}

// ---- Evidence summary -------------------------------------------------------
//
// Compressed meaning-first evidence rows for the cockpit. Technical
// endpoint detail stays behind a disclosure; these four rows answer "what
// did Tenax look at". Earnings is always UNVERIFIED — never fabricated.

export interface EvidenceSummaryInput {
  readonly realityAvailable: boolean;
  readonly futuresAvailable: boolean;
  /** Null when xStocks discovery did not run; false when it proved nothing. */
  readonly nvdaxAvailable: boolean | null;
}

export interface EvidenceRow {
  readonly label: string;
  readonly status: string;
}

export function evidenceSummary(input: EvidenceSummaryInput): readonly EvidenceRow[] {
  return [
    {
      label: "Bitget Reality",
      status: input.realityAvailable ? "LIVE" : "UNAVAILABLE",
    },
    {
      label: "Bitget Futures",
      status: input.futuresAvailable ? "LIVE" : "UNAVAILABLE",
    },
    {
      label: "xStocks NVDAx",
      status: input.nvdaxAvailable === true ? "AVAILABLE · NOT OWNED" : "UNVERIFIED",
    },
    { label: "Earnings date", status: "UNVERIFIED" },
  ];
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
