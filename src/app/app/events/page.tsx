// Tenax Events — event observation cassette, presentation only.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { DATE_UNAVAILABLE_LINE, EVENT_UNAVAILABLE_LINE } from "../_copy";
import { AuthorityInstrument, ClearInstrument, EvidenceStack } from "../_components/materials";
import { DecisionRail, ProvenanceStrip } from "../_components/ui";
import { LiveDot, TenaxAgent } from "../_components/living";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const snapshot = await getDemoSnapshot();
  const live = snapshot.availability !== "UNAVAILABLE";
  const forecast = snapshot.earningsForecast.data;
  const sessionState = snapshot.sessions.data?.currentState ?? "UNKNOWN";

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="INTELLIGENCE" />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">EVENT ROOM · INTELLIGENCE</p>
        <h1 className="mt-3 max-w-3xl text-[42px] font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-[72px]">Events affecting your capital.</h1>
      </div>

      <AuthorityInstrument as="section" className={`relative overflow-hidden rounded-[18px] p-5 sm:p-8 ${!live ? "opacity-90" : ""}`}>
        {live ? <span className="tx-event-spine" aria-hidden="true" /> : null}
        <div className="grid gap-8 pl-3 sm:grid-cols-[minmax(0,0.78fr)_minmax(360px,1.22fr)] sm:gap-12 sm:pl-5">
          <div>
            <div className="flex flex-wrap items-center gap-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">EVENT_01</p>{live ? <span className="state-mark bg-signal text-ink"><LiveDot label="WATCHING" /></span> : <span className="state-mark border-clay text-clay">UNAVAILABLE</span>}</div>
            <h2 className="mt-3 text-[38px] font-extrabold leading-[0.92] tracking-[-0.04em] sm:text-[62px]">NVIDIA EARNINGS</h2>
            <p className="font-syslabel mt-5 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-softwhite/60">AFFECTED EXPOSURE · $500 rNVDA</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="border-t border-softwhite/15 pt-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">DATE</p><p className="mt-1 text-[24px] font-extrabold leading-none">UNVERIFIED</p><p className="mt-1 max-w-[180px] text-[11px] leading-[14px] text-softwhite/55">{DATE_UNAVAILABLE_LINE}</p></div>
              <div className="border-t border-softwhite/15 pt-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AGENT</p><p className="mt-1 text-[24px] font-extrabold leading-none text-signal">{live ? "READY" : "PAUSED"}</p></div>
            </div>
          </div>

          <div className="relative">
            <div className="mb-4 flex items-start justify-between gap-6">
              <div className="flex items-center gap-3"><span className={`tx-watching-slit ${!live ? "opacity-30 [animation:none]" : ""}`} aria-hidden="true" /><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">OBSERVATION CASSETTE</p></div>
              <TenaxAgent state={live ? "watching" : "waiting"} size={78} caption={live ? "MONITORING" : "WAITING"} className="-mr-1 -mt-3 mascot-scale" />
            </div>
            {live ? (
              <EvidenceStack>
                <ClearInstrument className="tx-observation-pane p-4"><dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-5 gap-y-2 text-[13px] leading-[18px]"><dt className="text-softwhite/55">Earnings date</dt><dd className="font-semibold">{DATE_UNAVAILABLE_LINE}</dd><dt className="text-softwhite/55">Session state</dt><dd className="font-semibold">{sessionState}</dd></dl></ClearInstrument>
                <ClearInstrument className="tx-observation-pane p-4"><dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-5 gap-y-2 text-[13px] leading-[18px]"><dt className="text-softwhite/55">Forecast context</dt><dd className="font-semibold">{forecast ? `FY${forecast.fiscalYear} · EPS ${forecast.eps} · ${forecast.currency}` : "—"}</dd><dt className="text-softwhite/55">Assessment</dt><dd className="font-semibold text-signal">Available</dd></dl></ClearInstrument>
                <ClearInstrument className="tx-observation-pane p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">PROVENANCE</p><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em]">● LIVE BITGET DATA</p></div></ClearInstrument>
              </EvidenceStack>
            ) : <div className="tx-observation-pane tx-observation-pane-muted p-5"><p className="text-[16px] leading-[24px] text-softwhite/80">{EVENT_UNAVAILABLE_LINE}</p></div>}
            <Link href="/app/protect/nvidia" className="btn-living mt-7 inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95">PROTECT THIS POSITION <span className="btn-arrow" aria-hidden="true">→</span></Link>
          </div>
        </div>
      </AuthorityInstrument>

      <ProvenanceStrip items={[live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO"]} />
    </div>
  );
}
