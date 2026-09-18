// Tenax Phase 1C — application service: the clean API shape for the future UI.
//
// getCapitalContext / createProtectionIntent / analyzeProtectionIntent /
// evaluateProtectionProposal / approveProtectionProposal /
// executeProtectionProposal / getDecisionReceipt.
//
// Authority rules (enforced here, never delegated to callers):
// - Execution re-runs mandate evaluation from the stored proposal and
//   re-verifies approval binding before touching the adapter. A client
//   asserting "mandate passed" is never trusted.
// - executionMode defaults to DRY_RUN. BITGET_DEMO stays unavailable.
// - No database: demo state lives in an explicitly non-durable dev store.
// - The mandate is the canonical development fixture until an editable
//   mandate UI lands; the exposure is always the simulated 500 USDT fixture.

import { z } from "zod";

import type { RealityPublicBundle } from "../bitget/reality";
import { normalizeNvidiaSnapshot, type NvidiaMarketSnapshot } from "../intelligence/snapshot";
import { type ApprovalActor } from "./approval";
import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "./fixtures";
import { evaluateMandate } from "./mandate";
import { type FlowState, FlowTransitionError, ProtectionFlow } from "./orchestrator";
import { type TenaxDevStore, nextFlowId } from "./dev-store";

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
  readonly execution: "DRY_RUN" | "NOT_EXECUTED";
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
  // Request + grant collapse into the single MVP human action.
  if (flow.getFlowState() === "MANDATE_PASS") flow.requestApproval();
  const approval = flow.approve(actor);
  return { flowId: parsed.flowId, state: flow.getFlowState() as FlowState, approval };
}

export function executeProtectionProposal(
  store: TenaxDevStore,
  input: z.infer<typeof executeInputSchema>,
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
  const result = flow.execute();
  return {
    flowId: parsed.flowId,
    state: flow.getFlowState() as FlowState,
    executionMode: result.mode,
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
