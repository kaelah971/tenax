// Tenax Phase 2B — safe one-off Bitget Demo account-assets discovery.
//
// Safety contract (do not weaken without owner approval):
// - Read-only. Exactly one request: GET /api/v3/account/assets via the
//   shared helper (src/lib/bitget/demo-auth.ts), which enforces the
//   allowlist. No order placement, no cancellation, no fund movement,
//   no account-settings writes.
// - Never prints secrets, passphrases, signatures, or complete auth headers.
//   Every printed line is passed through redactSecrets as defense-in-depth.
// - Sanitized balances only (coin + decimal strings). The raw provider
//   response is never dumped.
// - An absent rNVDA is reported honestly as ABSENT. Nothing is fabricated
//   into an exposure.
// - Demo only: refuses unless BITGET_TRADING_MODE=demo. Requests carry
//   `paptrading: 1` (built by the helper). Live trading is out of scope.
// - This script is a one-off diagnostic. It does not change Tenax UI,
//   DRY_RUN behavior, or execution semantics. Nothing here is wired into
//   the product yet (discovery/verification first).
// - Shutdown: sets process.exitCode and lets the event loop drain; never
//   force-exits while fetch handles may still be closing.
//
// Run (from repo root, never commits, never in CI):
//   node scripts/verify-bitget-demo-assets.ts
// Credentials come from process env with .env.local as fallback — values
// are never echoed. Exit codes: 0 = PASS, 1 = FAIL, 2 = configuration refusal.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEMO_ACCOUNT_ASSETS_PATH,
  classifyDemoAuthFailure,
  extractEnvelopeSafe,
  fetchDemoReadOnly,
  redactSecrets,
  type DemoAuthFailureKind,
} from "../src/lib/bitget/demo-auth.ts";
import { normalizeAccountAssets } from "../src/lib/bitget/demo-assets.ts";

const MODE = "DEMO";
const METHOD = "GET";
const DEFAULT_BASE_URL = "https://api.bitget.com";
const SUCCESS_CODE = "00000";
const MAX_PRINTED_ASSETS = 100;

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

function formatAmount(value: string | null): string {
  return value ?? "-";
}

async function main(): Promise<number> {
  const env = loadEnv();
  const secrets = [
    env.BITGET_API_KEY ?? "",
    env.BITGET_SECRET_KEY ?? "",
    env.BITGET_PASSPHRASE ?? "",
  ];

  const baseLines = [`mode: ${MODE}`, `endpoint: ${METHOD} ${DEMO_ACCOUNT_ASSETS_PATH}`];

  if ((env.BITGET_TRADING_MODE ?? "").trim().toLowerCase() !== "demo") {
    printSafe(
      [
        ...baseLines,
        "result: FAIL",
        "httpStatus: 0",
        "apiCode: null",
        "message: refusing: BITGET_TRADING_MODE must be demo for Phase 2B",
        "failureKind: DEMO_HEADER_MISMATCH",
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
        "failureKind: BAD_CREDENTIALS",
      ],
      secrets,
    );
    return 2;
  }

  const result = await fetchDemoReadOnly({
    credentials: {
      apiKey: (env.BITGET_API_KEY ?? "").trim(),
      secretKey: (env.BITGET_SECRET_KEY ?? "").trim(),
      passphrase: (env.BITGET_PASSPHRASE ?? "").trim(),
    },
    baseUrl: (env.BITGET_API_BASE_URL ?? "").trim() || DEFAULT_BASE_URL,
    tradingMode: "demo",
    requestPath: DEMO_ACCOUNT_ASSETS_PATH,
  });

  let failureKind: DemoAuthFailureKind | "NONE" = "NONE";
  let outcome: "PASS" | "FAIL" = "FAIL";
  let apiCode: string | null = null;
  let safeMessage = "";
  const reportLines: string[] = [];

  if (result.transportError !== null) {
    failureKind = classifyDemoAuthFailure({
      httpStatus: 0,
      transportError: result.transportError,
    });
    safeMessage = "transport failure reaching Bitget Demo";
  } else {
    const envelope = extractEnvelopeSafe(result.body);
    apiCode = envelope.code;
    // Provider message only, truncated; scrubbed on print. Never raw body.
    safeMessage = (envelope.msg ?? "").slice(0, 200);
    const normalized = normalizeAccountAssets(result.body);
    if (result.httpStatus === 200 && apiCode === SUCCESS_CODE && normalized !== null) {
      outcome = "PASS";
      failureKind = "NONE";
      const sorted = [...normalized.assets].sort((a, b) => a.coin.localeCompare(b.coin));
      const nonZero = sorted.filter((asset) => asset.isNonZero);
      const nvdaNonZero = sorted.filter((asset) => asset.isNvdaRelated && asset.isNonZero);
      const nvdaZero = sorted.filter((asset) => asset.isNvdaRelated && !asset.isNonZero);
      const usdt = sorted.find((asset) => asset.coin === "USDT") ?? null;

      reportLines.push(`assetCount: ${sorted.length}`);
      reportLines.push(`nonZeroAssetCount: ${nonZero.length}`);
      reportLines.push(`skippedRows: ${normalized.skipped}`);
      const shown = nonZero.slice(0, MAX_PRINTED_ASSETS);
      if (shown.length === 0) {
        reportLines.push("assets: (none with non-zero balance)");
      } else {
        for (const asset of shown) {
          const flags = `${asset.isRealityAsset ? " [REALITY]" : ""}${asset.isNvdaRelated ? " [NVDA]" : ""}`;
          reportLines.push(
            `asset: ${asset.coin} available=${formatAmount(asset.available)} frozen=${formatAmount(asset.frozen)} equity=${formatAmount(asset.equity)} usd=${formatAmount(asset.usdValue)}${flags}`,
          );
        }
        if (nonZero.length > shown.length) {
          reportLines.push(`assetsTruncated: ${nonZero.length - shown.length} more not shown`);
        }
      }
      if (nvdaNonZero.length > 0) {
        reportLines.push(
          `rnvdaExposure: PRESENT (${nvdaNonZero.map((asset) => asset.coin).join(", ")})`,
        );
      } else if (nvdaZero.length > 0) {
        reportLines.push(
          `rnvdaExposure: ABSENT (${nvdaZero.map((asset) => asset.coin).join(", ")} listed with zero balance)`,
        );
      } else {
        reportLines.push("rnvdaExposure: ABSENT (no NVDA-related Reality exposure found)");
      }
      reportLines.push(
        `usdtBalance: ${usdt === null ? "(absent)" : (usdt.available ?? usdt.equity ?? "(absent)")}`,
      );
    } else {
      failureKind = classifyDemoAuthFailure({
        httpStatus: result.httpStatus,
        bitgetCode: apiCode,
        message: safeMessage,
      });
      if (safeMessage.trim() === "")
        safeMessage = `request not accepted (http ${result.httpStatus})`;
      if (normalized === null && result.httpStatus === 200 && apiCode === SUCCESS_CODE) {
        safeMessage = "unrecognized account-assets shape (no balances parsed)";
        failureKind = "UNKNOWN";
      }
    }
  }

  printSafe(
    [
      ...baseLines,
      `result: ${outcome}`,
      `httpStatus: ${result.httpStatus}`,
      `apiCode: ${apiCode ?? "null"}`,
      `message: ${safeMessage === "" ? "(none)" : safeMessage}`,
      ...reportLines,
      `failureKind: ${failureKind}`,
    ],
    secrets,
  );
  return outcome === "PASS" ? 0 : 1;
}

const code = await main();
// Natural event-loop shutdown: never force-exit while fetch handles drain.
process.exitCode = code;
