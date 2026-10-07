// Tenax Mandate — standing bounded authority, presentation + control.
// The canonical policy bounds below always apply; a standing mandate
// pre-authorizes a narrow class of protection actions within them.
// Creating drafts nothing — only ACTIVATE binds the mandate hash.
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { findReceiptFlowIdByMandate } from "@/lib/tenax/service";
import { MANDATE_SUMMARY, currentAuthorityCopy, mandateClassCardValues, mandateSummaryPreview } from "../_copy";
import { AuthorityInstrument } from "../_components/materials";
import { DecisionRail, JourneyNav, ProvenanceStrip, mandateJourney } from "../_components/ui";
import MandatePanel from "./MandatePanel";

export const dynamic = "force-dynamic";

/** Most recent flow carrying an analysis — the "current analysis" to return to. */
function latestAnalysisFlowId(): string | null {
  let latest: string | null = null;
  for (const [flowId, flow] of getTenaxDevStore().flows) {
    if (flow.getContext().analysis) latest = flowId;
  }
  return latest;
}

export default function MandatePage() {
  const store = getTenaxDevStore();
  const mandates = [...store.mandates.values()];
  const hasActiveMandate = mandates.some((m) => m.status === "ACTIVE");
  const activeMandate = mandates.find((m) => m.status === "ACTIVE") ?? null;
  const latestExhausted =
    [...mandates].reverse().find((m) => m.status === "EXHAUSTED") ?? null;
  const authority = currentAuthorityCopy({
    hasActiveMandate,
    hasExhaustedMandate: latestExhausted !== null,
    authorityMode: activeMandate?.policy.authorityMode ?? null,
  });
  // Current card reflects the actual relevant mandate — never fixed
  // fixture numbers once the user has defined their own authority.
  const rows: Array<[string, string]> = [
    ["Allowed exposure", MANDATE_FIXTURE.allowedUnderlying],
    [
      "Maximum hedge",
      `${activeMandate?.policy.maxProtectionPct ?? MANDATE_FIXTURE.maxProtectionPct}% of position`,
    ],
    [
      "Maximum trade",
      `$${activeMandate?.policy.maxNotionalUsdt ?? MANDATE_FIXTURE.maxTradeValueUsdt}`,
    ],
    ["Leverage", `max ${activeMandate?.policy.maxLeverage ?? MANDATE_FIXTURE.maxLeverage}x`],
    [authority.term, authority.value],
  ];
  const exhaustedReceiptFlowId =
    !hasActiveMandate && latestExhausted
      ? findReceiptFlowIdByMandate(store, latestExhausted.id)
      : null;
  const journey = mandateJourney(latestAnalysisFlowId(), exhaustedReceiptFlowId);

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail
        current="MANDATE"
        links={{ EXPOSURE: "/app/exposure/nvidia", INTENT: "/app/protect/nvidia" }}
      />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">MANDATE_001 · PERMISSION</p><h1 className="mt-3 font-display text-[52px] font-bold leading-[0.9] tracking-[-0.01em] sm:text-[92px]">Mandate</h1></div>
      <AuthorityInstrument as="section" className="rounded-[18px] p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">CURRENT AUTHORITY</p><p className="mt-2 text-[22px] font-extrabold leading-none">The only permission the agent holds.</p></div><span className="state-mark text-signal">{activeMandate ? "USER DEFINED" : "◇ DEV · FIXTURE"}</span></div>
        <dl className="mt-7 grid grid-cols-1 gap-0 sm:grid-cols-2">{rows.map(([term, value]) => <div key={term} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-softwhite/15 py-4"><dt className="text-[14px] leading-[20px] text-softwhite/60">{term}</dt><dd className="break-words text-right text-[20px] font-bold leading-[24px]">{value}</dd></div>)}</dl>
        {authority.note ? (
          <p className="mt-2 max-w-2xl text-[14px] leading-[20px] text-softwhite/70">{authority.note}</p>
        ) : null}
        {activeMandate ? (
          <div className="mt-5 flex max-w-2xl flex-col gap-1.5">
            {mandateSummaryPreview({
              maxProtectionPct: activeMandate.policy.maxProtectionPct,
              maxNotionalUsdt: activeMandate.policy.maxNotionalUsdt,
              maxExecutions: activeMandate.policy.maxExecutions,
              expiresAt: activeMandate.expiresAt,
              authorityMode: activeMandate.policy.authorityMode,
            }).map((line) => (
              <p key={line} className="text-[16px] leading-[24px] text-softwhite/90">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-5 max-w-2xl text-[16px] leading-[24px] text-softwhite/90">{MANDATE_SUMMARY}</p>
        )}
      </AuthorityInstrument>

      <AuthorityInstrument as="section" aria-label="Standing mandate" className="rounded-[18px] p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">STANDING MANDATE · PRE-AUTHORIZED CLASS</p><p className="mt-2 text-[22px] font-extrabold leading-none">NVIDIA PROTECTION MANDATE</p></div></div>
        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 min-[480px]:grid-cols-2 sm:grid-cols-3">
          {mandateClassCardValues(
            activeMandate === null
              ? null
              : {
                  maxProtectionPct: activeMandate.policy.maxProtectionPct,
                  maxNotionalUsdt: activeMandate.policy.maxNotionalUsdt,
                },
          ).map(([term, value]) => (
            <div key={term} className="min-w-0 border-t border-softwhite/15 pt-2">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                {term}
              </dt>
              <dd className="mt-1 break-words text-[16px] font-bold leading-[20px]">{value}</dd>
            </div>
          ))}
        </dl>
        {activeMandate === null ? (
          <p className="mt-3 max-w-2xl text-[13px] leading-[18px] text-softwhite/60">
            No active mandate — bounds show when a mandate is active. Define one below.
          </p>
        ) : null}
        <div className="mt-6 border-t border-softwhite/15 pt-6">
          <MandatePanel
            mandates={mandates}
            exhaustedReceiptHref={
              exhaustedReceiptFlowId ? `/app/receipts/${exhaustedReceiptFlowId}` : null
            }
          />
        </div>
      </AuthorityInstrument>
      <JourneyNav label="Continue" links={journey} />
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
