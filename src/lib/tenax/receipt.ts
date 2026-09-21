// Tenax Phase 1A — deterministic Decision Receipt generation.
//
// A receipt is a snapshot, not a live recomputation. No orderId, no
// transaction hash, no "executed successfully" language — DRY_RUN receipts
// prove the decision chain only.

import type {
  ApprovalState,
  DecisionReceipt,
  DemoExecutionRecord,
  DemoOrderRequest,
  ExecutionRequest,
  Exposure,
  IntentType,
  MandateCheck,
  MandateCheckId,
  MandateVerdict,
  ProtectionIntent,
  ProtectionProposal,
} from "./domain";

export interface RejectedAlternative {
  readonly proposedTradeValueUsdt: number;
  readonly protectionPct: number;
  readonly mandateResult: MandateVerdict;
  readonly failedRules: MandateCheckId[];
  readonly reason: string;
}

export interface BuildReceiptInput {
  receiptId: string;
  exposure: Exposure;
  intent: ProtectionIntent;
  proposal: ProtectionProposal;
  mandateResult: MandateVerdict;
  mandateChecks: MandateCheck[];
  approval: ApprovalState;
  request: ExecutionRequest | DemoOrderRequest;
  rejectedAlternatives: readonly RejectedAlternative[];
  evidenceRefs: readonly string[];
  intentType?: IntentType;
  timestamp?: string;
  /** True only for BITGET_DEMO (virtual funds moved); default false. */
  fundsMoved?: boolean;
  /** Safe normalized Bitget facts; BITGET_DEMO only. */
  demoExecution?: DemoExecutionRecord;
}

export function buildDecisionReceipt(input: BuildReceiptInput): DecisionReceipt {
  return {
    receiptId: input.receiptId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    underlying: input.exposure.underlying,
    representation: "RNVDAUSDT",
    exposureValueUsdt: input.exposure.exposureValueUsdt,
    intent: input.intentType ?? input.intent.type,
    proposedProtectionPct: input.proposal.protectionPct,
    proposedTradeValueUsdt: input.proposal.proposedTradeValueUsdt,
    mandateResult: input.mandateResult,
    mandateChecks: input.mandateChecks,
    approval: input.approval,
    executionMode: input.request.mode,
    fundsMoved: input.fundsMoved ?? false,
    request: input.request,
    demoExecution: input.demoExecution,
    rejectedAlternatives: input.rejectedAlternatives,
    evidenceRefs: input.evidenceRefs,
  };
}
