// Tenax Phase 1D — NVIDIA exposure view (server-rendered).
// Top-level object is NVIDIA; rNVDA is the user's representation marked
// "You are here". External ecosystems are informational only, no execution.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { Card, DecisionRail, ProvenanceStrip } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function ExposurePage() {
  const snapshot = await getDemoSnapshot();
  const live = snapshot.availability !== "UNAVAILABLE";
  const instrument = snapshot.instrument.data;
  const trading = snapshot.trading.data;
  const rep = NVDA_EXPOSURE_FIXTURE.representation;

  return (
    <div className="flex flex-col gap-4 pt-6">
      <DecisionRail current="EXPOSURE" />
      <div>
        <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
          NVIDIA
        </h1>
        <p className="mt-2 max-w-xl text-[16px] leading-[24px] text-mutedink">
          The economic exposure. Everything below is a representation of it — never the same
          thing.
        </p>
      </div>

      <div className="flex flex-col items-stretch gap-2">
        <Card title="NVIDIA — underlying exposure" meta="Economic object · $500 simulated">
          <p className="text-[13px] font-semibold leading-[18px]">rNVDA · Bitget Reality</p>
        </Card>
        <p className="pl-4 text-mutedink" aria-hidden="true">
          ↓
        </p>
        <Card
          title="rNVDA — your representation"
          meta={`${rep.symbol} · ${rep.venue}`}
          action={<span className="state-mark bg-signal text-ink">YOU ARE HERE</span>}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] leading-[18px] sm:grid-cols-3">
            <dt className="text-mutedink">Value</dt>
            <dd className="font-semibold">$500 simulated</dd>
            <dt className="text-mutedink">Instrument status</dt>
            <dd className="font-semibold">{live ? (instrument?.status ?? "—") : "Unavailable"}</dd>
            <dt className="text-mutedink">Reality flag</dt>
            <dd className="font-semibold">{live ? (instrument?.isReality ? "yes" : "—") : "—"}</dd>
            <dt className="text-mutedink">Trading periods</dt>
            <dd className="font-semibold">{live ? trading?.tradingPeriods.join(" · ") : "—"}</dd>
            <dt className="text-mutedink">Weekend tradable</dt>
            <dd className="font-semibold">
              {live ? (trading?.weekendTradable ? "yes" : "—") : "—"}
            </dd>
            <dt className="text-mutedink">Order constraints</dt>
            <dd className="font-semibold">
              min {rep.minOrderQty} rNVDA · min ${rep.minOrderAmount}
            </dd>
          </dl>
        </Card>
      </div>

      <Card
        title="Other known representations"
        meta="Informational only — no execution outside Bitget Reality"
          action={<span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">INFORMATIONAL ONLY</span>}
      >
        <ul className="flex flex-col gap-2 text-[13px] leading-[18px]">
            <li className="rounded-[4px] border-t border-ink/10 bg-ink/[0.04] px-3 py-2">
            <span className="font-semibold">NVDAx</span>{" "}
              <span className="text-mutedink">· xStocks ecosystem · no live data in this slice</span>
          </li>
            <li className="rounded-[4px] border-t border-ink/10 bg-ink/[0.04] px-3 py-2">
            <span className="font-semibold">Ondo NVIDIA</span>{" "}
              <span className="text-mutedink">· Ondo ecosystem · no live data in this slice</span>
          </li>
        </ul>
      </Card>

      <div>
        <Link
          href="/app/protect/nvidia"
          className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] bg-signal px-6 py-3 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95"
        >
          Protect this exposure <span className="btn-arrow" aria-hidden="true">↗</span>
        </Link>
      </div>

      <ProvenanceStrip
        items={[
          live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE",
          "SIMULATED PORTFOLIO",
        ]}
      />
    </div>
  );
}
