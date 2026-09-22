// Tenax Phase 4B-B5.2 — Telegram delivery records and dispatcher.
//
// Delivery model: one record per canonical notification, keyed
// deterministically (`telegram:<notificationId>`). A SENT record is
// terminal — retries reconcile it with zero additional messages. FAILED
// records may be retried explicitly (same record, refreshed attempt).
// DISABLED records terminal absence of server configuration with zero
// network touched.
//
// The dispatcher runs best-effort AFTER canonical notification creation:
// Telegram failure (timeout, 4xx/5xx, malformed) can never break activity
// creation, the in-app notification, browser alerts, or the
// authority/execution result that produced the event.

import type { ActivityEventDetails } from "../tenax/activity";
import type { DecisionReceipt } from "../tenax/domain";
import type { TenaxDevStore } from "../tenax/dev-store";
import type { Notification } from "../tenax/notifications";
import {
  buildTelegramMessage,
  readTelegramConfig,
  sendTelegramMessage,
  telegramConfigStatus,
  type TelegramConfig,
  type TelegramFetchImpl,
  type TelegramMessageType,
} from "./client";

export const TELEGRAM_DELIVERY_STATUSES = ["DISABLED", "PENDING", "SENT", "FAILED"] as const;
export type TelegramDeliveryStatus = (typeof TELEGRAM_DELIVERY_STATUSES)[number];

export interface TelegramDelivery {
  readonly channel: "TELEGRAM";
  readonly notificationId: string;
  readonly status: TelegramDeliveryStatus;
  readonly attemptedAt: string;
  /** Set only on SENT. Telegram message_id when the provider returns one. */
  readonly sentAt: string | null;
  readonly providerMessageId: number | null;
  /** Fixed safe code (never secret-bearing, never raw provider text). */
  readonly safeErrorCode: string | null;
}

/** Deterministic key: same notification → at most one delivery lifecycle. */
export function telegramDeliveryKey(notificationId: string): string {
  return `telegram:${notificationId}`;
}

/** Notification types eligible for Telegram delivery. Nothing else sends. */
export function isTelegramEligible(type: Notification["type"]): type is TelegramMessageType {
  return (
    type === "STANDING_REVIEW_REQUIRED" ||
    type === "STANDING_AUTHORITY_ESCALATED" ||
    type === "STANDING_AUTHORITY_REFUSED" ||
    type === "AUTONOMOUS_EXECUTION_FILLED" ||
    type === "AUTONOMOUS_EXECUTION_FAILED"
  );
}

export function getTelegramDelivery(
  store: TenaxDevStore,
  notificationId: string,
): TelegramDelivery | null {
  return (
    store.telegramDeliveries.find(
      (d) => d.notificationId === notificationId,
    ) ?? null
  );
}

export function listTelegramDeliveries(store: TenaxDevStore): TelegramDelivery[] {
  return [...store.telegramDeliveries].sort((a, b) =>
    a.attemptedAt < b.attemptedAt ? 1 : a.attemptedAt > b.attemptedAt ? -1 : 0,
  );
}

function upsertDelivery(store: TenaxDevStore, delivery: TelegramDelivery): TelegramDelivery {
  const index = store.telegramDeliveries.findIndex(
    (d) => d.notificationId === delivery.notificationId,
  );
  if (index === -1) store.telegramDeliveries.push(delivery);
  else store.telegramDeliveries[index] = delivery;
  return delivery;
}

function readReceiptFor(store: TenaxDevStore, flowId: string): DecisionReceipt | null {
  try {
    return store.flows.get(flowId)?.getReceipt() ?? null;
  } catch {
    return null;
  }
}

function executedValueUsd(receipt: DecisionReceipt | null): number | null {
  const raw = receipt?.demoExecution?.cumExecValue ?? null;
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export interface TelegramDispatchOptions {
  readonly env?: Record<string, string | undefined>;
  readonly fetchImpl?: TelegramFetchImpl;
  readonly timeoutMs?: number;
  readonly nowMs?: number;
}

/**
 * Best-effort Telegram delivery for one canonical notification. Returns
 * the stored delivery record, or null when the notification type is not
 * eligible (nothing stored, nothing sent). Never throws: every path —
 * including missing config and transport failure — resolves to a record
 * (or null for ineligible types).
 */
export async function dispatchTelegramForNotification(
  store: TenaxDevStore,
  notification: Notification,
  options: TelegramDispatchOptions = {},
): Promise<TelegramDelivery | null> {
  if (!isTelegramEligible(notification.type)) return null;
  const nowMs = options.nowMs ?? Date.now();
  const existing = getTelegramDelivery(store, notification.id);
  // Idempotency: a SENT record reconciles with zero additional messages.
  // A PENDING record belongs to an in-flight attempt — do not double-send.
  if (existing && (existing.status === "SENT" || existing.status === "PENDING")) {
    return existing;
  }
  const env = options.env ?? process.env;
  const config: TelegramConfig | null = readTelegramConfig(env);
  if (!config) {
    const status = telegramConfigStatus(env);
    return upsertDelivery(store, {
      channel: "TELEGRAM",
      notificationId: notification.id,
      status: "DISABLED",
      attemptedAt: new Date(nowMs).toISOString(),
      sentAt: null,
      providerMessageId: null,
      safeErrorCode: status === "ORIGIN_INVALID" ? "ORIGIN_INVALID" : "TELEGRAM_DISABLED",
    });
  }
  const activity = store.activities.find((a) => a.id === notification.activityEventId);
  const details: ActivityEventDetails | null = activity?.details ?? null;
  const receipt = readReceiptFor(store, notification.flowId);
  // Defense in depth: a filled alert requires a BITGET_DEMO receipt.
  // Without one, stay silent rather than risk a DRY_RUN "protected" claim.
  if (notification.type === "AUTONOMOUS_EXECUTION_FILLED") {
    if (!receipt || receipt.executionMode !== "BITGET_DEMO") return null;
  }
  const text = buildTelegramMessage({
    type: notification.type,
    facts: {
      proposedPct: details?.proposedPct,
      proposedUsd: details?.proposedUsd,
      maxPct: details?.maxPct,
      maxNotional: details?.maxNotional,
      executedValueUsd: executedValueUsd(receipt),
      authoritySource: receipt?.authoritySource ?? null,
      reasonCodes: details?.reasonCodes,
    },
    targetHref: notification.targetHref,
    appOrigin: config.appOrigin,
  });
  const pending: TelegramDelivery = {
    channel: "TELEGRAM",
    notificationId: notification.id,
    status: "PENDING",
    attemptedAt: new Date(nowMs).toISOString(),
    sentAt: null,
    providerMessageId: null,
    safeErrorCode: null,
  };
  upsertDelivery(store, pending);
  const sent = await sendTelegramMessage({
    config,
    text,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  const at = new Date(options.nowMs ?? Date.now()).toISOString();
  if (sent.ok) {
    return upsertDelivery(store, {
      ...pending,
      status: "SENT",
      attemptedAt: at,
      sentAt: at,
      providerMessageId: sent.providerMessageId,
      safeErrorCode: null,
    });
  }
  return upsertDelivery(store, {
    ...pending,
    status: "FAILED",
    attemptedAt: at,
    sentAt: null,
    providerMessageId: null,
    safeErrorCode: sent.safeErrorCode,
  });
}

/**
 * Explicit retry of a FAILED delivery (manual retry endpoint/button).
 * SENT and PENDING reconcile untouched; missing records return null so
 * the caller can answer 404. Never throws.
 */
export async function retryTelegramDelivery(
  store: TenaxDevStore,
  notificationId: string,
  options: TelegramDispatchOptions = {},
): Promise<{ readonly retried: boolean; readonly delivery: TelegramDelivery | null }> {
  const notification = store.notifications.find((n) => n.id === notificationId) ?? null;
  if (!notification) return { retried: false, delivery: null };
  const existing = getTelegramDelivery(store, notificationId);
  if (existing && existing.status !== "FAILED") {
    return { retried: false, delivery: existing };
  }
  const delivery = await dispatchTelegramForNotification(store, notification, options);
  return { retried: true, delivery };
}
