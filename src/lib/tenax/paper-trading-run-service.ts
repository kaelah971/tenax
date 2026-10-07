// Best-effort wiring from canonical Tenax activity/proof truth to the run ledger.
// Ledger persistence never changes authority or execution outcomes.

import { buildJudgeProof } from "../proof/builder.ts";
import type { JudgeProof } from "../proof/model.ts";
import type { ActivityEvent } from "./activity.ts";
import type { TenaxDevStore } from "./dev-store.ts";
import {
  buildPaperTradingRun,
  isPaperTradingTerminalActivityType,
  type PaperTradingRun,
  type PaperRunTerminalInput,
} from "./paper-trading-run.ts";
import {
  getPaperTradingRunRepository,
  type PaperTradingRunRepository,
} from "./paper-trading-run-repository.ts";

export interface PaperTradingRunReconciliationResult {
  readonly examined: number;
  readonly terminalCandidates: number;
  readonly persisted: number;
  readonly skipped: number;
}

export async function persistPaperTradingRun(input: {
  readonly store: TenaxDevStore;
  readonly flowId?: string;
  readonly event?: ActivityEvent | null;
  readonly proof?: JudgeProof | null;
  readonly terminal?: PaperRunTerminalInput;
  readonly repository?: PaperTradingRunRepository;
  readonly nowMs?: number;
}): Promise<PaperTradingRun | null> {
  const event = input.event ?? null;
  if (event && !isPaperTradingTerminalActivityType(event.type)) return null;
  try {
    const run = buildPaperTradingRun({
      store: input.store,
      flowId: input.flowId ?? event?.flowId ?? "unknown",
      event,
      proof: input.proof,
      terminal: input.terminal,
      nowMs: input.nowMs,
    });
    return await (input.repository ?? getPaperTradingRunRepository()).saveRun(run);
  } catch {
    return null;
  }
}

function eventPriority(event: ActivityEvent): number {
  switch (event.type) {
    case "AUTONOMOUS_EXECUTION_FILLED":
    case "AUTONOMOUS_EXECUTION_FAILED":
      return 5;
    case "DETERMINISTIC_POLICY_REFUSED":
    case "STANDING_AUTHORITY_ESCALATED":
    case "STANDING_AUTHORITY_REFUSED":
    case "STANDING_REVIEW_REQUIRED":
      return 4;
    case "DECISION_RECEIPT_READY":
      return 3;
    default:
      return 0;
  }
}

function terminalEventsByFlow(events: readonly ActivityEvent[]): ActivityEvent[] {
  const selected = new Map<string, ActivityEvent>();
  for (const event of events) {
    if (!isPaperTradingTerminalActivityType(event.type)) continue;
    const current = selected.get(event.flowId);
    if (
      !current ||
      eventPriority(event) > eventPriority(current) ||
      (eventPriority(event) === eventPriority(current) && event.createdAt > current.createdAt)
    ) {
      selected.set(event.flowId, event);
    }
  }
  return [...selected.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Idempotently materialize all terminal activity currently supported by the
 * existing activity/proof stores. Missing corroboration stays UNKNOWN inside
 * the run; this function never calls a provider to fill gaps.
 */
export async function reconcilePaperTradingRuns(
  store: TenaxDevStore,
  repository: PaperTradingRunRepository = getPaperTradingRunRepository(),
  nowMs: number = Date.now(),
): Promise<PaperTradingRunReconciliationResult> {
  const events = [...store.activities];
  const candidates = terminalEventsByFlow(events);
  let persisted = 0;
  for (const event of candidates) {
    const proof = buildJudgeProof(store, event, nowMs);
    const run = await persistPaperTradingRun({ store, event, proof, repository, nowMs });
    if (run) persisted += 1;
  }
  return {
    examined: events.length,
    terminalCandidates: candidates.length,
    persisted,
    skipped: candidates.length - persisted,
  };
}

export async function persistPaperTradingCycle(input: {
  readonly store: TenaxDevStore;
  readonly flowId: string;
  readonly terminal: PaperRunTerminalInput;
  readonly repository?: PaperTradingRunRepository;
  readonly nowMs?: number;
}): Promise<PaperTradingRun | null> {
  return persistPaperTradingRun({
    store: input.store,
    flowId: input.flowId,
    terminal: input.terminal,
    repository: input.repository,
    nowMs: input.nowMs,
  });
}
