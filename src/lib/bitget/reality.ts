// Tenax Phase 1B — Bitget Reality public-data adapter.
//
// Safety contract (do not weaken without owner approval):
// - Public GET only. No API key, no signature, no auth headers, no secrets.
// - No order placement/cancel, no Demo/live trading, no authenticated endpoints.
// - Sequential requests with a conservative gap, single attempt each
//   (no retries — never hammer Reality endpoints), per-request timeout.
// - Typed, validated responses. Raw provider shapes never leave this module;
//   downstream Tenax code consumes only the normalized snapshot
//   (see src/lib/intelligence/snapshot.ts).
//
// Verified surfaces: docs/spike-result.md Phase 0A owner-network rerun
// (all 8 probes HTTP 200 / code 00000). Rerun contract check:
// node scripts/spikes/bitget-reality-verify.mjs

import { z } from "zod";

export const BITGET_BASE_URL = "https://api.bitget.com";
export const RNVDA_SYMBOL = "RNVDAUSDT";
export const NVDA_CODE = "NVDA";

/** Conservative defaults proven by the Phase 0A spike script. */
export const DEFAULT_GAP_MS = 1200;
export const DEFAULT_TIMEOUT_MS = 15000;
const USER_AGENT = "tenax-reality-1b";

/** Injectable fetch boundary — tests stub this, product code never touches network directly. */
export interface PublicJsonResponse {
  readonly httpStatus: number;
  readonly body: unknown;
}

export interface PublicHttpClient {
  getJson(url: string): Promise<PublicJsonResponse>;
}

export function createDefaultPublicClient(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): PublicHttpClient {
  return {
    async getJson(url: string): Promise<PublicJsonResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": USER_AGENT },
          signal: controller.signal,
        });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = { _nonJson: text.slice(0, 300) };
        }
        return { httpStatus: res.status, body };
      } finally {
        clearTimeout(timer);
      }
      // NOTE: transport failures throw and are classified as TRANSPORT_ERROR
      // by fetchRealityBundle. Nothing is retried.
    },
  };
}

export const REALITY_ENDPOINTS = {
  instruments: {
    path: "/api/v3/market/instruments",
    params: { category: "SPOT", symbol: RNVDA_SYMBOL },
  },
  ticker: {
    path: "/api/v3/market/tickers",
    params: { category: "SPOT", symbol: RNVDA_SYMBOL },
  },
  stockInfo: {
    path: "/api/v3/reality/market/stock-info",
    params: { symbol: RNVDA_SYMBOL },
  },
  marketStates: { path: "/api/v3/reality/market/states", params: {} },
  marketCalendar: { path: "/api/v3/reality/market/calendar", params: {} },
  earningsForecast: {
    path: "/api/v3/reality/market/earnings-forecast",
    params: { code: NVDA_CODE },
  },
  companyOverview: {
    path: "/api/v3/reality/market/company-overview",
    params: { code: NVDA_CODE },
  },
  valuationIndicators: {
    path: "/api/v3/reality/market/valuation-indicators",
    params: { code: NVDA_CODE },
  },
} as const;

export type RealityEndpointKey = keyof typeof REALITY_ENDPOINTS;

export type EndpointFailureKind =
  | "TRANSPORT_ERROR"
  | "HTTP_ERROR"
  | "PROVIDER_ERROR"
  | "SCHEMA_ERROR"
  | "NOT_FOUND";

export interface RealityEndpointOutcome<T> {
  readonly endpoint: string;
  readonly status: "OK" | EndpointFailureKind;
  readonly httpStatus: number;
  readonly bitgetCode: string | null;
  readonly data: T | null;
  readonly error: string | null;
  readonly fetchedAt: string;
}

// ---- Parsed (provider-faithful, Tenax-internal) shapes --------------------

export interface ParsedInstrument {
  readonly symbol: string;
  readonly category: string;
  readonly status: string;
  readonly isReality: boolean;
  readonly baseCoin: string | null;
  readonly quoteCoin: string | null;
  readonly minOrderQty: number | null;
  readonly minOrderAmount: number | null;
  readonly pricePrecision: number | null;
  readonly quantityPrecision: number | null;
}

export interface ParsedTicker {
  readonly symbol: string;
  readonly lastPrice: string | null;
  readonly openPrice24h: string | null;
  readonly highPrice24h: string | null;
  readonly lowPrice24h: string | null;
  readonly bidPrice: string | null;
  readonly askPrice: string | null;
  readonly priceChangePct24h: string | null;
  readonly volume24h: string | null;
  readonly turnover24h: string | null;
  readonly updatedAt: string | null;
}

export interface ParsedStockInfo {
  readonly symbol: string;
  readonly code: string;
  readonly tradingPeriods: readonly string[];
  readonly weekendTradable: boolean | null;
  readonly name: string | null;
}

export interface SessionEntry {
  readonly name: string | null;
  readonly hours: string | null;
  /** True when Bitget explicitly marked this session active/current. */
  readonly markedActive: boolean;
}

export interface ParsedMarketStates {
  readonly market: string | null;
  readonly daylightType: string | null;
  readonly sessions: readonly SessionEntry[];
}

export interface ParsedMarketCalendar {
  readonly timeZone: string | null;
  readonly weekendClosure: readonly string[];
  readonly specificEntryCount: number;
}

export interface ParsedEarningsForecast {
  readonly fiscalYear: string | number | null;
  readonly publicationDeadline: unknown;
  readonly isActual: boolean | null;
  readonly eps: string | null;
  readonly revenue: string | null;
  readonly currency: string | null;
}

export interface ParsedCompanyOverview {
  readonly code: string | null;
  readonly name: string | null;
  readonly listingDate: string | null;
  readonly employees: string | null;
  readonly peRatio: string | null;
  readonly pbRatio: string | null;
  readonly high52Week: string | null;
  readonly low52Week: string | null;
}

export interface ParsedValuation {
  readonly observedKeys: readonly string[];
  readonly dividendYieldTtm: unknown;
}

export interface RealityPublicBundle {
  readonly fetchedAt: string;
  readonly baseUrl: string;
  readonly instruments: RealityEndpointOutcome<ParsedInstrument>;
  readonly ticker: RealityEndpointOutcome<ParsedTicker>;
  readonly stockInfo: RealityEndpointOutcome<ParsedStockInfo>;
  readonly marketStates: RealityEndpointOutcome<ParsedMarketStates>;
  readonly marketCalendar: RealityEndpointOutcome<ParsedMarketCalendar>;
  readonly earningsForecast: RealityEndpointOutcome<ParsedEarningsForecast>;
  readonly companyOverview: RealityEndpointOutcome<ParsedCompanyOverview>;
  readonly valuationIndicators: RealityEndpointOutcome<ParsedValuation>;
}

// ---- Narrowing helpers (tolerant: unknown in, validated out) --------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toYesNoBoolean(value: unknown): boolean | null {
  if (value === true || value === "yes") return true;
  if (value === false || value === "no") return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "yes" || v === "true" || v === "1") return true;
    if (v === "no" || v === "false" || v === "0") return false;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = asString(item);
    if (s !== null) out.push(s);
  }
  return out;
}

function pickRow(data: unknown, symbol: string): Record<string, unknown> | null {
  if (!Array.isArray(data)) return null;
  const want = symbol.toUpperCase();
  for (const row of data) {
    const record = asRecord(row);
    if (record && String(record.symbol ?? "").toUpperCase() === want) return record;
  }
  return null;
}

function firstRecord(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return asRecord(data[0] ?? null);
  return asRecord(data);
}

class SchemaError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function requireRow(
  data: unknown,
  symbol: string,
  endpoint: string,
): Record<string, unknown> {
  const row = pickRow(data, symbol);
  if (!row) throw new SchemaError(`${endpoint}: no ${symbol} row in data`);
  return row;
}

// ---- Per-endpoint parsers (fields limited to Phase 0A-observed keys) ------

function parseInstrument(data: unknown): ParsedInstrument {
  const row = requireRow(data, RNVDA_SYMBOL, "instruments");
  const symbol = asString(row.symbol);
  const category = asString(row.category);
  const status = asString(row.status);
  if (!symbol || !category || !status) {
    throw new SchemaError("instruments: missing symbol/category/status");
  }
  const isReality = toYesNoBoolean(row.isReality);
  return {
    symbol,
    category,
    status,
    isReality: isReality ?? false,
    baseCoin: asString(row.baseCoin),
    quoteCoin: asString(row.quoteCoin),
    minOrderQty: toFiniteNumber(row.minOrderQty),
    minOrderAmount: toFiniteNumber(row.minOrderAmount),
    pricePrecision: toFiniteNumber(row.pricePrecision),
    quantityPrecision: toFiniteNumber(row.quantityPrecision),
  };
}

function parseTicker(data: unknown): ParsedTicker {
  const row = requireRow(data, RNVDA_SYMBOL, "ticker");
  const symbol = asString(row.symbol);
  if (!symbol) throw new SchemaError("ticker: missing symbol");
  return {
    symbol,
    lastPrice: asString(row.lastPrice),
    openPrice24h: asString(row.openPrice24h),
    highPrice24h: asString(row.highPrice24h),
    lowPrice24h: asString(row.lowPrice24h),
    bidPrice: asString(row.bid1Price),
    askPrice: asString(row.ask1Price),
    priceChangePct24h: asString(row.price24hPcnt),
    volume24h: asString(row.volume24h),
    turnover24h: asString(row.turnover24h),
    updatedAt: asString(row.ts),
  };
}

function parseStockInfo(data: unknown): ParsedStockInfo {
  const record = firstRecord(data);
  if (!record) throw new SchemaError("stock-info: empty data");
  const symbol = asString(record.symbol);
  const code = asString(record.stockCode ?? record.code);
  if (!symbol || !code) throw new SchemaError("stock-info: missing symbol/code");
  return {
    symbol,
    code,
    tradingPeriods: asStringArray(record.tradingPeriod),
    weekendTradable: toYesNoBoolean(record.weekendTradable),
    name: asString(record.companyName ?? record.name),
  };
}

const SESSION_NAME_KEYS = ["session", "name", "state", "period", "phase", "stage"];
const SESSION_HOURS_KEYS = ["hours", "time", "timeRange", "range", "tradingHours", "sessionHours"];

function scanKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const s = asString(record[key]);
    if (s !== null && s !== "") return s;
  }
  return null;
}

const ACTIVE_MARKER_KEYS = ["isActive", "active", "isCurrent", "current"] as const;

function hasActiveMarker(entry: Record<string, unknown>): boolean {
  return ACTIVE_MARKER_KEYS.some((key) => entry[key] === true);
}

function parseMarketStates(data: unknown): ParsedMarketStates {
  const record = asRecord(data);
  if (!record) throw new SchemaError("market-states: data is not an object");
  const rawList = Array.isArray(record.stateList) ? record.stateList : [];
  const sessions: SessionEntry[] = rawList.map((entry) => {
    const entryRecord = asRecord(entry);
    if (!entryRecord) return { name: null, hours: null, markedActive: false };
    return {
      name: scanKeys(entryRecord, SESSION_NAME_KEYS),
      hours: scanKeys(entryRecord, SESSION_HOURS_KEYS),
      markedActive: hasActiveMarker(entryRecord),
    };
  });
  return {
    market: asString(record.market),
    daylightType: asString(record.daylightType),
    sessions,
  };
}

function parseMarketCalendar(data: unknown): ParsedMarketCalendar {
  const record = asRecord(data);
  if (!record) throw new SchemaError("market-calendar: data is not an object");
  const specific = Array.isArray(record.specificConfig) ? record.specificConfig : [];
  return {
    timeZone: asString(record.timeZone ?? record.timezone),
    weekendClosure: asStringArray(record.regularConfig),
    specificEntryCount: specific.length,
  };
}

function parseEarningsForecast(data: unknown): ParsedEarningsForecast {
  const record = firstRecord(data);
  if (!record) throw new SchemaError("earnings-forecast: empty data");
  const fiscalYearRaw = record.fiscalYear;
  return {
    fiscalYear:
      typeof fiscalYearRaw === "number" || typeof fiscalYearRaw === "string"
        ? fiscalYearRaw
        : null,
    // Kept verbatim (observed null). NEVER interpreted as an event date —
    // see src/lib/intelligence/event-intelligence.ts.
    publicationDeadline: record.publicationDeadline ?? null,
    isActual: typeof record.isActual === "boolean" ? record.isActual : null,
    eps: asString(record.eps),
    revenue: asString(record.revenue),
    currency: asString(record.currency),
  };
}

function parseCompanyOverview(data: unknown): ParsedCompanyOverview {
  const record = firstRecord(data);
  if (!record) throw new SchemaError("company-overview: empty data");
  return {
    code: asString(record.code),
    name: asString(record.name),
    listingDate: asString(record.listingDate),
    employees: asString(record.employees),
    peRatio: asString(record.peRatio),
    pbRatio: asString(record.pbRatio),
    high52Week: asString(record.high52Week),
    low52Week: asString(record.low52Week),
  };
}

function parseValuation(data: unknown): ParsedValuation {
  const record = firstRecord(data);
  if (!record) throw new SchemaError("valuation-indicators: empty data");
  return {
    observedKeys: Object.keys(record),
    dividendYieldTtm: record.dividendYieldTtm ?? null,
  };
}

// ---- Bundle fetch ----------------------------------------------------------

const bitgetEnvelopeSchema = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: z.unknown(),
});

function buildUrl(path: string, params: Record<string, string>): string {
  const url = new URL(path, BITGET_BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOne<T>(
  key: RealityEndpointKey,
  parse: (data: unknown) => T,
  client: PublicHttpClient,
): Promise<RealityEndpointOutcome<T>> {
  const def = REALITY_ENDPOINTS[key];
  const endpoint = `GET ${def.path}`;
  const fetchedAt = new Date().toISOString();
  const fail = (
    status: EndpointFailureKind,
    httpStatus: number,
    bitgetCode: string | null,
    error: string,
  ): RealityEndpointOutcome<T> => ({
    endpoint,
    status,
    httpStatus,
    bitgetCode,
    data: null,
    error,
    fetchedAt,
  });

  let response: PublicJsonResponse;
  try {
    response = await client.getJson(buildUrl(def.path, { ...def.params }));
  } catch (err) {
    return fail("TRANSPORT_ERROR", 0, null, `transport failure: ${String(err)}`);
  }
  if (response.httpStatus !== 200) {
    return fail("HTTP_ERROR", response.httpStatus, null, `HTTP ${response.httpStatus}`);
  }
  const envelope = bitgetEnvelopeSchema.safeParse(response.body);
  if (!envelope.success) {
    return fail("SCHEMA_ERROR", response.httpStatus, null, "response is not a Bitget envelope");
  }
  if (envelope.data.code !== "00000") {
    return fail(
      "PROVIDER_ERROR",
      response.httpStatus,
      envelope.data.code,
      `Bitget code ${envelope.data.code}`,
    );
  }
  try {
    const data = parse(envelope.data.data);
    return {
      endpoint,
      status: "OK",
      httpStatus: response.httpStatus,
      bitgetCode: envelope.data.code,
      data,
      error: null,
      fetchedAt,
    };
  } catch (err) {
    const message = err instanceof SchemaError ? err.message : String(err);
    const status: EndpointFailureKind = message.includes("no RNVDAUSDT row")
      ? "NOT_FOUND"
      : "SCHEMA_ERROR";
    return fail(status, response.httpStatus, envelope.data.code, message);
  }
}

export interface FetchBundleOptions {
  readonly gapMs?: number;
}

export async function fetchRealityBundle(
  client: PublicHttpClient = createDefaultPublicClient(),
  options: FetchBundleOptions = {},
): Promise<RealityPublicBundle> {
  const gapMs = options.gapMs ?? DEFAULT_GAP_MS;
  const fetchedAt = new Date().toISOString();

  const instruments = await fetchOne("instruments", parseInstrument, client);
  await sleep(gapMs);
  const ticker = await fetchOne("ticker", parseTicker, client);
  await sleep(gapMs);
  const stockInfo = await fetchOne("stockInfo", parseStockInfo, client);
  await sleep(gapMs);
  const marketStates = await fetchOne("marketStates", parseMarketStates, client);
  await sleep(gapMs);
  const marketCalendar = await fetchOne("marketCalendar", parseMarketCalendar, client);
  await sleep(gapMs);
  const earningsForecast = await fetchOne("earningsForecast", parseEarningsForecast, client);
  await sleep(gapMs);
  const companyOverview = await fetchOne("companyOverview", parseCompanyOverview, client);
  await sleep(gapMs);
  const valuationIndicators = await fetchOne("valuationIndicators", parseValuation, client);

  return {
    fetchedAt,
    baseUrl: BITGET_BASE_URL,
    instruments,
    ticker,
    stockInfo,
    marketStates,
    marketCalendar,
    earningsForecast,
    companyOverview,
    valuationIndicators,
  };
}
