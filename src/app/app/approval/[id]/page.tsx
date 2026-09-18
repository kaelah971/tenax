// Tenax Phase 1E-B — the signature Mandate Gate screen.
// Capital reaching a permission boundary: ink field, illuminated gate,
// oversized verdict, indexed permission ledger. Mandate PASS and human
// approval are visually separate states. All values server-computed.
import { notFound } from "next/navigation";

import { routeDevStore } from "@/app/api/protection/_dev-store";
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { DRY_RUN_PRE_NOTICE, refusalSentence } from "../../_copy";
import {
  DecisionRail,
  GateCore,
  ProvenanceStrip,
  ledgerRows,
  rulesCleared,
} from "../../_components/ui";
import ApproveExecutePanel from "./ApproveExecutePanel";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = routeDevStore.flows.get(id);
  const context = flow?.getContext();
  const analysis = context?.analysis;
  if (!flow || !analysis) notFound();

  const decision = analysis.authority.mandateDecision;
  const passed = decision.verdict === "PASS";
  const { cleared, total } = rulesCleared(decision);
  const rows = ledgerRows(
    decision,
    analysis.proposal,
    { maxPct: MANDATE_FIXTURE.maxProtectionPct, maxTrade: MANDATE_FIXTURE.maxTradeValueUsdt },
  );
  const alternative = analysis.consideredAlternative;

  return (
    <div className="anim-rise flex flex-col gap-8 pt-8 sm:pt-12">
      <DecisionRail current="MANDATE" />

      <section aria-label="Permission boundary" className="rounded-[2px] bg-ink p-5 text-softwhite sm:p-10">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          GATE_001 · PERMISSION BOUNDARY · FLOW {id}
        </p>

        <GateCore state={passed ? "PASS" : "REFUSED"} />

        <p className="font-syslabel mt-2 text-center text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          {cleared} / {total} RULES CLEARED
        </p>

        <ol className="mx-auto mt-6 flex max-w-2xl flex-col">
          {rows.map((row) => (
            <li
              key={row.index}
              className="flex items-baseline gap-4 border-t border-softwhite/15 py-3"
            >
              <span className="font-syslabel w-8 shrink-0 text-[11px] leading-[14px] text-softwhite/60">
                {row.index}
              </span>
              <span className="font-syslabel min-w-28 shrink-0 text-[11px] uppercase leading-[14px] tracking-[0.08em]">
                {row.title}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-softwhite/80">
                {row.value}
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-bold leading-[18px] ${
                  row.state === "PASS"
                    ? "bg-pass text-white"
                    : row.state === "REFUSED"
                      ? "bg-clay text-white"
                      : "border-2 border-signal text-signal"
                }`}
              >
                {row.state}
              </span>
            </li>
          ))}
        </ol>

        {!passed ? (
          <p className="mx-auto mt-6 max-w-2xl text-center text-[16px] leading-[24px]">
            {refusalSentence(decision.failedRules)}
          </p>
        ) : null}
      </section>

      {passed ? (
        <section aria-label="Human authority" className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[2px] bg-ink/10">
            <div className="bg-softwhite p-5 sm:p-6">
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                MANDATE
              </p>
              <p className="mt-1 text-[28px] font-extrabold leading-none text-pass sm:text-[36px]">
                PASS
              </p>
            </div>
            <div className="bg-ink p-5 text-softwhite sm:p-6">
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                HUMAN
              </p>
              <p className="mt-1 text-[28px] font-extrabold leading-none text-signal sm:text-[36px]">
                WAITING
              </p>
            </div>
          </div>

          <div>
            <p className="text-[30px] font-extrabold leading-[1.0] tracking-[-0.02em] sm:text-[48px]">
              YOU ARE THE FINAL AUTHORITY.
            </p>
            <p className="font-syslabel mt-3 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              DRY RUN · {DRY_RUN_PRE_NOTICE.toUpperCase()}
            </p>
          </div>

          <ApproveExecutePanel
            flowId={id}
            tradeValueUsdt={analysis.authority.calculatedTradeValueUsdt}
          />
        </section>
      ) : null}

      <section
        aria-label="Refusal test"
        className="rounded-[2px] border-t-4 border-clay bg-softwhite p-5 sm:p-8"
      >
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          REFUSAL TEST · REFUSAL IS A FEATURE
        </p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <p className="text-[44px] font-extrabold leading-none tracking-[-0.02em] sm:text-[64px]">
            ${alternative.proposal.proposedTradeValueUsdt}
          </p>
          <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
            ACTION PROPOSED · MAX ALLOWED ${MANDATE_FIXTURE.maxTradeValueUsdt}
          </p>
        </div>
        <p className="mt-3 inline-block rounded-full bg-clay px-3 py-1 text-[13px] font-bold leading-[18px] text-white">
          REFUSED
        </p>
        <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          {alternative.decision.failedRules.join(" · ").toUpperCase() || "NO RULES FAILED"}
        </p>
      </section>

      <ProvenanceStrip
        items={["LIVE BITGET DATA", "SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS", "DRY_RUN EXECUTION"]}
      />
    </div>
  );
}
