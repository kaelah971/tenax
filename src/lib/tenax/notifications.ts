// Tenax Phase 4B-B5.1 — canonical in-app notifications.
//
// Activity events are the durable explanation of what happened;
// notifications are the smaller "Tenax needs your attention / Tenax acted"
// surface derived from them. One centralized mapping function
// (notifyForActivityEvent) is the ONLY place activity becomes a
// notification — UI components never construct notifications.
//
// Rules honoured here, not in callers:
// - Notify only meaningful user-facing outcomes (no per-event noise:
//   AI_ANALYSIS_COMPLETED, STANDING_AUTHORITY_AUTHORIZED and
//   AUTONOMOUS_EXECUTION_SUBMITTED never notify — the SUBMITTED outcome is
//   always immediately followed by FILLED/FAILED in this seam).
// - Idempotency: notification ids derive deterministically from the source
//   activity event id, so retries/replays never duplicate.
// - DECISION_RECEIPT_READY never double-notifies an execution that already
//   has a filled notification with the same receipt target.
// - Honest copy: DRY_RUN previews never claim protection/fills; Demo
//   fills always say virtual funds; refusals always say no order was sent.
// - Secret-free: notifications carry display facts only (numbers, codes,
//   ids, routes). No credentials, signatures, headers, or raw bodies.

import type { ActivityEvent, ActivityEventType } from "./activity";
import type { DecisionReceipt } from "./domain";
import type { TenaxDevStore } from "./dev-store";

export const NOTIFICATION_TYPES = [
  "STANDING_REVIEW_REQUIRED",
  "STANDING_AUTHORITY_ESCALATED",
  "STANDING_AUTHORITY_REFUSED",
  "AUTONOMOUS_EXECUTION_FILLED",
  "AUTONOMOUS_EXECUTION_FAILED",
  "DECISION_RECEIPT_READY",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ["INFO", "SUCCESS", "ATTENTION", "WARNING"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_STATUSES = ["UNREAD", "READ"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_TARGETS = [
  "ANALYSIS",
  "APPROVAL",
  "RECEIPT",
  "MANDATE",
  "ACTIVITY",
] as const;
export type NotificationTarget = (typeof NOTIFICATION_TARGETS)[number];

export interface Notification {
  readonly id: string;
  readonly type: NotificationType;
  readonly flowId: string;
  readonly createdAt: string;
  readonly title: string;
  readonly body: string;
  readonly severity: NotificationSeverity;
  readonly status: NotificationStatus;
  readonly target: NotificationTarget;
  readonly targetHref: string;
  readonly activityEventId: string;
  readonly receiptId: string | null;
}

/** Deterministic id: the same activity event always maps to one notification. */
export function notificationIdForEvent(activityEventId: string): string {
  return `notif-${activityEventId}`;
}

/** Best-effort receipt read for mode-aware copy. Null when absent — never throws. */
function readReceipt(store: TenaxDevStore, flowId: string): DecisionReceipt | null {
  try {
    return store.flows.get(flowId)?.getReceipt() ?? null;
  } catch {
    return null;
  }
}

function fmtPct(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : null;
}

function fmtUsd(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `$${value}` : null;
}

interface NotificationDraft {
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly severity: NotificationSeverity;
  readonly target: NotificationTarget;
  readonly targetHref: string;
}

/**
 * Centralized activity → notification policy. Returns the stored
 * notification (existing one on retry) or null when the event is not
 * user-facing. Never throws for unknown shapes — unmapped types return
 * null so future activity types stay silent until explicitly mapped.
 */
export function notifyForActivityEvent(
  store: TenaxDevStore,
  event: ActivityEvent,
): Notification | null {
  const id = notificationIdForEvent(event.id);
  const existing = store.notifications.find((n) => n.id === id);
  if (existing) return existing;

  const draft = draftForEvent(store, event);
  if (!draft) return null;

  const notification: Notification = {
    id,
    type: draft.type,
    flowId: event.flowId,
    createdAt: event.createdAt,
    title: draft.title,
    body: draft.body,
    severity: draft.severity,
    status: "UNREAD",
    target: draft.target,
    targetHref: draft.targetHref,
    activityEventId: event.id,
    receiptId: event.receiptId,
  };
  store.notifications.push(notification);
  return notification;
}

function draftForEvent(store: TenaxDevStore, event: ActivityEvent): NotificationDraft | null {
  switch (event.type satisfies ActivityEventType) {
    case "STANDING_REVIEW_REQUIRED": {
      const pct = fmtPct(event.details?.proposedPct);
      const usd = fmtUsd(event.details?.proposedUsd);
      const scope = pct && usd ? ` for ${pct} (${usd})` : "";
      return {
        type: "STANDING_REVIEW_REQUIRED",
        title: "Tenax needs your approval.",
        body: `Human approval required${scope} under review-every-action. No order sent.`,
        severity: "ATTENTION",
        target: "APPROVAL",
        targetHref: `/app/approval/${event.flowId}`,
      };
    }
    case "STANDING_AUTHORITY_ESCALATED": {
      const pct = fmtPct(event.details?.proposedPct);
      const usd = fmtUsd(event.details?.proposedUsd);
      const maxPct = fmtPct(event.details?.maxPct);
      const maxUsd = fmtUsd(event.details?.maxNotional);
      const proposed = pct && usd ? ` Proposed ${pct} (${usd})` : "";
      const bounds =
        maxPct && maxUsd ? ` exceeds your standing authority (max ${maxPct} / ${maxUsd}).` : " exceeds your standing authority.";
      return {
        type: "STANDING_AUTHORITY_ESCALATED",
        title: "Tenax needs human review.",
        body: `An action exceeded your standing authority.${proposed}${bounds} No order sent.`,
        severity: "ATTENTION",
        target: "APPROVAL",
        targetHref: `/app/approval/${event.flowId}`,
      };
    }
    case "STANDING_AUTHORITY_REFUSED": {
      const reasons = event.details?.reasonCodes?.filter((r) => r.length > 0) ?? [];
      const suffix = reasons.length > 0 ? ` (${reasons.join(" · ").toUpperCase()})` : "";
      return {
        type: "STANDING_AUTHORITY_REFUSED",
        title: "Tenax refused an action.",
        body: `Execution stayed inside your safety rules${suffix}. No order was sent.`,
        severity: "WARNING",
        target: "ANALYSIS",
        targetHref: `/app/analysis/${event.flowId}`,
      };
    }
    case "AUTONOMOUS_EXECUTION_FILLED": {
      // Defense in depth: only a BITGET_DEMO receipt may produce a
      // "protected" notification. DRY_RUN previews never reach this event
      // type, but a missing/mismatched receipt still refuses silently.
      const receipt = readReceipt(store, event.flowId);
      if (!receipt || receipt.executionMode !== "BITGET_DEMO") return null;
      const scope = `${receipt.proposedProtectionPct}% ($${receipt.proposedTradeValueUsdt}) NVDAUSDT short`;
      const mandate =
        receipt.authoritySource === "STANDING_MANDATE"
          ? "Tenax acted within your standing mandate."
          : "Tenax acted following your approval.";
      return {
        type: "AUTONOMOUS_EXECUTION_FILLED",
        title: "Tenax protected your NVIDIA exposure.",
        body: `${mandate} Demo order filled — ${scope}. Bitget Demo · virtual funds only.`,
        severity: "SUCCESS",
        target: "RECEIPT",
        targetHref: `/app/receipts/${event.flowId}`,
      };
    }
    case "AUTONOMOUS_EXECUTION_FAILED": {
      return {
        type: "AUTONOMOUS_EXECUTION_FAILED",
        title: "Protection could not be executed.",
        body: "Tenax could not complete the protection. No position was opened — review the analysis before retrying.",
        severity: "WARNING",
        target: "ANALYSIS",
        targetHref: `/app/analysis/${event.flowId}`,
      };
    }
    case "DECISION_RECEIPT_READY": {
      // Same execution already announced via its filled notification —
      // never a second one for the same receipt.
      const duplicate = store.notifications.some(
        (n) =>
          n.type === "AUTONOMOUS_EXECUTION_FILLED" &&
          n.target === "RECEIPT" &&
          event.receiptId !== null &&
          n.receiptId === event.receiptId,
      );
      if (duplicate) return null;
      const receipt = event.receiptId ? readReceipt(store, event.flowId) : null;
      if (receipt && receipt.executionMode === "DRY_RUN") {
        return {
          type: "DECISION_RECEIPT_READY",
          title: "Dry-run receipt ready.",
          body: "Preview receipt ready. No funds moved — nothing was submitted.",
          severity: "INFO",
          target: "RECEIPT",
          targetHref: `/app/receipts/${event.flowId}`,
        };
      }
      return {
        type: "DECISION_RECEIPT_READY",
        title: "Decision receipt ready.",
        body: "The decision receipt is ready for review.",
        severity: "INFO",
        target: "RECEIPT",
        targetHref: `/app/receipts/${event.flowId}`,
      };
    }
    case "AI_ANALYSIS_COMPLETED":
    case "STANDING_AUTHORITY_AUTHORIZED":
    case "AUTONOMOUS_EXECUTION_SUBMITTED":
      return null;
    default:
      // Future activity types stay silent until explicitly mapped.
      return null;
  }
}

// ---- Store accessors (process-local dev store; no persistence yet) ---------

export function listNotifications(
  store: TenaxDevStore,
  options: { readonly unreadOnly?: boolean } = {},
): Notification[] {
  const items = options.unreadOnly
    ? store.notifications.filter((n) => n.status === "UNREAD")
    : [...store.notifications];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function getUnreadNotificationCount(store: TenaxDevStore): number {
  return store.notifications.filter((n) => n.status === "UNREAD").length;
}

export function markNotificationRead(store: TenaxDevStore, id: string): boolean {
  const index = store.notifications.findIndex((n) => n.id === id);
  if (index === -1) return false;
  if (store.notifications[index].status === "READ") return true;
  store.notifications[index] = { ...store.notifications[index], status: "READ" };
  return true;
}

export function markAllNotificationsRead(store: TenaxDevStore): number {
  let marked = 0;
  store.notifications.forEach((n, index) => {
    if (n.status === "UNREAD") {
      store.notifications[index] = { ...n, status: "READ" };
      marked += 1;
    }
  });
  return marked;
}
