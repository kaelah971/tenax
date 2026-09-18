// Tenax Phase 1D — the signature Mandate Gate screen (server-rendered).
// Every check below was computed server-side by the deterministic engine;
// the page only displays. PASS never means executed — approval is a separate,
// explicit human act handled by the panel below.
import { notFound } from "next/navigation";

import { routeDevStore } from "@/app/api/protection/_dev-store";
import { DRY_RUN_PRE_NOTICE, refusalSentence } from "../../_copy";
import { Card, ChainSteps, CheckRow, Chip, GateCore, ProvenanceStrip } from "../../_components/ui";
import ApproveExecutePanel from "./ApproveExecutePanel";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = routeDevStore.flows.get(id);
  const context = flow?.getContext();
  const analysis = context?.analysis;
  if (!flow || !analysis) notFound();

  const decision = analysis.authority.mandateDecision;
  const passed = decision.verdict === "PASS";
  const alternative = analysis.consideredAlternative;

  return (
    <div className="flex flex-col gap-4 pt-6">
      <ChainSteps current="Mandate" />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
          Mandate Gate
        </h1>
        {passed ? <Chip tone="pass">MANDATE PASS</Chip> : <Chip tone="refused">MANDATE REFUSED</Chip>}
        <Chip tone="dryrun">DRY RUN</Chip>
      </div>

      <GateCore />

      <Card
        title={`Proposed protection — ${analysis.proposal.protectionPct}% / $${analysis.authority.calculatedTradeValueUsdt}`}
        meta="$500 NVIDIA / rNVDA exposure · one action, one approval"
        action={
          passed ? <Chip tone="dryrun">AWAITING HUMAN APPROVAL</Chip> : <Chip tone="refused">BLOCKED</Chip>
        }
      >
        <ul className="flex flex-col gap-2">
          {decision.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </ul>
        {!passed ? (
          <p className="mt-3 text-[16px] leading-[24px]">
            {refusalSentence(decision.failedRules)}
          </p>
        ) : null}
      </Card>

      {passed ? (
        <Card title="Human approval" meta="Explicit grant required before anything else">
          <ApproveExecutePanel flowId={id} tradeValueUsdt={analysis.authority.calculatedTradeValueUsdt} />
          <p className="mt-3 text-[13px] leading-[18px] text-muted">{DRY_RUN_PRE_NOTICE}</p>
        </Card>
      ) : null}

      <Card
        title="Rejected alternative"
        meta="Considered alongside the proposal · refused by the same gate"
        action={<Chip tone="refused">REFUSED</Chip>}
      >
        <p className="text-[13px] font-semibold leading-[18px]">
          ${alternative.proposal.proposedTradeValueUsdt} proposed trade · max trade $150
        </p>
        <p className="mt-1 text-[13px] leading-[18px]">
          {refusalSentence(alternative.decision.failedRules)}
        </p>
        <p className="mt-1 text-[11px] leading-[14px] text-muted">
          Failed rules: {alternative.decision.failedRules.join(", ")}
        </p>
      </Card>

      <ProvenanceStrip
        items={["LIVE BITGET DATA", "SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS", "DRY_RUN EXECUTION"]}
      />
    </div>
  );
}
