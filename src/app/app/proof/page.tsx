// Tenax Judge Proof Ledger — durable verified decision history.
//
// CURRENT/LIVE state (market, open flows) lives elsewhere; this page
// shows VERIFIED HISTORY: immutable proof records of what Tenax
// executed, escalated, refused, or sent for human review. A historical
// fill never implies an open position. Server-rendered, navigation only:
// no POSTs, no mutations, no secrets.
import Link from "next/link";
import { getProofRepository } from "@/lib/proof/repository";
import { reconcileJudgeProofs } from "@/lib/proof/seam";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import {
  formatProofTime,
  formatProofUsd,
  proofKindForFilter,
  proofKindLabel,
  proofTone,
  parseProofFilter,
  PROOF_FILTERS,
  type ProofTone,
} from "@/lib/proof/display";
import type { JudgeProof } from "@/lib/proof/model";
import { DecisionRail, ProvenanceStrip } from "../_components/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function filterClass(active: boolean): string {
  return `font-syslabel rounded-[7px] px-3 py-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] ${
    active ? "bg-ink font-bold text-softwhite" : "text-mutedink hover:bg-ink/5"
  }`;
}

function toneClass(tone: ProofTone): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "border-clay/60";
    case "escalated":
    case "review":
      return "border-signal";
    default:
      return "border-ink/15";
  }
}

function badgeClass(tone: ProofTone): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "bg-clay text-softwhite";
    case "escalated":
    case "review":
      return "bg-signal text-ink";
    default:
      return "bg-ink text-softwhite";
  }
}

function cardFacts(proof: JudgeProof): ReadonlyArray<readonly [string, string]> {
  switch (proof.kind) {
    case "EXECUTION_FILLED":
      return [
        ["EXECUTED", formatProofUsd(proof.execution?.executedValueUsdt ?? null)],
        ["AUTHORITY", proof.authority.source === "STANDING_MANDATE" ? "Standing Mandate" : (proof.authority.source ?? "—")],
      ];
    case "AUTHORITY_ESCALATED":
      return [
        [
          "PROPOSED",
          proof.proposal.protectionPct !== null && proof.proposal.notionalUsd !== null
            ? `${proof.proposal.protectionPct}% · $${proof.proposal.notionalUsd}`
            : "—",
        ],
        [
          "MANDATE MAX",
          proof.mandateSnapshot
            ? `${proof.mandateSnapshot.maxProtectionPct}% · $${proof.mandateSnapshot.maxNotionalUsdt}`
            : "—",
        ],
      ];
    case "AUTHORITY_REFUSED":
    case "POLICY_REFUSED":
      return proof.reasonCodes.length > 0 ? [["REASONS", proof.reasonCodes.join(" · ").toUpperCase()]] : [];
    case "REVIEW_REQUIRED":
      return [];
    case "EXECUTION_FAILED":
      return [];
  }
}

function cardResult(proof: JudgeProof): string {
  switch (proof.kind) {
    case "EXECUTION_FILLED":
      return "FILLED · VERIFIED · BITGET DEMO · VIRTUAL FUNDS";
    case "AUTHORITY_ESCALATED":
      return "NO AUTONOMOUS ORDER SENT";
    case "AUTHORITY_REFUSED":
    case "POLICY_REFUSED":
      return "NO ORDER SENT";
    case "REVIEW_REQUIRED":
      return "NO AUTONOMOUS ORDER SENT";
    case "EXECUTION_FAILED":
      return "NO POSITION OPENED";
  }
}

export default async function ProofPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const filter = parseProofFilter(kind);
  const handle = getProofRepository();
  const store = getTenaxDevStore();
  let proofs: JudgeProof[] = [];
  let storeError: string | null = null;
  let reconcileIncomplete = false;
  try {
    const result = await reconcileJudgeProofs(store, handle.repo);
    reconcileIncomplete = result.failures.length > 0;
  } catch {
    reconcileIncomplete = true;
  }
  try {
    proofs = await handle.repo.listProofs({ kind: proofKindForFilter(filter) ?? undefined });
  } catch {
    storeError = "Durable history could not be loaded.";
  }

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="RECEIPT" />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <div>
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            VERIFIED DECISION HISTORY
          </p>
          <h1 className="mt-3 font-display text-[52px] font-bold leading-[0.9] tracking-[-0.01em] sm:text-[92px]">
            Proof
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-[22px] text-mutedink">
            Durable records of what Tenax executed, escalated, refused, or sent for human review.
          </p>
        </div>
        <p className="font-syslabel mt-3 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
          {storeError
            ? "UNAVAILABLE · POSTGRES CONNECTION FAILED — DURABLE HISTORY CANNOT BE LOADED"
            : handle.durabilityState === "DURABLE"
              ? "DURABLE · POSTGRES — HISTORY SURVIVES RESTARTS"
              : "EPHEMERAL PREVIEW — NOT DURABLE · SET DATABASE_URL FOR DURABLE JUDGE HISTORY"}
        </p>
        {!storeError && reconcileIncomplete ? (
          <p className="font-syslabel mt-3 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
            DURABLE HISTORY MAY BE INCOMPLETE
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Proof filter">
          {PROOF_FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "ALL" ? "/app/proof" : `/app/proof?kind=${f}`}
              className={filterClass(filter === f)}
              aria-current={filter === f ? "page" : undefined}
            >
              {f}
            </Link>
          ))}
        </div>
      </div>

      {storeError ? (
        <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            UNAVAILABLE · POSTGRES CONNECTION FAILED
          </p>
          <p className="mt-3 text-[16px] leading-[24px]">{storeError} Durable history cannot be loaded. Ephemeral session history is never presented as durable proof.</p>
        </section>
      ) : proofs.length === 0 ? (
        <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            NO VERIFIED HISTORY YET
          </p>
          <p className="mt-3 max-w-2xl text-[16px] leading-[24px] text-mutedink">
            Nothing durable has been recorded. Run the agent on a protection flow — terminal
            outcomes are recorded here as immutable proof.
          </p>
        </section>
      ) : (
        <section aria-label="Verified proofs" className="tx-material-editorial border-t-2 border-ink">
          <div className="flex items-baseline justify-between gap-4 py-4">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              VERIFIED RECORDS
            </p>
            <p className="text-[14px] leading-[20px] text-mutedink">{proofs.length} record(s)</p>
          </div>
          <ol className="flex flex-col">
            {proofs.map((proof) => {
              const tone = proofTone(proof.kind);
              const facts = cardFacts(proof);
              return (
                <li key={proof.id} className={`flex flex-col gap-2 border-t-2 py-4 ${toneClass(tone)}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                      NVIDIA · NVDAUSDT
                    </span>
                    <span className={`state-mark ${badgeClass(tone)}`}>{proofKindLabel(proof.kind)}</span>
                    <Link href={`/app/proof/${proof.id}`} className="ml-auto min-h-11 rounded-[9px] border border-ink/70 bg-softwhite/30 px-4 py-2 text-[13px] font-bold leading-[18px] hover:bg-ink hover:text-softwhite">
                      VIEW PROOF →
                    </Link>
                  </div>
                  <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                    {formatProofTime(proof.createdAt)}
                  </p>
                  {facts.length > 0 ? (
                    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] leading-[17px]">
                      {facts.map(([term, value]) => (
                        <div key={term} className="flex gap-2">
                          <dt className="font-syslabel text-[11px] uppercase leading-[17px] tracking-[0.08em] text-mutedink">{term}</dt>
                          <dd className="font-bold">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                    {cardResult(proof)}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
