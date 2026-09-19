// Tenax Phase 1D — events list (lightweight, real snapshot context).
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { DATE_UNAVAILABLE_LINE, EVENT_UNAVAILABLE_LINE } from "../_copy";
import { Card, Chip, DecisionRail, ProvenanceStrip } from "../_components/ui";
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

      <Card
        title="NVIDIA Earnings"
        meta="Affects $500 rNVDA exposure"
        action={live ? <Chip tone="live">MONITORING</Chip> : <Chip tone="refused">UNAVAILABLE</Chip>}
      >
        <div className="mb-4 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {live ? (
              <span className="inline-flex rounded-full bg-signal/60 px-2.5 py-1 text-ink">
                <LiveDot label="WATCHING · EVENT_01" />
              </span>
            ) : (
              <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-clay">
                ○ OFFLINE · EVENT_01
              </span>
            )}
            <svg
              className="mt-3 h-20 w-48 text-ink"
              viewBox="0 0 160 48"
              aria-hidden="true"
            >
              <circle cx="128" cy="24" r="16" fill="none" stroke="#F5FF3B" strokeWidth="1.5" opacity="0.7" />
              <circle cx="128" cy="24" r="16" fill="none" stroke="#111111" strokeWidth="1" strokeDasharray="4 5" opacity="0.5" className="tx-agent-orbit" />
              <circle cx="128" cy="24" r="4" fill="#111111" />
              <circle cx="128" cy="24" r="8" fill="none" stroke="#111111" strokeWidth="1" className="radar-ring" />
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
        {live ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] leading-[18px]">
            <dt className="text-muted">Earnings date</dt>
            <dd className="font-semibold">{DATE_UNAVAILABLE_LINE}</dd>
            <dt className="text-muted">Session state</dt>
            <dd className="font-semibold">{sessionState}</dd>
            <dt className="text-muted">Forecast context</dt>
            <dd className="font-semibold">
              {forecast
                ? `FY${forecast.fiscalYear} · EPS ${forecast.eps} · ${forecast.currency}`
                : "—"}
            </dd>
            <dt className="text-muted">Agent status</dt>
            <dd className="font-semibold">Assessment available</dd>
          </dl>
        ) : (
          <p className="text-[16px] leading-[24px]">{EVENT_UNAVAILABLE_LINE}</p>
        )}
        <div className="mt-4">
          <Link
            href="/app/protect/nvidia"
            className="btn-living rounded-full inline-flex h-12 items-center justify-center bg-signal px-6 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95"
          >
            Protect this position <span className="btn-arrow" aria-hidden="true">↗</span>
          </Link>
        </div>
      </Card>

      <ProvenanceStrip
        items={[live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO"]}
      />
    </div>
  );
}
