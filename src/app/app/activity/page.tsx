// Tenax Activity — session audit trail from activity events + flow state.
//
// The primary truth per flow is its latest meaningful authority/action
// event (escalation, review requirement, refusal, execution); COMPLETED
// flows always show receipt truth; anything else falls back to the
// lifecycle chip exactly as before. Earlier lifecycle state renders only
// as secondary metadata — MANDATE_PASS never overpowers a later audit
// outcome. Server-rendered, navigation only: no POSTs, no mutations.
import Link from "next/link";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { SESSION_ONLY_NOTICE } from "../_copy";
import {
  DecisionRail,
  Chip,
  ProvenanceStrip,
  flowAuditView,
  latestMeaningfulEvent,
  type AuditCard,
} from "../_components/ui";

export const dynamic = "force-dynamic";

function toneClass(tone: AuditCard["tone"]): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "border-clay/60";
    case "escalated":
    case "review":
      return "border-signal";
    default:
      return "border-ink/15";
  }
}

function badgeClass(tone: AuditCard["tone"]): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "bg-clay text-softwhite";
    case "escalated":
    case "review":
      return "bg-signal text-ink";
    default:
      return "bg-ink text-softwhite";
  }
}

export default async function ActivityPage() {
  const store = getTenaxDevStore();
  const flows = [...store.flows.entries()];

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="RECEIPT" />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10"><div className="flex flex-wrap items-baseline gap-x-5 gap-y-2"><div><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">ACTIVITY · AUDIT TRAIL</p><h1 className="mt-3 text-[52px] font-extrabold leading-[0.9] tracking-[-0.05em] sm:text-[92px]">Activity</h1></div><span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">CURRENT SESSION ONLY</span></div><nav aria-label="Durable history" className="mt-4"><Link href="/app/proof" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">VIEW DURABLE PROOFS <span className="btn-arrow" aria-hidden="true">→</span></Link></nav></div>

      {flows.length === 0 ? (
        <section className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">NO ACTIVITY YET</p><p className="mt-3 text-[18px] leading-[26px]">No protection flows this session. <Link href="/app/protect/nvidia" className="font-medium underline decoration-signal underline-offset-4">Protect this exposure →</Link></p></section>
      ) : (
        <section aria-label="Session flows" className="tx-material-editorial border-t-2 border-ink"><div className="flex items-baseline justify-between gap-4 py-4"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">SESSION FLOWS</p><p className="text-[14px] leading-[20px] text-mutedink">{flows.length} flow(s)</p></div><ol className="flex flex-col">{flows.map(([flowId, flow]) => {
          const state = flow.getFlowState();
          const done = state === "COMPLETED";
          const view = flowAuditView(state, latestMeaningfulEvent(store.activities, flowId));
          if (view.kind === "receipt" || done) {
            return <li key={flowId} className="row-living flex flex-wrap items-center gap-3 border-t border-ink/15 py-4 text-[13px] leading-[18px]"><span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">{flowId}</span><Chip tone="pass">{state}</Chip><Link href={`/app/receipts/${flowId}`} className="ml-auto min-h-11 rounded-[9px] px-3 py-2 font-medium underline decoration-signal underline-offset-4">View receipt →</Link></li>;
          }
          if (view.kind === "event") {
            const card = view.card;
            return (
              <li key={flowId} className={`flex flex-col gap-2 border-t-2 py-4 ${toneClass(card.tone)}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">{flowId}</span>
                  <span className={`state-mark ${badgeClass(card.tone)}`}>{card.badge}</span>
                  {card.cta ? (
                    <Link href={card.cta.href} className="ml-auto min-h-11 rounded-[9px] border border-ink/70 bg-softwhite/30 px-4 py-2 text-[13px] font-bold leading-[18px] hover:bg-ink hover:text-softwhite">{card.cta.label} →</Link>
                  ) : null}
                </div>
                <p className="text-[15px] font-bold leading-[22px]">{card.title}</p>
                {card.facts.length > 0 ? (
                  <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] leading-[17px]">
                    {card.facts.map(([term, value]) => (
                      <div key={term} className="flex gap-2">
                        <dt className="font-syslabel text-[11px] uppercase leading-[17px] tracking-[0.08em] text-mutedink">{term}</dt>
                        <dd className="font-bold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">{card.result}</p>
                <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink/60">FLOW STATE: {state}</p>
              </li>
            );
          }
          return <li key={flowId} className="row-living flex flex-wrap items-center gap-3 border-t border-ink/15 py-4 text-[13px] leading-[18px]"><span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">{flowId}</span><Chip tone={state === "FAILED" ? "refused" : "dryrun"}>{state}</Chip><Link href={`/app/analysis/${flowId}`} className="ml-auto min-h-11 rounded-[9px] px-3 py-2 font-medium underline decoration-signal underline-offset-4">Continue →</Link></li>;
        })}</ol></section>
      )}
      <p className="text-[11px] leading-[14px] text-mutedink">{SESSION_ONLY_NOTICE}</p>
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
