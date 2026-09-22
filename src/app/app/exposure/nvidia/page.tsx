// Tenax Phase 4A.1 — compact NVIDIA operating surface, presentation only.
//
// Dashboard composition: summary → topology + market → coverage + mandate
// → refusal → CTA + evidence. Every number derives from canonical state
// (graph, latest evaluation, public candles); this page asserts no
// authority, submits nothing, and invents no market data.
import Link from "next/link";

import { resolveCandleInterval } from "@/lib/bitget/market-series";
import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { getDemoSurfaceView } from "@/lib/tenax/demo-surface";
import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "@/lib/tenax/fixtures";
import { getExposureGraph, getLatestMandateEvaluation } from "@/lib/tenax/service";
import { formatMultiplier } from "@/lib/tenax/format";
import {
  coveragePercent,
  EXPOSURE_VIEWPORT,
  mandateVisualRows,
  protectionLegDisplay,
} from "@/lib/tenax/visuals";
import { LightInstrument, SceneAnchor } from "../../_components/materials";
import ProtectionMarketPanel from "../../_components/protection-market";
import { DecisionRail, ProvenanceStrip, exposureIntervalHref } from "../../_components/ui";
import { TenaxAgent } from "../../_components/living";
import {
  CoverageBar,
  MandateRows,
  RefusalBanner,
  TopologyStrip,
  type TopologyNode,
} from "./_visuals";

export const dynamic = "force-dynamic";

/** Approximate display: "~" prefix marks a derived mapping, not a quote. */
function formatApproxUsd(value: number | null): string {
  if (value === null) return "—";
  return `~$${value.toFixed(2)}`;
}

export default async function ExposurePage({
  searchParams,
}: {
  searchParams: Promise<{ interval?: string }>;
}) {
  const store = getTenaxDevStore();
  const { interval: rawInterval } = await searchParams;
  const interval = resolveCandleInterval(rawInterval);
  const [snapshot, view, surface] = await Promise.all([
    getDemoSnapshot(),
    getExposureGraph(store),
    getDemoSurfaceView(),
  ]);
  const { graph, nvdax } = view;
  const evaluation = getLatestMandateEvaluation(store);

  const live = snapshot.availability !== "UNAVAILABLE";
  const instrument = snapshot.instrument.data;
  const trading = snapshot.trading.data;
  const rep = NVDA_EXPOSURE_FIXTURE.representation;

  const protectionLeg = graph.representations.find((r) => r.role === "protection") ?? null;
  const availableLeg = graph.representations.find((r) => r.role === "available") ?? null;
  // A live Demo short with no stored receipt is real but unmapped: show it
  // as detected-but-unlinked, never as NOT EXECUTED, never linked to a receipt.
  const liveShortPresent = surface.position.state === "POSITION";
  const protectionPresence = protectionLegDisplay(protectionLeg !== null, liveShortPresent);

  const coverage = coveragePercent(graph.protectedNotionalUsd, graph.grossExposureUsd);

  const topologyNodes: readonly TopologyNode[] = [
    {
      id: "rNVDA",
      symbol: "rNVDA",
      venue: "Bitget Reality",
      role: "EXPOSURE",
      metric: "$500 SIMULATED",
      tone: "exposure",
    },
    protectionLeg
      ? {
          id: "NVDAUSDT",
          symbol: "NVDAUSDT",
          venue: "Bitget Demo",
          role: "PROTECTION",
          metric:
            protectionLeg.usdValue !== null
              ? `${formatApproxUsd(protectionLeg.usdValue)} VERIFIED`
              : `${protectionLeg.quantity ?? "—"} SUBMITTED`,
          tone: "protection",
        }
      : protectionPresence === "UNLINKED"
        ? {
            id: "NVDAUSDT",
            symbol: "NVDAUSDT",
            venue: "Bitget Demo",
            role: "PROTECTION",
            metric: "DETECTED · UNLINKED",
            tone: "available",
          }
        : {
            id: "NVDAUSDT",
            symbol: "NVDAUSDT",
            venue: "Bitget Demo",
            role: "PROTECTION",
            metric: "NOT EXECUTED",
            tone: "absent",
          },
    availableLeg && nvdax
      ? {
          id: "NVDAx",
          symbol: "NVDAx",
          venue: "xStocks · Solana",
          role: "AVAILABLE",
          metric: "NOT OWNED",
          tone: "available",
        }
      : {
          id: "NVDAx",
          symbol: "NVDAx",
          venue: "xStocks",
          role: "AVAILABLE",
          metric: "UNVERIFIED",
          tone: "absent",
        },
  ];

  const demo = evaluation?.demo ?? null;
  const action =
    demo && demo.filled && demo.avgPrice !== null
      ? { qty: demo.qty, avgPrice: demo.avgPrice, submittedAt: demo.submittedAt }
      : null;

  const mandateRows = mandateVisualRows({
    proposalPct: evaluation?.proposalPct ?? null,
    tradeValueUsdt: evaluation?.tradeValueUsdt ?? null,
    leverageUsed: evaluation?.leverageUsed ?? null,
    approval: evaluation?.approval ?? null,
    checks: evaluation?.checks ?? null,
    maxPct: MANDATE_FIXTURE.maxProtectionPct,
    maxTradeValueUsdt: MANDATE_FIXTURE.maxTradeValueUsdt,
    maxLeverage: MANDATE_FIXTURE.maxLeverage,
  });

  const refused = evaluation?.rejected ?? null;

  return (
    <div className="tx-observatory-entry flex flex-col gap-6 pt-6 sm:gap-8 sm:pt-8">
      <DecisionRail current="EXPOSURE" links={{ INTENT: "/app/protect/nvidia" }} />

      {/* ROW 1 — compact NVIDIA summary */}
      <div className="tx-material-editorial border-t-2 border-ink pt-4 sm:pt-5">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          NVIDIA · ECONOMIC OBJECT · 1 EXPOSURE · {graph.representations.length} REPRESENTATION
          {graph.representations.length === 1 ? "" : "S"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-end gap-x-8 gap-y-2">
          <h1 className="text-[44px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[56px]">
            NVIDIA
          </h1>
          <p className="value-live text-[40px] font-extrabold leading-none tracking-[-0.03em] sm:text-[52px]">
            $500
          </p>
          <p className="pb-1">
            <span className="state-mark bg-signal text-ink">○ SIMULATED</span>
          </p>
        </div>
        <p className="mt-1.5 max-w-xl text-[14px] leading-[20px] text-mutedink">
          The economic exposure. Wrappers and venues are representations of it — never the same thing.
        </p>
      </div>

      {/* LIVE MARKET SURFACE — centered terminal: observe the exposure and
          its current protection state. Heading keeps exposure identity;
          the terminal below is the shared centered module. */}
      <div className="flex items-start justify-between gap-4">
        <p className="font-syslabel pt-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          MARKET · LIVE BITGET DEMO SURFACE
        </p>
        <SceneAnchor className="tx-floating-mascot relative z-10 -mb-2 -mt-7 shrink-0 sm:-mr-2">
          <TenaxAgent state="watching" size={100} caption="ON WATCH" />
        </SceneAnchor>
      </div>
      <ProtectionMarketPanel
        interval={interval}
        intervalHref={(tf) => exposureIntervalHref(tf)}
        surface={surface}
        viewport={EXPOSURE_VIEWPORT}
        action={action}
      />

      {/* ROW 3 — coverage (~40%) + mandate (~60%) */}
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-5">
        <LightInstrument className="p-5 sm:p-6 xl:col-span-2">
          <CoverageBar
            protectedUsd={formatApproxUsd(graph.protectedNotionalUsd)}
            remainingUsd={formatApproxUsd(graph.remainingExposureUsd)}
            coverage={coverage}
          />
        </LightInstrument>
        <LightInstrument className="p-5 sm:p-6 xl:col-span-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            AUTHORITY · MANDATE BOUNDARIES
          </p>
          <h2 className="mt-1 text-[22px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[26px]">
            Bounded before it acts.
          </h2>
          <div className="mt-3">
            <MandateRows rows={mandateRows} />
          </div>
          {!evaluation ? (
            <p className="mt-2 max-w-xl text-[12px] leading-[17px] text-mutedink">
              No evaluated proposal yet — bounds are the standing mandate, awaiting a fresh flow.
            </p>
          ) : null}
        </LightInstrument>
      </div>

      {/* ROW 4 — refusal banner */}
      {refused ? (
        <section aria-label="Refusal evidence">
          <RefusalBanner
            value={refused.value}
            pct={refused.pct}
            maxValue={MANDATE_FIXTURE.maxTradeValueUsdt}
            maxPct={MANDATE_FIXTURE.maxProtectionPct}
            failedRules={refused.failedRules}
          />
        </section>
      ) : null}

      {/* Topology explainer — secondary: how Tenax maps the exposure */}
      <LightInstrument className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            HOW TENAX MAPS THE EXPOSURE
          </p>
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            1 EXPOSURE · {graph.representations.length} REPRESENTATION
            {graph.representations.length === 1 ? "" : "S"}
          </p>
        </div>
        <div className="mt-3">
          <TopologyStrip nodes={topologyNodes} />
        </div>
        <p className="mt-3 max-w-2xl text-[13px] leading-[18px] text-mutedink">
          Protection applies to the exposure, never to a wrapper. Available does not mean owned.
        </p>
      </LightInstrument>

      {/* ROW 5 — CTA + collapsed technical evidence */}
      <div className="flex flex-col gap-4">
        <div>
          <Link href="/app/protect/nvidia" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95">
            PROTECT THIS EXPOSURE <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          <details className="rounded-[12px] border border-ink/15 p-4">
            <summary className="font-syslabel cursor-pointer text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              BITGET MARKET DETAIL
            </summary>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] leading-[17px]">
              <dt className="text-mutedink">Status</dt><dd className="font-semibold">{live ? (instrument?.status ?? "—") : "Unavailable"}</dd>
              <dt className="text-mutedink">Reality flag</dt><dd className="font-semibold">{live ? (instrument?.isReality ? "yes" : "—") : "—"}</dd>
              <dt className="text-mutedink">Trading periods</dt><dd className="font-semibold">{live ? trading?.tradingPeriods.join(" · ") : "—"}</dd>
              <dt className="text-mutedink">Weekend tradable</dt><dd className="font-semibold">{live ? (trading?.weekendTradable ? "yes" : "—") : "—"}</dd>
              <dt className="text-mutedink">Order constraints</dt><dd className="font-semibold">min {rep.minOrderQty} rNVDA · min ${rep.minOrderAmount}</dd>
              <dt className="text-mutedink">Snapshot age</dt><dd className="font-semibold break-all">{snapshot.fetchedAt}</dd>
            </dl>
          </details>
          <details className="rounded-[12px] border border-ink/15 p-4">
            <summary className="font-syslabel cursor-pointer text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              XSTOCKS REPRESENTATION DETAIL
            </summary>
            {nvdax ? (
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] leading-[17px]">
                <dt className="text-mutedink">Mint</dt><dd className="break-all font-semibold" title={nvdax.address}>{nvdax.address}</dd>
                <dt className="text-mutedink">Multiplier</dt><dd className="font-semibold" title="Rebase factor tracking splits and dividends">{nvdax.currentMultiplier === null ? "UNAVAILABLE" : formatMultiplier(nvdax.currentMultiplier)}</dd>
                <dt className="text-mutedink">Oracles</dt><dd className="font-semibold">{nvdax.oracleManagers.length === 0 ? "UNAVAILABLE" : nvdax.oracleManagers.join(" · ")}</dd>
                <dt className="text-mutedink">Atomic halted</dt><dd className="font-semibold">{nvdax.atomicHalted === null ? "UNAVAILABLE" : nvdax.atomicHalted ? "yes" : "no"}</dd>
              </dl>
            ) : (
              <p className="mt-2.5 text-[12px] leading-[17px] text-mutedink">xStocks metadata unavailable right now.</p>
            )}
          </details>
          <details className="rounded-[12px] border border-ink/15 p-4">
            <summary className="font-syslabel cursor-pointer text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              OTHER KNOWN WRAPPERS
            </summary>
            <p className="mt-2.5 text-[12px] leading-[17px] text-mutedink">
              Ondo NVIDIA · Ondo ecosystem · informational only — not connected, not mapped, not owned.
            </p>
          </details>
        </div>
      </div>

      <ProvenanceStrip items={[live ? "LIVE BITGET DATA" : "BITGET DATA UNAVAILABLE", "SIMULATED PORTFOLIO"]} />
    </div>
  );
}
