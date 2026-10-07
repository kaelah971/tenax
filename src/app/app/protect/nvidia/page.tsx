// Tenax Protect — intent, mandate authority, and one analysis action.
//
// The authority console derives every claim from the stored ACTIVE
// standing mandate when one exists — never fixture defaults presented
// as current authority. With no active mandate it states that honestly
// and routes to the builder.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { resolveAnalysisMode } from "@/lib/ai/provider.ts";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { MANDATE_FIXTURE } from "@/lib/tenax/fixtures";
import { getActiveStandingMandate } from "@/lib/tenax/service";
import { EVENT_UNAVAILABLE_LINE, INTENT_LINE, MANDATE_SUMMARY } from "../../_copy";
import { mandateSummaryPreview, standingAuthorityCopy } from "../../_copy";
import { AuthorityInstrument, SceneAnchor } from "../../_components/materials";
import { DecisionRail, ProvenanceStrip } from "../../_components/ui";
import { LiveDot, TenaxAgent } from "../../_components/living";
import AnalyzeButton from "./AnalyzeButton";

export const dynamic = "force-dynamic";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

export default async function ProtectPage() {
  const snapshot = await getDemoSnapshot();
  const marketOk = snapshot.availability !== "UNAVAILABLE";
  const activeMandate = getActiveStandingMandate(getTenaxDevStore());
  const authorityCopy = standingAuthorityCopy(activeMandate?.policy.authorityMode ?? null);
  // Authority console rows come from the stored ACTIVE policy when one
  // exists; otherwise they are labeled deterministic defaults — never
  // presented as current authority.
  const MANDATE_ROWS: Array<[string, string]> = activeMandate
    ? [
        ["MAX HEDGE", `${activeMandate.policy.maxProtectionPct}%`],
        ["MAX TRADE", `$${activeMandate.policy.maxNotionalUsdt}`],
        ["LEVERAGE", `MAX ${activeMandate.policy.maxLeverage}X`],
        ["APPROVAL", authorityCopy.approval],
        ["EXPOSURE", activeMandate.policy.subjectId],
      ]
    : [
        ["MAX HEDGE", `${MANDATE_FIXTURE.maxProtectionPct}%`],
        ["MAX TRADE", `$${MANDATE_FIXTURE.maxTradeValueUsdt}`],
        ["LEVERAGE", `MAX ${MANDATE_FIXTURE.maxLeverage}X`],
        ["APPROVAL", authorityCopy.approval],
        ["EXPOSURE", MANDATE_FIXTURE.allowedUnderlying],
      ];

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="INTENT" links={{ EXPOSURE: "/app/exposure/nvidia" }} />
      <section className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">INTENT · PROTECT_EVENT_RISK</p>
        <h1 className="mt-3 max-w-4xl text-[42px] font-extrabold leading-[0.92] tracking-[-0.04em] sm:text-[78px]">{INTENT_LINE}</h1>
        <p className="mt-5 max-w-xl text-[16px] leading-[24px] text-mutedink">State the outcome once. Tenax carries the limits forward to the authority boundary.</p>
      </section>

      <section aria-label="Mandate control surface" className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-end">
        <AuthorityInstrument as="div" className="rounded-[18px] p-5 text-softwhite sm:p-8">
          <div className="flex flex-wrap items-center gap-3"><p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">MANDATE_001 · AUTHORITY CONSOLE</p>{activeMandate ? (<span className="state-mark ml-auto text-signal"><LiveDot label={`AUTHORITY ACTIVE · ${activeMandate.policy.authorityMode.replaceAll("_", " ")}`} /></span>) : (<span className="state-mark ml-auto text-softwhite/70">NO ACTIVE AUTHORITY</span>)}</div>
          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-0 md:grid-cols-5">
            {MANDATE_ROWS.map(([term, value]) => <div key={term} className="border-t border-softwhite/15 px-2 py-4 first:border-t-0 sm:border-t sm:first:border-t"><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">{term}</dt><dd className="mt-2 text-[26px] font-extrabold leading-none tracking-[-0.03em]">{value}</dd></div>)}
          </dl>
          <div className="mt-3 h-px bg-softwhite/15" />
          {activeMandate ? (
            <div className="mt-6 flex max-w-2xl flex-col gap-1.5">
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
            <div className="mt-6 flex max-w-2xl flex-col gap-3">
              <p className="text-[16px] leading-[24px] text-softwhite/90">{MANDATE_SUMMARY}</p>
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">DETERMINISTIC DEFAULTS — NO STANDING AUTHORITY ACTIVE</p>
              <Link href="/app/mandate" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:self-start">
                CREATE STANDING MANDATE <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
          )}
          <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">{activeMandate ? `USER DEFINED · ${activeMandate.id.toUpperCase()}` : "◇ DEV · CONFIGURED VALUES"}</p>
        </AuthorityInstrument>
        <SceneAnchor className="tx-floating-mascot -mb-2 justify-self-end sm:-mr-4"><TenaxAgent state={marketOk ? "watching" : "waiting"} size={132} caption={marketOk ? "READY TO ANALYZE" : "WAITING"} className="mascot-scale" /></SceneAnchor>
      </section>

      {!marketOk ? <p role="alert" className="max-w-xl text-[16px] leading-[24px] text-clay">{EVENT_UNAVAILABLE_LINE}</p> : null}

      <AnalyzeButton rawText={RAW_TEXT} disabled={!marketOk} disabledReason={marketOk ? undefined : "Analysis needs live market context first."} />
      <nav aria-label="Continue" className="flex flex-wrap items-center gap-2">
        <Link href="/app/exposure/nvidia" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">
          VIEW EXPOSURE <span className="btn-arrow" aria-hidden="true">→</span>
        </Link>
        <Link href="/app/mandate" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite">
          VIEW MANDATE <span className="btn-arrow" aria-hidden="true">→</span>
        </Link>
      </nav>
      <ProvenanceStrip items={[marketOk ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO", resolveAnalysisMode(process.env) === "ai" ? "AI ANALYSIS" : "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
