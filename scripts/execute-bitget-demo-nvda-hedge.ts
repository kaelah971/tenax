// Tenax Phase 2D-A — guarded BITGET_DEMO NVDA hedge executor (owner-side).
//
// DEMO ONLY. Implements the write path but submits NOTHING without the
// explicit --confirm-demo-order flag. Default behavior is preview-only:
//
//   node scripts/execute-bitget-demo-nvda-hedge.ts
//
// prints the proposed action, fresh leverage/margin reads, derived qty,
// every pre-execution gate, READY / REFUSED, and NO ORDER SUBMITTED.
//
// With explicit confirmation the owner grants human approval in-memory,
// every gate is re-run immediately before POST, and only then is
// POST /api/v3/trade/place-order submitted (Demo, paptrading: 1),
// followed by GET /api/v3/trade/order-info verification. FILLED is
// reported only on an explicit filled status.
//
//   node scripts/execute-bitget-demo-nvda-hedge.ts --confirm-demo-order
//
// Safety contract (do not weaken without owner approval):
// - No confirmation flag => no submission path is reachable at all.
// - No environment variable can trigger execution; only the exact CLI
//   flag confirms, and the actor recorded is the human owner.
// - Tenax never sets leverage: the body carries no marginMode and no
//   leverage; execution runs under the account's configured 1x crossed
//   margin, enforced by the gates.
// - Prints only safe information; every line passes redactSecrets.
//   No credentials, signatures, headers, or raw bodies are ever printed.
// - Shutdown sets process.exitCode and lets the loop drain.
//
// Exit codes: 0 = preview READY, or confirmed submission with completed
// verification; 1 = REFUSED / failed; 2 = configuration refusal.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  extractEnvelopeSafe,
  fetchDemoReadOnly,
  redactSecrets,
} from "../src/lib/bitget/demo-auth.ts";
import {
  BITGET_BASE_URL,
  createDefaultPublicClient,
} from "../src/lib/bitget/reality.ts";
import {
  HEDGE_CATEGORY,
  NVDAUSDT_SYMBOL,
  evaluatePositionProbe,
  normalizeAccountSettings,
  normalizeNvdaInstrument,
  normalizeNvdaTicker,
  type NvdaInstrument,
  type NvdaTicker,
} from "../src/lib/bitget/nvda-hedge.ts";
import { approveProtection, createApprovalRequest } from "../src/lib/tenax/approval.ts";
import {
  DEFAULT_APPROVAL_MAX_AGE_MS,
  previewDemoHedge,
  submitDemoHedgeOrder,
  type DemoHedgeGateInput,
  type DemoHedgeMarketState,
} from "../src/lib/tenax/demo-executor.ts";
import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "../src/lib/tenax/fixtures.ts";
import { evaluateMandate } from "../src/lib/tenax/mandate.ts";

const MODE = "DEMO";
const EXECUTION_MODE = "BITGET_DEMO";
const DEFAULT_BASE_URL = "https://api.bitget.com";
const SUCCESS_CODE = "00000";
const CONFIRM_FLAG = "--confirm-demo-order";
const INTENT_ID = "intent-demo-nvda-hedge";
const POSITION_QUERY = `category=${HEDGE_CATEGORY}&symbol=${NVDAUSDT_SYMBOL}`;

// Owner-verified Tenax action under test: 20% / 100 USDT, 1x. Quantity is
// derived from this notional + fresh rules at runtime — never hardcoded.
const PROPOSAL = {
  underlying: "NVDA",
  protectionPct: 20,
  proposedTradeValueUsdt: 100,
  leverageUsed: 1,
} as const;

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

async function fetchPublicRow<T>(
  path: string,
  normalize: (body: unknown) => T | null,
): Promise<T | null> {
  try {
    const res = await createDefaultPublicClient().getJson(`${BITGET_BASE_URL}${path}`);
    if (res.httpStatus !== 200) return null;
    if (extractEnvelopeSafe(res.body).code !== SUCCESS_CODE) return null;
    return normalize(res.body);
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const env = loadEnv();
  const secrets = [
    env.BITGET_API_KEY ?? "",
    env.BITGET_SECRET_KEY ?? "",
    env.BITGET_PASSPHRASE ?? "",
  ];
  const confirmed = process.argv.includes(CONFIRM_FLAG);

  const baseLines = [
    `mode: ${MODE}`,
    `executionMode: ${EXECUTION_MODE}`,
    `action: SHORT ${NVDAUSDT_SYMBOL} ${HEDGE_CATEGORY} market`,
  ];

  if ((env.BITGET_TRADING_MODE ?? "").trim().toLowerCase() !== "demo") {
    printSafe(
      [
        ...baseLines,
        "verdict: REFUSED",
        "message: refusing: BITGET_TRADING_MODE must be demo for Phase 2D-A",
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
        "verdict: REFUSED",
        `message: missing credentials in environment: ${missing.join(", ")}`,
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
  const nowMs = Date.now();

  // Tenax authority objects: fixture mandate + the approved-shaped action.
  // A REFUSE here fails fast before any market read.
  let approval;
  try {
    const decision = evaluateMandate(PROPOSAL, MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE);
    approval = createApprovalRequest(INTENT_ID, PROPOSAL, decision);
    if (confirmed) {
      // The human owner confirms via the exact CLI flag; recorded as human.
      approval = approveProtection(approval, "human", new Date(nowMs).toISOString());
    }
  } catch (err) {
    printSafe(
      [
        ...baseLines,
        "verdict: REFUSED",
        `message: mandate/approval setup refused (${err instanceof Error ? err.message : String(err)})`,
        "NO ORDER SUBMITTED",
      ],
      secrets,
    );
    return 1;
  }
  const decision = evaluateMandate(PROPOSAL, MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE);

  // Fresh reads for the gates (all read-only; failures refuse honestly).
  const instrument: NvdaInstrument | null = await fetchPublicRow(
    `/api/v3/market/instruments?${POSITION_QUERY}`,
    normalizeNvdaInstrument,
  );
  const ticker: NvdaTicker | null = await fetchPublicRow(
    `/api/v3/market/tickers?${POSITION_QUERY}`,
    normalizeNvdaTicker,
  );
  const positionResult = await fetchDemoReadOnly({
    credentials,
    baseUrl,
    tradingMode: "demo",
    requestPath: "/api/v3/position/current-position",
    queryString: POSITION_QUERY,
  });
  const positionEvaluation = evaluatePositionProbe({
    httpStatus: positionResult.httpStatus,
    body: positionResult.body,
    transportError: positionResult.transportError,
  });
  const settingsResult = await fetchDemoReadOnly({
    credentials,
    baseUrl,
    tradingMode: "demo",
    requestPath: "/api/v3/account/settings",
  });
  const settings =
    settingsResult.transportError === null &&
    settingsResult.httpStatus === 200 &&
    extractEnvelopeSafe(settingsResult.body).code === SUCCESS_CODE
      ? normalizeAccountSettings(settingsResult.body)
      : null;

  const market: DemoHedgeMarketState = {
    category: instrument?.category ?? null,
    symbol: instrument?.symbol ?? null,
    holdMode: settings?.holdMode ?? null,
    nvdaSymbolConfigFound: settings?.nvdaSymbolConfigFound ?? false,
    marginMode: settings?.nvdaMarginMode ?? settings?.marginMode ?? null,
    configuredLeverage: settings?.nvdaLeverage ?? null,
    position:
      positionEvaluation.probe === "PASS" ? positionEvaluation.position : null,
    instrument,
    ticker,
  };

  const gateInput: DemoHedgeGateInput = {
    tradingMode: (env.BITGET_TRADING_MODE ?? "").trim(),
    executionMode: EXECUTION_MODE,
    mandate: MANDATE_FIXTURE,
    proposal: PROPOSAL,
    decision,
    approval,
    market,
    maxApprovalAgeMs: DEFAULT_APPROVAL_MAX_AGE_MS,
    nowMs,
  };

  const lines: string[] = [...baseLines];
  lines.push(`notional: ${PROPOSAL.proposedTradeValueUsdt} USDT`);

  if (!confirmed) {
    // Preview only: this code path cannot submit — submitDemoHedgeOrder
    // is never called here.
    const preview = previewDemoHedge(gateInput);
    lines.push(`qty: ${preview.qty ?? "(unknown)"}`);
    lines.push(
      `approxNotional: ${preview.approxNotional === null ? "(unknown)" : `${preview.approxNotional} USDT`}`,
    );
    lines.push(
      `referencePrice: ${preview.referencePrice === null ? "(unknown)" : `${preview.referencePrice} (${preview.priceSource ?? "unknown"})`}`,
    );
    lines.push(`leverage: ${preview.configuredLeverage ?? "(unknown)"} (configured)`);
    lines.push(`marginMode: ${preview.marginMode ?? "(unknown)"}`);
    preview.gates.forEach((g, i) => {
      lines.push(`gate[${String(i + 1).padStart(2, "0")}/${preview.gates.length} ${g.id}]: ${g.pass ? "PASS" : "FAIL"} — ${g.detail}`);
    });
    lines.push(`verdict: ${preview.ready ? "READY" : "REFUSED"}`);
    lines.push("NO ORDER SUBMITTED");
    printSafe(lines, secrets);
    return preview.ready ? 0 : 1;
  }

  // Confirmed: the executor re-runs every gate immediately before POST.
  const result = await submitDemoHedgeOrder({
    ...gateInput,
    confirmed: true,
    credentials,
    baseUrl,
  });
  for (const [i, g] of result.gates.entries()) {
    lines.push(`gate[${String(i + 1).padStart(2, "0")}/${result.gates.length} ${g.id}]: ${g.pass ? "PASS" : "FAIL"} — ${g.detail}`);
  }
  if (result.outcome === "REFUSED") {
    lines.push("verdict: REFUSED");
    lines.push("NO ORDER SUBMITTED");
    printSafe(lines, secrets);
    return 1;
  }
  if (result.outcome === "SUBMIT_FAILED") {
    lines.push("verdict: SUBMIT_FAILED");
    lines.push(`submitHttpStatus: ${result.httpStatus}`);
    lines.push(`submitReason: ${result.reason}`);
    lines.push("NO POSITION ASSUMED — verify via order query before retrying");
    printSafe(lines, secrets);
    return 1;
  }
  lines.push("verdict: SUBMITTED");
  lines.push(`orderId: ${result.orderId ?? "(missing — see clientOid)"}`);
  lines.push(`clientOid: ${result.clientOid}`);
  lines.push(`orderStatus: ${result.orderStatus ?? "(unknown)"}`);
  lines.push(`filled: ${result.filled ? "YES" : "NOT CONFIRMED"}`);
  if (result.verification) {
    lines.push(`verifySymbol: ${result.verification.symbol ?? "(unknown)"}`);
    lines.push(`verifySide: ${result.verification.side ?? "(unknown)"}`);
    lines.push(`verifyPosSide: ${result.verification.posSide ?? "(unknown)"}`);
    lines.push(`verifyQty: ${result.verification.qty ?? "(unknown)"}`);
    lines.push(`verifyAvgPrice: ${result.verification.avgPrice ?? "(unknown)"}`);
    lines.push(`verifyCumExecQty: ${result.verification.cumExecQty ?? "(unknown)"}`);
  } else {
    lines.push("verification: UNAVAILABLE — order-info did not return a usable record");
  }
  printSafe(lines, secrets);
  return 0;
}

const code = await main();
// Natural event-loop shutdown: never force-exit while fetch handles drain.
process.exitCode = code;
