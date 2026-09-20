// Tenax Mandate — one authority ledger, presentation only.
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { MANDATE_SUMMARY } from "../_copy";
import { AuthorityInstrument } from "../_components/materials";
import { DecisionRail, ProvenanceStrip } from "../_components/ui";

export default function MandatePage() {
  const rows: Array<[string, string]> = [
    ["Allowed exposure", MANDATE_FIXTURE.allowedUnderlying],
    ["Maximum hedge", `${MANDATE_FIXTURE.maxProtectionPct}% of position`],
    ["Maximum trade", `$${MANDATE_FIXTURE.maxTradeValueUsdt}`],
    ["Leverage", `max ${MANDATE_FIXTURE.maxLeverage}x`],
    ["Human approval", MANDATE_FIXTURE.approvalRequired ? "Required" : "Not required"],
  ];

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="MANDATE" />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">MANDATE_001 · PERMISSION</p><h1 className="mt-3 text-[52px] font-extrabold leading-[0.9] tracking-[-0.05em] sm:text-[92px]">Mandate</h1></div>
      <AuthorityInstrument as="section" className="rounded-[18px] p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">CURRENT AUTHORITY</p><p className="mt-2 text-[22px] font-extrabold leading-none">The only permission the agent holds.</p></div><span className="state-mark text-signal">◇ DEV · FIXTURE</span></div>
        <dl className="mt-7 grid grid-cols-1 gap-0 sm:grid-cols-2">{rows.map(([term, value]) => <div key={term} className="flex flex-wrap items-baseline justify-between gap-3 border-t border-softwhite/15 py-4"><dt className="text-[14px] leading-[20px] text-softwhite/60">{term}</dt><dd className="text-[20px] font-bold leading-[24px]">{value}</dd></div>)}</dl>
        <p className="mt-5 max-w-2xl text-[16px] leading-[24px] text-softwhite/90">{MANDATE_SUMMARY}</p>
      </AuthorityInstrument>
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
