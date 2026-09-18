// Tenax Phase 1D — analysis view (server-rendered from the flow record).
// Renders the deterministic development analysis honestly: the reasoning
// layer is labeled DEVELOPMENT ANALYSIS, and every number that matters comes
// from the deterministic authority layer beside it.
import Link from "next/link";
import { notFound } from "next/navigation";

import { routeDevStore } from "@/app/api/protection/_dev-store";
import { Card, ChainSteps, Chip, ProvenanceStrip } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = routeDevStore.flows.get(id);
  const context = flow?.getContext();
  const analysis = context?.analysis;
  if (!flow || !analysis) notFound();

  return (
    <div className="flex flex-col gap-4 pt-6">
      <ChainSteps current="Intelligence" />
      <div>
        <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
          Assessment
        </h1>
        <p className="mt-2 text-[11px] leading-[14px] text-muted">Flow {id} · NVIDIA earnings</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Analysis layer"
          meta="Reasoning only — cannot authorize anything"
          action={<Chip tone="muted">DEVELOPMENT ANALYSIS</Chip>}
        >
          <p className="text-[16px] leading-[24px]">{analysis.reasoning.summary}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {analysis.reasoning.riskObservations.map((observation) => (
              <li
                key={observation}
                className="rounded-[10px] bg-cream px-3 py-2 text-[13px] leading-[18px]"
              >
                {observation}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] leading-[18px] text-muted">{analysis.reasoning.rationale}</p>
        </Card>

        <Card
          title="Deterministic authority"
          meta="Computed by code from mandate + exposure"
          action={
            analysis.authority.mandateDecision.verdict === "PASS" ? (
              <Chip tone="pass">MANDATE PASS</Chip>
            ) : (
              <Chip tone="refused">MANDATE REFUSED</Chip>
            )
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] leading-[18px]">
            <dt className="text-muted">Exposure</dt>
            <dd className="font-semibold">$500 NVIDIA / rNVDA</dd>
            <dt className="text-muted">Proposed protection</dt>
            <dd className="font-semibold">{analysis.proposal.protectionPct}%</dd>
            <dt className="text-muted">Calculated trade value</dt>
            <dd className="font-semibold">${analysis.authority.calculatedTradeValueUsdt}</dd>
            <dt className="text-muted">Human approval</dt>
            <dd className="font-semibold">
              {analysis.authority.approvalRequired ? "Required" : "Not required"}
            </dd>
            <dt className="text-muted">Execution eligible</dt>
            <dd className="font-semibold">
              {analysis.authority.executionEligible ? "Yes — after approval" : "No"}
            </dd>
          </dl>
          <div className="mt-4">
            <Link
              href={`/app/approval/${id}`}
              className="inline-flex h-12 items-center justify-center rounded-[10px] bg-deep px-6 text-[15px] font-semibold leading-[20px] text-white shadow-[0_8px_20px_rgba(78,128,232,0.25)] hover:bg-pressed"
            >
              Check mandate ↗
            </Link>
          </div>
        </Card>
      </div>

      <Card title="Evidence" meta="Real Bitget context references">
        <ul className="flex flex-col gap-1 text-[11px] leading-[14px] text-muted">
          {analysis.reasoning.evidenceRefs.map((ref) => (
            <li key={ref}>{ref}</li>
          ))}
        </ul>
      </Card>

      <ProvenanceStrip
        items={["LIVE BITGET DATA", "SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]}
      />
    </div>
  );
}
