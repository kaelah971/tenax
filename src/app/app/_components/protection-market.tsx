// Tenax Phase 4B-B2.3 — shared live protection-market panel (server only).
//
// ONE market implementation reused by the exposure surface and the analysis
// decision cockpit: real Bitget NVDAUSDT candles, interval controls, the
// polling ticker/position surface, and honest provenance. No second fake
// market, no credentials in props — the surface view is already sanitized
// (whitelisted display strings only) before it arrives here.
//
// Centered-terminal layout driven by the caller's MarketViewport preset:
// the module is constrained and centered, the chart narrower still and
// centered within it, stats attached inside the module so header +
// position + candles read as ONE terminal. Read-only: candles, ticker and
// position polling are unchanged; this panel never writes.

import Link from "next/link";

import {
  CANDLE_INTERVAL_MS,
  CANDLE_INTERVALS,
  fetchNvdaCandles,
  type CandleInterval,
} from "@/lib/bitget/market-series";
import { toSurfaceResponse, type DemoSurfaceView } from "@/lib/tenax/demo-surface";
import {
  locateExecutionCandle,
  PROTECTION_INSTRUMENT,
  type MarketViewport,
} from "@/lib/tenax/visuals";
import { LightInstrument } from "./materials";
import { LiveDot } from "./living";
import LiveSurface from "../exposure/nvidia/_live-surface";
import { CandleChart } from "../exposure/nvidia/_visuals";

export interface ProtectionMarketAction {
  readonly qty: string;
  readonly avgPrice: number;
  readonly submittedAt: string | null;
}

export default async function ProtectionMarketPanel({
  interval,
  intervalHref,
  surface,
  viewport,
  action = null,
  compact = false,
}: {
  readonly interval: CandleInterval;
  readonly intervalHref: (tf: CandleInterval) => string;
  /** Sanitized live surface (no credentials by construction). */
  readonly surface: DemoSurfaceView;
  /** Centered-terminal sizing preset (FOCUS for cockpit, EXPOSURE for surface). */
  readonly viewport: MarketViewport;
  /** Verified execution to mark — exposure surface only, never invented. */
  readonly action?: ProtectionMarketAction | null;
  /** Cockpit density: tighter paddings, chart stays readable. */
  readonly compact?: boolean;
}) {
  const candles = await fetchNvdaCandles(undefined, interval);
  const candleList = candles?.candles ?? [];
  const markIndex =
    action && candleList.length > 0
      ? locateExecutionCandle(candleList, action.submittedAt, CANDLE_INTERVAL_MS[interval])
      : null;
  const outsideWindow = action !== null && candleList.length > 0 && markIndex === null;

  return (
    <div className="mx-auto w-full" style={{ maxWidth: `${viewport.moduleMaxWidthPx}px` }}>
      <LightInstrument className={compact ? "border-2 border-ink p-4 sm:p-5" : "border-2 border-ink p-5 sm:p-6"}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            LIVE PROTECTION MARKET · {PROTECTION_INSTRUMENT.symbol} ·{" "}
            {PROTECTION_INSTRUMENT.category} · {PROTECTION_INSTRUMENT.venue}
          </p>
          <span className="state-mark ml-auto bg-signal text-ink">
            <LiveDot label="LIVE" />
          </span>
        </div>
        <div className={compact ? "mt-3" : "mt-4"}>
          <LiveSurface initial={toSurfaceResponse(surface)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Candle interval">
          {CANDLE_INTERVALS.map((tf) => (
            <Link
              key={tf}
              href={intervalHref(tf)}
              aria-current={tf === interval ? "true" : undefined}
              className={`font-syslabel rounded-[8px] px-3 py-1.5 text-[11px] uppercase leading-[14px] tracking-[0.08em] ${
                tf === interval
                  ? "bg-ink font-bold text-softwhite"
                  : "border border-ink/25 text-ink hover:bg-ink hover:text-softwhite"
              }`}
            >
              {tf}
            </Link>
          ))}
        </div>
        <div className="mt-3">
          {candleList.length > 0 ? (
            <div className="mx-auto w-full" style={{ maxWidth: `${viewport.maxWidthPx}px` }}>
              <CandleChart
                candles={candleList}
                interval={interval}
                action={action ? { qty: action.qty, avgPrice: action.avgPrice } : null}
                markIndex={markIndex}
                outsideWindow={outsideWindow}
                provenanceLabel={`REAL MARKET · BITGET PUBLIC CANDLES · ${PROTECTION_INSTRUMENT.symbol} ${interval}`}
                height={viewport.chartHeightPx}
              />
            </div>
          ) : (
            <div
              className="mx-auto w-full border border-dashed border-ink/30 p-4 sm:p-5"
              style={{ maxWidth: `${viewport.maxWidthPx}px` }}
            >
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                MARKET DATA UNAVAILABLE
              </p>
              <p className="mt-1.5 max-w-xl text-[13px] leading-[18px] text-mutedink">
                Public candles could not be loaded — no chart is drawn rather than a synthetic one.
              </p>
            </div>
          )}
        </div>
        <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          PROTECTION INSTRUMENT · {PROTECTION_INSTRUMENT.symbol} · BITGET_DEMO · VIRTUAL FUNDS ONLY
        </p>
      </LightInstrument>
    </div>
  );
}
