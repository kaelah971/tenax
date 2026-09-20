// Tenax Phase 2D-A — DEMO-ONLY write-capable trading helper.
//
// This module lives apart from the GET-only helper (demo-auth.ts) on
// purpose: that module can never POST. This module can POST exactly one
// endpoint — POST /api/v3/trade/place-order — and nothing else.
//
// DEMO-ONLY invariants (do not weaken without owner approval):
// - Every entry point hardcodes tradingMode "demo" and sends
//   `paptrading: 1`. There is no live-mode parameter; live is refused by
//   construction (no code path accepts a mode at all).
// - The write allowlist contains exactly POST place-order. No cancel, no
//   modify, no transfer, no leverage setters, no account-setting writes,
//   no Reality order endpoint, no generic arbitrary POST support.
// - The request body is serialized ONCE; the exact transmitted string is
//   what gets signed. No marginMode and no leverage are ever included.
// - Credentials, signatures, and full headers are never logged, printed,
//   or embedded in results. Transports return status + parsed body only.

import { randomBytes } from "node:crypto";

import {
  assertReadOnlyRequest,
  buildDemoAuthHeaders,
  signUtaRequest,
  type DemoAuthCredentials,
  type DemoReadOnlyFetchResult,
} from "./demo-auth.ts";

/** The single permitted write endpoint. */
export const DEMO_PLACE_ORDER_PATH = "/api/v3/trade/place-order" as const;

/** The post-submission verification endpoint (GET, allowlisted in demo-auth). */
export const DEMO_ORDER_INFO_PATH = "/api/v3/trade/order-info" as const;

/** Exact write allowlist — method + path pairs, nothing else. */
export const DEMO_WRITE_ALLOWLIST: ReadonlyArray<{
  readonly method: "POST";
  readonly path: string;
}> = [{ method: "POST", path: DEMO_PLACE_ORDER_PATH }];

/**
 * Enforce the write boundary. Throws on anything that is not exactly
 * POST /api/v3/trade/place-order. No network, no secrets involved.
 */
export function assertWriteAllowed(method: string, requestPath: string): void {
  const allowed = DEMO_WRITE_ALLOWLIST.some(
    (entry) => entry.method === method.toUpperCase() && entry.path === requestPath,
  );
  if (!allowed) {
    throw new Error(`refused: write ${method} ${requestPath} is not in the Demo write allowlist`);
  }
}

/** Conservative clientOid charset (Bitget custom IDs; alphanumeric plus -_). */
export const CLIENT_OID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidClientOid(oid: string): boolean {
  return CLIENT_OID_PATTERN.test(oid);
}

/**
 * Build a unique Tenax-controlled clientOid. Timestamp + randomness make
 * collisions practically impossible; the result is always validated.
 */
export function createDemoClientOid(nowMs: number = Date.now(), randHex?: string): string {
  const rand = randHex ?? randomBytes(3).toString("hex");
  const oid = `tenax-${nowMs}-${rand}`;
  if (!isValidClientOid(oid)) {
    throw new Error("refused: generated clientOid violates Bitget constraints");
  }
  return oid;
}

export interface DemoShortOrderBody {
  readonly category: "USDT-FUTURES";
  readonly symbol: "NVDAUSDT";
  readonly side: "sell";
  readonly posSide: "short";
  readonly orderType: "market";
  readonly qty: string;
  readonly clientOid: string;
}

const QTY_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Build the exact hedge order body. No marginMode, no leverage — the
 * account's configured 1x crossed margin applies untouched. Tenax never
 * silently changes leverage during execution.
 */
export function buildDemoShortOrderBody(input: {
  readonly qty: string;
  readonly clientOid: string;
}): DemoShortOrderBody {
  if (!QTY_PATTERN.test(input.qty) || Number(input.qty) <= 0) {
    throw new Error(`refused: invalid order qty (got ${input.qty})`);
  }
  if (!isValidClientOid(input.clientOid)) {
    throw new Error("refused: clientOid violates Bitget constraints");
  }
  return {
    category: "USDT-FUTURES",
    symbol: "NVDAUSDT",
    side: "sell",
    posSide: "short",
    orderType: "market",
    qty: input.qty,
    clientOid: input.clientOid,
  };
}

export type WriteFetchImpl = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

export interface DemoWriteResult {
  readonly httpStatus: number;
  readonly body: unknown;
  readonly transportError: string | null;
}

export const DEFAULT_DEMO_WRITE_TIMEOUT_MS = 15_000;

export interface PlaceDemoOrderOptions {
  readonly credentials: DemoAuthCredentials;
  readonly baseUrl: string;
  readonly body: DemoShortOrderBody;
  readonly fetchImpl?: WriteFetchImpl;
  readonly timeoutMs?: number;
  readonly timestamp?: string;
}

/**
 * Submit the Demo short hedge. The write guard runs before any credential
 * is touched; the exact transmitted body string is what gets signed.
 * DEMO ONLY — paptrading: 1 is unconditional; no live path exists.
 */
export async function placeDemoShortOrder(
  options: PlaceDemoOrderOptions,
): Promise<DemoWriteResult> {
  const method = "POST";
  assertWriteAllowed(method, DEMO_PLACE_ORDER_PATH);

  // Serialize once: sign exactly what is transmitted.
  const rawBody = JSON.stringify(options.body);
  const timestamp = options.timestamp ?? String(Date.now());
  const signature = signUtaRequest({
    timestamp,
    method,
    requestPath: DEMO_PLACE_ORDER_PATH,
    body: rawBody,
    secretKey: options.credentials.secretKey,
  });
  const headers = buildDemoAuthHeaders({
    apiKey: options.credentials.apiKey,
    passphrase: options.credentials.passphrase,
    timestamp,
    signature,
    tradingMode: "demo",
  });

  const url = `${options.baseUrl.replace(/\/+$/, "")}${DEMO_PLACE_ORDER_PATH}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_DEMO_WRITE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const impl: WriteFetchImpl =
      options.fetchImpl ??
      ((requestUrl, init) =>
        fetch(requestUrl, {
          method: init.method,
          headers: init.headers,
          body: init.body,
          signal: init.signal,
        }).then((res) => ({
          status: res.status,
          text: () => res.text(),
        })));
    const response = await impl(url, { method, headers, body: rawBody, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { _nonJson: text.slice(0, 300) };
    }
    return { httpStatus: response.status, body, transportError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { httpStatus: 0, body: null, transportError: message.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

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

/** Extract the orderId/clientOid pair from a place-order response. Never throws. */
export function extractPlacedOrderIds(body: unknown): {
  readonly orderId: string | null;
  readonly clientOid: string | null;
} {
  const root = asRecord(body);
  if (!root) return { orderId: null, clientOid: null };
  const data = asRecord(root.data) ?? root;
  return {
    orderId: asString(data.orderId),
    clientOid: asString(data.clientOid),
  };
}

export type ReadFetchImpl = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

export interface FetchDemoOrderInfoOptions {
  readonly credentials: DemoAuthCredentials;
  readonly baseUrl: string;
  readonly orderId?: string | null;
  readonly clientOid?: string | null;
  readonly fetchImpl?: ReadFetchImpl;
  readonly timeoutMs?: number;
  readonly timestamp?: string;
}

/**
 * Fetch GET /api/v3/trade/order-info for post-submission verification.
 * Requires at least one of orderId/clientOid; refuses otherwise rather
 * than querying blindly.
 */
export async function fetchDemoOrderInfo(
  options: FetchDemoOrderInfoOptions,
): Promise<DemoReadOnlyFetchResult> {
  const method = "GET";
  assertReadOnlyRequest(method, DEMO_ORDER_INFO_PATH);
  const params = new URLSearchParams();
  if (options.orderId !== null && options.orderId !== undefined && options.orderId !== "") {
    params.set("orderId", options.orderId);
  }
  if (options.clientOid !== null && options.clientOid !== undefined && options.clientOid !== "") {
    params.set("clientOid", options.clientOid);
  }
  const query = params.toString();
  if (query === "") {
    throw new Error("refused: order-info needs orderId and/or clientOid");
  }

  const timestamp = options.timestamp ?? String(Date.now());
  const signature = signUtaRequest({
    timestamp,
    method,
    requestPath: DEMO_ORDER_INFO_PATH,
    queryString: query,
    secretKey: options.credentials.secretKey,
  });
  const headers = buildDemoAuthHeaders({
    apiKey: options.credentials.apiKey,
    passphrase: options.credentials.passphrase,
    timestamp,
    signature,
    tradingMode: "demo",
  });

  const url = `${options.baseUrl.replace(/\/+$/, "")}${DEMO_ORDER_INFO_PATH}?${query}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_DEMO_WRITE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const impl: ReadFetchImpl =
      options.fetchImpl ??
      ((requestUrl, init) =>
        fetch(requestUrl, {
          method: init.method,
          headers: init.headers,
          signal: init.signal,
        }).then((res) => ({
          status: res.status,
          text: () => res.text(),
        })));
    const response = await impl(url, { method, headers, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { _nonJson: text.slice(0, 300) };
    }
    return { httpStatus: response.status, body, transportError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { httpStatus: 0, body: null, transportError: message.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export interface DemoOrderVerification {
  readonly orderId: string | null;
  readonly clientOid: string | null;
  readonly orderStatus: string | null;
  readonly symbol: string | null;
  readonly side: string | null;
  readonly posSide: string | null;
  readonly qty: string | null;
  readonly avgPrice: string | null;
  readonly cumExecQty: string | null;
  readonly cumExecValue: string | null;
  readonly marginMode: string | null;
  readonly holdMode: string | null;
  readonly createdTime: string | null;
  readonly updatedTime: string | null;
}

function firstOrderRecord(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = root.data;
  if (Array.isArray(data)) {
    return asRecord(data[0] ?? null);
  }
  const dataRecord = asRecord(data);
  if (!dataRecord) return null;
  if (Array.isArray(dataRecord.list)) {
    return asRecord(dataRecord.list[0] ?? null);
  }
  return dataRecord;
}

/**
 * Normalize GET order-info into safe verification fields. Returns null
 * for unrecognized shapes — never throws, never surfaces raw bodies.
 */
export function normalizeDemoOrderInfo(body: unknown): DemoOrderVerification | null {
  const row = firstOrderRecord(body);
  if (!row) return null;
  const take = (keys: readonly string[]): string | null => {
    for (const key of keys) {
      const value = asString(row[key]);
      if (value !== null) return value;
    }
    return null;
  };
  return {
    orderId: take(["orderId"]),
    clientOid: take(["clientOid"]),
    orderStatus: take(["orderStatus", "status"]),
    symbol: take(["symbol"]),
    side: take(["side"]),
    posSide: take(["posSide", "holdSide"]),
    qty: take(["qty", "size", "orderQty"]),
    avgPrice: take(["avgPrice", "priceAvg", "fillPrice"]),
    cumExecQty: take(["cumExecQty", "fillQty"]),
    cumExecValue: take(["cumExecValue", "fillValue"]),
    marginMode: take(["marginMode"]),
    holdMode: take(["holdMode", "posMode"]),
    createdTime: take(["createdTime", "cTime"]),
    updatedTime: take(["updatedTime", "uTime"]),
  };
}

/** FILLED only on an explicit filled status — never inferred. */
export function isFilledOrderStatus(status: string | null): boolean {
  return status !== null && status.toLowerCase() === "filled";
}
