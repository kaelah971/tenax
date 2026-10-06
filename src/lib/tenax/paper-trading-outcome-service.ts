import {
  applyTrustedOutcomeObservation,
  trustedOutcomeObservationSchema,
  type TrustedOutcomeObservation,
} from "./paper-trading-outcomes.ts";
import type { PaperTradingRunRepository } from "./paper-trading-run-repository.ts";

export interface PaperTradingOutcomeReconciliationResult {
  readonly examined: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
}

/**
 * Apply already-trusted, injected observations. This service never contacts a
 * provider and only moves outcome evidence monotonically toward stronger
 * states.
 */
export async function reconcilePaperTradingOutcomes(
  repository: PaperTradingRunRepository,
  rawObservations: readonly TrustedOutcomeObservation[],
): Promise<PaperTradingOutcomeReconciliationResult> {
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  for (const raw of rawObservations) {
    const observation = trustedOutcomeObservationSchema.parse(raw);
    const run = await repository.getRun(observation.runId);
    if (!run) {
      skipped += 1;
      continue;
    }
    const next = applyTrustedOutcomeObservation(run, observation);
    if (!next) {
      unchanged += 1;
      continue;
    }
    const stored = await repository.updateRun(next);
    if (stored) updated += 1;
    else skipped += 1;
  }
  return {
    examined: rawObservations.length,
    updated,
    unchanged,
    skipped,
  };
}
