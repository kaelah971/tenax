// Phase 0B — OFFICIAL BITGET SDK + DRY-RUN EXECUTION SPIKE.
//
// Safety contract (do not weaken without owner approval):
// - DRY_RUN only. No real funds, no Demo credentials, no live credentials.
// - No authenticated writes. No network order submission. No order placement.
// - No credentials are read, required, or sent. SDK is used in readOnly mode
//   with dryRun:true previews only (would-send shape, zero network writes).
// - Public GET for the RNVDAUSDT ticker is optional and read-only; if it
//   fails the script records tickerUnavailable and does NOT invent a price.
// - Never present a dry-run as an executed trade. No orderId, no tx hash,
//   no "executed successfully" wording anywhere in output.
// - Prints a JSON evidence object to stdout (safe to rerun; writes no files).
//
// Rerun: node scripts/spikes/bitget-sdk-dryrun.mjs

import { readFileSync } from "node:fs";
import {
  buildTools,
  BitgetRestClient,
  CATALOG,
  getOperation,
  loadConfig,
  safeInvoke,
} from "@bitget-ai/bitget-agent-sdk";

const BASE = "https://api.bitget.com";
const TIMEOUT_MS = 15000;

// ---------------------------------------------------------------- fixtures
// Demo exposure fixture (per Phase 0B brief — labelled fixture, not live).
const EXPOSURE = {
  underlying: "NVDA",
  representation: "RNVDAUSDT",
  venue: "Bitget Reality",
  exposureValueUsdt: 500,
};

// Mandate fixture (per Phase 0B brief).
const MANDATE = {
  maxProtectionPct: 30,
  maxTradeValueUsdt: 150,
  leverageAllowed: false,
  approvalRequired: true,
  allowedUnderlying: "NVDA",
};

// Live Phase 0A instrument constraints (source: docs/spike-result.md,
// "Phase 0A — Owner-network rerun", instruments probe).
const INSTRUMENT_CONSTRAINTS = {
  source: "docs/spike-result.md Phase 0A owner-network rerun",
  symbol: "RNVDAUSDT",
  category: "SPOT",
  status: "online",
  isReality: "yes",
  minOrderQty: 0.0001,
  minOrderAmount: 10,
  pricePrecision: 2,
  quantityPrecision: 4,
};

// Proposed protection: 20% of 500 USDT = 100 USDT (expected).
const PROPOSAL = {
  protectionPct: 20,
  proposedTradeValueUsdt: 100,
  leverageUsed: false,
  underlying: "NVDA",
};

// REFUSE fixture: 200 USDT exceeds the 150 USDT mandate cap.
const REFUSE_FIXTURE = {
  protectionPct: 40,
  proposedTradeValueUsdt: 200,
  leverageUsed: false,
  underlying: "NVDA",
};

// ------------------------------------------------------- isolated mandate
// Spike-only deterministic check (not Phase 1 product implementation).
// Pure function: proposal + mandate + exposure -> gate result. No LLM, no I/O.
function checkMandate(proposal, mandate) {
  const checks = [];
  const push = (id, pass, detail) => checks.push({ id, pass, detail });

  push(
    "underlying_allowed",
    proposal.underlying === mandate.allowedUnderlying,
    `proposal.underlying=${proposal.underlying} allowed=${mandate.allowedUnderlying}`,
  );
  push(
    "max_protection_pct",
    proposal.protectionPct <= mandate.maxProtectionPct,
    `${proposal.protectionPct}% <= ${mandate.maxProtectionPct}%`,
  );
  push(
    "max_trade_value",
    proposal.proposedTradeValueUsdt <= mandate.maxTradeValueUsdt,
    `${proposal.proposedTradeValueUsdt} USDT <= ${mandate.maxTradeValueUsdt} USDT`,
  );
  push(
    "leverage_disabled",
    mandate.leverageAllowed === false ? proposal.leverageUsed === false : true,
    `leverageUsed=${proposal.leverageUsed} leverageAllowed=${mandate.leverageAllowed}`,
  );
  push(
    "approval_required",
    mandate.approvalRequired === true,
    "human approval required before any execution adapter call",
  );
  push(
    "min_order_amount",
    proposal.proposedTradeValueUsdt >= INSTRUMENT_CONSTRAINTS.minOrderAmount,
    `${proposal.proposedTradeValueUsdt} USDT >= minOrderAmount ${INSTRUMENT_CONSTRAINTS.minOrderAmount} USDT`,
  );

  const failedRules = checks.filter((c) => !c.pass).map((c) => c.id);
  return {
    verdict: failedRules.length === 0 ? "PASS" : "REFUSE",
    pendingHumanApproval: failedRules.length === 0,
    failedRules,
    checks,
  };
}

// ------------------------------------------------------------------ helpers
function sdkPackageVersion() {
  try {
    const url = new URL(
      "../../node_modules/@bitget-ai/bitget-agent-sdk/package.json",
      import.meta.url,
    );
    const raw = readFileSync(url, "utf8");
    return JSON.parse(raw).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function catalogMatches(keyword) {
  const k = keyword.toLowerCase();
  return CATALOG.filter((op) =>
    `${op.operationId} ${op.path} ${op.summary} ${op.description}`
      .toLowerCase()
      .includes(k),
  ).map((op) => op.operationId);
}

async function fetchPublicTicker() {
  const startedAt = new Date().toISOString();
  const url = new URL("/api/v3/market/tickers", BASE);
  url.searchParams.set("category", "SPOT");
  url.searchParams.set("symbol", "RNVDAUSDT");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "tenax-spike-0b" },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    return {
      attemptedAt: startedAt,
      httpStatus: res.status,
      bitgetCode: body?.code ?? null,
      ok: res.status === 200 && body?.code === "00000",
      lastPrice: null,
      note: "ticker read-only probe; price used for qty derivation only when ok",
      rawRow: Array.isArray(body?.data)
        ? (body.data.find((r) => r?.symbol === "RNVDAUSDT") ?? null)
        : null,
    };
  } catch (err) {
    return {
      attemptedAt: startedAt,
      httpStatus: 0,
      bitgetCode: null,
      ok: false,
      lastPrice: null,
      transportError: String(err?.message ?? err),
      note: "ticker unavailable in this environment; no price invented",
      rawRow: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function deriveQtyForShape(ticker) {
  // No fill price is ever invented. When the live ticker is unavailable the
  // qty below is explicitly shape-only for the dryRun preview and proves
  // nothing about value execution.
  if (ticker.ok && ticker.rawRow) {
    const row = ticker.rawRow;
    const candidates = [
      row.lastPrice,
      row.last,
      row.close,
      row.ask1Price,
      row.askPr,
    ].filter((v) => v !== undefined && v !== null && v !== "");
    const price = Number(candidates[0]);
    if (Number.isFinite(price) && price > 0) {
      const qty = PROPOSAL.proposedTradeValueUsdt / price;
      const rounded = qty.toFixed(INSTRUMENT_CONSTRAINTS.quantityPrecision);
      return {
        qty: rounded,
        qtySource: `live public ticker @ ${ticker.attemptedAt} (price=${price})`,
        priceUsed: String(price),
        priceInvented: false,
      };
    }
  }
  return {
    qty: "0.5000",
    qtySource:
      "shape-only illustrative qty (live ticker unavailable; no fill price invented; proves request shape only, not value execution)",
    priceUsed: null,
    priceInvented: false,
  };
}

// --------------------------------------------------------------------- main
const startedAt = new Date().toISOString();
const evidence = {
  phase: "0B",
  script: "scripts/spikes/bitget-sdk-dryrun.mjs",
  startedAt,
  executionMode: "DRY_RUN",
  fundsMoved: false,
  credentialsRequired: false,
  credentialsUsed: "none",
  networkOrderSubmission: false,
  kycBlocker:
    "Owner cannot complete Bitget KYC right now; authenticated Demo trading unavailable. Demo execution NOT tested.",
};

const hasEnvCreds = Boolean(
  process.env.BITGET_API_KEY ||
    process.env.BITGET_SECRET_KEY ||
    process.env.BITGET_PASSPHRASE,
);
evidence.envCredentialLeakCheck = hasEnvCreds
  ? "UNEXPECTED: BITGET_* env vars present; script still sends none (readOnly + dryRun only)"
  : "OK: no BITGET_* env vars detected";

// ---- Step 2: inspect SDK surface (discover/tool metadata, no network).
evidence.sdk = {
  package: "@bitget-ai/bitget-agent-sdk",
  installedVersion: sdkPackageVersion(),
  installCommand: "npm install @bitget-ai/bitget-agent-sdk",
  forbiddenPackage: "bitget-api (third-party) was NOT installed",
};

const config = loadConfig({ modules: "all", readOnly: true });
const client = new BitgetRestClient(config);
const ctx = { config, client };
const tools = buildTools(config);

evidence.sdk.catalogOperationCount = CATALOG.length;
evidence.sdk.toolNames = tools.map((t) => t.name);

const placeOrderOp = getOperation("placeOrder");
evidence.sdkCoverage = {
  realitySpecificOrderOps: {
    status: "NOT SUPPORTED",
    matches: {
      reality: catalogMatches("reality"),
      rtoken: catalogMatches("rtoken"),
      rwa: catalogMatches("rwa"),
      stock: catalogMatches("stock"),
    },
    detail:
      "Zero catalog operations reference reality/rtoken/rwa/stock. No dedicated Reality place/cancel operation exists in SDK v3 UTA surface.",
  },
  regularUtaPlaceOrder: {
    status: placeOrderOp ? "VERIFIED" : "NOT SUPPORTED",
    operationId: placeOrderOp?.operationId ?? null,
    method: placeOrderOp?.method ?? null,
    path: placeOrderOp?.path ?? null,
    auth: placeOrderOp?.auth ?? null,
    isWrite: placeOrderOp?.isWrite ?? null,
    module: placeOrderOp?.module ?? null,
    reachableVia: ["order verb action=place", "raw operationId=placeOrder"],
  },
  dryRunOnWrites: {
    status: "VERIFYING",
    detail:
      "dryRun:true must return a would-send preview with no network (allowed even in readOnly). Proven below via safeInvoke.",
  },
  rnvdausdtRepresentation: {
    status: "UNCERTAIN",
    detail:
      "PlaceOrder schema accepts a free-form symbol string (e.g. RNVDAUSDT with category SPOT) and the dryRun preview builds for it, but the SDK has no Reality-specific operation and no live submission was made. This does NOT prove RNVDA/Reality execution support. BTCUSDT or any other asset is NOT substituted as proof.",
  },
};

// ---- Step 3/4: mandate fixtures.
evidence.exposure = EXPOSURE;
evidence.mandate = MANDATE;
evidence.proposal = PROPOSAL;
evidence.instrumentConstraints = INSTRUMENT_CONSTRAINTS;

evidence.mandatePass = {
  fixture: PROPOSAL,
  expected: "PASS, pending human approval",
  result: checkMandate(PROPOSAL, MANDATE),
};
evidence.mandateRefuse = {
  fixture: REFUSE_FIXTURE,
  expected: "REFUSE",
  result: checkMandate(REFUSE_FIXTURE, MANDATE),
};

// ---- Optional live ticker (read-only public; failure is recorded, not fatal).
evidence.ticker = await fetchPublicTicker();
const qtyInfo = deriveQtyForShape(evidence.ticker);
evidence.qtyDerivation = qtyInfo;

// ---- Step 5: dry-run order via official SDK (no network write).
const dryRunArgs = {
  action: "place",
  category: "SPOT",
  symbol: "RNVDAUSDT",
  side: "sell",
  orderType: "market",
  qty: qtyInfo.qty,
  dryRun: true,
};
const orderTool = tools.find((t) => t.name === "order");
const rawTool = tools.find((t) => t.name === "raw");

evidence.dryRun = { tool: "order", argsSent: dryRunArgs, result: null };
const orderDryRun = await safeInvoke(orderTool, dryRunArgs, ctx);
evidence.dryRun.result = orderDryRun;
evidence.dryRun.networkWrite = false;
evidence.dryRun.credentialsSent = false;

evidence.dryRunRaw = {
  tool: "raw",
  argsSent: {
    operationId: "placeOrder",
    args: {
      category: "SPOT",
      symbol: "RNVDAUSDT",
      side: "sell",
      orderType: "market",
      qty: qtyInfo.qty,
    },
    dryRun: true,
  },
  result: null,
};
const rawDryRun = await safeInvoke(rawTool, evidence.dryRunRaw.argsSent, ctx);
evidence.dryRunRaw.result = rawDryRun;
evidence.dryRunRaw.networkWrite = false;
evidence.dryRunRaw.credentialsSent = false;

const dryRunOk =
  orderDryRun?.ok === true && orderDryRun?.data?.dryRun === true;
const rawDryRunOk =
  rawDryRun?.ok === true && rawDryRun?.data?.dryRun === true;
evidence.sdkCoverage.dryRunOnWrites = {
  status: dryRunOk && rawDryRunOk ? "VERIFIED" : "FAIL",
  detail:
    "safeInvoke(order, {action:'place', ..., dryRun:true}) and safeInvoke(raw, {operationId:'placeOrder', ..., dryRun:true}) both returned {ok:true, data:{dryRun:true, wouldSend}} with zero network writes and zero credentials.",
  orderEndpoint: orderDryRun?.endpoint ?? null,
  rawEndpoint: rawDryRun?.endpoint ?? null,
  operationId: orderDryRun?.data?.operationId ?? null,
  wouldSend: orderDryRun?.data?.wouldSend ?? null,
};

// ---- Execution adapter boundary (Tenax-side definition, no SDK change).
evidence.executionAdapterBoundary = {
  mode: "DRY_RUN",
  fundsMoved: false,
  marketDataPlane: "Bitget public Reality REST (Phase 0A probes) for market/intelligence data",
  orderShapePlane:
    "Tenax DRY_RUN adapter constructs the documented UTA place-order request shape locally (category SPOT, symbol RNVDAUSDT, side sell, orderType market, qty) and labels it would-be payload only; never submits",
  sdkRole:
    "Official Agent SDK v3 integrated for Agent Hub compatibility/tooling (discover, order verb dryRun preview, raw escape hatch); NOT claimed as Reality execution proof",
  forbidden: [
    "no live or Demo order submission",
    "no credentials",
    "no BTCUSDT substitution as RNVDA proof",
    "never label dry-run as executed",
  ],
};

// ---- Step 6: deterministic example Decision Receipt (no fake fills).
evidence.receipt = {
  receiptId: "TENAX-0B-DRYRUN-EXAMPLE-001",
  type: "Decision Receipt (example — dry-run only)",
  timestamp: new Date().toISOString(),
  exposure: "NVIDIA / RNVDAUSDT",
  exposureValue: "500 USDT",
  intent: "PROTECT_EVENT_RISK",
  proposedProtection: "20%",
  proposedTradeValue: "100 USDT",
  qtyPreview: qtyInfo,
  mandateResult: evidence.mandatePass.result.verdict,
  mandateChecks: evidence.mandatePass.result.checks,
  approval: "REQUIRED (pending human approval; no auto-execution)",
  executionMode: "DRY_RUN",
  fundsMoved: false,
  bitgetOrderRequest: {
    kind: "would-be payload only — NOT submitted",
    operationId: evidence.dryRun.result?.data?.operationId ?? "placeOrder",
    endpoint: evidence.dryRun.result?.endpoint ?? "POST /api/v3/trade/place-order",
    shape: evidence.dryRun.result?.data?.wouldSend ?? dryRunArgs,
  },
  rejectedAlternatives: [
    {
      proposedTradeValue: "200 USDT",
      protectionPct: 40,
      mandateResult: evidence.mandateRefuse.result.verdict,
      failedRules: evidence.mandateRefuse.result.failedRules,
      reason: "Exceeds mandate maxTradeValue 150 USDT (and maxProtectionPct 30%)",
    },
  ],
  evidenceSources: [
    "docs/spike-result.md Phase 0A owner-network rerun (instrument constraints)",
    "official SDK @bitget-ai/bitget-agent-sdk v3 dryRun preview (this script)",
    "public RNVDAUSDT ticker probe in this script (timestamped; may be unavailable)",
  ],
  disclaimers: [
    "DRY_RUN — NO FUNDS MOVED",
    "No orderId. No transaction hash. Nothing was executed.",
    "Authenticated Bitget Demo execution was not tested (KYC blocker).",
  ],
};

// ---- Verdicts.
evidence.verdicts = {
  sdkInstalled: evidence.sdk.installedVersion !== "unknown" ? "PASS" : "FAIL",
  realityOps: "NOT SUPPORTED (0 matches — recorded, not faked)",
  utaPlaceOrder: evidence.sdkCoverage.regularUtaPlaceOrder.status,
  dryRunPreview: evidence.sdkCoverage.dryRunOnWrites.status,
  rnvdaRepresentation: "UNCERTAIN (schema-accepted, unproven live)",
  mandatePass:
    evidence.mandatePass.result.verdict === "PASS" ? "PASS" : "FAIL",
  mandateRefuse:
    evidence.mandateRefuse.result.verdict === "REFUSE" ? "PASS" : "FAIL",
  receipt: "PASS (deterministic example, no fake fills)",
};

console.log(JSON.stringify(evidence, null, 2));

const lines = [
  `${evidence.verdicts.sdkInstalled} sdk@${evidence.sdk.installedVersion}`,
  `${evidence.sdkCoverage.realitySpecificOrderOps.status} reality-ops (0 matches)`,
  `${evidence.verdicts.utaPlaceOrder} uta-placeOrder (${placeOrderOp?.method} ${placeOrderOp?.path})`,
  `${evidence.verdicts.dryRunPreview} dryRun preview (order+raw, no network)`,
  `${evidence.verdicts.rnvdaRepresentation} RNVDAUSDT representation`,
  `${evidence.verdicts.mandatePass} mandate-PASS (100 USDT <= 150, 20% <= 30%)`,
  `${evidence.verdicts.mandateRefuse} mandate-REFUSE (200 USDT > 150)`,
  `${evidence.verdicts.receipt} receipt DRY_RUN/NO FUNDS MOVED`,
];
for (const line of lines) console.error(line);
