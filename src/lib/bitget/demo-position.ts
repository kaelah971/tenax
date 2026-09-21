// Tenax Phase 4A.2 — authenticated Demo position display surface.
//
// Safety contract (do not weaken without owner approval):
// - Server-only. Credentials arrive as arguments from server code that
//   loaded them from the environment; they are never logged, printed,
//   serialized, or returned. Only sanitized display strings leave this
//   module.
// - Read-only. Exactly one request — GET /api/v3/position/current-position
//   — via the shared helper (demo-auth.ts), which enforces the allowlist
//   and sends `paptrading: 1`. No orders, no leverage changes, no writes.
// - NVDAUSDT short only: the surface selects an NVDAUSDT row with non-zero
//   size and a short side. Anything else (no rows, zero size, non-short,
//   unrecognized shape) is NO_POSITION or UNAVAILABLE — a receipt is never
//   substituted and a live position is never pretended.
// - Optional provider fields (unrealized PnL, ROI, liquidation price,
//   timestamps) are picked across known aliases when present and stay
//   null when absent. Malformed envelopes yield UNAVAILABLE.

import { parseAmount } from "./demo-assets.ts";
import {
  DEMO_POSITION_CURRENT_PATH,
  fetchDemoReadOnly,
  type DemoAuthCredentials,
  type FetchImpl,
} from "./demo-auth.ts";

export const NVDA_POSITION_SYMBOL = "NVDAUSDT";
export const NVDA_POSITION_CATEGORY = "USDT-FUTURES";
export const NVDA_POSITION_QUERY = `category=${NVDA_POSITION_CATEGORY}&symbol=${NVDA_POSITION_SYMBOL}`;

export type DemoPositionState = "POSITION" | "NO_POSITION" | "UNAVAILABLE";

/**
 * Sanitized display model. All provider values are strings-or-null;
 * hasPosition is the only boolean. No credentials, no headers, no raw
 * bodies — safe to serialize to the browser.
 */
export interface DemoPositionView {
  readonly state: DemoPositionState;
  readonly symbol: typeof NVDA_POSITION_SYMBOL | null;
  readonly side: string | null;
  readonly size: string | null;
  readonly avgEntryPrice: string | null;
  readonly markPrice: string | null;
  readonly leverage: string | null;
  readonly marginMode: string | null;
  readonly upnl: string | null;
  readonly upnlRoi: string | null;
  readonly liqPrice: string | null;
  readonly updatedAt: string | null;
}

export const NO_DEMO_POSITION: DemoPositionView = {
  state: "NO_POSITION",
  symbol: null,
  side: null,
  size: null,
  avgEntryPrice: null,
  markPrice: null,
  leverage: null,
  marginMode: null,
  upnl: null,
  upnlRoi: null,
  liqPrice: null,
  updatedAt: null,
};

export const UNAVAILABLE_DEMO_POSITION: DemoPositionView = {
  ...NO_DEMO_POSITION,
  state: "UNAVAILABLE",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function positionRows(body: unknown): Array<Record<string, unknown>> | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = root.data;
  if (Array.isArray(data)) {
    return data
      .map(asRecord)
      .filter((r): r is Record<string, unknown> => r !== null);
  }
  const dataRecord = asRecord(data);
  if (!dataRecord) return null;
  for (const key of ["list", "positions", "rows"] as const) {
    if (Array.isArray(dataRecord[key])) {
      return (dataRecord[key] as unknown[])
        .map(asRecord)
        .filter((r): r is Record<string, unknown> => r !== null);
    }
  }
  return null;
}

/**
 * Normalize GET /api/v3/position/current-position to the NVDAUSDT short
 * display model. An empty list (or no matching short row) is a valid
 * NO_POSITION — never an error. Returns null only for transport failure
 * (UNAVAILABLE) or unrecognized shapes (UNAVAILABLE).
 */
export function normalizeDemoPositionView(body: unknown): DemoPositionView | null {
  const rows = positionRows(body);
  if (!rows) return null;
  const matches = rows.filter(
    (row) => (asTrimmedString(row.symbol) ?? "").toUpperCase() === NVDA_POSITION_SYMBOL,
  );
  const live = matches.find((row) => {
    const size = takeFirst(row, ["total", "available", "size"]);
    const parsed = parseAmount(size);
    if (parsed === null || parsed === 0) return false;
    const side = (takeFirst(row, ["posSide", "holdSide"]) ?? "").toLowerCase();
    return side === "short";
  });
  if (!live) return { ...NO_DEMO_POSITION };
  return {
    state: "POSITION",
    symbol: NVDA_POSITION_SYMBOL,
    side: takeFirst(live, ["posSide", "holdSide"]),
    size: takeFirst(live, ["total", "available", "size"]),
    avgEntryPrice: takeFirst(live, ["avgPrice", "openPriceAvg", "averagePrice"]),
    markPrice: takeFirst(live, ["markPrice"]),
    leverage: takeFirst(live, ["leverage"]),
    marginMode: takeFirst(live, ["marginMode"]),
    upnl: takeFirst(live, ["unrealisedPnl", "unrealizedPnl", "upnl", "upl"]),
    upnlRoi: takeFirst(live, ["roe", "roi", "upnlRoi", "returnRate"]),
    liqPrice: takeFirst(live, ["liqPx", "liquidationPrice", "liqPrice", "estLiqPx"]),
    updatedAt: takeFirst(live, ["uTime", "updatedTime", "updatedAt"]),
  };
}

function takeFirst(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = asTrimmedString(row[key]);
    if (value !== null) return value;
  }
  return null;
}

export interface FetchDemoPositionOptions {
  readonly credentials: DemoAuthCredentials;
  readonly baseUrl: string;
  readonly fetchImpl?: FetchImpl;
  readonly timeoutMs?: number;
}

/**
 * Fetch the current Demo position view (server-only, read-only).
 * Transport/auth/provider/shape failures all yield UNAVAILABLE — the UI
 * renders that honestly while candles and ticker may still render.
 */
export async function fetchDemoPositionView(
  options: FetchDemoPositionOptions,
): Promise<DemoPositionView> {
  try {
    const res = await fetchDemoReadOnly({
      credentials: options.credentials,
      baseUrl: options.baseUrl,
      tradingMode: "demo",
      requestPath: DEMO_POSITION_CURRENT_PATH,
      queryString: NVDA_POSITION_QUERY,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs ?? 8000,
    });
    if (res.transportError !== null || res.httpStatus !== 200) {
      return { ...UNAVAILABLE_DEMO_POSITION };
    }
    const root = asRecord(res.body);
    if (!root || root.code !== "00000") return { ...UNAVAILABLE_DEMO_POSITION };
    return normalizeDemoPositionView(res.body) ?? { ...UNAVAILABLE_DEMO_POSITION };
  } catch {
    return { ...UNAVAILABLE_DEMO_POSITION };
  }
}
