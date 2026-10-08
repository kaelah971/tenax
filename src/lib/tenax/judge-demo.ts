// Tenax judge demo — one-click hosted authority flow (server-only).
//
// Runs the REAL canonical product path against a controlled, explicitly
// labeled demo fixture: simulated exposure → demo intent → fixture-kind
// analysis seating → deterministic mandate gate → terminal refusal
// evidence (activity + JudgeProof + PaperTradingRun, NO_ORDER).
//
// This module composes existing domain services only — exposure fixture,
// ProtectionFlow transitions, evaluateMandate, recordDeterministicRefusal
// (activity/proof/run seam). It performs zero network I/O, reads zero env,
// calls no AI provider, touches no Bitget endpoint, and never reaches an
// execution adapter: a REFUSE verdict cannot execute by construction.
// Non-REFUSE outcomes fail closed (throw) rather than proceeding.
//
// Reruns: each intentional run mints a fresh demo flow identity, so every
// RUN DEMO click yields its own explicit evidence set. Retries can never
// duplicate provider execution because the refusal path has no write.

import { randomBytes } from "node:crypto";

import { hashProposal } from "./approval.ts";
import type { ProtectionAnalysis } from "./analysis.ts";
import type { TenaxDevStore } from "./dev-store.ts";
import type { ProofRepository } from "../proof/repository.ts";
import {
  MANDATE_FIXTURE,
  NVDA_EXPOSURE_FIXTURE,
  PROPOSAL_REFUSE_VALUE_FIXTURE,
} from "./fixtures.ts";
import type { NvidiaMarketSnapshot } from "../intelligence/snapshot.ts";
import { evaluateMandate } from "./mandate.ts";
import { ProtectionFlow } from "./orchestrator.ts";
import {
  activateStandingMandateRecord,
  analyzeProtectionIntent,
  createStandingMandateRecord,
  getActiveStandingMandate,
  getDecisionReceipt,
  recordDeterministicRefusal,
  runProtectionAgentCycle,
} from "./service.ts";
import { paperTradingRunId } from "./paper-trading-run.ts";
import type { PaperTradingRunRepository } from "./paper-trading-run-repository.ts";
import { getPaperTradingRunRepository } from "./paper-trading-run-repository.ts";
import { getProofRepository } from "../proof/repository.ts";
import { proofIdFor } from "../proof/model.ts";

if (typeof window !== "undefined") {
  throw new Error("Judge demo service is server-only");
}

export const JUDGE_DEMO_VERSION = 1 as const;
/** Controlled demo intent text — labeled, never mistaken for user input. */
export const JUDGE_DEMO_RAW_TEXT =
  "Judge demo: controlled 40% protection scenario (development fixture).";
export const JUDGE_DEMO_PROVENANCE = "DEVELOPMENT_FIXTURE" as const;

export type JudgeDemoStageId =
  | "EXPOSURE"
  | "EVENT_CONTEXT"
  | "INTENT"
  | "MANDATE_GATE"
  | "EXECUTION_AUTHORITY"
  | "RESULT";

export interface JudgeDemoStage {
  readonly id: JudgeDemoStageId;
  readonly label: string;
  readonly detail: string;
  readonly status: "COMPLETE";
}

export interface JudgeDemoResult {
  readonly version: typeof JUDGE_DEMO_VERSION;
  readonly flowId: string;
  readonly runId: string;
  readonly proofId: string;
  readonly activityId: string;
  readonly proposalHash: string;
  readonly protectionPct: number;
  readonly proposedTradeValueUsdt: number;
  readonly mandateVerdict: "REFUSE";
  readonly failedRules: readonly string[];
  readonly authorityOutcome: "REFUSE";
  readonly executionStatus: "NO_ORDER";
  readonly provenance: typeof JUDGE_DEMO_PROVENANCE;
  readonly createdAt: string;
  readonly stages: readonly JudgeDemoStage[];
}

export interface RunJudgeDemoInput {
  readonly nowMs?: number;
  readonly runRepository?: PaperTradingRunRepository;
  readonly proofRepository?: ProofRepository;
}

export const JUDGE_DEMO_EXEC_RAW_TEXT =
  "Judge demo: controlled 20% execution scenario (development fixture).";

export interface JudgeExecutionDemoResult {
  readonly version: typeof JUDGE_DEMO_VERSION;
  readonly flowId: string;
  readonly runId: string;
  readonly receiptId: string;
  readonly proposalHash: string;
  readonly protectionPct: number;
  readonly proposedTradeValueUsdt: number;
  readonly mandateVerdict: "PASS";
  readonly authorityOutcome: "EXECUTE";
  readonly executionStatus: "PREVIEW";
  readonly provenance: typeof JUDGE_DEMO_PROVENANCE;
  readonly createdAt: string;
  readonly stages: readonly JudgeDemoStage[];
}

export interface RunJudgeExecutionDemoInput {
  readonly snapshot: NvidiaMarketSnapshot;
  readonly nowMs?: number;
  readonly runRepository?: PaperTradingRunRepository;
  readonly proofRepository?: ProofRepository;
}

function uniqueDemoFlowId(store: TenaxDevStore, nowMs: number): string {
  // Timestamp plus cryptographic randomness: two serverless instances
  // starting in the same millisecond must still mint distinct flow ids,
  // or their durable run rows would collide on UNIQUE(flow_id). The
  // store-local loop below additionally guards same-process reruns.
  let candidate = `demo-${nowMs}-${randomBytes(4).toString("hex")}`;
  let suffix = 0;
  while (store.flows.has(candidate)) {
    suffix += 1;
    candidate = `demo-${nowMs}-${randomBytes(4).toString("hex")}-${suffix}`;
  }
  return candidate;
}

/**
 * Run one judge demo cycle to its terminal REFUSE evidence. Uses only the
 * default repositories/process env of the caller (the API route runs with
 * server env, so durable Postgres is used when configured).
 */
export async function runJudgeDemo(
  store: TenaxDevStore,
  input: RunJudgeDemoInput = {},
): Promise<JudgeDemoResult> {
  const nowMs = input.nowMs ?? Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const flowId = uniqueDemoFlowId(store, nowMs);

  // 01–03: real flow, real exposure fixture, real intent mechanics.
  const flow = new ProtectionFlow(flowId);
  flow.loadExposure(NVDA_EXPOSURE_FIXTURE);
  const intent = flow.createIntent(JUDGE_DEMO_RAW_TEXT);
  store.flows.set(flowId, flow);

  // Controlled demo input: the canonical 40%/$200 refusal proposal
  // values. Authority below is computed by real deterministic code.
  const proposal = { ...PROPOSAL_REFUSE_VALUE_FIXTURE };
  const proposalHash = hashProposal(proposal);
  const mandateDecision = evaluateMandate(
    proposal,
    MANDATE_FIXTURE,
    NVDA_EXPOSURE_FIXTURE,
    createdAt,
  );
  const analysis: ProtectionAnalysis = {
    reasoning: {
      kind: "development-fixture",
      summary:
        "Judge demo: controlled 40% protection scenario against the canonical mandate.",
      riskObservations: [
        "Demo fixture input: 40% / $200 controlled proposal (development fixture).",
        "No verified NVIDIA event; no live market data is consulted by this demo.",
      ],
      proposedProtectionPct: proposal.protectionPct,
      rationale:
        "The demo proposes the canonical oversized protection input so the " +
        "deterministic mandate gate can refuse it. Size is demo input only; " +
        "allowability is decided by real mandate evaluation. This is fixture " +
        "reasoning, not live AI output.",
      evidenceRefs: ["demo:controlled-fixture"],
    },
    proposal,
    authority: {
      calculatedTradeValueUsdt: proposal.proposedTradeValueUsdt,
      mandateDecision,
      approvalRequired: MANDATE_FIXTURE.approvalRequired,
      executionEligible: false,
    },
    consideredAlternative: {
      proposal: {
        underlying: NVDA_EXPOSURE_FIXTURE.underlying,
        protectionPct: 20,
        proposedTradeValueUsdt: 100,
        leverageUsed: 1,
      },
      decision: evaluateMandate(
        {
          underlying: NVDA_EXPOSURE_FIXTURE.underlying,
          protectionPct: 20,
          proposedTradeValueUsdt: 100,
          leverageUsed: 1,
        },
        MANDATE_FIXTURE,
        NVDA_EXPOSURE_FIXTURE,
        createdAt,
      ),
    },
  };
  flow.adoptDemoAnalysis(MANDATE_FIXTURE, analysis);

  // 04: real mandate transition. Anything but REFUSE fails closed.
  const decision = flow.evaluate();
  if (decision.verdict !== "REFUSE") {
    throw new Error(
      `JUDGE_DEMO_UNEXPECTED: demo proposal was not refused (got ${decision.verdict}) — refusing to proceed`,
    );
  }

  // 05–06: real terminal evidence seam (activity + proof + run, NO_ORDER).
  const recorded = await recordDeterministicRefusal(store, flowId, {
    nowMs,
    runRepository: input.runRepository,
    proofRepository: input.proofRepository,
  });
  if (!recorded) {
    throw new Error("JUDGE_DEMO_UNEXPECTED: refusal evidence was not recorded");
  }

  // Truthfulness gate: the returned runId must be durably retrievable
  // right now — never report success for a record that is not there.
  const runId = paperTradingRunId(flowId);
  const runsRepo = input.runRepository ?? getPaperTradingRunRepository();
  const proofsRepo = input.proofRepository ?? getProofRepository().repo;
  const savedRun = await runsRepo.getRun(runId).catch(() => null);
  const savedProof =
    savedRun?.sourceProofId === null || savedRun?.sourceProofId === undefined
      ? null
      : await proofsRepo.getProof(savedRun.sourceProofId).catch(() => null);
  if (!savedRun || !savedProof) {
    throw new Error(
      "JUDGE_DEMO_UNEXPECTED: durable refusal evidence not retrievable after persist — refusing to report success",
    );
  }

  return {
    version: JUDGE_DEMO_VERSION,
    flowId,
    runId: paperTradingRunId(flowId),
    proofId: proofIdFor("POLICY_REFUSED", recorded.event.id),
    activityId: recorded.event.id,
    proposalHash,
    protectionPct: proposal.protectionPct,
    proposedTradeValueUsdt: proposal.proposedTradeValueUsdt,
    mandateVerdict: "REFUSE",
    failedRules: [...decision.failedRules],
    authorityOutcome: "REFUSE",
    executionStatus: "NO_ORDER",
    provenance: JUDGE_DEMO_PROVENANCE,
    createdAt,
    stages: [
      {
        id: "EXPOSURE",
        label: "01 · CAPITAL",
        detail: `$${NVDA_EXPOSURE_FIXTURE.exposureValueUsdt} simulated NVIDIA exposure exists (fixture, not owned live)`,
        status: "COMPLETE",
      },
      {
        id: "EVENT_CONTEXT",
        label: "02 · EVENT",
        detail: "Controlled fixture context stands in for event risk — no verified event consulted",
        status: "COMPLETE",
      },
      {
        id: "INTENT",
        label: "03 · AI INTENT",
        detail: `${intent.type} proposes PROTECT 40% · $200 (fixture input, not model output)`,
        status: "COMPLETE",
      },
      {
        id: "MANDATE_GATE",
        label: "04 · AUTHORITY",
        detail: `Tenax compares it to the ${MANDATE_FIXTURE.maxProtectionPct}% · $${MANDATE_FIXTURE.maxTradeValueUsdt} mandate — REFUSED (${decision.failedRules.join(", ")})`,
        status: "COMPLETE",
      },
      {
        id: "EXECUTION_AUTHORITY",
        label: "05 · DECISION",
        detail: "REFUSE — the proposal exceeds authority. NO ORDER SENT",
        status: "COMPLETE",
      },
      {
        id: "RESULT",
        label: "06 · EVIDENCE",
        detail: "NO ORDER SENT — the decision is recorded as activity + proof + run",
        status: "COMPLETE",
      },
    ],
  };
}

/**
 * Run one judge execution demo to its terminal PREVIEW evidence.
 *
 * Uses the full canonical product path with zero credentials: intent →
 * fixture analysis (20%/$100) → mandate PASS → demo standing mandate
 * (canonical 30%/$150 bounds) → autonomous agent cycle forced to
 * DRY_RUN → preview-only execution → receipt + run. The DRY_RUN adapter
 * constructs the would-be order and moves nothing; the cycle consumes no
 * budget and performs zero network I/O. No proof is created for previews
 * (only verified fills earn execution proofs) — the receipt + run are
 * the legitimate terminal records. Each call mints a fresh flow; the
 * active mandate is reused when one exists (never revoked for a demo)
 * and created otherwise, so reruns never collide or double-spend.
 */
export async function runJudgeExecutionDemo(
  store: TenaxDevStore,
  input: RunJudgeExecutionDemoInput,
): Promise<JudgeExecutionDemoResult> {
  const nowMs = input.nowMs ?? Date.now();
  const createdAt = new Date(nowMs).toISOString();

  // Collision-safe demo identity (same convention as the refusal path):
  // process-local nextFlowId() would re-mint flow-0001 on every cold
  // start and lose the run INSERT to historical rows on UNIQUE(flow_id).
  const flowId = uniqueDemoFlowId(store, nowMs);
  const execFlow = new ProtectionFlow(flowId);
  execFlow.loadExposure(NVDA_EXPOSURE_FIXTURE);
  execFlow.createIntent(JUDGE_DEMO_EXEC_RAW_TEXT);
  store.flows.set(flowId, execFlow);
  const analyzed = analyzeProtectionIntent(store, flowId, input.snapshot);
  if (analyzed.mandateVerdict !== "PASS") {
    throw new Error(
      `JUDGE_DEMO_UNEXPECTED: execution-demo analysis did not pass (got ${analyzed.mandateVerdict}) — refusing to proceed`,
    );
  }
  // Fresh timestamp AFTER analysis: the standing freshness gate compares
  // proposal time against evaluation time, so evaluating with a timestamp
  // captured before analysis would misread the proposal as future-dated.
  // Reuse an active mandate when one exists (never revoke user state for
  // a demo); DRY_RUN previews consume no budget, so sharing is safe.
  const authNowMs = Date.now();
  const existing = getActiveStandingMandate(store);
  const mandate =
    existing ??
    activateStandingMandateRecord(
      store,
      {
        id: createStandingMandateRecord(
          store,
          { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
          authNowMs,
        ).id,
      },
      authNowMs,
    );
  const cycle = await runProtectionAgentCycle(
    store,
    { flowId },
    {
      executionMode: "DRY_RUN",
      nowMs: authNowMs,
      repos: { runRepository: input.runRepository, proofRepository: input.proofRepository },
    },
  );
  if (cycle.outcome !== "EXECUTED" || cycle.executionMode !== "DRY_RUN") {
    throw new Error(
      `JUDGE_DEMO_UNEXPECTED: execution-demo cycle did not execute (got ${cycle.outcome}) — refusing to proceed`,
    );
  }
  const { receipt } = getDecisionReceipt(store, flowId);
  const proposalHash = hashProposal(analyzed.proposal);

  // Truthfulness gate: the returned runId must be durably retrievable
  // right now, and must be the exact expected record — never report
  // success for a missing or mismatched row. Previews earn no execution
  // proof, so only the run is required here.
  const runsRepo = input.runRepository ?? getPaperTradingRunRepository();
  const savedRun = await runsRepo.getRun(paperTradingRunId(flowId)).catch(() => null);
  if (
    !savedRun ||
    savedRun.flowId !== flowId ||
    savedRun.authority.outcome !== "EXECUTE" ||
    savedRun.execution.status !== "PREVIEW" ||
    savedRun.execution.submitted !== false ||
    savedRun.execution.orderId !== null
  ) {
    throw new Error(
      "JUDGE_DEMO_UNEXPECTED: durable preview evidence not retrievable after persist — refusing to report success",
    );
  }

  return {
    version: JUDGE_DEMO_VERSION,
    flowId,
    runId: paperTradingRunId(flowId),
    receiptId: receipt.receiptId,
    proposalHash,
    protectionPct: analyzed.proposal.protectionPct,
    proposedTradeValueUsdt: analyzed.proposal.proposedTradeValueUsdt,
    mandateVerdict: "PASS",
    authorityOutcome: "EXECUTE",
    executionStatus: "PREVIEW",
    provenance: JUDGE_DEMO_PROVENANCE,
    createdAt,
    stages: [
      {
        id: "EXPOSURE",
        label: "01 · CAPITAL",
        detail: `$${NVDA_EXPOSURE_FIXTURE.exposureValueUsdt} simulated NVIDIA exposure exists (fixture, not owned live)`,
        status: "COMPLETE",
      },
      {
        id: "EVENT_CONTEXT",
        label: "02 · EVENT",
        detail: "Controlled fixture context stands in for event risk — no verified event consulted",
        status: "COMPLETE",
      },
      {
        id: "INTENT",
        label: "03 · AI INTENT",
        detail: `${analyzed.proposal.protectionPct}% / $${analyzed.proposal.proposedTradeValueUsdt} proposed (fixture input, not model output)`,
        status: "COMPLETE",
      },
      {
        id: "MANDATE_GATE",
        label: "04 · AUTHORITY",
        detail: `Tenax compares it to the ${mandate.policy.maxProtectionPct}% · $${mandate.policy.maxNotionalUsdt} mandate — PASS`,
        status: "COMPLETE",
      },
      {
        id: "EXECUTION_AUTHORITY",
        label: "05 · DECISION",
        detail: "EXECUTE — standing mandate authorized; DRY_RUN preview moves nothing",
        status: "COMPLETE",
      },
      {
        id: "RESULT",
        label: "06 · RESULT",
        detail: "Preview executed without submission — receipt + run persisted (PREVIEW)",
        status: "COMPLETE",
      },
      {
        id: "RESULT",
        label: "07 · EVIDENCE",
        detail: "Would-be order recorded honestly: submitted false, no funds moved",
        status: "COMPLETE",
      },
    ],
  };
}
