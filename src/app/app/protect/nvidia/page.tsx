// Tenax Phase 1D — protection intent + mandate configuration (server-rendered).
// Intent is locked to PROTECT_EVENT_RISK; mandate values are displayed as
// configured (fixture) rather than fully editable in this slice. Analysis
// itself always runs server-side via the analyze route.
import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { EVENT_UNAVAILABLE_LINE, INTENT_LINE, MANDATE_SUMMARY } from "../../_copy";
import { Card, ChainSteps, Chip, ProvenanceStrip } from "../../_components/ui";
import AnalyzeButton from "./AnalyzeButton";

export const dynamic = "force-dynamic";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

export default async function ProtectPage() {
  const snapshot = await getDemoSnapshot();
  const marketOk = snapshot.availability !== "UNAVAILABLE";

  const mandateRows: Array<[string, string]> = [
    ["Maximum hedge", `${MANDATE_FIXTURE.maxProtectionPct}% of position`],
    ["Maximum trade", `$${MANDATE_FIXTURE.maxTradeValueUsdt}`],
    ["Leverage", MANDATE_FIXTURE.leverageAllowed ? "Allowed" : "Disabled"],
    ["Human approval", MANDATE_FIXTURE.approvalRequired ? "Required" : "Not required"],
    ["Allowed exposure", MANDATE_FIXTURE.allowedUnderlying],
  ];

  return (
    <div className="flex flex-col gap-4 pt-6">
      <ChainSteps current="Intent" />
      <div>
        <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
          {INTENT_LINE}
        </h1>
        <p className="mt-2 max-w-xl text-[16px] leading-[24px] text-muted">
          One intent, one exposure. The mandate below is the only authority the agent gets.
        </p>
      </div>

      <Card
        title="Mandate configuration"
        meta="Configured values · editable controls arrive in a later slice"
        action={<Chip tone="muted">DEVELOPMENT FIXTURE</Chip>}
      >
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] leading-[18px] sm:grid-cols-2">
          {mandateRows.map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{term}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[13px] leading-[18px]">{MANDATE_SUMMARY}</p>
      </Card>

      {!marketOk ? (
        <Card title="Market context unavailable" action={<Chip tone="refused">UNAVAILABLE</Chip>}>
          <p className="text-[16px] leading-[24px]">{EVENT_UNAVAILABLE_LINE}</p>
        </Card>
      ) : null}

      <AnalyzeButton
        rawText={RAW_TEXT}
        disabled={!marketOk}
        disabledReason={marketOk ? undefined : "Analysis needs live market context first."}
      />

      <ProvenanceStrip
        items={[
          marketOk ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE",
          "SIMULATED PORTFOLIO",
          "DEVELOPMENT ANALYSIS",
        ]}
      />
    </div>
  );
}
