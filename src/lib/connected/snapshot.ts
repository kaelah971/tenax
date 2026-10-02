// Tenax Connected Mode — local provider-read sanitization.
//
// This boundary accepts only provider response data already held in connector
// memory and returns the existing strict AccountSnapshot contract. No raw
// credentials, headers, signatures, or SDK config can appear in the result.
import { normalizeAccountAssets } from "../bitget/demo-assets.ts";
import { accountSnapshotSchema, type AccountSnapshot } from "./model.ts";

const MAX_POSITION_ROWS = 500;
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SYMBOL_PATTERN = /^[A-Z0-9._-]{1,128}$/;

export interface ConnectedProviderRead {
  readonly assets: unknown;
  readonly positions: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrapSdkData(value: unknown): unknown {
  const record = asRecord(value);
  return record && Object.prototype.hasOwnProperty.call(record, "data") ? record.data : value;
}

function decimalValue(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const text = String(value);
    return DECIMAL_PATTERN.test(text) ? text : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  return DECIMAL_PATTERN.test(text) ? text : null;
}

function firstText(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text !== "") return text;
  }
  return null;
}

function firstDecimal(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = decimalValue(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function assertTextFields(row: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (value !== null && value !== undefined && typeof value !== "string") {
      throw new Error("SANITIZATION_FAILED");
    }
  }
}

function assertDecimalFields(row: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) continue;
    if (decimalValue(value) === null) throw new Error("SANITIZATION_FAILED");
  }
}

function assetRows(value: unknown): Array<Record<string, unknown>> | null {
  const payload = unwrapSdkData(value);
  if (!Array.isArray(payload)) {
    const record = asRecord(payload);
    if (!record) return null;
    for (const key of ["assets", "list", "balances"] as const) {
      if (Array.isArray(record[key])) return assetRows(record[key]);
      if (Object.prototype.hasOwnProperty.call(record, key) && record[key] === null) return [];
    }
    return null;
  }
  if (payload.length > MAX_POSITION_ROWS) return null;
  const rows = payload.map(asRecord);
  return rows.every((row): row is Record<string, unknown> => row !== null) ? rows : null;
}

function positionRows(value: unknown): Array<Record<string, unknown>> | null {
  const payload = unwrapSdkData(value);
  if (payload === null || payload === undefined) return [];
  if (Array.isArray(payload)) {
    if (payload.length > MAX_POSITION_ROWS) return null;
    const rows = payload.map(asRecord);
    return rows.every((row): row is Record<string, unknown> => row !== null) ? rows : null;
  }
  const record = asRecord(payload);
  if (!record) return null;
  for (const key of ["list", "positions", "rows"] as const) {
    if (Array.isArray(record[key])) return positionRows(record[key]);
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] === null) return [];
  }
  return null;
}

function normalizePositions(value: unknown): AccountSnapshot["positions"] {
  const rows = positionRows(value);
  if (rows === null) throw new Error("SANITIZATION_FAILED");
  return rows.map((row) => {
    const symbolKeys = ["symbol", "instId", "instrument", "pair"] as const;
    const sideKeys = ["holdSide", "posSide", "side"] as const;
    const sizeKeys = ["total", "available", "size", "positionSize", "pos"] as const;
    const entryKeys = ["avgPrice", "openPriceAvg", "entryPrice"] as const;
    const pnlKeys = ["unrealizedPnl", "unrealisedPnl", "upl", "upnl"] as const;
    assertTextFields(row, [...symbolKeys, ...sideKeys]);
    assertDecimalFields(row, [...sizeKeys, ...entryKeys, "markPrice", "leverage", ...pnlKeys]);
    const symbol = (firstText(row, symbolKeys) ?? "").toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol)) throw new Error("SANITIZATION_FAILED");
    return {
      symbol,
      side: firstText(row, sideKeys),
      size: firstDecimal(row, sizeKeys),
      entryPrice: firstDecimal(row, entryKeys),
      markPrice: firstDecimal(row, ["markPrice"]),
      leverage: firstDecimal(row, ["leverage"]),
      unrealizedPnl: firstDecimal(row, pnlKeys),
    };
  });
}

function normalizeAssets(value: unknown): AccountSnapshot["assets"] {
  const rows = assetRows(value);
  if (rows === null || rows.length > MAX_POSITION_ROWS) throw new Error("SANITIZATION_FAILED");
  for (const row of rows) {
    assertTextFields(row, ["coin", "currency", "asset", "token", "coinName", "symbol"]);
    assertDecimalFields(row, [
      "available",
      "availableBalance",
      "availBal",
      "free",
      "frozen",
      "frozenBalance",
      "locked",
      "lockedBalance",
      "lock",
      "equity",
      "totalEquity",
      "balance",
      "total",
      "totalBalance",
      "bal",
      "amount",
      "usdValue",
      "usdtValue",
      "usd_value",
      "usdt_value",
      "equityUsd",
    ]);
  }
  const normalized = normalizeAccountAssets({ data: unwrapSdkData(value) });
  if (normalized === null || normalized.skipped > 0) throw new Error("SANITIZATION_FAILED");
  return normalized.assets.map((asset) => ({
    asset: asset.coin,
    available: asset.available,
    frozen: asset.frozen,
    equity: asset.equity,
    usdValue: asset.usdValue,
  }));
}

export function sanitizeConnectedSnapshot(input: {
  readonly connectionId: string;
  readonly providerUserId: string;
  readonly providerRead: ConnectedProviderRead;
  readonly syncedAt?: Date;
}): AccountSnapshot {
  try {
    if (/[\u0000-\u001f\u007f]/.test(input.providerUserId)) throw new Error("SANITIZATION_FAILED");
    const snapshot = accountSnapshotSchema.parse({
      connectionId: input.connectionId,
      provider: "BITGET",
      providerUserId: input.providerUserId,
      connectionStatus: "CONNECTED",
      accessMode: "READ_ONLY",
      syncedAt: (input.syncedAt ?? new Date()).toISOString(),
      assets: normalizeAssets(input.providerRead.assets),
      positions: normalizePositions(input.providerRead.positions),
    });
    return snapshot;
  } catch {
    throw new Error("SANITIZATION_FAILED");
  }
}

export interface ConnectorSummary {
  readonly connectionStatus: AccountSnapshot["connectionStatus"];
  readonly provider: AccountSnapshot["provider"];
  readonly providerUserId: string;
  readonly assetCount: number;
  readonly positionCount: number;
  readonly accessMode: AccountSnapshot["accessMode"];
  readonly syncedAt: string;
}

export function summarizeConnectedSnapshot(snapshot: AccountSnapshot): ConnectorSummary {
  return {
    connectionStatus: snapshot.connectionStatus,
    provider: snapshot.provider,
    providerUserId: snapshot.providerUserId ?? "UNKNOWN",
    assetCount: snapshot.assets.length,
    positionCount: snapshot.positions.length,
    accessMode: snapshot.accessMode,
    syncedAt: snapshot.syncedAt,
  };
}
