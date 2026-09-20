// Tenax Phase 2A — Bitget Demo authenticated read-only helper.
//
// Safety contract (do not weaken without owner approval):
// - Read-only. Exactly seven allowed requests, all GET:
//   GET /api/v3/account/info (account metadata, no permission required)
//   GET /api/v3/trade/unfilled-orders (open-orders query, UTA trade read)
//   GET /api/v3/account/assets (account balances, Phase 2B discovery)
//   GET /api/v3/position/current-position (position query, Phase 2C)
//   GET /api/v3/account/settings (account config query, Phase 2C)
//   GET /api/v3/account/pre-set-leverage (leverage preview query, Phase 2C)
//   GET /api/v3/trade/order-info (post-submission verification, Phase 2D-A).
//   POST capability lives ONLY in demo-trade.ts (place-order exactly).
//   No POST/PUT/PATCH/DELETE here, no order placement/cancel, no leverage
//   changes, no transfers, no withdrawals, no account-settings writes,
//   no fund movements. In particular POST /api/v3/account/set-leverage
//   is never permitted — only its documented GET preview.
// - Credentials are never logged, printed, or embedded in reports.
//   Reports carry only safe fields (codes, permType, permissions).
// - Demo requests send `paptrading: 1`. Live trading is out of scope.
// - DRY_RUN behavior and BITGET_DEMO execution are untouched by Phase 2A.
//
// UTA signing rules (official):
// - Headers: ACCESS-KEY, ACCESS-SIGN, ACCESS-TIMESTAMP,
//   ACCESS-PASSPHRASE, Content-Type: application/json.
// - prehash = timestamp + METHOD.toUpperCase() + requestPath
//   (+ "?" + queryString when non-empty) (+ body when non-empty).
// - ACCESS-SIGN = Base64(HMAC-SHA256(secretKey, prehash)).

import { createHmac } from "node:crypto";

/** The single Phase 2A account-metadata endpoint (no permission required). */
export const DEMO_AUTH_ACCOUNT_INFO_PATH = "/api/v3/account/info" as const;

/** The Phase 2A UTA trade-read probe endpoint (open-orders query only). */
export const DEMO_TRADE_UNFILLED_ORDERS_PATH = "/api/v3/trade/unfilled-orders" as const;

/** The Phase 2B account-assets endpoint (balances query only). */
export const DEMO_ACCOUNT_ASSETS_PATH = "/api/v3/account/assets" as const;

/** The Phase 2C position query endpoint (read-only, UTA trade read). */
export const DEMO_POSITION_CURRENT_PATH = "/api/v3/position/current-position" as const;

/** The Phase 2C account-config query endpoint (read-only, UTA mgt read). */
export const DEMO_ACCOUNT_SETTINGS_PATH = "/api/v3/account/settings" as const;

/**
 * The Phase 2C leverage preview endpoint (GET only).
 * The name contains "set-leverage" but the documented GET endpoint only
 * previews a leverage change and never applies it. The POST setter stays
 * refused by the method guard, the allowlist, and the write-path guard.
 */
export const DEMO_PRE_SET_LEVERAGE_PATH = "/api/v3/account/pre-set-leverage" as const;

/** The Phase 2D-A post-submission verification endpoint (GET order status). */
export const DEMO_TRADE_ORDER_INFO_PATH = "/api/v3/trade/order-info" as const;

/** Demo header name (exact lowercase per Bitget UTA guide). */
export const DEMO_PAPTRADING_HEADER = "paptrading" as const;

/** Exact allowlist for authenticated Demo reads — nothing else may be requested. */
export const READ_ONLY_ALLOWLIST: readonly string[] = [
  DEMO_AUTH_ACCOUNT_INFO_PATH,
  DEMO_TRADE_UNFILLED_ORDERS_PATH,
  DEMO_ACCOUNT_ASSETS_PATH,
  DEMO_POSITION_CURRENT_PATH,
  DEMO_ACCOUNT_SETTINGS_PATH,
  DEMO_PRE_SET_LEVERAGE_PATH,
  DEMO_TRADE_ORDER_INFO_PATH,
];

/**
 * Path fragments that always indicate a state-changing operation.
 * Defense-in-depth behind the exact allowlist: even if the allowlist
 * is extended later, these can never pass the read-only guard.
 */
const WRITE_PATH_FRAGMENTS: readonly string[] = [
  "place-order",
  "cancel-order",
  "batch-order",
  "set-leverage",
  "transfer",
  "withdraw",
  "deposit",
  "sub-account",
  "create-order",
  "amend-order",
];

export type TradingMode = "demo" | "live";

export interface DemoAuthCredentials {
  readonly apiKey: string;
  readonly secretKey: string;
  readonly passphrase: string;
}

export interface UtaSignInput {
  readonly timestamp: string;
  readonly method: string;
  readonly requestPath: string;
  readonly queryString?: string;
  readonly body?: string;
  readonly secretKey: string;
}

/** Build the exact prehash string per official UTA rules. */
export function buildUtaPrehash(input: {
  readonly timestamp: string;
  readonly method: string;
  readonly requestPath: string;
  readonly queryString?: string;
  readonly body?: string;
}): string {
  const method = input.method.toUpperCase();
  const query = (input.queryString ?? "").trim();
  const body = input.body ?? "";
  const queryPart = query === "" ? "" : `?${query}`;
  return `${input.timestamp}${method}${input.requestPath}${queryPart}${body}`;
}

/** Sign a UTA request: Base64(HMAC-SHA256(secretKey, prehash)). */
export function signUtaRequest(input: UtaSignInput): string {
  const prehash = buildUtaPrehash(input);
  return createHmac("sha256", input.secretKey).update(prehash, "utf8").digest("base64");
}

export interface DemoAuthHeadersInput {
  readonly apiKey: string;
  readonly passphrase: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly tradingMode: TradingMode;
}

/**
 * Build the exact UTA header set. `paptrading: 1` is included
 * if and only if tradingMode is "demo". Never logs anything.
 */
export function buildDemoAuthHeaders(input: DemoAuthHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {
    "ACCESS-KEY": input.apiKey,
    "ACCESS-SIGN": input.signature,
    "ACCESS-TIMESTAMP": input.timestamp,
    "ACCESS-PASSPHRASE": input.passphrase,
    "Content-Type": "application/json",
  };
  if (input.tradingMode === "demo") {
    headers[DEMO_PAPTRADING_HEADER] = "1";
  }
  return headers;
}

/** True when a path looks state-changing regardless of HTTP method. */
export function isWritePath(requestPath: string): boolean {
  const lower = requestPath.toLowerCase();
  // Exact carve-out: the documented GET leverage preview shares a name
  // fragment with the POST setter but never mutates state. The setter
  // itself (POST /api/v3/account/set-leverage) stays refused.
  if (lower === DEMO_PRE_SET_LEVERAGE_PATH) return false;
  return WRITE_PATH_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

/**
 * Enforce the authenticated Demo read-only boundary. Throws on anything
 * that is not exactly GET <allowlisted path>. Query strings are never
 * part of the path argument — sign and append them separately. No network,
 * no secrets involved.
 */
export function assertReadOnlyRequest(method: string, requestPath: string): void {
  if (method.toUpperCase() !== "GET") {
    throw new Error(`refused: method ${method} is not read-only (only GET allowed)`);
  }
  if (isWritePath(requestPath)) {
    throw new Error(`refused: path ${requestPath} looks state-changing`);
  }
  if (!(READ_ONLY_ALLOWLIST as readonly string[]).includes(requestPath)) {
    throw new Error(
      `refused: path ${requestPath} is not in the authenticated read-only allowlist`,
    );
  }
}

/**
 * Replace every occurrence of each non-empty secret with "[REDACTED]".
 * Defense-in-depth for every string the verifier prints.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    out = out.split(secret).join("[REDACTED]");
  }
  return out;
}

export type DemoAuthFailureKind =
  | "BAD_CREDENTIALS"
  | "BAD_SIGNATURE"
  | "TIMESTAMP_ERROR"
  | "PERMISSION_ERROR"
  | "DEMO_HEADER_MISMATCH"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "UNKNOWN";

export interface FailureClassificationInput {
  readonly httpStatus: number;
  readonly bitgetCode?: string | null;
  readonly message?: string | null;
  readonly transportError?: string | null;
}

/**
 * Classify an auth failure from safe signals only (status, provider
 * code, provider message). Never receives secrets. Keyword order
 * matters: demo/header mismatch is checked before generic permission
 * wording because provider messages can overlap.
 */
export function classifyDemoAuthFailure(input: FailureClassificationInput): DemoAuthFailureKind {
  if (input.transportError && input.transportError.trim() !== "") {
    return "NETWORK_ERROR";
  }
  if (input.httpStatus >= 500) return "SERVER_ERROR";
  const haystack = `${input.bitgetCode ?? ""} ${input.message ?? ""}`.toLowerCase();
  if (
    haystack.includes("paptrading") ||
    (haystack.includes("demo") &&
      (haystack.includes("header") ||
        haystack.includes("mismatch") ||
        haystack.includes("mode") ||
        haystack.includes("key")))
  ) {
    return "DEMO_HEADER_MISMATCH";
  }
  if (
    haystack.includes("timestamp") ||
    haystack.includes("request time") ||
    haystack.includes("time window") ||
    haystack.includes("expired") ||
    haystack.includes("time diff")
  ) {
    return "TIMESTAMP_ERROR";
  }
  if (haystack.includes("sign")) {
    return "BAD_SIGNATURE";
  }
  if (
    haystack.includes("passphrase") ||
    haystack.includes("api key") ||
    haystack.includes("apikey") ||
    haystack.includes("authentication") ||
    haystack.includes("unauthorized") ||
    haystack.includes("invalid key")
  ) {
    return "BAD_CREDENTIALS";
  }
  if (
    haystack.includes("permission") ||
    haystack.includes("forbidden") ||
    haystack.includes("not allowed") ||
    haystack.includes("no permission")
  ) {
    return "PERMISSION_ERROR";
  }
  if (input.httpStatus === 401) return "BAD_CREDENTIALS";
  if (input.httpStatus === 403) return "PERMISSION_ERROR";
  return "UNKNOWN";
}

/** Safe subset of GET /api/v3/account/info — nothing identifying.
 *
 * Demo responses may omit permission fields entirely. `permissions` is
 * null (and `hasUtaTrade` unknown) unless Bitget explicitly provides a
 * permissions array — an absent field must never be read as "no
 * permission". `permissionMetadata` reports which case applies.
 */
export interface DemoAccountInfoSafe {
  readonly permType: string | null;
  readonly permissions: readonly string[] | null;
  readonly hasUtaTrade: boolean | null;
  readonly permissionMetadata: "AVAILABLE" | "UNAVAILABLE";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Extract only safe metadata fields from an account/info body.
 * Returns null when the shape is unrecognized — never throws,
 * never surfaces userIds, IPs, channels, or timestamps.
 * A missing permissions array yields permissionMetadata UNAVAILABLE
 * with hasUtaTrade unknown (null), never false.
 */
export function extractSafeAccountInfo(body: unknown): DemoAccountInfoSafe | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = asRecord(root.data);
  if (!data) return null;
  const permType = typeof data.permType === "string" ? data.permType : null;
  if (!Array.isArray(data.permissions)) {
    return { permType, permissions: null, hasUtaTrade: null, permissionMetadata: "UNAVAILABLE" };
  }
  const permissions = data.permissions.filter(
    (entry): entry is string => typeof entry === "string",
  );
  return {
    permType,
    permissions,
    hasUtaTrade: permissions.includes("uta_trade"),
    permissionMetadata: "AVAILABLE",
  };
}

export interface BitgetEnvelopeSafe {
  readonly code: string | null;
  readonly msg: string | null;
}

/** Read only the envelope code/message — tolerant of odd shapes. */
export function extractEnvelopeSafe(body: unknown): BitgetEnvelopeSafe {
  const root = asRecord(body);
  if (!root) return { code: null, msg: null };
  return {
    code: typeof root.code === "string" ? root.code : null,
    msg: typeof root.msg === "string" ? root.msg : null,
  };
}

export type FetchImpl = (
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

export interface DemoReadOnlyFetchResult {
  readonly httpStatus: number;
  readonly body: unknown;
  readonly transportError: string | null;
}

/** Kept for the account/info verification path. */
export type DemoAccountInfoFetchResult = DemoReadOnlyFetchResult;

export const DEFAULT_DEMO_AUTH_TIMEOUT_MS = 15_000;

export interface DemoReadOnlyFetchOptions {
  readonly credentials: DemoAuthCredentials;
  readonly baseUrl: string;
  readonly tradingMode: TradingMode;
  readonly requestPath: string;
  readonly queryString?: string;
  readonly fetchImpl?: FetchImpl;
  readonly timeoutMs?: number;
  readonly timestamp?: string;
}

/**
 * Minimal reusable authenticated Demo fetch for allowlisted GET endpoints only.
 * The read-only guard runs before any credential is touched; the query
 * string (when present) is part of both the signature prehash and the URL.
 * Callers own credential loading, reporting, and redaction.
 */
export async function fetchDemoReadOnly(
  options: DemoReadOnlyFetchOptions,
): Promise<DemoReadOnlyFetchResult> {
  const method = "GET";
  assertReadOnlyRequest(method, options.requestPath);

  const query = (options.queryString ?? "").trim();
  const timestamp = options.timestamp ?? String(Date.now());
  const signature = signUtaRequest({
    timestamp,
    method,
    requestPath: options.requestPath,
    queryString: query,
    secretKey: options.credentials.secretKey,
  });
  const headers = buildDemoAuthHeaders({
    apiKey: options.credentials.apiKey,
    passphrase: options.credentials.passphrase,
    timestamp,
    signature,
    tradingMode: options.tradingMode,
  });

  const url =
    `${options.baseUrl.replace(/\/+$/, "")}${options.requestPath}` +
    (query === "" ? "" : `?${query}`);
  const timeoutMs = options.timeoutMs ?? DEFAULT_DEMO_AUTH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const impl: FetchImpl =
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

/**
 * Account/info verification path (preserved from the first passing probe).
 * Delegates to fetchDemoReadOnly with the account metadata endpoint.
 */
export async function fetchDemoAccountInfo(options: {
  readonly credentials: DemoAuthCredentials;
  readonly baseUrl: string;
  readonly tradingMode: TradingMode;
  readonly fetchImpl?: FetchImpl;
  readonly timeoutMs?: number;
  readonly timestamp?: string;
}): Promise<DemoAccountInfoFetchResult> {
  return fetchDemoReadOnly({ ...options, requestPath: DEMO_AUTH_ACCOUNT_INFO_PATH });
}

export type UtaTradeReadProbe = "PASS" | "FAIL";

export interface UtaTradeReadProbeEvaluation {
  readonly probe: UtaTradeReadProbe;
  readonly failureKind: DemoAuthFailureKind | "NONE";
}

const DEMO_TRADE_READ_SUCCESS_CODE = "00000";

/**
 * Interpret the UTA trade-read probe (GET unfilled-orders).
 * HTTP 200 + API code 00000 proves trade-read permission — an empty
 * order list still passes, since no open orders are required.
 * Anything else fails with a normally classified failure kind
 * (explicit permission errors surface as PERMISSION_ERROR).
 */
export function evaluateUtaTradeReadProbe(input: {
  readonly httpStatus: number;
  readonly body: unknown;
  readonly transportError: string | null;
}): UtaTradeReadProbeEvaluation {
  if (input.transportError !== null) {
    return {
      probe: "FAIL",
      failureKind: classifyDemoAuthFailure({
        httpStatus: 0,
        transportError: input.transportError,
      }),
    };
  }
  const envelope = extractEnvelopeSafe(input.body);
  if (input.httpStatus === 200 && envelope.code === DEMO_TRADE_READ_SUCCESS_CODE) {
    return { probe: "PASS", failureKind: "NONE" };
  }
  return {
    probe: "FAIL",
    failureKind: classifyDemoAuthFailure({
      httpStatus: input.httpStatus,
      bitgetCode: envelope.code,
      message: envelope.msg,
    }),
  };
}
