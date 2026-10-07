// Tenax Capital — Bounded Authority Observatory scene.
// Presentation-only composition: server snapshot, provenance, values and
// destinations remain unchanged.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { resolveExecutionMode } from "@/lib/tenax/execution";
import { DATE_UNAVAILABLE_LINE, EVENT_UNAVAILABLE_LINE } from "./_copy";
import { AuthorityInstrument, ClearInstrument, ControlDock, EvidenceStack, LightInstrument, SceneAnchor } from "./_components/materials";
import { DecisionRail, formatCompact, formatMarketTime, ProvenanceStrip } from "./_components/ui";
import { LiveDot, Sparkline, TenaxAgent } from "./_components/living";

export const dynamic = "force-dynamic";

export default async function CapitalPage() {
  const snapshot = await getDemoSnapshot();
  // Server-resolved execution capability for display only: which adapter
  // the server would use, not whether anything has executed.
  const executionMode = resolveExecutionMode(process.env);
  const live = snapshot.availability !== "UNAVAILABLE";
  const ticker = snapshot.ticker.data;
  const sessionState = snapshot.sessions.data?.currentState ?? "UNKNOWN";

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="EXPOSURE" />

      <section aria-label="Capital scene" className="tx-scene-field px-1 pb-2 pt-8 sm:px-5 sm:pt-12">
        <Sparkline className="pointer-events-none absolute inset-x-0 top-24 h-28 w-full opacity-35 sm:top-28 sm:h-40" />
        <div className="relative grid items-end gap-8 sm:grid-cols-[minmax(0,1fr)_230px] sm:gap-4">
          <div className="relative z-[1]">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">CAPITAL_001 · EXPOSURE</p>
            <h1 className="mt-3 max-w-3xl font-display text-[40px] font-bold leading-[0.95] tracking-[-0.01em] sm:text-[76px]">What should your capital do?</h1>
            <div className="mt-8 flex flex-wrap items-end gap-x-8 gap-y-5">
              <div>
                <p className="font-syslabel text-[78px] font-semibold leading-[0.88] tracking-[-0.02em] sm:text-[132px]">$500</p>
                <p className="font-syslabel mt-3 text-[11px] uppercase leading-[18px] tracking-[0.08em]">NVIDIA EXPOSURE · rNVDA · BITGET REALITY</p>
              </div>
              <div className="pb-1">
                <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">POSITION STATE</p>
                <p className="mt-1 text-[20px] font-bold leading-[24px]">SIMULATED PORTFOLIO</p>
                <p className="mt-1 text-[11px] leading-[14px] text-mutedink">No funds represented as live ownership.</p>
              </div>
            </div>
            <p className="mt-5 max-w-xl text-[15px] leading-[22px] text-mutedink">Tenax watches this capital, lets AI propose actions, then checks every proposal against your limits before anything can execute.</p>
          </div>
          <SceneAnchor className="tx-floating-mascot -mb-3 justify-self-end sm:-mr-5">
            <TenaxAgent state="watching" size={156} caption="WATCHING YOUR EXPOSURE" className="mascot-scale" />
          </SceneAnchor>
        </div>

        <div className="relative z-[2] mt-8 flex flex-col gap-3 sm:mt-4 sm:ml-auto sm:max-w-[850px]">
          <LightInstrument className="tx-instrument-dock p-4 sm:p-5">
            <div aria-label="Live market signal" className="flex flex-wrap items-center gap-3">
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">LIVE_SIGNAL · RNVDAUSDT · BITGET REALITY</p>
              {live ? <span className="state-mark ml-auto bg-signal text-ink"><LiveDot label="MARKET DATA · LIVE" /></span> : null}
            </div>
            {live ? (
              <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
                <div className="border-t border-ink/15 pt-2.5"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">LAST</p><p className="tx-value-live mt-1 font-syslabel text-[34px] font-semibold leading-none tracking-[-0.02em]" key={ticker?.lastPrice ?? "none"}>{ticker?.lastPrice ? `$${ticker.lastPrice}` : "—"}</p></div>
                <div className="border-t border-ink/15 pt-2.5"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">24H RANGE</p><p className="mt-1 text-[16px] font-bold leading-[20px]">{ticker?.lowPrice24h && ticker?.highPrice24h ? `$${ticker.lowPrice24h} – $${ticker.highPrice24h}` : "—"}</p></div>
                <div className="border-t border-ink/15 pt-2.5"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">SESSION</p><p className="mt-1 text-[16px] font-bold leading-[20px]">{sessionState === "UNKNOWN" ? "— AWAITING" : sessionState}</p></div>
                <div className="border-t border-ink/15 pt-2.5"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">VOL 24H</p><p className="mt-1 text-[16px] font-bold leading-[20px]">{formatCompact(ticker?.volume24h ?? null)}</p></div>
              </div>
            ) : <p className="mt-3 text-[14px] leading-[20px] text-mutedink">{EVENT_UNAVAILABLE_LINE}</p>}
          </LightInstrument>
          <ControlDock className="justify-end">
            <Link href="/app/protect/nvidia" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-5 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95">PROTECT THROUGH EARNINGS <span className="btn-arrow" aria-hidden="true">→</span></Link>
            <Link href="/app/exposure/nvidia" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">VIEW EXPOSURE</Link>
          </ControlDock>
        </div>
      </section>

      <AuthorityInstrument as="section" className="relative overflow-hidden rounded-[18px] p-5 sm:p-8">
        <span className="tx-event-spine" aria-hidden="true" />
        <div className="grid gap-7 pl-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)] sm:gap-10 sm:pl-5">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">EVENT_01 · OBSERVATION</p>
            <h2 className="mt-2 max-w-lg font-display text-[34px] font-bold leading-[0.95] tracking-[-0.01em] sm:text-[56px]">NVIDIA EARNINGS</h2>
            <p className="mt-4 max-w-md text-[15px] leading-[22px] text-softwhite/75">The monitored event is attached to the capital you already hold.</p>
            <dl className="mt-7 grid gap-4 sm:grid-cols-2">
              <div className="border-t border-softwhite/15 pt-3"><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AFFECTED CAPITAL</dt><dd className="mt-1 font-syslabel text-[26px] font-semibold leading-none">$500</dd></div>
              <div className="border-t border-softwhite/15 pt-3"><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">DATE</dt><dd className="mt-1 font-syslabel text-[26px] font-semibold leading-none">UNVERIFIED</dd><dd className="mt-1 text-[11px] leading-[14px] text-softwhite/55">{DATE_UNAVAILABLE_LINE}</dd></div>
            </dl>
          </div>
          <div className="relative">
            <div className="mb-3 flex items-center gap-3"><span className="tx-watching-slit" aria-hidden="true" /><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">WATCHING · EVIDENCE STATUS</p></div>
            <EvidenceStack>
              <ClearInstrument className="tx-observation-pane p-4"><div className="flex items-center justify-between gap-4"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MARKET SESSION</p><p className="text-[16px] font-bold leading-[20px]">{sessionState}</p></div></ClearInstrument>
              <ClearInstrument className="tx-observation-pane p-4"><div className="flex items-center justify-between gap-4"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AI ANALYSIS</p><p className="text-[16px] font-bold leading-[20px] text-signal">READY</p></div></ClearInstrument>
              <ClearInstrument className="tx-observation-pane p-4"><div className="flex items-center justify-between gap-4"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">PROVENANCE</p><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em]">● LIVE BITGET DATA</p></div></ClearInstrument>
            </EvidenceStack>
            <div className="mt-6 flex items-center justify-between gap-4"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">{live ? `MARKET DATA · ${formatMarketTime(snapshot.fetchedAt)}` : "MARKET OFFLINE"}</p><Link href="/app/protect/nvidia" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-5 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95">PROTECT THIS POSITION <span className="btn-arrow" aria-hidden="true">→</span></Link></div>
          </div>
        </div>
      </AuthorityInstrument>

      <ProvenanceStrip items={[live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO", `${executionMode} EXECUTION`]} />
    </div>
  );
}
