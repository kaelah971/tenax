// Tenax Phase 1D — NVIDIA exposure view (server-rendered).
// Top-level object is NVIDIA; rNVDA is the user's representation marked
// "You are here". External ecosystems are informational only, no execution.
import Link from "next/link";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { Card, Chip, DecisionRail, ProvenanceStrip } from "../../_components/ui";

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
        <p className="mt-2 max-w-xl text-[16px] leading-[24px] text-muted">
          The economic exposure. Everything below is a representation of it — never the same
          thing.
        </p>
      </div>

      <div className="flex flex-col items-stretch gap-2">
        <Card title="NVIDIA — underlying exposure" meta="Economic object · $500 simulated">
          <p className="text-[13px] font-semibold leading-[18px]">rNVDA · Bitget Reality</p>
        </Card>
        <p className="pl-4 text-muted" aria-hidden="true">
          ↓
        </p>
        <Card
          title="rNVDA — your representation"
          meta={`${rep.symbol} · ${rep.venue}`}
          action={<Chip tone="live">You are here</Chip>}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] leading-[18px] sm:grid-cols-3">
            <dt className="text-muted">Value</dt>
            <dd className="font-semibold">$500 simulated</dd>
            <dt className="text-muted">Instrument status</dt>
            <dd className="font-semibold">{live ? (instrument?.status ?? "—") : "Unavailable"}</dd>
            <dt className="text-muted">Reality flag</dt>
            <dd className="font-semibold">{live ? (instrument?.isReality ? "yes" : "—") : "—"}</dd>
            <dt className="text-muted">Trading periods</dt>
            <dd className="font-semibold">{live ? trading?.tradingPeriods.join(" · ") : "—"}</dd>
            <dt className="text-muted">Weekend tradable</dt>
            <dd className="font-semibold">
              {live ? (trading?.weekendTradable ? "yes" : "—") : "—"}
            </dd>
            <dt className="text-muted">Order constraints</dt>
            <dd className="font-semibold">
              min {rep.minOrderQty} rNVDA · min ${rep.minOrderAmount}
            </dd>
          </dl>
        </Card>
      </div>

      <Card
        title="Other known representations"
        meta="Informational only — no execution outside Bitget Reality"
        action={<Chip tone="muted">INFORMATIONAL ONLY</Chip>}
      >
        <ul className="flex flex-col gap-2 text-[13px] leading-[18px]">
          <li className="rounded-[10px] bg-cream px-3 py-2">
            <span className="font-semibold">NVDAx</span>{" "}
            <span className="text-muted">· xStocks ecosystem · no live data in this slice</span>
          </li>
          <li className="rounded-[10px] bg-cream px-3 py-2">
            <span className="font-semibold">Ondo NVIDIA</span>{" "}
            <span className="text-muted">· Ondo ecosystem · no live data in this slice</span>
          </li>
        </ul>
      </Card>

      <div>
        <Link
          href="/app/protect/nvidia"
          className="inline-flex h-12 items-center justify-center rounded-[10px] bg-deep px-6 text-[15px] font-semibold leading-[20px] text-white shadow-[0_8px_20px_rgba(78,128,232,0.25)] hover:bg-pressed"
        >
          Protect this exposure ↗
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
