// Tenax Activity — current-session chronological ledger.
import Link from "next/link";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { SESSION_ONLY_NOTICE } from "../_copy";
import { DecisionRail, Chip, ProvenanceStrip } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const flows = [...getTenaxDevStore().flows.entries()];

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="RECEIPT" />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10"><div className="flex flex-wrap items-baseline gap-x-5 gap-y-2"><div><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">ACTIVITY · AUDIT TRAIL</p><h1 className="mt-3 text-[52px] font-extrabold leading-[0.9] tracking-[-0.05em] sm:text-[92px]">Activity</h1></div><span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">CURRENT SESSION ONLY</span></div></div>

      {flows.length === 0 ? (
        <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">NO ACTIVITY YET</p><p className="mt-3 text-[18px] leading-[26px]">No protection flows this session. <Link href="/app/protect/nvidia" className="font-medium underline decoration-signal underline-offset-4">Protect this exposure →</Link></p></section>
      ) : (
        <section aria-label="Session flows" className="tx-material-editorial border-t-2 border-ink"><div className="flex items-baseline justify-between gap-4 py-4"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">SESSION FLOWS</p><p className="text-[14px] leading-[20px] text-mutedink">{flows.length} flow(s)</p></div><ol className="flex flex-col">{flows.map(([flowId, flow]) => { const state = flow.getFlowState(); const done = state === "COMPLETED"; return <li key={flowId} className="row-living flex flex-wrap items-center gap-3 border-t border-ink/15 py-4 text-[13px] leading-[18px]"><span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">{flowId}</span><Chip tone={done ? "pass" : state === "FAILED" ? "refused" : "dryrun"}>{state}</Chip><Link href={done ? `/app/receipts/${flowId}` : `/app/analysis/${flowId}`} className="ml-auto min-h-11 rounded-[9px] px-3 py-2 font-medium underline decoration-signal underline-offset-4">{done ? "View receipt →" : "Continue →"}</Link></li>; })}</ol></section>
      )}
      <p className="text-[11px] leading-[14px] text-mutedink">{SESSION_ONLY_NOTICE}</p>
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
