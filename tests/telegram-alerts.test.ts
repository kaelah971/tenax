// Tenax Phase 4B-B5.2 — Telegram alert tests (offline, no network).
//
// Every provider touch is an injected fake fetch: no real Telegram
// message is ever sent here, and no Bitget paths are exercised. Tests
// prove eligibility, honest structured copy, absolute deep links,
// deterministic idempotency, isolated failure, secret-free records,
// origin validation, and the explicit-POST test/retry routes.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ActivityEvent } from "../src/lib/tenax/activity";
import type { DecisionReceipt } from "../src/lib/tenax/domain";
import type { TenaxDevStore } from "../src/lib/tenax/dev-store";
import type { ProtectionFlow } from "../src/lib/tenax/orchestrator";
import type { Notification } from "../src/lib/tenax/notifications";
import {
  __resetActivityCounterForTests,
  __resetStandingMandateCounterForTests,
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  emitActivityEvent,
  notifyForActivityEvent,
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import {
  buildTelegramMessage,
  normalizeAppOrigin,
  readTelegramConfig,
  sendTelegramMessage,
  telegramConfigStatus,
  type TelegramFetchImpl,
} from "../src/lib/telegram/client";
import {
  dispatchTelegramForNotification,
  getTelegramDelivery,
  isTelegramEligible,
  listTelegramDeliveries,
  retryTelegramDelivery,
  telegramDeliveryKey,
} from "../src/lib/telegram/delivery";
import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const NOW = Date.parse("2026-09-21T12:00:00.000Z");

const TG_ENV = {
  TELEGRAM_BOT_TOKEN: "tok-SECRET-xyz",
  TENAX_TELEGRAM_CHAT_ID: "chat-SECRET-123",
  TENAX_APP_ORIGIN: "https://tenax.example",
};

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  __resetActivityCounterForTests();
  __resetStandingMandateCounterForTests();
  savedEnv = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TENAX_TELEGRAM_CHAT_ID: process.env.TENAX_TELEGRAM_CHAT_ID,
    TENAX_APP_ORIGIN: process.env.TENAX_APP_ORIGIN,
    TENAX_EXECUTION_MODE: process.env.TENAX_EXECUTION_MODE,
    BITGET_TRADING_MODE: process.env.BITGET_TRADING_MODE,
  };
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TENAX_TELEGRAM_CHAT_ID;
  delete process.env.TENAX_APP_ORIGIN;
  delete process.env.TENAX_EXECUTION_MODE;
  delete process.env.BITGET_TRADING_MODE;
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

interface CapturedCall {
  readonly url: string;
  readonly body: string;
}

function fakeTelegramFetch(
  calls: CapturedCall[],
  respond: (body: Record<string, unknown>) => { status: number; text: string },
): TelegramFetchImpl {
  return async (url, init) => {
    calls.push({ url, body: init.body });
    const { status, text } = respond(JSON.parse(init.body) as Record<string, unknown>);
    return { status, text: async () => text };
  };
}

function successFetch(calls: CapturedCall[], messageId = 42): TelegramFetchImpl {
  return fakeTelegramFetch(calls, () => ({
    status: 200,
    text: JSON.stringify({ ok: true, result: { message_id: messageId } }),
  }));
}

function emit(
  store: TenaxDevStore,
  type: ActivityEvent["type"],
  flowId = "flow-0001",
  extra: Partial<ActivityEvent> = {},
): ActivityEvent {
  return emitActivityEvent(
    store,
    { type, flowId, summary: `test ${type}`, ...extra },
    NOW,
  );
}

function notified(
  store: TenaxDevStore,
  type: ActivityEvent["type"],
  flowId = "flow-0001",
  extra: Partial<ActivityEvent> = {},
): Notification {
  const notification = notifyForActivityEvent(store, emit(store, type, flowId, extra));
  if (!notification) throw new Error(`expected a notification for ${type}`);
  return notification;
}

/** Seat a fake receipt-bearing flow for filled-message tests. */
function seatReceiptFlow(store: TenaxDevStore, flowId: string, receipt: Partial<DecisionReceipt>) {
  const base = {
    receiptId: `TENAX-1C-${flowId}`,
    timestamp: new Date(NOW).toISOString(),
    underlying: "NVDA",
    representation: "RNVDAUSDT",
    exposureValueUsdt: 500,
    intent: "PROTECT",
    proposedProtectionPct: 20,
    proposedTradeValueUsdt: 100,
    mandateResult: "PASS",
    mandateChecks: [],
    approval: "NOT_REQUIRED",
    fundsMoved: false,
    request: { operationId: "test", mode: "DRY_RUN" },
    rejectedAlternatives: [],
    evidenceRefs: [],
    ...receipt,
  };
  store.flows.set(flowId, { getReceipt: () => base } as unknown as ProtectionFlow);
}

describe("configuration", () => {
  it("reports missing config and sends zero network without env", async () => {
    expect(telegramConfigStatus({})).toBe("MISSING");
    expect(readTelegramConfig({})).toBeNull();
    const store = createDevStore();
    const notification = notified(store, "STANDING_AUTHORITY_ESCALATED");
    const calls: CapturedCall[] = [];
    const delivery = await dispatchTelegramForNotification(store, notification, {
      fetchImpl: successFetch(calls),
    });
    expect(delivery?.status).toBe("DISABLED");
    expect(delivery?.safeErrorCode).toBe("TELEGRAM_DISABLED");
    expect(calls).toHaveLength(0);
  });

  it("flags an invalid origin without sending", async () => {
    for (const origin of ["not a url", "ftp://files.example/x", "https://tenax.example/app/x?y=1", "http://example.com"]) {
      expect(telegramConfigStatus({ ...TG_ENV, TENAX_APP_ORIGIN: origin })).toBe("ORIGIN_INVALID");
      const store = createDevStore();
      const notification = notified(store, "STANDING_AUTHORITY_ESCALATED");
      const calls: CapturedCall[] = [];
      const delivery = await dispatchTelegramForNotification(store, notification, {
        env: { ...TG_ENV, TENAX_APP_ORIGIN: origin },
        fetchImpl: successFetch(calls),
      });
      expect(delivery?.status).toBe("DISABLED");
      expect(delivery?.safeErrorCode).toBe("ORIGIN_INVALID");
      expect(calls).toHaveLength(0);
    }
  });

  it("validates origins safely", () => {
    expect(normalizeAppOrigin("https://tenax.example")).toBe("https://tenax.example");
    expect(normalizeAppOrigin("https://tenax.example/")).toBe("https://tenax.example");
    expect(normalizeAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeAppOrigin("http://example.com")).toBeNull();
    expect(normalizeAppOrigin("https://tenax.example/a/b")).toBeNull();
    expect(normalizeAppOrigin("")).toBeNull();
    expect(normalizeAppOrigin(null)).toBeNull();
  });
});

describe("eligibility", () => {
  it("sends only the five high-value types", () => {
    const eligible: Array<Notification["type"]> = [
      "STANDING_REVIEW_REQUIRED",
      "STANDING_AUTHORITY_ESCALATED",
      "STANDING_AUTHORITY_REFUSED",
      "AUTONOMOUS_EXECUTION_FILLED",
      "AUTONOMOUS_EXECUTION_FAILED",
    ];
    for (const type of eligible) {
      expect(isTelegramEligible(type)).toBe(true);
    }
    expect(isTelegramEligible("DECISION_RECEIPT_READY")).toBe(false);
  });

  it("non-notifying activity types never reach dispatch", () => {
    const store = createDevStore();
    for (const type of [
      "AI_ANALYSIS_COMPLETED",
      "STANDING_AUTHORITY_AUTHORIZED",
      "AUTONOMOUS_EXECUTION_SUBMITTED",
    ] as const) {
      expect(notifyForActivityEvent(store, emit(store, type))).toBeNull();
    }
  });

  it("stores nothing and sends nothing for ineligible types", async () => {
    const store = createDevStore();
    const notification = notified(store, "DECISION_RECEIPT_READY");
    const calls: CapturedCall[] = [];
    expect(await dispatchTelegramForNotification(store, notification, {
      env: TG_ENV,
      fetchImpl: successFetch(calls),
    })).toBeNull();
    expect(store.telegramDeliveries).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe("message copy", () => {
  it("escalation uses structured values and an absolute review link", async () => {
    const store = createDevStore();
    const notification = notified(store, "STANDING_AUTHORITY_ESCALATED", "flow-0007", {
      details: { proposedPct: 20, proposedUsd: 100, maxPct: 15, maxNotional: 60 },
    });
    const calls: CapturedCall[] = [];
    const delivery = await dispatchTelegramForNotification(store, notification, {
      env: TG_ENV,
      fetchImpl: successFetch(calls),
    });
    expect(delivery?.status).toBe("SENT");
    expect(delivery?.providerMessageId).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/bot" + "tok-SECRET-xyz" + "/sendMessage");
    const body = JSON.parse(calls[0].body) as Record<string, unknown>;
    expect(body.chat_id).toBe("chat-SECRET-123");
    const text = String(body.text);
    expect(text).toContain("Tenax needs human review");
    expect(text).toContain("Proposed: 20% · $100");
    expect(text).toContain("Standing mandate: 15% · $60");
    expect(text).toContain("No autonomous order was sent.");
    expect(text).toContain("https://tenax.example/app/approval/flow-0007");
  });

  it("omits structured lines when values are absent instead of inventing", () => {
    const text = buildTelegramMessage({
      type: "STANDING_AUTHORITY_ESCALATED",
      facts: {},
      targetHref: "/app/approval/flow-1",
      appOrigin: "https://tenax.example",
    });
    expect(text).toContain("Tenax needs human review");
    expect(text).not.toContain("Proposed:");
    expect(text).not.toContain("Standing mandate:");
    expect(text).toContain("https://tenax.example/app/approval/flow-1");
  });

  it("refusal carries reasons with no execution claim", async () => {
    const store = createDevStore();
    const notification = notified(store, "STANDING_AUTHORITY_REFUSED", "flow-0003", {
      details: { reasonCodes: ["exceeds_max_protection_pct"], outcome: "STANDING_REFUSED" },
    });
    const calls: CapturedCall[] = [];
    await dispatchTelegramForNotification(store, notification, {
      env: TG_ENV,
      fetchImpl: successFetch(calls),
    });
    const text = String((JSON.parse(calls[0].body) as Record<string, unknown>).text);
    expect(text).toContain("Tenax refused an action");
    expect(text).toContain("EXCEEDS_MAX_PROTECTION_PCT");
    expect(text).toContain("No order was sent.");
  });

  it("filled Demo execution names instrument, value, authority, and virtual funds", async () => {
    const store = createDevStore();
    seatReceiptFlow(store, "flow-0009", {
      executionMode: "BITGET_DEMO",
      authoritySource: "STANDING_MANDATE",
      demoExecution: {
        orderId: "demo-oid-1",
        clientOid: "tenax-1",
        orderStatus: "filled",
        filled: true,
        avgPrice: "225.44",
        cumExecQty: "0.43",
        cumExecValue: "96.94",
        leverage: "1x",
        marginMode: "crossed",
        approvedNotionalUsdt: 100,
        submittedAt: new Date(NOW).toISOString(),
        verifiedAt: new Date(NOW).toISOString(),
        fundsDisclaimer: "DEMO ORDER — VIRTUAL FUNDS ONLY",
      },
    });
    const notification = notified(store, "AUTONOMOUS_EXECUTION_FILLED", "flow-0009");
    const calls: CapturedCall[] = [];
    await dispatchTelegramForNotification(store, notification, {
      env: TG_ENV,
      fetchImpl: successFetch(calls),
    });
    const text = String((JSON.parse(calls[0].body) as Record<string, unknown>).text);
    expect(text).toContain("Tenax protected NVIDIA");
    expect(text).toContain("NVDAUSDT · SHORT");
    expect(text).toContain("Executed value: $96.94");
    expect(text).toContain("Authority: Standing mandate");
    expect(text).toContain("Virtual funds only");
    expect(text).toContain("https://tenax.example/app/receipts/flow-0009");
  });

  it("filled stays silent without a BITGET_DEMO receipt (DRY_RUN can never claim protection)", async () => {
    const store = createDevStore();
    seatReceiptFlow(store, "flow-0010", { executionMode: "DRY_RUN" });
    // Defense in depth, layer one: the canonical mapping itself refuses.
    const event = emit(store, "AUTONOMOUS_EXECUTION_FILLED", "flow-0010");
    expect(notifyForActivityEvent(store, event)).toBeNull();
    // Layer two: even a hypothetical filled notification without a Demo
    // receipt dispatches nothing.
    const calls: CapturedCall[] = [];
    const store2 = createDevStore();
    seatReceiptFlow(store2, "flow-0010", { executionMode: "DRY_RUN" });
    const note = notified(store2, "STANDING_AUTHORITY_REFUSED", "flow-0010");
    const forged = { ...note, type: "AUTONOMOUS_EXECUTION_FILLED" as const };
    expect(
      await dispatchTelegramForNotification(store2, forged, {
        env: TG_ENV,
        fetchImpl: successFetch(calls),
      }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("review and failure copy stay honest", () => {
    const review = buildTelegramMessage({
      type: "STANDING_REVIEW_REQUIRED",
      facts: { proposedPct: 20, proposedUsd: 100 },
      targetHref: "/app/approval/flow-2",
      appOrigin: "https://tenax.example",
    });
    expect(review).toContain("Tenax needs your approval");
    expect(review).toContain("for 20% ($100)");
    const failed = buildTelegramMessage({
      type: "AUTONOMOUS_EXECUTION_FAILED",
      facts: {},
      targetHref: "/app/analysis/flow-3",
      appOrigin: "https://tenax.example",
    });
    expect(failed).toContain("Protection could not be executed");
    expect(failed).not.toMatch(/protected|filled|success/i);
  });
});

describe("idempotency", () => {
  it("same notification retry after SENT sends zero additional messages", async () => {
    const store = createDevStore();
    const notification = notified(store, "STANDING_AUTHORITY_ESCALATED");
    const calls: CapturedCall[] = [];
    const opts = { env: TG_ENV, fetchImpl: successFetch(calls) };
    const first = await dispatchTelegramForNotification(store, notification, opts);
    expect(first?.status).toBe("SENT");
    const second = await dispatchTelegramForNotification(store, notification, opts);
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
    expect(store.telegramDeliveries).toHaveLength(1);
    expect(telegramDeliveryKey(notification.id)).toBe(`telegram:${notification.id}`);
  });

  it("explicit retry of FAILED re-sends once on the same record", async () => {
    const store = createDevStore();
    const notification = notified(store, "STANDING_AUTHORITY_REFUSED");
    const failFetch: TelegramFetchImpl = async () => ({
      status: 500,
      text: async () => "oops",
    });
    const failed = await dispatchTelegramForNotification(store, notification, {
      env: TG_ENV,
      fetchImpl: failFetch,
    });
    expect(failed?.status).toBe("FAILED");
    expect(failed?.safeErrorCode).toBe("HTTP_500");
    const calls: CapturedCall[] = [];
    const { retried, delivery } = await retryTelegramDelivery(store, notification.id, {
      env: TG_ENV,
      fetchImpl: successFetch(calls),
    });
    expect(retried).toBe(true);
    expect(delivery?.status).toBe("SENT");
    expect(delivery?.notificationId).toBe(notification.id);
    expect(calls).toHaveLength(1);
    expect(store.telegramDeliveries).toHaveLength(1);
  });

  it("retry reconciles SENT without sending and 404s unknown ids", async () => {
    const store = createDevStore();
    const notification = notified(store, "STANDING_AUTHORITY_ESCALATED");
    const calls: CapturedCall[] = [];
    await dispatchTelegramForNotification(store, notification, {
      env: TG_ENV,
      fetchImpl: successFetch(calls),
    });
    const settled = await retryTelegramDelivery(store, notification.id, {
      env: TG_ENV,
      fetchImpl: successFetch(calls),
    });
    expect(settled).toMatchObject({ retried: false });
    expect(settled.delivery?.status).toBe("SENT");
    expect(calls).toHaveLength(1);
    expect((await retryTelegramDelivery(store, "notif-missing", { env: TG_ENV })).delivery).toBeNull();
  });
});

describe("failure isolation", () => {
  it("transport, rejection, and malformed failures resolve to safe codes", async () => {
    const cases: Array<[string, TelegramFetchImpl, string]> = [
      ["transport", async () => { throw new Error("socket hang up"); }, "TRANSPORT_ERROR"],
      ["rejection", async () => ({ status: 200, text: async () => JSON.stringify({ ok: false, error_code: 400 }) }), "TELEGRAM_400"],
      ["malformed", async () => ({ status: 200, text: async () => "not json" }), "INVALID_RESPONSE"],
    ];
    for (const [name, fetchImpl, code] of cases) {
      const store = createDevStore();
      const notification = notified(store, "AUTONOMOUS_EXECUTION_FAILED", `flow-${name}`);
      const delivery = await dispatchTelegramForNotification(store, notification, {
        env: TG_ENV,
        fetchImpl,
      });
      expect(delivery?.status).toBe("FAILED");
      expect(delivery?.safeErrorCode).toBe(code);
      // The canonical notification still exists — Telegram never breaks it.
      expect(store.notifications.some((n) => n.id === notification.id)).toBe(true);
    }
  });

  it("serializes no secret material anywhere", async () => {
    const store = createDevStore();
    const notification = notified(store, "STANDING_AUTHORITY_ESCALATED");
    const calls: CapturedCall[] = [];
    await dispatchTelegramForNotification(store, notification, {
      env: TG_ENV,
      fetchImpl: successFetch(calls),
    });
    const serialized = JSON.stringify({
      notifications: store.notifications,
      activities: store.activities,
      deliveries: store.telegramDeliveries,
    });
    expect(serialized).not.toContain("tok-SECRET-xyz");
    expect(serialized).not.toContain("chat-SECRET-123");
    // The token-bearing request URL itself is never stored.
    expect(serialized).not.toContain("api.telegram.org");
  });
});

describe("service seam wiring (real agent cycle, zero network)", () => {
  it("escalation stores a DISABLED delivery with no Telegram traffic unconfigured", async () => {
    async function testSnapshot() {
      return normalizeNvidiaSnapshot(
        await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
      );
    }
    const store = createDevStore();
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITH_ESCALATION", maxExecutions: 3, maxProtectionPct: 10 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: created.id }, NOW);
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("STANDING_ESCALATE");
    const notification = store.notifications.find((n) => n.targetHref === `/app/approval/${flowId}`);
    expect(notification?.type).toBe("STANDING_AUTHORITY_ESCALATED");
    const delivery = notification ? getTelegramDelivery(store, notification.id) : null;
    expect(delivery?.status).toBe("DISABLED");
    expect(delivery?.safeErrorCode).toBe("TELEGRAM_DISABLED");
    expect(listTelegramDeliveries(store)).toHaveLength(1);
  });
});

describe("explicit-POST routes", () => {
  it("test-send route requires POST with an empty object", async () => {
    const mod = (await import("../src/app/api/notifications/telegram-test/route")) as {
      POST?: unknown;
      GET?: unknown;
    };
    expect(typeof mod.POST).toBe("function");
    expect("GET" in mod).toBe(false);
    const bad = await (mod.POST as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/notifications/telegram-test", {
        method: "POST",
        body: JSON.stringify({ surprise: true }),
      }),
    );
    expect(bad.status).toBe(400);
    const disabled = await (mod.POST as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/notifications/telegram-test", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    // No Telegram env in this process: explicit refusal, nothing sent.
    expect(disabled.status).toBe(503);
  });

  it("retry route validates input and 404s unknown ids", async () => {
    const mod = (await import("../src/app/api/notifications/telegram-retry/route")) as {
      POST?: unknown;
      GET?: unknown;
    };
    expect(typeof mod.POST).toBe("function");
    expect("GET" in mod).toBe(false);
    const post = mod.POST as (r: Request) => Promise<Response>;
    const bad = await post(
      new Request("http://localhost/api/notifications/telegram-retry", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(bad.status).toBe(400);
    const missing = await post(
      new Request("http://localhost/api/notifications/telegram-retry", {
        method: "POST",
        body: JSON.stringify({ notificationId: "notif-nope" }),
      }),
    );
    expect(missing.status).toBe(404);
  });

  it("sendTelegramMessage maps outcomes to safe codes without throwing", async () => {
    const config = { botToken: "t", chatId: "c", appOrigin: "https://tenax.example" };
    const timeoutFetch: TelegramFetchImpl = async () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      throw err;
    };
    const result = await sendTelegramMessage({ config, text: "hi", fetchImpl: timeoutFetch });
    expect(!result.ok ? result.safeErrorCode : null).toBe("TIMEOUT");
  });

  it("listTelegramDeliveries orders newest first", async () => {
    const store = createDevStore();
    const first = notified(store, "STANDING_AUTHORITY_REFUSED", "flow-a");
    const second = notified(store, "STANDING_AUTHORITY_REFUSED", "flow-b");
    await dispatchTelegramForNotification(store, first, { nowMs: NOW });
    await dispatchTelegramForNotification(store, second, { nowMs: NOW + 1000 });
    const listed = listTelegramDeliveries(store).map((d) => d.notificationId);
    expect(listed).toEqual([second.id, first.id]);
  });
});
