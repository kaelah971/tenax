// Tenax Phase 4B-B1 — Standing Mandates / bounded authority (pure domain).
//
// A standing mandate pre-authorizes a NARROW CLASS of future protection
// actions once, so later AI proposals inside that class are eligible for
// autonomous execution without a per-action human approval. It never
// authorizes a specific order, never sets leverage, never moves funds.
//
// Safety contract (do not weaken without owner approval):
// - Pure and deterministic: no LLM, no network, no credentials, no clock
//   except an injected nowMs. Independently testable.
// - Creating is NOT authorizing: only an explicit activation step binds
//   the exact policy into mandateHash. Once ACTIVE the policy is
//   immutable — new limits require a new mandate (new id, new hash).
// - Standing authorization NEVER broadens execution: it can only stand
//   in for per-action human approval. Every Phase-2 execution gate
//   (demo mode, symbol/category, freshness, binding, mandate PASS,
//   sizing, 1x, margin, idempotency, mode) stays exactly as is.
// - Explicitly forbidden actions (spot sale, transfers, leverage changes,
//   off-list symbols) REFUSE in every authority mode, including
//   AUTO_WITH_ESCALATION. REVIEW_EVERY_ACTION never auto-authorizes.
// - A standing mandate is recorded as STANDING_MANDATE authority — it
//   never masquerades as a HUMAN_APPROVAL record.

import { createHash } from "node:crypto";

export const STANDING_SUBJECT_ID = "NVDA" as const;
export const STANDING_INTENT_TYPE = "PROTECT_EVENT_RISK" as const;
export const STANDING_ACTION_SHORT_HEDGE = "SHORT_HEDGE" as const;
export const STANDING_SYMBOL_NVDAUSDT = "NVDAUSDT" as const;

/** Canonical proposal freshness bound reused for standing evaluation. */
export const STANDING_PROPOSAL_MAX_AGE_MS = 15 * 60 * 1000;

export const AUTHORITY_MODES = [
  "REVIEW_EVERY_ACTION",
  "AUTO_WITHIN_MANDATE",
  "AUTO_WITH_ESCALATION",
] as const;
export type StandingAuthorityMode = (typeof AUTHORITY_MODES)[number];

export const STANDING_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "EXPIRED",
  "REVOKED",
  "EXHAUSTED",
] as const;
export type StandingMandateStatus = (typeof STANDING_STATUSES)[number];

export type AuthoritySource = "HUMAN_APPROVAL" | "STANDING_MANDATE";
export type StandingAuthorityDecision = "AUTHORIZED" | "ESCALATE" | "REFUSED";

/** Immutable-once-active policy: the pre-authorized class of action. */
export interface StandingMandatePolicy {
  readonly subjectId: typeof STANDING_SUBJECT_ID;
  readonly intentType: typeof STANDING_INTENT_TYPE;
  readonly maxProtectionPct: number;
  readonly maxNotionalUsdt: number;
  readonly maxLeverage: number;
  readonly allowedSymbols: readonly string[];
  readonly allowedActionTypes: readonly string[];
  /** Always false at the type level: spot sales can never be pre-authorized. */
  readonly sellUnderlyingAllowed: false;
  readonly transfersAllowed: false;
  readonly leverageChangesAllowed: false;
  readonly authorityMode: StandingAuthorityMode;
  readonly maxExecutions: number;
}

export interface StandingMandate {
  readonly id: string;
  readonly policy: StandingMandatePolicy;
  readonly status: StandingMandateStatus;
  readonly executionCount: number;
  readonly createdAt: string;
  readonly activatedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  /** Bound at activation over id + activatedAt + exact policy. Null until ACTIVE. */
  readonly mandateHash: string | null;
}

export interface CreateStandingMandateInput {
  readonly maxProtectionPct: number;
  readonly maxNotionalUsdt: number;
  readonly maxLeverage: number;
  readonly allowedSymbols: readonly string[];
  readonly allowedActionTypes: readonly string[];
  readonly authorityMode: StandingAuthorityMode;
  readonly maxExecutions: number;
  /** ISO timestamp or null (no expiry). Must be future-dated when present. */
  readonly expiresAt?: string | null;
}

let standingMandateCounter = 0;

/** Reset the in-memory counter (tests only). */
export function __resetStandingMandateCounterForTests(): void {
  standingMandateCounter = 0;
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Deterministic content hash (SHA-256 over canonical JSON). */
export function hashStandingPolicy(canonical: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

/**
 * Draft a standing mandate. Drafts authorize nothing — activation is the
 * human authorization moment. Bounds are validated here so no absurd
 * policy can even reach activation.
 */
export function createStandingMandate(
  input: CreateStandingMandateInput,
  nowMs: number = Date.now(),
): StandingMandate {
  if (!AUTHORITY_MODES.includes(input.authorityMode)) {
    throw new Error(`STANDING_MANDATE_INVALID: unknown authorityMode ${String(input.authorityMode)}`);
  }
  if (
    !isFinitePositive(input.maxProtectionPct) ||
    input.maxProtectionPct > 100 ||
    !isFinitePositive(input.maxNotionalUsdt) ||
    !isFinitePositive(input.maxLeverage)
  ) {
    throw new Error("STANDING_MANDATE_INVALID: bounds must be finite positive (pct within 0–100)");
  }
  if (input.allowedSymbols.length === 0 || input.allowedActionTypes.length === 0) {
    throw new Error("STANDING_MANDATE_INVALID: allowed symbols/actions must be non-empty");
  }
  if (!Number.isInteger(input.maxExecutions) || input.maxExecutions < 1) {
    throw new Error("STANDING_MANDATE_INVALID: maxExecutions must be an integer >= 1");
  }
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt !== null) {
    const expiryMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) {
      throw new Error("STANDING_MANDATE_INVALID: expiresAt must be a future timestamp");
    }
  }
  standingMandateCounter += 1;
  return {
    id: `smand-${String(standingMandateCounter).padStart(4, "0")}`,
    policy: {
      subjectId: STANDING_SUBJECT_ID,
      intentType: STANDING_INTENT_TYPE,
      maxProtectionPct: input.maxProtectionPct,
      maxNotionalUsdt: input.maxNotionalUsdt,
      maxLeverage: input.maxLeverage,
      allowedSymbols: [...input.allowedSymbols],
      allowedActionTypes: [...input.allowedActionTypes],
      sellUnderlyingAllowed: false,
      transfersAllowed: false,
      leverageChangesAllowed: false,
      authorityMode: input.authorityMode,
      maxExecutions: input.maxExecutions,
    },
    status: "DRAFT",
    executionCount: 0,
    createdAt,
    activatedAt: null,
    expiresAt,
    revokedAt: null,
    mandateHash: null,
  };
}

/**
 * Activate a draft: binds id + activatedAt + exact policy into
 * mandateHash. Only DRAFT mandates activate; the hash makes any later
 * policy change detectable (a changed policy needs a new mandate).
 */
export function activateStandingMandate(
  mandate: StandingMandate,
  nowMs: number = Date.now(),
): StandingMandate {
  if (mandate.status !== "DRAFT") {
    throw new Error(
      `STANDING_MANDATE_INVALID: only a DRAFT mandate can activate (got ${mandate.status})`,
    );
  }
  const activatedAt = new Date(nowMs).toISOString();
  const mandateHash = hashStandingPolicy({
    id: mandate.id,
    activatedAt,
    policy: mandate.policy,
  });
  return { ...mandate, status: "ACTIVE", activatedAt, mandateHash };
}

/** Revoke an ACTIVE mandate. Revocation is terminal and timestamped. */
export function revokeStandingMandate(
  mandate: StandingMandate,
  nowMs: number = Date.now(),
): StandingMandate {
  if (mandate.status !== "ACTIVE") {
    throw new Error(
      `STANDING_MANDATE_INVALID: only an ACTIVE mandate can revoke (got ${mandate.status})`,
    );
  }
  return { ...mandate, status: "REVOKED", revokedAt: new Date(nowMs).toISOString() };
}

/**
 * Record one consumed execution (future execution path calls this AFTER
 * all Phase-2 gates pass — never during evaluation). Transitions to
 * EXHAUSTED exactly when the count reaches maxExecutions.
 */
export function consumeStandingExecution(mandate: StandingMandate): StandingMandate {
  if (mandate.executionCount >= mandate.policy.maxExecutions) {
    throw new Error("STANDING_MANDATE_INVALID: mandate already exhausted");
  }
  if (mandate.status !== "ACTIVE") {
    throw new Error(
      `STANDING_MANDATE_INVALID: only an ACTIVE mandate can consume (got ${mandate.status})`,
    );
  }
  const executionCount = mandate.executionCount + 1;
  return {
    ...mandate,
    executionCount,
    status: executionCount >= mandate.policy.maxExecutions ? "EXHAUSTED" : "ACTIVE",
  };
}

// ---- Deterministic authority evaluation -------------------------------------

/** Canonical derived action presented for standing-authority evaluation. */
export interface StandingAuthorityAction {
  readonly subjectId: string;
  readonly intentType: string;
  readonly protectionPct: number;
  readonly notionalUsdt: number;
  readonly leverage: number;
  readonly symbol: string;
  readonly actionType: string;
  readonly requestsSellUnderlying: boolean;
  readonly requestsTransfer: boolean;
  readonly requestsLeverageChange: boolean;
  /** Proposal timestamp ms; null when unknown (freshness then refuses). */
  readonly proposalAtMs: number | null;
}

export interface StandingAuthorityEvaluation {
  readonly authoritySource: "STANDING_MANDATE";
  readonly mandateId: string;
  readonly mandateHash: string | null;
  readonly status: StandingMandateStatus;
  readonly evaluatedAt: string;
  readonly decision: StandingAuthorityDecision;
  readonly failedRules: readonly string[];
  readonly reasonCodes: readonly string[];
}

function isExpired(mandate: StandingMandate, nowMs: number): boolean {
  if (mandate.expiresAt === null) return false;
  const expiryMs = Date.parse(mandate.expiresAt);
  return Number.isFinite(expiryMs) && nowMs >= expiryMs;
}

/**
 * Pure deterministic standing-authority evaluation. No LLM, no network.
 *
 * REVIEW_EVERY_ACTION never returns AUTHORIZED (ESCALATE + HUMAN_REQUIRED).
 * AUTO_WITHIN_MANDATE: all pass → AUTHORIZED, anything else → REFUSED.
 * AUTO_WITH_ESCALATION: all pass → AUTHORIZED; ordinary limit/overuse
 * failures → ESCALATE; explicitly forbidden actions (spot sale, transfer,
 * leverage change, off-class symbol/action/subject/intent, dead mandate)
 * → REFUSED in every mode.
 */
export function evaluateStandingAuthority(
  mandate: StandingMandate,
  action: StandingAuthorityAction,
  nowMs: number = Date.now(),
  maxProposalAgeMs: number = STANDING_PROPOSAL_MAX_AGE_MS,
): StandingAuthorityEvaluation {
  const evaluatedAt = new Date(nowMs).toISOString();
  const base = {
    authoritySource: "STANDING_MANDATE" as const,
    mandateId: mandate.id,
    mandateHash: mandate.mandateHash,
    status: mandate.status,
    evaluatedAt,
  };
  const refuse = (failedRules: readonly string[]): StandingAuthorityEvaluation => ({
    ...base,
    decision: "REFUSED",
    failedRules,
    reasonCodes: [...failedRules],
  });

  // Dead mandates refuse in every mode (never escalate a dead authority).
  if (mandate.status !== "ACTIVE") {
    return refuse([`mandate_${mandate.status.toLowerCase()}`]);
  }
  if (isExpired(mandate, nowMs)) {
    return refuse(["mandate_expired"]);
  }
  if (mandate.executionCount >= mandate.policy.maxExecutions) {
    return refuse(["mandate_exhausted"]);
  }

  // Explicitly forbidden actions refuse in every mode. The policy type
  // pins all three permissions to literal false, so these flags can only
  // ever come from the requested action.
  const forbidden: string[] = [];
  if (action.requestsSellUnderlying) forbidden.push("forbidden_spot_sale");
  if (action.requestsTransfer) forbidden.push("forbidden_transfer");
  if (action.requestsLeverageChange) forbidden.push("forbidden_leverage_change");
  if (action.subjectId !== mandate.policy.subjectId) forbidden.push("subject_mismatch");
  if (action.intentType !== mandate.policy.intentType) forbidden.push("intent_mismatch");
  if (!mandate.policy.allowedSymbols.includes(action.symbol)) forbidden.push("symbol_not_allowed");
  if (!mandate.policy.allowedActionTypes.includes(action.actionType)) {
    forbidden.push("action_not_allowed");
  }
  if (forbidden.length > 0) return refuse(forbidden);

  // Ordinary bound/freshness failures: REFUSED under strict/review config,
  // ESCALATE under AUTO_WITH_ESCALATION.
  const exceeded: string[] = [];
  if (!(action.protectionPct <= mandate.policy.maxProtectionPct)) {
    exceeded.push("exceeds_max_protection_pct");
  }
  if (!(action.notionalUsdt <= mandate.policy.maxNotionalUsdt)) {
    exceeded.push("exceeds_max_notional");
  }
  if (!(action.leverage <= mandate.policy.maxLeverage)) {
    exceeded.push("exceeds_max_leverage");
  }
  if (
    action.proposalAtMs === null ||
    !Number.isFinite(action.proposalAtMs) ||
    nowMs - action.proposalAtMs < 0 ||
    nowMs - action.proposalAtMs > maxProposalAgeMs
  ) {
    exceeded.push("proposal_stale");
  }
  if (mandate.policy.authorityMode === "REVIEW_EVERY_ACTION") {
    return {
      ...base,
      decision: "ESCALATE",
      failedRules: exceeded,
      reasonCodes: ["human_review_required", ...exceeded],
    };
  }
  if (exceeded.length > 0) {
    if (mandate.policy.authorityMode === "AUTO_WITH_ESCALATION") {
      return { ...base, decision: "ESCALATE", failedRules: exceeded, reasonCodes: [...exceeded] };
    }
    return refuse(exceeded);
  }
  return {
    ...base,
    decision: "AUTHORIZED",
    failedRules: [],
    reasonCodes: ["within_standing_authority"],
  };
}
