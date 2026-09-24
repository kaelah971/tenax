// Tenax Phase 4B-B6.2 — proof write seam.
//
// One centralized path from canonical activity/receipt truth to durable
// evidence: build the proof, then upsert it. Proof storage is downstream
// evidence only — a storage failure can never alter the authority result,
// trigger another provider write, or convert a refusal into a success.

import type { ActivityEvent, ActivityEventType } from "../tenax/activity.ts";
import type { TenaxDevStore } from "../tenax/dev-store.ts";
import { buildJudgeProof } from "./builder.ts";
import type { JudgeProof } from "./model.ts";
import { getProofRepository, type ProofRepository } from "./repository.ts";

export type ProofPersistenceErrorCode =
  | "PROOF_RECORD_INVALID"
  | "PROOF_STORE_UNAVAILABLE"
  | "PROOF_STORE_CORRUPT"
  | "PROOF_STORE_FAILURE";

export class ProofPersistenceError extends Error {
  readonly code: ProofPersistenceErrorCode;
  readonly eventId: string;
  readonly flowId: string;
  readonly eventType: ActivityEventType;

  constructor(code: ProofPersistenceErrorCode, event: ActivityEvent) {
    super(code);
    this.name = "ProofPersistenceError";
    this.code = code;
    this.eventId = event.id;
    this.flowId = event.flowId;
    this.eventType = event.type;
  }
}

function persistenceErrorCode(error: unknown): ProofPersistenceErrorCode {
  const message = error instanceof Error ? error.message : null;
  switch (message) {
    case "PROOF_RECORD_INVALID":
    case "PROOF_STORE_UNAVAILABLE":
    case "PROOF_STORE_CORRUPT":
      return message;
    default:
      return "PROOF_STORE_FAILURE";
  }
}

export async function recordJudgeProof(
  store: TenaxDevStore,
  event: ActivityEvent,
  repo?: ProofRepository,
): Promise<JudgeProof | null> {
  const proof = buildJudgeProof(store, event);
  if (!proof) return null;

  try {
    const repository = repo ?? getProofRepository().repo;
    return await repository.saveProof(proof);
  } catch (error) {
    const code = persistenceErrorCode(error);
    console.error("[TENAX_PROOF_PERSISTENCE_FAILED]", {
      code,
      eventId: event.id,
      flowId: event.flowId,
      eventType: event.type,
    });
    throw new ProofPersistenceError(code, event);
  }
}

export interface ProofReconciliationFailure {
  readonly eventId: string;
  readonly flowId: string;
  readonly code: ProofPersistenceErrorCode;
}

export interface ProofReconciliationResult {
  readonly scanned: number;
  readonly proofWorthy: number;
  readonly persistedOrAlreadyPresent: number;
  readonly failures: readonly ProofReconciliationFailure[];
}

export async function reconcileJudgeProofs(
  store: TenaxDevStore,
  repo?: ProofRepository,
): Promise<ProofReconciliationResult> {
  const activities = [...store.activities];
  let proofWorthy = 0;
  let persistedOrAlreadyPresent = 0;
  const failures: ProofReconciliationFailure[] = [];

  for (const event of activities) {
    if (!buildJudgeProof(store, event)) continue;
    proofWorthy += 1;
    try {
      await recordJudgeProof(store, event, repo);
      persistedOrAlreadyPresent += 1;
    } catch (error) {
      if (!(error instanceof ProofPersistenceError)) throw error;
      failures.push({
        eventId: event.id,
        flowId: event.flowId,
        code: error.code,
      });
    }
  }

  return {
    scanned: activities.length,
    proofWorthy,
    persistedOrAlreadyPresent,
    failures,
  };
}
