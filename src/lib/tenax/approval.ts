// Tenax Phase 1C — explicit human approval handling (MVP: human only).
//
// Guarantees:
// - PASS + approval-required does NOT mean executable yet.
// - REFUSE can never be approved into execution.
// - Approval binds to the EXACT proposal (content hash) and mandate verdict;
//   any post-approval proposal mutation invalidates it.
// - Approval records carry id, bound proposal/decision identity, status,
//   timestamp, and actor/type.

import type { ApprovalState, MandateDecision, ProtectionProposal } from "./domain";

export type ApprovalActor = "human";

export interface ProtectionApproval {
  readonly id: string;
  readonly intentId: string;
  readonly proposalHash: string;
  readonly mandateVerdict: "PASS" | "REFUSE";
  readonly state: ApprovalState;
  readonly actor: ApprovalActor;
  readonly approvedAt: string | null;
}

/** Deterministic content hash (FNV-1a over canonical JSON). No imports. */
export function hashProposal(proposal: ProtectionProposal): string {
  const canonical = JSON.stringify({
    leverageUsed: proposal.leverageUsed,
    proposedTradeValueUsdt: proposal.proposedTradeValueUsdt,
    protectionPct: proposal.protectionPct,
    underlying: proposal.underlying,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `ph-${hash.toString(16).padStart(8, "0")}`;
}

let approvalCounter = 0;

/** Reset the in-memory counter (tests only). */
export function __resetApprovalCounterForTests(): void {
  approvalCounter = 0;
}

/**
 * Open an approval request for a PASS decision. REFUSE decisions cannot
 * even enter the approval pipeline — requesting approval for one throws.
 */
export function createApprovalRequest(
  intentId: string,
  proposal: ProtectionProposal,
  decision: MandateDecision,
): ProtectionApproval {
  if (decision.verdict !== "PASS") {
    throw new Error(
      `APPROVAL_REFUSED: mandate verdict is ${decision.verdict} — refusal can never be approved into execution`,
    );
  }
  approvalCounter += 1;
  return {
    id: `approval-${String(approvalCounter).padStart(4, "0")}`,
    intentId,
    proposalHash: hashProposal(proposal),
    mandateVerdict: decision.verdict,
    state: "REQUIRED",
    actor: "human",
    approvedAt: null,
  };
}

/** Grant a pending human approval. Only REQUIRED → APPROVED, human actor. */
export function approveProtection(
  approval: ProtectionApproval,
  actor: ApprovalActor = "human",
  approvedAt: string = new Date().toISOString(),
): ProtectionApproval {
  if (approval.state !== "REQUIRED") {
    throw new Error(
      `APPROVAL_INVALID: only a REQUIRED approval can be granted (got ${approval.state})`,
    );
  }
  if (actor !== "human") {
    throw new Error(`APPROVAL_INVALID: MVP supports human approval only (got ${actor})`);
  }
  return { ...approval, state: "APPROVED", approvedAt };
}

/**
 * Full execution gate: approval must be APPROVED, bound to this exact
 * proposal content and this PASS decision. Anything else is rejected —
 * callers must treat a false return as "do not execute".
 */
export function isApprovalValidFor(
  approval: ProtectionApproval,
  proposal: ProtectionProposal,
  decision: MandateDecision,
): boolean {
  return (
    approval.state === "APPROVED" &&
    approval.approvedAt !== null &&
    approval.mandateVerdict === "PASS" &&
    decision.verdict === "PASS" &&
    approval.proposalHash === hashProposal(proposal)
  );
}
