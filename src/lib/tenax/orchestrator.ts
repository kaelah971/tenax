// Tenax Phase 1C — golden-path application orchestrator.
//
// Coordinates existing modules (exposure fixture, intent, deterministic
// analysis fixture, Mandate Engine, approval, DRY_RUN adapter, receipt)
// without duplicating their logic. Framework-independent and fully testable.
//
// Flow: EXPOSURE → INTENT → INTELLIGENCE → PROPOSAL → MANDATE → APPROVAL →
// DRY_RUN ACTION → RECEIPT. No execution path bypasses mandate evaluation
// or required human approval: every gate re-checks, and violations throw.

import {
  type ApprovalState,
  type DecisionReceipt,
  type ExecutionResult,
  type Exposure,
  type Mandate,
  type MandateDecision,
  type ProtectionIntent,
} from "./domain";
import { type ProtectionAnalysis, analyzeProtectionFixture } from "./analysis";
import {
  type ApprovalActor,
  type ProtectionApproval,
  approveProtection,
  createApprovalRequest,
  hashProposal,
  isApprovalValidFor,
} from "./approval";
import { createProtectEventRiskIntent } from "./intent";
import { dryRunAdapter } from "./execution";
import { buildDecisionReceipt } from "./receipt";
import type { NvidiaMarketSnapshot } from "../intelligence/snapshot";

export type FlowState =
  | "IDLE"
  | "EXPOSURE_READY"
  | "INTENT_READY"
  | "ANALYZED"
  | "MANDATE_PASS"
  | "MANDATE_REFUSED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export class FlowTransitionError extends Error {
  readonly from: FlowState;
  readonly action: string;
  constructor(from: FlowState, action: string, reason: string) {
    super(`FLOW_REJECTED: cannot ${action} from ${from} — ${reason}`);
    this.from = from;
    this.action = action;
  }
}

function deriveQty(
  tradeValueUsdt: number,
  lastPrice: string | null,
  quantityPrecision: number,
): string {
  const price = lastPrice === null ? NaN : Number(lastPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(
      "QTY_WITHOUT_PRICE: live ticker price unavailable — no fill price is invented, execution blocked",
    );
  }
  return (tradeValueUsdt / price).toFixed(quantityPrecision);
}

export class ProtectionFlow {
  private state: FlowState = "IDLE";
  private exposure: Exposure | null = null;
  private intent: ProtectionIntent | null = null;
  private snapshot: NvidiaMarketSnapshot | null = null;
  private analysis: ProtectionAnalysis | null = null;
  private approval: ProtectionApproval | null = null;
  private executionResult: ExecutionResult | null = null;
  private receipt: DecisionReceipt | null = null;

  constructor(readonly flowId: string) {}

  getFlowState(): FlowState {
    return this.state;
  }

  private require(expect: FlowState, action: string): void {
    if (this.state !== expect) {
      throw new FlowTransitionError(this.state, action, `expected state ${expect}`);
    }
  }

  loadExposure(exposure: Exposure): Exposure {
    this.require("IDLE", "load exposure");
    this.exposure = exposure;
    this.state = "EXPOSURE_READY";
    return exposure;
  }

  createIntent(rawText: string): ProtectionIntent {
    this.require("EXPOSURE_READY", "create intent");
    const exposure = this.exposure as Exposure;
    this.intent = createProtectEventRiskIntent(exposure, rawText);
    this.state = "INTENT_READY";
    return this.intent;
  }

  analyze(snapshot: NvidiaMarketSnapshot, mandate: Mandate): ProtectionAnalysis {
    this.require("INTENT_READY", "run analysis");
    const exposure = this.exposure as Exposure;
    const intent = this.intent as ProtectionIntent;
    this.snapshot = snapshot;
    this.analysis = analyzeProtectionFixture(exposure, intent, mandate, snapshot);
    this.state = "ANALYZED";
    return this.analysis;
  }

  evaluate(): MandateDecision {
    this.require("ANALYZED", "evaluate mandate");
    const decision = (this.analysis as ProtectionAnalysis).authority.mandateDecision;
    this.state = decision.verdict === "PASS" ? "MANDATE_PASS" : "MANDATE_REFUSED";
    return decision;
  }

  requestApproval(): ProtectionApproval {
    this.require("MANDATE_PASS", "request approval");
    const intent = this.intent as ProtectionIntent;
    const analysis = this.analysis as ProtectionAnalysis;
    this.approval = createApprovalRequest(
      intent.id,
      analysis.proposal,
      analysis.authority.mandateDecision,
    );
    this.state = "AWAITING_APPROVAL";
    return this.approval;
  }

  approve(actor: ApprovalActor = "human"): ProtectionApproval {
    this.require("AWAITING_APPROVAL", "grant approval");
    this.approval = approveProtection(this.approval as ProtectionApproval, actor);
    this.state = "APPROVED";
    return this.approval;
  }

  execute(): ExecutionResult {
    this.require("APPROVED", "execute protection");
    const analysis = this.analysis as ProtectionAnalysis;
    const approval = this.approval as ProtectionApproval;
    const snapshot = this.snapshot as NvidiaMarketSnapshot;
    const exposure = this.exposure as Exposure;
    const decision = analysis.authority.mandateDecision;
    if (!isApprovalValidFor(approval, analysis.proposal, decision)) {
      throw new FlowTransitionError(
        this.state,
        "execute protection",
        "approval is not valid for this exact proposal and PASS decision",
      );
    }
    this.state = "EXECUTING";
    try {
      const qty = deriveQty(
        analysis.authority.calculatedTradeValueUsdt,
        snapshot.ticker.data?.lastPrice ?? null,
        exposure.representation.quantityPrecision,
      );
      this.executionResult = dryRunAdapter.executeProtection({ qty });
    } catch (err) {
      this.state = "FAILED";
      throw err;
    }
    this.state = "COMPLETED";
    return this.executionResult;
  }

  getReceipt(): DecisionReceipt {
    this.require("COMPLETED", "emit decision receipt");
    if (this.receipt) return this.receipt;
    const exposure = this.exposure as Exposure;
    const intent = this.intent as ProtectionIntent;
    const analysis = this.analysis as ProtectionAnalysis;
    const approvalState: ApprovalState = "APPROVED";
    const alternative = analysis.consideredAlternative;
    this.receipt = buildDecisionReceipt({
      receiptId: `TENAX-1C-${this.flowId}`,
      exposure,
      intent,
      proposal: analysis.proposal,
      mandateResult: analysis.authority.mandateDecision.verdict,
      mandateChecks: analysis.authority.mandateDecision.checks,
      approval: approvalState,
      request: (this.executionResult as ExecutionResult).request,
      rejectedAlternatives: [
        {
          proposedTradeValueUsdt: alternative.proposal.proposedTradeValueUsdt,
          protectionPct: alternative.proposal.protectionPct,
          mandateResult: alternative.decision.verdict,
          failedRules: alternative.decision.failedRules,
          reason: `Considered ${alternative.proposal.protectionPct}% / ${alternative.proposal.proposedTradeValueUsdt} USDT alternative — refused: ${alternative.decision.failedRules.join(", ")}`,
        },
      ],
      evidenceRefs: [
        ...analysis.reasoning.evidenceRefs,
        "provenance: market=REAL(public Bitget), exposure=SIMULATED(fixture), analysis=DEVELOPMENT_FIXTURE, execution=DRY_RUN",
      ],
    });
    return this.receipt;
  }

  /** Read-only context for the service layer (never authority). */
  getContext(): {
    readonly state: FlowState;
    readonly exposure: Exposure | null;
    readonly intent: ProtectionIntent | null;
    readonly analysis: ProtectionAnalysis | null;
    readonly approval: ProtectionApproval | null;
    readonly executionResult: ExecutionResult | null;
    readonly proposalHash: string | null;
  } {
    return {
      state: this.state,
      exposure: this.exposure,
      intent: this.intent,
      analysis: this.analysis,
      approval: this.approval,
      executionResult: this.executionResult,
      proposalHash: this.analysis ? hashProposal(this.analysis.proposal) : null,
    };
  }
}
