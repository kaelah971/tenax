// Tenax Phase 2C — safe one-off NVDAUSDT Demo hedge capability discovery.
//
// STRICTLY READ-ONLY. This script proves whether NVDAUSDT (USDT-FUTURES)
// can serve as Tenax's Bitget Demo hedge instrument later. It places no
// orders, sets no leverage, modifies no account mode or position mode,
// moves no funds, and changes no product behavior.
//
// Probes (public first, then authenticated):
// 1. GET /api/v3/market/instruments?category=USDT-FUTURES&symbol=NVDAUSDT
// 2. GET /api/v3/market/tickers?category=USDT-FUTURES&symbol=NVDAUSDT
// 3. GET /api/v3/position/current-position?category=USDT-FUTURES&symbol=NVDAUSDT
//    HTTP 200 + code 00000 is PASS even with zero positions — an empty
//    response is a successful empty state, never a failure. FAIL only on
//    HTTP failure, non-00000 codes, or explicit permission/auth/network
//    failures. Full safe diagnostics isolate endpoint-specific issues.
// 3b. GET /api/v3/trade/unfilled-orders?category=USDT-FUTURES&symbol=NVDAUSDT
//    (second, independent futures trade-read probe — query only, places,
//    modifies, and cancels nothing; an empty list with code 00000 is PASS)
// 4. GET /api/v3/account/settings (may need UTA mgt read; a missing
//    permission is reported honestly as PERMISSION_UNAVAILABLE and does
//    not fail the whole discovery)
// 5. GET /api/v3/account/pre-set-leverage?...&leverage=1 — conditional
//    read-only preview, run only when the account's margin mode is known
//    from settings. The POST leverage setter and every order endpoint
//    are never called (refused by the shared allowlist).
//
// Reading probes 3 and 3b together:
// - 3b PASS + 3 FAIL => futures UTA trade-read proven; position
//   endpoint-specific issue (diagnose via positionHttpStatus/ApiCode/Message)
// - both FAIL with a permission error => authenticated futures
//   trade-read unavailable
// - both PASS => Phase 2C trade-read path proven
// Overall: PASS requires instrument, ticker, position, futures trade-read,
// and evaluable sizing. Unresolved leverage/margin metadata (including a
// legitimately NOT_RUN preview) yields PARTIAL, never FAIL. FAIL is
// reserved for genuine required-probe failures.
//
// Prints only safe information; every line is scrubbed through
// redactSecrets. Raw provider bodies are never dumped. An absent NVDAUSDT
// listing, an empty position, or missing fields are reported as UNKNOWN /
// NOT_RUN / ABSENT — never guessed, never a recommendation.
//
// Run (from repo root, never commits, never in CI):
//   node scripts/verify-bitget-demo-nvda-hedge.ts
// Exit codes: 0 = overall PASS, 1 = PARTIAL or FAIL, 2 = configuration refusal.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEMO_ACCOUNT_SETTINGS_PATH,
  DEMO_POSITION_CURRENT_PATH,
  DEMO_PRE_SET_LEVERAGE_PATH,
  DEMO_TRADE_UNFILLED_ORDERS_PATH,
  classifyDemoAuthFailure,
  evaluateUtaTradeReadProbe,
  extractEnvelopeSafe,
  fetchDemoReadOnly,
  redactSecrets,
  type DemoAuthFailureKind,
} from "../src/lib/bitget/demo-auth.ts";
import {
  BITGET_BASE_URL,
  createDefaultPublicClient,
} from "../src/lib/bitget/reality.ts";
import {
  HEDGE_CATEGORY,
  HEDGE_TARGET_NOTIONAL_USDT,
  NVDAUSDT_SYMBOL,
  computeHedgeSizing,
  evaluateDiscoveryOverall,
  evaluatePositionProbe,
  normalizeAccountSettings,
  normalizeLeveragePreview,
  normalizeNvdaInstrument,
  normalizeNvdaTicker,
  selectReferencePrice,
  type SettingsProbeOutcome,
} from "../src/lib/bitget/nvda-hedge.ts";

const MODE = "DEMO";
const DEFAULT_BASE_URL = "https://api.bitget.com";
const SUCCESS_CODE = "00000";
const POSITION_QUERY = `category=${HEDGE_CATEGORY}&symbol=${NVDAUSDT_SYMBOL}`;

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

function showString(value: string | null): string {
  return value ?? "(unknown)";
}

function showNumber(value: number | null): string {
  return value === null ? "(unknown)" : String(value);
}

function showBool(value: boolean | null): string {
  if (value === null) return "UNKNOWN";
  return value ? "YES" : "NO";
}

async function main(): Promise<number> {
  const env = loadEnv();
  const secrets = [
    env.BITGET_API_KEY ?? "",
    env.BITGET_SECRET_KEY ?? "",
    env.BITGET_PASSPHRASE ?? "",
  ];

  const baseLines = [`mode: ${MODE}`, `symbol: ${NVDAUSDT_SYMBOL}`, `category: ${HEDGE_CATEGORY}`];

  if ((env.BITGET_TRADING_MODE ?? "").trim().toLowerCase() !== "demo") {
    printSafe(
      [
        ...baseLines,
        "overallDiscovery: FAIL",
        "message: refusing: BITGET_TRADING_MODE must be demo for Phase 2C",
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
        "overallDiscovery: FAIL",
        `message: missing credentials in environment: ${missing.join(", ")}`,
      ],
      secrets,
    );
    return 2;
  }

  const lines: string[] = [...baseLines];
  const publicClient = createDefaultPublicClient();

  // ---- Probe 1: public instrument contract -------------------------------
  let instrumentOutcome: "PASS" | "FAIL" = "FAIL";
  let instrumentFailureKind: DemoAuthFailureKind | "NONE" = "NONE";
  const instrument = await (async () => {
    try {
      const res = await publicClient.getJson(
        `${BITGET_BASE_URL}/api/v3/market/instruments?${POSITION_QUERY}`,
      );
      if (res.httpStatus !== 200) {
        instrumentFailureKind = classifyDemoAuthFailure({ httpStatus: res.httpStatus });
        return null;
      }
      const envelope = extractEnvelopeSafe(res.body);
      const parsed = normalizeNvdaInstrument(res.body);
      if (envelope.code === SUCCESS_CODE && parsed !== null) {
        instrumentOutcome = "PASS";
        return parsed;
      }
      instrumentFailureKind = classifyDemoAuthFailure({
        httpStatus: res.httpStatus,
        bitgetCode: envelope.code,
        message: envelope.msg,
      });
      return parsed;
    } catch (err) {
      instrumentFailureKind = classifyDemoAuthFailure({
        httpStatus: 0,
        transportError: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  })();
  lines.push(`instrumentProbe: ${instrumentOutcome}`);
  lines.push(`instrumentStatus: ${showString(instrument?.status ?? null)}`);
  lines.push(
    `isReality: ${instrument === null || instrument.isReality === null ? "unknown" : instrument.isReality ? "yes" : "no"}`,
  );
  lines.push(`baseCoin: ${showString(instrument?.baseCoin ?? null)}`);
  lines.push(`quoteCoin: ${showString(instrument?.quoteCoin ?? null)}`);
  lines.push(`minOrderQty: ${showNumber(instrument?.minOrderQty ?? null)}`);
  lines.push(`minOrderAmount: ${showNumber(instrument?.minOrderAmount ?? null)}`);
  lines.push(`pricePrecision: ${showNumber(instrument?.pricePrecision ?? null)}`);
  lines.push(`quantityPrecision: ${showNumber(instrument?.quantityPrecision ?? null)}`);
  lines.push(`maxLeverage: ${showNumber(instrument?.maxLeverage ?? null)}`);
  lines.push(`instrumentFailureKind: ${instrumentFailureKind}`);

  // ---- Probe 2: public ticker ---------------------------------------------
  let tickerOutcome: "PASS" | "FAIL" = "FAIL";
  let tickerFailureKind: DemoAuthFailureKind | "NONE" = "NONE";
  const ticker = await (async () => {
    try {
      const res = await publicClient.getJson(
        `${BITGET_BASE_URL}/api/v3/market/tickers?${POSITION_QUERY}`,
      );
      if (res.httpStatus !== 200) {
        tickerFailureKind = classifyDemoAuthFailure({ httpStatus: res.httpStatus });
        return null;
      }
      const envelope = extractEnvelopeSafe(res.body);
      const parsed = normalizeNvdaTicker(res.body);
      if (envelope.code === SUCCESS_CODE && parsed !== null) {
        tickerOutcome = "PASS";
        return parsed;
      }
      tickerFailureKind = classifyDemoAuthFailure({
        httpStatus: res.httpStatus,
        bitgetCode: envelope.code,
        message: envelope.msg,
      });
      return parsed;
    } catch (err) {
      tickerFailureKind = classifyDemoAuthFailure({
        httpStatus: 0,
        transportError: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  })();
  lines.push(`tickerProbe: ${tickerOutcome}`);
  lines.push(`lastPrice: ${showString(ticker?.lastPrice ?? null)}`);
  lines.push(`markPrice: ${showString(ticker?.markPrice ?? null)}`);
  lines.push(`indexPrice: ${showString(ticker?.indexPrice ?? null)}`);
  lines.push(`bidPrice: ${showString(ticker?.bidPrice ?? null)}`);
  lines.push(`askPrice: ${showString(ticker?.askPrice ?? null)}`);
  lines.push(`fundingRate: ${showString(ticker?.fundingRate ?? null)}`);
  lines.push(`tickerFailureKind: ${tickerFailureKind}`);

  const credentials = {
    apiKey: (env.BITGET_API_KEY ?? "").trim(),
    secretKey: (env.BITGET_SECRET_KEY ?? "").trim(),
    passphrase: (env.BITGET_PASSPHRASE ?? "").trim(),
  };
  const baseUrl = (env.BITGET_API_BASE_URL ?? "").trim() || DEFAULT_BASE_URL;

  // ---- Probe 3: authenticated current position (trade read) ----------------
  // HTTP 200 + code 00000 is PASS even with zero positions — an empty
  // response is a successful empty state (currentPosition NONE), never a
  // failure. Full safe diagnostics isolate endpoint-specific issues.
  const positionResult = await fetchDemoReadOnly({
    credentials,
    baseUrl,
    tradingMode: "demo",
    requestPath: DEMO_POSITION_CURRENT_PATH,
    queryString: POSITION_QUERY,
  });
  const positionEvaluation = evaluatePositionProbe(positionResult);
  const positionOutcome = positionEvaluation.probe;
  const positionFailureKind = positionEvaluation.failureKind;
  const positionPresent = positionEvaluation.position.hasPosition;
  const positionSide = positionEvaluation.position.side;
  const positionSize = positionEvaluation.position.size;
  const positionLeverage = positionEvaluation.position.leverage;
  // Envelope details for honest diagnostics (provider message only).
  const positionEnvelope =
    positionResult.transportError !== null ? null : extractEnvelopeSafe(positionResult.body);
  const positionApiCode = positionEnvelope?.code ?? null;
  const positionRawMessage =
    positionResult.transportError !== null
      ? "transport failure reaching Bitget Demo"
      : (positionEnvelope?.msg ?? "").slice(0, 200);
  const positionMessage =
    positionRawMessage.trim() === "" && positionOutcome === "FAIL"
      ? `request not accepted (http ${positionResult.httpStatus})`
      : positionRawMessage;
  lines.push(`tradeReadProbe: ${positionOutcome}`);
  lines.push(`currentPosition: ${positionPresent ? "PRESENT" : "NONE"}`);
  if (positionPresent) {
    lines.push(`positionSide: ${showString(positionSide)}`);
    lines.push(`positionSize: ${showString(positionSize)}`);
    lines.push(`positionLeverage: ${showString(positionLeverage)}`);
  }
  lines.push(`positionHttpStatus: ${positionResult.httpStatus}`);
  lines.push(`positionApiCode: ${positionApiCode ?? "null"}`);
  lines.push(`positionMessage: ${positionMessage === "" ? "(none)" : positionMessage}`);
  lines.push(`positionFailureKind: ${positionFailureKind}`);

  // ---- Probe 3b: authenticated futures open orders (independent read) ------
  // Second trade-read probe on an already-allowlisted path. Query only:
  // places, modifies, and cancels nothing. An empty list with code 00000
  // is PASS. Read alongside probe 3 to isolate position-specific issues.
  const futuresOrdersResult = await fetchDemoReadOnly({
    credentials,
    baseUrl,
    tradingMode: "demo",
    requestPath: DEMO_TRADE_UNFILLED_ORDERS_PATH,
    queryString: POSITION_QUERY,
  });
  const futuresEvaluation = evaluateUtaTradeReadProbe(futuresOrdersResult);
  const futuresEnvelope =
    futuresOrdersResult.transportError !== null
      ? null
      : extractEnvelopeSafe(futuresOrdersResult.body);
  const futuresMessage =
    futuresOrdersResult.transportError !== null
      ? "transport failure reaching Bitget Demo"
      : (futuresEnvelope?.msg ?? "").slice(0, 200);
  lines.push(`futuresTradeReadProbe: ${futuresEvaluation.probe}`);
  lines.push(`futuresTradeReadHttpStatus: ${futuresOrdersResult.httpStatus}`);
  lines.push(`futuresTradeReadApiCode: ${futuresEnvelope?.code ?? "null"}`);
  lines.push(`futuresTradeReadMessage: ${futuresMessage === "" ? "(none)" : futuresMessage}`);
  lines.push(`futuresTradeReadFailureKind: ${futuresEvaluation.failureKind}`);

  // ---- Probe 4: authenticated account settings (UTA mgt read) --------------
  let settingsOutcome: SettingsProbeOutcome = "FAIL";
  let settingsFailureKind: DemoAuthFailureKind | "NONE" = "NONE";
  const settingsResult = await fetchDemoReadOnly({
    credentials,
    baseUrl,
    tradingMode: "demo",
    requestPath: DEMO_ACCOUNT_SETTINGS_PATH,
  });
  let accountMode: string | null = null;
  let accountLevel: string | null = null;
  let holdMode: string | null = null;
  let marginMode: string | null = null;
  let topMarginMode: string | null = null;
  let configuredLeverage: string | null = null;
  let symbolConfigListPresent = false;
  let symbolConfigCount = 0;
  let nvdaConfigFound = false;
  if (settingsResult.transportError !== null) {
    settingsFailureKind = classifyDemoAuthFailure({
      httpStatus: 0,
      transportError: settingsResult.transportError,
    });
  } else {
    const envelope = extractEnvelopeSafe(settingsResult.body);
    const parsed = normalizeAccountSettings(settingsResult.body);
    if (settingsResult.httpStatus === 200 && envelope.code === SUCCESS_CODE && parsed !== null) {
      settingsOutcome = "PASS";
      accountMode = parsed.accountMode;
      accountLevel = parsed.accountLevel;
      holdMode = parsed.holdMode;
      topMarginMode = parsed.marginMode;
      marginMode = parsed.nvdaMarginMode ?? parsed.marginMode;
      configuredLeverage = parsed.nvdaLeverage;
      symbolConfigListPresent = parsed.symbolConfigListPresent;
      symbolConfigCount = parsed.symbolConfigCount;
      nvdaConfigFound = parsed.nvdaSymbolConfigFound;
    } else {
      const kind = classifyDemoAuthFailure({
        httpStatus: settingsResult.httpStatus,
        bitgetCode: envelope.code,
        message: envelope.msg,
      });
      // A missing management permission is honest PARTIAL input, not a
      // reason to fail the whole discovery or to recreate the key.
      settingsOutcome = kind === "PERMISSION_ERROR" ? "PERMISSION_UNAVAILABLE" : "FAIL";
      settingsFailureKind = kind;
    }
  }
  lines.push(`accountSettingsProbe: ${settingsOutcome}`);
  lines.push(`accountMode: ${showString(accountMode)}`);
  lines.push(`accountLevel: ${showString(accountLevel)}`);
  lines.push(`holdMode: ${showString(holdMode)}`);
  lines.push(`marginMode: ${showString(marginMode)}`);
  lines.push(`configuredLeverage: ${showString(configuredLeverage)}`);
  // Structural margin-mode diagnostics: shape facts only, never raw data.
  lines.push(`settingsHasMarginMode: ${topMarginMode === null ? "NO" : "YES"}`);
  lines.push(`symbolConfigList: ${symbolConfigListPresent ? "PRESENT" : "ABSENT"}`);
  lines.push(`symbolConfigCount: ${symbolConfigCount}`);
  lines.push(`nvdaConfig: ${nvdaConfigFound ? "PRESENT" : "ABSENT"}`);
  if (nvdaConfigFound) {
    lines.push(`nvdaSymbol: ${NVDAUSDT_SYMBOL}`);
  }
  lines.push(`settingsFailureKind: ${settingsFailureKind}`);

  // ---- Probe 5: conditional read-only 1x preview ---------------------------
  // Run only with a safely established margin mode; never guess it.
  let previewOutcome: "PASS" | "FAIL" | "NOT_RUN" = "NOT_RUN";
  let previewFailureKind: DemoAuthFailureKind | "NONE" = "NONE";
  let estMaxOpen: string | null = null;
  let requiredMargin: string | null = null;
  let marginChange: string | null = null;
  let previewDetail = "margin mode unavailable — preview not attempted";
  if (marginMode !== null && settingsOutcome === "PASS") {
    const previewQuery = `${POSITION_QUERY}&marginMode=${encodeURIComponent(marginMode)}&leverage=1`;
    const previewResult = await fetchDemoReadOnly({
      credentials,
      baseUrl,
      tradingMode: "demo",
      requestPath: DEMO_PRE_SET_LEVERAGE_PATH,
      queryString: previewQuery,
    });
    if (previewResult.transportError !== null) {
      previewOutcome = "FAIL";
      previewFailureKind = classifyDemoAuthFailure({
        httpStatus: 0,
        transportError: previewResult.transportError,
      });
      previewDetail = "transport failure reaching Bitget Demo";
    } else {
      const envelope = extractEnvelopeSafe(previewResult.body);
      const parsed = normalizeLeveragePreview(previewResult.body);
      if (previewResult.httpStatus === 200 && envelope.code === SUCCESS_CODE && parsed !== null) {
        previewOutcome = "PASS";
        estMaxOpen = parsed.estMaxOpen;
        requiredMargin = parsed.requiredMargin;
        marginChange = parsed.marginChange;
        previewDetail = "";
      } else {
        previewOutcome = "FAIL";
        previewFailureKind = classifyDemoAuthFailure({
          httpStatus: previewResult.httpStatus,
          bitgetCode: envelope.code,
          message: envelope.msg,
        });
        previewDetail = (envelope.msg ?? "").slice(0, 200) || "preview request not accepted";
      }
    }
  }
  lines.push(`oneXPreview: ${previewOutcome}`);
  if (previewOutcome !== "NOT_RUN") {
    lines.push(`estMaxOpen: ${showString(estMaxOpen)}`);
    lines.push(`requiredMargin: ${showString(requiredMargin)}`);
    lines.push(`marginChange: ${showString(marginChange)}`);
    lines.push(`previewFailureKind: ${previewFailureKind}`);
  } else {
    lines.push(`oneXPreviewDetail: ${previewDetail}`);
  }

  // ---- $100 hedge math (mechanical sizing, not a recommendation) ------------
  const reference = ticker ? selectReferencePrice(ticker) : { price: null, source: null };
  const sizing = computeHedgeSizing({
    targetNotional: HEDGE_TARGET_NOTIONAL_USDT,
    referencePrice: reference.price,
    priceSource: reference.source,
    quantityPrecision: instrument?.quantityPrecision ?? null,
    minOrderQty: instrument?.minOrderQty ?? null,
    minOrderAmount: instrument?.minOrderAmount ?? null,
  });
  lines.push(`targetNotional: ${HEDGE_TARGET_NOTIONAL_USDT} USDT`);
  lines.push(
    `referencePrice: ${sizing.referencePrice === null ? "(unknown)" : `${sizing.referencePrice} (${sizing.priceSource ?? "unknown"})`}`,
  );
  lines.push(`rawQty: ${showNumber(sizing.rawQty)}`);
  lines.push(`normalizedQty: ${showNumber(sizing.normalizedQty)}`);
  lines.push(`resultingNotional: ${showNumber(sizing.resultingNotional)}`);
  lines.push(`meetsMinQty: ${showBool(sizing.meetsMinQty)}`);
  lines.push(`meetsMinNotional: ${showBool(sizing.meetsMinNotional)}`);
  lines.push(`instrumentRulesSatisfied: ${sizing.executableByInstrumentRules}`);

  const overall = evaluateDiscoveryOverall({
    instrument: instrumentOutcome,
    ticker: tickerOutcome,
    position: positionOutcome,
    futuresTradeRead: futuresEvaluation.probe,
    sizingEvaluable: sizing.executableByInstrumentRules !== "UNKNOWN",
    settings: settingsOutcome,
  });
  lines.push(`overallDiscovery: ${overall}`);

  printSafe(lines, secrets);
  return overall === "PASS" ? 0 : 1;
}

const code = await main();
// Natural event-loop shutdown: never force-exit while fetch handles drain.
process.exitCode = code;
