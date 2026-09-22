// Tenax Phase 4B-B2 — execution authority binding (pure domain).
//
// An ExecutionAuthority is the immutable authorization snapshot an
// execution is bound to. Two legitimate sources exist:
//
// - HUMAN_APPROVAL: a human granted THIS proposal via the approval
//   pipeline. Carries the approval id; all legacy approval gates keep
//   evaluating the underlying approval record unchanged.
// - STANDING_MANDATE: a prior standing-authority evaluation returned
//   AUTHORIZED for THIS proposal. Carries mandate id/hash + evaluation
//   time. It is NEVER a human approval record and must never be
//   presented as one.
//
// Binding is always to the EXACT proposal content hash. Any post-binding
// proposal mutation invalidates the authority. Pure, no network, no clock
// except injected timestamps.

import type { ExecutionMode, ProtectionProposal } from "./domain";
import type { ProtectionApproval } from "./approval";
import { hashProposal } from "./approval";
import type { AuthoritySource } from "./standing-mandate";

export interface ExecutionAuthority {
  readonly authoritySource: AuthoritySource;
  readonly proposalHash: string;
  readonly authorizedAt: string;
  /** Present only for HUMAN_APPROVAL. */
  readonly approvalId: string | null;
  /** Present only for STANDING_MANDATE. */
  readonly standingMandateId: string | null;
  readonly standingMandateHash: string | null;
  readonly authorityDecision: "AUTHORIZED" | null;
  readonly authorityEvaluatedAt: string | null;
  /**
   * Idempotency anchor binding flow + proposal + mandate. Null for the
   * human path (which keeps its own deterministic clientOid binding).
   */
  readonly reservationKey: string | null;
}

/** Bind a granted human approval to its exact proposal. No new record. */
export function bindHumanAuthority(
  approval: ProtectionApproval,
  proposal: ProtectionProposal,
  nowMs: number = Date.now(),
): ExecutionAuthority {
  return {
    authoritySource: "HUMAN_APPROVAL",
    proposalHash: hashProposal(proposal),
    authorizedAt: new Date(nowMs).toISOString(),
    approvalId: approval.id,
    standingMandateId: null,
    standingMandateHash: null,
    authorityDecision: null,
    authorityEvaluatedAt: null,
    reservationKey: null,
  };
}

export interface StandingAuthorityBinding {
  readonly mandateId: string;
  readonly mandateHash: string | null;
  readonly evaluatedAt: string;
}

/**
 * Bind a standing AUTHORIZED evaluation to its exact proposal. Requires
 * decision AUTHORIZED — ESCALATE/REFUSED can never bind. The mandate
 * id/hash pin which immutable policy authorized this action.
 */
export function bindStandingAuthority(
  binding: StandingAuthorityBinding,
  proposal: ProtectionProposal,
  flowId: string,
  nowMs: number = Date.now(),
): ExecutionAuthority {
  const proposalHash = hashProposal(proposal);
  return {
    authoritySource: "STANDING_MANDATE",
    proposalHash,
    authorizedAt: new Date(nowMs).toISOString(),
    approvalId: null,
    standingMandateId: binding.mandateId,
    standingMandateHash: binding.mandateHash,
    authorityDecision: "AUTHORIZED",
    authorityEvaluatedAt: binding.evaluatedAt,
    reservationKey: `${flowId}:${proposalHash}:${binding.mandateHash ?? "nohash"}`,
  };
}

/** True only when the authority binds this exact proposal content. */
export function isAuthorityValidFor(
  authority: ExecutionAuthority,
  proposal: ProtectionProposal,
): boolean {
  if (authority.authoritySource === "HUMAN_APPROVAL") {
    return authority.approvalId !== null && authority.proposalHash === hashProposal(proposal);
  }
  return (
    authority.authorityDecision === "AUTHORIZED" &&
    authority.standingMandateId !== null &&
    authority.proposalHash === hashProposal(proposal)
  );
}

/**
 * Gate attestation consumed by the Demo executor gates. Carries the same
 * binding facts the human approval record carries (proposal hash, mode,
 * timestamp) sourced from standing authority instead — never a faked
 * approval.
 */
export interface StandingGateAttestation {
  readonly proposalHash: string;
  readonly executionMode: ExecutionMode;
  readonly authorizedAt: string;
  readonly mandateId: string;
  readonly mandateHash: string | null;
}

export function attestationFromAuthority(
  authority: ExecutionAuthority,
  executionMode: ExecutionMode,
): StandingGateAttestation | null {
  if (authority.authoritySource !== "STANDING_MANDATE") return null;
  if (authority.authorityDecision !== "AUTHORIZED" || authority.standingMandateId === null) {
    return null;
  }
  return {
    proposalHash: authority.proposalHash,
    executionMode,
    authorizedAt: authority.authorizedAt,
    mandateId: authority.standingMandateId,
    mandateHash: authority.standingMandateHash,
  };
}
