// Tenax Phase 1B — provider-shaped test fixtures (no network).
//
// Every field below was actually observed in the Phase 0A owner-network
// rerun (docs/spike-result.md) or the Phase 0B live ticker probe. Two
// documented exceptions where Phase 0A captured values but not key names:
// - market-states session entries: session names + hours were observed;
//   entry key names were not, so the adapter scans tolerant aliases and the
//   fixture keys below are illustrative carriers for observed VALUES only.
// - market-calendar specificConfig: 3 entries were observed but their
//   internals were not captured; they are opaque entries preserving the
//   observed count without inventing fields.
// - valuation-indicators: key names below were observed live
//   (scripts/spikes/bitget-reality-verify.mjs, 2026-09-18T21:15–21:16Z:
//   date, pb, pbEd, pbPd, pbMrq, pe, peLyr, peTtmEd, plus the Phase 0A-named
//   dividendYieldTtm); sample VALUES are illustrative test data.

export const INSTRUMENTS_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: [
    {
      symbol: "RNVDAUSDT",
      category: "SPOT",
      status: "online",
      isReality: "yes",
      baseCoin: "rNVDA",
      quoteCoin: "USDT",
      minOrderQty: "0.0001",
      minOrderAmount: "10",
      pricePrecision: "2",
      quantityPrecision: "4",
      quotePrecision: "6",
      symbolType: "stock",
    },
  ],
};

export const TICKER_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: [
    {
      category: "SPOT",
      symbol: "RNVDAUSDT",
      ts: "1789763496561",
      lastPrice: "221.57",
      openPrice24h: "218.9997",
      highPrice24h: "222.73",
      lowPrice24h: "219.15",
      ask1Price: "221.54",
      bid1Price: "221.53",
      bid1Size: "38",
      ask1Size: "50",
      price24hPcnt: "0.01174",
      volume24h: "141279759.7127",
      turnover24h: "31280669508.0598",
      platformTurnover24h: "1051115.9647",
    },
  ],
};

export const STOCK_INFO_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: [
    {
      symbol: "RNVDAUSDT",
      code: "NVDA",
      tradingPeriod: ["overnight", "pre_market", "regular", "after_hours"],
      weekendTradable: "yes",
      name: null,
    },
  ],
};

export const MARKET_STATES_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: {
    market: "US",
    daylightType: "standard",
    stateList: [
      { session: "pre_market", hours: "EST 04:00–09:30" },
      { session: "regular", hours: "EST 09:30–16:00" },
    ],
  },
};

export const MARKET_CALENDAR_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: {
    timeZone: "EST",
    regularConfig: ["SATURDAY", "SUNDAY"],
    specificConfig: [{}, {}, {}],
  },
};

export const EARNINGS_FORECAST_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: [
    {
      fiscalYear: 2029,
      publicationDeadline: null,
      isActual: false,
      eps: "25.2300",
      revenue: "1025950.0000",
      currency: "USD",
    },
  ],
};

export const COMPANY_OVERVIEW_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: [
    {
      code: "NVDA",
      name: "Nvidia",
      listingDate: "1999-01-22",
      employees: "42000",
      peRatio: "27.5",
      pbRatio: "23.13",
      high52Week: "241.01",
      low52Week: "162.94",
    },
  ],
};

export const VALUATION_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: [
    {
      date: "2026-09-18",
      pb: "23.13",
      pbEd: "23.10",
      pbPd: "23.05",
      pbMrq: "23.13",
      pe: "27.50",
      peLyr: "27.40",
      peTtmEd: "27.55",
      dividendYieldTtm: "0.0004",
    },
  ],
};

export const PROVIDER_ERROR_PAYLOAD = {
  code: "40001",
  msg: "param error",
  data: null,
};

export const MALFORMED_PAYLOAD = {
  msg: "success",
  data: "not-an-envelope",
};

export const MISSING_ROW_PAYLOAD = {
  code: "00000",
  msg: "success",
  data: [
    {
      symbol: "BTCUSDT",
      category: "SPOT",
      status: "online",
    },
  ],
};

/** Stub HTTP client serving canned payloads per URL path (no network). */
export function stubClientFor(payloads: Record<string, unknown>) {
  const urls: string[] = [];
  return {
    urls,
    async getJson(url: string) {
      urls.push(url);
      const path = new URL(url).pathname;
      if (!(path in payloads)) throw new Error(`transport failure for ${path}`);
      return { httpStatus: 200, body: payloads[path] };
    },
  };
}

export const FULL_PAYLOADS: Record<string, unknown> = {
  "/api/v3/market/instruments": INSTRUMENTS_PAYLOAD,
  "/api/v3/market/tickers": TICKER_PAYLOAD,
  "/api/v3/reality/market/stock-info": STOCK_INFO_PAYLOAD,
  "/api/v3/reality/market/states": MARKET_STATES_PAYLOAD,
  "/api/v3/reality/market/calendar": MARKET_CALENDAR_PAYLOAD,
  "/api/v3/reality/market/earnings-forecast": EARNINGS_FORECAST_PAYLOAD,
  "/api/v3/reality/market/company-overview": COMPANY_OVERVIEW_PAYLOAD,
  "/api/v3/reality/market/valuation-indicators": VALUATION_PAYLOAD,
};
