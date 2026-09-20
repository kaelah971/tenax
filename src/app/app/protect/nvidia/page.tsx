// Tenax Protect — intent, mandate authority, and one analysis action.
import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { EVENT_UNAVAILABLE_LINE, INTENT_LINE, MANDATE_SUMMARY } from "../../_copy";
import { AuthorityInstrument, SceneAnchor } from "../../_components/materials";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";
import { LiveDot, TenaxAgent } from "../../_components/living";
import AnalyzeButton from "./AnalyzeButton";

export const dynamic = "force-dynamic";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

const MANDATE_ROWS: Array<[string, string]> = [
  ["MAX HEDGE", `${MANDATE_FIXTURE.maxProtectionPct}%`],
  ["MAX TRADE", `$${MANDATE_FIXTURE.maxTradeValueUsdt}`],
  ["LEVERAGE", `MAX ${MANDATE_FIXTURE.maxLeverage}X`],
  ["APPROVAL", MANDATE_FIXTURE.approvalRequired ? "REQUIRED" : "OPEN"],
  ["EXPOSURE", MANDATE_FIXTURE.allowedUnderlying],
];

export default async function ProtectPage() {
  const snapshot = await getDemoSnapshot();
  const marketOk = snapshot.availability !== "UNAVAILABLE";

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="INTENT" />
      <section className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">INTENT · PROTECT_EVENT_RISK</p>
        <h1 className="mt-3 max-w-4xl text-[42px] font-extrabold leading-[0.92] tracking-[-0.04em] sm:text-[78px]">{INTENT_LINE}</h1>
        <p className="mt-5 max-w-xl text-[16px] leading-[24px] text-mutedink">State the outcome once. Tenax carries the limits forward to the authority boundary.</p>
      </section>

      <section aria-label="Mandate control surface" className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-end">
        <AuthorityInstrument as="div" className="rounded-[18px] p-5 text-softwhite sm:p-8">
          <div className="flex flex-wrap items-center gap-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">MANDATE_001 · AUTHORITY CONSOLE</p><span className="state-mark ml-auto text-signal"><LiveDot label="AUTHORITY ACTIVE" /></span></div>
          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-0 md:grid-cols-5">
            {MANDATE_ROWS.map(([term, value]) => <div key={term} className="border-t border-softwhite/15 px-2 py-4 first:border-t-0 sm:border-t sm:first:border-t"><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">{term}</dt><dd className="mt-2 text-[26px] font-extrabold leading-none tracking-[-0.03em]">{value}</dd></div>)}
          </dl>
          <div className="mt-3 h-px bg-softwhite/15" />
          <p className="mt-6 max-w-2xl text-[16px] leading-[24px] text-softwhite/90">{MANDATE_SUMMARY}</p>
          <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">◇ DEV · CONFIGURED VALUES — EDITABLE CONTROLS ARRIVE LATER</p>
        </AuthorityInstrument>
        <SceneAnchor className="tx-floating-mascot -mb-2 justify-self-end sm:-mr-4"><TenaxAgent state={marketOk ? "watching" : "waiting"} size={132} caption={marketOk ? "READY TO ANALYZE" : "WAITING"} className="mascot-scale" /></SceneAnchor>
      </section>

      {!marketOk ? <p role="alert" className="max-w-xl text-[16px] leading-[24px] text-clay">{EVENT_UNAVAILABLE_LINE}</p> : null}

      <AnalyzeButton rawText={RAW_TEXT} disabled={!marketOk} disabledReason={marketOk ? undefined : "Analysis needs live market context first."} />
      <ProvenanceStrip items={[marketOk ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
