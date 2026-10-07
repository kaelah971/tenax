// Tenax Phase 4B-B6.1 — judge proof display helpers (pure).
//
// Kind labels, tones, filter parsing, and money formatting for the judge
// proof pages. No data fetching, no secrets, no network.

import type { ProofKind } from "./model";

export const PROOF_FILTERS = ["ALL", "EXECUTED", "ESCALATED", "REFUSED", "REVIEW", "FAILED"] as const;
export type ProofFilter = (typeof PROOF_FILTERS)[number];

const FILTER_TO_KIND: Record<Exclude<ProofFilter, "ALL">, ProofKind> = {
  EXECUTED: "EXECUTION_FILLED",
  ESCALATED: "AUTHORITY_ESCALATED",
  REFUSED: "AUTHORITY_REFUSED",
  REVIEW: "REVIEW_REQUIRED",
  FAILED: "EXECUTION_FAILED",
};

/** Parse the ?kind= filter; anything unknown falls back to ALL. */
export function parseProofFilter(raw: string | null | undefined): ProofFilter {
  if (raw && (PROOF_FILTERS as readonly string[]).includes(raw)) {
    return raw as ProofFilter;
  }
  return "ALL";
}

/** Map a UI filter to the stored kind (null = no kind constraint). */
export function proofKindForFilter(filter: ProofFilter): ProofKind | null {
  if (filter === "ALL") return null;
  return FILTER_TO_KIND[filter];
}

export function proofKindLabel(kind: ProofKind): string {
  switch (kind) {
    case "EXECUTION_FILLED":
      return "PROTECTION EXECUTED";
    case "AUTHORITY_ESCALATED":
      return "HUMAN REVIEW REQUIRED";
    case "AUTHORITY_REFUSED":
      return "TENAX REFUSED";
    case "POLICY_REFUSED":
      return "POLICY REFUSED — NO ORDER SENT";
    case "REVIEW_REQUIRED":
      return "HUMAN REVIEW REQUIRED";
    case "EXECUTION_FAILED":
      return "EXECUTION FAILED";
  }
}

export type ProofTone = "done" | "escalated" | "refused" | "review" | "failed";

export function proofTone(kind: ProofKind): ProofTone {
  switch (kind) {
    case "EXECUTION_FILLED":
      return "done";
    case "AUTHORITY_ESCALATED":
      return "escalated";
    case "AUTHORITY_REFUSED":
      return "refused";
    case "POLICY_REFUSED":
      return "refused";
    case "REVIEW_REQUIRED":
      return "review";
    case "EXECUTION_FAILED":
      return "failed";
  }
}

export function formatProofUsd(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

export function formatProofTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toUTCString();
}
