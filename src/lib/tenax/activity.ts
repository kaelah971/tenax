// Tenax Phase 4B-B2 — canonical activity events (notification seam).
//
// Lightweight, secret-free records of agent-cycle milestones for future
// in-app/browser/Telegram notifications. Stored process-locally beside
// flows (same non-durable dev-store caveats). Summaries carry only safe
// display facts — never credentials, signatures, headers, or raw bodies.

import type { TenaxDevStore } from "./dev-store";

export const ACTIVITY_TYPES = [
  "AI_ANALYSIS_COMPLETED",
  "STANDING_AUTHORITY_AUTHORIZED",
  "STANDING_AUTHORITY_ESCALATED",
  "STANDING_AUTHORITY_REFUSED",
  "AUTONOMOUS_EXECUTION_SUBMITTED",
  "AUTONOMOUS_EXECUTION_FILLED",
  "AUTONOMOUS_EXECUTION_FAILED",
  "DECISION_RECEIPT_READY",
] as const;
export type ActivityEventType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityEvent {
  readonly id: string;
  readonly type: ActivityEventType;
  readonly flowId: string;
  readonly createdAt: string;
  readonly summary: string;
  readonly receiptId: string | null;
}

let activityCounter = 0;

/** Reset the in-memory counter (tests only). */
export function __resetActivityCounterForTests(): void {
  activityCounter = 0;
}

export function emitActivityEvent(
  store: TenaxDevStore,
  input: {
    readonly type: ActivityEventType;
    readonly flowId: string;
    readonly summary: string;
    readonly receiptId?: string | null;
  },
  nowMs: number = Date.now(),
): ActivityEvent {
  activityCounter += 1;
  const event: ActivityEvent = {
    id: `act-${String(activityCounter).padStart(4, "0")}`,
    type: input.type,
    flowId: input.flowId,
    createdAt: new Date(nowMs).toISOString(),
    summary: input.summary,
    receiptId: input.receiptId ?? null,
  };
  store.activities.push(event);
  return event;
}
