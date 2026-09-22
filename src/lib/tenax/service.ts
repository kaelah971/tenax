// Tenax Phase 1C — application service: the clean API shape for the future UI.
//
// getCapitalContext / createProtectionIntent / analyzeProtectionIntent /
// evaluateProtectionProposal / approveProtectionProposal /
// executeProtectionProposal / getDecisionReceipt.
//
// Authority rules (enforced here, never delegated to callers):
// - Execution re-runs mandate evaluation from the stored proposal and
//   re-verifies approval binding before touching any adapter. A client
//   asserting "mandate passed" is never trusted.
// - executionMode resolves server-side (TENAX_EXECUTION_MODE, default
//   DRY_RUN). BITGET_DEMO additionally requires BITGET_TRADING_MODE=demo;
//   LIVE is unrepresentable. Missing/inconsistent config refuses.
// - No database: demo state lives in an explicitly non-durable dev store.
// - The mandate is the canonical development fixture until an editable
//   mandate UI lands; the exposure is always the simulated 500 USDT fixture.
// - Credentials never leave this server module: they are read from the
//   environment at execution time and never serialized into responses,
//   receipts, or logs.

import { z } from "zod";

import type { RealityPublicBundle } from "../bitget/reality";
import type { DemoAuthCredentials } from "../bitget/demo-auth";
import { parseAmount } from "../bitget/demo-assets";
import { normalizeNvidiaSnapshot, type NvidiaMarketSnapshot } from "../intelligence/snapshot";
import { hashProposal, type ApprovalActor } from "./approval";
import { isDemoTradingMode, resolveExecutionMode } from "./execution";
import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "./fixtures";
import { evaluateMandate } from "./mandate";
import {
  fetchLiveDemoHedgeMarket,
  type DemoHedgeMarketState,
  type DemoMarketReaderDeps,
  type ReadFetchImpl,
  type WriteFetchImpl,
} from "./demo-executor";
import { evaluateCumulativeProtection } from "./cumulative";
import type {
  ApprovalState,
  DecisionReceipt,
  ExecutionMode,
  ExecutionRequest,
  ExecutionResult,
  ProtectionProposal,
} from "./domain";
import type { ProtectionAnalysis } from "./analysis";
import {
  buildExposureGraph,
  withRepresentation,
  type ExposureGraph,
  type GraphRepresentation,
} from "./exposure-graph";
import { type DemoFlowExecution, type FlowState, FlowTransitionError, ProtectionFlow } from "./orchestrator";
import { type TenaxDevStore, nextFlowId } from "./dev-store";
import {
  createDefaultXstocksClient,
  fetchNvdaxDiscovery,
  toAvailableRepresentation,
  toNvdaxDisplayFacts,
  type NvdaxDiscovery,
  type NvdaxDisplayFacts,
} from "../xstocks/public";
import {
  resolveAiConfig,
  type AiFetchImpl,
  type AiProviderConfig,
} from "../ai/provider.ts";
import {
  runAiAnalysis,
  type AiPipelineMarket,
} from "../ai/pipeline.ts";
import type { AiAnalysisAudit } from "../ai/schemas.ts";
import type { AiDecision } from "../ai/schemas.ts";
import type {
  FuturesTicker,
  OhlcCandle,
} from "../bitget/market-series.ts";
import type { NvdaInstrument } from "../bitget/nvda-hedge.ts";
import {
  AUTHORITY_MODES,
  STANDING_ACTION_SHORT_HEDGE,
  STANDING_INTENT_TYPE,
  STANDING_SYMBOL_NVDAUSDT,
  activateStandingMandate,
  consumeStandingExecution,
  createStandingMandate,
  evaluateStandingAuthority,
  revokeStandingMandate,
  updateStandingDraft,
  type StandingAuthorityAction,
  type StandingAuthorityEvaluation,
  type StandingMandate,
  type StandingReservation,
} from "./standing-mandate";
import {
  bindHumanAuthority,
  bindStandingAuthority,
  type ExecutionAuthority,
} from "./authority";import { emitActivityEvent } from "./activity";

export type SnapshotBundleProvider = () => Promise<RealityPublicBundle>;

export const analyzeInputSchema = z.object({
  rawText: z.string().min(1).max(500),
});

export const approveInputSchema = z.object({
  flowId: z.string().min(1).max(64),
  actor: z.literal("human").default("human"),
});

export const executeInputSchema = z.object({
  flowId: z.string().min(1).max(64),
});

export const standingMandateCreateSchema = z
  .object({
    authorityMode: z.enum(AUTHORITY_MODES),
    maxExecutions: z.number().int().min(1).max(100).default(1),
    expiresAt: z.string().datetime({ offset: true }).nullish(),
    // B3 user-configurable bounds (fixture defaults when omitted).
    // maxLeverage is intentionally NOT accepted: execution stays 1x.
    maxProtectionPct: z.number().finite().gt(0).lte(100).default(MANDATE_FIXTURE.maxProtectionPct),
    maxNotionalUsdt: z.number().finite().gt(0).default(MANDATE_FIXTURE.maxTradeValueUsdt),
  })
  .strict();

export const standingMandateIdSchema = z.object({
  id: z.string().min(1).max(64),
});

/**
 * B3 draft-edit patch. Every field optional; unknown keys (subject,
 * symbols, actions, forbidden capabilities, leverage, anything else)
 * are rejected, never stripped. Shape validated here; DRAFT status and
 * future-expiry checked against nowMs in updateStandingDraft.
 */
export const standingMandateUpdateSchema = z
  .object({
    id: z.string().min(1).max(64),
    maxProtectionPct: z.number().finite().gt(0).lte(100).optional(),
    maxNotionalUsdt: z.number().finite().gt(0).optional(),
    maxExecutions: z.number().int().min(1).max(100).optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    authorityMode: z.enum(AUTHORITY_MODES).optional(),
  })
  .strict();

export interface Provenance {
  readonly marketData: "REAL" | "PARTIAL" | "UNAVAILABLE";
  readonly exposure: "SIMULATED";
  readonly analysis: "DEVELOPMENT_FIXTURE";
  readonly execution: "DRY_RUN" | "BITGET_DEMO" | "NOT_EXECUTED";
}

function provenanceFor(
  snapshot: NvidiaMarketSnapshot,
  execution: Provenance["execution"],
): Provenance {
  return {
    marketData:
      snapshot.availability === "AVAILABLE"
        ? "REAL"
        : snapshot.availability === "PARTIAL"
          ? "PARTIAL"
          : "UNAVAILABLE",
    exposure: "SIMULATED",
    analysis: "DEVELOPMENT_FIXTURE",
    execution,
  };
}

function getFlow(store: TenaxDevStore, flowId: string): ProtectionFlow {
  const flow = store.flows.get(flowId);
  if (!flow) throw new FlowTransitionError("IDLE", "locate flow", `unknown flowId ${flowId}`);
  return flow;
}

/**
 * Defense-in-depth: a model analysis that decided WAIT or NO_ACTION can
 * never enter approval or execution, even if flow state were ever
 * inconsistent. Fixture analyses and PROTECT model analyses pass through.
 */
function assertActionableAnalysis(flow: ProtectionFlow): void {
  const { analysis, aiAudit } = flow.getContext();
  if (analysis?.reasoning.kind === "model" && aiAudit && aiAudit.decision !== "PROTECT") {
    throw new FlowTransitionError(
      flow.getFlowState(),
      "authorize model analysis",
      `AI decision is ${aiAudit.decision} — no actionable proposal exists`,
    );
  }
}

export async function getCapitalContext(provider: SnapshotBundleProvider) {
  const snapshot = normalizeNvidiaSnapshot(await provider());
  return {
    exposure: NVDA_EXPOSURE_FIXTURE,
    exposureProvenance: "SIMULATED" as const,
    snapshot,
    provenance: provenanceFor(snapshot, "NOT_EXECUTED"),
  };
}

export function createProtectionIntent(
  store: TenaxDevStore,
  input: z.infer<typeof analyzeInputSchema>,
) {
  const parsed = analyzeInputSchema.parse(input);
  const flowId = nextFlowId(store);
  const flow = new ProtectionFlow(flowId);
  flow.loadExposure(NVDA_EXPOSURE_FIXTURE);
  const intent = flow.createIntent(parsed.rawText);
  store.flows.set(flowId, flow);
  return { flowId, state: flow.getFlowState() as FlowState, intent };
}

export function analyzeProtectionIntent(
  store: TenaxDevStore,
  flowId: string,
  snapshot: NvidiaMarketSnapshot,
) {
  const flow = getFlow(store, flowId);
  const analysis = flow.analyze(snapshot, MANDATE_FIXTURE);
  const decision = flow.evaluate();
  return {
    flowId,
    state: flow.getFlowState() as FlowState,
    proposal: analysis.proposal,
    calculatedTradeValueUsdt: analysis.authority.calculatedTradeValueUsdt,
    reasoning: analysis.reasoning,
    mandateVerdict: decision.verdict,
    mandateChecks: decision.checks,
    executionEligible: analysis.authority.executionEligible,
    provenance: provenanceFor(snapshot, "NOT_EXECUTED"),
  };
}

/** Test/prod injection for the AI path. Production resolves config from server env. */
export interface AiAnalyzeDeps {
  readonly futuresTicker?: FuturesTicker | null;
  readonly candles?: readonly OhlcCandle[] | null;
  readonly nvdax?: NvdaxDiscovery | null;
  readonly instrument?: NvdaInstrument | null;
  readonly config?: AiProviderConfig | null;
  readonly fetchImpl?: AiFetchImpl;
  readonly nowMs?: number;
}

/**
 * Phase 4B-A — model analysis path (explicit TENAX_ANALYSIS_MODE=ai only).
 *
 * Runs the evidence pack through the configured provider, validates the
 * structured output, derives the proposal deterministically, and seats it
 * into the flow. PROTECT continues through mandate evaluation (including
 * REFUSE for over-mandate recommendations — never clamped). WAIT and
 * NO_ACTION stop here with the analysis stored but unevaluated: the flow
 * stays ANALYZED and can never reach approval or execution.
 *
 * AI failures surface as AI_UNAVAILABLE / AI_PROVIDER_ERROR /
 * AI_ANALYSIS_INVALID errors. The fixture is never substituted.
 */
export async function analyzeProtectionIntentWithAi(
  store: TenaxDevStore,
  flowId: string,
  snapshot: NvidiaMarketSnapshot,
  deps: AiAnalyzeDeps = {},
) {
  const flow = getFlow(store, flowId);
  const { exposure, intent } = flow.getContext();
  if (!exposure || !intent) {
    throw new FlowTransitionError(flow.getFlowState(), "analyze with model", "no exposure/intent yet");
  }
  const market: AiPipelineMarket = {
    futuresTicker: deps.futuresTicker ?? null,
    candles: deps.candles ?? null,
    nvdax: deps.nvdax ?? null,
    instrument: deps.instrument ?? null,
  };
  const result = await runAiAnalysis({
    exposure,
    intent,
    mandate: MANDATE_FIXTURE,
    snapshot,
    market,
    config: deps.config ?? resolveAiConfig(process.env),
    fetchImpl: deps.fetchImpl,
    nowMs: deps.nowMs,
  });
  if (!result.ok) {
    throw new Error(`${result.failure.code}: ${result.failure.reason}`);
  }
  if (!result.proposal || !result.mandateDecision) {
    // WAIT / NO_ACTION: store the analysis for display, then stop.
    // No mandate verdict is produced and nothing becomes approvable.
    const idleProposal: ProtectionProposal = {
      underlying: exposure.underlying,
      protectionPct: 0,
      proposedTradeValueUsdt: 0,
      leverageUsed: 1,
    };
    const oversized: ProtectionProposal = {
      underlying: exposure.underlying,
      protectionPct: 40,
      proposedTradeValueUsdt: 200,
      leverageUsed: 1,
    };
    flow.adoptAnalysis(
      snapshot,
      MANDATE_FIXTURE,
      {
        reasoning: result.reasoning,
        proposal: idleProposal,
        authority: {
          calculatedTradeValueUsdt: 0,
          mandateDecision: evaluateMandate(idleProposal, MANDATE_FIXTURE, exposure),
          approvalRequired: MANDATE_FIXTURE.approvalRequired,
          executionEligible: false,
        },
        consideredAlternative: {
          proposal: oversized,
          decision: evaluateMandate(oversized, MANDATE_FIXTURE, exposure),
        },
      },
      result.audit,
    );
    emitActivityEvent(store, {
      type: "AI_ANALYSIS_COMPLETED",
      flowId,
      summary: `AI ${result.analysis.decision} (flow ${flowId}) — no actionable proposal`,
    });
    throw new FlowTransitionError(
      flow.getFlowState(),
      "analyze with model",
      `AI decision is ${result.analysis.decision} — no actionable proposal; stopped before approval`,
    );
  }
  const oversized: ProtectionProposal = {
    underlying: exposure.underlying,
    protectionPct: 40,
    proposedTradeValueUsdt: 200,
    leverageUsed: 1,
  };
  const analysis: ProtectionAnalysis = {
    reasoning: result.reasoning,
    proposal: result.proposal,
    authority: {
      calculatedTradeValueUsdt: result.proposal.proposedTradeValueUsdt,
      mandateDecision: result.mandateDecision,
      approvalRequired: MANDATE_FIXTURE.approvalRequired,
      executionEligible: result.mandateDecision.verdict === "PASS",
    },
    consideredAlternative: {
      proposal: oversized,
      decision: evaluateMandate(oversized, MANDATE_FIXTURE, exposure),
    },
  };
  flow.adoptAnalysis(snapshot, MANDATE_FIXTURE, analysis, result.audit);
  const decision = flow.evaluate();
  const { aiAudit } = flow.getContext();
  emitActivityEvent(store, {
    type: "AI_ANALYSIS_COMPLETED",
    flowId,
    summary: `AI ${result.analysis.decision} ${analysis.proposal.protectionPct}% → $${analysis.authority.calculatedTradeValueUsdt} (flow ${flowId})`,
  });
  return {
    flowId,
    state: flow.getFlowState() as FlowState,
    proposal: analysis.proposal,
    calculatedTradeValueUsdt: analysis.authority.calculatedTradeValueUsdt,
    reasoning: analysis.reasoning,
    aiDecision: result.analysis.decision as AiDecision,
    aiAudit: aiAudit as AiAnalysisAudit,
    mandateVerdict: decision.verdict,
    mandateChecks: decision.checks,
    failedRules: decision.failedRules,
    executionEligible: analysis.authority.executionEligible,
    provenance: provenanceFor(snapshot, "NOT_EXECUTED"),
  };
}

export function evaluateProtectionProposal(store: TenaxDevStore, flowId: string) {
  const flow = getFlow(store, flowId);
  const { analysis } = flow.getContext();
  if (!analysis) {
    throw new FlowTransitionError(flow.getFlowState(), "evaluate proposal", "no analysis yet");
  }
  // Independent re-evaluation: never trust a cached verdict at the boundary.
  const decision = evaluateMandate(analysis.proposal, MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE);
  return {
    flowId,
    state: flow.getFlowState() as FlowState,
    mandateVerdict: decision.verdict,
    mandateChecks: decision.checks,
    failedRules: decision.failedRules,
  };
}

export function approveProtectionProposal(
  store: TenaxDevStore,
  input: z.infer<typeof approveInputSchema>,
) {
  const parsed = approveInputSchema.parse(input);
  const flow = getFlow(store, parsed.flowId);
  assertActionableAnalysis(flow);
  const actor: ApprovalActor = parsed.actor;
  // Request + grant collapse into the single MVP human action. The
  // approval binds the server-resolved execution mode: switching modes
  // later requires a fresh flow.
  const mode = resolveExecutionMode(process.env);
  if (flow.getFlowState() === "MANDATE_PASS") flow.requestApproval(mode);
  const approval = flow.approve(actor);
  return { flowId: parsed.flowId, state: flow.getFlowState() as FlowState, approval };
}

/** Test/prod injection for Demo execution. Production reads env (server-only). */
export interface DemoServiceDeps {
  readonly credentials?: DemoAuthCredentials;
  readonly baseUrl?: string;
  readonly tradingMode?: string;
  readonly marketReader?: (deps: DemoMarketReaderDeps) => Promise<DemoHedgeMarketState>;
  readonly writeFetchImpl?: WriteFetchImpl;
  readonly readFetchImpl?: ReadFetchImpl;
  readonly nowMs?: number;
  readonly executionMode?: ExecutionMode;
}

/** Server-only credential loader. Returns null unless all three Demo secrets are present. Never logged. */
export function readDemoCredentials(env: Record<string, string | undefined>): DemoAuthCredentials | null {
  const apiKey = (env.BITGET_API_KEY ?? "").trim();
  const secretKey = (env.BITGET_SECRET_KEY ?? "").trim();
  const passphrase = (env.BITGET_PASSPHRASE ?? "").trim();
  if (apiKey === "" || secretKey === "" || passphrase === "") return null;
  return { apiKey, secretKey, passphrase };
}

export async function executeProtectionProposal(
  store: TenaxDevStore,
  input: z.infer<typeof executeInputSchema>,
  deps: DemoServiceDeps = {},
) {
  const parsed = executeInputSchema.parse(input);
  const flow = getFlow(store, parsed.flowId);
  assertActionableAnalysis(flow);
  const { analysis } = flow.getContext();
  if (!analysis) {
    throw new FlowTransitionError(flow.getFlowState(), "execute proposal", "no analysis yet");
  }
  // Boundary re-verification: recompute the mandate from the STORED proposal.
  // A tampered proposal or a non-PASS verdict blocks execution here, before
  // the orchestrator's own approval-binding gate runs.
  const fresh = evaluateMandate(analysis.proposal, MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE);
  if (fresh.verdict !== "PASS") {
    throw new FlowTransitionError(
      flow.getFlowState(),
      "execute proposal",
      `recomputed mandate verdict is ${fresh.verdict} — execution blocked`,
    );
  }
  const mode = deps.executionMode ?? resolveExecutionMode(process.env);
  if (mode === "BITGET_DEMO") {
    const tradingMode = deps.tradingMode ?? process.env.BITGET_TRADING_MODE ?? "";
    if (!isDemoTradingMode({ BITGET_TRADING_MODE: tradingMode })) {
      throw new FlowTransitionError(
        flow.getFlowState(),
        "execute proposal",
        "BITGET_DEMO requires BITGET_TRADING_MODE=demo — inconsistent config refuses",
      );
    }
    const credentials = deps.credentials ?? readDemoCredentials(process.env);
    if (!credentials) {
      throw new FlowTransitionError(
        flow.getFlowState(),
        "execute proposal",
        "BITGET_DEMO requires server-side credentials — refusing without them",
      );
    }
    const baseUrl = deps.baseUrl ?? ((process.env.BITGET_API_BASE_URL ?? "").trim() ||
      "https://api.bitget.com");
    const demo = await flow.execute({
      executionMode: "BITGET_DEMO",
      tradingMode,
      credentials,
      baseUrl,
      marketReader: deps.marketReader,
      writeFetchImpl: deps.writeFetchImpl,
      readFetchImpl: deps.readFetchImpl,
      nowMs: deps.nowMs,
    });
    if (!("clientOid" in demo)) {
      throw new FlowTransitionError(
        flow.getFlowState(),
        "execute proposal",
        "BITGET_DEMO execution returned an unexpected shape",
      );
    }
    // Safe serialization only: gate details, order facts, verification —
    // never credentials, signatures, or headers (none exist on the record).
    return {
      flowId: parsed.flowId,
      state: flow.getFlowState() as FlowState,
      executionMode: "BITGET_DEMO" as const,
      submitted: true,
      filled: demo.filled,
      orderId: demo.orderId,
      clientOid: demo.clientOid,
      orderStatus: demo.orderStatus,
      qty: demo.qty,
      approxNotional: demo.approxNotional,
      avgPrice: demo.avgPrice,
      cumExecQty: demo.cumExecQty,
      cumExecValue: demo.cumExecValue,
      submittedAt: demo.submittedAt,
      verifiedAt: demo.verifiedAt,
      disclaimer: "DEMO ORDER — VIRTUAL FUNDS ONLY" as const,
      gates: demo.gates.map((g) => ({ id: g.id, pass: g.pass, detail: g.detail })),
    };
  }
  const result = await flow.execute({ executionMode: "DRY_RUN", nowMs: deps.nowMs });
  if (!("request" in result)) {
    throw new FlowTransitionError(
      flow.getFlowState(),
      "execute proposal",
      "DRY_RUN execution returned an unexpected shape",
    );
  }
  return {
    flowId: parsed.flowId,
    state: flow.getFlowState() as FlowState,
    executionMode: "DRY_RUN" as const,
    fundsMoved: result.fundsMoved,
    submitted: result.submitted,
    disclaimer: result.disclaimer,
    request: result.request,
  };
}

export function getDecisionReceipt(store: TenaxDevStore, flowId: string) {
  const flow = getFlow(store, flowId);
  return { flowId, state: flow.getFlowState() as FlowState, receipt: flow.getReceipt() };
}

/**
 * Phase 4B-B2.5 — resolve the receipt flow consumed under a standing
 * mandate (read-only). Scans flows for a stored receipt bound to the
 * mandate id; latest flow wins. Returns null when no receipt references
 * the mandate — never throws, never fabricates linkage.
 */
export function findReceiptFlowIdByMandate(
  store: TenaxDevStore,
  mandateId: string,
): string | null {
  let latest: string | null = null;
  for (const [flowId, flow] of store.flows) {
    let receipt: { readonly standingMandateId?: string | null } | null = null;
    try {
      receipt = flow.getReceipt();
    } catch {
      continue;
    }
    if (receipt?.standingMandateId === mandateId) latest = flowId;
  }
  return latest;
}

/**
 * Phase 4A — latest evaluated decision in render-ready form (read-only).
 *
 * Surfaces the canonical evaluated proposal, mandate checks, approval
 * state, considered-and-refused alternative, and verified Demo facts from
 * the latest COMPLETED flow. Null when no flow completed. Visualization
 * consumes this; authority stays with the Mandate Engine and receipts.
 */
export interface LatestMandateEvaluation {
  readonly flowId: string;
  readonly proposalPct: number;
  readonly tradeValueUsdt: number;
  readonly leverageUsed: number;
  readonly approval: ApprovalState | null;
  readonly checks: readonly { readonly id: string; readonly pass: boolean }[];
  readonly rejected: {
    readonly value: number;
    readonly pct: number;
    readonly failedRules: readonly string[];
  } | null;
  readonly demo: {
    readonly qty: string;
    readonly avgPrice: number | null;
    readonly submittedAt: string | null;
    readonly filled: boolean;
  } | null;
}

export function getLatestMandateEvaluation(
  store: TenaxDevStore,
): LatestMandateEvaluation | null {
  let latest: { flowId: string; flow: ProtectionFlow } | null = null;
  for (const [flowId, flow] of store.flows) {
    if (flow.getFlowState() !== "COMPLETED") continue;
    latest = { flowId, flow };
  }
  if (!latest) return null;
  const { analysis, approval, demoExecution } = latest.flow.getContext();
  if (!analysis) return null;
  const alternative = analysis.consideredAlternative;
  return {
    flowId: latest.flowId,
    proposalPct: analysis.proposal.protectionPct,
    tradeValueUsdt: analysis.proposal.proposedTradeValueUsdt,
    leverageUsed: analysis.proposal.leverageUsed,
    approval: approval?.state ?? null,
    checks: analysis.authority.mandateDecision.checks.map((c) => ({
      id: c.id,
      pass: c.pass,
    })),
    rejected:
      alternative.decision.verdict === "REFUSE"
        ? {
            value: alternative.proposal.proposedTradeValueUsdt,
            pct: alternative.proposal.protectionPct,
            failedRules: alternative.decision.failedRules,
          }
        : null,
    demo: demoExecution
      ? {
          qty: demoExecution.qty,
          avgPrice: parseAmount(demoExecution.avgPrice),
          submittedAt: demoExecution.submittedAt,
          filled: demoExecution.filled,
        }
      : null,
  };
}

/**
 * Phase 3A — canonical NVIDIA Exposure Graph for the current process.
 * Phase 3B-B — optionally attaches the verified xStocks NVDAx available
 * representation (same builder, then withRepresentation; no second builder).
 *
 * Derives from canonical state only: the simulated exposure fixture plus
 * the latest COMPLETED flow's receipt when one exists. No new source of
 * truth — the protection leg appears if and only if that receipt carries
 * a BITGET_DEMO execution record, and the available leg appears if and
 * only if provider discovery proves identity + address.
 *
 * Provider failures are fully isolated: a throwing, timing-out, or
 * unverified discovery resolves to "no external leaf" and the core
 * exposure/protection graph renders untouched. No caching: public
 * representation metadata is re-resolved per call so the page can never
 * show stale availability semantics.
 *
 * In-memory limitation (minimal, documented): the dev store is
 * process-local and non-durable, so after a server restart no completed
 * flow exists and the graph honestly shows the protection leg as ABSENT
 * until a fresh flow completes. Latest COMPLETED wins; newer incomplete
 * flows never displace it.
 */
export interface ExposureGraphDeps {
  /** Injected for tests; defaults to live provider discovery. Never cached. */
  readonly discoverNvdax?: () => Promise<NvdaxDiscovery | null>;
  /** Overall deadline for provider discovery; exceeded means "no leaf". */
  readonly discoveryTimeoutMs?: number;
}

export interface ExposureGraphView {
  readonly graph: ExposureGraph;
  /** Render-only provider facts; null when discovery proves nothing. */
  readonly nvdax: NvdaxDisplayFacts | null;
}

const DEFAULT_DISCOVERY_TIMEOUT_MS = 12_000;

async function resolveAvailableNvdax(
  deps: ExposureGraphDeps,
): Promise<{ leaf: GraphRepresentation; facts: NvdaxDisplayFacts } | null> {
  const timeoutMs = deps.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
  const discover =
    deps.discoverNvdax ??
    (() =>
      fetchNvdaxDiscovery(createDefaultXstocksClient(8000), { gapMs: 300 }));
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const discovery = await Promise.race([
      discover().catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!discovery) return null;
    const leaf = toAvailableRepresentation(discovery);
    const facts = toNvdaxDisplayFacts(discovery);
    if (!leaf || !facts) return null;
    return { leaf, facts };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function attachAvailable(
  base: ExposureGraph,
  resolved: { leaf: GraphRepresentation; facts: NvdaxDisplayFacts } | null,
): ExposureGraphView {
  if (!resolved) return { graph: base, nvdax: null };
  try {
    return { graph: withRepresentation(base, resolved.leaf), nvdax: resolved.facts };
  } catch {
    return { graph: base, nvdax: null };
  }
}

export async function getExposureGraph(
  store: TenaxDevStore,
  deps: ExposureGraphDeps = {},
): Promise<ExposureGraphView> {
  let latest: { flowId: string; flow: ProtectionFlow } | null = null;
  for (const [flowId, flow] of store.flows) {
    if (flow.getFlowState() !== "COMPLETED") continue;
    latest = { flowId, flow };
  }
  const base =
    latest === null
      ? buildExposureGraph({ exposure: NVDA_EXPOSURE_FIXTURE })
      : buildExposureGraph({
          exposure: latest.flow.getContext().exposure ?? NVDA_EXPOSURE_FIXTURE,
          receipt: latest.flow.getReceipt(),
          flowId: latest.flowId,
        });
  return attachAvailable(base, await resolveAvailableNvdax(deps));
}

// ---- Standing mandates (Phase 4B-B1, dev-store backed) ----------------------
//
// A standing mandate pre-authorizes a NARROW CLASS of protection actions.
// Policy bounds default to the canonical mandate fixture; B3 callers may
// pass user-chosen protection %, notional, executions, expiry, and mode.
// Max leverage is always pinned to 1x here — never client-settable.
// Creating is not authorizing: only activateStandingMandate binds the
// hash. At most one ACTIVE mandate exists at a time; activating revokes
// nothing automatically — revoke the current one first.

function getMandateRecord(store: TenaxDevStore, id: string): StandingMandate {
  const mandate = store.mandates.get(id);
  if (!mandate) throw new FlowTransitionError("IDLE", "locate mandate", `unknown mandate ${id}`);
  return mandate;
}

export function createStandingMandateRecord(
  store: TenaxDevStore,
  input: z.input<typeof standingMandateCreateSchema>,
  nowMs: number = Date.now(),
): StandingMandate {
  const parsed = standingMandateCreateSchema.parse(input);
  const mandate = createStandingMandate({
    maxProtectionPct: parsed.maxProtectionPct,
    maxNotionalUsdt: parsed.maxNotionalUsdt,
    maxLeverage: MANDATE_FIXTURE.maxLeverage,
    allowedSymbols: [STANDING_SYMBOL_NVDAUSDT],
    allowedActionTypes: [STANDING_ACTION_SHORT_HEDGE],
    authorityMode: parsed.authorityMode,
    maxExecutions: parsed.maxExecutions,
    expiresAt: parsed.expiresAt ?? null,
  }, nowMs);
  store.mandates.set(mandate.id, mandate);
  return mandate;
}

export function activateStandingMandateRecord(
  store: TenaxDevStore,
  input: z.infer<typeof standingMandateIdSchema>,
  nowMs: number = Date.now(),
): StandingMandate {
  const parsed = standingMandateIdSchema.parse(input);
  for (const other of store.mandates.values()) {
    if (other.id !== parsed.id && other.status === "ACTIVE") {
      throw new FlowTransitionError(
        "IDLE",
        "activate mandate",
        `mandate ${other.id} is already ACTIVE — revoke it first (one active mandate at a time)`,
      );
    }
  }
  const activated = activateStandingMandate(getMandateRecord(store, parsed.id), nowMs);
  store.mandates.set(activated.id, activated);
  return activated;
}

export function revokeStandingMandateRecord(
  store: TenaxDevStore,
  input: z.infer<typeof standingMandateIdSchema>,
  nowMs: number = Date.now(),
): StandingMandate {
  const parsed = standingMandateIdSchema.parse(input);
  const revoked = revokeStandingMandate(getMandateRecord(store, parsed.id), nowMs);
  store.mandates.set(revoked.id, revoked);
  return revoked;
}

/**
 * Phase 4B-B3 — edit a DRAFT mandate's user-configurable fields.
 * Server-authoritative: shape validated by standingMandateUpdateSchema
 * (unknown keys rejected), DRAFT status and future-expiry enforced in
 * updateStandingDraft. ACTIVE / EXHAUSTED / REVOKED reject
 * deterministically; unknown ids throw. Never mutates in place — the
 * updated record replaces the stored one.
 */
export function updateStandingMandateDraftRecord(
  store: TenaxDevStore,
  input: z.infer<typeof standingMandateUpdateSchema>,
  nowMs: number = Date.now(),
): StandingMandate {
  const parsed = standingMandateUpdateSchema.parse(input);
  const updated = updateStandingDraft(
    getMandateRecord(store, parsed.id),
    {
      maxProtectionPct: parsed.maxProtectionPct,
      maxNotionalUsdt: parsed.maxNotionalUsdt,
      authorityMode: parsed.authorityMode,
      maxExecutions: parsed.maxExecutions,
      expiresAt: parsed.expiresAt,
    },
    nowMs,
  );
  store.mandates.set(updated.id, updated);
  return updated;
}

/** Most recently activated ACTIVE mandate, or null. Never a human approval. */
export function getActiveStandingMandate(store: TenaxDevStore): StandingMandate | null {
  let active: StandingMandate | null = null;
  for (const mandate of store.mandates.values()) {
    if (mandate.status !== "ACTIVE") continue;
    if (!active || (mandate.activatedAt ?? "") > (active.activatedAt ?? "")) active = mandate;
  }
  return active;
}

/**
 * Canonical derived action for a protection proposal: NVDAUSDT SHORT_HEDGE
 * with no sell/transfer/leverage-change requests. The model never
 * constructs this — code maps the proposal deterministically.
 */
export function standingActionFromProposal(input: {
  readonly underlying: string;
  readonly protectionPct: number;
  readonly tradeValueUsdt: number;
  readonly leverageUsed: number;
  readonly proposalAtMs?: number | null;
}): StandingAuthorityAction {
  return {
    subjectId: input.underlying,
    intentType: STANDING_INTENT_TYPE,
    protectionPct: input.protectionPct,
    notionalUsdt: input.tradeValueUsdt,
    leverage: input.leverageUsed,
    symbol: STANDING_SYMBOL_NVDAUSDT,
    actionType: STANDING_ACTION_SHORT_HEDGE,
    requestsSellUnderlying: false,
    requestsTransfer: false,
    requestsLeverageChange: false,
    proposalAtMs: input.proposalAtMs ?? null,
  };
}

/**
 * Evaluate a proposal against the active standing mandate (display and
 * future-gate use). Returns null when no ACTIVE mandate exists — callers
 * then fall back to the human-approval path. Never consumes executions.
 */
export function evaluateStandingAuthorityForAction(
  store: TenaxDevStore,
  action: StandingAuthorityAction,
  nowMs: number = Date.now(),
): StandingAuthorityEvaluation | null {
  const mandate = getActiveStandingMandate(store);
  if (!mandate) return null;
  return evaluateStandingAuthority(mandate, action, nowMs);
}

/**
 * Convenience: build the canonical derived action from a proposal and
 * evaluate it as of now (display freshness assumption, documented).
 */
export function evaluateStandingAuthorityForProposal(
  store: TenaxDevStore,
  proposal: {
    readonly underlying: string;
    readonly protectionPct: number;
    readonly tradeValueUsdt: number;
    readonly leverageUsed: number;
    readonly proposalAtMs?: number | null;
  },
  nowMs: number = Date.now(),
): StandingAuthorityEvaluation | null {
  return evaluateStandingAuthorityForAction(
    store,
    standingActionFromProposal({
      underlying: proposal.underlying,
      protectionPct: proposal.protectionPct,
      tradeValueUsdt: proposal.tradeValueUsdt,
      leverageUsed: proposal.leverageUsed,
      proposalAtMs: proposal.proposalAtMs ?? nowMs,
    }),
    nowMs,
  );
}

/**
 * Consume one standing execution (called by future execution paths only
 * after every Phase-2 gate passes — unwired in B1, tested offline).
 */
export function consumeStandingMandateExecution(
  store: TenaxDevStore,
  input: z.infer<typeof standingMandateIdSchema>,
): StandingMandate {
  const parsed = standingMandateIdSchema.parse(input);
  const consumed = consumeStandingExecution(getMandateRecord(store, parsed.id));
  store.mandates.set(consumed.id, consumed);
  return consumed;
}

// ---- Standing execution reservation (Phase 4B-B2, atomic) -------------------
//
// The budget guard: maxExecutions=1 must never allow two orders, two
// retries, or two consumptions. All three functions below are fully
// synchronous — check-and-set with no awaits — so concurrent requests
// serialize on the Node event loop and the first reserver wins.
//
// Lifecycle: AVAILABLE → RESERVED (before any provider write) → CONSUMED
// (exactly when the provider accepts the order) or RELEASED (any path
// where no write occurred). Reconciliation never consumes.

/**
 * Reserve budget for one exact flow + proposal + mandate triple.
 * Idempotent for the identical triple (retry returns the record);
 * refuses when capacity is held by anything else, exhausted, or dead.
 */
export function reserveStandingCapacity(
  store: TenaxDevStore,
  input: { mandateId: string; flowId: string; proposalHash: string },
  nowMs: number = Date.now(),
): StandingReservation {
  const mandate = getMandateRecord(store, input.mandateId);
  if (mandate.status !== "ACTIVE") {
    throw new FlowTransitionError(
      "IDLE",
      "reserve standing capacity",
      `mandate is ${mandate.status} — refusing`,
    );
  }
  if (mandate.expiresAt !== null) {
    const expiryMs = Date.parse(mandate.expiresAt);
    if (Number.isFinite(expiryMs) && nowMs >= expiryMs) {
      throw new FlowTransitionError(
        "IDLE",
        "reserve standing capacity",
        "mandate expired — refusing",
      );
    }
  }
  if (mandate.executionCount >= mandate.policy.maxExecutions) {
    throw new FlowTransitionError(
      "IDLE",
      "reserve standing capacity",
      "mandate exhausted — refusing",
    );
  }
  const existing = mandate.reservation;
  if (existing) {
    if (
      existing.flowId === input.flowId &&
      existing.proposalHash === input.proposalHash &&
      existing.mandateHash === mandate.mandateHash
    ) {
      return existing;
    }
    throw new FlowTransitionError(
      "IDLE",
      "reserve standing capacity",
      "standing execution capacity is reserved by another action — refusing",
    );
  }
  const reservation: StandingReservation = {
    flowId: input.flowId,
    proposalHash: input.proposalHash,
    mandateHash: mandate.mandateHash,
    reservedAt: new Date(nowMs).toISOString(),
  };
  store.mandates.set(mandate.id, { ...mandate, reservation });
  return reservation;
}

/**
 * Release a reservation when no provider write occurred. Clears only on
 * an exact triple match; anything else (including a concurrent attempt's
 * reservation) is left untouched.
 */
export function releaseStandingReservation(
  store: TenaxDevStore,
  input: { mandateId: string; flowId: string; proposalHash: string },
): boolean {
  const mandate = store.mandates.get(input.mandateId);
  const existing = mandate?.reservation;
  if (
    !mandate ||
    !existing ||
    existing.flowId !== input.flowId ||
    existing.proposalHash !== input.proposalHash ||
    existing.mandateHash !== mandate.mandateHash
  ) {
    return false;
  }
  store.mandates.set(mandate.id, { ...mandate, reservation: null });
  return true;
}

/**
 * Consume exactly once for a reserved triple, at the irreversible point
 * (provider accepted the order). Requires the live reservation — a
 * completed retry reconciles without consuming again. Revocation after
 * submission cannot un-send the order, so accounting proceeds (only new
 * reservations are blocked for dead mandates); an EXHAUSTED transition
 * applies only while the mandate is still ACTIVE.
 */
export function consumeReservedStandingExecution(
  store: TenaxDevStore,
  input: { mandateId: string; flowId: string; proposalHash: string },
): StandingMandate {
  const mandate = getMandateRecord(store, input.mandateId);
  const existing = mandate.reservation;
  if (
    !existing ||
    existing.flowId !== input.flowId ||
    existing.proposalHash !== input.proposalHash ||
    existing.mandateHash !== mandate.mandateHash
  ) {
    throw new FlowTransitionError(
      "IDLE",
      "consume reserved execution",
      "no matching reservation — refusing double consumption",
    );
  }
  if (mandate.executionCount >= mandate.policy.maxExecutions) {
    throw new FlowTransitionError(
      "IDLE",
      "consume reserved execution",
      "mandate already exhausted — refusing double consumption",
    );
  }
  const executionCount = mandate.executionCount + 1;
  const consumed: StandingMandate = {
    ...mandate,
    executionCount,
    status:
      mandate.status === "ACTIVE" && executionCount >= mandate.policy.maxExecutions
        ? "EXHAUSTED"
        : mandate.status,
    reservation: null,
  };
  store.mandates.set(consumed.id, consumed);
  return consumed;
}

export const agentCycleInputSchema = z.object({
  flowId: z.string().min(1).max(64),
});

export type AgentCycleResult =
  | {
      readonly outcome: "NO_ACTION";
      readonly flowId: string;
      readonly state: FlowState;
      readonly aiDecision: "WAIT" | "NO_ACTION" | "PROTECT" | null;
    }
  | {
      readonly outcome: "POLICY_REFUSED";
      readonly flowId: string;
      readonly state: FlowState;
      readonly failedRules: readonly string[];
    }
  | {
      readonly outcome: "NO_STANDING_MANDATE";
      readonly flowId: string;
      readonly state: FlowState;
    }
  | {
      readonly outcome: "STANDING_REFUSED";
      readonly flowId: string;
      readonly state: FlowState;
      readonly evaluation: StandingAuthorityEvaluation;
      /** Present when the cumulative protection gate caused the refusal. */
      readonly cumulative?: {
        readonly existingUsd: number | null;
        readonly proposedUsd: number;
        readonly projectedUsd: number | null;
        readonly projectedPct: number | null;
        readonly maxPct: number;
        readonly reasonCode: string;
      } | null;
    }
  | {
      readonly outcome: "STANDING_ESCALATE";
      readonly flowId: string;
      readonly state: FlowState;
      readonly evaluation: StandingAuthorityEvaluation;
      readonly note: "HUMAN REVIEW REQUIRED";
    }
  | {
      readonly outcome: "IN_PROGRESS";
      readonly flowId: string;
      readonly state: FlowState;
    }
  | {
      readonly outcome: "FAILED";
      readonly flowId: string;
      readonly state: FlowState;
      readonly reason: string;
    }
  | {
      readonly outcome: "EXECUTED";
      readonly flowId: string;
      readonly state: FlowState;
      readonly reconciled: boolean;
      readonly authority: ExecutionAuthority;
      readonly receipt: DecisionReceipt;
      readonly executionMode: "DRY_RUN";
      readonly submitted: false;
      readonly fundsMoved: false;
      readonly disclaimer: "DRY_RUN — NO FUNDS MOVED";
      readonly request: ExecutionRequest;
    }
  | {
      readonly outcome: "EXECUTED";
      readonly flowId: string;
      readonly state: FlowState;
      readonly reconciled: boolean;
      readonly authority: ExecutionAuthority;
      readonly receipt: DecisionReceipt;
      readonly executionMode: "BITGET_DEMO";
      readonly submitted: true;
      readonly filled: boolean;
      readonly orderId: string | null;
      readonly clientOid: string;
      readonly orderStatus: string | null;
      readonly qty: string;
      readonly approxNotional: number | null;
      readonly avgPrice: string | null;
      readonly cumExecQty: string | null;
      readonly cumExecValue: string | null;
      readonly submittedAt: string;
      readonly verifiedAt: string | null;
      readonly disclaimer: "DEMO ORDER — VIRTUAL FUNDS ONLY";
      readonly gates: ReadonlyArray<{ readonly id: string; readonly pass: boolean; readonly detail: string }>;
    };

/**
 * Describe the authority behind an already-COMPLETED flow for reconcile
 * reporting. Prefers the bound execution authority; falls back to the
 * stored human approval record; never invents standing authority.
 */
function describeCompletedAuthority(
  flow: ProtectionFlow,
  proposal: ProtectionProposal,
  nowMs: number,
): ExecutionAuthority {
  const ctx = flow.getContext();
  if (ctx.executionAuthority) return ctx.executionAuthority;
  if (ctx.approval) return bindHumanAuthority(ctx.approval, proposal, nowMs);
  return {
    authoritySource: "HUMAN_APPROVAL",
    proposalHash: hashProposal(proposal),
    authorizedAt: new Date(nowMs).toISOString(),
    approvalId: null,
    standingMandateId: null,
    standingMandateHash: null,
    authorityDecision: null,
    authorityEvaluatedAt: null,
    reservationKey: null,
  };
}

/**
 * Phase 4B-B2 — one explicit autonomous agent-cycle invocation.
 *
 * Server-side orchestration only; called by POST /api/protection/agent-cycle
 * (RUN TENAX AGENT). Never runs on page load, GET, effects, or polling.
 *
 * 1. Reads the validated analysis; WAIT/NO_ACTION (or a zero proposal)
 *    stops with NO_ACTION — no reservation, no budget, no Bitget request.
 * 2. Re-evaluates deterministic policy from the STORED proposal; REFUSE stops.
 * 3. Requires an ACTIVE standing mandate (else NO_STANDING_MANDATE).
 * 4. Evaluates standing authority fresh; REFUSED/ESCALATE stop with no
 *    consumption (escalation routes to the manual human-approval path).
  * 5. Binds execution authority to the exact proposal and atomically
  *    reserves budget (idempotent for the identical triple). In BITGET_DEMO
  *    mode a cumulative protection gate runs first: live existing short +
  *    proposal must fit inside maxProtectionPct together, else STANDING_REFUSED.
  * 6. Runs ALL existing executor gates via the shared flow tails.
 * 7. DRY_RUN returns a preview only: reservation released, budget untouched.
 * 8. BITGET_DEMO submits only here; the provider-accepted order consumes
 *    the budget exactly once at the irreversible point. Verification and
 *    reconciliation never consume again.
 */
export async function runProtectionAgentCycle(
  store: TenaxDevStore,
  input: z.infer<typeof agentCycleInputSchema>,
  deps: DemoServiceDeps = {},
): Promise<AgentCycleResult> {
  const parsed = agentCycleInputSchema.parse(input);
  const flowId = parsed.flowId;
  const flow = getFlow(store, flowId);
  const nowMs = deps.nowMs ?? Date.now();
  const ctx = flow.getContext();
  const analysis = ctx.analysis;
  if (!analysis) {
    throw new FlowTransitionError(flow.getFlowState(), "run agent cycle", "no analysis yet");
  }

  // 1–2. Actionability: model WAIT/NO_ACTION or a zero proposal stops cold.
  const proposal = analysis.proposal;
  const modelDecision = analysis.reasoning.kind === "model" ? (ctx.aiAudit?.decision ?? null) : null;
  if (modelDecision !== null && modelDecision !== "PROTECT") {
    return { outcome: "NO_ACTION", flowId, state: flow.getFlowState(), aiDecision: modelDecision };
  }
  if (!(proposal.protectionPct > 0) || !(analysis.authority.calculatedTradeValueUsdt > 0)) {
    return { outcome: "NO_ACTION", flowId, state: flow.getFlowState(), aiDecision: modelDecision };
  }

  // 3. Deterministic policy re-evaluation from the STORED proposal.
  const fresh = evaluateMandate(proposal, MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE);
  if (fresh.verdict !== "PASS") {
    return {
      outcome: "POLICY_REFUSED",
      flowId,
      state: flow.getFlowState(),
      failedRules: fresh.failedRules,
    };
  }

  // Execution-mode safety (identical rules to the manual path).
  // Unknown modes resolve to DRY_RUN: LIVE is unrepresentable and can
  // never select a live adapter — there is no live adapter.
  const requestedMode = deps.executionMode ?? resolveExecutionMode(process.env);
  const mode: ExecutionMode = requestedMode === "BITGET_DEMO" ? "BITGET_DEMO" : "DRY_RUN";

  // COMPLETED flows reconcile read-only: no mandate lookup, no
  // reservation, no consumption beyond crash-recovery. The stored
  // receipt already carries the original authority.
  if (flow.getFlowState() === "COMPLETED") {
    const bestEffortCreds =
      mode === "BITGET_DEMO"
        ? (deps.credentials ?? readDemoCredentials(process.env) ?? undefined)
        : undefined;
    const reconciled = await flow.execute({
      executionMode: mode,
      tradingMode: deps.tradingMode,
      credentials: bestEffortCreds,
      baseUrl: deps.baseUrl,
      marketReader: deps.marketReader,
      writeFetchImpl: deps.writeFetchImpl,
      readFetchImpl: deps.readFetchImpl,
      nowMs: deps.nowMs,
    });
    const { receipt } = getDecisionReceipt(store, flowId);
    if (receipt.authoritySource === "STANDING_MANDATE" && receipt.standingMandateId) {
      ensureConsumedIfSubmitted(store, {
        mandateId: receipt.standingMandateId,
        flowId,
        proposalHash: hashProposal(proposal),
      });
    }
    return settleAutonomous(
      flowId,
      flow,
      describeCompletedAuthority(flow, proposal, nowMs),
      receipt,
      reconciled,
      true,
      store,
      undefined,
      nowMs,
      false,
    );
  }

  let tradingMode = "";
  let credentials = null;
  let baseUrl = "";
  if (mode === "BITGET_DEMO") {
    tradingMode = deps.tradingMode ?? process.env.BITGET_TRADING_MODE ?? "";
    if (!isDemoTradingMode({ BITGET_TRADING_MODE: tradingMode })) {
      throw new FlowTransitionError(
        flow.getFlowState(),
        "run agent cycle",
        "BITGET_DEMO requires BITGET_TRADING_MODE=demo — inconsistent config refuses",
      );
    }
    const found = deps.credentials ?? readDemoCredentials(process.env);
    if (!found) {
      throw new FlowTransitionError(
        flow.getFlowState(),
        "run agent cycle",
        "BITGET_DEMO requires server-side credentials — refusing without them",
      );
    }
    credentials = found;
    baseUrl = deps.baseUrl ?? ((process.env.BITGET_API_BASE_URL ?? "").trim() ||
      "https://api.bitget.com");
  }

  // 4–5. Standing authority: fresh mandate, fresh evaluation.
  const mandate = getActiveStandingMandate(store);
  if (!mandate) {
    return { outcome: "NO_STANDING_MANDATE", flowId, state: flow.getFlowState() };
  }
  const analyzedAt = flow.getContext().analyzedAt;
  const action = standingActionFromProposal({
    underlying: proposal.underlying,
    protectionPct: proposal.protectionPct,
    tradeValueUsdt: analysis.authority.calculatedTradeValueUsdt,
    leverageUsed: proposal.leverageUsed,
    proposalAtMs: analyzedAt === null ? null : Date.parse(analyzedAt),
  });
  const evaluation = evaluateStandingAuthority(mandate, action, nowMs);
  if (evaluation.decision === "REFUSED") {
    emitActivityEvent(store, {
      type: "STANDING_AUTHORITY_REFUSED",
      flowId,
      summary: `Standing ${evaluation.mandateId} refused (${evaluation.failedRules.join(",") || "policy"})`,
    }, nowMs);
    return { outcome: "STANDING_REFUSED", flowId, state: flow.getFlowState(), evaluation };
  }
  if (evaluation.decision === "ESCALATE") {
    emitActivityEvent(store, {
      type: "STANDING_AUTHORITY_ESCALATED",
      flowId,
      summary: `Standing ${evaluation.mandateId} escalated — human review required`,
    }, nowMs);
    return {
      outcome: "STANDING_ESCALATE",
      flowId,
      state: flow.getFlowState(),
      evaluation,
      note: "HUMAN REVIEW REQUIRED",
    };
  }

  // 6–7. Bind authority to the exact proposal; reserve budget atomically.
  // 6b. Cumulative protection gate (BITGET_DEMO writes only): the live
  // existing Demo short plus this proposal must fit inside
  // maxProtectionPct together. DRY_RUN previews move nothing and carry
  // no budget, so they skip this live-state check. This runs BEFORE any
  // provider write and before irreversible budget consumption — a refusal
  // here reserves nothing and consumes nothing.
  if (mode === "BITGET_DEMO") {
    const cycleMarket =
      credentials !== null && baseUrl !== ""
        ? await readAgentCycleMarket(deps, credentials, baseUrl)
        : null;
    const cumulative = evaluateCumulativeProtection({
      grossExposureUsd: (flow.getContext().exposure ?? NVDA_EXPOSURE_FIXTURE).exposureValueUsdt,
      existingPosition: cycleMarket?.position ?? null,
      proposedAdditionalUsd: analysis.authority.calculatedTradeValueUsdt,
      maxProtectionPct: MANDATE_FIXTURE.maxProtectionPct,
    });
    if (!cumulative.passes) {
      emitActivityEvent(store, {
        type: "STANDING_AUTHORITY_REFUSED",
        flowId,
        summary: `Standing ${evaluation.mandateId} refused (projected ${cumulative.projectedPct ?? "?"}% > max ${cumulative.maxPct}%)`,
      }, nowMs);
      return {
        outcome: "STANDING_REFUSED",
        flowId,
        state: flow.getFlowState(),
        evaluation,
        cumulative: {
          existingUsd: cumulative.existingUsd,
          proposedUsd: cumulative.proposedUsd,
          projectedUsd: cumulative.projectedUsd,
          projectedPct: cumulative.projectedPct,
          maxPct: cumulative.maxPct,
          reasonCode: cumulative.reasonCode,
        },
      };
    }
  }
  const authority = bindStandingAuthority(
    {
      mandateId: mandate.id,
      mandateHash: mandate.mandateHash,
      evaluatedAt: evaluation.evaluatedAt,
    },
    proposal,
    flowId,
    nowMs,
  );
  const reservationKey = {
    mandateId: mandate.id,
    flowId,
    proposalHash: authority.proposalHash,
  };
  // COMPLETED here is unreachable (handled above), but the flow may
  // still complete underneath us — see the catch branch below.
  reserveStandingCapacity(store, reservationKey, nowMs);
  emitActivityEvent(store, {
    type: "STANDING_AUTHORITY_AUTHORIZED",
    flowId,
    summary: `Standing ${mandate.id} authorized ${proposal.protectionPct}% / $${analysis.authority.calculatedTradeValueUsdt}`,
  }, nowMs);

  const autonomousOpts = {
    authority,
    mandate: getMandateRecord(store, mandate.id),
    executionMode: mode,
    tradingMode,
    credentials: credentials ?? undefined,
    baseUrl: baseUrl === "" ? undefined : baseUrl,
    marketReader: deps.marketReader,
    writeFetchImpl: deps.writeFetchImpl,
    readFetchImpl: deps.readFetchImpl,
    nowMs: deps.nowMs,
  };
  try {
    const result = await flow.executeAutonomous(autonomousOpts);
    return settleAutonomous(flowId, flow, authority, null, result, false, store, reservationKey, nowMs);
  } catch (err) {
    const state = flow.getFlowState();
    if (state === "COMPLETED") {
      // Lost a race with a completing attempt: release our unspent
      // reservation, then reconcile read-only.
      releaseStandingReservation(store, reservationKey);
      const reconciled = await flow.executeAutonomous(autonomousOpts);
      ensureConsumedIfSubmitted(store, reservationKey);
      const { receipt } = getDecisionReceipt(store, flowId);
      return settleAutonomous(flowId, flow, authority, receipt, reconciled, true, store, undefined, nowMs, false);
    }
    if (state === "EXECUTING") {
      // A concurrent attempt owns this action; leave its reservation intact.
      return { outcome: "IN_PROGRESS", flowId, state };
    }
    // Pre-submit or submit failure: nothing was accepted — release.
    releaseStandingReservation(store, reservationKey);
    const reason = err instanceof Error ? err.message : "Autonomous execution failed";
    emitActivityEvent(store, {
      type: "AUTONOMOUS_EXECUTION_FAILED",
      flowId,
      summary: `Autonomous attempt failed (${reason.slice(0, 160)})`,
    }, nowMs);
    return { outcome: "FAILED", flowId, state, reason };
  }
}

/** Best-effort fresh market read for the cumulative gate. Null on any failure. */
async function readAgentCycleMarket(
  deps: DemoServiceDeps,
  credentials: DemoAuthCredentials,
  baseUrl: string,
): Promise<DemoHedgeMarketState | null> {
  try {
    const reader = deps.marketReader ?? fetchLiveDemoHedgeMarket;
    return await reader({ credentials, baseUrl });
  } catch {
    return null;
  }
}

/** Consume only when a live reservation still exists (never twice). */
function ensureConsumedIfSubmitted(
  store: TenaxDevStore,
  reservationKey: { mandateId: string; flowId: string; proposalHash: string },
): void {
  const mandate = store.mandates.get(reservationKey.mandateId);
  const existing = mandate?.reservation;
  if (
    mandate &&
    existing &&
    existing.flowId === reservationKey.flowId &&
    existing.proposalHash === reservationKey.proposalHash &&
    existing.mandateHash === mandate.mandateHash
  ) {
    consumeReservedStandingExecution(store, reservationKey);
  }
}

/** Settle a successful autonomous execution into the cycle result shape. */
function settleAutonomous(
  flowId: string,
  flow: ProtectionFlow,
  authority: ExecutionAuthority,
  receipt: DecisionReceipt | null,
  result: ExecutionResult | DemoFlowExecution,
  reconciled: boolean,
  store?: TenaxDevStore,
  reservationKey?: { mandateId: string; flowId: string; proposalHash: string },
  nowMs?: number,
  emitEvents: boolean = true,
): Extract<AgentCycleResult, { outcome: "EXECUTED" }> {
  const state = flow.getFlowState() as FlowState;
  if ("request" in result) {
    // DRY_RUN: preview only — release the reservation, budget untouched.
    if (store && reservationKey) releaseStandingReservation(store, reservationKey);
    const finalReceipt = receipt ?? getDecisionReceipt(store as TenaxDevStore, flowId).receipt;
    if (store && emitEvents) {
      emitActivityEvent(store, {
        type: "DECISION_RECEIPT_READY",
        flowId,
        summary: `Receipt ${finalReceipt.receiptId} ready (DRY_RUN preview, no funds moved)`,
        receiptId: finalReceipt.receiptId,
      }, nowMs ?? Date.now());
    }
    return {
      outcome: "EXECUTED",
      flowId,
      state,
      reconciled,
      authority,
      receipt: finalReceipt,
      executionMode: "DRY_RUN",
      submitted: false,
      fundsMoved: result.fundsMoved,
      disclaimer: result.disclaimer,
      request: result.request,
    };
  }
  // BITGET_DEMO: the irreversible point was reached inside the flow —
  // consume exactly once, then receipt + events.
  if (store && reservationKey) ensureConsumedIfSubmitted(store, reservationKey);
  const finalReceipt = receipt ?? getDecisionReceipt(store as TenaxDevStore, flowId).receipt;
  if (store && emitEvents) {
    const at = nowMs ?? Date.now();
    emitActivityEvent(store, {
      type: "AUTONOMOUS_EXECUTION_SUBMITTED",
      flowId,
      summary: `Demo order ${result.orderId ?? "unresolved"} submitted (${result.qty} NVDAUSDT short)`,
      receiptId: finalReceipt.receiptId,
    }, at);
    emitActivityEvent(store, {
      type: result.filled ? "AUTONOMOUS_EXECUTION_FILLED" : "AUTONOMOUS_EXECUTION_FAILED",
      flowId,
      summary: result.filled
        ? `Demo order filled (${result.orderStatus})`
        : `Demo order not filled (${result.orderStatus ?? "unknown"})`,
      receiptId: finalReceipt.receiptId,
    }, at);
    emitActivityEvent(store, {
      type: "DECISION_RECEIPT_READY",
      flowId,
      summary: `Receipt ${finalReceipt.receiptId} ready (BITGET_DEMO, virtual funds)`,
      receiptId: finalReceipt.receiptId,
    }, at);
  }
  return {
    outcome: "EXECUTED",
    flowId,
    state,
    reconciled,
    authority,
    receipt: finalReceipt,
    executionMode: "BITGET_DEMO",
    submitted: true,
    filled: result.filled,
    orderId: result.orderId,
    clientOid: result.clientOid,
    orderStatus: result.orderStatus,
    qty: result.qty,
    approxNotional: result.approxNotional,
    avgPrice: result.avgPrice,
    cumExecQty: result.cumExecQty,
    cumExecValue: result.cumExecValue,
    submittedAt: result.submittedAt,
    verifiedAt: result.verifiedAt,
    disclaimer: "DEMO ORDER — VIRTUAL FUNDS ONLY",
    gates: result.gates.map((g) => ({ id: g.id, pass: g.pass, detail: g.detail })),
  };
}
