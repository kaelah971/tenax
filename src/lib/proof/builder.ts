// Tenax Phase 4B-B6.1 — JudgeProof builder.
//
// Maps one canonical activity event (+ the receipt and mandate it points
// at) to a sanitized JudgeProof, or null when the event is not
// proof-worthy. Pure field picking: numbers, codes, ids, and timestamps
// only — unknown/absent values become explicit nulls, never guesses.
//
// Fill truth is strict: EXECUTION_FILLED requires a stored receipt with
// executionMode BITGET_DEMO and demoExecution.filled === true. A provider
// success code alone (or a SUBMITTED event, or any DRY_RUN record) can
// never produce an execution proof.

import type { ActivityEvent } from "../tenax/activity";
import type { DecisionReceipt, DemoExecutionRecord } from "../tenax/domain";
import type { TenaxDevStore } from "../tenax/dev-store";
import type { StandingMandate } from "../tenax/standing-mandate";
import {
  proofIdFor,
  PROOF_VERSION,
  type JudgeProof,
  type ProofKind,
} from "./model.ts";

function readReceipt(store: TenaxDevStore, flowId: string): DecisionReceipt | null {
  try {
    return store.flows.get(flowId)?.getReceipt() ?? null;
  } catch {
    return null;
  }
}

function finiteOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cleanCodes(codes: readonly string[] | undefined): string[] {
  if (!codes) return [];
  return codes.filter((c) => typeof c === "string" && c.length > 0).slice(0, 20);
}

function mandateSnapshotFor(
  store: TenaxDevStore,
  mandateId: string | null | undefined,
): JudgeProof["mandateSnapshot"] {
  if (!mandateId) return null;
  const mandate: StandingMandate | undefined = store.mandates.get(mandateId);
  if (!mandate) return null;
  return {
    mandateId: mandate.id,
    mode: mandate.policy.authorityMode,
    maxProtectionPct: mandate.policy.maxProtectionPct,
    maxNotionalUsdt: mandate.policy.maxNotionalUsdt,
    maxExecutions: mandate.policy.maxExecutions,
    mandateHash: mandate.mandateHash,
  };
}

function baseAuthority(
  store: TenaxDevStore,
  mandateId: string | null | undefined,
): JudgeProof["authority"] {
  if (!mandateId) {
    return { source: "STANDING_MANDATE", mode: null, mandateId: null, mandateHash: null };
  }
  const mandate = store.mandates.get(mandateId);
  return {
    source: "STANDING_MANDATE",
    mode: mandate?.policy.authorityMode ?? null,
    mandateId,
    mandateHash: mandate?.mandateHash ?? null,
  };
}

function baseProposal(details: ActivityEvent["details"]): JudgeProof["proposal"] {
  return {
    protectionPct: finiteOrNull(details?.proposedPct ?? null),
    notionalUsd: finiteOrNull(details?.proposedUsd ?? null),
    side: "sell",
    action: "SHORT_HEDGE",
  };
}

function executionFromDemo(
  demo: DemoExecutionRecord,
  status: "FILLED" | "FAILED",
): JudgeProof["execution"] {
  return {
    environment: "BITGET_DEMO",
    provider: "Bitget",
    providerOrderId: demo.orderId,
    quantity: demo.cumExecQty,
    avgFillPrice: demo.avgPrice,
    executedValueUsdt: finiteOrNull(demo.cumExecValue),
    status,
    fundsLabel: "DEMO · VIRTUAL FUNDS",
  };
}

/**
 * Build the durable proof for one activity event. Returns null for
 * non-proof event types and whenever the required corroborating truth
 * (verified fill, receipt) is absent. Never throws for unknown shapes —
 * callers treat null as "nothing durable to record".
 */
export function buildJudgeProof(
  store: TenaxDevStore,
  event: ActivityEvent,
  nowMs: number = Date.now(),
): JudgeProof | null {
  const details = event.details;
  const reasonCodes = cleanCodes(details?.reasonCodes);
  const recordedAt = new Date(nowMs).toISOString();
  const provenance = {
    evidenceSource: "TENAX_ACTIVITY_RECEIPT" as const,
    recordedAt,
    imported: false,
    importSource: null,
  };

  switch (event.type) {
    case "AUTONOMOUS_EXECUTION_FILLED": {
      const receipt = readReceipt(store, event.flowId);
      const demo = receipt?.demoExecution ?? null;
      if (!receipt || receipt.executionMode !== "BITGET_DEMO" || !demo || demo.filled !== true) {
        return null;
      }
      const kind: ProofKind = "EXECUTION_FILLED";
      const mandateId = receipt.standingMandateId ?? details?.mandateId ?? null;
      return {
        id: proofIdFor(kind, event.id),
        version: PROOF_VERSION,
        kind,
        flowId: event.flowId,
        subject: "NVDA",
        symbol: "NVDAUSDT",
        createdAt: event.createdAt,
        outcome: "FILLED · VERIFIED",
        authority: {
          source: receipt.authoritySource ?? null,
          mode: mandateId ? (store.mandates.get(mandateId)?.policy.authorityMode ?? null) : null,
          mandateId,
          mandateHash: receipt.standingMandateHash ?? null,
        },
        proposal: {
          protectionPct: receipt.proposedProtectionPct,
          notionalUsd: receipt.proposedTradeValueUsdt,
          side: "sell",
          action: "SHORT_HEDGE",
        },
        mandateSnapshot: mandateSnapshotFor(store, mandateId),
        execution: executionFromDemo(demo, "FILLED"),
        receiptId: event.receiptId,
        reasonCodes,
        sourceActivityEventId: event.id,
        provenance,
      };
    }
    case "AUTONOMOUS_EXECUTION_FAILED": {
      const kind: ProofKind = "EXECUTION_FAILED";
      return {
        id: proofIdFor(kind, event.id),
        version: PROOF_VERSION,
        kind,
        flowId: event.flowId,
        subject: "NVDA",
        symbol: "NVDAUSDT",
        createdAt: event.createdAt,
        outcome: "FAILED — NO POSITION OPENED",
        authority: baseAuthority(store, details?.mandateId),
        proposal: baseProposal(details),
        mandateSnapshot: mandateSnapshotFor(store, details?.mandateId),
        execution: null,
        receiptId: event.receiptId,
        reasonCodes,
        sourceActivityEventId: event.id,
        provenance,
      };
    }
    case "STANDING_AUTHORITY_ESCALATED": {
      const kind: ProofKind = "AUTHORITY_ESCALATED";
      return {
        id: proofIdFor(kind, event.id),
        version: PROOF_VERSION,
        kind,
        flowId: event.flowId,
        subject: "NVDA",
        symbol: "NVDAUSDT",
        createdAt: event.createdAt,
        outcome: "NO AUTONOMOUS ORDER SENT",
        authority: baseAuthority(store, details?.mandateId),
        proposal: baseProposal(details),
        mandateSnapshot: mandateSnapshotFor(store, details?.mandateId),
        execution: null,
        receiptId: event.receiptId,
        reasonCodes,
        sourceActivityEventId: event.id,
        provenance,
      };
    }
    case "STANDING_AUTHORITY_REFUSED": {
      const kind: ProofKind = "AUTHORITY_REFUSED";
      return {
        id: proofIdFor(kind, event.id),
        version: PROOF_VERSION,
        kind,
        flowId: event.flowId,
        subject: "NVDA",
        symbol: "NVDAUSDT",
        createdAt: event.createdAt,
        outcome: "NO ORDER SENT",
        authority: baseAuthority(store, details?.mandateId),
        proposal: baseProposal(details),
        mandateSnapshot: mandateSnapshotFor(store, details?.mandateId),
        execution: null,
        receiptId: event.receiptId,
        reasonCodes,
        sourceActivityEventId: event.id,
        provenance,
      };
    }
    case "STANDING_REVIEW_REQUIRED": {
      const kind: ProofKind = "REVIEW_REQUIRED";
      return {
        id: proofIdFor(kind, event.id),
        version: PROOF_VERSION,
        kind,
        flowId: event.flowId,
        subject: "NVDA",
        symbol: "NVDAUSDT",
        createdAt: event.createdAt,
        outcome: "HUMAN REVIEW REQUIRED — NO AUTONOMOUS ORDER SENT",
        authority: baseAuthority(store, details?.mandateId),
        proposal: baseProposal(details),
        mandateSnapshot: mandateSnapshotFor(store, details?.mandateId),
        execution: null,
        receiptId: event.receiptId,
        reasonCodes,
        sourceActivityEventId: event.id,
        provenance,
      };
    }
    default:
      return null;
  }
}
