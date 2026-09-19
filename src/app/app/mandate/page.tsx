// Tenax Phase 1D — persistent authority view (fixture configuration).
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { MANDATE_SUMMARY } from "../_copy";
import { Card, DecisionRail, ProvenanceStrip } from "../_components/ui";

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
      <DecisionRail current="MANDATE" />
      <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
        Mandate
      </h1>
      <Card
        title="Current authority"
        meta="The only permission the agent holds"
        action={<span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">◇ DEV · FIXTURE</span>}
      >
        <dl className="divide-y divide-ink/10 text-[13px] leading-[18px]">
          {rows.map(([term, value]) => (
            <div key={term} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
              <dt className="text-mutedink">{term}</dt>
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
