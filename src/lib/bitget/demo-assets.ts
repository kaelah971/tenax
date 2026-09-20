// Tenax Phase 2B — account-assets normalization (pure, offline).
//
// Safety contract:
// - No network, no credentials, no secrets. Input is an already-fetched
//   response body; output carries only sanitized balance fields.
// - Never guess missing fields: absent amounts stay null, unrecognized
//   shapes yield null, unusable rows are counted in `skipped`.
// - Reality/rToken classification is evidence-backed only. The known set
//   below grows exclusively with verified observations (RNVDA is the only
//   Reality asset confirmed in this repo via the RNVDAUSDT instrument).
//   Anything else is reported as a plain asset — never fabricated into
//   an exposure.

/** Reality/rToken coins confirmed by verified observation. */
export const KNOWN_REALITY_ASSET_COINS: readonly string[] = ["RNVDA"];

/** Coins that constitute NVDA-related Reality exposure. */
export const NVDA_RELATED_COINS: readonly string[] = ["RNVDA", "NVDA"];

/** Upper bound on rows normalized; the rest count as skipped. */
export const MAX_ASSET_ROWS = 500;

export interface DemoAssetBalance {
  /** Sanitized uppercase coin symbol as reported (never a pair invention). */
  readonly coin: string;
  /** Raw decimal strings when provided; null when the provider omits them. */
  readonly available: string | null;
  readonly frozen: string | null;
  readonly equity: string | null;
  readonly usdValue: string | null;
  /** True when any known amount parses to a non-zero number. */
  readonly isNonZero: boolean;
  /** True only for evidence-backed Reality/rToken coins. */
  readonly isRealityAsset: boolean;
  /** True for RNVDA/NVDA (pair suffix tolerated, see below). */
  readonly isNvdaRelated: boolean;
}

export interface NormalizeAccountAssetsResult {
  readonly assets: readonly DemoAssetBalance[];
  readonly skipped: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const COIN_KEYS: readonly string[] = ["coin", "currency", "asset", "token", "coinName", "symbol"];
const AVAILABLE_KEYS: readonly string[] = ["available", "availableBalance", "availBal", "free"];
const FROZEN_KEYS: readonly string[] = [
  "frozen",
  "frozenBalance",
  "locked",
  "lockedBalance",
  "lock",
];
const EQUITY_KEYS: readonly string[] = [
  "equity",
  "totalEquity",
  "balance",
  "total",
  "totalBalance",
  "bal",
  "amount",
];
const USD_VALUE_KEYS: readonly string[] = [
  "usdValue",
  "usdtValue",
  "usd_value",
  "usdt_value",
  "equityUsd",
];

const COIN_PATTERN = /^[A-Z0-9._-]{1,24}$/;

/**
 * Sanitize a raw coin symbol: trim, uppercase, strict charset.
 * Returns null for anything unusable — never invents a symbol.
 */
export function normalizeCoinSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const coin = raw.trim().toUpperCase();
  if (coin === "" || !COIN_PATTERN.test(coin)) return null;
  return coin;
}

/** Strip a trailing USDT quote suffix (pair-form tolerance, e.g. RNVDAUSDT). */
function stripQuoteSuffix(coin: string): string {
  return coin.length > 4 && coin.endsWith("USDT") ? coin.slice(0, -4) : coin;
}

/** True only for evidence-backed Reality/rToken coins (no prefix guessing). */
export function isRealityAssetCoin(coin: string): boolean {
  const upper = coin.toUpperCase();
  return (
    (KNOWN_REALITY_ASSET_COINS as readonly string[]).includes(upper) ||
    (KNOWN_REALITY_ASSET_COINS as readonly string[]).includes(stripQuoteSuffix(upper))
  );
}

/** True for NVDA-related coins (RNVDA/NVDA, pair suffix tolerated). */
export function isNvdaRelatedCoin(coin: string): boolean {
  const upper = coin.toUpperCase();
  return (
    (NVDA_RELATED_COINS as readonly string[]).includes(upper) ||
    (NVDA_RELATED_COINS as readonly string[]).includes(stripQuoteSuffix(upper))
  );
}

/** Parse a raw decimal string; null for missing/empty/non-numeric. */
export function parseAmount(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function takeRawAmount(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean" || value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text === "") continue;
    if (parseAmount(text) === null) continue;
    return text;
  }
  return null;
}

function normalizeRow(row: Record<string, unknown>): DemoAssetBalance | null {
  let coin: string | null = null;
  for (const key of COIN_KEYS) {
    coin = normalizeCoinSymbol(row[key]);
    if (coin !== null) break;
  }
  if (coin === null) return null;
  const available = takeRawAmount(row, AVAILABLE_KEYS);
  const frozen = takeRawAmount(row, FROZEN_KEYS);
  const equity = takeRawAmount(row, EQUITY_KEYS);
  const usdValue = takeRawAmount(row, USD_VALUE_KEYS);
  const amounts = [available, frozen, equity, usdValue].map(parseAmount);
  return {
    coin,
    available,
    frozen,
    equity,
    usdValue,
    isNonZero: amounts.some((value) => value !== null && value !== 0),
    isRealityAsset: isRealityAssetCoin(coin),
    isNvdaRelated: isNvdaRelatedCoin(coin),
  };
}

const DATA_LIST_KEYS: readonly string[] = ["assets", "list", "balances"];

/**
 * Normalize a GET /api/v3/account/assets body into sanitized balances.
 * Accepts `data` as an array or as an object wrapping an array under a
 * known key. Returns null for unrecognized shapes. Rows without a usable
 * coin symbol (and rows past the cap) count as skipped, never as assets.
 */
export function normalizeAccountAssets(body: unknown): NormalizeAccountAssetsResult | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = root.data;
  let rows: unknown[] | null = null;
  if (Array.isArray(data)) {
    rows = data;
  } else {
    const dataRecord = asRecord(data);
    if (dataRecord) {
      for (const key of DATA_LIST_KEYS) {
        if (Array.isArray(dataRecord[key])) {
          rows = dataRecord[key] as unknown[];
          break;
        }
      }
    }
  }
  if (!rows) return null;
  const assets: DemoAssetBalance[] = [];
  let skipped = 0;
  for (const entry of rows.slice(0, MAX_ASSET_ROWS)) {
    const row = asRecord(entry);
    if (!row) {
      skipped += 1;
      continue;
    }
    const asset = normalizeRow(row);
    if (!asset) {
      skipped += 1;
      continue;
    }
    assets.push(asset);
  }
  if (rows.length > MAX_ASSET_ROWS) skipped += rows.length - MAX_ASSET_ROWS;
  return { assets, skipped };
}
