// Tenax Phase 4B-B2.5 — post-execution truth and exhausted-mandate UX.
//
// Pins the post-proof UI contracts offline (no network, no orders):
// consumed 1/1 mandates stay visible as EXHAUSTED history with 0/1
// remaining, exhausted mandates can never reactivate, creating a new
// mandate mints a new id/hash, authority copy is contextual (no stale
// human-approval claim, no false standing authorization), the receipt
// protection label is NVDAUSDT, the exhausted→receipt linkage resolves,
// and new UI posts only to Tenax mandate routes (never Bitget).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { EMPTY_NVIDIA_POSITION } from "../src/lib/bitget/nvda-hedge";
import type {
  NvdaInstrument,
  NvdaPosition,
  NvdaTicker,
} from "../src/lib/bitget/nvda-hedge";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { DemoHedgeMarketState } from "../src/lib/tenax/demo-executor";
import {
  __resetStandingMandateCounterForTests,
  activateStandingMandate,
  revokeStandingMandate,
} from "../src/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  consumeStandingMandateExecution,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  findReceiptFlowIdByMandate,
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import {
  currentAuthorityCopy,
} from "../src/app/app/_copy";
import {
  mandateJourney,
} from "../src/app/app/_components/ui";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const CREDS = { apiKey: "test-api-key", secretKey: "test-secret-key", passphrase: "test-pass" };
const NOW = Date.parse("2026-09-21T12:00:00.000Z");

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

const PLACE_OK =
  '{"code":"00000","msg":"success","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo"}}';
const INFO_FILLED =
  '{"code":"00000","data":{"orderId":"demo-oid-111","clientOid":"tenax-flow-echo","orderStatus":"filled","symbol":"NVDAUSDT","side":"sell","posSide":"short","qty":"0.50","avgPrice":"201.5","cumExecQty":"0.50","cumExecValue":"100.75"}}';

function stubFetch(calls: string[]) {
  return {
    write: async (url: string) => {
      calls.push(`POST ${url}`);
      return { status: 200, text: async () => PLACE_OK };
    },
    read: async (url: string) => {
      calls.push(`GET ${url}`);
      return { status: 200, text: async () => INFO_FILLED };
    },
  };
}

function marketWith(position: NvdaPosition | null): DemoHedgeMarketState {
  return {
    category: "USDT-FUTURES",
    symbol: "NVDAUSDT",
    holdMode: "hedge_mode",
    nvdaSymbolConfigFound: true,
    marginMode: "crossed",
    configuredLeverage: "1",
    position,
    instrument: INSTRUMENT,
    ticker: TICKER,
  };
}

let savedTenaxMode: string | undefined;
let savedTradingMode: string | undefined;

beforeEach(() => {
  __resetStandingMandateCounterForTests();
  savedTenaxMode = process.env.TENAX_EXECUTION_MODE;
  savedTradingMode = process.env.BITGET_TRADING_MODE;
  delete process.env.TENAX_EXECUTION_MODE;
  delete process.env.BITGET_TRADING_MODE;
});

afterEach(() => {
  if (savedTenaxMode === undefined) delete process.env.TENAX_EXECUTION_MODE;
  else process.env.TENAX_EXECUTION_MODE = savedTenaxMode;
  if (savedTradingMode === undefined) delete process.env.BITGET_TRADING_MODE;
  else process.env.BITGET_TRADING_MODE = savedTradingMode;
});

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

describe("exhausted mandate lifecycle", () => {
  it("renders a consumed 1/1 mandate as EXHAUSTED with 0/1 remaining", () => {
    const store = createDevStore();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    const activated = activateStandingMandateRecord(store, { id: created.id }, NOW);
    const consumed = consumeStandingMandateExecution(store, { id: created.id });
    expect(consumed.status).toBe("EXHAUSTED");
    expect(consumed.executionCount).toBe(1);
    expect(consumed.policy.maxExecutions).toBe(1);
    expect(consumed.policy.maxExecutions - consumed.executionCount).toBe(0);
    expect(consumed.mandateHash).toBe(activated.mandateHash);
    expect(consumed.activatedAt).toBe(activated.activatedAt);
    expect(store.mandates.get(created.id)?.status).toBe("EXHAUSTED");
  });

  it("never reactivates or revokes an exhausted mandate", () => {
    const store = createDevStore();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: created.id }, NOW);
    const exhausted = consumeStandingMandateExecution(store, { id: created.id });
    expect(() => activateStandingMandate(exhausted, NOW)).toThrow(/only a DRAFT/);
    expect(() => revokeStandingMandate(exhausted, NOW)).toThrow(/only an ACTIVE/);
    expect(() => consumeStandingMandateExecution(store, { id: created.id })).toThrow(
      /exhausted|ACTIVE/,
    );
  });

  it("mints a new id and hash for the replacement mandate", () => {
    const store = createDevStore();
    const first = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    const firstActive = activateStandingMandateRecord(store, { id: first.id }, NOW);
    consumeStandingMandateExecution(store, { id: first.id });
    const second = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW + 1000,
    );
    const secondActive = activateStandingMandateRecord(store, { id: second.id }, NOW + 1000);
    expect(second.id).not.toBe(first.id);
    expect(secondActive.mandateHash).not.toBe(firstActive.mandateHash);
    expect(secondActive.status).toBe("ACTIVE");
  });
});

describe("current authority copy", () => {
  it("says no per-action approval under an active standing mandate", () => {
    const copy = currentAuthorityCopy({ hasActiveMandate: true, hasExhaustedMandate: false });
    expect(copy).toMatchObject({
      term: "Per-action approval",
      value: "NOT REQUIRED WITHIN BOUNDS",
      note: null,
    });
  });

  it("reports exhausted standing authority without claiming authorization", () => {
    const copy = currentAuthorityCopy({ hasActiveMandate: false, hasExhaustedMandate: true });
    expect(copy).toMatchObject({ term: "Standing authority", value: "EXHAUSTED" });
    expect(copy.note ?? "").toMatch(/new mandate/i);
    expect(`${copy.term} ${copy.value} ${copy.note ?? ""}`).not.toMatch(/AUTHORIZED/);
  });

  it("requires human approval with no standing mandate history", () => {
    const copy = currentAuthorityCopy({ hasActiveMandate: false, hasExhaustedMandate: false });
    expect(copy).toMatchObject({ term: "Human approval", value: "REQUIRED" });
  });
});

describe("exhausted mandate to receipt linkage", () => {
  it("returns null when nothing references the mandate", () => {
    const store = createDevStore();
    expect(findReceiptFlowIdByMandate(store, "smand-0001")).toBeNull();
  });

  it("resolves the consumed execution receipt after a 1/1 autonomous proof", async () => {
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    const mandate = activateStandingMandateRecord(
      store,
      {
        id: createStandingMandateRecord(
          store,
          { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
          NOW,
        ).id,
      },
      NOW,
    );
    const stubs = stubFetch([]);
    const result = await runProtectionAgentCycle(
      store,
      { flowId },
      {
        credentials: CREDS,
        baseUrl: "https://api.bitget.com",
        tradingMode: "demo",
        executionMode: "BITGET_DEMO" as const,
        marketReader: async () => marketWith({ ...EMPTY_NVIDIA_POSITION }),
        writeFetchImpl: stubs.write,
        readFetchImpl: stubs.read,
        nowMs: Date.now(),
      },
    );
    expect(result.outcome).toBe("EXECUTED");
    expect(store.mandates.get(mandate.id)?.status).toBe("EXHAUSTED");
    expect(findReceiptFlowIdByMandate(store, mandate.id)).toBe(flowId);
    expect(findReceiptFlowIdByMandate(store, "smand-9999")).toBeNull();
  });

  it("links the exhausted mandate journey to its receipt", () => {
    const links = mandateJourney("flow-9", "flow-9");
    expect(links[0]).toMatchObject({ label: "VIEW RECEIPT", href: "/app/receipts/flow-9" });
    const without = mandateJourney("flow-9");
    expect(without.map((l) => l.label)).not.toContain("VIEW RECEIPT");
  });
});

describe("receipt and mandate surface truth", () => {
  const receiptSource = readFileSync(
    new URL("../src/app/app/receipts/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  const panelSource = readFileSync(
    new URL("../src/app/app/mandate/MandatePanel.tsx", import.meta.url),
    "utf8",
  );
  const mandateSource = readFileSync(
    new URL("../src/app/app/mandate/page.tsx", import.meta.url),
    "utf8",
  );
  const exposureSource = readFileSync(
    new URL("../src/app/app/exposure/nvidia/page.tsx", import.meta.url),
    "utf8",
  );

  it("labels receipt protection as NVDAUSDT, never RNVDAUSDT", () => {
    expect(receiptSource).toContain("PROTECTION · NVIDIA · NVDAUSDT");
    expect(receiptSource).not.toContain("RNVDAUSDT");
  });

  it("keeps the exhausted mandate visible with budget truth and safe actions", () => {
    expect(panelSource).toContain("EXHAUSTED");
    expect(panelSource).toContain("Execution budget consumed");
    expect(panelSource).toContain("CREATE NEW MANDATE");
    expect(panelSource).toContain("VIEW RECEIPT");
    expect(panelSource).toContain("exhaustedReceiptHref");
  });

  it("wires contextual authority and receipt resolution on the mandate page", () => {
    expect(mandateSource).toContain("currentAuthorityCopy");
    expect(mandateSource).toContain("findReceiptFlowIdByMandate");
    expect(mandateSource).toContain("exhaustedReceiptHref");
    expect(mandateSource).not.toContain('"Human approval", MANDATE_FIXTURE');
  });

  it("continues exposure to the latest receipt and the mandate", () => {
    expect(exposureSource).toContain("VIEW LATEST RECEIPT");
    expect(exposureSource).toContain("VIEW MANDATE");
    expect(exposureSource).toContain("latestReceiptFlowId");
  });

  it("posts new mandates only to Tenax routes, never Bitget", () => {
    expect(panelSource).toMatch(/\/api\/mandate\/(create|activate|revoke)/);
    expect(panelSource).not.toMatch(/bitget/i);
    expect(panelSource).not.toContain("place-order");
    expect(panelSource).not.toContain("placeOrder");
  });
});
