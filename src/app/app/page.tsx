// Tenax Phase 1D — Capital dashboard (server-rendered, cached snapshot).
// SIMULATED portfolio exposure beside LIVE Bitget market context, each
// labeled. No earnings date is shown because none is verified.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { DATE_UNAVAILABLE_LINE, EVENT_UNAVAILABLE_LINE } from "../app/_copy";
import { Card, ChainSteps, Chip, ProvenanceStrip } from "./_components/ui";

export const dynamic = "force-dynamic";

function PrimaryCta({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 items-center justify-center rounded-[10px] bg-deep px-6 text-[15px] font-semibold leading-[20px] text-white shadow-[0_8px_20px_rgba(78,128,232,0.25)] hover:bg-pressed"
    >
      {children} ↗
    </Link>
  );
}

export default async function CapitalPage() {
  const snapshot = await getDemoSnapshot();
  const live = snapshot.availability !== "UNAVAILABLE";
  const ticker = snapshot.ticker.data;
  const instrument = snapshot.instrument.data;
  const sessions = snapshot.sessions.data;

  return (
    <div className="flex flex-col gap-4 pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <ChainSteps current="Exposure" />
        <span className="ml-auto text-[11px] leading-[14px] text-muted">
          {live ? `Market data as of ${snapshot.fetchedAt}` : "Market data unavailable"}
        </span>
      </div>

      <div>
        <h1 className="max-w-xl text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
          What should your capital do?
        </h1>
        <p className="mt-3 max-w-xl text-[16px] leading-[24px] text-muted">
          Tenax watches your exposure through earnings, proposes bounded protection, and clears
          every action through your mandate before anything moves.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="NVIDIA"
          meta="rNVDA · Bitget Reality · Exposure $500"
          action={<Chip tone="muted">SIMULATED PORTFOLIO</Chip>}
        >
          <p className="text-[16px] leading-[24px]">
            <span className="text-[30px] font-bold leading-[34px]">$500</span> NVIDIA exposure held
            as rNVDA.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <PrimaryCta href="/app/protect/nvidia">Protect this exposure</PrimaryCta>
            <Link
              href="/app/exposure/nvidia"
              className="inline-flex h-12 items-center justify-center rounded-[10px] border border-secondaryborder bg-white px-6 text-[15px] font-semibold leading-[20px] hover:bg-secondaryhover"
            >
              View exposure
            </Link>
          </div>
        </Card>

        <Card
          title="Live Bitget context"
          meta="RNVDAUSDT · public market data"
          action={live ? <Chip tone="live">LIVE BITGET DATA</Chip> : <Chip tone="refused">UNAVAILABLE</Chip>}
        >
          {live ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] leading-[18px]">
              <dt className="text-muted">Instrument</dt>
              <dd className="font-semibold">{instrument?.status ?? "—"}</dd>
              <dt className="text-muted">Last price</dt>
              <dd className="font-semibold">{ticker?.lastPrice ? `$${ticker.lastPrice}` : "—"}</dd>
              <dt className="text-muted">24h range</dt>
              <dd className="font-semibold">
                {ticker?.lowPrice24h && ticker?.highPrice24h
                  ? `$${ticker.lowPrice24h} – $${ticker.highPrice24h}`
                  : "—"}
              </dd>
              <dt className="text-muted">Session</dt>
              <dd className="font-semibold">{sessions?.currentState ?? "UNKNOWN"}</dd>
            </dl>
          ) : (
            <p className="text-[16px] leading-[24px]">{EVENT_UNAVAILABLE_LINE}</p>
          )}
        </Card>
      </div>

      <Card
        title="NVIDIA Earnings"
        meta="Affects $500 rNVDA exposure"
        action={<Link href="/app/events" className="text-[13px] font-medium leading-[18px] text-deep">Open event →</Link>}
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[16px] leading-[24px]">{DATE_UNAVAILABLE_LINE}</p>
          <span className="ml-auto">
            <PrimaryCta href="/app/protect/nvidia">Protect this position</PrimaryCta>
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-[14px] text-muted">
          Exposure at risk: {NVDA_EXPOSURE_FIXTURE.underlying} via{" "}
          {NVDA_EXPOSURE_FIXTURE.representation.symbol} · {formatExposureValue()}
        </p>
      </Card>

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

function formatExposureValue(): string {
  return `$${NVDA_EXPOSURE_FIXTURE.exposureValueUsdt} simulated value`;
}
