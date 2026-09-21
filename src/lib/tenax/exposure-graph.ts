// Tenax Phase 3A — canonical NVIDIA Exposure Graph (pure domain).
//
// Tenax reasons about ONE economic subject (NVIDIA) across MANY
// representations (rNVDA on Bitget Reality, NVDAUSDT on Bitget Demo, future
// ecosystems later). Tickers are leaves; the subject is the root.
//
// Guarantees:
// - Pure and deterministic: no network, no credentials, no LLM, no writes.
// - No second source of truth: the graph derives from canonical Tenax state
//   (the Exposure fixture + a completed DecisionReceipt when one exists).
// - No fabricated legs: without a BITGET_DEMO execution record the
//   protection leg is ABSENT — never invented, never zero-filled.
// - No guessed values: unverified quantities stay null and propagate null
//   through the aggregation instead of being estimated.
// - Simulated stays simulated: the $500 rNVDA leg is valueSource "fixture"
//   and must be labelled as such in any UI. It is NOT live ownership.
// - Available is not owned: "available" leaves describe discoverable
//   external assets (no quantity, no value, no direction). A real token
//   existing somewhere does NOT mean the user owns it.
// - Plain language only: "approximate protected notional" and "remaining
//   mapped exposure". Never delta-neutral, never fully hedged, never an
//   equity beta/delta equivalence claim.

import { parseAmount } from "../bitget/demo-assets.ts";
import type { DecisionReceipt, Exposure } from "./domain.ts";

/** Phase 3A supports exactly one economic subject. Others refuse. */
export const NVDA_SUBJECT_ID = "NVDA" as const;
export type ExposureSubjectId = typeof NVDA_SUBJECT_ID;

/** Where a graph fact came from. Mirrors receipt/provenance vocabulary. */
export type GraphProvenance = "REAL" | "SIMULATED" | "DEMO" | "DEV" | "UNAVAILABLE";

/** A representation either carries the exposure, protects the subject, or is a discoverable external asset the user does not hold. */
export type RepresentationRole = "exposure" | "protection" | "available";

/** Ecosystems with a typed adapter today; everything else is "unknown". */
export type RepresentationEcosystem = "Bitget" | "unknown";

/** Instrument shapes with a typed adapter today; else "unknown". */
export type RepresentationInstrumentType = "spot" | "perpetual" | "unknown";

/** Position direction. Null when unknown or not executed — never guessed. */
export type RepresentationDirection = "long" | "short" | null;

/** Leg lifecycle. "unknown" covers unrecognized provider states. */
export type RepresentationStatus =
  | "online"
  | "offline"
  | "unknown"
  | "not_executed";

/** One instrument/wrapper carrying exposure to the economic subject. */
export interface GraphRepresentation {
  /** Stable leaf id, e.g. "rNVDA" or "NVDAUSDT". */
  readonly representationId: string;
  readonly subjectId: ExposureSubjectId;
  /** Provider symbol, e.g. "RNVDAUSDT" or "NVDAUSDT". */
  readonly symbol: string;
  /** Human venue, e.g. "Bitget Reality" or "Bitget Demo". */
  readonly venue: string;
  readonly ecosystem: RepresentationEcosystem;
  readonly instrumentType: RepresentationInstrumentType;
  readonly role: RepresentationRole;
  readonly direction: RepresentationDirection;
  /** Decimal quantity string when actually known (verified exec qty). */
  readonly quantity: string | null;
  /** USD value when actually known (simulated leg value / verified exec value). */
  readonly usdValue: number | null;
  /** Effective leverage label, e.g. "1x" for the Demo hedge. */
  readonly leverage: string | null;
  /** Margin mode label, e.g. "crossed" for the Demo hedge. */
  readonly marginMode: string | null;
  readonly status: RepresentationStatus;
  readonly provenance: GraphProvenance;
  /** Honest one-line human label, e.g. "SIMULATED — NOT LIVE OWNERSHIP". */
  readonly note: string | null;
}

/** Whether a verified Demo hedge currently backs the protection leg. */
export type ProtectionPresence = "ABSENT" | "PRESENT";

/** How far post-submission verification has progressed. */
export type HedgeVerification = "VERIFIED" | "SUBMITTED" | "ABSENT";

/** The canonical graph: one subject, N representations, honest aggregates. */
export interface ExposureGraph {
  readonly subjectId: ExposureSubjectId;
  readonly canonicalTicker: "NVDA";
  readonly name: "NVIDIA";
  readonly representations: readonly GraphRepresentation[];
  /** Simulated long NVIDIA exposure in USD (fixture value, never live). */
  readonly grossExposureUsd: number | null;
  /**
   * Verified executed hedge notional in USD. Only the provider-confirmed
   * executed value counts — never the approved/requested notional, never
   * an estimate. Null until verification arrives.
   */
  readonly protectedNotionalUsd: number | null;
  /**
   * Remaining mapped exposure: gross minus verified hedge, rounded to
   * cents. Null when either input is unknown. An approximate mapping,
   * not a risk equivalence claim.
   */
  readonly remainingExposureUsd: number | null;
  readonly protection: ProtectionPresence;
  readonly hedgeVerification: HedgeVerification;
  /** Latest COMPLETED flow the graph reflects; null when no flow completed. */
  readonly sourceFlowId: string | null;
}

export interface BuildExposureGraphInput {
  /** Canonical exposure state (the simulated rNVDA fixture in Phase 3A). */
  readonly exposure: Exposure;
  /** Completed-flow receipt when one exists; null/undefined means no hedge. */
  readonly receipt?: DecisionReceipt | null;
  /** Flow the receipt belongs to; recorded as the leg's source. */
  readonly flowId?: string | null;
}

/** Round a USD aggregate to cents so float arithmetic stays deterministic. */
export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildExposureLeg(exposure: Exposure): GraphRepresentation {
  const rep = exposure.representation;
  return {
    representationId: rep.baseCoin,
    subjectId: NVDA_SUBJECT_ID,
    symbol: rep.symbol,
    venue: rep.venue,
    ecosystem: "Bitget",
    instrumentType: "spot",
    role: "exposure",
    direction: "long",
    quantity: null,
    usdValue: exposure.exposureValueUsdt,
    leverage: null,
    marginMode: null,
    status: rep.status === "online" ? "online" : "unknown",
    provenance: "SIMULATED",
    note: "SIMULATED — NOT LIVE OWNERSHIP",
  };
}

function buildProtectionLeg(
  receipt: DecisionReceipt,
): { leg: GraphRepresentation; verifiedValue: number | null; verified: boolean } | null {
  const demo = receipt.demoExecution;
  if (receipt.executionMode !== "BITGET_DEMO" || !demo) return null;
  const requestQty =
    receipt.request.mode === "BITGET_DEMO" ? receipt.request.qty : null;
  const verifiedValue = parseAmount(demo.cumExecValue);
  const verified = demo.filled && verifiedValue !== null;
  return {
    leg: {
      representationId: "NVDAUSDT",
      subjectId: NVDA_SUBJECT_ID,
      symbol: "NVDAUSDT",
      venue: "Bitget Demo",
      ecosystem: "Bitget",
      instrumentType: "perpetual",
      role: "protection",
      direction: "short",
      quantity: demo.cumExecQty ?? requestQty,
      usdValue: verifiedValue,
      leverage: demo.leverage,
      marginMode: demo.marginMode,
      status: "online",
      provenance: "DEMO",
      note: verified
        ? "VERIFIED · VIRTUAL FUNDS ONLY"
        : "SUBMITTED · AWAITING VERIFICATION — VIRTUAL FUNDS ONLY",
    },
    verifiedValue,
    verified,
  };
}

/**
 * Build the canonical NVIDIA graph from canonical state. The exposure leg
 * always derives from the passed exposure; the protection leg appears only
 * when the receipt carries a BITGET_DEMO execution record. Anything else —
 * DRY_RUN receipts, missing receipts, unparseable values — yields an
 * ABSENT protection leg and null hedge aggregates. Never throws on
 * unknown data; throws only on a non-NVIDIA subject (out of Phase 3A scope).
 */
export function buildExposureGraph(input: BuildExposureGraphInput): ExposureGraph {
  if (input.exposure.underlying !== NVDA_SUBJECT_ID) {
    throw new Error(
      `GRAPH_UNSUPPORTED_SUBJECT: Phase 3A maps NVIDIA only (got ${input.exposure.underlying})`,
    );
  }
  const exposureLeg = buildExposureLeg(input.exposure);
  const protection = input.receipt ? buildProtectionLeg(input.receipt) : null;

  const representations: GraphRepresentation[] =
    protection === null ? [exposureLeg] : [exposureLeg, protection.leg];
  const grossExposureUsd = exposureLeg.usdValue;
  const protectedNotionalUsd = protection === null ? null : protection.verifiedValue;
  const remainingExposureUsd =
    grossExposureUsd === null || protectedNotionalUsd === null
      ? null
      : roundToCents(grossExposureUsd - protectedNotionalUsd);

  return {
    subjectId: NVDA_SUBJECT_ID,
    canonicalTicker: "NVDA",
    name: "NVIDIA",
    representations,
    grossExposureUsd,
    protectedNotionalUsd,
    remainingExposureUsd,
    protection: protection === null ? "ABSENT" : "PRESENT",
    hedgeVerification:
      protection === null ? "ABSENT" : protection.verified ? "VERIFIED" : "SUBMITTED",
    sourceFlowId: input.flowId ?? null,
  };
}

/**
 * Attach a future representation (another exchange, onchain tokenized
 * stock, another chain) without changing the subject model. The leaf must
 * reference this graph's subject; Phase 3A aggregation is untouched by
 * attached leaves until typed adapters land — unknown values stay unknown.
 */
export function withRepresentation(
  graph: ExposureGraph,
  representation: GraphRepresentation,
): ExposureGraph {
  if (representation.subjectId !== graph.subjectId) {
    throw new Error(
      `GRAPH_SUBJECT_MISMATCH: leaf ${representation.representationId} maps ${representation.subjectId}, graph maps ${graph.subjectId}`,
    );
  }
  if (
    graph.representations.some((r) => r.representationId === representation.representationId)
  ) {
    throw new Error(
      `GRAPH_DUPLICATE_LEAF: ${representation.representationId} already attached`,
    );
  }
  return { ...graph, representations: [...graph.representations, representation] };
}
