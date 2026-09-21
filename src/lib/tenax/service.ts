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
import { type ApprovalActor } from "./approval";
import { isDemoTradingMode, resolveExecutionMode } from "./execution";
import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "./fixtures";
import { evaluateMandate } from "./mandate";
import {
  type DemoHedgeMarketState,
  type DemoMarketReaderDeps,
  type ReadFetchImpl,
  type WriteFetchImpl,
} from "./demo-executor";
import type { ApprovalState, ExecutionMode, ProtectionProposal } from "./domain";
import type { ProtectionAnalysis } from "./analysis";
import {
  buildExposureGraph,
  withRepresentation,
  type ExposureGraph,
  type GraphRepresentation,
} from "./exposure-graph";
import { type FlowState, FlowTransitionError, ProtectionFlow } from "./orchestrator";
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
  type StandingAuthorityAction,
  type StandingAuthorityEvaluation,
  type StandingMandate,
} from "./standing-mandate";

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

export const standingMandateCreateSchema = z.object({
  authorityMode: z.enum(AUTHORITY_MODES),
  maxExecutions: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime({ offset: true }).nullish(),
});

export const standingMandateIdSchema = z.object({
  id: z.string().min(1).max(64),
});

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
// Policy bounds (except mode/executions/expiry) come from the canonical
// mandate fixture — B1 offers no custom limits. Creating is not
// authorizing: only activateStandingMandate binds the hash. At most one
// ACTIVE mandate exists at a time; activating revokes nothing
// automatically — revoke the current one first.

function getMandateRecord(store: TenaxDevStore, id: string): StandingMandate {
  const mandate = store.mandates.get(id);
  if (!mandate) throw new FlowTransitionError("IDLE", "locate mandate", `unknown mandate ${id}`);
  return mandate;
}

export function createStandingMandateRecord(
  store: TenaxDevStore,
  input: z.infer<typeof standingMandateCreateSchema>,
  nowMs: number = Date.now(),
): StandingMandate {
  const parsed = standingMandateCreateSchema.parse(input);
  const mandate = createStandingMandate({
    maxProtectionPct: MANDATE_FIXTURE.maxProtectionPct,
    maxNotionalUsdt: MANDATE_FIXTURE.maxTradeValueUsdt,
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
      proposalAtMs: nowMs,
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
