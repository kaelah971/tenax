// Tenax Phase 1E-A — Capital dashboard (editorial composition).
// Same data, same provenance, same CTAs as Phase 1D: $500 SIMULATED
// exposure beside LIVE Bitget context, no fabricated earnings date.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { DATE_UNAVAILABLE_LINE, EVENT_UNAVAILABLE_LINE } from "../app/_copy";
import { DecisionRail, formatCompact, formatMarketTime, ProvenanceStrip } from "./_components/ui";

export const dynamic = "force-dynamic";

export default async function CapitalPage() {
  const snapshot = await getDemoSnapshot();
  const live = snapshot.availability !== "UNAVAILABLE";
  const ticker = snapshot.ticker.data;
  const instrument = snapshot.instrument.data;
  const sessionState = snapshot.sessions.data?.currentState ?? "UNKNOWN";

  return (
    <div className="anim-rise flex flex-col gap-8 pt-8 sm:pt-12">
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

      <section aria-label="Primary exposure">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          NVIDIA EXPOSURE
        </p>
        <p className="mt-1 text-[56px] font-extrabold leading-none tracking-[-0.03em] sm:text-[104px]">
          $500
        </p>
        <p className="font-syslabel mt-3 text-[11px] uppercase leading-[18px] tracking-[0.08em]">
          <span className="bg-signal px-1.5 py-0.5 font-bold text-ink">rNVDA · BITGET REALITY</span>{" "}
          <span className={live ? "text-ink" : "text-clay"}>
            {live ? `● LIVE MARKET · ${instrument?.status?.toUpperCase() ?? "—"}` : "○ MARKET OFFLINE"}
          </span>
        </p>
        <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          ○ DEMO · SIMULATED PORTFOLIO — NOT A LIVE POSITION
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/app/protect/nvidia"
            className="inline-flex min-h-12 flex-1 items-center justify-center bg-signal px-6 py-4 text-center text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:flex-none sm:px-10"
          >
            PROTECT THROUGH EARNINGS →
          </Link>
          <Link
            href="/app/exposure/nvidia"
            className="inline-flex min-h-12 items-center justify-center border-2 border-ink px-6 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] hover:bg-ink hover:text-softwhite"
          >
            VIEW EXPOSURE
          </Link>
        </div>
      </section>

      <section aria-label="Live market signal" className="rounded-[2px] bg-graphite p-5 text-softwhite sm:p-8">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          LIVE_SIGNAL · RNVDAUSDT · BITGET REALITY
        </p>
        {live ? (
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <div>
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">LAST</p>
              <p className="mt-1 text-[36px] font-extrabold leading-none tracking-[-0.02em] text-signal">
                {ticker?.lastPrice ? `$${ticker.lastPrice}` : "—"}
              </p>
            </div>
            <div>
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">24H RANGE</p>
              <p className="mt-1 text-[20px] font-bold leading-[24px]">
                {ticker?.lowPrice24h && ticker?.highPrice24h
                  ? `$${ticker.lowPrice24h} – $${ticker.highPrice24h}`
                  : "—"}
              </p>
            </div>
            <div>
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
            <div>
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">VOL 24H</p>
              <p className="mt-1 text-[20px] font-bold leading-[24px]">{formatCompact(ticker?.volume24h ?? null)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 max-w-xl text-[16px] leading-[24px]">{EVENT_UNAVAILABLE_LINE}</p>
        )}
      </section>

      <section aria-label="Earnings event" className="rounded-[2px] bg-ink p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
            EVENT_01
          </p>
          <h2 className="text-[30px] font-extrabold leading-none tracking-[-0.02em] sm:text-[44px]">
            NVIDIA EARNINGS
          </h2>
        </div>
        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          <div className="border-t border-softwhite/20 pt-3">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">CAPITAL AT RISK</dt>
            <dd className="mt-1 text-[28px] font-extrabold leading-none">$500</dd>
          </div>
          <div className="border-t border-softwhite/20 pt-3">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">DATE</dt>
            <dd className="mt-1 text-[28px] font-extrabold leading-none">UNVERIFIED</dd>
            <dd className="mt-1 text-[11px] leading-[14px] text-softwhite/60">{DATE_UNAVAILABLE_LINE}</dd>
          </div>
          <div className="border-t border-softwhite/20 pt-3">
            <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">STATUS</dt>
            <dd className="mt-1 text-[28px] font-extrabold leading-none text-signal">WATCHING</dd>
            <dd className="mt-1 text-[11px] leading-[14px] text-softwhite/60">
              {NVDA_EXPOSURE_FIXTURE.underlying} via {NVDA_EXPOSURE_FIXTURE.representation.symbol}
            </dd>
          </div>
        </dl>
        <div className="mt-6">
          <Link
            href="/app/protect/nvidia"
            className="inline-flex min-h-12 items-center justify-center bg-signal px-8 py-3.5 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95"
          >
            PROTECT THIS POSITION →
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
