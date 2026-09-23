// Tenax Phase 4B-B6.1 — proof write seam.
//
// One centralized path from canonical activity/receipt truth to durable
// evidence: build the proof, then upsert it. Proof storage is downstream
// evidence only — a storage failure (or absence) returns null and can
// never alter the authority result, trigger another provider write, or
// convert a refusal into a success. Never throws.

import type { ActivityEvent } from "../tenax/activity";
import type { TenaxDevStore } from "../tenax/dev-store";
import { buildJudgeProof } from "./builder";
import type { JudgeProof } from "./model";
import { getProofRepository, type ProofRepository } from "./repository";

export async function recordJudgeProof(
  store: TenaxDevStore,
  event: ActivityEvent,
  repo?: ProofRepository,
): Promise<JudgeProof | null> {
  try {
    const proof = buildJudgeProof(store, event);
    if (!proof) return null;
    const repository = repo ?? getProofRepository().repo;
    return await repository.saveProof(proof);
  } catch {
    return null;
  }
}
