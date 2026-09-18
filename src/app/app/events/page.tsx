// Tenax Phase 1D — events list (lightweight, real snapshot context).
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { DATE_UNAVAILABLE_LINE, EVENT_UNAVAILABLE_LINE } from "../_copy";
import { Card, Chip, DecisionRail, ProvenanceStrip } from "../_components/ui";

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
            className="inline-flex h-12 items-center justify-center rounded-[10px] bg-deep px-6 text-[15px] font-semibold leading-[20px] text-white shadow-[0_8px_20px_rgba(78,128,232,0.25)] hover:bg-pressed"
          >
            Protect this position ↗
          </Link>
        </div>
      </Card>

      <ProvenanceStrip
        items={[live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO"]}
      />
    </div>
  );
}
