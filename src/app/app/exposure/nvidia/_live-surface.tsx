// Tenax Phase 4A.2 — live ticker + position strip (client polling).
//
// Presentation only: polls the read-only Tenax route (never Bitget
// directly, never with credentials) every 5s for the sanitized ticker and
// Demo position models. Server-rendered initial values display instantly;
// polling refreshes numbers in place. Interval is cleared on unmount.
"use client";

import { useEffect, useState } from "react";

import type { toSurfaceResponse } from "@/lib/tenax/demo-surface";
import { formatPrice, formatRate, formatSignedPnl, isPnlGain } from "@/lib/tenax/format";

type SurfaceSnapshot = ReturnType<typeof toSurfaceResponse>;
type TickerSnapshot = SurfaceSnapshot["ticker"];
type PositionSnapshot = SurfaceSnapshot["position"];

const POLL_MS = 5000;
const ROUTE = "/api/market/demo-surface";

function formatChangePct(raw: string | null): string | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const pct = Math.round(n * 100 * 100) / 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

function formatBidAsk(bid: string | null, ask: string | null): string {
  if (bid === null || ask === null) return "—";
  return `${formatPrice(bid)} / ${formatPrice(ask)}`;
}

function TickerHeader({ ticker }: { ticker: TickerSnapshot }) {
  const change = ticker ? formatChangePct(ticker.change24h) : null;
  const up = change !== null && !change.startsWith("-");
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          NVDAUSDT · PERPETUAL <span className="ml-2 border border-ink/25 px-1.5 py-px">BITGET</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-[40px] font-extrabold leading-none tracking-[-0.03em] sm:text-[48px]">
            {formatPrice(ticker?.lastPrice ?? null)}
          </p>
          {change ? (
            <p className={`state-mark ${up ? "bg-signal text-ink" : "bg-ink text-softwhite"}`}>
              {change}
            </p>
          ) : (
            <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">—</p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-x-5 gap-y-2 text-[12px] leading-[17px] sm:grid-cols-6">
        {[
          ["MARK", formatPrice(ticker?.markPrice ?? null)],
          ["INDEX", formatPrice(ticker?.indexPrice ?? null)],
          ["FUNDING", formatRate(ticker?.fundingRate ?? null)],
          ["24H H", formatPrice(ticker?.high24h ?? null)],
          ["24H L", formatPrice(ticker?.low24h ?? null)],
          ["BID / ASK", formatBidAsk(ticker?.bidPrice ?? null, ticker?.askPrice ?? null)],
        ].map(([term, value]) => (
          <div key={term}>
            <dt className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">{term}</dt>
            <dd className="mt-0.5 font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PositionStrip({ position }: { position: PositionSnapshot }) {
  if (position.state === "UNAVAILABLE") {
    return (
      <div className="mt-4 border border-dashed border-ink/30 p-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          DEMO POSITION UNAVAILABLE
        </p>
        <p className="mt-1.5 text-[13px] leading-[18px] text-mutedink">
          The Demo account could not be read — candles and ticker above are unaffected.
        </p>
      </div>
    );
  }
  if (position.state === "NO_POSITION") {
    return (
      <div className="mt-4 border border-dashed border-ink/30 p-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          NO OPEN DEMO POSITION
        </p>
        <p className="mt-1.5 text-[13px] leading-[18px] text-mutedink">
          Nothing is open on Bitget Demo right now. Past executions live on the receipt, not here.
        </p>
      </div>
    );
  }
  const roi = position.upnlRoi === null ? "" : ` (${position.upnlRoi}%)`;
  const upnl = formatSignedPnl(position.upnl);
  const upnlTone = upnl === "—" ? "" : isPnlGain(upnl) ? "text-signal" : "";
  return (
    <div className="mt-4 bg-ink p-4 text-softwhite sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
          OPEN DEMO POSITION
        </p>
        <p className="state-mark bg-signal text-ink">DEMO · VIRTUAL FUNDS ONLY</p>
      </div>
      <p className="font-syslabel mt-2.5 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
        NVDAUSDT · {(position.side ?? "SHORT").toUpperCase()} {position.size ?? "—"}
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-x-5 gap-y-2.5 text-[12px] leading-[17px] sm:grid-cols-6">
        {[
          ["ENTRY", formatPrice(position.avgEntryPrice)],
          ["MARK", formatPrice(position.markPrice)],
          ["UPNL", upnl === "—" ? upnl : `${upnl}${roi}`, upnlTone],
          ["LEVERAGE", position.leverage ? `${position.leverage}X` : "—", ""],
          ["MARGIN", (position.marginMode ?? "—").toUpperCase(), ""],
          ["LIQ", formatPrice(position.liqPrice), ""],
        ].map(([term, value, tone]) => (
          <div key={term}>
            <dt className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/60">{term}</dt>
            <dd className={`mt-0.5 text-[15px] font-bold leading-[19px] ${tone ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function LiveSurface({
  initial,
}: {
  initial: SurfaceSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<SurfaceSnapshot>(initial);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch(ROUTE, { signal: controller.signal });
        const body = (await res.json()) as SurfaceSnapshot & { ok?: boolean };
        if (!cancelled && res.ok && body) {
          setSnapshot({
            ticker: body.ticker ?? null,
            position: body.position,
            fetchedAt: body.fetchedAt,
          });
        }
      } catch {
        // Keep last known values; polling retries on the next beat.
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  return (
    <div>
      <TickerHeader ticker={snapshot.ticker} />
      <PositionStrip position={snapshot.position} />
      <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
        UPDATED {formatUpdatedAt(snapshot.fetchedAt)} · 5S POLL · TENAX ROUTE ONLY
      </p>
    </div>
  );
}
