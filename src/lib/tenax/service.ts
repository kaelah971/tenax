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
import type { ExecutionMode } from "./domain";
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

function readDemoCredentials(env: Record<string, string | undefined>): DemoAuthCredentials | null {
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
