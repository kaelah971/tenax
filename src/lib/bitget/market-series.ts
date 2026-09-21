// Tenax Phase 4A — NVDAUSDT daily candle adapter (public, read-only).
// Phase 4A.2 — OHLC candlesticks across intervals + futures ticker snapshot.
//
// Safety contract (do not weaken without owner approval):
// - Public GET only, no key, no signature, no auth headers. Exactly two
//   documented endpoints: GET /api/v3/market/candles and
//   GET /api/v3/market/tickers (Bitget UTA public market data; Reality
//   stock symbols supported, market type, 1m/5m/15m/1H/4H/1D intervals
//   per official docs).
// - Single attempt each, per-request timeout, no retries. Typed, validated
//   responses: only finite provider values leave this module.
// - Series that normalize successfully are REAL provider data. Anything
//   else is null — synthetic series are never manufactured here (the
//   SAMPLE provenance exists only so dev previews cannot pass as real).

import {
  BITGET_BASE_URL,
  createDefaultPublicClient,
  type PublicHttpClient,
} from "./reality.ts";

export const NVDA_FUTURES_SYMBOL = "NVDAUSDT";
export const NVDA_FUTURES_CATEGORY = "USDT-FUTURES";
export const MARKET_CANDLES_PATH = "/api/v3/market/candles";
export const MARKET_TICKERS_PATH = "/api/v3/market/tickers";
export const MARKET_SERIES_INTERVAL = "1D";
export const MARKET_SERIES_LIMIT = 30;

/** Chart timeframes offered by the Tenax surface. 5m is the default view. */
export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1H", "4H"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];
export const DEFAULT_CANDLE_INTERVAL: CandleInterval = "5m";

/** Candle counts per interval (~60-120 bars of readable recent history). */
export const CANDLE_INTERVAL_LIMITS: Record<CandleInterval, number> = {
  "1m": 120,
  "5m": 96,
  "15m": 96,
  "1H": 120,
  "4H": 120,
};

/** Interval durations in milliseconds (for execution-window mapping). */
export const CANDLE_INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1H": 60 * 60_000,
  "4H": 4 * 60 * 60_000,
};

/** Validate a raw interval selection; anything else falls back to 5m. */
export function resolveCandleInterval(raw: string | null | undefined): CandleInterval {
  if (raw && (CANDLE_INTERVALS as readonly string[]).includes(raw)) {
    return raw as CandleInterval;
  }
  return DEFAULT_CANDLE_INTERVAL;
}

/** Exact allowlist — these two public paths, nothing else. */
export const MARKET_SERIES_ALLOWLIST: readonly string[] = [
  MARKET_CANDLES_PATH,
  MARKET_TICKERS_PATH,
];


/** Enforce the read-only boundary. Throws on anything but this GET path. */
export function assertMarketSeriesAllowed(method: string, requestPath: string): void {
  const path = requestPath.split("?")[0] ?? requestPath;
  if (method.toUpperCase() !== "GET" || !MARKET_SERIES_ALLOWLIST.includes(path)) {
    throw new Error(`refused: market series ${method} ${requestPath} is not allowlisted`);
  }
}

export interface CandlePoint {
  readonly t: number;
  readonly close: number;
}

/** Full OHLC candle. Volume is normalized when present, never required. */
export interface OhlcCandle {
  readonly t: number;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly vol: number | null;
}

export interface RealMarketSeries {
  readonly provenance: "REAL";
  readonly symbol: typeof NVDA_FUTURES_SYMBOL;
  readonly category: typeof NVDA_FUTURES_CATEGORY;
  readonly interval: typeof MARKET_SERIES_INTERVAL;
  readonly points: readonly CandlePoint[];
  readonly fetchedAt: string;
}

export interface RealCandleSeries {
  readonly provenance: "REAL";
  readonly symbol: typeof NVDA_FUTURES_SYMBOL;
  readonly category: typeof NVDA_FUTURES_CATEGORY;
  readonly interval: CandleInterval;
  readonly candles: readonly OhlcCandle[];
  readonly fetchedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asPositiveFinite(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Normalize a provider candle envelope. Accepts the documented UTA shape
 * ({code "00000", data: [[ts, open, high, low, close, ...], ...]}).
 * Returns validated (timestamp, close) pairs or null — never partial
 * guesses, never synthetic fills. An empty but valid envelope yields an
 * empty points array (honest gap, handled downstream as NO_MARKET).
 */
export function normalizeCandleResponse(body: unknown): readonly CandlePoint[] | null {
  const root = asRecord(body);
  if (!root || root.code !== "00000" || !Array.isArray(root.data)) return null;
  const points: CandlePoint[] = [];
  for (const entry of root.data) {
    if (!Array.isArray(entry) || entry.length < 5) return null;
    const t = asPositiveFinite(entry[0]);
    const close = asPositiveFinite(entry[4]);
    if (t === null || close === null) return null;
    points.push({ t, close });
  }
  points.sort((a, b) => a.t - b.t);
  return points;
}

/**
 * Normalize a provider candle envelope to full OHLC rows. Accepts the
 * documented UTA shape ([ts, open, high, low, close, baseVol, ...]).
 * Every row must validate exactly (positive finite t/o/h/l/c); volume is
 * kept when finite, else null. A single bad row fails the whole envelope
 * — never partial guesses. Empty valid data yields [] (honest gap).
 */
export function normalizeOhlcResponse(body: unknown): readonly OhlcCandle[] | null {
  const root = asRecord(body);
  if (!root || root.code !== "00000" || !Array.isArray(root.data)) return null;
  const candles: OhlcCandle[] = [];
  for (const entry of root.data) {
    if (!Array.isArray(entry) || entry.length < 6) return null;
    const t = asPositiveFinite(entry[0]);
    const o = asPositiveFinite(entry[1]);
    const h = asPositiveFinite(entry[2]);
    const l = asPositiveFinite(entry[3]);
    const c = asPositiveFinite(entry[4]);
    if (t === null || o === null || h === null || l === null || c === null) return null;
    // Structural sanity is limited to h >= l; open/close may print
    // outside [l, h] on thin provider intervals, so only h < l refuses.
    if (h < l) return null;
    const volRaw = entry[5];
    const vol = volRaw === undefined || volRaw === null ? null : asFiniteNumber(volRaw);
    candles.push({ t, o, h, l, c, vol });
  }
  candles.sort((a, b) => a.t - b.t);
  return candles;
}

/**
 * Fetch the NVDAUSDT daily market series (read-only). Returns null on any
 * transport, HTTP, provider, or shape failure — the page renders an
 * honest UNAVAILABLE panel instead.
 */
export async function fetchNvdaDailySeries(
  client: PublicHttpClient = createDefaultPublicClient(8000),
  limit: number = MARKET_SERIES_LIMIT,
): Promise<RealMarketSeries | null> {
  const query =
    `category=${NVDA_FUTURES_CATEGORY}&symbol=${NVDA_FUTURES_SYMBOL}` +
    `&interval=${MARKET_SERIES_INTERVAL}&type=MARKET&limit=${limit}`;
  assertMarketSeriesAllowed("GET", MARKET_CANDLES_PATH);
  try {
    const res = await client.getJson(`${BITGET_BASE_URL}${MARKET_CANDLES_PATH}?${query}`);
    if (res.httpStatus !== 200) return null;
    const points = normalizeCandleResponse(res.body);
    if (!points) return null;
    return {
      provenance: "REAL",
      symbol: NVDA_FUTURES_SYMBOL,
      category: NVDA_FUTURES_CATEGORY,
      interval: MARKET_SERIES_INTERVAL,
      points,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch NVDAUSDT OHLC candles at a chart interval (read-only). Returns
 * null on any transport, HTTP, provider, or shape failure.
 */
export async function fetchNvdaCandles(
  client: PublicHttpClient = createDefaultPublicClient(8000),
  interval: CandleInterval = DEFAULT_CANDLE_INTERVAL,
  limit: number = CANDLE_INTERVAL_LIMITS[DEFAULT_CANDLE_INTERVAL],
): Promise<RealCandleSeries | null> {
  const query =
    `category=${NVDA_FUTURES_CATEGORY}&symbol=${NVDA_FUTURES_SYMBOL}` +
    `&interval=${interval}&type=MARKET&limit=${limit}`;
  assertMarketSeriesAllowed("GET", MARKET_CANDLES_PATH);
  try {
    const res = await client.getJson(`${BITGET_BASE_URL}${MARKET_CANDLES_PATH}?${query}`);
    if (res.httpStatus !== 200) return null;
    const candles = normalizeOhlcResponse(res.body);
    if (!candles) return null;
    return {
      provenance: "REAL",
      symbol: NVDA_FUTURES_SYMBOL,
      category: NVDA_FUTURES_CATEGORY,
      interval,
      candles,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ---- Futures ticker snapshot ------------------------------------------------

/** Live NVDAUSDT perpetual snapshot. Every field nullable — never guessed. */
export interface FuturesTicker {
  readonly symbol: string;
  readonly lastPrice: string | null;
  readonly markPrice: string | null;
  readonly indexPrice: string | null;
  readonly bidPrice: string | null;
  readonly askPrice: string | null;
  readonly fundingRate: string | null;
  /** 24h fractional change as returned (e.g. "0.01401" = +1.401%). */
  readonly change24h: string | null;
  readonly high24h: string | null;
  readonly low24h: string | null;
  readonly openInterest: string | null;
  readonly updatedAt: string | null;
}

function pickTickerRow(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data)) return null;
  for (const entry of data) {
    const row = asRecord(entry);
    if (row && (asTrimmedString(row.symbol) ?? "").toUpperCase() === NVDA_FUTURES_SYMBOL) {
      return row;
    }
  }
  return null;
}

/**
 * Normalize one GET /api/v3/market/tickers row for NVDAUSDT USDT-FUTURES.
 * Null on missing row or unrecognized shapes; individual absent fields
 * stay null.
 */
export function normalizeFuturesTicker(body: unknown): FuturesTicker | null {
  const root = asRecord(body);
  if (!root || root.code !== "00000") return null;
  const row = pickTickerRow(root.data);
  if (!row) return null;
  const symbol = asTrimmedString(row.symbol);
  if (symbol === null) return null;
  const first = (keys: readonly string[]): string | null => {
    for (const key of keys) {
      const value = asTrimmedString(row[key]);
      if (value !== null) return value;
    }
    return null;
  };
  return {
    symbol,
    lastPrice: first(["lastPrice", "lastPr", "last"]),
    markPrice: first(["markPrice"]),
    indexPrice: first(["indexPrice"]),
    bidPrice: first(["bid1Price", "bidPr", "bestBid", "bid"]),
    askPrice: first(["ask1Price", "askPr", "bestAsk", "ask"]),
    fundingRate: first(["fundingRate", "fundingFeeRate", "fundRate"]),
    change24h: first(["price24hPcnt", "change24h", "priceChangePercent"]),
    high24h: first(["highPrice24h", "high24h"]),
    low24h: first(["lowPrice24h", "low24h"]),
    openInterest: first(["openInterest", "oi"]),
    updatedAt: first(["ts", "timestamp", "updatedTime"]),
  };
}

/** 24h change as percentage points (0.01401 → 1.401), null when unparseable. */
export function tickerChangePct(ticker: FuturesTicker): number | null {
  if (ticker.change24h === null) return null;
  const n = Number(ticker.change24h);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100 * 100) / 100;
}

export interface RealFuturesTicker {
  readonly provenance: "REAL";
  readonly ticker: FuturesTicker;
  readonly fetchedAt: string;
}

/** Fetch the live NVDAUSDT futures ticker snapshot (read-only). */
export async function fetchNvdaFuturesTicker(
  client: PublicHttpClient = createDefaultPublicClient(8000),
): Promise<RealFuturesTicker | null> {
  const query = `category=${NVDA_FUTURES_CATEGORY}&symbol=${NVDA_FUTURES_SYMBOL}`;
  assertMarketSeriesAllowed("GET", MARKET_TICKERS_PATH);
  try {
    const res = await client.getJson(`${BITGET_BASE_URL}${MARKET_TICKERS_PATH}?${query}`);
    if (res.httpStatus !== 200) return null;
    const ticker = normalizeFuturesTicker(res.body);
    if (!ticker) return null;
    return { provenance: "REAL", ticker, fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
