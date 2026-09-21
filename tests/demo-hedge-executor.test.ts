// Tenax Phase 2D-A — guarded Demo executor tests (offline, no network).
//
// Covers: max-1x mandate semantics (1 PASS, >1 REFUSE, unknown REFUSE),
// all 16 pre-execution gates, derived (never hardcoded) quantities,
// exact market short body, explicit-confirmation gating (no write without
// it), single-endpoint POST restriction, success != filled until
// order-info confirms, and secret-scrubbed owner script.
// Live Demo submission is NEVER exercised here.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  approveProtection,
  createApprovalRequest,
  hashProposal,
  type ProtectionApproval,
} from "../src/lib/tenax/approval";
import {
  DEFAULT_APPROVAL_MAX_AGE_MS,
  evaluateDemoHedgeGates,
  previewDemoHedge,
  submitDemoHedgeOrder,
  type DemoHedgeGateInput,
  type DemoHedgeMarketState,
} from "../src/lib/tenax/demo-executor";
import { MANDATE_FIXTURE, PROPOSAL_PASS_FIXTURE } from "../src/lib/tenax/fixtures";
import { evaluateMandate } from "../src/lib/tenax/mandate";
import {
  mandateSchema,
  protectionProposalSchema,
} from "../src/lib/tenax/schemas";
import type { NvdaInstrument, NvdaTicker } from "../src/lib/bitget/nvda-hedge";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";

const NOW_MS = 1758300000000;
const CREDS = { apiKey: "test-api-key", secretKey: "test-secret-key", passphrase: "test-pass" };

const INSTRUMENT: NvdaInstrument = {
  symbol: "NVDAUSDT",
  category: "USDT-FUTURES",
  status: "online",
  isReality: false,
  baseCoin: "NVDA",
  quoteCoin: "USDT",
  minOrderQty: 0.01,
  maxOrderQty: null,
  minOrderAmount: 5,
  pricePrecision: 2,
  quantityPrecision: 2,
  contractMultiplier: null,
  maxLeverage: 20,
  minLeverage: 1,
};

const TICKER: NvdaTicker = {
  symbol: "NVDAUSDT",
  lastPrice: "200",
  markPrice: "200",
  indexPrice: "200",
  bidPrice: null,
  askPrice: null,
  fundingRate: null,
  updatedAt: null,
};

const MARKET: DemoHedgeMarketState = {
  category: "USDT-FUTURES",
  symbol: "NVDAUSDT",
  holdMode: "hedge_mode",
  nvdaSymbolConfigFound: true,
  marginMode: "crossed",
  configuredLeverage: "1",
  position: { ...EMPTY_NVIDIA_POSITION },
  instrument: INSTRUMENT,
  ticker: TICKER,
};

function makeApproval(proposal = PROPOSAL_PASS_FIXTURE, ageMs = 60_000) {
  const decision = evaluateMandate(proposal, MANDATE_FIXTURE);
  const pending = createApprovalRequest("intent-test", proposal, decision, {
    executionMode: "BITGET_DEMO",
  });
  return {
    decision,
    approval: approveProtection(
      pending,
      "human",
      new Date(NOW_MS - ageMs).toISOString(),
    ),
  };
}

function makeInput(overrides: Partial<DemoHedgeGateInput> = {}): DemoHedgeGateInput {
  const { decision, approval } = makeApproval();
  return {
    tradingMode: "demo",
    executionMode: "BITGET_DEMO",
    mandate: MANDATE_FIXTURE,
    proposal: PROPOSAL_PASS_FIXTURE,
    decision,
    approval,
    market: MARKET,
    maxApprovalAgeMs: DEFAULT_APPROVAL_MAX_AGE_MS,
    nowMs: NOW_MS,
    ...overrides,
  };
}

function failedIds(input: DemoHedgeGateInput): readonly string[] {
  return evaluateDemoHedgeGates(input).failedGateIds;
}

describe("max-1x mandate semantics", () => {
  it("passes 1x leverage", () => {
    const decision = evaluateMandate(PROPOSAL_PASS_FIXTURE, MANDATE_FIXTURE);
    expect(decision.verdict).toBe("PASS");
    expect(decision.checks.find((c) => c.id === "max_leverage")).toMatchObject({ pass: true });
  });

  it("refuses leverage above 1x", () => {
    const decision = evaluateMandate(
      { ...PROPOSAL_PASS_FIXTURE, leverageUsed: 5 },
      MANDATE_FIXTURE,
    );
    expect(decision.verdict).toBe("REFUSE");
    expect(decision.failedRules).toContain("max_leverage");
  });

  it("refuses unknown or non-positive leverage", () => {
    for (const leverageUsed of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      const decision = evaluateMandate(
        { ...PROPOSAL_PASS_FIXTURE, leverageUsed },
        MANDATE_FIXTURE,
      );
      expect(decision.verdict).toBe("REFUSE");
      expect(decision.failedRules).toContain("max_leverage");
    }
  });

  it("validates numeric leverage in schemas", () => {
    expect(() =>
      protectionProposalSchema.parse({ ...PROPOSAL_PASS_FIXTURE, leverageUsed: 1 }),
    ).not.toThrow();
    expect(() =>
      protectionProposalSchema.parse({ ...PROPOSAL_PASS_FIXTURE, leverageUsed: false }),
    ).toThrow();
    expect(() => mandateSchema.parse({ ...MANDATE_FIXTURE, maxLeverage: 1 })).not.toThrow();
    expect(() => mandateSchema.parse({ ...MANDATE_FIXTURE, maxLeverage: 0 })).toThrow();
  });
});

describe("pre-execution gates", () => {
  it("passes all 16 gates for the verified Demo state", () => {
    const report = evaluateDemoHedgeGates(makeInput());
    expect(report.gates).toHaveLength(16);
    expect(report.refused).toBe(false);
    expect(report.failedGateIds).toEqual([]);
  });

  it("refuses live trading mode", () => {
    expect(failedIds(makeInput({ tradingMode: "live" }))).toContain("mode_demo");
    expect(failedIds(makeInput({ tradingMode: "LIVE" }))).toContain("mode_demo");
  });

  it("refuses non-DEMO execution mode", () => {
    expect(failedIds(makeInput({ executionMode: "DRY_RUN" }))).toContain("execution_mode_demo");
  });

  it("requires the exact hedge venue", () => {
    expect(
      failedIds(makeInput({ market: { ...MARKET, category: "SPOT" } })),
    ).toContain("category_match");
    expect(
      failedIds(makeInput({ market: { ...MARKET, symbol: "RNVDAUSDT" } })),
    ).toContain("symbol_match");
  });

  it("requires hedge_mode", () => {
    expect(failedIds(makeInput({ market: { ...MARKET, holdMode: "one_way_mode" } }))).toContain(
      "hold_mode",
    );
    expect(failedIds(makeInput({ market: { ...MARKET, holdMode: null } }))).toContain("hold_mode");
  });

  it("requires the NVDA symbol config", () => {
    expect(
      failedIds(makeInput({ market: { ...MARKET, nvdaSymbolConfigFound: false } })),
    ).toContain("symbol_config");
  });

  it("requires crossed margin", () => {
    expect(failedIds(makeInput({ market: { ...MARKET, marginMode: "isolated" } }))).toContain(
      "margin_crossed",
    );
    expect(failedIds(makeInput({ market: { ...MARKET, marginMode: null } }))).toContain(
      "margin_crossed",
    );
  });

  it("allows configured 1x in any string form but refuses the rest", () => {
    expect(failedIds(makeInput({ market: { ...MARKET, configuredLeverage: "1.0" } }))).toEqual([]);
    expect(failedIds(makeInput({ market: { ...MARKET, configuredLeverage: "5" } }))).toContain(
      "leverage_one",
    );
    expect(failedIds(makeInput({ market: { ...MARKET, configuredLeverage: null } }))).toContain(
      "leverage_one",
    );
    expect(failedIds(makeInput({ market: { ...MARKET, configuredLeverage: "unknown" } }))).toContain(
      "leverage_one",
    );
  });

  it("refuses an unknown position state", () => {
    expect(failedIds(makeInput({ market: { ...MARKET, position: null } }))).toContain(
      "position_understood",
    );
  });

  it("refuses stale or missing market data", () => {
    expect(failedIds(makeInput({ market: { ...MARKET, instrument: null } }))).toContain(
      "market_fresh",
    );
    expect(failedIds(makeInput({ market: { ...MARKET, ticker: null } }))).toContain("market_fresh");
  });

  it("refuses unevaluable sizing", () => {
    const poor = { ...INSTRUMENT, minOrderQty: 1000 };
    expect(
      failedIds(makeInput({ market: { ...MARKET, instrument: poor } })),
    ).toContain("sizing_ok");
  });

  it("refuses a tampered proposal hash", () => {
    const tampered = { ...PROPOSAL_PASS_FIXTURE, proposedTradeValueUsdt: 120 };
    expect(hashProposal(tampered)).not.toBe(hashProposal(PROPOSAL_PASS_FIXTURE));
    expect(failedIds(makeInput({ proposal: tampered }))).toContain("proposal_bound");
  });

  it("refuses a non-PASS mandate decision", () => {
    const bad = {
      ...makeApproval().decision,
      verdict: "REFUSE" as const,
      failedRules: ["max_trade_value" as const],
    };
    expect(failedIds(makeInput({ decision: bad }))).toContain("mandate_pass");
  });

  it("refuses a DRY_RUN-bound approval for Demo execution", () => {
    const decision = evaluateMandate(PROPOSAL_PASS_FIXTURE, MANDATE_FIXTURE);
    const pending = createApprovalRequest("intent-test", PROPOSAL_PASS_FIXTURE, decision, {
      executionMode: "DRY_RUN",
    });
    const approval = approveProtection(pending, "human", new Date(NOW_MS - 60_000).toISOString());
    expect(failedIds(makeInput({ approval }))).toContain("approval_mode");
  });

  it("refuses stale or ungranted approval", () => {
    const { decision } = makeApproval();
    const pending = createApprovalRequest("intent-test", PROPOSAL_PASS_FIXTURE, decision, {
      executionMode: "BITGET_DEMO",
    });
    expect(failedIds(makeInput({ approval: pending })).includes("approval_valid")).toBe(true);
    const { approval } = makeApproval(PROPOSAL_PASS_FIXTURE, DEFAULT_APPROVAL_MAX_AGE_MS + 1);
    expect(failedIds(makeInput({ approval })).includes("approval_valid")).toBe(true);
  });

  it("refuses notional above the mandate cap", () => {
    const big = { ...PROPOSAL_PASS_FIXTURE, proposedTradeValueUsdt: 200 };
    const decision = evaluateMandate(big, MANDATE_FIXTURE);
    expect(decision.verdict).toBe("REFUSE");
    // REFUSE can never enter approval: even a forged APPROVED record for
    // the oversized proposal cannot pass the gates.
    const forced: ProtectionApproval = {
      id: "approval-forged",
      intentId: "intent-test",
      proposalHash: hashProposal(big),
      mandateVerdict: "REFUSE",
      state: "APPROVED",
      actor: "human",
      approvedAt: new Date(NOW_MS).toISOString(),
      executionMode: "BITGET_DEMO",
    };
    const failed = failedIds(makeInput({ proposal: big, decision, approval: forced }));
    expect(failed).toContain("notional_cap");
    expect(failed).toContain("mandate_pass");
  });
});

describe("preview", () => {
  it("derives qty from the proposal and rules, never hardcoded", () => {
    const preview = previewDemoHedge(makeInput());
    expect(preview.ready).toBe(true);
    // 100 USDT / 200 = 0.5 floored to 2dp, formatted to precision.
    expect(preview.qty).toBe("0.50");
    expect(preview.approxNotional).toBe(100);
    expect(preview.referencePrice).toBe(200);
    expect(preview.priceSource).toBe("markPrice");
  });

  it("reports unknown qty when sizing is unevaluable", () => {
    const preview = previewDemoHedge(makeInput({ market: { ...MARKET, ticker: null } }));
    expect(preview.ready).toBe(false);
    expect(preview.qty).toBeNull();
  });
});

describe("guarded submission (injected fetch)", () => {
  const PLACE_OK =
    '{"code":"00000","msg":"success","data":{"orderId":"111","clientOid":"tenax-test-0001"}}';
  const INFO_FILLED =
    '{"code":"00000","data":{"orderId":"111","clientOid":"tenax-test-0001","orderStatus":"filled","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50"}}';
  const INFO_LIVE =
    '{"code":"00000","data":{"orderId":"111","clientOid":"tenax-test-0001","orderStatus":"live","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50"}}';

  function stubFetch(calls: string[], placeBody: string, infoBody: string) {
    return {
      write: async (url: string) => {
        calls.push(`POST ${url}`);
        return { status: 200, text: async () => placeBody };
      },
      read: async (url: string) => {
        calls.push(`GET ${url}`);
        return { status: 200, text: async () => infoBody };
      },
    };
  }

  it("writes nothing without explicit confirmation", async () => {
    const calls: string[] = [];
    const stubs = stubFetch(calls, PLACE_OK, INFO_FILLED);
    const result = await submitDemoHedgeOrder({
      ...makeInput(),
      confirmed: false,
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      writeFetchImpl: stubs.write,
      readFetchImpl: stubs.read,
    });
    expect(result.outcome).toBe("REFUSED");
    if (result.outcome === "REFUSED") {
      expect(result.failedGateIds).toContain("explicit_confirmation");
    }
    expect(calls).toEqual([]);
  });

  it("writes nothing when gates fail, even when confirmed", async () => {
    const calls: string[] = [];
    const stubs = stubFetch(calls, PLACE_OK, INFO_FILLED);
    const result = await submitDemoHedgeOrder({
      ...makeInput({ tradingMode: "live" }),
      confirmed: true,
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      writeFetchImpl: stubs.write,
      readFetchImpl: stubs.read,
    });
    expect(result.outcome).toBe("REFUSED");
    expect(calls).toEqual([]);
  });

  it("submits the exact derived body and confirms FILLED via order-info", async () => {
    const calls: string[] = [];
    const stubs = stubFetch(calls, PLACE_OK, INFO_FILLED);
    let transmitted = "";
    const result = await submitDemoHedgeOrder({
      ...makeInput(),
      confirmed: true,
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      clientOid: "tenax-test-0001",
      writeFetchImpl: async (url, init) => {
        transmitted = init.body;
        return stubs.write(url);
      },
      readFetchImpl: stubs.read,
    });
    expect(result.outcome).toBe("SUBMITTED");
    if (result.outcome !== "SUBMITTED") throw new Error("expected SUBMITTED");
    expect(JSON.parse(transmitted)).toEqual({
      category: "USDT-FUTURES",
      symbol: "NVDAUSDT",
      side: "sell",
      posSide: "short",
      orderType: "market",
      qty: "0.50",
      clientOid: "tenax-test-0001",
    });
    expect(result.orderId).toBe("111");
    expect(result.clientOid).toBe("tenax-test-0001");
    expect(result.orderStatus).toBe("filled");
    expect(result.filled).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("POST https://api.bitget.com/api/v3/trade/place-order");
    expect(calls[1]).toContain("GET https://api.bitget.com/api/v3/trade/order-info");
  });

  it("does NOT call success filled until order-info confirms", async () => {
    const calls: string[] = [];
    const stubs = stubFetch(calls, PLACE_OK, INFO_LIVE);
    const result = await submitDemoHedgeOrder({
      ...makeInput(),
      confirmed: true,
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      clientOid: "tenax-test-0001",
      writeFetchImpl: stubs.write,
      readFetchImpl: stubs.read,
    });
    expect(result.outcome).toBe("SUBMITTED");
    if (result.outcome !== "SUBMITTED") throw new Error("expected SUBMITTED");
    expect(result.orderStatus).toBe("live");
    expect(result.filled).toBe(false);
  });

  it("reports SUBMIT_FAILED honestly on provider rejection", async () => {
    const calls: string[] = [];
    const result = await submitDemoHedgeOrder({
      ...makeInput(),
      confirmed: true,
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      clientOid: "tenax-test-0001",
      writeFetchImpl: async () => ({
        status: 400,
        text: async () => '{"code":"40001","msg":"invalid sign"}',
      }),
      readFetchImpl: async (url: string) => {
        calls.push(url);
        return { status: 200, text: async () => "{}" };
      },
    });
    expect(result.outcome).toBe("SUBMIT_FAILED");
    expect(calls).toEqual([]);
  });

  it("uses only the place-order POST endpoint", async () => {
    const calls: string[] = [];
    const stubs = stubFetch(calls, PLACE_OK, INFO_FILLED);
    await submitDemoHedgeOrder({
      ...makeInput(),
      confirmed: true,
      credentials: CREDS,
      baseUrl: "https://api.bitget.com",
      clientOid: "tenax-test-0001",
      writeFetchImpl: stubs.write,
      readFetchImpl: stubs.read,
    });
    const posts = calls.filter((c) => c.startsWith("POST"));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toBe("POST https://api.bitget.com/api/v3/trade/place-order");
  });
});

describe("owner script stays confirm-gated and secret-safe", () => {
  const scriptSource = readFileSync(
    new URL("../scripts/execute-bitget-demo-nvda-hedge.ts", import.meta.url),
    "utf8",
  );

  it("routes submission exclusively through the guarded executor", () => {
    for (const marker of [
      "--confirm-demo-order",
      "submitDemoHedgeOrder",
      "previewDemoHedge",
      "NO ORDER SUBMITTED",
      "redactSecrets",
    ]) {
      expect(scriptSource).toContain(marker);
    }
  });

  it("contains no raw write surface", () => {
    expect(scriptSource).not.toContain("placeDemoShortOrder");
    expect(scriptSource).not.toContain("fetch(");
    expect(scriptSource).not.toContain('"POST"');
    expect(scriptSource).not.toContain("process.exit(");
    expect(scriptSource).toContain("process.exitCode");
  });

  it("never prints secrets, signatures, headers, or raw bodies", () => {
    for (const fragment of [
      "ACCESS-SIGN",
      "ACCESS-KEY",
      "ACCESS-PASSPHRASE",
      "JSON.stringify",
      "console.log",
    ]) {
      expect(scriptSource).not.toContain(fragment);
    }
  });
});
