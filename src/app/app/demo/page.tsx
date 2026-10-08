// Tenax judge demo — one-click hosted authority flows.
//
// Runs complete Tenax authority cycles against controlled, explicitly
// labeled development-fixture scenarios: no credentials, no AI calls,
// no Bitget traffic, no MCP dependency. Each RUN button POSTs to the
// server, which executes real domain services and returns terminal
// evidence (refusal: activity + proof + run, NO_ORDER; execution:
// receipt + run, PREVIEW with submitted false).
import Link from "next/link";

import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { JUDGE_DEMO_PROVENANCE } from "@/lib/tenax/judge-demo";
import { AuthorityInstrument, ClearInstrument, EvidenceStack } from "../_components/materials";
import { DecisionRail, ProvenanceStrip } from "../_components/ui";
import { LiveDot, TenaxAgent } from "../_components/living";
import DemoRunner from "./DemoRunner";

export const dynamic = "force-dynamic";

const SCENARIOS = [
  {
    id: "refusal",
    eyebrow: "SCENARIO 1 · AUTHORITY STOP",
    title: "See Tenax refuse an action outside the mandate.",
    rows: [
      ["EXPOSURE", `$${NVDA_EXPOSURE_FIXTURE.exposureValueUsdt} SIMULATED NVIDIA`],
      ["EVENT", "NO VERIFIED EVENT · FIXTURE CONTEXT"],
      ["PROPOSAL", "PROTECT 40% · $200"],
      ["MANDATE MAX", `${MANDATE_FIXTURE.maxProtectionPct}% · $${MANDATE_FIXTURE.maxTradeValueUsdt}`],
      ["EXPECTED", "REFUSE · NO ORDER SENT"],
    ] as const,
    note: "Expected terminal outcome: deterministic mandate REFUSE (40% exceeds 30%, $200 exceeds $150) — recorded as activity, proof, and paper-trading run.",
  },
  {
    id: "execution",
    eyebrow: "SCENARIO 2 · AUTHORIZED EXECUTION",
    title: "See what happens when a proposal is within authority.",
    rows: [
      ["EXPOSURE", `$${NVDA_EXPOSURE_FIXTURE.exposureValueUsdt} SIMULATED NVIDIA`],
      ["EVENT", "NO VERIFIED EVENT · FIXTURE CONTEXT"],
      ["PROPOSAL", "PROTECT 20% · $100"],
      ["MANDATE MAX", `${MANDATE_FIXTURE.maxProtectionPct}% · $${MANDATE_FIXTURE.maxTradeValueUsdt}`],
      ["EXPECTED", "PASS · PREVIEW, NEVER SUBMITTED"],
    ] as const,
    note: "Expected terminal outcome: mandate PASS, standing authority authorizes, DRY_RUN preview recorded as receipt + run — submitted false, no funds moved.",
  },
] as const;

export default async function DemoPage() {
  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="INTENT" links={{ EXPOSURE: "/app/exposure/nvidia" }} />
      <section className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">JUDGE DEMO · CONTROLLED AUTHORITY FLOWS</p>
          <span className="state-mark border-ink text-ink">{JUDGE_DEMO_PROVENANCE}</span>
        </div>
        <h1 className="mt-3 max-w-3xl font-display text-[42px] font-bold leading-[0.95] tracking-[-0.01em] sm:text-[72px]">
          Run a complete Tenax authority flow.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-[24px] text-mutedink">
          Two scenarios run real Tenax domain services against controlled demo input:
          one refusal, one authorized preview. Nothing trades, nothing calls AI,
          nothing touches a provider.
        </p>
      </section>

      {SCENARIOS.map((scenario) => (
        <AuthorityInstrument
          key={scenario.id}
          as="section"
          aria-label={scenario.eyebrow}
          className="relative overflow-hidden rounded-[18px] p-5 sm:p-8"
        >
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">{scenario.eyebrow}</p>
            <span className="state-mark ml-auto text-signal"><LiveDot label="READY" /></span>
          </div>
          <h2 className="mt-3 max-w-2xl font-display text-[28px] font-bold leading-[0.95] sm:text-[40px]">
            {scenario.title}
          </h2>
          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-0 md:grid-cols-5">
            {scenario.rows.map(([term, value]) => (
              <div key={term} className="border-t border-softwhite/15 px-2 py-4">
                <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">{term}</dt>
                <dd className="mt-2 font-syslabel text-[16px] font-semibold leading-[20px]">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-center gap-4">
            <TenaxAgent state="watching" size={72} caption="READY" className="mascot-scale" />
            <p className="max-w-xl text-[14px] leading-[20px] text-softwhite/75">{scenario.note}</p>
          </div>
          <div className="mt-5">
            <DemoRunner
              scenario={scenario.id}
              buttonLabel={scenario.id === "refusal" ? "RUN REFUSAL DEMO" : "RUN EXECUTION DEMO"}
              idleNote="EACH RUN CREATES A NEW EXPLICIT DEMO FLOW — RETRIES NEVER DUPLICATE EXECUTION"
            />
          </div>
        </AuthorityInstrument>
      ))}

      <section aria-label="What this demo proves" className="tx-material-editorial border-t-2 border-ink pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">WHY THESE TWO STORIES</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <ClearInstrument className="tx-observation-pane p-4">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AI PROPOSED</p>
            <p className="mt-2 text-[14px] font-bold leading-[20px]">A protection action enters the gate — 40% / $200 or 20% / $100.</p>
          </ClearInstrument>
          <ClearInstrument className="tx-observation-pane p-4">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MANDATE CHECKED</p>
            <p className="mt-2 text-[14px] font-bold leading-[20px]">Deterministic rules compare it against 30% / $150.</p>
          </ClearInstrument>
          <ClearInstrument className="tx-observation-pane p-4">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AUTHORITY DECIDED</p>
            <p className="mt-2 text-[14px] font-bold leading-[20px]">Refusals stop with no order; passes preview without submitting.</p>
          </ClearInstrument>
        </div>
        <EvidenceStack>
          <p className="text-[14px] leading-[20px] text-mutedink">
            AI can propose. It cannot authorize itself. This demo exercises the same mandate gate,
            refusal seam, execution adapter, and evidence ledger as the live product — with fixture
            input instead of model output, so it needs no credentials and cannot trade.
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
