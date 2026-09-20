// Tenax Exposure — semantic relationship view, presentation only.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { LightInstrument } from "../../_components/materials";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function ExposurePage() {
  const snapshot = await getDemoSnapshot();
  const live = snapshot.availability !== "UNAVAILABLE";
  const instrument = snapshot.instrument.data;
  const trading = snapshot.trading.data;
  const rep = NVDA_EXPOSURE_FIXTURE.representation;

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="EXPOSURE" />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">EXPOSURE GRAPH · UNDERLYING OBJECT</p>
        <h1 className="mt-3 text-[52px] font-extrabold leading-[0.9] tracking-[-0.05em] sm:text-[92px]">NVIDIA</h1>
        <p className="mt-4 max-w-xl text-[16px] leading-[24px] text-mutedink">The economic exposure. Everything below is a representation of it — never the same thing.</p>
      </div>

      <section aria-label="NVIDIA exposure relationship" className="relative grid gap-5 sm:grid-cols-[0.8fr_1.2fr] sm:gap-8">
        <div className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">UNDERLYING EXPOSURE</p>
          <p className="mt-5 text-[54px] font-extrabold leading-none tracking-[-0.04em]">$500</p>
          <p className="mt-2 text-[18px] font-bold leading-[24px]">NVIDIA economic exposure</p>
          <p className="mt-3 max-w-sm text-[13px] leading-[18px] text-mutedink">The agent begins here before it interprets any token symbol.</p>
        </div>
        <div className="relative flex flex-col gap-3 border-l border-ink/20 pl-5 sm:pl-8">
          <span className="absolute -left-[5px] top-8 h-2.5 w-2.5 rounded-full bg-ink" aria-hidden="true" />
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">REPRESENTATIONS · INFORMATIONAL RELATIONSHIPS</p>
          <LightInstrument className="tx-material-light-frost p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[18px] font-bold leading-[24px]">rNVDA · Bitget Reality</p><p className="font-syslabel mt-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">YOUR REPRESENTATION</p></div><span className="state-mark bg-signal text-ink">YOU ARE HERE</span></div>
            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 text-[13px] leading-[18px] sm:grid-cols-3"><dt className="text-mutedink">Value</dt><dd className="font-semibold">$500 simulated</dd><dt className="text-mutedink">Instrument</dt><dd className="font-semibold">{live ? (instrument?.status ?? "—") : "Unavailable"}</dd><dt className="text-mutedink">Reality flag</dt><dd className="font-semibold">{live ? (instrument?.isReality ? "yes" : "—") : "—"}</dd><dt className="text-mutedink">Trading periods</dt><dd className="font-semibold">{live ? trading?.tradingPeriods.join(" · ") : "—"}</dd><dt className="text-mutedink">Weekend tradable</dt><dd className="font-semibold">{live ? (trading?.weekendTradable ? "yes" : "—") : "—"}</dd><dt className="text-mutedink">Order constraints</dt><dd className="font-semibold">min {rep.minOrderQty} rNVDA · min ${rep.minOrderAmount}</dd></dl>
          </LightInstrument>
          <div className="border-t border-ink/15 pt-4 text-[14px] leading-[20px]"><span className="font-semibold">NVDAx</span><span className="text-mutedink"> · xStocks ecosystem · informational only</span></div>
          <div className="border-t border-ink/15 pt-4 text-[14px] leading-[20px]"><span className="font-semibold">Ondo NVIDIA</span><span className="text-mutedink"> · Ondo ecosystem · informational only</span></div>
        </div>
      </section>

      <div><Link href="/app/protect/nvidia" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95">PROTECT THIS EXPOSURE <span className="btn-arrow" aria-hidden="true">→</span></Link></div>
      <ProvenanceStrip items={[live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO"]} />
    </div>
  );
}
