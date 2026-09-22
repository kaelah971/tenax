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
  type ExecutionMode,
  type ExecutionResult,
  type Exposure,
  type Mandate,
  type MandateDecision,
  type ProtectionIntent,
  type StandingEscalationRecord,
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
import type { DemoAuthCredentials } from "../bitget/demo-auth";
import type { AiAnalysisAudit } from "../ai/schemas.ts";
import {
  attestationFromAuthority,
  isAuthorityValidFor,
  type ExecutionAuthority,
  type StandingGateAttestation,
} from "./authority.ts";
import type { StandingMandate } from "./standing-mandate.ts";
import {
  DEFAULT_APPROVAL_MAX_AGE_MS,
  deriveCanonicalProtectionAction,
  deriveDemoHedgeSizing,
  fetchLiveDemoHedgeMarket,
  submitDemoHedgeOrder,
  type DemoHedgeGateInput,
  type DemoHedgeMarketState,
  type DemoMarketReaderDeps,
  type ReadFetchImpl,
  type WriteFetchImpl,
} from "./demo-executor";
import type { NvdaInstrument, NvdaTicker } from "../bitget/nvda-hedge.ts";
import {
  fetchDemoOrderInfo,
  isFilledOrderStatus,
  isValidClientOid,
  normalizeDemoOrderInfo,
} from "../bitget/demo-trade";

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

/**
 * Stored BITGET_DEMO execution state. Idempotency anchor: once set, the
 * flow never submits again — retries reconcile this record via a
 * read-only order-info query instead.
 */
export interface DemoFlowExecution {
  readonly submittedAt: string;
  readonly verifiedAt: string | null;
  readonly orderId: string | null;
  readonly clientOid: string;
  readonly orderStatus: string | null;
  readonly filled: boolean;
  readonly qty: string;
  readonly approxNotional: number | null;
  readonly avgPrice: string | null;
  readonly cumExecQty: string | null;
  readonly cumExecValue: string | null;
  readonly gates: ReadonlyArray<{ readonly id: string; readonly pass: boolean; readonly detail: string }>;
}

export interface ExecuteOptions {
  /** Server-resolved mode. Defaults to DRY_RUN; never LIVE (unrepresentable). */
  readonly executionMode?: ExecutionMode;
  /** Backend trading mode; BITGET_DEMO requires exactly "demo". */
  readonly tradingMode?: string;
  /** Server-side Demo credentials. Required for BITGET_DEMO, never serialized. */
  readonly credentials?: DemoAuthCredentials;
  readonly baseUrl?: string;
  /** Fresh market reader (injected in tests; live reads in production). */
  readonly marketReader?: (deps: DemoMarketReaderDeps) => Promise<DemoHedgeMarketState>;
  readonly writeFetchImpl?: WriteFetchImpl;
  readonly readFetchImpl?: ReadFetchImpl;
  readonly nowMs?: number;
  readonly maxApprovalAgeMs?: number;
}

/**
 * Autonomous execution under standing authority (Phase 4B-B2). Same
 * network/fetch injection as ExecuteOptions, plus the bound authority
 * record and the freshly-read mandate it must match. The human approval
 * path (execute) is untouched by this shape.
 */
export interface AutonomousExecuteOptions {
  /** Bound STANDING_MANDATE authority for the exact stored proposal. */
  readonly authority: ExecutionAuthority;
  /** Freshly-read mandate record the authority must match. */
  readonly mandate: StandingMandate;
  readonly executionMode?: ExecutionMode;
  readonly tradingMode?: string;
  readonly credentials?: DemoAuthCredentials;
  readonly baseUrl?: string;
  readonly marketReader?: (deps: DemoMarketReaderDeps) => Promise<DemoHedgeMarketState>;
  readonly writeFetchImpl?: WriteFetchImpl;
  readonly readFetchImpl?: ReadFetchImpl;
  readonly nowMs?: number;
  readonly maxApprovalAgeMs?: number;
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
  private mandate: Mandate | null = null;
  private approval: ProtectionApproval | null = null;
  private executionResult: ExecutionResult | null = null;
  private demoExecution: DemoFlowExecution | null = null;
  private executionModeUsed: ExecutionMode | null = null;
  private receipt: DecisionReceipt | null = null;
  /** Validated model-analysis audit trail; null for the fixture path. */
  private aiAudit: AiAnalysisAudit | null = null;
  /** ISO timestamp when analysis seated (freshness anchor for autonomy). */
  private analyzedAt: string | null = null;
  /** Bound execution authority (human or standing); set on execution. */
  private executionAuthority: ExecutionAuthority | null = null;
  /**
   * Informational escalation record (Phase 4B-B4): set when an autonomous
   * cycle routes this proposal to human review. Overwritten idempotently
   * on retry. Grants nothing, consumes nothing, mutates no mandate.
   */
  private standingEscalation: StandingEscalationRecord | null = null;

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
    this.mandate = mandate;
    this.analysis = analyzeProtectionFixture(exposure, intent, mandate, snapshot);
    this.aiAudit = null;
    this.analyzedAt = new Date().toISOString();
    this.state = "ANALYZED";
    return this.analysis;
  }

  /**
   * Adopt a validated model analysis (Phase 4B-A). The analysis must
   * already be schema-validated and post-checked by the AI pipeline;
   * this method only seats it into the flow at INTENT_READY. Approval
   * and execution gates downstream are unchanged: a WAIT/NO_ACTION
   * analysis never reaches them (service stops the flow first), and a
   * PROTECT analysis still needs mandate PASS + human approval.
   */
  adoptAnalysis(
    snapshot: NvidiaMarketSnapshot,
    mandate: Mandate,
    analysis: ProtectionAnalysis,
    audit: AiAnalysisAudit,
  ): ProtectionAnalysis {
    this.require("INTENT_READY", "adopt model analysis");
    this.snapshot = snapshot;
    this.mandate = mandate;
    this.analysis = analysis;
    this.aiAudit = audit;
    this.analyzedAt = new Date().toISOString();
    this.state = "ANALYZED";
    return this.analysis;
  }

  evaluate(): MandateDecision {
    this.require("ANALYZED", "evaluate mandate");
    const decision = (this.analysis as ProtectionAnalysis).authority.mandateDecision;
    this.state = decision.verdict === "PASS" ? "MANDATE_PASS" : "MANDATE_REFUSED";
    return decision;
  }

  requestApproval(executionMode: ExecutionMode = "DRY_RUN"): ProtectionApproval {
    this.require("MANDATE_PASS", "request approval");
    const intent = this.intent as ProtectionIntent;
    const analysis = this.analysis as ProtectionAnalysis;
    this.approval = createApprovalRequest(
      intent.id,
      analysis.proposal,
      analysis.authority.mandateDecision,
      { executionMode },
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

  /**
   * Record an autonomous-cycle escalation (Phase 4B-B4): the standing
   * mandate declined this proposal and a human must review it through the
   * normal one-time approval flow. Informational only — callable in any
   * analyzed state, overwrites idempotently, changes no budget and no
   * mandate. The receipt carries it so a later human approval can never
   * be mistaken for standing authorization.
   */
  recordStandingEscalation(record: Omit<StandingEscalationRecord, "escalatedAt">): StandingEscalationRecord {
    this.standingEscalation = {
      ...record,
      reasonCodes: [...record.reasonCodes],
      escalatedAt: new Date().toISOString(),
    };
    return this.standingEscalation;
  }

  /**
   * Execute the approved protection. Async: BITGET_DEMO performs network
   * reads/writes through the guarded executor; DRY_RUN stays synchronous
   * in behavior (still awaited by callers).
   *
   * Idempotency: a COMPLETED flow never submits again. Retrying a Demo
   * submission reconciles the stored record via a read-only order-info
   * query; retrying DRY_RUN returns the stored result. A second POST is
   * impossible through this method.
   */
  async execute(options: ExecuteOptions = {}): Promise<ExecutionResult | DemoFlowExecution> {
    if (this.state === "COMPLETED") {
      return this.reconcile(options);
    }
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
    const mode = options.executionMode ?? "DRY_RUN";
    if (approval.executionMode !== mode) {
      throw new FlowTransitionError(
        this.state,
        "execute protection",
        `approval binds executionMode=${approval.executionMode} but mode is ${mode} — stale or incompatible approval, fresh flow required`,
      );
    }
    const nowMs = options.nowMs ?? Date.now();
    const maxAgeMs = options.maxApprovalAgeMs ?? DEFAULT_APPROVAL_MAX_AGE_MS;
    const approvedAtMs = approval.approvedAt === null ? NaN : Date.parse(approval.approvedAt);
    if (!Number.isFinite(approvedAtMs) || nowMs - approvedAtMs < 0 || nowMs - approvedAtMs > maxAgeMs) {
      throw new FlowTransitionError(
        this.state,
        "execute protection",
        "approval is stale or missing a valid timestamp — fresh approval required",
      );
    }
    if (mode === "DRY_RUN") {
      return this.runDryRun(analysis, exposure, snapshot);
    }
    return this.executeDemo(options, analysis, approval, decision, nowMs, maxAgeMs, null);
  }

  /** Shared DRY_RUN tail: preview only, moves nothing, never writes. */
  private runDryRun(
    analysis: ProtectionAnalysis,
    exposure: Exposure,
    snapshot: NvidiaMarketSnapshot,
    market: { instrument: NvdaInstrument | null; ticker: NvdaTicker | null } | null = null,
  ): ExecutionResult {
    this.state = "EXECUTING";
    try {
      // Canonical action whenever hedge-instrument market is available
      // (same derivation the Demo submission uses); otherwise a reference
      // qty from exposure context under the same canonical action fields.
      // Either way the preview is NVDAUSDT — never the exposure symbol.
      let qty: string;
      if (market && (market.instrument || market.ticker)) {
        qty = deriveCanonicalProtectionAction(
          analysis.proposal,
          market.instrument,
          market.ticker,
        ).qty;
      } else {
        qty = deriveQty(
          analysis.authority.calculatedTradeValueUsdt,
          snapshot.ticker.data?.lastPrice ?? null,
          exposure.representation.quantityPrecision,
        );
      }
      this.executionResult = dryRunAdapter.executeProtection({ qty });
    } catch (err) {
      this.state = "FAILED";
      throw err;
    }
    this.executionModeUsed = "DRY_RUN";
    this.state = "COMPLETED";
    return this.executionResult;
  }

  /**
   * Best-effort hedge-instrument market for previews. Returns null when
   * unavailable (offline DRY_RUN keeps working with reference sizing).
   * An explicitly injected reader runs even without credentials (tests
   * and callers that already hold market data); the live default reader
   * is only attempted with credentials present. Never throws, never writes.
   */
  private async readPreviewMarket(
    input: AutonomousExecuteOptions,
  ): Promise<{ instrument: NvdaInstrument | null; ticker: NvdaTicker | null } | null> {
    if (!input.marketReader) return null;
    if (input.marketReader === fetchLiveDemoHedgeMarket && !input.credentials) return null;
    // Injected readers run with whatever credentials the caller holds;
    // absent credentials arrive empty (injected stubs ignore them).
    const credentials: DemoAuthCredentials = input.credentials ?? {
      apiKey: "",
      secretKey: "",
      passphrase: "",
    };
    try {
      const market = await input.marketReader({
        credentials,
        baseUrl: input.baseUrl ?? "",
      });
      return { instrument: market.instrument, ticker: market.ticker };
    } catch {
      return null;
    }
  }

  /**
   * Execute under standing authority (Phase 4B-B2). Requires MANDATE_PASS
   * with NO human approval: the bound ExecutionAuthority replaces the
   * approval gates (binding, mode, freshness) while every other gate —
   * mandate PASS, sizing, market, idempotency — runs unchanged through
   * the shared tails. The mandate record is freshly read by the caller
   * (service) and must match the authority's id + hash + ACTIVE status.
   */
  async executeAutonomous(
    input: AutonomousExecuteOptions,
  ): Promise<ExecutionResult | DemoFlowExecution> {
    if (this.state === "COMPLETED") {
      return this.reconcile(input);
    }
    this.require("MANDATE_PASS", "execute autonomously");
    const { authority, mandate } = input;
    const analysis = this.analysis as ProtectionAnalysis;
    const snapshot = this.snapshot as NvidiaMarketSnapshot;
    const exposure = this.exposure as Exposure;
    const decision = analysis.authority.mandateDecision;
    if (authority.authoritySource !== "STANDING_MANDATE") {
      throw new FlowTransitionError(
        this.state,
        "execute autonomously",
        "autonomous execution requires STANDING_MANDATE authority",
      );
    }
    if (!isAuthorityValidFor(authority, analysis.proposal)) {
      throw new FlowTransitionError(
        this.state,
        "execute autonomously",
        "standing authority is not valid for this exact proposal",
      );
    }
    if (mandate.id !== authority.standingMandateId || mandate.mandateHash !== authority.standingMandateHash) {
      throw new FlowTransitionError(
        this.state,
        "execute autonomously",
        "standing mandate record does not match the bound authority",
      );
    }
    if (mandate.status !== "ACTIVE") {
      throw new FlowTransitionError(
        this.state,
        "execute autonomously",
        `standing mandate is ${mandate.status} — refusing`,
      );
    }
    const mode = input.executionMode ?? "DRY_RUN";
    const attestation = attestationFromAuthority(authority, mode);
    if (!attestation) {
      throw new FlowTransitionError(
        this.state,
        "execute autonomously",
        "standing authority attestation unavailable — refusing",
      );
    }
    const nowMs = input.nowMs ?? Date.now();
    const maxAgeMs = input.maxApprovalAgeMs ?? DEFAULT_APPROVAL_MAX_AGE_MS;
    const authorizedAtMs = Date.parse(authority.authorizedAt);
    if (!Number.isFinite(authorizedAtMs) || nowMs - authorizedAtMs < 0 || nowMs - authorizedAtMs > maxAgeMs) {
      throw new FlowTransitionError(
        this.state,
        "execute autonomously",
        "standing authority is stale — fresh evaluation required",
      );
    }
    this.executionAuthority = authority;
    if (mode === "DRY_RUN") {
      return this.runDryRun(analysis, exposure, snapshot, await this.readPreviewMarket(input));
    }
    return this.executeDemo(
      input,
      analysis,
      null,
      decision,
      nowMs,
      maxAgeMs,
      attestation,
    );
  }

  private async executeDemo(
    options: ExecuteOptions | AutonomousExecuteOptions,
    analysis: ProtectionAnalysis,
    approval: ProtectionApproval | null,
    decision: MandateDecision,
    nowMs: number,
    maxAgeMs: number,
    standingAuthority?: StandingGateAttestation | null,
  ): Promise<DemoFlowExecution> {
    if ((options.tradingMode ?? "").trim().toLowerCase() !== "demo") {
      throw new FlowTransitionError(
        this.state,
        "execute protection",
        "BITGET_DEMO requires BITGET_TRADING_MODE=demo — inconsistent config refuses",
      );
    }
    if (!options.credentials || !options.baseUrl) {
      throw new FlowTransitionError(
        this.state,
        "execute protection",
        "BITGET_DEMO requires server-side credentials — refusing without them",
      );
    }
    this.state = "EXECUTING";
    try {
      const reader = options.marketReader ?? fetchLiveDemoHedgeMarket;
      const market = await reader({ credentials: options.credentials, baseUrl: options.baseUrl });
      const storedMandate = this.mandate;
      if (!storedMandate) {
        throw new FlowTransitionError(
          this.state,
          "execute protection",
          "no mandate stored for this flow — cannot verify execution bounds",
        );
      }
      const proposalHash = hashProposal(analysis.proposal);
      const deterministicOid = `tenax-${this.flowId}-${proposalHash}`.slice(0, 64);
      const gateInput: DemoHedgeGateInput = {
        tradingMode: options.tradingMode as string,
        executionMode: "BITGET_DEMO",
        mandate: storedMandate,
        proposal: analysis.proposal,
        decision,
        approval,
        standingAuthority: standingAuthority ?? null,
        market,
        maxApprovalAgeMs: maxAgeMs,
        nowMs,
      };
      // Server-side confirmation: a valid human approval (or a bound
      // standing authority plus the explicit agent-cycle invocation)
      // reached this point. No CLI flag exists in this path.
      const result = await submitDemoHedgeOrder({
        ...gateInput,
        confirmed: true,
        credentials: options.credentials,
        baseUrl: options.baseUrl,
        clientOid: isValidClientOid(deterministicOid) ? deterministicOid : undefined,
        writeFetchImpl: options.writeFetchImpl,
        readFetchImpl: options.readFetchImpl,
      });
      if (result.outcome !== "SUBMITTED") {
        const reason =
          result.outcome === "REFUSED"
            ? `gates refused: ${result.failedGateIds.join(",")}`
            : `submission failed (http ${result.httpStatus}): ${result.reason}`;
        throw new FlowTransitionError(this.state, "execute protection", reason);
      }
      const submittedAt = new Date(nowMs).toISOString();
      const sizing = deriveDemoHedgeSizing(analysis.proposal, market.instrument, market.ticker);
      this.demoExecution = {
        submittedAt,
        verifiedAt: submittedAt,
        orderId: result.orderId,
        clientOid: result.clientOid,
        orderStatus: result.orderStatus,
        filled: result.filled,
        qty: result.body.qty,
        approxNotional: sizing.resultingNotional,
        avgPrice: result.verification?.avgPrice ?? null,
        cumExecQty: result.verification?.cumExecQty ?? null,
        cumExecValue: result.verification?.cumExecValue ?? null,
        gates: result.gates,
      };
    } catch (err) {
      this.state = "FAILED";
      throw err;
    }
    this.executionModeUsed = "BITGET_DEMO";
    this.state = "COMPLETED";
    return this.demoExecution as DemoFlowExecution;
  }

  /**
   * Reconcile a COMPLETED flow without resubmitting. Demo: refresh the
   * stored record from order-info (read-only). DRY_RUN: return the stored
   * result. Anything else throws — retries never create a second order.
   */
  private async reconcile(options: ExecuteOptions): Promise<ExecutionResult | DemoFlowExecution> {
    if (this.demoExecution) {
      const stored = this.demoExecution;
      if (options.credentials && options.baseUrl) {
        try {
          const info = await fetchDemoOrderInfo({
            credentials: options.credentials,
            baseUrl: options.baseUrl,
            orderId: stored.orderId,
            clientOid: stored.clientOid,
            fetchImpl: options.readFetchImpl,
          });
          if (info.transportError === null && info.httpStatus === 200) {
            const verification = normalizeDemoOrderInfo(info.body);
            if (verification) {
              const verifiedAt = new Date(options.nowMs ?? Date.now()).toISOString();
              this.demoExecution = {
                ...stored,
                orderStatus: verification.orderStatus ?? stored.orderStatus,
                filled: isFilledOrderStatus(verification.orderStatus),
                avgPrice: verification.avgPrice ?? stored.avgPrice,
                cumExecQty: verification.cumExecQty ?? stored.cumExecQty,
                cumExecValue: verification.cumExecValue ?? stored.cumExecValue,
                verifiedAt,
              };
            }
          }
        } catch {
          // Reconcile is best-effort: keep the stored record on read failure.
        }
      }
      return this.demoExecution as DemoFlowExecution;
    }
    if (this.executionResult) return this.executionResult;
    throw new FlowTransitionError(
      this.state,
      "execute protection",
      "COMPLETED flow carries no execution record — nothing to reconcile",
    );
  }

  getReceipt(): DecisionReceipt {
    this.require("COMPLETED", "emit decision receipt");
    if (this.receipt) return this.receipt;
    const exposure = this.exposure as Exposure;
    const intent = this.intent as ProtectionIntent;
    const analysis = this.analysis as ProtectionAnalysis;
    // Human path always carries a granted approval; the autonomous path
    // carries standing authority instead — never write HUMAN APPROVED
    // unless a human actually approved.
    const approvalState: ApprovalState = this.approval ? "APPROVED" : "NOT_REQUIRED";
    const authority = this.executionAuthority;
    const alternative = analysis.consideredAlternative;
    const demo = this.demoExecution;
    const executionLabel =
      this.executionModeUsed === "BITGET_DEMO" ? "BITGET_DEMO" : "DRY_RUN";
    this.receipt = buildDecisionReceipt({
      receiptId: `TENAX-1C-${this.flowId}`,
      exposure,
      intent,
      proposal: analysis.proposal,
      mandateResult: analysis.authority.mandateDecision.verdict,
      mandateChecks: analysis.authority.mandateDecision.checks,
      approval: approvalState,
      request:
        demo === null
          ? (this.executionResult as ExecutionResult).request
          : {
              mode: "BITGET_DEMO",
              operationId: "placeOrder",
              endpoint: "POST /api/v3/trade/place-order",
              category: "USDT-FUTURES",
              symbol: "NVDAUSDT",
              side: "sell",
              posSide: "short",
              orderType: "market",
              qty: demo.qty,
              clientOid: demo.clientOid,
              kind: "DEMO order — submitted, virtual funds only",
            },
      fundsMoved: demo !== null,
      demoExecution:
        demo === null
          ? undefined
          : {
              orderId: demo.orderId,
              clientOid: demo.clientOid,
              orderStatus: demo.orderStatus,
              filled: demo.filled,
              avgPrice: demo.avgPrice,
              cumExecQty: demo.cumExecQty,
              cumExecValue: demo.cumExecValue,
              leverage: "1x",
              marginMode: "crossed",
              approvedNotionalUsdt: analysis.proposal.proposedTradeValueUsdt,
              submittedAt: demo.submittedAt,
              verifiedAt: demo.verifiedAt,
              fundsDisclaimer: "DEMO ORDER — VIRTUAL FUNDS ONLY",
            },
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
        `provenance: market=REAL(public Bitget), exposure=SIMULATED(fixture), analysis=DEVELOPMENT_FIXTURE, execution=${executionLabel}`,
      ],
    });
    // Standing-authority provenance (B1-prepared fields): populated only
    // for autonomous execution; the human path records HUMAN_APPROVAL
    // with null standing references — never the reverse. A prior
    // escalation record rides along so a human-approved escalation can
    // never read as standing authorization.
    this.receipt = {
      ...this.receipt,
      authoritySource: authority?.authoritySource ?? "HUMAN_APPROVAL",
      standingMandateId: authority?.standingMandateId ?? null,
      standingMandateHash: authority?.standingMandateHash ?? null,
      authorityDecision: authority?.authorityDecision ?? null,
      authorityEvaluatedAt: authority?.authorityEvaluatedAt ?? null,
      standingEscalation: this.standingEscalation,
    };
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
    readonly demoExecution: DemoFlowExecution | null;
    readonly executionModeUsed: ExecutionMode | null;
    readonly proposalHash: string | null;
    readonly aiAudit: AiAnalysisAudit | null;
    readonly analyzedAt: string | null;
    readonly executionAuthority: ExecutionAuthority | null;
    readonly standingEscalation: StandingEscalationRecord | null;
  } {
    return {
      state: this.state,
      exposure: this.exposure,
      intent: this.intent,
      analysis: this.analysis,
      approval: this.approval,
      executionResult: this.executionResult,
      demoExecution: this.demoExecution,
      executionModeUsed: this.executionModeUsed,
      proposalHash: this.analysis ? hashProposal(this.analysis.proposal) : null,
      aiAudit: this.aiAudit,
      analyzedAt: this.analyzedAt,
      executionAuthority: this.executionAuthority,
      standingEscalation: this.standingEscalation,
    };
  }
}
