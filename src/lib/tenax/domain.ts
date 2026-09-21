// Tenax Phase 1A — canonical domain types (credential-independent).
//
// Source of truth: docs/tenax_prd_architecture_build_plan.md §15–§18.
// Economic exposure is the primary abstraction; token symbols are
// representations. No credentials, no network, no LLM in this module.

/** MVP underlying. Only NVIDIA is supported; other strings are test-only. */
export type Underlying = string;
export const NVDA_UNDERLYING = "NVDA" as const;

/** Canonical RNVDA representation metadata (verified Phase 0A facts). */
export interface ExposureRepresentation {
  readonly symbol: "RNVDAUSDT";
  readonly provider: "Bitget";
  readonly venue: "Bitget Reality";
  readonly baseCoin: "rNVDA";
  readonly quoteCoin: "USDT";
  readonly category: "SPOT";
  readonly status: "online";
  readonly isReality: true;
  readonly minOrderQty: 0.0001;
  readonly minOrderAmount: 10;
  readonly pricePrecision: 2;
  readonly quantityPrecision: 4;
}

/** User's economic exposure. Simulated ownership stays separate from live data. */
export interface Exposure {
  readonly id: string;
  readonly underlying: Underlying;
  readonly representation: ExposureRepresentation;
  /** Simulated portfolio value in USDT (development fixture, not live). */
  readonly exposureValueUsdt: number;
  /** Where the value came from: fixture vs live account (live = future). */
  readonly valueSource: "fixture" | "live";
}

/** Material event affecting an exposure. No fabricated earnings dates. */
export interface MarketEvent {
  readonly id: string;
  readonly type: "EARNINGS";
  readonly underlying: Underlying;
  /** ISO timestamp when known; null means unknown — never fabricate. */
  readonly occursAt: string | null;
  readonly source: string;
}

export const INTENT_TYPES = ["PROTECT_EVENT_RISK"] as const;
export type IntentType = (typeof INTENT_TYPES)[number];

/** First and only MVP intent. Interpreted deterministically (no LLM yet). */
export interface ProtectionIntent {
  readonly id: string;
  readonly type: IntentType;
  readonly exposureId: string;
  readonly eventId: string | null;
  readonly rawText: string;
  readonly createdAt: string;
}

/** Bounded protection proposal (AI-shaped in the future; fixture-shaped now). */
export interface ProtectionProposal {
  readonly underlying: Underlying;
  readonly protectionPct: number;
  readonly proposedTradeValueUsdt: number;
  /**
   * Effective leverage multiple the proposal would use. 1 = unleveraged.
   * Unknown/unverifiable leverage is represented outside this type as
   * null and is always refused by the mandate gate.
   */
  readonly leverageUsed: number;
}

/** User-defined authority boundary. */
export interface Mandate {
  readonly allowedUnderlying: Underlying;
  readonly maxProtectionPct: number;
  readonly maxTradeValueUsdt: number;
  /**
   * Maximum effective leverage multiple. 1 means 1x only: unleveraged
   * execution is allowed, anything above is refused. Tenax never sets
   * leverage itself; this bounds what execution may run under.
   */
  readonly maxLeverage: number;
  readonly approvalRequired: boolean;
}

/** Structured reason codes — never prose-only decisions. */
export const MANDATE_CHECK_IDS = [
  "underlying_allowed",
  "max_protection_pct",
  "max_trade_value",
  "max_leverage",
  "approval_required",
  "min_order_amount",
] as const;
export type MandateCheckId = (typeof MANDATE_CHECK_IDS)[number];

export interface MandateCheck {
  readonly id: MandateCheckId;
  readonly pass: boolean;
  readonly detail: string;
}

export type MandateVerdict = "PASS" | "REFUSE";

export interface MandateDecision {
  readonly verdict: MandateVerdict;
  /** True when PASS but a human must still approve before execution. */
  readonly pendingHumanApproval: boolean;
  readonly failedRules: MandateCheckId[];
  readonly checks: MandateCheck[];
  readonly evaluatedAt: string;
}

/** Approval lifecycle. REQUIRED = mandated but not yet granted. */
export type ApprovalState = "REQUIRED" | "APPROVED" | "NOT_REQUIRED";

export interface Approval {
  readonly state: ApprovalState;
  readonly scope: "single-action";
  readonly approvedAt: string | null;
}

/** Supported execution modes. DEMO stays gated until the auth spike. */
export const EXECUTION_MODES = ["DRY_RUN", "BITGET_DEMO"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const DEFAULT_EXECUTION_MODE: ExecutionMode = "DRY_RUN";

/** Would-be UTA place-order shape (never submitted in DRY_RUN). */
export interface ExecutionRequest {
  readonly mode: ExecutionMode;
  readonly operationId: "placeOrder";
  readonly endpoint: "POST /api/v3/trade/place-order";
  readonly category: "SPOT";
  readonly symbol: "RNVDAUSDT";
  readonly side: "sell";
  readonly orderType: "market";
  readonly qty: string;
  readonly kind: "would-be payload only — NOT submitted";
}

/** DRY_RUN result. fundsMoved is always false; no orderId ever exists. */
export interface ExecutionResult {
  readonly mode: ExecutionMode;
  readonly submitted: false;
  readonly fundsMoved: false;
  readonly request: ExecutionRequest;
  readonly disclaimer: "DRY_RUN — NO FUNDS MOVED";
}

/**
 * BITGET_DEMO order request — the exact submitted shape, never a
 * would-be payload. NVDAUSDT short hedge only.
 */
export interface DemoOrderRequest {
  readonly mode: "BITGET_DEMO";
  readonly operationId: "placeOrder";
  readonly endpoint: "POST /api/v3/trade/place-order";
  readonly category: "USDT-FUTURES";
  readonly symbol: "NVDAUSDT";
  readonly side: "sell";
  readonly posSide: "short";
  readonly orderType: "market";
  readonly qty: string;
  readonly clientOid: string;
  readonly kind: "DEMO order — submitted, virtual funds only";
}

/** Safe normalized Bitget execution facts stored on a Demo receipt. */
export interface DemoExecutionRecord {
  readonly orderId: string | null;
  readonly clientOid: string;
  readonly orderStatus: string | null;
  readonly filled: boolean;
  readonly avgPrice: string | null;
  readonly cumExecQty: string | null;
  readonly cumExecValue: string | null;
  readonly leverage: "1x";
  readonly marginMode: "crossed";
  readonly approvedNotionalUsdt: number;
  readonly submittedAt: string | null;
  readonly verifiedAt: string | null;
  readonly fundsDisclaimer: "DEMO ORDER — VIRTUAL FUNDS ONLY";
}

/** Immutable-ish decision snapshot (receipts are not live recomputations). */
export interface DecisionReceipt {
  readonly receiptId: string;
  readonly timestamp: string;
  readonly underlying: Underlying;
  readonly representation: "RNVDAUSDT";
  readonly exposureValueUsdt: number;
  readonly intent: IntentType;
  readonly proposedProtectionPct: number;
  readonly proposedTradeValueUsdt: number;
  readonly mandateResult: MandateVerdict;
  readonly mandateChecks: MandateCheck[];
  readonly approval: ApprovalState;
  readonly executionMode: ExecutionMode;
  /** False for DRY_RUN; true for BITGET_DEMO (virtual funds moved). */
  readonly fundsMoved: boolean;
  readonly request: ExecutionRequest | DemoOrderRequest;
  /** Present only for BITGET_DEMO executions (safe normalized fields). */
  readonly demoExecution?: DemoExecutionRecord;
  readonly rejectedAlternatives: ReadonlyArray<{
    readonly proposedTradeValueUsdt: number;
    readonly protectionPct: number;
    readonly mandateResult: MandateVerdict;
    readonly failedRules: MandateCheckId[];
    readonly reason: string;
  }>;
  readonly evidenceRefs: readonly string[];
}
