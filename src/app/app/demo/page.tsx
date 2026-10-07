// Tenax judge demo — one-click hosted authority flow.
//
// Runs a complete Tenax authority cycle against a controlled,
// explicitly labeled development-fixture scenario: no credentials, no
// AI calls, no Bitget traffic, no MCP dependency. The RUN DEMO action
// POSTs to the server, which executes real domain services and returns
// terminal refusal evidence (activity + proof + run, NO_ORDER).
import Link from "next/link";

import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { JUDGE_DEMO_PROVENANCE } from "@/lib/tenax/judge-demo";
import { AuthorityInstrument, ClearInstrument, EvidenceStack } from "../_components/materials";
import { DecisionRail, ProvenanceStrip } from "../_components/ui";
import { LiveDot, TenaxAgent } from "../_components/living";
import DemoRunner from "./DemoRunner";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="INTENT" links={{ EXPOSURE: "/app/exposure/nvidia" }} />
      <section className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">JUDGE DEMO · CONTROLLED AUTHORITY FLOW</p>
          <span className="state-mark border-ink text-ink">{JUDGE_DEMO_PROVENANCE}</span>
        </div>
        <h1 className="mt-3 max-w-3xl font-display text-[42px] font-bold leading-[0.95] tracking-[-0.01em] sm:text-[72px]">
          Run a complete Tenax authority flow.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-[24px] text-mutedink">
          One click runs real Tenax domain services against a controlled demo scenario:
          exposure → event context → intent → mandate gate → authority → terminal evidence.
          Nothing trades, nothing calls AI, nothing touches a provider.
        </p>
      </section>

      <AuthorityInstrument as="section" aria-label="Demo scenario" className="relative overflow-hidden rounded-[18px] p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">DEMO SCENARIO · FIXTURE INPUT, REAL AUTHORITY</p>
          <span className="state-mark ml-auto text-signal"><LiveDot label="READY" /></span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-0 md:grid-cols-4">
          {[
            ["EXPOSURE", `$${NVDA_EXPOSURE_FIXTURE.exposureValueUsdt} SIMULATED NVIDIA`],
            ["EVENT", "NO VERIFIED EVENT · FIXTURE CONTEXT"],
            ["PROPOSAL", "PROTECT 40% · $200"],
            ["MANDATE MAX", `${MANDATE_FIXTURE.maxProtectionPct}% · $${MANDATE_FIXTURE.maxTradeValueUsdt}`],
          ].map(([term, value]) => (
            <div key={term} className="border-t border-softwhite/15 px-2 py-4">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">{term}</dt>
              <dd className="mt-2 font-syslabel text-[18px] font-semibold leading-[22px]">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-center gap-4">
          <TenaxAgent state="watching" size={72} caption="READY" className="mascot-scale" />
          <p className="max-w-xl text-[14px] leading-[20px] text-softwhite/75">
            Expected terminal outcome: deterministic mandate REFUSE (40% exceeds 30%, $200 exceeds $150) —
            NO ORDER SENT — recorded as activity, proof, and paper-trading run.
          </p>
        </div>
      </AuthorityInstrument>

      <DemoRunner />

      <section aria-label="What this demo proves" className="tx-material-editorial border-t-2 border-ink pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">WHY A REFUSAL IS THE DEMO</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <ClearInstrument className="tx-observation-pane p-4">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AI PROPOSED</p>
            <p className="mt-2 text-[14px] font-bold leading-[20px]">A 40% / $200 protection action enters the gate.</p>
          </ClearInstrument>
          <ClearInstrument className="tx-observation-pane p-4">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MANDATE CHECKED</p>
            <p className="mt-2 text-[14px] font-bold leading-[20px]">Deterministic rules compare it against 30% / $150.</p>
          </ClearInstrument>
          <ClearInstrument className="tx-observation-pane p-4">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AUTHORITY REFUSED</p>
            <p className="mt-2 text-[14px] font-bold leading-[20px]">No order sent. The refusal itself is durable evidence.</p>
          </ClearInstrument>
        </div>
        <EvidenceStack>
          <p className="text-[14px] leading-[20px] text-mutedink">
            AI can propose. It cannot authorize itself. This demo exercises the same mandate gate,
            refusal seam, and evidence ledger as the live product — with fixture input instead of
            model output, so it needs no credentials and cannot trade.
          </p>
        </EvidenceStack>
      </section>

      <nav aria-label="Continue" className="flex flex-wrap items-center gap-2">
        <Link href="/app/paper-trading" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">
          PAPER-TRADING LOG <span className="btn-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/app/proof" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">
          PROOF LEDGER <span className="btn-arrow" aria-hidden="true">→</span>
        </Link>
      </nav>
      <ProvenanceStrip items={["CONTROLLED DEMO SCENARIO", "SIMULATED PORTFOLIO", JUDGE_DEMO_PROVENANCE]} />
    </div>
  );
}
