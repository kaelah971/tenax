// Tenax Phase 4B-B2 — canonical activity events (notification seam).
//
// Lightweight, secret-free records of agent-cycle milestones for future
// in-app/browser/Telegram notifications. Stored process-locally beside
// flows (same non-durable dev-store caveats). Summaries carry only safe
// display facts — never credentials, signatures, headers, or raw bodies.

import { randomBytes } from "node:crypto";

import type { TenaxDevStore } from "./dev-store";

export const ACTIVITY_TYPES = [
  "AI_ANALYSIS_COMPLETED",
  "DETERMINISTIC_POLICY_REFUSED",
  "STANDING_AUTHORITY_AUTHORIZED",
  "STANDING_AUTHORITY_ESCALATED",
  "STANDING_AUTHORITY_REFUSED",
  "STANDING_REVIEW_REQUIRED",
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
  /**
   * Phase 4B-B4 structured audit facts (optional, JSON-safe). Display
   * surfaces must render numbers/codes from here — never by parsing the
   * human-readable summary. Absent values render as omitted, never
   * invented.
   */
  readonly details: ActivityEventDetails | null;
}

/**
 * Structured facts carried by authority/action events. Every field
 * optional: only the emitting call site knows which facts it proved.
 */
export interface ActivityEventDetails {
  readonly proposedPct?: number | null;
  readonly proposedUsd?: number | null;
  readonly maxPct?: number | null;
  readonly maxNotional?: number | null;
  readonly existingUsd?: number | null;
  readonly projectedPct?: number | null;
  readonly reasonCodes?: readonly string[];
  readonly outcome?: string | null;
  /** Standing mandate that evaluated the action, when one did. */
  readonly mandateId?: string | null;
}

let activityCounter = 0;

/** Reset the in-memory sequence (tests only). */
export function __resetActivityCounterForTests(): void {
  activityCounter = 0;
}

/**
 * Globally unique activity id, generated at event creation.
 *
 * The old process-local `act-0001` sequence collided across serverless
 * cold starts: Postgres enforces UNIQUE(source_activity_event_id) and
 * proof ids derive from the event id, so a fresh process re-minting
 * act-0001 lost its INSERTs to unrelated historical rows. This id keeps
 * the `act-` prefix and a per-process sequence (ordering within one
 * process) but adds wall-clock time and cryptographic randomness, making
 * cross-process/cross-instance collision practically impossible without
 * depending on any mutable shared counter. Secret-free (time + counter
 * + randomness, no credentials), URL-safe, ~22 chars (well under the
 * 64-char proof/repository bounds). Historical act-NNNN rows are
 * untouched — they simply never recur.
 */
export function createActivityId(nowMs: number = Date.now()): string {
  activityCounter += 1;
  return `act-${nowMs.toString(36)}-${activityCounter.toString(36)}-${randomBytes(3).toString("hex")}`;
}

export function emitActivityEvent(
  store: TenaxDevStore,
  input: {
    readonly type: ActivityEventType;
    readonly flowId: string;
    readonly summary: string;
    readonly receiptId?: string | null;
    readonly details?: ActivityEventDetails | null;
  },
  nowMs: number = Date.now(),
): ActivityEvent {
  const event: ActivityEvent = {
    id: createActivityId(nowMs),
    type: input.type,
    flowId: input.flowId,
    createdAt: new Date(nowMs).toISOString(),
    summary: input.summary,
    receiptId: input.receiptId ?? null,
    details: input.details ?? null,
  };
  store.activities.push(event);
  return event;
}
