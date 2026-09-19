// Tenax Phase 1E-A — Capital dashboard (editorial composition).
// Same data, same provenance, same CTAs as Phase 1D: $500 SIMULATED
// exposure beside LIVE Bitget context, no fabricated earnings date.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { DATE_UNAVAILABLE_LINE, EVENT_UNAVAILABLE_LINE } from "../app/_copy";
import { DecisionRail, formatCompact, formatMarketTime, ProvenanceStrip } from "./_components/ui";
import { LiveDot, Sparkline, TenaxAgent } from "./_components/living";

export const dynamic = "force-dynamic";

export default async function CapitalPage() {
  const snapshot = await getDemoSnapshot();
  const live = snapshot.availability !== "UNAVAILABLE";
  const ticker = snapshot.ticker.data;
  const instrument = snapshot.instrument.data;
  const sessionState = snapshot.sessions.data?.currentState ?? "UNKNOWN";

  return (
    <div className="anim-rise flex flex-col gap-10 pt-8 sm:pt-12">
      <div className="flex flex-wrap items-center gap-3">
        <DecisionRail current="EXPOSURE" />
        <span
          className="font-syslabel ml-auto text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink"
          title={live ? snapshot.fetchedAt : undefined}
        >
          {live ? `MARKET DATA · ${formatMarketTime(snapshot.fetchedAt)}` : "MARKET OFFLINE"}
        </span>
      </div>

      <div>
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          CAPITAL_001
        </p>
        <h1 className="mt-3 max-w-3xl text-[40px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[76px]">
          What should your capital do?
        </h1>
      </div>

      <section aria-label="Primary exposure" className="material-instrument float-lift relative overflow-hidden p-6 sm:p-10">
        <Sparkline className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-[120px] w-full -translate-y-1/4 opacity-40 sm:block" />
        <div className="relative flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            NVIDIA EXPOSURE · CAPITAL_001
          </p>
          {live ? (
            <span className="state-mark ml-auto bg-signal text-ink">
              <LiveDot label={`LIVE · ${instrument?.status?.toUpperCase() ?? "—"}`} />
            </span>
          ) : (
            <span className="font-syslabel ml-auto text-[11px] uppercase leading-[14px] tracking-[0.08em] text-clay">
              ○ MARKET OFFLINE
            </span>
          )}
        </div>
        <div className="relative mt-2 flex flex-col-reverse items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[72px] font-extrabold leading-none tracking-[-0.03em] drop-shadow-[0_12px_28px_rgba(17,17,17,0.2)] sm:text-[128px]">
              $500
            </p>
            <p className="font-syslabel mt-4 text-[11px] uppercase leading-[18px] tracking-[0.08em]">
              <span className="font-bold text-ink">rNVDA · BITGET REALITY</span>
            </p>
          </div>
          <TenaxAgent state="watching" size={148} caption="WATCHING YOUR NVIDIA EXPOSURE" className="mascot-scale" />
        </div>
        <Sparkline className="relative mt-4 h-[64px] w-full sm:hidden" />
        <p className="font-syslabel relative mt-4 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          ○ DEMO · SIMULATED PORTFOLIO — NOT A LIVE POSITION
        </p>
        <div className="relative mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/app/protect/nvidia"
            className="btn-living inline-flex min-h-12 flex-1 items-center justify-center rounded-[12px] bg-signal px-6 py-4 text-center text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:flex-none sm:px-10"
          >
            PROTECT THROUGH EARNINGS <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
          <Link
            href="/app/exposure/nvidia"
            className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] border-2 border-ink px-6 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] hover:bg-ink hover:text-softwhite"
          >
            VIEW EXPOSURE
          </Link>
        </div>
        <div aria-label="Live market signal" className="material-authority relative mt-8 p-5 text-softwhite sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
              LIVE_SIGNAL · RNVDAUSDT · BITGET REALITY
            </p>
            {live ? (
              <span className="state-mark ml-auto text-signal">
                <LiveDot label="LIVE" />
              </span>
            ) : null}
          </div>
          {live ? (
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
              <div className="border-t instrument-divider pt-3">
                <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">LAST</p>
                <p className="value-live signal-glow mt-1 text-[44px] font-extrabold leading-none tracking-[-0.02em] text-signal sm:text-[56px]" key={ticker?.lastPrice ?? "none"}>
                  {ticker?.lastPrice ? `$${ticker.lastPrice}` : "—"}
                </p>
              </div>
              <div className="border-t instrument-divider pt-3">
                <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">24H RANGE</p>
                <p className="mt-1 text-[20px] font-bold leading-[24px]">
                  {ticker?.lowPrice24h && ticker?.highPrice24h
                    ? `$${ticker.lowPrice24h} – $${ticker.highPrice24h}`
                    : "—"}
                </p>
              </div>
              <div className="border-t instrument-divider pt-3">
                <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">SESSION</p>
                <p className="mt-1 text-[20px] font-bold leading-[24px]">
                  {sessionState === "UNKNOWN" ? "— AWAITING SIGNAL" : sessionState}
                </p>
                {sessionState === "UNKNOWN" ? (
                  <p className="mt-1 text-[11px] leading-[14px] text-softwhite/60">
                    No authoritative session marker from Bitget.
                  </p>
                ) : null}
              </div>
              <div className="border-t instrument-divider pt-3">
                <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">VOL 24H</p>
                <p className="mt-1 text-[20px] font-bold leading-[24px]">{formatCompact(ticker?.volume24h ?? null)}</p>
              </div>
            </div>
          ) : (
            <p className="mt-4 max-w-xl text-[16px] leading-[24px]">{EVENT_UNAVAILABLE_LINE}</p>
          )}
        </div>
      </section>

      <section aria-label="Earnings event" className="material-authority relative overflow-hidden p-5 text-softwhite sm:p-8">
        <svg
          className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 text-signal"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.3" />
          <circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.45" strokeDasharray="4 5" className="tx-agent-orbit" />
          <circle cx="50" cy="50" r="13" fill="currentColor" opacity="0.9" />
          <circle cx="50" cy="50" r="21" fill="none" stroke="currentColor" strokeWidth="1" className="radar-ring" />
          <circle cx="50" cy="50" r="21" fill="none" stroke="currentColor" strokeWidth="1" className="radar-ring radar-ring-delay" />
        </svg>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
            EVENT_01
          </p>
          <h2 className="text-[30px] font-extrabold leading-none tracking-[-0.02em] sm:text-[44px]">
            NVIDIA EARNINGS
          </h2>
          <span className="state-mark ml-auto text-signal">
            <LiveDot label="WATCHING" />
          </span>
        </div>
        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          <div className="border-t instrument-divider pt-3">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">CAPITAL AT RISK</dt>
            <dd className="mt-1 text-[28px] font-extrabold leading-none">$500</dd>
          </div>
          <div className="border-t instrument-divider pt-3">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">DATE</dt>
            <dd className="mt-1 text-[28px] font-extrabold leading-none">UNVERIFIED</dd>
            <dd className="mt-1 text-[11px] leading-[14px] text-softwhite/60">{DATE_UNAVAILABLE_LINE}</dd>
          </div>
          <div className="border-t instrument-divider pt-3">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">STATUS</dt>
            <dd className="signal-glow mt-1 text-[28px] font-extrabold leading-none text-signal">WATCHING</dd>
            <dd className="mt-1 text-[11px] leading-[14px] text-softwhite/60">
              {NVDA_EXPOSURE_FIXTURE.underlying} via {NVDA_EXPOSURE_FIXTURE.representation.symbol}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Link
            href="/app/protect/nvidia"
            className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] bg-signal px-8 py-3.5 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95"
          >
            PROTECT THIS POSITION <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <ProvenanceStrip
        items={[
          live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE",
          "SIMULATED PORTFOLIO",
          "DRY_RUN EXECUTION",
        ]}
      />
    </div>
  );
}
