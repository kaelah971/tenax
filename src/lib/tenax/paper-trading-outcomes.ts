import { z } from "zod";

import type { PaperTradingRun, PaperRunSource } from "./paper-trading-run.ts";

export const trustedOutcomeObservationSchema = z.object({
  runId: z.string().min(1).max(128),
  kind: z.enum(["MARK", "EXIT"]),
  source: z.enum(["BITGET_PUBLIC", "BITGET_DEMO_PRIVATE"]),
  observedAt: z.string().datetime({ offset: true }),
  price: z.number().finite().positive(),
  size: z.string().nullable().optional(),
  orderId: z.string().trim().min(1).nullable().optional(),
  feesUsdt: z.number().finite().nonnegative().nullable().optional(),
  positionState: z.enum(["OPEN", "CLOSED", "UNKNOWN"]).optional(),
  attributableToRun: z.boolean().optional(),
}).strict();
export type TrustedOutcomeObservation = z.infer<typeof trustedOutcomeObservationSchema>;

function finiteString(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function changed(current: PaperTradingRun, next: PaperTradingRun): PaperTradingRun | null {
  return JSON.stringify(current) === JSON.stringify(next) ? null : next;
}

function entryFacts(run: PaperTradingRun): { readonly price: number; readonly size: number } | null {
  if (run.execution.status !== "FILLED" || run.execution.price === null) return null;
  const size = finiteString(run.execution.size);
  return size === null ? null : { price: run.execution.price, size };
}

function markRun(run: PaperTradingRun, observation: TrustedOutcomeObservation): PaperTradingRun | null {
  if (observation.source !== "BITGET_PUBLIC" || observation.kind !== "MARK") return null;
  if (run.outcome.outcomeState === "REALIZED") return null;
  if (run.outcome.markAt !== null && run.outcome.markAt >= observation.observedAt) return null;
  const entry = entryFacts(run);
  if (!entry) return null;
  if (observation.positionState === "CLOSED") {
    return changed(run, {
      ...run,
      outcome: {
        ...run.outcome,
        outcomeState: "UNAVAILABLE",
        markPrice: null,
        markAt: null,
        markSource: null,
        markPnlUsdt: null,
        markReturnPct: null,
        unrealizedPnlUsdt: null,
        pnlObservedAt: null,
      },
      provenance: { ...run.provenance, outcome: "BITGET_PUBLIC" },
    });
  }
  const markPnlUsdt = (entry.price - observation.price) * entry.size;
  const entryNotional = entry.price * entry.size;
  return changed(run, {
    ...run,
    outcome: {
      ...run.outcome,
      outcomeState: "OPEN_MARK",
      markPrice: observation.price,
      markAt: observation.observedAt,
      markSource: observation.source as PaperRunSource,
      markPnlUsdt,
      markReturnPct: entryNotional > 0 ? (markPnlUsdt / entryNotional) * 100 : null,
      unrealizedPnlUsdt: markPnlUsdt,
      pnlObservedAt: observation.observedAt,
    },
    provenance: { ...run.provenance, outcome: observation.source as PaperRunSource },
  });
}

function exitRun(run: PaperTradingRun, observation: TrustedOutcomeObservation): PaperTradingRun | null {
  if (observation.source !== "BITGET_DEMO_PRIVATE" || observation.kind !== "EXIT") return null;
  if (observation.attributableToRun !== true || !observation.orderId) return null;
  if (run.outcome.outcomeState === "REALIZED") return null;
  const entry = entryFacts(run);
  const exitSize = finiteString(observation.size ?? null);
  if (!entry || exitSize === null) return null;
  const realizedPnlUsdt = (entry.price - observation.price) * exitSize;
  const entryNotional = entry.price * exitSize;
  const feesUsdt = observation.feesUsdt ?? null;
  return changed(run, {
    ...run,
    outcome: {
      ...run.outcome,
      outcomeState: "REALIZED",
      exitPrice: observation.price,
      exitSize: observation.size ?? null,
      exitAt: observation.observedAt,
      exitProviderOrderId: observation.orderId,
      exitSource: observation.source as PaperRunSource,
      realizedPnlUsdt,
      realizedReturnPct: entryNotional > 0 ? (realizedPnlUsdt / entryNotional) * 100 : null,
      feesUsdt,
      netRealizedPnlUsdt: feesUsdt === null ? null : realizedPnlUsdt - feesUsdt,
      pnlObservedAt: observation.observedAt,
      unrealizedPnlUsdt: null,
    },
    provenance: { ...run.provenance, outcome: observation.source as PaperRunSource },
  });
}

export function applyTrustedOutcomeObservation(
  run: PaperTradingRun,
  rawObservation: TrustedOutcomeObservation,
): PaperTradingRun | null {
  const observation = trustedOutcomeObservationSchema.parse(rawObservation);
  if (observation.runId !== run.runId) return null;
  return observation.kind === "MARK" ? markRun(run, observation) : exitRun(run, observation);
}
