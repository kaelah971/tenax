// Tenax Phase 1E-B — analysis view: INTELLIGENCE, then AUTHORITY.
// Tenax has interpreted the situation; code now decides whether the proposal
// is allowed. Editorial scale, no card grid. Reasoning stays labeled
// development analysis — never implied live AI.
import Link from "next/link";
import { notFound } from "next/navigation";

import { routeDevStore } from "@/app/api/protection/_dev-store";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = routeDevStore.flows.get(id);
  const context = flow?.getContext();
  const analysis = context?.analysis;
  if (!flow || !analysis) notFound();

  return (
    <div className="anim-rise flex flex-col gap-10 pt-8 sm:pt-12">
      <DecisionRail current="INTELLIGENCE" />

      <section aria-label="Intelligence">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          INTELLIGENCE_01 · FLOW {id}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
          <div>
            <p className="text-[56px] font-extrabold leading-none tracking-[-0.03em] sm:text-[88px]">
              $500
            </p>
            <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              NVIDIA EXPOSURE
            </p>
          </div>
          <div>
            <p className="text-[56px] font-extrabold leading-none tracking-[-0.03em] sm:text-[88px]">
              {analysis.proposal.protectionPct}%
            </p>
            <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              PROPOSED PROTECTION
            </p>
          </div>
          <div>
            <p className="bg-signal inline-block px-2 text-[56px] font-extrabold leading-none tracking-[-0.03em] text-ink sm:text-[88px]">
              ${analysis.authority.calculatedTradeValueUsdt}
            </p>
            <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              PROPOSED ACTION · CODE-DERIVED
            </p>
          </div>
        </div>

        <div className="mt-8 max-w-2xl border-t-2 border-ink pt-6">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            ◇ DEV · DEVELOPMENT ANALYSIS — REASONING ONLY, AUTHORIZES NOTHING
          </p>
          <p className="mt-3 text-[20px] font-bold leading-[28px]">{analysis.reasoning.summary}</p>
          <ul className="mt-4 flex flex-col gap-2">
            {analysis.reasoning.riskObservations.map((observation) => (
              <li key={observation} className="border-l-2 border-ink pl-3 text-[16px] leading-[24px]">
                {observation}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[16px] leading-[24px] text-mutedink">{analysis.reasoning.rationale}</p>
        </div>

        <div className="mt-8 rounded-[2px] bg-graphite p-5 text-softwhite sm:p-6">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
            EVIDENCE RAIL
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">● LIVE</dt>
              <dd className="mt-1 text-[13px] font-bold leading-[18px]">BITGET REALITY</dd>
            </div>
            <div>
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">EVENT</dt>
              <dd className="mt-1 text-[13px] font-bold leading-[18px]">NVIDIA EARNINGS</dd>
            </div>
            <div>
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">MARKET</dt>
              <dd className="mt-1 text-[13px] font-bold leading-[18px]">RNVDAUSDT</dd>
            </div>
          </dl>
          <ul className="mt-4 flex flex-col gap-1 text-[11px] leading-[14px] text-softwhite/60">
            {analysis.reasoning.evidenceRefs.map((ref) => (
              <li key={ref}>{ref}</li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Next step" className="rounded-[2px] bg-ink p-5 text-softwhite sm:p-8">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          NEXT
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
          <p className="text-[24px] font-extrabold leading-none tracking-[-0.02em] sm:text-[32px]">
            Code decides whether this is allowed.
          </p>
          <Link
            href={`/app/approval/${id}`}
            className="inline-flex min-h-12 items-center justify-center bg-signal px-8 py-3.5 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:ml-auto"
          >
            CHECK AGAINST MANDATE →
          </Link>
        </div>
      </section>

      <ProvenanceStrip
        items={["LIVE BITGET DATA", "SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]}
      />
    </div>
  );
}
