// Tenax Analysis — live decision cockpit, presentation only.
//
// Compact operating surface: interpretation → live protection market →
// decision chain → evidence → authority → action → journey. The live
// NVDAUSDT market is the same shared panel as the exposure surface (one
// implementation, real candles, polling ticker/position, no credentials in
// props). Pre-cycle projection derives from canonical read-only state and
// is labeled as such — the authoritative cumulative check runs at cycle
// time. Nothing here executes, approves, or authorizes.
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { resolveCandleInterval } from "@/lib/bitget/market-series";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import {
  evaluateStandingAuthorityForProposal,
  getActiveStandingMandate,
  getExposureGraph,
} from "@/lib/tenax/service";
import { getDemoSurfaceView } from "@/lib/tenax/demo-surface";
import {
  evidenceSummary,
  EXPOSURE_REFERENCE,
  finalActionState,
  FOCUS_VIEWPORT,
  surfaceProjection,
} from "@/lib/tenax/visuals";
import {
  cumulativeRefusalSentence,
  projectionStatusCopy,
  refusalSentence,
  standingAuthorityCopy,
} from "../../_copy";
import ProtectionMarketPanel from "../../_components/protection-market";
import { LightInstrument, SceneAnchor } from "../../_components/materials";
import {
  analysisIntervalHref,
  analysisJourney,
  DecisionRail,
  JourneyNav,
  ProvenanceStrip,
} from "../../_components/ui";
import { LiveDot, TenaxAgent, staggerStyle } from "../../_components/living";
import RunAgentPanel from "./RunAgentPanel";

export const dynamic = "force-dynamic";

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ interval?: string }>;
}) {
  const { id } = await params;
  const { interval: rawInterval } = await searchParams;
  const interval = resolveCandleInterval(rawInterval);
  const store = getTenaxDevStore();
  const flow = store.flows.get(id);
  const context = flow?.getContext();
  const analysis = context?.analysis;
  if (!flow || !analysis) notFound();
  const isModel = analysis.reasoning.kind === "model";
  const audit = context?.aiAudit ?? null;
  const standingMandate = getActiveStandingMandate(store);
  const authorityCopy = standingAuthorityCopy(standingMandate?.policy.authorityMode ?? null);
  // Agent-cycle eligibility (any actionable proposal, model or fixture):
  // policy PASS plus a fresh standing AUTHORIZED. Display only.
  const actionableProposal =
    analysis.proposal.protectionPct > 0 && analysis.authority.calculatedTradeValueUsdt > 0;
  const policyPass = analysis.authority.mandateDecision.verdict === "PASS";
  const runAuthority =
    actionableProposal && policyPass
      ? evaluateStandingAuthorityForProposal(store, {
          underlying: analysis.proposal.underlying,
          protectionPct: analysis.proposal.protectionPct,
          tradeValueUsdt: analysis.authority.calculatedTradeValueUsdt,
          leverageUsed: analysis.proposal.leverageUsed,
        })
      : null;
  const hasReceipt = flow.getFlowState() === "COMPLETED";

  const [surface, snapshot, graphView] = await Promise.all([
    getDemoSurfaceView(),
    getDemoSnapshot(),
    getExposureGraph(store, { discoveryTimeoutMs: 4000 }),
  ]);
  const grossUsd = (context?.exposure ?? NVDA_EXPOSURE_FIXTURE).exposureValueUsdt;
  const proposedUsd = analysis.authority.calculatedTradeValueUsdt;
  // Pre-cycle projection against the STANDING policy ceiling when a
  // mandate is active (B3 policies may differ from the fixture).
  const projectionMaxPct =
    standingMandate?.policy.maxProtectionPct ?? MANDATE_FIXTURE.maxProtectionPct;
  const projection = surfaceProjection(
    surface.position,
    proposedUsd,
    grossUsd,
    projectionMaxPct,
  );
  const evidence = evidenceSummary({
    realityAvailable: snapshot.availability !== "UNAVAILABLE",
    futuresAvailable: surface.ticker !== null,
    nvdaxAvailable: graphView.nvdax ? true : false,
  });

  // ONE final actionable state, safety-first precedence: a later
  // deterministic gate (cumulative projection) overrides an earlier
  // AUTHORIZED. Display derivation only — execution gates unchanged.
  const modelDecision = isModel ? (audit?.decision ?? null) : null;
  const finalState = finalActionState({
    wait: modelDecision === "WAIT",
    actionable: actionableProposal,
    policyPass,
    standingDecision: runAuthority?.decision ?? null,
    cumulativeOverLimit: projection.overLimit,
    authorityMode: standingMandate?.policy.authorityMode ?? null,
  });

  // Refusal wording for the FINAL block, mirroring the same precedence.
  const mandateFailedRules = analysis.authority.mandateDecision.failedRules;
  let refusalCode: string | null = null;
  let refusalText: string | null = null;
  if (finalState === "REFUSED") {
    if (!policyPass) {
      refusalCode = mandateFailedRules.join(" · ") || "mandate_refused";
      refusalText = refusalSentence(mandateFailedRules);
    } else if (runAuthority?.decision === "REFUSED") {
      refusalCode = runAuthority.reasonCodes.join(" · ") || "standing_refused";
      refusalText = "Standing authority refused this action. No order sent.";
    } else if (projection.overLimit === true) {
      refusalCode = "projected_protection_exceeds_mandate";
      refusalText = cumulativeRefusalSentence(refusalCode);
    } else {
      refusalCode =
        projection.unknownReason === "unreadable"
          ? "position_unreadable"
          : projection.unknownReason === "unvalued"
            ? "position_unvalued"
            : "unknown";
      refusalText = cumulativeRefusalSentence(refusalCode);
    }
  }
  const unknownCode =
    projection.unknownReason === "unreadable"
      ? "position_unreadable"
      : projection.unknownReason === "unvalued"
        ? "position_unvalued"
        : "unknown";

  const journey = analysisJourney({ flowId: id, hasReceipt });

  return (
    <div className="tx-observatory-entry flex flex-col gap-5 pt-6 sm:gap-6 sm:pt-8">
      <DecisionRail
        current="INTELLIGENCE"
        links={{
          EXPOSURE: "/app/exposure/nvidia",
          INTENT: "/app/protect/nvidia",
          MANDATE: `/app/approval/${id}`,
          RECEIPT: hasReceipt ? `/app/receipts/${id}` : null,
        }}
      />

      {/* Decision header — compact interpretation */}
      <section className="tx-material-editorial border-t-2 border-ink pt-4 sm:pt-5">
        <div className="flex items-start justify-between gap-4">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            TENAX INTERPRETATION · FLOW {id}
          </p>
          <span className={`state-mark shrink-0 ${isModel ? "bg-signal text-ink" : "bg-ink text-signal"}`}>
            {isModel ? "AI ANALYSIS" : "◇ DEV · DEVELOPMENT ANALYSIS"}
          </span>
        </div>
        <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <h1 className="max-w-3xl text-[34px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[52px]">
            The situation, interpreted.
          </h1>
          <SceneAnchor className="tx-floating-mascot hidden shrink-0 sm:block">
            <TenaxAgent state="analyzing" size={84} caption="ASSEMBLING" />
          </SceneAnchor>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 border-t border-ink/15 pt-3">
          <div className="min-w-0">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              $500 NVIDIA exposure
            </dt>
            <dd className="mt-1 truncate text-[26px] font-extrabold leading-none tracking-[-0.02em] sm:text-[34px]">
              $500
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              PROTECT {analysis.proposal.protectionPct}%
            </dt>
            <dd className="mt-1 truncate text-[26px] font-extrabold leading-none tracking-[-0.02em] sm:text-[34px]">
              {analysis.proposal.protectionPct}%
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              Proposed action
            </dt>
            <dd className="mt-1 truncate text-[26px] font-extrabold leading-none tracking-[-0.02em] sm:text-[34px]">
              ${proposedUsd}
            </dd>
          </div>
        </dl>
        <p className="mt-3 max-w-2xl text-[17px] font-bold leading-[24px]">{analysis.reasoning.summary}</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {analysis.reasoning.riskObservations.map((observation, i) => (
            <li
              key={observation}
              style={staggerStyle(i)}
              className="border-l-2 border-ink py-0.5 pl-3 text-[14px] leading-[20px]"
            >
              {observation}
            </li>
          ))}
        </ul>
        <p className="mt-2 max-w-2xl text-[14px] leading-[20px] text-mutedink">
          {analysis.reasoning.rationale}
        </p>
      </section>

      {/* Live protection market — the market the agent reasons around.
          Centered terminal via the shared focus viewport. */}
      <ProtectionMarketPanel
        compact
        interval={interval}
        intervalHref={(tf) => analysisIntervalHref(id, tf)}
        surface={surface}
        viewport={FOCUS_VIEWPORT}
      />

      {/* Exposure reference — small context, never owned */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[10px] border border-dashed border-ink/40 px-3.5 py-2.5">
        <p className="font-syslabel text-[11px] uppercase leading-[15px] tracking-[0.08em] text-mutedink">
          EXPOSURE REFERENCE
        </p>
        <p className="text-[14px] font-extrabold leading-[19px]">
          {EXPOSURE_REFERENCE.symbol} · {EXPOSURE_REFERENCE.venue}
        </p>
        <p className="font-syslabel text-[11px] uppercase leading-[15px] tracking-[0.06em] text-mutedink">
          $500 SIMULATED · NOT OWNED LIVE
        </p>
      </div>

      {/* Decision chain — recommendation → existing → projected → mandate */}
      <LightInstrument className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            DECISION CHAIN · RECOMMENDATION → PROTECTION → MANDATE
          </p>
          <span className="state-mark ml-auto bg-signal text-ink">
            <LiveDot label="LIVE PROJECTION" />
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink/15 pt-3 sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              EXISTING
            </dt>
            <dd className="mt-1 truncate text-[20px] font-extrabold leading-none">
              {projection.existingUsd === null
                ? "UNKNOWN"
                : projection.existingUsd === 0
                  ? "$0 · NONE OPEN"
                  : `~${formatUsd(projection.existingUsd)}`}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              PROPOSED
            </dt>
            <dd className="mt-1 truncate text-[20px] font-extrabold leading-none">
              ${proposedUsd} · {analysis.proposal.protectionPct}%
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              PROJECTED
            </dt>
            <dd className="mt-1 truncate text-[20px] font-extrabold leading-none">
              {projection.projectedUsd === null || projection.projectedPct === null
                ? "UNKNOWN"
                : `~${formatUsd(projection.projectedUsd)} · ~${projection.projectedPct.toFixed(1)}%`}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              MANDATE MAX
            </dt>
            <dd className="mt-1 truncate text-[20px] font-extrabold leading-none">
              {projectionMaxPct}%
            </dd>
          </div>
        </dl>
        <p
          className={`font-syslabel mt-3 text-[11px] uppercase leading-[18px] tracking-[0.08em] ${
            projection.overLimit === true ? "font-bold text-clay" : "text-mutedink"
          }`}
        >
          {projectionStatusCopy({
            overLimit: projection.overLimit,
            authorityMode: standingMandate?.policy.authorityMode ?? null,
            finalState,
          })}
        </p>
        <p className="font-syslabel mt-1 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
          DETERMINISTIC PROJECTION · NOT AN AI DECISION
        </p>
      </LightInstrument>

      {/* FINAL TENAX DECISION — one actionable state, safety-first precedence.
          AUTHORIZED renders only when every known deterministic gate is
          clear; anything later (cumulative projection) overrides it. */}
      <section aria-label="Final Tenax decision" className="tx-material-editorial border-t-2 border-ink pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            FINAL TENAX DECISION
          </p>
          {standingMandate ? (
            <span className="font-syslabel ml-auto text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              {standingMandate.policy.authorityMode.replaceAll("_", " ")} ·{" "}
              {standingMandate.id.toUpperCase()}
            </span>
          ) : null}
        </div>
        <p className="font-syslabel mt-2 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
          {authorityCopy.title} · {authorityCopy.lines.join(" · ")}
        </p>

        {finalState === "AUTHORIZED" ? (
          <div className="mt-3 flex flex-col gap-3">
            <p>
              <span className="state-mark bg-signal text-ink">TENAX AUTHORIZED</span>
            </p>
            <p className="max-w-2xl text-[18px] font-bold leading-[26px]">
              Inside your active standing mandate.
            </p>
            <RunAgentPanel flowId={id} />
          </div>
        ) : null}

        {finalState === "REFUSED" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p>
              <span className="state-mark bg-clay text-softwhite">TENAX REFUSED</span>
            </p>
            <p className="max-w-2xl text-[18px] font-bold leading-[26px]">{refusalText}</p>
            <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              Reason: {refusalCode}
            </p>
            <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              NO ORDER SENT
            </p>
            <nav aria-label="Refused next steps" className="mt-1 flex flex-wrap items-center gap-2">
              <Link
                href="/app/mandate"
                className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite"
              >
                VIEW MANDATE <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
              <Link
                href="/app/exposure/nvidia"
                className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite"
              >
                VIEW EXPOSURE <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
            </nav>
          </div>
        ) : null}

        {finalState === "ESCALATE" ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              HUMAN REVIEW REQUIRED
            </p>
            <p className="max-w-2xl text-[18px] font-bold leading-[26px]">
              Standing authority escalated — no autonomous action taken.
            </p>
            <div>
              <Link
                href={`/app/approval/${id}`}
                className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:self-start"
              >
                REVIEW ACTION <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ) : null}

        {finalState === "NO_MANDATE" ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="max-w-2xl text-[18px] font-bold leading-[26px]">
              This action needs a standing mandate before Tenax can run it.
            </p>
            <div>
              <Link
                href="/app/mandate"
                className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:self-start"
              >
                CREATE STANDING MANDATE <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ) : null}

        {finalState === "WAIT" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p>
              <span className="state-mark border-ink text-ink">TENAX WAITING</span>
            </p>
            <p className="max-w-2xl text-[18px] font-bold leading-[26px]">
              No protection action recommended — nothing to execute.
            </p>
          </div>
        ) : null}

        {finalState === "NO_ACTION" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="max-w-2xl text-[18px] font-bold leading-[26px]">
              No action — nothing to execute.
            </p>
          </div>
        ) : null}

        {finalState === "UNKNOWN" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p>
              <span className="state-mark bg-clay text-softwhite">TENAX REFUSED</span>
            </p>
            <p className="max-w-2xl text-[18px] font-bold leading-[26px]">
              Protection state unknown — Tenax fails closed.
            </p>
            <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              Reason: {unknownCode}
            </p>
            <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              NO ORDER SENT
            </p>
            <nav aria-label="Unknown-state next steps" className="mt-1 flex flex-wrap items-center gap-2">
              <Link
                href="/app/mandate"
                className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite"
              >
                VIEW MANDATE <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
              <Link
                href="/app/exposure/nvidia"
                className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 bg-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] hover:bg-ink hover:text-softwhite"
              >
                VIEW EXPOSURE <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
            </nav>
          </div>
        ) : null}
      </section>

      {/* Evidence — meaning first, plumbing behind disclosure */}
      <section aria-label="Evidence used" className="tx-material-editorial border-t-2 border-ink pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          EVIDENCE USED
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
          {evidence.map((row) => (
            <div key={row.label} className="min-w-0 border-t border-ink/15 pt-2">
              <dt className="font-syslabel truncate text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                {row.label}
              </dt>
              <dd
                className={`mt-1 truncate text-[14px] font-bold leading-[18px] ${
                  row.status === "UNAVAILABLE" ? "text-clay" : ""
                }`}
              >
                {row.status}
              </dd>
            </div>
          ))}
        </dl>
        <details className="mt-3 rounded-[12px] border border-ink/15 p-4">
          <summary className="font-syslabel cursor-pointer text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
            VIEW TECHNICAL EVIDENCE
          </summary>
          <ul className="mt-2.5 flex flex-col gap-1.5 text-[11px] leading-[14px] text-mutedink">
            {analysis.reasoning.evidenceRefs.map((ref) => (
              <li key={ref}>▸ {ref}</li>
            ))}
          </ul>
          {audit ? (
            <>
              <p className="font-syslabel mt-3 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                AUDIT · MODEL ANALYSIS RECORD
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {[
                ["DECISION", audit.decision],
                ["RECOMMENDED", audit.recommendedProtectionPct === null ? "NONE" : `${audit.recommendedProtectionPct}%`],
                ["PROVIDER", audit.provider],
                ["MODEL", audit.model],
                ["GENERATED", audit.generatedAt],
                ["EVIDENCE HASH", audit.evidencePackHash.slice(0, 16)],
                ["OUTPUT HASH", audit.outputHash.slice(0, 16)],
                ["DRIVERS", audit.keyDrivers.join(" · ") || "—"],
                ["RISKS", audit.risks.join(" · ") || "—"],
                ["MISSING", audit.missingEvidence.join(" · ") || "—"],
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="flex min-w-0 flex-wrap items-baseline justify-between gap-4 border-t border-ink/10 py-2"
                >
                  <dt className="font-syslabel shrink-0 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                    {term}
                  </dt>
                  <dd className="break-words text-right text-[12px] font-bold leading-[17px]">{value}</dd>
                </div>
              ))}
              </dl>
            </>
          ) : null}
        </details>
      </section>

      {/* Action lives in FINAL TENAX DECISION above — one state, one path. */}

      <JourneyNav links={journey} label="Continue" />
      <ProvenanceStrip
        items={["LIVE BITGET DATA", "SIMULATED PORTFOLIO", isModel ? "AI ANALYSIS" : "DEVELOPMENT ANALYSIS"]}
      />
    </div>
  );
}
