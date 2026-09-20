// Tenax Phase 2A — safe one-off Bitget UTA Demo authenticated READ-ONLY check.
//
// Safety contract (do not weaken without owner approval):
// - Read-only. Exactly two requests, both GET, via the shared helper
//   (src/lib/bitget/demo-auth.ts), which enforces the allowlist:
//   1. GET /api/v3/account/info (account metadata, no permission required)
//   2. GET /api/v3/trade/unfilled-orders?category=SPOT (open-orders query,
//      the definitive UTA trade-read probe — querying only, no orders placed,
//      none cancelled, nothing modified).
// - No order placement, no trade submission, no fund movement,
//   no account-settings writes.
// - Never prints secrets, passphrases, signatures, or complete auth headers.
//   Every printed line is passed through redactSecrets as defense-in-depth.
// - Demo only: refuses unless BITGET_TRADING_MODE=demo. Requests carry
//   `paptrading: 1` (built by the helper). Live trading is out of scope.
// - This script is a one-off diagnostic. It does not change Tenax UI,
//   DRY_RUN behavior, or BITGET_DEMO execution semantics.
// - Shutdown: sets process.exitCode and lets the event loop drain. Never
//   force-exits while fetch handles may still be closing
//   (a forced exit trips a Windows/Node UV closing-handle assertion).
//
// Run (from repo root, never commits, never in CI):
//   node scripts/verify-bitget-demo-auth.ts
// Credentials come from process env with .env.local as fallback — values
// are never echoed. Exit codes: 0 = account PASS and probe PASS,
// 1 = account FAIL and/or probe FAIL, 2 = configuration refusal.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEMO_AUTH_ACCOUNT_INFO_PATH,
  DEMO_TRADE_UNFILLED_ORDERS_PATH,
  classifyDemoAuthFailure,
  evaluateUtaTradeReadProbe,
  extractEnvelopeSafe,
  extractSafeAccountInfo,
  fetchDemoAccountInfo,
  fetchDemoReadOnly,
  redactSecrets,
  type DemoAuthFailureKind,
} from "../src/lib/bitget/demo-auth.ts";

const MODE = "DEMO";
const METHOD = "GET";
const DEFAULT_BASE_URL = "https://api.bitget.com";
const SUCCESS_CODE = "00000";
const PROBE_QUERY = "category=SPOT";

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") out[key] = value;
  }
  return out;
}

/** process.env wins; .env.local (repo root) is the fallback. Keys only — never logged. */
function loadEnv(): Record<string, string | undefined> {
  let fileEnv: Record<string, string> = {};
  try {
    fileEnv = parseEnvFile(readFileSync(resolve(process.cwd(), ".env.local"), "utf8"));
  } catch {
    fileEnv = {};
  }
  const get = (key: string): string | undefined => process.env[key] ?? fileEnv[key];
  return {
    BITGET_API_KEY: get("BITGET_API_KEY"),
    BITGET_SECRET_KEY: get("BITGET_SECRET_KEY"),
    BITGET_PASSPHRASE: get("BITGET_PASSPHRASE"),
    BITGET_API_BASE_URL: get("BITGET_API_BASE_URL"),
    BITGET_TRADING_MODE: get("BITGET_TRADING_MODE"),
  };
}

function printSafe(lines: readonly string[], secrets: readonly string[]): void {
  for (const line of lines) {
    // Defense-in-depth: every emitted line is scrubbed, then truncated.
    process.stdout.write(`${redactSecrets(line, secrets).slice(0, 500)}\n`);
  }
}

async function main(): Promise<number> {
  const env = loadEnv();
  const secrets = [
    env.BITGET_API_KEY ?? "",
    env.BITGET_SECRET_KEY ?? "",
    env.BITGET_PASSPHRASE ?? "",
  ];

  const baseLines = [
    `mode: ${MODE}`,
    `endpoint: ${METHOD} ${DEMO_AUTH_ACCOUNT_INFO_PATH}`,
    `probeEndpoint: ${METHOD} ${DEMO_TRADE_UNFILLED_ORDERS_PATH}?${PROBE_QUERY}`,
  ];

  if ((env.BITGET_TRADING_MODE ?? "").trim().toLowerCase() !== "demo") {
    printSafe(
      [
        ...baseLines,
        "result: FAIL",
        "httpStatus: 0",
        "apiCode: null",
        "message: refusing: BITGET_TRADING_MODE must be demo for Phase 2A",
        "permissionMetadata: UNAVAILABLE",
        "permType: null",
        "permissions: (unavailable)",
        "hasUtaTrade: unknown",
        "failureKind: DEMO_HEADER_MISMATCH",
        "utaTradeReadProbe: FAIL",
        "probeHttpStatus: 0",
        "probeApiCode: null",
        "probeMessage: (not attempted)",
        "probeFailureKind: DEMO_HEADER_MISMATCH",
      ],
      secrets,
    );
    return 2;
  }

  const missing = ["BITGET_API_KEY", "BITGET_SECRET_KEY", "BITGET_PASSPHRASE"].filter(
    (key) => (env[key] ?? "").trim() === "",
  );
  if (missing.length > 0) {
    // Names only — values are never printed.
    printSafe(
      [
        ...baseLines,
        "result: FAIL",
        "httpStatus: 0",
        "apiCode: null",
        `message: missing credentials in environment: ${missing.join(", ")}`,
        "permissionMetadata: UNAVAILABLE",
        "permType: null",
        "permissions: (unavailable)",
        "hasUtaTrade: unknown",
        "failureKind: BAD_CREDENTIALS",
        "utaTradeReadProbe: FAIL",
        "probeHttpStatus: 0",
        "probeApiCode: null",
        "probeMessage: (not attempted)",
        "probeFailureKind: BAD_CREDENTIALS",
      ],
      secrets,
    );
    return 2;
  }

  const credentials = {
    apiKey: (env.BITGET_API_KEY ?? "").trim(),
    secretKey: (env.BITGET_SECRET_KEY ?? "").trim(),
    passphrase: (env.BITGET_PASSPHRASE ?? "").trim(),
  };
  const baseUrl = (env.BITGET_API_BASE_URL ?? "").trim() || DEFAULT_BASE_URL;

  // Probe 1 (preserved): account metadata. Informational for permissions —
  // Demo may omit permType/permissions entirely, which is reported as
  // UNAVAILABLE rather than inferred as missing permission.
  const account = await fetchDemoAccountInfo({ credentials, baseUrl, tradingMode: "demo" });

  let failureKind: DemoAuthFailureKind | "NONE" = "NONE";
  let outcome: "PASS" | "FAIL" = "FAIL";
  let apiCode: string | null = null;
  let safeMessage = "";
  let permissionMetadata: "AVAILABLE" | "UNAVAILABLE" = "UNAVAILABLE";
  let permType: string | null = null;
  let permissions: readonly string[] | null = null;
  let hasUtaTrade: boolean | null = null;

  if (account.transportError !== null) {
    failureKind = classifyDemoAuthFailure({
      httpStatus: 0,
      transportError: account.transportError,
    });
    safeMessage = "transport failure reaching Bitget Demo";
  } else {
    const envelope = extractEnvelopeSafe(account.body);
    apiCode = envelope.code;
    // Provider message only, truncated; scrubbed on print. Never raw body.
    safeMessage = (envelope.msg ?? "").slice(0, 200);
    const safeInfo = extractSafeAccountInfo(account.body);
    if (account.httpStatus === 200 && apiCode === SUCCESS_CODE && safeInfo !== null) {
      outcome = "PASS";
      failureKind = "NONE";
      permissionMetadata = safeInfo.permissionMetadata;
      permType = safeInfo.permType;
      permissions = safeInfo.permissions;
      hasUtaTrade = safeInfo.hasUtaTrade;
    } else {
      failureKind = classifyDemoAuthFailure({
        httpStatus: account.httpStatus,
        bitgetCode: apiCode,
        message: safeMessage,
      });
      if (safeMessage.trim() === "")
        safeMessage = `request not accepted (http ${account.httpStatus})`;
    }
  }

  // Probe 2 (definitive): open-orders query. HTTP 200 + code 00000 proves
  // UTA trade-read permission even with an empty order list; an explicit
  // permission error proves it unavailable. Read-only — modifies nothing.
  const probe = await fetchDemoReadOnly({
    credentials,
    baseUrl,
    tradingMode: "demo",
    requestPath: DEMO_TRADE_UNFILLED_ORDERS_PATH,
    queryString: PROBE_QUERY,
  });
  const probeEvaluation = evaluateUtaTradeReadProbe(probe);
  const probeEnvelope = probe.transportError !== null ? null : extractEnvelopeSafe(probe.body);
  const probeMessage =
    probe.transportError !== null
      ? "transport failure reaching Bitget Demo"
      : (probeEnvelope?.msg ?? "").slice(0, 200);

  printSafe(
    [
      ...baseLines,
      `result: ${outcome}`,
      `httpStatus: ${account.httpStatus}`,
      `apiCode: ${apiCode ?? "null"}`,
      `message: ${safeMessage === "" ? "(none)" : safeMessage}`,
      `permissionMetadata: ${permissionMetadata}`,
      `permType: ${permType ?? "null"}`,
      `permissions: ${
        permissions === null
          ? "(unavailable)"
          : permissions.length === 0
            ? "(none)"
            : permissions.join(", ")
      }`,
      `hasUtaTrade: ${hasUtaTrade === null ? "unknown" : hasUtaTrade}`,
      `failureKind: ${failureKind}`,
      `utaTradeReadProbe: ${probeEvaluation.probe}`,
      `probeHttpStatus: ${probe.httpStatus}`,
      `probeApiCode: ${probeEnvelope?.code ?? "null"}`,
      `probeMessage: ${probeMessage === "" ? "(none)" : probeMessage}`,
      `probeFailureKind: ${probeEvaluation.failureKind}`,
    ],
    secrets,
  );
  return outcome === "PASS" && probeEvaluation.probe === "PASS" ? 0 : 1;
}

const code = await main();
// Natural event-loop shutdown: never force-exit while fetch handles drain
// (a forced exit trips a Windows libuv closing-handle assertion).
process.exitCode = code;
