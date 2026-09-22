// Tenax Phase 4B-B5.1 — notification tests (offline, no network).
//
// Covers the user-facing notification system end to end at the seam
// level: centralized activity→notification mapping, idempotent retries,
// honest mode-aware copy (DRY_RUN never claims protection, Demo fills
// always say virtual funds), read/unread bookkeeping, activity-log
// independence, secret-free serialization, browser-permission discipline
// (explicit user action only), and service-level wiring through the real
// agent cycle. No provider POSTs anywhere in this file: Demo paths use
// injected stubs, DRY_RUN paths need no I/O at all.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import type { ActivityEvent } from "../src/lib/tenax/activity";
import type { DecisionReceipt } from "../src/lib/tenax/domain";
import type { TenaxDevStore } from "../src/lib/tenax/dev-store";
import type { ProtectionFlow } from "../src/lib/tenax/orchestrator";
import {
  __resetActivityCounterForTests,
  __resetStandingMandateCounterForTests,
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  emitActivityEvent,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationIdForEvent,
  notifyForActivityEvent,
  runProtectionAgentCycle,
} from "../src/lib/tenax/index";
import {
  browserAlertForCycleOutcome,
  browserAlertsPermission,
  isBrowserAlertsEnabled,
  requestBrowserAlerts,
  sendBrowserAlert,
} from "../src/app/app/_components/BrowserAlerts";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const NOW = Date.parse("2026-09-21T12:00:00.000Z");

let savedTenaxMode: string | undefined;
let savedTradingMode: string | undefined;

beforeEach(() => {
  __resetActivityCounterForTests();
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
  delete (globalThis as { Notification?: unknown }).Notification;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

/** Golden MANDATE_PASS flow (fixture analysis, 20%/$100). */
async function setupPassFlow() {
  const store = createDevStore();
  const snapshot = await testSnapshot();
  const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
  analyzeProtectionIntent(store, flowId, snapshot);
  return { store, flowId };
}

function setupActiveMandate(
  store: TenaxDevStore,
  overrides: { authorityMode?: "AUTO_WITHIN_MANDATE" | "AUTO_WITH_ESCALATION" | "REVIEW_EVERY_ACTION"; maxExecutions?: number; maxProtectionPct?: number } = {},
) {
  const created = createStandingMandateRecord(
    store,
    { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1, ...overrides },
    NOW,
  );
  return activateStandingMandateRecord(store, { id: created.id }, NOW);
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

/** Seat a fake receipt-bearing flow for mode-aware mapping tests. */
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

describe("activity → notification policy", () => {
  it("escalation creates exactly one unread ATTENTION notification, retry does not duplicate", () => {
    const store = createDevStore();
    const event = emit(store, "STANDING_AUTHORITY_ESCALATED", "flow-0007", {
      details: { proposedPct: 20, proposedUsd: 100, maxPct: 15, maxNotional: 150 },
    });
    const first = notifyForActivityEvent(store, event);
    expect(first).not.toBeNull();
    expect(first?.id).toBe(notificationIdForEvent(event.id));
    expect(first?.severity).toBe("ATTENTION");
    expect(first?.status).toBe("UNREAD");
    expect(first?.title).toBe("Tenax needs human review.");
    expect(first?.target).toBe("APPROVAL");
    expect(first?.targetHref).toBe("/app/approval/flow-0007");
    expect(getUnreadNotificationCount(store)).toBe(1);
    // Retry of the same underlying event returns the same record, no duplicate.
    const second = notifyForActivityEvent(store, event);
    expect(second).toBe(first);
    expect(store.notifications).toHaveLength(1);
    expect(getUnreadNotificationCount(store)).toBe(1);
  });

  it("review-required creates an approval notification", () => {
    const store = createDevStore();
    const event = emit(store, "STANDING_REVIEW_REQUIRED");
    const notification = notifyForActivityEvent(store, event);
    expect(notification?.severity).toBe("ATTENTION");
    expect(notification?.title).toBe("Tenax needs your approval.");
    expect(notification?.targetHref).toBe("/app/approval/flow-0001");
  });

  it("refusal creates a warning with no execution claim", () => {
    const store = createDevStore();
    const event = emit(store, "STANDING_AUTHORITY_REFUSED", "flow-0002", {
      details: { reasonCodes: ["cumulative_gate"], outcome: "STANDING_REFUSED" },
    });
    const notification = notifyForActivityEvent(store, event);
    expect(notification?.severity).toBe("WARNING");
    expect(notification?.targetHref).toBe("/app/analysis/flow-0002");
    const text = `${notification?.title} ${notification?.body}`;
    expect(text).toMatch(/No order was sent/);
    expect(text).not.toMatch(/protected|executed|filled|submitted|mandate authorized/i);
  });

  it("filled Demo execution creates a success notification with receipt link and virtual-funds honesty", () => {
    const store = createDevStore();
    seatReceiptFlow(store, "flow-0003", {
      executionMode: "BITGET_DEMO",
      fundsMoved: true,
      authoritySource: "STANDING_MANDATE",
      standingMandateId: "mandate-0001",
    });
    const event = emit(store, "AUTONOMOUS_EXECUTION_FILLED", "flow-0003", {
      receiptId: "TENAX-1C-flow-0003",
    });
    const notification = notifyForActivityEvent(store, event);
    expect(notification?.severity).toBe("SUCCESS");
    expect(notification?.title).toBe("Tenax protected your NVIDIA exposure.");
    expect(notification?.target).toBe("RECEIPT");
    expect(notification?.targetHref).toBe("/app/receipts/flow-0003");
    expect(notification?.receiptId).toBe("TENAX-1C-flow-0003");
    expect(notification?.body).toMatch(/standing mandate/i);
    expect(notification?.body).toMatch(/virtual funds/i);
  });

  it("filled never notifies without a BITGET_DEMO receipt", () => {
    const store = createDevStore();
    // No receipt seated at all.
    const orphan = emit(store, "AUTONOMOUS_EXECUTION_FILLED", "flow-0009", {
      receiptId: "TENAX-1C-flow-0009",
    });
    expect(notifyForActivityEvent(store, orphan)).toBeNull();
    // DRY_RUN receipt present: still no "protected" notification.
    seatReceiptFlow(store, "flow-0010", { executionMode: "DRY_RUN" });
    const dry = emit(store, "AUTONOMOUS_EXECUTION_FILLED", "flow-0010", {
      receiptId: "TENAX-1C-flow-0010",
    });
    expect(notifyForActivityEvent(store, dry)).toBeNull();
    expect(store.notifications).toHaveLength(0);
  });

  it("failed execution creates a warning pointing at analysis", () => {
    const store = createDevStore();
    const event = emit(store, "AUTONOMOUS_EXECUTION_FAILED");
    const notification = notifyForActivityEvent(store, event);
    expect(notification?.severity).toBe("WARNING");
    expect(notification?.title).toBe("Protection could not be executed.");
    expect(notification?.targetHref).toBe("/app/analysis/flow-0001");
  });

  it("DRY_RUN receipt-ready notifies without protection claims; filled receipt-ready dedups", () => {
    const store = createDevStore();
    seatReceiptFlow(store, "flow-0004", { executionMode: "DRY_RUN" });
    const dryReady = emit(store, "DECISION_RECEIPT_READY", "flow-0004", {
      receiptId: "TENAX-1C-flow-0004",
    });
    const dryNotification = notifyForActivityEvent(store, dryReady);
    expect(dryNotification?.severity).toBe("INFO");
    expect(dryNotification?.targetHref).toBe("/app/receipts/flow-0004");
    const text = `${dryNotification?.title} ${dryNotification?.body}`;
    expect(text).toMatch(/No funds moved/);
    expect(text).not.toMatch(/protected|filled/i);

    // Same execution already announced via filled: no second notification.
    seatReceiptFlow(store, "flow-0005", {
      executionMode: "BITGET_DEMO",
      fundsMoved: true,
      authoritySource: "STANDING_MANDATE",
    });
    const filled = emit(store, "AUTONOMOUS_EXECUTION_FILLED", "flow-0005", {
      receiptId: "TENAX-1C-flow-0005",
    });
    expect(notifyForActivityEvent(store, filled)?.severity).toBe("SUCCESS");
    const receiptReady = emit(store, "DECISION_RECEIPT_READY", "flow-0005", {
      receiptId: "TENAX-1C-flow-0005",
    });
    expect(notifyForActivityEvent(store, receiptReady)).toBeNull();
    expect(
      store.notifications.filter((n) => n.receiptId === "TENAX-1C-flow-0005"),
    ).toHaveLength(1);
  });

  it("analysis completion, authorization, and submission stay silent", () => {
    const store = createDevStore();
    for (const type of [
      "AI_ANALYSIS_COMPLETED",
      "STANDING_AUTHORITY_AUTHORIZED",
      "AUTONOMOUS_EXECUTION_SUBMITTED",
    ] as const) {
      expect(notifyForActivityEvent(store, emit(store, type))).toBeNull();
    }
    expect(store.notifications).toHaveLength(0);
  });
});

describe("read bookkeeping", () => {
  function twoUnreadStore() {
    const store = createDevStore();
    notifyForActivityEvent(store, emit(store, "STANDING_AUTHORITY_ESCALATED", "flow-0001"));
    notifyForActivityEvent(store, emit(store, "STANDING_AUTHORITY_REFUSED", "flow-0002"));
    return store;
  }

  it("mark-read works and unread count is correct", () => {
    const store = twoUnreadStore();
    expect(getUnreadNotificationCount(store)).toBe(2);
    expect(listNotifications(store)).toHaveLength(2);
    expect(listNotifications(store, { unreadOnly: true })).toHaveLength(2);
    const [first] = listNotifications(store);
    expect(markNotificationRead(store, first.id)).toBe(true);
    expect(getUnreadNotificationCount(store)).toBe(1);
    expect(listNotifications(store, { unreadOnly: true })).toHaveLength(1);
    // Re-marking is stable, unknown ids report false.
    expect(markNotificationRead(store, first.id)).toBe(true);
    expect(markNotificationRead(store, "notif-act-9999")).toBe(false);
  });

  it("mark-all-read works", () => {
    const store = twoUnreadStore();
    expect(markAllNotificationsRead(store)).toBe(2);
    expect(getUnreadNotificationCount(store)).toBe(0);
    expect(markAllNotificationsRead(store)).toBe(0);
  });

  it("lists newest first", () => {
    const store = twoUnreadStore();
    const [first, second] = listNotifications(store);
    expect(Date.parse(first.createdAt)).toBeGreaterThanOrEqual(Date.parse(second.createdAt));
  });
});

describe("activity log independence and secret safety", () => {
  it("notification mapping never mutates the activity log", () => {
    const store = createDevStore();
    const event = emit(store, "STANDING_AUTHORITY_ESCALATED");
    const before = store.activities.length;
    notifyForActivityEvent(store, event);
    notifyForActivityEvent(store, event);
    expect(store.activities).toHaveLength(before);
  });

  it("serialized notifications carry no secret-shaped data", () => {
    const store = createDevStore();
    notifyForActivityEvent(store, emit(store, "STANDING_AUTHORITY_ESCALATED"));
    notifyForActivityEvent(store, emit(store, "STANDING_AUTHORITY_REFUSED"));
    const serialized = JSON.stringify(store.notifications);
    expect(serialized).not.toMatch(/apiKey|secretKey|passphrase|signature|headers|sk-/i);
    const allowed = new Set([
      "id", "type", "flowId", "createdAt", "title", "body", "severity",
      "status", "target", "targetHref", "activityEventId", "receiptId",
    ]);
    for (const notification of store.notifications) {
      for (const key of Object.keys(notification)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});

describe("service wiring (real agent cycle, no provider I/O)", () => {
  it("escalation through runProtectionAgentCycle creates exactly one notification", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store, { authorityMode: "AUTO_WITH_ESCALATION", maxProtectionPct: 15 });
    // Fixture proposal is 20%/$100: over the 15% standing bound → escalate.
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("STANDING_ESCALATE");
    expect(store.notifications).toHaveLength(1);
    const [notification] = store.notifications;
    expect(notification.type).toBe("STANDING_AUTHORITY_ESCALATED");
    expect(notification.status).toBe("UNREAD");
    expect(notification.targetHref).toBe(`/app/approval/${flowId}`);
    expect(getUnreadNotificationCount(store)).toBe(1);
  });

  it("DRY_RUN execution notifies receipt-ready only, never protection", async () => {
    const { store, flowId } = await setupPassFlow();
    setupActiveMandate(store, { authorityMode: "AUTO_WITHIN_MANDATE" });
    const result = await runProtectionAgentCycle(store, { flowId }, { nowMs: Date.now() });
    expect(result.outcome).toBe("EXECUTED");
    expect(store.notifications).toHaveLength(1);
    const [notification] = store.notifications;
    expect(notification.type).toBe("DECISION_RECEIPT_READY");
    expect(notification.title).toBe("Dry-run receipt ready.");
    const text = `${notification.title} ${notification.body}`;
    expect(text).not.toMatch(/protected|filled/i);
  });
});

describe("browser alerts", () => {
  it("reports unsupported with no Notification global and never throws", () => {
    expect(browserAlertsPermission()).toBe("unsupported");
    expect(isBrowserAlertsEnabled()).toBe(false);
    expect(
      sendBrowserAlert({ title: "t", body: "b", href: "/app/activity" }),
    ).toBe(false);
  });

  it("requests permission only from the explicit call, never on import", async () => {
    const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    class FakeNotification {
      static permission = "default";
      static requestPermission = requestPermission;
    }
    (globalThis as { Notification?: unknown }).Notification = FakeNotification;
    // Import already happened at module top: no prompt must have fired.
    expect(requestPermission).not.toHaveBeenCalled();
    expect(browserAlertsPermission()).toBe("default");
    expect(sendBrowserAlert({ title: "t", body: "b" })).toBe(false);
    await expect(requestBrowserAlerts()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("denied permission disables alerts without breaking", async () => {
    class FakeNotification {
      static permission = "denied";
      static requestPermission = vi.fn(async () => "denied" as NotificationPermission);
    }
    (globalThis as { Notification?: unknown }).Notification = FakeNotification;
    expect(browserAlertsPermission()).toBe("denied");
    expect(sendBrowserAlert({ title: "t", body: "b" })).toBe(false);
    await expect(requestBrowserAlerts()).resolves.toBe("denied");
  });

  it("maps cycle outcomes to honest browser copy", () => {
    expect(
      browserAlertForCycleOutcome({ outcome: "STANDING_ESCALATE", flowId: "flow-1" })?.title,
    ).toBe("Tenax needs human review.");
    expect(
      browserAlertForCycleOutcome({ outcome: "STANDING_REVIEW", flowId: "flow-1" })?.title,
    ).toBe("Tenax needs your approval.");
    expect(
      browserAlertForCycleOutcome({ outcome: "STANDING_REFUSED", flowId: "flow-1" })?.body,
    ).toMatch(/No order sent/);
    const filled = browserAlertForCycleOutcome({ outcome: "EXECUTED", filled: true, flowId: "flow-1" });
    expect(filled?.title).toBe("Tenax protected NVIDIA.");
    expect(filled?.body).toMatch(/virtual funds/);
    const preview = browserAlertForCycleOutcome({ outcome: "EXECUTED", flowId: "flow-1" });
    expect(`${preview?.title} ${preview?.body}`).not.toMatch(/protected/i);
    const pending = browserAlertForCycleOutcome({
      outcome: "EXECUTED",
      executionMode: "BITGET_DEMO",
      filled: false,
      flowId: "flow-1",
    });
    expect(pending?.title).toBe("Demo order submitted.");
    expect(`${pending?.title} ${pending?.body}`).not.toMatch(/protected/i);
    expect(`${pending?.title} ${pending?.body}`).not.toMatch(/move no funds/i);
    expect(pending?.body).toMatch(/not yet verified/);
    expect(pending?.href).toBe("/app/receipts/flow-1");
    expect(
      browserAlertForCycleOutcome({ outcome: "FAILED", flowId: "flow-1" })?.title,
    ).toBe("Protection could not be executed.");
    expect(browserAlertForCycleOutcome({ outcome: "NO_ACTION", flowId: "flow-1" })).toBeNull();
    expect(browserAlertForCycleOutcome({ outcome: null, flowId: "flow-1" })).toBeNull();
  });

  it("notification routes never touch provider APIs", () => {
    for (const file of [
      "../src/app/api/notifications/route.ts",
      "../src/app/api/notifications/read/route.ts",
      "../src/app/app/_components/NotificationBell.tsx",
      "../src/app/app/notifications/NotificationList.tsx",
      "../src/app/app/notifications/page.tsx",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/api\.bitget|place-order|placeOrder|ACCESS-SIGN|paptrading/i);
    }
  });
});
