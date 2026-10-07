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

import { hashProposal } from "./approval.ts";
import type { ProtectionAnalysis } from "./analysis.ts";
import type { TenaxDevStore } from "./dev-store.ts";
import {
  MANDATE_FIXTURE,
  NVDA_EXPOSURE_FIXTURE,
  PROPOSAL_REFUSE_VALUE_FIXTURE,
} from "./fixtures.ts";
import { evaluateMandate } from "./mandate.ts";
import { ProtectionFlow } from "./orchestrator.ts";
import { recordDeterministicRefusal } from "./service.ts";
import { paperTradingRunId } from "./paper-trading-run.ts";
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
}

function uniqueDemoFlowId(store: TenaxDevStore, nowMs: number): string {
  let candidate = `demo-${nowMs}`;
  let suffix = 0;
  while (store.flows.has(candidate)) {
    suffix += 1;
    candidate = `demo-${nowMs}-${suffix}`;
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
  const recorded = await recordDeterministicRefusal(store, flowId, { nowMs });
  if (!recorded) {
    throw new Error("JUDGE_DEMO_UNEXPECTED: refusal evidence was not recorded");
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
        label: "01 · EXPOSURE",
        detail: `$${NVDA_EXPOSURE_FIXTURE.exposureValueUsdt} simulated NVIDIA exposure (fixture, not owned live)`,
        status: "COMPLETE",
      },
      {
        id: "EVENT_CONTEXT",
        label: "02 · EVENT CONTEXT",
        detail: "No verified event consulted — controlled demo context (development fixture)",
        status: "COMPLETE",
      },
      {
        id: "INTENT",
        label: "03 · INTENT",
        detail: `${intent.type} recorded (${intent.id})`,
        status: "COMPLETE",
      },
      {
        id: "MANDATE_GATE",
        label: "04 · MANDATE GATE",
        detail: `40% / $200 vs max ${MANDATE_FIXTURE.maxProtectionPct}% / $${MANDATE_FIXTURE.maxTradeValueUsdt} — REFUSED (${decision.failedRules.join(", ")})`,
        status: "COMPLETE",
      },
      {
        id: "EXECUTION_AUTHORITY",
        label: "05 · EXECUTION AUTHORITY",
        detail: "Refused proposals cannot reach execution — NO ORDER SENT",
        status: "COMPLETE",
      },
      {
        id: "RESULT",
        label: "06 · RESULT / PROOF",
        detail: "Terminal refusal recorded as activity + proof + run (NO_ORDER)",
        status: "COMPLETE",
      },
    ],
  };
}
