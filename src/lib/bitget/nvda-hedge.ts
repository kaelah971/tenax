// Tenax Phase 2C — NVDAUSDT Demo hedge capability discovery (pure, offline).
//
// STRICTLY READ-ONLY. This module never touches the network, credentials,
// or account state. It normalizes already-fetched response bodies and
// performs mechanical $100 sizing arithmetic.
//
// Safety contract:
// - Never guess missing fields: absent values stay null, unrecognized
//   shapes yield null, and sizing unknowns report UNKNOWN — never YES.
// - Quantity normalization always rounds DOWN (never overshoots notional).
// - No leverage is set, previewed leverage is read-only data, and nothing
//   here is a trade recommendation.

import {
  classifyDemoAuthFailure,
  extractEnvelopeSafe,
  type DemoAuthFailureKind,
} from "./demo-auth.ts";
import { parseAmount } from "./demo-assets.ts";

/** Discovery target: NVDAUSDT USDT-margined futures. */
export const NVDAUSDT_SYMBOL = "NVDAUSDT" as const;
export const HEDGE_CATEGORY = "USDT-FUTURES" as const;

/** Tenax's existing $100 proposal notional (USDT). */
export const HEDGE_TARGET_NOTIONAL_USDT = 100;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function takeFirstString(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = asString(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function takeFirstNumber(row: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const raw = asString(row[key]);
    const value = parseAmount(raw);
    if (value !== null) return value;
  }
  return null;
}

/** Find the data row for a symbol (case-insensitive), or null. */
function pickSymbolRow(data: unknown, symbol: string): Record<string, unknown> | null {
  if (!Array.isArray(data)) return null;
  const want = symbol.toUpperCase();
  for (const entry of data) {
    const row = asRecord(entry);
    if (row && (asString(row.symbol) ?? "").toUpperCase() === want) return row;
  }
  return null;
}

// ---- Public instrument ----------------------------------------------------

export interface NvdaInstrument {
  readonly symbol: string;
  readonly category: string | null;
  readonly status: string | null;
  /** "yes" (Reality stock token) / "no" / null when the provider omits it. */
  readonly isReality: boolean | null;
  readonly baseCoin: string | null;
  readonly quoteCoin: string | null;
  readonly minOrderQty: number | null;
  readonly maxOrderQty: number | null;
  readonly minOrderAmount: number | null;
  readonly pricePrecision: number | null;
  readonly quantityPrecision: number | null;
  /** Raw contract size/multiplier string when the provider returns one. */
  readonly contractMultiplier: string | null;
  readonly maxLeverage: number | null;
  readonly minLeverage: number | null;
}

/**
 * Normalize one GET /api/v3/market/instruments row for NVDAUSDT.
 * Returns null when no NVDAUSDT row is present — never invents a listing.
 */
export function normalizeNvdaInstrument(body: unknown): NvdaInstrument | null {
  const root = asRecord(body);
  if (!root) return null;
  const row = pickSymbolRow(root.data, NVDAUSDT_SYMBOL);
  if (!row) return null;
  const symbol = asString(row.symbol);
  if (symbol === null) return null;
  const isRealityRaw = asString(row.isReality)?.toLowerCase() ?? null;
  return {
    symbol,
    category: asString(row.category),
    status: asString(row.status),
    isReality: isRealityRaw === null ? null : isRealityRaw === "yes",
    baseCoin: asString(row.baseCoin),
    quoteCoin: asString(row.quoteCoin),
    minOrderQty: takeFirstNumber(row, ["minOrderQty"]),
    maxOrderQty: takeFirstNumber(row, ["maxOrderQty"]),
    minOrderAmount: takeFirstNumber(row, ["minOrderAmount"]),
    pricePrecision: takeFirstNumber(row, ["pricePrecision", "pricePlace", "priceScale"]),
    quantityPrecision: takeFirstNumber(row, [
      "quantityPrecision",
      "volumePlace",
      "qtyPrecision",
      "sizePrecision",
    ]),
    contractMultiplier: takeFirstString(row, [
      "contractMultiplier",
      "contractSize",
      "multiplier",
      "ctVal",
      "contractValue",
    ]),
    maxLeverage: takeFirstNumber(row, ["maxLeverage", "leverageMax", "maxLever"]),
    minLeverage: takeFirstNumber(row, ["minLeverage", "leverageMin", "minLever"]),
  };
}

// ---- Public ticker --------------------------------------------------------

export interface NvdaTicker {
  readonly symbol: string;
  readonly lastPrice: string | null;
  readonly markPrice: string | null;
  readonly indexPrice: string | null;
  readonly bidPrice: string | null;
  readonly askPrice: string | null;
  readonly fundingRate: string | null;
  readonly updatedAt: string | null;
}

/**
 * Normalize one GET /api/v3/market/tickers row for NVDAUSDT.
 * Futures-only fields (mark/index/funding) stay null when not returned.
 */
export function normalizeNvdaTicker(body: unknown): NvdaTicker | null {
  const root = asRecord(body);
  if (!root) return null;
  const row = pickSymbolRow(root.data, NVDAUSDT_SYMBOL);
  if (!row) return null;
  const symbol = asString(row.symbol);
  if (symbol === null) return null;
  return {
    symbol,
    lastPrice: takeFirstString(row, ["lastPrice", "lastPr", "last", "closePrice"]),
    markPrice: takeFirstString(row, ["markPrice"]),
    indexPrice: takeFirstString(row, ["indexPrice"]),
    bidPrice: takeFirstString(row, ["bid1Price", "bidPr", "bestBid", "bid"]),
    askPrice: takeFirstString(row, ["ask1Price", "askPr", "bestAsk", "ask"]),
    fundingRate: takeFirstString(row, ["fundingRate", "fundingFeeRate", "fundRate"]),
    updatedAt: takeFirstString(row, ["ts", "timestamp", "updatedTime"]),
  };
}

export type ReferencePriceSource = "markPrice" | "lastPrice" | "indexPrice";

/**
 * Select the reference price for sizing: markPrice first (preferred for
 * futures), then lastPrice, then indexPrice. Null when none is usable.
 */
export function selectReferencePrice(ticker: NvdaTicker): {
  readonly price: number | null;
  readonly source: ReferencePriceSource | null;
} {
  const candidates: ReadonlyArray<readonly [ReferencePriceSource, string | null]> = [
    ["markPrice", ticker.markPrice],
    ["lastPrice", ticker.lastPrice],
    ["indexPrice", ticker.indexPrice],
  ];
  for (const [source, raw] of candidates) {
    const price = parseAmount(raw);
    if (price !== null && price > 0) return { price, source };
  }
  return { price: null, source: null };
}

// ---- Authenticated position -----------------------------------------------

export interface NvdaPosition {
  /** True only when an NVDAUSDT row with non-zero size exists. */
  readonly hasPosition: boolean;
  readonly side: string | null;
  readonly size: string | null;
  readonly leverage: string | null;
  readonly marginMode: string | null;
  readonly markPrice: string | null;
  readonly avgPrice: string | null;
}

export const EMPTY_NVIDIA_POSITION: NvdaPosition = {
  hasPosition: false,
  side: null,
  size: null,
  leverage: null,
  marginMode: null,
  markPrice: null,
  avgPrice: null,
};

function positionRows(body: unknown): Array<Record<string, unknown>> | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = root.data;
  if (Array.isArray(data)) return data.map(asRecord).filter((r): r is Record<string, unknown> => r !== null);
  const dataRecord = asRecord(data);
  if (!dataRecord) return null;
  for (const key of ["list", "positions", "rows"] as const) {
    if (Array.isArray(dataRecord[key])) {
      return (dataRecord[key] as unknown[])
        .map(asRecord)
        .filter((r): r is Record<string, unknown> => r !== null);
    }
    // Provider-confirmed empty container (observed live after a full
    // close: data.list === null with code 00000) is a valid empty row
    // list — never an unrecognized shape. Absent keys stay unrecognized.
    if (key in dataRecord && (dataRecord[key] === null || dataRecord[key] === undefined)) {
      return [];
    }
  }
  return null;
}

/**
 * Normalize GET /api/v3/position/current-position for NVDAUSDT.
 * An empty list is a valid "no position" result — never an error.
 * Returns null only for unrecognized shapes.
 */
export function normalizeNvdaPosition(body: unknown): NvdaPosition | null {
  const rows = positionRows(body);
  if (!rows) return null;
  const matches = rows.filter(
    (row) => (asString(row.symbol) ?? "").toUpperCase() === NVDAUSDT_SYMBOL,
  );
  if (matches.length === 0) return { ...EMPTY_NVIDIA_POSITION };
  const live = matches.find((row) => {
    const size = takeFirstString(row, ["total", "available", "size"]);
    const parsed = parseAmount(size);
    return parsed !== null && parsed !== 0;
  });
  if (!live) return { ...EMPTY_NVIDIA_POSITION };
  return {
    hasPosition: true,
    side: takeFirstString(live, ["posSide", "holdSide"]),
    size: takeFirstString(live, ["total", "available", "size"]),
    leverage: takeFirstString(live, ["leverage"]),
    marginMode: takeFirstString(live, ["marginMode"]),
    markPrice: takeFirstString(live, ["markPrice"]),
    avgPrice: takeFirstString(live, ["avgPrice", "openPriceAvg"]),
  };
}

export interface PositionProbeEvaluation {
  readonly probe: "PASS" | "FAIL";
  readonly failureKind: DemoAuthFailureKind | "NONE";
  /** NONE-state when empty or when a successful shape carries no rows. */
  readonly position: NvdaPosition;
}

const POSITION_SUCCESS_CODE = "00000";

/**
 * Interpret GET /api/v3/position/current-position.
 * HTTP 200 + code 00000 is PASS regardless of whether any position rows
 * exist — an empty/no-position response is a successful empty state
 * (currentPosition NONE), never UNKNOWN/failure. FAIL only on HTTP
 * failure, non-00000 codes, or explicit permission/auth/network/server
 * failures.
 */
export function evaluatePositionProbe(input: {
  readonly httpStatus: number;
  readonly body: unknown;
  readonly transportError: string | null;
}): PositionProbeEvaluation {
  if (input.transportError !== null) {
    return {
      probe: "FAIL",
      failureKind: classifyDemoAuthFailure({
        httpStatus: 0,
        transportError: input.transportError,
      }),
      position: { ...EMPTY_NVIDIA_POSITION },
    };
  }
  const envelope = extractEnvelopeSafe(input.body);
  if (input.httpStatus === 200 && envelope.code === POSITION_SUCCESS_CODE) {
    return {
      probe: "PASS",
      failureKind: "NONE",
      position: normalizeNvdaPosition(input.body) ?? { ...EMPTY_NVIDIA_POSITION },
    };
  }
  return {
    probe: "FAIL",
    failureKind: classifyDemoAuthFailure({
      httpStatus: input.httpStatus,
      bitgetCode: envelope.code,
      message: envelope.msg,
    }),
    position: { ...EMPTY_NVIDIA_POSITION },
  };
}

// ---- Authenticated account settings ---------------------------------------

export interface NvdaAccountSettings {
  readonly accountMode: string | null;
  readonly accountLevel: string | null;
  readonly holdMode: string | null;
  /** Top-level margin mode when the provider returns one (often absent). */
  readonly marginMode: string | null;
  /** NVDAUSDT leverage from symbolConfigList when present. */
  readonly nvdaLeverage: string | null;
  /** NVDAUSDT margin mode from symbolConfigList, raw value as returned. */
  readonly nvdaMarginMode: string | null;
  readonly nvdaSymbolConfigFound: boolean;
  /** True when the provider returned a symbolConfigList array (even empty). */
  readonly symbolConfigListPresent: boolean;
  /** Number of symbol configs in the list (0 when absent). */
  readonly symbolConfigCount: number;
}

/**
 * Normalize GET /api/v3/account/settings, keeping only safe relevant
 * fields. UID and unrelated metadata are never extracted. Returns null
 * for unrecognized shapes.
 */
export function normalizeAccountSettings(body: unknown): NvdaAccountSettings | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = asRecord(root.data);
  if (!data) return null;
  let nvdaLeverage: string | null = null;
  let nvdaMarginMode: string | null = null;
  let nvdaSymbolConfigFound = false;
  let symbolConfigListPresent = false;
  let symbolConfigCount = 0;
  const configList = data.symbolConfigList;
  if (Array.isArray(configList)) {
    symbolConfigListPresent = true;
    symbolConfigCount = configList.length;
    const entries = configList
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => r !== null)
      .filter((row) => (asString(row.symbol) ?? "").toUpperCase() === NVDAUSDT_SYMBOL);
    const entry =
      entries.find((row) => (asString(row.category) ?? "").toUpperCase() === HEDGE_CATEGORY) ??
      entries[0] ??
      null;
    if (entry) {
      nvdaSymbolConfigFound = true;
      nvdaLeverage = takeFirstString(entry, ["leverage", "longLeverage"]);
      nvdaMarginMode = takeFirstString(entry, ["marginMode"]);
    }
  }
  return {
    accountMode: takeFirstString(data, ["accountMode", "accountType"]),
    accountLevel: takeFirstString(data, ["accountLevel", "level"]),
    holdMode: takeFirstString(data, ["holdMode", "posMode"]),
    marginMode: takeFirstString(data, ["marginMode"]),
    nvdaLeverage,
    nvdaMarginMode,
    nvdaSymbolConfigFound,
    symbolConfigListPresent,
    symbolConfigCount,
  };
}

// ---- Read-only 1x preview --------------------------------------------------

export interface LeveragePreview {
  readonly estMaxOpen: string | null;
  readonly requiredMargin: string | null;
  readonly marginChange: string | null;
}

/**
 * Normalize GET /api/v3/account/pre-set-leverage data (preview only —
 * the endpoint never applies a change). Null for unrecognized shapes.
 */
export function normalizeLeveragePreview(body: unknown): LeveragePreview | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = asRecord(root.data);
  if (!data) return null;
  return {
    estMaxOpen: takeFirstString(data, ["estMaxOpen"]),
    requiredMargin: takeFirstString(data, ["requiredMargin"]),
    marginChange: takeFirstString(data, ["marginChange"]),
  };
}

// ---- $100 hedge sizing (mechanical, not a recommendation) ------------------

export interface HedgeSizingInput {
  readonly targetNotional: number;
  readonly referencePrice: number | null;
  readonly priceSource: ReferencePriceSource | null;
  readonly quantityPrecision: number | null;
  readonly minOrderQty: number | null;
  readonly minOrderAmount: number | null;
}

export interface HedgeSizingResult {
  readonly targetNotional: number;
  readonly referencePrice: number | null;
  readonly priceSource: ReferencePriceSource | null;
  readonly rawQty: number | null;
  readonly normalizedQty: number | null;
  readonly resultingNotional: number | null;
  readonly meetsMinQty: boolean | null;
  readonly meetsMinNotional: boolean | null;
  readonly executableByInstrumentRules: "YES" | "NO" | "UNKNOWN";
}

/**
 * Truncate a non-negative quantity DOWN to `precision` decimals using
 * exact decimal-string arithmetic (no float overshoot). Returns NaN for
 * invalid input — callers treat that as unknown, never as executable.
 */
export function floorToPrecision(qty: number, precision: number): number {
  if (!Number.isFinite(qty) || qty < 0) return NaN;
  if (!Number.isInteger(precision) || precision < 0) return NaN;
  let text = qty.toString();
  if (text.includes("e") || text.includes("E")) text = qty.toFixed(20);
  const [intPart = "0", fracPart = ""] = text.split(".");
  if (precision === 0) return Number(intPart);
  const frac = (fracPart + "0".repeat(precision)).slice(0, precision);
  return Number(`${intPart}.${frac}`);
}

/**
 * Mechanical sizing for the $100 proposal: rawQty = notional / price,
 * then floor to instrument precision and check minimum-order rules.
 * Anything unverifiable yields UNKNOWN — never a forced YES.
 */
export function computeHedgeSizing(input: HedgeSizingInput): HedgeSizingResult {
  const base = {
    targetNotional: input.targetNotional,
    referencePrice: input.referencePrice,
    priceSource: input.priceSource,
    rawQty: null as number | null,
    normalizedQty: null as number | null,
    resultingNotional: null as number | null,
    meetsMinQty: null as boolean | null,
    meetsMinNotional: null as boolean | null,
    executableByInstrumentRules: "UNKNOWN" as "YES" | "NO" | "UNKNOWN",
  };
  const price = input.referencePrice;
  if (price === null || !Number.isFinite(price) || price <= 0) return base;
  if (!Number.isFinite(input.targetNotional) || input.targetNotional <= 0) return base;
  const rawQty = input.targetNotional / price;
  const precision = input.quantityPrecision;
  if (precision === null || !Number.isInteger(precision) || precision < 0) {
    return { ...base, rawQty };
  }
  const normalizedQty = floorToPrecision(rawQty, precision);
  if (!Number.isFinite(normalizedQty)) return { ...base, rawQty };
  const resultingNotional = normalizedQty * price;
  const meetsMinQty =
    input.minOrderQty === null ? null : normalizedQty >= input.minOrderQty;
  const meetsMinNotional =
    input.minOrderAmount === null ? null : resultingNotional >= input.minOrderAmount;
  let executable: "YES" | "NO" | "UNKNOWN" = "UNKNOWN";
  if (normalizedQty <= 0 || meetsMinQty === false || meetsMinNotional === false) {
    executable = "NO";
  } else {
    executable = "YES";
  }
  return {
    ...base,
    rawQty,
    normalizedQty,
    resultingNotional,
    meetsMinQty,
    meetsMinNotional,
    executableByInstrumentRules: executable,
  };
}

// ---- Overall discovery verdict ----------------------------------------------

export type DiscoveryProbeOutcome = "PASS" | "FAIL";
export type SettingsProbeOutcome = "PASS" | "PERMISSION_UNAVAILABLE" | "FAIL";
export type DiscoveryOverall = "PASS" | "PARTIAL" | "FAIL";

/**
 * Overall verdict. Core discovery requires the instrument, ticker,
 * current-position, and futures trade-read probes to PASS plus evaluable
 * sizing. FAIL only on a genuine required-probe failure; when the core
 * holds but leverage/margin metadata stays unresolved (including a
 * legitimately NOT_RUN preview), the verdict is PARTIAL. A missing
 * management permission is PARTIAL — never fabricated success.
 */
export function evaluateDiscoveryOverall(input: {
  readonly instrument: DiscoveryProbeOutcome;
  readonly ticker: DiscoveryProbeOutcome;
  readonly position: DiscoveryProbeOutcome;
  readonly futuresTradeRead: DiscoveryProbeOutcome;
  readonly sizingEvaluable: boolean;
  readonly settings: SettingsProbeOutcome;
}): DiscoveryOverall {
  if (
    input.instrument === "FAIL" ||
    input.ticker === "FAIL" ||
    input.position === "FAIL" ||
    input.futuresTradeRead === "FAIL" ||
    !input.sizingEvaluable
  ) {
    return "FAIL";
  }
  return input.settings === "PASS" ? "PASS" : "PARTIAL";
}
