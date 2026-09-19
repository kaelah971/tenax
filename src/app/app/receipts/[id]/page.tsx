// Tenax Phase 1E-B — Decision Receipt as a permanent capital artifact.
// Editorial hero, six evidenced chain stages, technical request as readable
// key/value rows, refused alternative. No orderId, no hash, no success claim.
import { notFound } from "next/navigation";

import { getDecisionReceipt } from "@/lib/tenax/service";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { NOT_ADVICE } from "../../_copy";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";
import { TenaxAgent, staggerStyle } from "../../_components/living";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let receipt;
  try {
    ({ receipt } = getDecisionReceipt(getTenaxDevStore(), id));
  } catch {
    notFound();
  }

  const cleared = receipt.mandateChecks.filter((c) => c.pass).length;
  const total = receipt.mandateChecks.length;
  const alternative = receipt.rejectedAlternatives[0];

  const stages: Array<{ index: string; title: string; lines: string[] }> = [
    { index: "01", title: "EXPOSURE", lines: [`$${receipt.exposureValueUsdt} NVIDIA`, "○ DEMO"] },
    { index: "02", title: "INTENT", lines: [receipt.intent] },
    {
      index: "03",
      title: "INTELLIGENCE",
      lines: [`${receipt.proposedProtectionPct}% protection`, "◇ DEV"],
    },
    { index: "04", title: "MANDATE", lines: [`${receipt.mandateResult}`, `${cleared}/${total} rules cleared`] },
    { index: "05", title: "APPROVAL", lines: [`HUMAN ${receipt.approval}`] },
    {
      index: "06",
      title: "ACTION",
      lines: [`${receipt.executionMode === "DRY_RUN" ? "DRY RUN" : receipt.executionMode} $${receipt.proposedTradeValueUsdt}`, "FUNDS MOVED NO"],
    },
  ];

  const requestRows: Array<[string, string]> = [
    ["MODE", receipt.request.mode === "DRY_RUN" ? "DRY RUN" : receipt.request.mode],
    ["OPERATION", receipt.request.operationId],
    ["ENDPOINT", receipt.request.endpoint],
    ["SYMBOL", receipt.request.symbol],
    ["SIDE", receipt.request.side.toUpperCase()],
    ["TYPE", receipt.request.orderType.toUpperCase()],
    ["QTY", receipt.request.qty],
    ["STATE", "WOULD-BE · NEVER SUBMITTED"],
  ];

  return (
    <div className="anim-rise flex flex-col gap-10 pt-8 sm:pt-12">
      <DecisionRail current="RECEIPT" />

      <section aria-label="Decision hero" className="float-module record-stack p-6 sm:p-10">
        <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              DECISION · {receipt.receiptId} · {receipt.timestamp}
            </p>
            <p className="mt-4 inline-block rounded-full bg-ink px-3 py-1.5 text-[20px] font-extrabold leading-none tracking-[-0.02em] text-signal shadow-[0_0_30px_-6px_rgba(245,255,59,0.7)] sm:text-[28px]">
              ACTION CLEARED
            </p>
            <p className="value-live mt-4 text-[72px] font-extrabold leading-none tracking-[-0.03em] drop-shadow-[0_10px_24px_rgba(17,17,17,0.18)] sm:text-[120px]">
              ${receipt.proposedTradeValueUsdt}
            </p>
            <p className="font-syslabel mt-3 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              PROTECTION · NVIDIA · RNVDAUSDT
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <div className="agent-stage">
              <TenaxAgent state="complete" size={104} caption="DECISION RECORDED" className="mascot-scale" />
            </div>
            <p
              className="seal-stamp seal-ring rounded-full border-2 border-ink bg-signal px-4 py-2 text-center text-[13px] font-extrabold leading-[18px] tracking-[0.06em] text-ink"
              aria-label={`Tenax decision record sealed at ${receipt.timestamp}`}
            >
              TENAX DECISION RECORD
              <br />
              SEALED
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Decision chain">
        <ol className="flex flex-col">
          {stages.map((stage, i) => (
            <li
              key={stage.index}
              style={staggerStyle(i)}
              className="tx-rule flex flex-col gap-1 border-t-2 border-ink py-4 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="font-syslabel w-24 shrink-0 text-[11px] leading-[14px] text-mutedink">
                {stage.index} {stage.title}
              </span>
              <span className="text-[20px] font-extrabold leading-[24px] tracking-[-0.01em]">
                {stage.lines[0]}
              </span>
              {stage.lines.slice(1).map((line) => (
                <span
                  key={line}
                  className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink sm:ml-auto"
                >
                  {line}
                </span>
              ))}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-label="Rejected alternative"
        className="float-module border-t-4 border-t-clay p-5 sm:p-8"
      >
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          REJECTED ALTERNATIVE · REFUSAL IS A FEATURE
        </p>
        {alternative ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <p className="text-[44px] font-extrabold leading-none tracking-[-0.02em] sm:text-[64px]">
              ${alternative.proposedTradeValueUsdt}
            </p>
            <p className="rounded-full bg-clay px-3 py-1 text-[13px] font-bold leading-[18px] text-white">
              REFUSED
            </p>
          </div>
        ) : null}
        <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          {alternative
            ? `REFUSED_${alternative.failedRules.join("_").toUpperCase() || "UNKNOWN"}`
            : "NONE RECORDED"}
        </p>
      </section>

      <section aria-label="Technical details" className="float-module-dark p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
            TECHNICAL · WOULD-BE BITGET REQUEST
          </p>
          <span className="font-syslabel ml-auto rounded-full border border-signal/40 px-2.5 py-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
            □ DRY RUN · NEVER SUBMITTED
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {requestRows.map(([term, value]) => (
            <div
              key={term}
              className="flex items-baseline justify-between gap-4 overflow-x-auto border-t instrument-divider py-2.5"
            >
              <dt className="font-syslabel shrink-0 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                {term}
              </dt>
              <dd className="whitespace-nowrap text-[13px] font-bold leading-[18px]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ProvenanceStrip
        items={[
          "LIVE BITGET DATA",
          "SIMULATED PORTFOLIO",
          "DEVELOPMENT ANALYSIS",
          "DRY_RUN EXECUTION",
        ]}
      />
      <p className="text-[11px] leading-[14px] text-mutedink">{NOT_ADVICE}</p>
    </div>
  );
}
