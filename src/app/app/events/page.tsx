// Tenax Phase 1D — events list (lightweight, real snapshot context).
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { DATE_UNAVAILABLE_LINE, EVENT_UNAVAILABLE_LINE } from "../_copy";
import { Chip, DecisionRail, ProvenanceStrip } from "../_components/ui";
import { LiveDot, TenaxAgent } from "../_components/living";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const snapshot = await getDemoSnapshot();
  const live = snapshot.availability !== "UNAVAILABLE";
  const forecast = snapshot.earningsForecast.data;
  const sessionState = snapshot.sessions.data?.currentState ?? "UNKNOWN";

  return (
    <div className="flex flex-col gap-4 pt-6">
      <DecisionRail current="INTELLIGENCE" />
      <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
        Events
      </h1>

      <section aria-label="NVIDIA earnings Event Room" className="material-authority relative overflow-hidden p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-softwhite/15 pb-4">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">EVENT_01</p>
            <h2 className="mt-2 text-[32px] font-extrabold leading-none tracking-[-0.03em] sm:text-[48px]">NVIDIA EARNINGS</h2>
            <p className="mt-3 font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
              AFFECTED CAPITAL · $500 rNVDA · DATE UNVERIFIED
            </p>
          </div>
          {live ? <Chip tone="live">WATCHING</Chip> : <Chip tone="refused">UNAVAILABLE</Chip>}
        </div>
        <div className="mb-4 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {live ? (
              <span className="state-mark bg-signal text-ink">
                <LiveDot label="WATCHING · EVENT_01" />
              </span>
            ) : (
              <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-clay">
                ○ OFFLINE · EVENT_01
              </span>
            )}
            <svg
              className="mt-3 h-20 w-48 text-signal"
              viewBox="0 0 160 48"
              aria-hidden="true"
            >
              <circle cx="128" cy="24" r="16" fill="none" stroke="#F5FF3B" strokeWidth="1.5" opacity="0.7" />
              <circle cx="128" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 5" opacity="0.5" className="tx-agent-orbit" />
              <circle cx="128" cy="24" r="4" fill="currentColor" />
              <circle cx="128" cy="24" r="8" fill="none" stroke="currentColor" strokeWidth="1" className="radar-ring" />
              <polyline
                points="0,34 20,30 40,33 60,20 80,25 100,14 120,19 140,10 160,13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="spark-draw"
              />
            </svg>
          </div>
          <div className="agent-stage">
            <TenaxAgent state="watching" size={88} caption="MONITORING EVENT" className="mascot-scale" />
          </div>
        </div>
        <div className="event-evidence mt-2 p-4 sm:p-5">
          {live ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] leading-[18px]">
              <dt className="text-softwhite/60">Earnings date</dt>
              <dd className="font-semibold">{DATE_UNAVAILABLE_LINE}</dd>
              <dt className="text-softwhite/60">Session state</dt>
              <dd className="font-semibold">{sessionState}</dd>
              <dt className="text-softwhite/60">Forecast context</dt>
              <dd className="font-semibold">
                {forecast
                  ? `FY${forecast.fiscalYear} · EPS ${forecast.eps} · ${forecast.currency}`
                  : "—"}
              </dd>
              <dt className="text-softwhite/60">Agent status</dt>
              <dd className="font-semibold">Assessment available</dd>
            </dl>
          ) : (
            <p className="text-[16px] leading-[24px]">{EVENT_UNAVAILABLE_LINE}</p>
          )}
        </div>
        <div className="mt-4">
          <Link
            href="/app/protect/nvidia"
            className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] bg-signal px-6 py-3 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95"
          >
            Protect this position <span className="btn-arrow" aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <ProvenanceStrip
        items={[live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO"]}
      />
    </div>
  );
}
