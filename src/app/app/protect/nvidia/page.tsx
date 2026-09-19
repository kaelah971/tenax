// Tenax Phase 1E-A — protection intent as a mandate being armed.
// Same locked intent, same fixture values, same server-side authority.
import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { EVENT_UNAVAILABLE_LINE, INTENT_LINE, MANDATE_SUMMARY } from "../../_copy";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";
import { LiveDot, TenaxAgent } from "../../_components/living";
import AnalyzeButton from "./AnalyzeButton";

export const dynamic = "force-dynamic";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

const MANDATE_ROWS: Array<[string, string]> = [
  ["MAX HEDGE", `${MANDATE_FIXTURE.maxProtectionPct}%`],
  ["MAX TRADE", `$${MANDATE_FIXTURE.maxTradeValueUsdt}`],
  ["LEVERAGE", MANDATE_FIXTURE.leverageAllowed ? "ON" : "OFF"],
  ["APPROVAL", MANDATE_FIXTURE.approvalRequired ? "REQUIRED" : "OPEN"],
  ["EXPOSURE", MANDATE_FIXTURE.allowedUnderlying],
];

export default async function ProtectPage() {
  const snapshot = await getDemoSnapshot();
  const marketOk = snapshot.availability !== "UNAVAILABLE";

  return (
    <div className="anim-rise flex flex-col gap-8 pt-8 sm:pt-12">
      <DecisionRail current="INTENT" />

      <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            INTENT · PROTECT_EVENT_RISK
          </p>
          <h1 className="mt-3 max-w-3xl text-[40px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[72px]">
            {INTENT_LINE}
          </h1>
        </div>
        <TenaxAgent state="watching" size={104} caption="WATCHING · READY TO REASON" className="mascot-scale" />
      </div>

      <section aria-label="Mandate control surface" className="float-module-dark p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
            MANDATE_001 · ARMING
          </p>
          <span className="ml-auto rounded-full border border-signal/40 px-2.5 py-1 text-signal shadow-[0_0_18px_-6px_rgba(245,255,59,0.7)]">
            <LiveDot label="AUTHORITY ARMING" />
          </span>
        </div>
        <dl className="mt-4">
          {MANDATE_ROWS.map(([term, value]) => (
            <div
              key={term}
              className="mandate-row-living group flex items-baseline justify-between gap-4 rounded-[14px] border border-transparent px-3 py-3.5 hover:border-signal/30 sm:px-4"
            >
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                {term}
              </dt>
              <dd className="text-[24px] font-extrabold leading-none tracking-[-0.02em] transition-shadow group-hover:[text-shadow:0_0_22px_rgba(245,255,59,0.5)] sm:text-[32px]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="signal-track mt-2" aria-hidden="true">
          <span className="signal-track-segment" />
        </div>
        <p className="mt-6 max-w-xl text-[16px] leading-[24px] text-softwhite/90">{MANDATE_SUMMARY}</p>
        <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          ◇ DEV · CONFIGURED VALUES — EDITABLE CONTROLS ARRIVE LATER
        </p>
      </section>

      {!marketOk ? (
        <p role="alert" className="max-w-xl text-[16px] leading-[24px] text-clay">
          {EVENT_UNAVAILABLE_LINE}
        </p>
      ) : null}

      <AnalyzeButton
        rawText={RAW_TEXT}
        disabled={!marketOk}
        disabledReason={marketOk ? undefined : "Analysis needs live market context first."}
      />

      <ProvenanceStrip
        items={[
          marketOk ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE",
          "SIMULATED PORTFOLIO",
          "DEVELOPMENT ANALYSIS",
        ]}
      />
    </div>
  );
}
