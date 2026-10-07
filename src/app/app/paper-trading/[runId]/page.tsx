import Link from "next/link";
import type { ReactNode } from "react";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import type { PaperTradingRun } from "@/lib/tenax/paper-trading-run";
import { getPaperTradingRunRepository } from "@/lib/tenax/paper-trading-run-repository";
import { reconcilePaperTradingRuns } from "@/lib/tenax/paper-trading-run-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function valueOrUnknown(value: string | number | null | undefined, unknownLabel = "UNKNOWN"): string {
  return value === null || value === undefined || value === "" ? unknownLabel : String(value);
}

function statusClass(status: PaperTradingRun["status"]): string {
  switch (status) {
    case "EXECUTED": return "bg-pass text-softwhite";
    case "ESCALATED":
    case "REVIEW_REQUIRED": return "bg-signal text-ink";
    case "REFUSED":
    case "FAILED": return "bg-clay text-softwhite";
    default: return "bg-ink text-softwhite";
  }
}

function DetailGrid({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="grid gap-0 border-t border-ink/10 sm:grid-cols-2 sm:gap-x-8">
      {rows.map(([term, value]) => (
        <div key={term} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/10 py-3">
          <dt className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">{term}</dt>
          <dd className="max-w-[70%] text-right text-[13px] font-bold leading-[18px]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceSection({ title, source, children }: { title: string; source: string; children: ReactNode }) {
  return (
    <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[26px] font-extrabold tracking-[-0.03em]">{title}</h2>
        <p className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">SOURCE · {source}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function PaperTradingRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const repository = getPaperTradingRunRepository();
  let run: PaperTradingRun | null = null;
  let unavailable = false;
  try {
    await reconcilePaperTradingRuns(getTenaxDevStore(), repository);
    run = await repository.getRun(decodeURIComponent(runId));
  } catch {
    unavailable = true;
  }

  return (
    <div className="tx-observatory-entry flex flex-col gap-7 pt-7 sm:gap-10 sm:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/paper-trading" className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink hover:text-ink">← PAPER TRADING EVIDENCE</Link>
        <span className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">RUN {run?.runId ?? "UNKNOWN"}</span>
      </div>
      {unavailable ? (
        <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
          <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-clay">RUN LEDGER UNAVAILABLE</p>
          <p className="mt-3 text-[16px] leading-[24px] text-mutedink">The canonical run ledger could not be loaded. No evidence is fabricated.</p>
        </section>
      ) : !run ? (
        <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
          <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">RUN NOT FOUND</p>
          <p className="mt-3 text-[16px] leading-[24px] text-mutedink">This run is not present in the canonical ledger.</p>
        </section>
      ) : (
        <>
          <section className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">CANONICAL RUN · {run.symbol}</p>
                <h1 className="mt-3 text-[48px] font-extrabold leading-[0.9] tracking-[-0.05em] sm:text-[82px]">Evidence</h1>
              </div>
              <span className={`inline-flex rounded-full px-3 py-2 font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] ${statusClass(run.status)}`}>{run.authority.outcome}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-5 font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">
              <span>{run.environment ?? "ENVIRONMENT UNKNOWN"}</span>
              <span>{run.execution.status === "SUBMITTED" ? "SUBMITTED · FILL NOT VERIFIED" : run.execution.status}</span>
              <span>{run.outcome.outcomeState}</span>
              <span>{run.createdAt}</span>
            </div>
            {run.sourceProofId ? (
              <div className="mt-4">
                <Link href={`/app/proof/${encodeURIComponent(run.sourceProofId)}`} className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] text-ink hover:brightness-95">
                  VIEW DURABLE PROOF <span className="btn-arrow" aria-hidden="true">→</span>
                </Link>
              </div>
            ) : null}
          </section>

          <EvidenceSection title="01 · EVENT" source={run.provenance.event}>
            <DetailGrid rows={[
              ["EVENT TYPE", run.event.eventType],
              ["EVENT ID", valueOrUnknown(run.event.eventId)],
              ["SYMBOL", run.symbol],
              ["OBSERVED PRICE", valueOrUnknown(run.event.observedPrice, "NOT YET OBSERVED")],
              ["OBSERVED TIME", valueOrUnknown(run.event.observedAt, "NOT YET OBSERVED")],
              ["CONTEXT REFS", run.event.contextRefs.length ? run.event.contextRefs.join(" · ") : "UNKNOWN"],
            ]} />
          </EvidenceSection>

          <EvidenceSection title="02 · AI DECISION" source={run.provenance.decision}>
            <DetailGrid rows={[
              ["PROVIDER", valueOrUnknown(run.decision.provider)],
              ["MODEL", valueOrUnknown(run.decision.model)],
              ["DECISION", valueOrUnknown(run.decision.decision)],
              ["PROPOSED ACTION", run.decision.direction === "SHORT" ? "NVDAUSDT SHORT HEDGE" : "UNKNOWN"],
              ["NOTIONAL", valueOrUnknown(run.decision.proposedNotionalUsdt, "UNKNOWN")],
              ["PROTECTION", valueOrUnknown(run.decision.proposedProtectionPct, "UNKNOWN")],
              ["PROPOSAL TIME", valueOrUnknown(run.decision.proposedAt, "UNKNOWN")],
            ]} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border-l-2 border-signal bg-signal/10 p-4"><p className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">SUMMARY</p><p className="mt-2 text-[14px] leading-[21px]">{valueOrUnknown(run.decision.summary)}</p></div>
              <div className="border-l-2 border-ink/20 bg-ink/[0.03] p-4"><p className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">REASONING</p><p className="mt-2 text-[14px] leading-[21px]">{valueOrUnknown(run.decision.reasoning)}</p></div>
            </div>
          </EvidenceSection>

          <EvidenceSection title="03 · AUTHORITY" source={run.provenance.authority}>
            <DetailGrid rows={[
              ["RESULT", run.authority.outcome],
              ["MANDATE ID", valueOrUnknown(run.authority.mandateId)],
              ["MANDATE HASH", valueOrUnknown(run.authority.mandateHash)],
              ["AUTHORITY MODE", valueOrUnknown(run.authority.mode)],
              ["REASON CODES", run.authority.reasonCodes.length ? run.authority.reasonCodes.join(" · ") : "NONE RECORDED"],
              ["CEILINGS", run.authority.bounds ? `${valueOrUnknown(run.authority.bounds.maxProtectionPct)}% · $${valueOrUnknown(run.authority.bounds.maxNotionalUsdt)}` : "UNKNOWN"],
            ]} />
            {run.authority.outcome === "ESCALATE" || run.authority.outcome === "REFUSE" || run.authority.outcome === "REVIEW" ? <p className="mt-4 font-syslabel text-[11px] uppercase tracking-[0.08em] text-clay">NO ORDER SENT</p> : null}
          </EvidenceSection>

          <EvidenceSection title="04 · EXECUTION" source={run.provenance.execution}>
            <DetailGrid rows={[
              ["STATUS", run.execution.status === "SUBMITTED" ? "SUBMITTED · FILL NOT VERIFIED" : run.execution.status],
              ["PROVIDER", valueOrUnknown(run.execution.provider)],
              ["ORDER ID", valueOrUnknown(run.execution.orderId)],
              ["SIDE", valueOrUnknown(run.execution.side)],
              ["SIZE", valueOrUnknown(run.execution.size)],
              ["PRICE", valueOrUnknown(run.execution.price)],
              ["FEES", valueOrUnknown(run.execution.fees)],
              ["SUBMITTED AT", valueOrUnknown(run.execution.submittedAt)],
              ["VERIFIED AT", valueOrUnknown(run.execution.verifiedAt)],
            ]} />
            {run.execution.status === "NO_ORDER" ? <p className="mt-4 font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">NO ORDER SENT · AUTHORITY STOPPED THE ACTION</p> : null}
          </EvidenceSection>

          <EvidenceSection title="05 · OUTCOME" source={run.provenance.outcome}>
            {run.outcome.outcomeState === "OPEN_MARK" ? <p className="mb-4 font-syslabel text-[11px] uppercase tracking-[0.08em] text-signal">UNREALIZED / OBSERVED MARK</p> : null}
            {run.outcome.outcomeState === "REALIZED" ? <p className="mb-4 font-syslabel text-[11px] uppercase tracking-[0.08em] text-pass">REALIZED OUTCOME</p> : null}
            <DetailGrid rows={[
              ["OUTCOME STATE", run.outcome.outcomeState],
              ["MARK PRICE", valueOrUnknown(run.outcome.markPrice, "NOT YET OBSERVED")],
              ["MARK TIME", valueOrUnknown(run.outcome.markAt, "NOT YET OBSERVED")],
              ["MARK PNL", valueOrUnknown(run.outcome.markPnlUsdt, "UNKNOWN")],
              ["MARK RETURN", valueOrUnknown(run.outcome.markReturnPct, "UNKNOWN")],
              ["EXIT PRICE", valueOrUnknown(run.outcome.exitPrice, "NOT YET OBSERVED")],
              ["EXIT SIZE", valueOrUnknown(run.outcome.exitSize, "UNKNOWN")],
              ["EXIT TIME", valueOrUnknown(run.outcome.exitAt, "NOT YET OBSERVED")],
              ["EXIT ORDER", valueOrUnknown(run.outcome.exitProviderOrderId, "UNKNOWN")],
              ["REALIZED PNL", valueOrUnknown(run.outcome.realizedPnlUsdt, "UNKNOWN")],
              ["REALIZED RETURN", valueOrUnknown(run.outcome.realizedReturnPct, "UNKNOWN")],
              ["NET PNL", valueOrUnknown(run.outcome.netRealizedPnlUsdt, "UNKNOWN")],
            ]} />
            <p className="mt-4 text-[13px] leading-[20px] text-mutedink">Historical evidence records what Tenax observed at that time. It does not claim a position is currently open, closed, or profitable.</p>
          </EvidenceSection>
        </>
      )}
    </div>
  );
}
