// Tenax product signatures — signal rail, evidence stamp, outcome tones.
//
// The rail (INTENT → POLICY → AUTHORITY → EXECUTION → PROOF) and the
// stamp only ever render state the caller already holds: proof kind, run
// status, final analysis state, receipt mode. Pure mappings are exported
// and unit-tested; nothing here derives, upgrades, or invents a record.
import type { ProofKind } from "@/lib/proof/model";
import type { PaperRunExecutionStatus, PaperRunStatus } from "@/lib/tenax/paper-trading-run";
import type { FinalActionState } from "@/lib/tenax/visuals";

export const SIGNAL_STAGES = ["INTENT", "POLICY", "AUTHORITY", "EXECUTION", "PROOF"] as const;
export type SignalStage = (typeof SIGNAL_STAGES)[number];
export type SignalNodeState = "done" | "pending" | "skipped" | "stopped" | "held" | "exec";

export interface SignalNode {
  readonly stage: SignalStage;
  readonly state: SignalNodeState;
  readonly word: string | null;
}

type Spec = Partial<Record<SignalStage, readonly [SignalNodeState, string | null]>>;

function rail(spec: Spec): SignalNode[] {
  return SIGNAL_STAGES.map((stage) => {
    const [state, word] = spec[stage] ?? (["pending", null] as const);
    return { stage, state, word };
  });
}

const SKIP = ["skipped", null] as const;

/** Durable proof record → rail. The proof stage is recorded by definition. */
export function signalRailForProof(kind: ProofKind): SignalNode[] {
  const recorded = ["done", "RECORDED"] as const;
  switch (kind) {
    case "EXECUTION_FILLED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["done", null], EXECUTION: ["exec", "FILLED"], PROOF: recorded });
    case "EXECUTION_FAILED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["done", null], EXECUTION: ["stopped", "FAILED"], PROOF: recorded });
    case "POLICY_REFUSED":
      return rail({ INTENT: ["done", null], POLICY: ["stopped", "REFUSED"], AUTHORITY: SKIP, EXECUTION: SKIP, PROOF: recorded });
    case "AUTHORITY_REFUSED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["stopped", "REFUSED"], EXECUTION: SKIP, PROOF: recorded });
    case "AUTHORITY_ESCALATED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["held", "ESCALATED"], EXECUTION: SKIP, PROOF: recorded });
    case "REVIEW_REQUIRED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["held", "REVIEW"], EXECUTION: SKIP, PROOF: recorded });
  }
}

/** Canonical paper-trading run → rail. Proof is done only when linked. */
export function signalRailForRun(
  status: PaperRunStatus,
  executionStatus: PaperRunExecutionStatus,
  hasProof: boolean,
): SignalNode[] {
  const proof = hasProof ? (["done", "RECORDED"] as const) : (["pending", null] as const);
  switch (status) {
    case "EXECUTED":
      return rail({
        INTENT: ["done", null],
        POLICY: ["done", null],
        AUTHORITY: ["done", null],
        EXECUTION: executionStatus === "FILLED" ? ["exec", "FILLED"] : ["exec", executionStatus === "SUBMITTED" ? "SUBMITTED" : executionStatus],
        PROOF: proof,
      });
    case "FAILED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["done", null], EXECUTION: ["stopped", "FAILED"], PROOF: proof });
    case "REFUSED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["stopped", "REFUSED"], EXECUTION: SKIP, PROOF: proof });
    case "ESCALATED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["held", "ESCALATED"], EXECUTION: SKIP, PROOF: proof });
    case "REVIEW_REQUIRED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["held", "REVIEW"], EXECUTION: SKIP, PROOF: proof });
    case "NO_ACTION":
      return rail({ INTENT: ["done", "NO ACTION"], POLICY: SKIP, AUTHORITY: SKIP, EXECUTION: SKIP, PROOF: proof });
  }
}

/** Final Tenax decision on the analysis page → rail (nothing executed yet). */
export function signalRailForAnalysis(state: FinalActionState, policyPass: boolean): SignalNode[] {
  switch (state) {
    case "AUTHORIZED":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["done", "AUTHORIZED"] });
    case "REFUSED":
      return policyPass
        ? rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["stopped", "REFUSED"], EXECUTION: SKIP })
        : rail({ INTENT: ["done", null], POLICY: ["stopped", "REFUSED"], AUTHORITY: SKIP, EXECUTION: SKIP });
    case "ESCALATE":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["held", "ESCALATE"], EXECUTION: SKIP });
    case "NO_MANDATE":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["held", "NO MANDATE"] });
    case "UNKNOWN":
      return rail({ INTENT: ["done", null], POLICY: ["done", null], AUTHORITY: ["held", "UNKNOWN"] });
    case "WAIT":
      return rail({ INTENT: ["done", "WAIT"], POLICY: SKIP, AUTHORITY: SKIP, EXECUTION: SKIP });
    case "NO_ACTION":
      return rail({ INTENT: ["done", "NO ACTION"], POLICY: SKIP, AUTHORITY: SKIP, EXECUTION: SKIP });
  }
}

/** Session decision receipt → rail. Dry run never claims a fill. */
export function signalRailForReceipt(input: {
  readonly mode: string;
  readonly filled: boolean;
  readonly hasProof: boolean;
}): SignalNode[] {
  const execution: readonly [SignalNodeState, string] =
    input.mode === "DRY_RUN" ? ["exec", "DRY RUN · NOT SUBMITTED"] : input.filled ? ["exec", "FILLED"] : ["exec", "SUBMITTED"];
  return rail({
    INTENT: ["done", null],
    POLICY: ["done", null],
    AUTHORITY: ["done", null],
    EXECUTION: execution,
    PROOF: input.hasProof ? ["done", "RECORDED"] : ["pending", "SESSION ONLY"],
  });
}

const GLYPH: Record<SignalNodeState, string> = {
  done: "●",
  exec: "●",
  pending: "○",
  skipped: "—",
  stopped: "■",
  held: "◐",
};

export function SignalRail({ nodes, label = "Signal rail" }: { nodes: readonly SignalNode[]; label?: string }) {
  return (
    <ol className="tx-signal-rail" aria-label={label}>
      {nodes.map((node) => (
        <li key={node.stage} className={`tx-rail-${node.state}`}>
          <span className="tx-signal-node" aria-hidden="true" />
          <span className="sr-only">{GLYPH[node.state]} </span>
          {node.stage}
          {node.word ? <span className="opacity-90"> · {node.word}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** Durable-record stamp. `verified` must come from the record's own state. */
export function EvidenceStamp({
  title,
  verified,
  rows,
}: {
  title: string;
  verified: boolean;
  rows: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div className="tx-evidence-stamp" data-verified={verified ? "true" : "false"}>
      <span className="tx-evidence-stamp-mark" aria-hidden="true">
        {verified ? "✓" : "◇"}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="tx-evidence-stamp-title">{title}</span>
        {rows.map(([k, v]) => (
          <span key={k} className="min-w-0 truncate" title={v}>
            {k} · <span className="text-ink/80">{v}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

// ---- Outcome tones -------------------------------------------------------------
// One semantic mapping for every outcome badge/edge: refusal coral,
// escalation and review amber, execution blue, everything else neutral.

export type OutcomeTone = "done" | "escalated" | "review" | "refused" | "failed";

export function outcomeBadgeClass(tone: OutcomeTone): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "bg-clay text-ivory";
    case "escalated":
    case "review":
      return "bg-amber text-ink";
    default:
      return "bg-exec text-ink";
  }
}

export function outcomeEdgeClass(tone: OutcomeTone): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "border-clay/50";
    case "escalated":
    case "review":
      return "border-amber/50";
    default:
      return "border-ink/10";
  }
}

export function outcomeSurfaceClass(tone: OutcomeTone): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "surface-refuse";
    case "escalated":
    case "review":
      return "surface-review";
    default:
      return "surface-exec";
  }
}
