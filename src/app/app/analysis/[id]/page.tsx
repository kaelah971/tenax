// Tenax Phase 1E-B — analysis view: INTELLIGENCE, then AUTHORITY.
// Tenax has interpreted the situation; code now decides whether the proposal
// is allowed. Editorial scale, no card grid. Reasoning stays labeled
// development analysis — never implied live AI.
import Link from "next/link";
import { notFound } from "next/navigation";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";
import { LiveDot, TenaxAgent, staggerStyle } from "../../_components/living";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = getTenaxDevStore().flows.get(id);
  const context = flow?.getContext();
  const analysis = context?.analysis;
  if (!flow || !analysis) notFound();

  return (
    <div className="anim-rise flex flex-col gap-10 pt-8 sm:pt-12">
      <DecisionRail current="INTELLIGENCE" />

      <section aria-label="Intelligence" className="float-module p-6 sm:p-10">
        <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            INTELLIGENCE_01 · FLOW {id}
          </p>
          <div className="agent-stage">
            <TenaxAgent state="analyzing" size={96} caption="ASSEMBLING INTELLIGENCE" className="mascot-scale" />
          </div>
        </div>
        <div className="path-spine mt-6">
          <div className="absolute left-0 right-0 top-2 hidden h-px bg-ink/15 sm:block" aria-hidden="true" />
          <div className="tx-stagger relative grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
            <div style={staggerStyle(0)} className="path-node">
              <span className="path-node-dot mb-3 block h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-ink" aria-hidden="true" />
              <p className="value-live text-[56px] font-extrabold leading-none tracking-[-0.03em] sm:text-[80px]">
                $500
              </p>
              <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                01 · NVIDIA EXPOSURE
              </p>
            </div>
            <div style={staggerStyle(1)} className="path-node">
              <span className="path-node-dot mb-3 block h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-ink" aria-hidden="true" />
              <p className="value-live text-[56px] font-extrabold leading-none tracking-[-0.03em] sm:text-[80px]">
                {analysis.proposal.protectionPct}%
              </p>
              <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                02 · PROPOSED PROTECTION
              </p>
            </div>
            <div style={staggerStyle(2)} className="path-node">
              <span className="path-node-dot mb-3 block h-2.5 w-2.5 rounded-full bg-ink" aria-hidden="true" />
              <p className="value-live inline-block rounded-2xl bg-signal px-3 py-1 text-[56px] font-extrabold leading-none tracking-[-0.03em] text-ink shadow-[0_0_34px_-6px_rgba(245,255,59,0.8)] sm:text-[80px]">
                ${analysis.authority.calculatedTradeValueUsdt}
              </p>
              <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                03 · PROPOSED ACTION · CODE-DERIVED
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 max-w-2xl border-t-2 border-ink pt-6">
          <p className="font-syslabel inline-block rounded-full bg-ink px-2.5 py-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
            ◇ DEV · DEVELOPMENT ANALYSIS — REASONING ONLY, AUTHORIZES NOTHING
          </p>
          <p className="mt-3 text-[20px] font-bold leading-[28px]">{analysis.reasoning.summary}</p>
          <ul className="tx-stagger mt-4 flex flex-col gap-2">
            {analysis.reasoning.riskObservations.map((observation, i) => (
              <li
                key={observation}
                style={staggerStyle(i)}
                className="rounded-r-[12px] border-l-2 border-ink bg-softwhite/60 py-1 pl-3 text-[16px] leading-[24px]"
              >
                {observation}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[16px] leading-[24px] text-mutedink">{analysis.reasoning.rationale}</p>
        </div>

        <div className="mt-8">
          <div className="float-module-dark border-l-4 border-l-signal p-5 text-softwhite sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
              EVIDENCE RAIL · EXPOSURE → EVIDENCE → PROPOSAL
            </p>
            <span className="signal-glow ml-auto rounded-full border border-signal/40 px-2.5 py-1 text-signal">
              <LiveDot label="LIVE" />
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
            <div className="border-t instrument-divider pt-3">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">● LIVE</dt>
              <dd className="mt-1 text-[13px] font-bold leading-[18px]">BITGET REALITY</dd>
            </div>
            <div className="border-t instrument-divider pt-3">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">EVENT</dt>
              <dd className="mt-1 text-[13px] font-bold leading-[18px]">NVIDIA EARNINGS</dd>
            </div>
            <div className="border-t instrument-divider pt-3">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">MARKET</dt>
              <dd className="mt-1 text-[13px] font-bold leading-[18px]">RNVDAUSDT</dd>
            </div>
          </dl>
          <ul className="tx-stagger mt-4 flex flex-col gap-1.5 text-[11px] leading-[14px] text-softwhite/60">
            {analysis.reasoning.evidenceRefs.map((ref, i) => (
              <li key={ref} style={staggerStyle(i)}>▸ {ref}</li>
            ))}
          </ul>
          </div>
        </div>
      </section>

      <section aria-label="Next step" className="float-module-dark p-5 text-softwhite sm:p-8">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          NEXT
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
          <p className="text-[24px] font-extrabold leading-none tracking-[-0.02em] sm:text-[32px]">
            Code decides whether this is allowed.
          </p>
          <Link
            href={`/app/approval/${id}`}
            className="btn-living rounded-full inline-flex min-h-12 items-center justify-center bg-signal px-8 py-3.5 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:ml-auto"
          >
            CHECK AGAINST MANDATE <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <ProvenanceStrip
        items={["LIVE BITGET DATA", "SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]}
      />
    </div>
  );
}
