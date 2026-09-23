// Tenax Judge Proof detail — one immutable verified record.
//
// HISTORICAL RECORD, not live state: proving a past fill never implies
// an open position, and no PnL is computed from history. Server-rendered,
// navigation only: no POSTs, no mutations, no secrets.
import Link from "next/link";
import { notFound } from "next/navigation";

import { getProofRepository } from "@/lib/proof/repository";
import { formatProofTime, formatProofUsd, proofKindLabel, proofTone } from "@/lib/proof/display";
import type { JudgeProof } from "@/lib/proof/model";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";

export const dynamic = "force-dynamic";

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-ink/10 py-2.5">
      <dt className="font-syslabel shrink-0 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
        {term}
      </dt>
      <dd className="break-words text-right text-[13px] font-bold leading-[18px]">{value}</dd>
    </div>
  );
}

function badgeClass(kind: JudgeProof["kind"]): string {
  switch (proofTone(kind)) {
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

export default async function ProofDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handle = getProofRepository();
  let proof: JudgeProof | null = null;
  let storeError = false;
  try {
    proof = await handle.repo.getProof(decodeURIComponent(id));
  } catch {
    storeError = true;
  }
  if (storeError || !proof) notFound();

  const mandate = proof.mandateSnapshot;
  const execution = proof.execution;
  return (
    <div className="tx-observatory-entry flex flex-col gap-6 pt-6 sm:gap-8 sm:pt-8">
      <DecisionRail current="RECEIPT" />
      <div className="tx-material-editorial border-t-2 border-ink pt-4 sm:pt-5">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          VERIFIED DECISION HISTORY · HISTORICAL RECORD
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className={`state-mark ${badgeClass(proof.kind)}`}>{proofKindLabel(proof.kind)}</span>
          <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            NVIDIA · NVDAUSDT
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-[14px] leading-[20px] text-mutedink">
          This proves a past Tenax decision. It does not imply an open position, and no
          profit-and-loss is computed from history.
        </p>
        <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          {!handle.durable ? "EPHEMERAL RECORD — NOT DURABLE PROOF · " : ""}
          {formatProofTime(proof.createdAt)} · {proof.id}
        </p>
      </div>

      <section aria-label="Outcome" className="tx-material-editorial border-t-2 border-ink pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">OUTCOME</p>
        <p className="mt-2 text-[22px] font-extrabold leading-[28px]">{proof.outcome}</p>
        <dl className="mt-3">
          <Row term="FLOW" value={proof.flowId} />
          {proof.receiptId ? <Row term="RECEIPT" value={proof.receiptId} /> : null}
          {proof.reasonCodes.length > 0 ? (
            <Row term="REASONS" value={proof.reasonCodes.join(" · ").toUpperCase()} />
          ) : null}
        </dl>
      </section>

      <section aria-label="Authority" className="tx-material-editorial border-t-2 border-ink pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">AUTHORITY</p>
        <dl className="mt-3">
          <Row term="SOURCE" value={proof.authority.source === "STANDING_MANDATE" ? "Standing Mandate" : (proof.authority.source ?? "—")} />
          <Row term="MODE" value={proof.authority.mode ?? "—"} />
          <Row term="MANDATE" value={proof.authority.mandateId ?? "—"} />
          <Row term="MANDATE HASH" value={proof.authority.mandateHash ? `${proof.authority.mandateHash.slice(0, 16)}…` : "—"} />
        </dl>
      </section>

      <section aria-label="Proposal" className="tx-material-editorial border-t-2 border-ink pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PROPOSAL</p>
        <dl className="mt-3">
          <Row
            term="PROTECTION"
            value={
              proof.proposal.protectionPct !== null && proof.proposal.notionalUsd !== null
                ? `${proof.proposal.protectionPct}% · $${proof.proposal.notionalUsd}`
                : "—"
            }
          />
          <Row term="ACTION" value={`${proof.proposal.side} · ${proof.proposal.action}`} />
        </dl>
      </section>

      {mandate ? (
        <section aria-label="Mandate bounds" className="tx-material-editorial border-t-2 border-ink pt-4">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            STANDING BOUNDS AT RECORDING
          </p>
          <dl className="mt-3">
            <Row term="MAX PROTECTION" value={`${mandate.maxProtectionPct}%`} />
            <Row term="MAX ACTION" value={`$${mandate.maxNotionalUsdt}`} />
            <Row term="MAX EXECUTIONS" value={`${mandate.maxExecutions}`} />
          </dl>
        </section>
      ) : null}

      {execution ? (
        <section aria-label="Execution" className="tx-material-editorial border-t-2 border-ink pt-4">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">EXECUTION · PROVEN FILL</p>
          <dl className="mt-3">
            <Row term="ENVIRONMENT" value={`${execution.environment} · VIRTUAL FUNDS`} />
            <Row term="PROVIDER" value={execution.provider} />
            <Row term="ORDER ID" value={execution.providerOrderId ?? "—"} />
            <Row term="QUANTITY" value={execution.quantity ?? "—"} />
            <Row term="AVG FILL" value={execution.avgFillPrice ?? "—"} />
            <Row term="EXECUTED VALUE" value={formatProofUsd(execution.executedValueUsdt)} />
            <Row term="STATUS" value={execution.status} />
          </dl>
        </section>
      ) : null}

      <section aria-label="Provenance" className="tx-material-editorial border-t-2 border-ink pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PROVENANCE</p>
        <dl className="mt-3">
          <Row term="EVIDENCE" value={proof.provenance.evidenceSource} />
          <Row term="RECORDED" value={formatProofTime(proof.provenance.recordedAt)} />
          <Row term="SOURCE EVENT" value={proof.sourceActivityEventId} />
          {proof.provenance.imported ? (
            <Row term="IMPORTED" value={proof.provenance.importSource ?? "yes"} />
          ) : null}
        </dl>
      </section>

      <nav aria-label="Continue" className="flex flex-wrap items-center gap-2">
        <Link href="/app/proof" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">
          ALL PROOFS <span className="btn-arrow" aria-hidden="true">→</span>
        </Link>
        {proof.receiptId ? (
          <Link href={`/app/receipts/${proof.flowId}`} className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">
            VIEW RECEIPT <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
        ) : null}
        <Link href="/app/activity" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">
          VIEW ACTIVITY <span className="btn-arrow" aria-hidden="true">→</span>
        </Link>
      </nav>
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
