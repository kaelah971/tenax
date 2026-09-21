// Tenax Exposure — semantic relationship view + canonical graph, presentation only.
// The graph derives from canonical Tenax state (simulated fixture + latest
// completed receipt); this page asserts no authority and submits nothing.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { getExposureGraph } from "@/lib/tenax/service";
import { LightInstrument } from "../../_components/materials";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";

export const dynamic = "force-dynamic";

/** USD display: exact cents when known, an em dash when unknown — never a guess. */
function formatGraphUsd(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

/** Approximate display: "~" prefix marks a derived mapping, not a quote. */
function formatApproxUsd(value: number | null): string {
  if (value === null) return "—";
  return `~$${value.toFixed(2)}`;
}

export default async function ExposurePage() {
  const snapshot = await getDemoSnapshot();
  const live = snapshot.availability !== "UNAVAILABLE";
  const instrument = snapshot.instrument.data;
  const trading = snapshot.trading.data;
  const rep = NVDA_EXPOSURE_FIXTURE.representation;
  const graph = getExposureGraph(getTenaxDevStore());
  const exposureLeg = graph.representations.find((r) => r.role === "exposure");
  const protectionLeg = graph.representations.find((r) => r.role === "protection") ?? null;

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

      <section aria-label="Canonical exposure graph" className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">EXPOSURE GRAPH · CANONICAL VIEW</p>
        <h2 className="mt-3 text-[40px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[64px]">NVIDIA</h2>
        <p className="font-syslabel mt-3 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
          1 ECONOMIC EXPOSURE · {graph.representations.length} REPRESENTATION{graph.representations.length === 1 ? "" : "S"}
        </p>
        <div className="relative mt-6 grid gap-5 border-l border-ink/20 pl-5 sm:grid-cols-2 sm:gap-8 sm:pl-8">
          <span className="absolute -left-[5px] top-8 h-2.5 w-2.5 rounded-full bg-ink" aria-hidden="true" />
          <LightInstrument className="tx-material-light-frost p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[18px] font-bold leading-[24px]">{exposureLeg?.representationId} · {exposureLeg?.venue}</p><p className="font-syslabel mt-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">EXPOSURE · {exposureLeg?.symbol}</p></div><span className="state-mark bg-signal text-ink">○ SIMULATED</span></div>
            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 text-[13px] leading-[18px]"><dt className="text-mutedink">Value</dt><dd className="font-semibold">{formatGraphUsd(graph.grossExposureUsd)} simulated</dd><dt className="text-mutedink">Direction</dt><dd className="font-semibold">LONG</dd><dt className="text-mutedink">Instrument</dt><dd className="font-semibold">{live ? (instrument?.status ?? "—") : "Unavailable"}</dd><dt className="text-mutedink">Ownership</dt><dd className="font-semibold">NOT LIVE — SAMPLE HOLDING</dd></dl>
          </LightInstrument>
          {protectionLeg ? (
            <LightInstrument className="tx-material-light-frost p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[18px] font-bold leading-[24px]">{protectionLeg.representationId} · {protectionLeg.venue}</p><p className="font-syslabel mt-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PROTECTION · SHORT · {protectionLeg.leverage ?? "—"} · {protectionLeg.marginMode ?? "—"}</p></div><span className="state-mark bg-ink text-softwhite">{graph.hedgeVerification === "VERIFIED" ? "VERIFIED" : "SUBMITTED"}</span></div>
              <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 text-[13px] leading-[18px]"><dt className="text-mutedink">Quantity</dt><dd className="font-semibold">{protectionLeg.quantity ?? "—"}</dd><dt className="text-mutedink">Executed value</dt><dd className="font-semibold">{protectionLeg.usdValue === null ? "AWAITING VERIFICATION" : `${formatApproxUsd(protectionLeg.usdValue)} verified`}</dd><dt className="text-mutedink">Funds</dt><dd className="font-semibold">VIRTUAL ONLY</dd><dt className="text-mutedink">Source</dt><dd className="font-semibold">{graph.sourceFlowId ?? "—"}</dd></dl>
            </LightInstrument>
          ) : (
            <LightInstrument className="tx-material-light-frost p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[18px] font-bold leading-[24px]">No hedge executed</p><p className="font-syslabel mt-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PROTECTION · ABSENT</p></div><span className="state-mark border border-ink/30 text-ink">◇ NOT EXECUTED</span></div>
              <p className="mt-5 text-[13px] leading-[18px] text-mutedink">No Demo hedge exists for the current state — nothing is shown rather than estimated. <Link href="/app/protect/nvidia" className="font-semibold text-ink underline">Protect this exposure</Link> to attach the NVDAUSDT leg.</p>
            </LightInstrument>
          )}
        </div>
        <dl className="mt-6 grid gap-4 border-t border-ink/15 pt-5 sm:grid-cols-3">
          <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">ECONOMIC EXPOSURE</dt><dd className="mt-1 text-[26px] font-extrabold leading-none">{formatGraphUsd(graph.grossExposureUsd)}</dd></div>
          <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">APPROXIMATE PROTECTED NOTIONAL</dt><dd className="mt-1 text-[26px] font-extrabold leading-none">{formatApproxUsd(graph.protectedNotionalUsd)}</dd></div>
          <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">REMAINING MAPPED EXPOSURE</dt><dd className="mt-1 text-[26px] font-extrabold leading-none">{formatApproxUsd(graph.remainingExposureUsd)}</dd></div>
        </dl>
        <p className="mt-4 max-w-xl text-[13px] leading-[18px] text-mutedink">Approximate mapping across representations — not delta-neutral, not a hedge-effectiveness claim. Verified executed value only; anything unverified stays unknown.</p>
        <p className="font-syslabel mt-4 border-t border-dashed border-ink/20 pt-4 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">◇ MORE REPRESENTATIONS CAN ATTACH HERE</p>
      </section>

      <ProvenanceStrip items={[live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO"]} />
    </div>
  );
}
