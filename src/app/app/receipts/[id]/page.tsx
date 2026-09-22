// Tenax Phase 1E-B — Decision Receipt as a permanent capital artifact.
// Editorial hero, six evidenced chain stages, technical request as readable
// key/value rows, refused alternative. No orderId, no hash, no success claim.
import { notFound } from "next/navigation";

import { getDecisionReceipt } from "@/lib/tenax/service";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { NOT_ADVICE } from "../../_copy";
import { SceneAnchor } from "../../_components/materials";
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
  const isDemo = receipt.executionMode === "BITGET_DEMO";
  const demo = receipt.demoExecution ?? null;
  const isStanding = receipt.authoritySource === "STANDING_MANDATE";

  const stages: Array<{ index: string; title: string; lines: string[] }> = [
    { index: "01", title: "EXPOSURE", lines: [`$${receipt.exposureValueUsdt} NVIDIA`, "○ DEMO"] },
    { index: "02", title: "INTENT", lines: [receipt.intent] },
    {
      index: "03",
      title: "INTELLIGENCE",
      lines: [`${receipt.proposedProtectionPct}% protection`, "◇ DEV"],
    },
    { index: "04", title: "MANDATE", lines: [`${receipt.mandateResult}`, `${cleared}/${total} rules cleared`] },
    {
      index: "05",
      title: "APPROVAL",
      lines: isStanding ? ["STANDING MANDATE", "NOT REQUIRED · PRE-AUTHORIZED"] : [`HUMAN ${receipt.approval}`],
    },
    {
      index: "06",
      title: "ACTION",
      lines: [
        `${isDemo ? "BITGET DEMO" : "DRY RUN"} $${receipt.proposedTradeValueUsdt}`,
        isDemo ? "VIRTUAL FUNDS" : "FUNDS MOVED NO",
      ],
    },
  ];

  const requestRows: Array<[string, string]> =
    isDemo && demo
      ? [
          ["MODE", "BITGET DEMO"],
          ["OPERATION", receipt.request.operationId],
          ["ENDPOINT", receipt.request.endpoint],
          ["SYMBOL", "NVDAUSDT"],
          ["CATEGORY", "USDT-FUTURES"],
          ["SIDE", "SELL"],
          ["POSITION SIDE", "SHORT"],
          ["TYPE", "MARKET"],
          ["LEVERAGE", `${demo.leverage.toUpperCase()} · MAX 1X`],
          ["MARGIN", demo.marginMode.toUpperCase()],
          ["APPROVED NOTIONAL", `$${demo.approvedNotionalUsdt}`],
          ["QTY", receipt.request.qty],
          ["ORDER ID", demo.orderId ?? "—"],
          ["CLIENT OID", demo.clientOid],
          ["STATUS", demo.filled ? "FILLED · VERIFIED" : String(demo.orderStatus ?? "UNKNOWN").toUpperCase()],
          ["AVG PRICE", demo.avgPrice ?? "—"],
          ["EXECUTED QTY", demo.cumExecQty ?? "—"],
          ["EXECUTED VALUE", demo.cumExecValue ?? "—"],
          ["SUBMITTED", demo.submittedAt ?? "—"],
          ["VERIFIED", demo.verifiedAt ?? "—"],
          ["STATE", "DEMO ORDER · VIRTUAL FUNDS ONLY"],
        ]
      : [
          ["MODE", receipt.request.mode === "DRY_RUN" ? "DRY RUN" : receipt.request.mode],
          ["OPERATION", receipt.request.operationId],
          ["ENDPOINT", receipt.request.endpoint],
          ["SYMBOL", receipt.request.symbol],
          ["CATEGORY", receipt.request.category],
          ["SIDE", receipt.request.side.toUpperCase()],
          ["POSITION SIDE", receipt.request.posSide.toUpperCase()],
          ["TYPE", receipt.request.orderType.toUpperCase()],
          ["QTY", receipt.request.qty],
          ["STATE", "WOULD-BE · NEVER SUBMITTED"],
        ];

  return (
    <div className="anim-rise flex flex-col gap-10 pt-8 sm:pt-12">
      <DecisionRail current="RECEIPT" />

       <section aria-label="Decision hero" className="tx-record-stack tx-material-light-frost rounded-[16px] p-6 sm:p-10">
        <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              DECISION · {receipt.receiptId} · {receipt.timestamp}
            </p>
            <p className="mt-4 text-[20px] font-extrabold leading-none tracking-[-0.02em] text-ink sm:text-[28px]">
              ACTION CLEARED
            </p>
            <p className="value-live mt-4 text-[72px] font-extrabold leading-none tracking-[-0.03em] drop-shadow-[0_10px_24px_rgba(17,17,17,0.18)] sm:text-[120px]">
              ${receipt.proposedTradeValueUsdt}
            </p>
            <p className="font-syslabel mt-3 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              PROTECTION · NVIDIA · RNVDAUSDT
            </p>
          </div>
          <SceneAnchor className="tx-floating-mascot flex flex-col items-center gap-4">
            <TenaxAgent state="complete" size={104} caption="DECISION RECORDED" className="mascot-scale" />
            <p
              className="tx-seal seal-stamp seal-ring rounded-full border-2 border-ink bg-signal px-4 py-2 text-center text-[13px] font-extrabold leading-[18px] tracking-[0.06em] text-ink"
              aria-label={`Tenax decision record sealed at ${receipt.timestamp}`}
            >
              TENAX DECISION RECORD
              <br />
              SEALED
            </p>
          </SceneAnchor>
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
        className="tx-material-editorial border-t-4 border-t-clay p-5 sm:p-8"
      >
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          REJECTED ALTERNATIVE · REFUSAL IS A FEATURE
        </p>
        {alternative ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <p className="text-[44px] font-extrabold leading-none tracking-[-0.02em] sm:text-[64px]">
              ${alternative.proposedTradeValueUsdt}
            </p>
            <p className="state-mark bg-clay text-softwhite">
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

      {isStanding ? (
        <section aria-label="Autonomous authority" className="tx-material-authority rounded-[18px] p-5 text-softwhite sm:p-8">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
            AUTONOMOUS AUTHORITY · STANDING MANDATE
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {[
              ["HUMAN APPROVAL THIS ACTION", "NOT REQUIRED"],
              ["PRE-AUTHORIZATION", receipt.authorityDecision ?? "—"],
              ["MANDATE", receipt.standingMandateId ?? "—"],
              ["MANDATE HASH", receipt.standingMandateHash ? `${receipt.standingMandateHash.slice(0, 16)}…` : "—"],
              ["EVALUATED", receipt.authorityEvaluatedAt ?? "—"],
              ["EXECUTION", isDemo ? "BITGET DEMO" : "DRY RUN"],
            ].map(([term, value]) => (
              <div
                key={term}
                className="flex flex-wrap items-baseline justify-between gap-4 border-t border-softwhite/15 py-2.5"
              >
                <dt className="font-syslabel shrink-0 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                  {term}
                </dt>
                <dd className="break-words text-right text-[13px] font-bold leading-[18px]">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section aria-label="Technical details" className="tx-technical-drawer p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
            {isDemo ? "TECHNICAL · SUBMITTED DEMO BITGET ORDER" : "TECHNICAL · WOULD-BE BITGET REQUEST"}
          </p>
          <span className="state-mark ml-auto text-signal">
            {isDemo ? "DEMO ORDER · VIRTUAL FUNDS ONLY" : "DRY RUN · NO FUNDS MOVED"}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {requestRows.map(([term, value]) => (
            <div
              key={term}
              className="flex flex-wrap items-baseline justify-between gap-4 border-t instrument-divider py-2.5"
            >
              <dt className="font-syslabel shrink-0 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                {term}
              </dt>
              <dd className="break-words text-right text-[13px] font-bold leading-[18px]">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ProvenanceStrip
        items={[
          "LIVE BITGET DATA",
          "SIMULATED PORTFOLIO",
          "DEVELOPMENT ANALYSIS",
          isDemo ? "BITGET_DEMO EXECUTION" : "DRY_RUN EXECUTION",
        ]}
      />
      <p className="text-[11px] leading-[14px] text-mutedink">{NOT_ADVICE}</p>
    </div>
  );
}
