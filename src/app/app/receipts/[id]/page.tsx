// Tenax Phase 1D — Decision Receipt (server-rendered, highly demoable).
// Snapshots the full chain: exposure → intent → intelligence → proposal →
// mandate → approval → action. Would-be request shown; no orderId or
// transaction hash exists anywhere in this mode.
import { notFound } from "next/navigation";

import { getDecisionReceipt } from "@/lib/tenax/service";
import { routeDevStore } from "@/app/api/protection/_dev-store";
import { NOT_ADVICE } from "../../_copy";
import { Card, Chip, DecisionRail, ProvenanceStrip } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let receipt;
  try {
    ({ receipt } = getDecisionReceipt(routeDevStore, id));
  } catch {
    notFound();
  }

  const rows: Array<[string, string]> = [
    ["Exposure", `NVIDIA / RNVDAUSDT · $${receipt.exposureValueUsdt}`],
    ["Intent", receipt.intent],
    ["Protection", `${receipt.proposedProtectionPct}%`],
    ["Trade value", `$${receipt.proposedTradeValueUsdt}`],
    ["Mandate", receipt.mandateResult],
    ["Human approval", receipt.approval],
    ["Execution mode", receipt.executionMode],
    ["Funds moved", receipt.fundsMoved ? "YES" : "NO"],
  ];

  return (
    <div className="flex flex-col gap-4 pt-6">
      <DecisionRail current="RECEIPT" />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
          Decision Receipt
        </h1>
        <Chip tone="pass">{receipt.mandateResult}</Chip>
        <Chip tone="dryrun">DRY RUN</Chip>
      </div>
      <p className="text-[11px] leading-[14px] text-muted">
        {receipt.receiptId} · {receipt.timestamp}
      </p>

      <Card title="Decision chain" meta="What was considered, allowed, rejected, previewed">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] leading-[18px] sm:grid-cols-2">
          {rows.map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{term}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card
        title="Would-be Bitget request"
        meta="Preview only — never submitted"
        action={<Chip tone="dryrun">NOT SUBMITTED</Chip>}
      >
        <pre className="overflow-x-auto rounded-[10px] bg-cream p-3 text-[11px] leading-[14px]">
          {JSON.stringify(receipt.request, null, 2)}
        </pre>
      </Card>

      <Card
        title="Rejected alternative"
        meta="Refusal is a feature — restraint with a recorded reason"
        action={<Chip tone="refused">REFUSED</Chip>}
      >
        {receipt.rejectedAlternatives.map((alternative) => (
          <div key={alternative.proposedTradeValueUsdt} className="text-[13px] leading-[18px]">
            <p className="font-semibold">
              ${alternative.proposedTradeValueUsdt} → {alternative.mandateResult}_
              {alternative.failedRules.join(", ")}
            </p>
            <p className="mt-1">{alternative.reason}</p>
          </div>
        ))}
      </Card>

      <Card title="Mandate checks" meta="Deterministic rule results">
        <ul className="flex flex-col gap-1 text-[13px] leading-[18px]">
          {receipt.mandateChecks.map((check) => (
            <li key={check.id} className="flex items-baseline justify-between gap-3">
              <span className="text-muted">{check.id}</span>
              <span className="font-semibold">{check.detail}</span>
            </li>
          ))}
        </ul>
      </Card>

      <ProvenanceStrip
        items={[
          "LIVE BITGET DATA",
          "SIMULATED PORTFOLIO",
          "DEVELOPMENT ANALYSIS",
          "DRY_RUN EXECUTION",
        ]}
      />
      <p className="text-[11px] leading-[14px] text-muted">{NOT_ADVICE}</p>
    </div>
  );
}
