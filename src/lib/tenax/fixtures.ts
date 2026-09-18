// Tenax Phase 1A — canonical development fixtures.
//
// Simulated portfolio ownership is clearly separated from live Bitget market
// data: every value here is valueSource "fixture" and must be labelled as
// sample/demo data in any future UI.

import type {
  Exposure,
  Mandate,
  MarketEvent,
  ProtectionProposal,
} from "./domain";

export const NVDA_EXPOSURE_FIXTURE: Exposure = {
  id: "exposure-nvda-rnvda-fixture",
  underlying: "NVDA",
  representation: {
    symbol: "RNVDAUSDT",
    provider: "Bitget",
    venue: "Bitget Reality",
    baseCoin: "rNVDA",
    quoteCoin: "USDT",
    category: "SPOT",
    status: "online",
    isReality: true,
    minOrderQty: 0.0001,
    minOrderAmount: 10,
    pricePrecision: 2,
    quantityPrecision: 4,
  },
  exposureValueUsdt: 500,
  valueSource: "fixture",
};

/** Earnings event shell — occursAt stays null (never fabricate a date). */
export const NVDA_EARNINGS_EVENT_FIXTURE: MarketEvent = {
  id: "event-nvda-earnings-fixture",
  type: "EARNINGS",
  underlying: "NVDA",
  occursAt: null,
  source: "fixture",
};

export const MANDATE_FIXTURE: Mandate = {
  allowedUnderlying: "NVDA",
  maxProtectionPct: 30,
  maxTradeValueUsdt: 150,
  leverageAllowed: false,
  approvalRequired: true,
};

/** PASS example: 20% of 500 USDT = 100 USDT. */
export const PROPOSAL_PASS_FIXTURE: ProtectionProposal = {
  underlying: "NVDA",
  protectionPct: 20,
  proposedTradeValueUsdt: 100,
  leverageUsed: false,
};

/** REFUSE A: 200 USDT exceeds the 150 USDT mandate cap. */
export const PROPOSAL_REFUSE_VALUE_FIXTURE: ProtectionProposal = {
  underlying: "NVDA",
  protectionPct: 40,
  proposedTradeValueUsdt: 200,
  leverageUsed: false,
};

/** REFUSE B: 40% exceeds the 30% mandate cap. */
export const PROPOSAL_REFUSE_PCT_FIXTURE: ProtectionProposal = {
  underlying: "NVDA",
  protectionPct: 40,
  proposedTradeValueUsdt: 100,
  leverageUsed: false,
};

/** REFUSE C: underlying not covered by the mandate. */
export const PROPOSAL_REFUSE_ASSET_FIXTURE: ProtectionProposal = {
  underlying: "AAPL",
  protectionPct: 10,
  proposedTradeValueUsdt: 50,
  leverageUsed: false,
};
