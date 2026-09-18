// Phase 0A — ZERO-CREDENTIAL Bitget public Reality data spike.
//
// Safety contract (do not weaken without owner approval):
// - Public GET requests only. No API key, no signature, no auth headers.
// - No order placement/cancel, no Demo/live trading, no authenticated endpoints.
// - Node built-in fetch only. No dependencies.
// - Sequential requests, ~1200ms apart, single attempt each, 15s timeout.
// - Prints a JSON evidence array to stdout (safe to rerun; writes no files).
//
// Rerun: node scripts/spikes/bitget-public.mjs

const BASE = "https://api.bitget.com";
const GAP_MS = 1200;
const TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path, params) {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "tenax-spike-0a" },
      signal: controller.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _nonJson: text.slice(0, 300) };
    }
    return { httpStatus: res.status, body, transportError: null };
  } catch (err) {
    return { httpStatus: 0, body: null, transportError: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

// Truncate unknown shapes so evidence stays small (arrays -> first 2 items).
function summarize(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  if (Array.isArray(value)) {
    return depth >= 2
      ? `[${value.length} items]`
      : { length: value.length, sample: value.slice(0, 2).map((v) => summarize(v, depth + 1)) };
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = summarize(v, depth + 1);
    return out;
  }
  return value;
}

function pickRow(rows, symbol) {
  if (!Array.isArray(rows)) return null;
  const want = String(symbol).toUpperCase();
  return rows.find((r) => String(r?.symbol ?? "").toUpperCase() === want) ?? null;
}

function pickFields(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj != null && Object.hasOwn(obj, key)) out[key] = obj[key];
  }
  return out;
}

const PROBES = [
  {
    name: "instruments",
    path: "/api/v3/market/instruments",
    params: { category: "SPOT", symbol: "RNVDAUSDT" },
    proves: "Canonical RNVDA symbol, tradeable status, and sizing constraints for the exposure adapter.",
    extract(body) {
      const row = pickRow(body?.data, "RNVDAUSDT");
      return {
        rowFound: row !== null,
        fields: row
          ? pickFields(row, [
              "symbol",
              "category",
              "status",
              "isReality",
              "isRwa",
              "baseCoin",
              "quoteCoin",
              "minOrderQty",
              "minOrderAmount",
              "pricePrecision",
              "quantityPrecision",
              "quotePrecision",
              "symbolType",
              "maintainTime",
            ])
          : null,
      };
    },
  },
  {
    name: "ticker",
    path: "/api/v3/market/tickers",
    params: { category: "SPOT", symbol: "RNVDAUSDT" },
    proves: "Whether a live public ticker exists for RNVDA (market-state input).",
    extract(body) {
      const row = pickRow(body?.data, "RNVDAUSDT");
      return {
        rowFound: row !== null,
        observedKeys: row ? Object.keys(row) : [],
        fields: row
          ? pickFields(row, [
              "symbol",
              "last",
              "lastPr",
              "high24h",
              "low24h",
              "bidPr",
              "askPr",
              "baseVolume",
              "quoteVolume",
              "open",
              "close",
              "ts",
            ])
          : null,
      };
    },
  },
  {
    name: "stock-info",
    path: "/api/v3/reality/market/stock-info",
    params: { symbol: "RNVDAUSDT" },
    proves: "Reality symbol -> underlying stock mapping plus session metadata.",
    extract(body) {
      const data = Array.isArray(body?.data) ? body.data[0] : body?.data;
      return {
        observedKeys: data && typeof data === "object" ? Object.keys(data) : [],
        fields: pickFields(data, [
          "symbol",
          "stockCode",
          "code",
          "companyName",
          "name",
          "tradingPeriod",
          "weekendTradable",
          "market",
        ]),
      };
    },
  },
  {
    name: "market-states",
    path: "/api/v3/reality/market/states",
    params: {},
    proves: "US market/session state source for event-risk analysis.",
    extract(body) {
      return { shape: summarize(body?.data) };
    },
  },
  {
    name: "market-calendar",
    path: "/api/v3/reality/market/calendar",
    params: {},
    proves: "US market holiday/closure context source.",
    extract(body) {
      const data = body?.data;
      return {
        fields: pickFields(data, ["timeZone", "timezone", "regularConfig", "specificConfig"]),
        shape: summarize(data),
      };
    },
  },
  {
    name: "earnings-forecast",
    path: "/api/v3/reality/market/earnings-forecast",
    params: { code: "NVDA" },
    proves:
      "Forecast/fundamental context only. publicationDeadline is NOT the confirmed earnings date.",
    extract(body) {
      const data = Array.isArray(body?.data) ? body.data[0] : body?.data;
      return {
        observedKeys: data && typeof data === "object" ? Object.keys(data) : [],
        fields: pickFields(data, [
          "fiscalYear",
          "publicationDeadline",
          "isActual",
          "eps",
          "revenue",
          "ebit",
          "netIncomeParent",
          "currency",
        ]),
      };
    },
  },
  {
    name: "company-overview",
    path: "/api/v3/reality/market/company-overview",
    params: { code: "NVDA" },
    proves: "Optional: confirms the NVDA underlying mapping with company context.",
    extract(body) {
      const data = Array.isArray(body?.data) ? body.data[0] : body?.data;
      return {
        observedKeys: data && typeof data === "object" ? Object.keys(data) : [],
        shape: summarize(data),
      };
    },
  },
  {
    name: "valuation-indicators",
    path: "/api/v3/reality/market/valuation-indicators",
    params: { code: "NVDA" },
    proves: "Optional: fundamental context for event-risk analysis.",
    extract(body) {
      const data = Array.isArray(body?.data) ? body.data[0] : body?.data;
      return {
        observedKeys: data && typeof data === "object" ? Object.keys(data) : [],
        shape: summarize(data),
      };
    },
  },
];

function verdictFor(result, extracted) {
  if (result.transportError || result.httpStatus === 0) return "FAIL";
  if (result.httpStatus === 401 || result.httpStatus === 403) return "FAIL";
  if (result.httpStatus !== 200) return "FAIL";
  if (result.body?.code !== "00000") return "FAIL";
  if (extracted && Object.hasOwn(extracted, "rowFound")) {
    return extracted.rowFound ? "PASS" : "FAIL";
  }
  return "PASS";
}

const evidence = [];
for (const probe of PROBES) {
  const startedAt = new Date().toISOString();
  const result = await get(probe.path, probe.params);
  const extracted = result.body?.code === "00000" ? probe.extract(result.body) : null;
  evidence.push({
    probe: probe.name,
    endpoint: `GET ${probe.path}`,
    params: probe.params,
    timestamp: startedAt,
    credential: "none (public)",
    httpStatus: result.httpStatus,
    bitgetCode: result.body?.code ?? null,
    bitgetMsg: typeof result.body?.msg === "string" ? result.body.msg : null,
    transportError: result.transportError,
    verdict: verdictFor(result, extracted),
    proves: probe.proves,
    result: extracted ?? summarize(result.body)?.data ?? null,
  });
  await sleep(GAP_MS);
}

console.log(JSON.stringify(evidence, null, 2));
for (const item of evidence) {
  console.error(
    `${item.verdict} ${item.probe} (HTTP ${item.httpStatus}, code ${item.bitgetCode ?? "-"})`,
  );
}
