// Tenax Phase 1D — persistent authority view (fixture configuration).
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { MANDATE_SUMMARY } from "../_copy";
import { Card, Chip, ProvenanceStrip } from "../_components/ui";

export default function MandatePage() {
  const rows: Array<[string, string]> = [
    ["Allowed exposure", MANDATE_FIXTURE.allowedUnderlying],
    ["Maximum hedge", `${MANDATE_FIXTURE.maxProtectionPct}% of position`],
    ["Maximum trade", `$${MANDATE_FIXTURE.maxTradeValueUsdt}`],
    ["Leverage", MANDATE_FIXTURE.leverageAllowed ? "Allowed" : "Disabled"],
    ["Human approval", MANDATE_FIXTURE.approvalRequired ? "Required" : "Not required"],
  ];

  return (
    <div className="flex flex-col gap-4 pt-6">
      <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
        Mandate
      </h1>
      <Card
        title="Current authority"
        meta="The only permission the agent holds"
        action={<Chip tone="muted">DEVELOPMENT FIXTURE</Chip>}
      >
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] leading-[18px] sm:grid-cols-2">
          {rows.map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{term}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[16px] leading-[24px]">{MANDATE_SUMMARY}</p>
      </Card>
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
