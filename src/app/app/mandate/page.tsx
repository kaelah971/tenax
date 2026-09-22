// Tenax Mandate — standing bounded authority, presentation + control.
// The canonical policy bounds below always apply; a standing mandate
// pre-authorizes a narrow class of protection actions within them.
// Creating drafts nothing — only ACTIVATE binds the mandate hash.
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { MANDATE_SUMMARY } from "../_copy";
import { AuthorityInstrument } from "../_components/materials";
import { DecisionRail, JourneyNav, ProvenanceStrip, mandateJourney } from "../_components/ui";
import MandatePanel from "./MandatePanel";

export const dynamic = "force-dynamic";

/** Most recent flow carrying an analysis — the "current analysis" to return to. */
function latestAnalysisFlowId(): string | null {
  let latest: string | null = null;
  for (const [flowId, flow] of getTenaxDevStore().flows) {
    if (flow.getContext().analysis) latest = flowId;
  }
  return latest;
}

export default function MandatePage() {
  const rows: Array<[string, string]> = [
    ["Allowed exposure", MANDATE_FIXTURE.allowedUnderlying],
    ["Maximum hedge", `${MANDATE_FIXTURE.maxProtectionPct}% of position`],
    ["Maximum trade", `$${MANDATE_FIXTURE.maxTradeValueUsdt}`],
    ["Leverage", `max ${MANDATE_FIXTURE.maxLeverage}x`],
    ["Human approval", MANDATE_FIXTURE.approvalRequired ? "Required" : "Not required"],
  ];
  const mandates = [...getTenaxDevStore().mandates.values()];
  const journey = mandateJourney(latestAnalysisFlowId());

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail
        current="MANDATE"
        links={{ EXPOSURE: "/app/exposure/nvidia", INTENT: "/app/protect/nvidia" }}
      />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">MANDATE_001 · PERMISSION</p><h1 className="mt-3 text-[52px] font-extrabold leading-[0.9] tracking-[-0.05em] sm:text-[92px]">Mandate</h1></div>
      <AuthorityInstrument as="section" className="rounded-[18px] p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">CURRENT AUTHORITY</p><p className="mt-2 text-[22px] font-extrabold leading-none">The only permission the agent holds.</p></div><span className="state-mark text-signal">◇ DEV · FIXTURE</span></div>
        <dl className="mt-7 grid grid-cols-1 gap-0 sm:grid-cols-2">{rows.map(([term, value]) => <div key={term} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-softwhite/15 py-4"><dt className="text-[14px] leading-[20px] text-softwhite/60">{term}</dt><dd className="break-words text-right text-[20px] font-bold leading-[24px]">{value}</dd></div>)}</dl>
        <p className="mt-5 max-w-2xl text-[16px] leading-[24px] text-softwhite/90">{MANDATE_SUMMARY}</p>
      </AuthorityInstrument>

      <AuthorityInstrument as="section" aria-label="Standing mandate" className="rounded-[18px] p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">STANDING MANDATE · PRE-AUTHORIZED CLASS</p><p className="mt-2 text-[22px] font-extrabold leading-none">NVIDIA PROTECTION MANDATE</p></div></div>
        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 min-[480px]:grid-cols-2 sm:grid-cols-3">
          {[
            ["MAX PROTECTION", "30%"],
            ["MAX ACTION", "$150"],
            ["MAX LEVERAGE", "1X"],
            ["ALLOWED", "NVDAUSDT"],
            ["SELL UNDERLYING", "NEVER"],
            ["TRANSFERS", "NEVER"],
            ["LEVERAGE CHANGES", "NEVER"],
          ].map(([term, value]) => (
            <div key={term} className="min-w-0 border-t border-softwhite/15 pt-2">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                {term}
              </dt>
              <dd className="mt-1 break-words text-[16px] font-bold leading-[20px]">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 border-t border-softwhite/15 pt-6">
          <MandatePanel mandates={mandates} />
        </div>
      </AuthorityInstrument>
      <JourneyNav label="Continue" links={journey} />
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
