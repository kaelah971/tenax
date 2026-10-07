// Tenax Phase 4A.1 — compact dashboard visuals (server components only).
//
// Props-only, no client JS, no animation, no data fetching: every number
// arrives from canonical domain values computed by the page. Nothing here
// invents financial truth; unknown inputs render as honest gaps.
// Scale: dashboard cards, not editorial spreads — headings ~20-30px,
// metrics ~32-48px, labels ~11px mono.

import type { MandateVisualRow } from "@/lib/tenax/visuals";
import type { CandleInterval, OhlcCandle } from "@/lib/bitget/market-series";

export interface TopologyNode {
  readonly id: string;
  readonly symbol: string;
  readonly venue: string;
  readonly role: string;
  readonly metric: string;
  readonly tone: "exposure" | "protection" | "available" | "absent";
}

/**
 * Compact mapping ribbon: the NVIDIA economic subject with its
 * representations as PARALLEL branches off one spine — never a sequence,
 * so no asset reads as transforming into the next. A secondary explainer:
 * dense, role-coded, with AVAILABLE never reading as owned.
 */
export function TopologyStrip({ nodes }: { nodes: readonly TopologyNode[] }) {
  return (
    <div
      role="img"
      aria-label="NVIDIA economic exposure mapping in parallel to rNVDA exposure, NVDAUSDT protection, and NVDAx available"
      className="flex flex-col gap-2 md:flex-row md:items-stretch"
    >
      <div className="flex shrink-0 items-center gap-3 rounded-[10px] bg-ink px-4 py-3 text-softwhite md:w-[196px] md:flex-col md:items-start md:justify-center md:gap-1">
        <p className="text-[17px] font-extrabold leading-[20px]">NVIDIA</p>
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
          $500 · SIMULATED
        </p>
      </div>
      <ol className="relative flex min-w-0 flex-1 flex-col gap-2 md:pl-6">
        <span
          aria-hidden="true"
          className="absolute bottom-4 left-0 top-4 hidden w-px bg-ink/30 md:block"
        />
        {nodes.map((node) => (
          <li key={node.id} className="relative min-w-0">
            <span
              aria-hidden="true"
              className="absolute -left-6 top-1/2 hidden h-px w-6 bg-ink/30 md:block"
            />
            <div
              className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] px-3.5 py-2.5 ${
                node.tone === "protection"
                  ? "bg-ink text-softwhite"
                  : node.tone === "available" || node.tone === "absent"
                    ? "border border-dashed border-ink/40"
                    : "border-2 border-ink"
              }`}
            >
              <p
                className={`font-syslabel inline-block shrink-0 rounded-full px-2 py-px text-[10px] font-bold uppercase leading-[15px] tracking-[0.08em] ${
                  node.tone === "protection" || node.tone === "exposure"
                    ? "bg-signal text-ink"
                    : "border border-current opacity-70"
                }`}
              >
                {node.role}
              </p>
              <p className="text-[15px] font-extrabold leading-[19px]">{node.symbol}</p>
              <p className="font-syslabel min-w-0 flex-1 truncate text-[11px] uppercase leading-[15px] tracking-[0.06em] opacity-70">
                {node.venue}
              </p>
              <p className="shrink-0 text-[12.5px] font-bold leading-[17px]">{node.metric}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Compact protection-coverage metric card derived from graph aggregates. */
export function CoverageBar({
  protectedUsd,
  remainingUsd,
  coverage,
}: {
  readonly protectedUsd: string;
  readonly remainingUsd: string;
  readonly coverage: number | null;
}) {
  const width = coverage === null ? 0 : Math.min(100, Math.max(0, coverage));
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          PROTECTION COVERAGE
        </p>
        <p className="font-syslabel text-[36px] font-semibold leading-none tracking-[-0.02em] sm:text-[44px]">
          {coverage === null ? "—" : `${coverage.toFixed(2)}%`}
        </p>
      </div>
      <p className="font-syslabel mt-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
        PROTECTED
      </p>
      <div
        role="img"
        aria-label={
          coverage === null
            ? "Protection coverage unknown"
            : `Protection coverage ${coverage.toFixed(2)} percent`
        }
        className="mt-2 h-4 overflow-hidden rounded-[5px] border-2 border-ink bg-ink/10"
      >
        <div className="h-full bg-signal" style={{ width: `${width}%` }} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[13px] leading-[18px]">
        <p>
          <span className="font-bold">{protectedUsd}</span> <span className="text-mutedink">protected</span>
        </p>
        <p>
          <span className="font-bold">{remainingUsd}</span> <span className="text-mutedink">remaining</span>
        </p>
      </div>
      <p className="mt-2 text-[12px] leading-[17px] text-mutedink">
        Approximate mapped protection — not delta-neutral.
        {coverage === null ? " Coverage unknown until a hedge verifies." : ""}
      </p>
    </div>
  );
}

/** Base SVG viewport for the candlestick chart. Height is overridable per
 * surface (the analysis focus viewport runs taller); width stays fixed so
 * proportions remain comparable across pages. */
export const CANDLE_VIEWPORT = { width: 680, height: 300 } as const;

export function candleGeometry(candles: readonly OhlcCandle[], height: number = CANDLE_VIEWPORT.height) {
  const W = CANDLE_VIEWPORT.width;
  const H = height;
  const padL = 8;
  const axisW = 58;
  const padT = 14;
  const padB = 22;
  const plotW = W - padL - axisW;
  const plotH = H - padT - padB;
  const lows = candles.map((c) => c.l);
  const highs = candles.map((c) => c.h);
  const rawLo = Math.min(...lows);
  const rawHi = Math.max(...highs);
  const pad = (rawHi - rawLo === 0 ? 1 : rawHi - rawLo) * 0.06;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const x = (i: number): number => {
    const slot = plotW / candles.length;
    return padL + slot * (i + 0.5);
  };
  const y = (v: number): number => padT + (1 - (v - lo) / (hi - lo)) * plotH;
  const slotW = plotW / Math.max(1, candles.length);
  return { W, H, padL, axisW, padB, plotW, lo, hi, x, y, slotW };
}

/** Round a raw step up to a 1/2/2.5/5/10 progression for calm gridlines. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag >= raw) return m * mag;
  }
  return 10 * mag;
}

function formatCandleTime(t: number, interval: CandleInterval): string {
  const d = new Date(t);
  const pad = (n: number): string => String(n).padStart(2, "0");
  if (interval === "1H" || interval === "4H" || interval === "1m" || interval === "5m" || interval === "15m") {
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Responsive SVG candlestick chart with the verified execution mark.
 * Static render (no client JS): bodies span open→close, wicks span
 * low→high, up candles read signal, down candles read ink. The action
 * dot anchors to the candle containing the execution time; an execution
 * outside the window renders as a price-level note, never a placed dot.
 * Height is overridable for focus viewports; width is fixed so proportions
 * stay comparable across surfaces.
 */
export function CandleChart({
  candles,
  interval,
  action,
  markIndex,
  outsideWindow,
  provenanceLabel,
  height = CANDLE_VIEWPORT.height,
}: {
  readonly candles: readonly OhlcCandle[];
  readonly interval: CandleInterval;
  readonly action: { readonly qty: string; readonly avgPrice: number } | null;
  readonly markIndex: number | null;
  readonly outsideWindow: boolean;
  readonly provenanceLabel: string;
  readonly height?: number;
}) {
  if (candles.length === 0) return null;
  const g = candleGeometry(candles, height);
  const step = niceStep((g.hi - g.lo) / 4);
  const gridLevels: number[] = [];
  for (let v = Math.ceil(g.lo / step) * step; v <= g.hi; v += step) {
    gridLevels.push(Math.round(v * 100) / 100);
  }
  const bodyW = Math.max(2, g.slotW * 0.62);
  const timeIdx = [0, Math.floor((candles.length - 1) / 2), candles.length - 1];
  const actionY = action ? g.y(action.avgPrice) : 0;
  const dotX = markIndex !== null ? g.x(markIndex) : null;
  const labelX = Math.min((dotX ?? g.x(candles.length - 1)) + 12, g.W - 200);
  const labelY = action ? Math.max(Math.min(actionY - 16, g.H - 68), 30) : 30;
  return (
    <div>
      <svg
        viewBox={`0 0 ${g.W} ${g.H}`}
        role="img"
        aria-label={`NVDAUSDT ${interval} candlesticks, ${candles.length} bars${action ? `, Tenax protection short ${action.qty} at ${action.avgPrice}` : ""}`}
        className="w-full"
      >
        {gridLevels.map((v) => (
          <g key={v}>
            <line
              x1={g.padL}
              x2={g.padL + g.plotW}
              y1={g.y(v)}
              y2={g.y(v)}
              stroke="#A0B6D4"
              strokeOpacity="0.1"
              strokeWidth="1"
            />
            <text x={g.W - 4} y={g.y(v) + 4} textAnchor="end" fontSize="10.5" fill="#8B97A8">
              {v.toFixed(2)}
            </text>
          </g>
        ))}
        {candles.map((c, i) => {
          const up = c.c >= c.o;
          const cx = g.x(i);
          const top = g.y(Math.max(c.o, c.c));
          const height = Math.max(1.5, Math.abs(g.y(c.o) - g.y(c.c)));
          return (
            <g key={`${c.t}-${i}`}>
              <line
                x1={cx}
                x2={cx}
                y1={g.y(c.h)}
                y2={g.y(c.l)}
                stroke={up ? "#45E0CF" : "#C3CEDC"}
                strokeOpacity="0.75"
                strokeWidth="1.25"
              />
              <rect
                x={cx - bodyW / 2}
                y={top}
                width={bodyW}
                height={height}
                fill={up ? "#45E0CF" : "#0C1118"}
                stroke={up ? "#45E0CF" : "#C3CEDC"}
                strokeWidth="1.25"
              />
            </g>
          );
        })}
        {timeIdx.map((i) => (
          <text
            key={i}
            x={g.x(i)}
            y={g.H - 6}
            textAnchor="middle"
            fontSize="10.5"
            fill="#8B97A8"
          >
            {formatCandleTime(candles[i]?.t ?? 0, interval)}
          </text>
        ))}
        {action && !outsideWindow ? (
          <g>
            <line
              x1={g.padL}
              x2={g.padL + g.plotW}
              y1={actionY}
              y2={actionY}
              stroke="#E6ECF4"
              strokeOpacity="0.7"
              strokeDasharray="6 4"
              strokeWidth="1.5"
            />
            {dotX !== null ? (
              <circle cx={dotX} cy={actionY} r="6" fill="#45E0CF" stroke="#05070B" strokeWidth="2.5" />
            ) : null}
            <rect x={labelX} y={labelY} width="192" height="52" rx="8" fill="#0A0F15" stroke="#45E0CF" strokeOpacity="0.45" />
            <text x={labelX + 12} y={labelY + 21} fill="#45E0CF" fontSize="11" fontWeight="800" letterSpacing="1">
              TENAX PROTECTION
            </text>
            <text x={labelX + 12} y={labelY + 39} fill="#E6ECF4" fontSize="12.5" fontWeight="700">
              SHORT {action.qty} ENTRY {action.avgPrice}
            </text>
          </g>
        ) : null}
      </svg>
      <p className="font-syslabel mt-1.5 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
        {provenanceLabel}
      </p>
      {action && outsideWindow ? (
        <p className="mt-1.5 border border-dashed border-ink/30 p-2.5 text-[12px] leading-[17px] text-mutedink">
          EXECUTION OUTSIDE CURRENT WINDOW — ENTRY {action.avgPrice} (TENAX RECEIPT)
        </p>
      ) : null}
    </div>
  );
}

/** Compact mandate bounds: narrow comparison tracks with canonical results. */
export function MandateRows({ rows }: { rows: readonly MandateVisualRow[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-3">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            {row.label}
          </p>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold leading-[18px]">
              {row.evaluated} <span className="font-syslabel text-[11px] font-normal uppercase tracking-[0.08em] text-mutedink">/ {row.boundValue}</span>
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-[3px] bg-ink/10">
              {row.fraction === null ? null : (
                <div
                  className={`h-full ${row.pass === false ? "bg-clay" : "bg-signal"}`}
                  style={{ width: `${Math.round(row.fraction * 100)}%` }}
                />
              )}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold leading-[17px] ${
              row.pass === null
                ? "border border-ink/30 text-ink"
                : row.pass
                  ? "bg-pass text-ink"
                  : "bg-clay text-ivory"
            }`}
          >
            {row.pass === null ? "—" : row.pass ? "PASS" : "REFUSED"}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Refusal as a compact horizontal banner: the canonical rejected alternative. */
export function RefusalBanner({
  value,
  pct,
  maxValue,
  maxPct,
  failedRules,
}: {
  readonly value: number;
  readonly pct: number;
  readonly maxValue: number;
  readonly maxPct: number;
  readonly failedRules: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border-2 border-clay p-4 sm:flex-row sm:items-center sm:gap-8 sm:p-5">
      <div className="flex items-center gap-4 sm:gap-5">
        <p className="state-mark bg-clay text-softwhite">✕ REFUSED</p>
        <p className="font-syslabel text-[34px] font-semibold leading-none tracking-[-0.02em] sm:text-[44px]">
          ${value} <span className="text-[18px] font-semibold tracking-normal">· {pct}%</span>
        </p>
      </div>
      <div className="min-w-0 flex-1 sm:border-l sm:border-ink/15 sm:pl-8">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          TENAX REFUSED · AUTHORITY MAX ${maxValue} · {maxPct}%
        </p>
        <p className="mt-1 text-[14px] leading-[20px]">
          Outside the authority you gave Tenax.
        </p>
        <p className="font-syslabel mt-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          {failedRules.join(" · ").toUpperCase() || "NO RULES RECORDED"}
        </p>
      </div>
    </div>
  );
}
