// Phase 1B — LIVE contract check for the Reality intelligence layer.
//
// Verifies, against the live public endpoints, that every field the typed
// adapter (src/lib/bitget/reality.ts) requires is still present. This is a
// contract probe, not a unit test: it runs only when invoked manually on a
// network with working DNS.
//
// Safety contract (do not weaken without owner approval):
// - Public GET requests only. No API key, no signature, no auth headers.
// - No order placement/cancel, no Demo/live trading, no authenticated endpoints.
// - Node built-in fetch only. No dependencies.
// - Sequential requests, ~1200ms apart, single attempt each, 15s timeout.
// - Prints a JSON evidence array to stdout (safe to rerun; writes no files).
//
// Rerun: node scripts/spikes/bitget-reality-verify.mjs

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
      headers: { Accept: "application/json", "User-Agent": "tenax-spike-1b" },
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

const has = (obj, key) => obj != null && Object.hasOwn(obj, key);

function rowFor(rows, symbol) {
  if (!Array.isArray(rows)) return null;
  const want = String(symbol).toUpperCase();
  return rows.find((r) => String(r?.symbol ?? "").toUpperCase() === want) ?? null;
}

function firstRecord(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data != null && typeof data === "object" ? data : null;
}

// Each check mirrors a required field of the typed adapter. Missing fields
// are reported (FAIL) rather than thrown, so one drift never hides the rest.
const CHECKS = [
  {
    name: "instruments",
    path: "/api/v3/market/instruments",
    params: { category: "SPOT", symbol: "RNVDAUSDT" },
    check(body) {
      const row = rowFor(body?.data, "RNVDAUSDT");
      if (!row) return { ok: false, detail: "no RNVDAUSDT row" };
      const required = [
        "symbol",
        "category",
        "status",
        "isReality",
        "baseCoin",
        "quoteCoin",
        "minOrderQty",
        "minOrderAmount",
        "pricePrecision",
        "quantityPrecision",
      ];
      const missing = required.filter((k) => !has(row, k));
      return {
        ok: missing.length === 0,
        detail: missing.length === 0 ? "all adapter fields present" : `missing: ${missing.join(",")}`,
      };
    },
  },
  {
    name: "ticker",
    path: "/api/v3/market/tickers",
    params: { category: "SPOT", symbol: "RNVDAUSDT" },
    check(body) {
      const row = rowFor(body?.data, "RNVDAUSDT");
      if (!row) return { ok: false, detail: "no RNVDAUSDT row" };
      const required = ["symbol", "lastPrice", "bid1Price", "ask1Price", "ts"];
      const missing = required.filter((k) => !has(row, k));
      return {
        ok: missing.length === 0,
        detail: missing.length === 0 ? "all adapter fields present" : `missing: ${missing.join(",")}`,
      };
    },
  },
  {
    name: "stock-info",
    path: "/api/v3/reality/market/stock-info",
    params: { symbol: "RNVDAUSDT" },
    check(body) {
      const record = firstRecord(body?.data);
      if (!record) return { ok: false, detail: "empty data" };
      const missing = ["symbol", "code", "tradingPeriod", "weekendTradable"].filter(
        (k) => !has(record, k),
      );
      return {
        ok: missing.length === 0,
        detail: missing.length === 0 ? "mapping + session fields present" : `missing: ${missing.join(",")}`,
      };
    },
  },
  {
    name: "market-states",
    path: "/api/v3/reality/market/states",
    params: {},
    check(body) {
      const data = body?.data != null && typeof body.data === "object" ? body.data : null;
      if (!data || !Array.isArray(data.stateList)) {
        return { ok: false, detail: "stateList is not an array" };
      }
      return { ok: true, detail: `stateList length ${data.stateList.length}` };
    },
  },
  {
    name: "market-calendar",
    path: "/api/v3/reality/market/calendar",
    params: {},
    check(body) {
      const data = body?.data != null && typeof body.data === "object" ? body.data : null;
      if (!data) return { ok: false, detail: "data is not an object" };
      const missing = ["timeZone", "regularConfig", "specificConfig"].filter((k) => !has(data, k));
      return {
        ok: missing.length === 0,
        detail: missing.length === 0 ? "calendar fields present" : `missing: ${missing.join(",")}`,
      };
    },
  },
  {
    name: "earnings-forecast",
    path: "/api/v3/reality/market/earnings-forecast",
    params: { code: "NVDA" },
    check(body) {
      const record = firstRecord(body?.data);
      if (!record) return { ok: false, detail: "empty data" };
      const missing = ["fiscalYear", "publicationDeadline", "isActual", "eps", "revenue"].filter(
        (k) => !has(record, k),
      );
      return {
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? "forecast fields present (context only, never a date)"
            : `missing: ${missing.join(",")}`,
      };
    },
  },
  {
    name: "company-overview",
    path: "/api/v3/reality/market/company-overview",
    params: { code: "NVDA" },
    check(body) {
      const record = firstRecord(body?.data);
      if (!record) return { ok: false, detail: "empty data" };
      return { ok: has(record, "code"), detail: has(record, "code") ? "code present" : "missing: code" };
    },
  },
  {
    name: "valuation-indicators",
    path: "/api/v3/reality/market/valuation-indicators",
    params: { code: "NVDA" },
    check(body) {
      const record = firstRecord(body?.data);
      if (!record) return { ok: false, detail: "empty data" };
      return {
        ok: true,
        detail: `observed keys: ${Object.keys(record).slice(0, 8).join(",")}`,
      };
    },
  },
];

const evidence = [];
for (const item of CHECKS) {
  const startedAt = new Date().toISOString();
  const result = await get(item.path, item.params);
  let verdict = "FAIL";
  let detail = result.transportError ?? `HTTP ${result.httpStatus}`;
  if (!result.transportError && result.httpStatus === 200 && result.body?.code === "00000") {
    try {
      const checked = item.check(result.body);
      verdict = checked.ok ? "PASS" : "FAIL";
      detail = checked.detail;
    } catch (err) {
      detail = `check error: ${String(err?.message ?? err)}`;
    }
  } else if (!result.transportError && result.httpStatus === 200) {
    detail = `Bitget code ${result.body?.code ?? "?"}`;
  }
  evidence.push({
    check: item.name,
    endpoint: `GET ${item.path}`,
    params: item.params,
    timestamp: startedAt,
    credential: "none (public)",
    httpStatus: result.httpStatus,
    bitgetCode: result.body?.code ?? null,
    transportError: result.transportError,
    verdict,
    detail,
  });
  await sleep(GAP_MS);
}

console.log(JSON.stringify(evidence, null, 2));
for (const item of evidence) {
  console.error(`${item.verdict} ${item.check} (${item.detail})`);
}
