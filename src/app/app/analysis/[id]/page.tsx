// Tenax Analysis — staged interpretation path, presentation only.
import Link from "next/link";
import { notFound } from "next/navigation";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { AuthorityInstrument, LightInstrument, SceneAnchor } from "../../_components/materials";
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
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="INTELLIGENCE" />
      <section className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <div className="flex items-start justify-between gap-6"><div><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">INTELLIGENCE_01 · FLOW {id}</p><h1 className="mt-3 max-w-3xl text-[44px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[78px]">The situation, interpreted.</h1></div><SceneAnchor className="tx-floating-mascot -mt-2 hidden sm:block"><TenaxAgent state="analyzing" size={100} caption="ASSEMBLING" /></SceneAnchor></div>

        <div className="relative mt-10 grid gap-6 border-l border-ink/20 pl-5 sm:grid-cols-[0.8fr_1.2fr] sm:gap-10 sm:pl-8">
          <div className="relative"><span className="absolute -left-[25px] top-2 h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-ink" aria-hidden="true" /><p className="text-[64px] font-extrabold leading-none tracking-[-0.04em] sm:text-[92px]">$500</p><p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">01 · NVIDIA EXPOSURE</p></div>
          <div className="relative"><span className="absolute -left-[25px] top-2 h-2.5 w-2.5 rounded-full bg-signal ring-2 ring-ink" aria-hidden="true" /><p className="text-[64px] font-extrabold leading-none tracking-[-0.04em] sm:text-[92px]">{analysis.proposal.protectionPct}%</p><p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">02 · PROPOSED PROTECTION</p></div>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)] sm:items-start">
          <div><p className="state-mark bg-ink text-signal">◇ DEV · DEVELOPMENT ANALYSIS</p><p className="mt-4 max-w-2xl text-[22px] font-bold leading-[28px]">{analysis.reasoning.summary}</p><ul className="mt-5 flex flex-col gap-2">{analysis.reasoning.riskObservations.map((observation, i) => <li key={observation} style={staggerStyle(i)} className="border-l-2 border-ink py-1 pl-3 text-[16px] leading-[24px]">{observation}</li>)}</ul><p className="mt-5 max-w-2xl text-[16px] leading-[24px] text-mutedink">{analysis.reasoning.rationale}</p></div>
          <LightInstrument className="tx-material-light-frost rounded-[16px] p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PROPOSAL LENS</p><span className="state-mark border-ink text-ink">CODE-DERIVED</span></div><p className="mt-6 text-[62px] font-extrabold leading-none tracking-[-0.05em]">${analysis.authority.calculatedTradeValueUsdt}</p><p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">03 · PROPOSED ACTION</p><div className="mt-6 border-t border-ink/15 pt-4"><p className="text-[14px] leading-[20px]">The notional is calculated from the proposal and exposure. It is not execution authority.</p></div></LightInstrument>
        </div>
      </section>

      <AuthorityInstrument as="section" className="rounded-[18px] p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">EVIDENCE RAIL · EXPOSURE → EVIDENCE → PROPOSAL</p><span className="state-mark ml-auto text-signal"><LiveDot label="LIVE" /></span></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3"><div className="border-t border-softwhite/15 pt-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">● LIVE</p><p className="mt-1 text-[14px] font-bold leading-[18px]">BITGET REALITY</p></div><div className="border-t border-softwhite/15 pt-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">EVENT</p><p className="mt-1 text-[14px] font-bold leading-[18px]">NVIDIA EARNINGS</p></div><div className="border-t border-softwhite/15 pt-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MARKET</p><p className="mt-1 text-[14px] font-bold leading-[18px]">RNVDAUSDT</p></div></div>
        <ul className="mt-5 flex flex-col gap-1.5 text-[11px] leading-[14px] text-softwhite/60">{analysis.reasoning.evidenceRefs.map((ref, i) => <li key={ref} style={staggerStyle(i)}>▸ {ref}</li>)}</ul>
      </AuthorityInstrument>

      <section aria-label="Next step" className="tx-material-editorial border-t-2 border-ink pt-6 sm:pt-8"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">AUTHORITY HANDOFF</p><div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center"><p className="text-[28px] font-extrabold leading-none tracking-[-0.03em] sm:text-[40px]">Code decides whether this is allowed.</p><Link href={`/app/approval/${id}`} className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:ml-auto">CHECK AGAINST MANDATE <span className="btn-arrow" aria-hidden="true">→</span></Link></div></section>
      <ProvenanceStrip items={["LIVE BITGET DATA", "SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
