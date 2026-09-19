// Tenax Phase 1E-E — reference-correction pass.
//
// TenaxAgent is asset-backed: the final hooded-robot character lands at
// TENAX_AGENT_ASSET (/brand/tenax-agent.png). Until then an abstract frosted
// stand-in renders — the orb/icon direction is retired. State reads through
// the world around the asset (halo, badge, orbit, shimmer, float).
// Pure display mapping (agentPresence) stays unit-tested; rendering is
// covered by typecheck + production build.
import type { CSSProperties, ReactNode } from "react";

import AgentFigure from "./AgentFigure";

export type AgentState =
  | "idle"
  | "watching"
  | "analyzing"
  | "gate-check"
  | "waiting"
  | "approved"
  | "refused"
  | "complete";

export interface AgentPresence {
  readonly eyes: "soft" | "open" | "narrow" | "half" | "happy" | "flat" | "calm";
  readonly glow: "dim" | "signal" | "clay";
  readonly orbit: boolean;
  readonly scan: boolean;
  readonly label: string;
}

/** Pure mapping from agent state to expressive rendering. */
export function agentPresence(state: AgentState): AgentPresence {
  switch (state) {
    case "watching":
      return { eyes: "open", glow: "signal", orbit: false, scan: true, label: "WATCHING" };
    case "analyzing":
      return { eyes: "narrow", glow: "signal", orbit: true, scan: false, label: "ANALYZING" };
    case "gate-check":
      return { eyes: "open", glow: "signal", orbit: false, scan: true, label: "OBSERVING GATE" };
    case "waiting":
      return { eyes: "half", glow: "dim", orbit: false, scan: false, label: "WAITING" };
    case "approved":
      return { eyes: "happy", glow: "signal", orbit: false, scan: false, label: "CLEARED" };
    case "refused":
      return { eyes: "flat", glow: "clay", orbit: false, scan: false, label: "REFUSED" };
    case "complete":
      return { eyes: "calm", glow: "signal", orbit: false, scan: false, label: "COMPLETE" };
    case "idle":
    default:
      return { eyes: "soft", glow: "dim", orbit: false, scan: false, label: "IDLE" };
  }
}

/** NOTE: AgentEyes (orb-era SVG face) retired in 1E-E. The `eyes` field of
 * AgentPresence is kept as a unit-tested pure mapping only. */

/**
 * TENAX agent character — hooded robot family (full silhouette, visible
 * hood/garment, rounded dark screen face, glowing eyes, compact body).
 *
 * The final rendered character is an external image asset so it can be a
 * true premium 3D render: see TENAX_AGENT_ASSET. Until that asset lands, a
 * deliberately abstract frosted stand-in renders instead — the orb/icon
 * direction is retired and must not be re-polished as the final mascot.
 *
 * State reads through the world around the asset: surrounding halo glow,
 * small state badge, orbit ring (analyzing), shimmer (watching/gate-check),
 * and float. Never drawn onto the asset itself.
 */
export const TENAX_AGENT_ASSET = "/brand/tenax-agent.png";

export function TenaxAgent({
  state = "idle",
  size = 88,
  caption,
  className = "",
  assetSrc = TENAX_AGENT_ASSET,
}: {
  state?: AgentState;
  size?: number;
  caption?: string;
  className?: string;
  assetSrc?: string;
}) {
  const presence = agentPresence(state);
  const glowColor =
    presence.glow === "signal" ? "#F5FF3B" : presence.glow === "clay" ? "#C74B3B" : "#8a887e";
  const glowClass =
    presence.glow === "signal"
      ? "tx-agent-glow-pass"
      : presence.glow === "clay"
        ? "tx-agent-glow-clay"
        : "tx-agent-glow-dim";
  const haloClass =
    presence.glow === "signal"
      ? "agent-halo-signal"
      : presence.glow === "clay"
        ? "agent-halo-clay"
        : "agent-halo-dim";
  return (
    <figure
      className={`flex shrink-0 flex-col items-center gap-2 ${className}`}
      role="img"
      aria-label={`Tenax agent — ${presence.label}`}
      data-agent-state={state}
    >
      <div className={`tx-agent agent-stage ${haloClass} ${glowClass}`}>
        <span className="relative block" style={{ width: size, height: size }}>
          {presence.orbit ? (
            <svg
              viewBox="0 0 120 120"
              aria-hidden="true"
              className="tx-agent-orbit absolute inset-0 h-full w-full"
            >
              <circle cx="60" cy="60" r="54" stroke="#F5FF3B" strokeWidth="1.6" strokeDasharray="12 16" opacity="0.8" />
              <circle cx="60" cy="6" r="3" fill="#F5FF3B" />
            </svg>
          ) : null}
          <AgentFigure src={assetSrc} size={size} glowColor={glowColor} />
          {presence.scan ? <span className="agent-shimmer" aria-hidden="true" /> : null}
        </span>
      </div>
      {caption ? (
        <figcaption className="flex items-center gap-1.5 font-syslabel text-center text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: glowColor, boxShadow: `0 0 8px ${glowColor}` }}
          />
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Tenax environment: bloom, glow fields, grid, paths, blobs, grain. */
export function TenaxEnvironment({ bloom = false }: { bloom?: boolean }) {
  return (
    <div className="tx-env" aria-hidden="true">
      <div className={`tx-env-bloom${bloom ? " tx-env-bloom-pass" : ""}`} />
      <div className="tx-env-glow tx-env-glow-l" />
      <div className="tx-env-glow tx-env-glow-r" />
      <div className="tx-env-grid" />
      <div className="tx-env-path" />
      <div className="tx-env-path tx-env-path-right" />
      <div className="tx-env-blob tx-env-blob-a" />
      <div className="tx-env-blob tx-env-blob-b" />
      <div className="tx-env-shape" />
      <div className="tx-env-grain" />
    </div>
  );
}

/** Animated LIVE indicator. `hot=false` renders a quiet static marker. */
export function LiveDot({ label = "LIVE", hot = true }: { label?: string; hot?: boolean }) {
  return (
    <span className="live-indicator">
      <span
        className={`live-indicator-dot${hot ? "" : " live-indicator-dot-quiet"}`}
        aria-hidden="true"
      />
      <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em]">
        {label}
      </span>
    </span>
  );
}

/**
 * Decorative market-signal line for the Capital hero. Aria-hidden: it
 * illustrates signal activity and carries no price data — real figures stay
 * in the LIVE_SIGNAL panel with full provenance.
 */
export function Sparkline({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 84"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="txs-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F5FF3B" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#F5FF3B" stopOpacity="0.08" />
          <stop offset="1" stopColor="#F5FF3B" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="txs-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#111111" stopOpacity="0.45" />
          <stop offset="0.6" stopColor="#111111" />
          <stop offset="1" stopColor="#111111" />
        </linearGradient>
      </defs>
      <g fill="#111111" opacity="0.14">
        {Array.from({ length: 12 }, (_, c) =>
          Array.from({ length: 3 }, (_, r) => (
            <circle key={`${c}-${r}`} cx={14 + c * 24} cy={16 + r * 26} r="1" />
          )),
        )}
      </g>
      <path
        d="M0 62 L30 56 L55 60 L85 44 L110 50 L140 36 L165 42 L195 28 L225 34 L255 22 L300 26 L300 84 L0 84 Z"
        fill="url(#txs-fill)"
      />
      <path
        d="M0 62 L30 56 L55 60 L85 44 L110 50 L140 36 L165 42 L195 28 L225 34 L255 22 L300 26"
        fill="none"
        stroke="url(#txs-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="spark-draw"
      />
      <circle cx="255" cy="22" r="7" fill="#F5FF3B" opacity="0.25" className="spark-end" />
      <circle cx="255" cy="22" r="4" fill="#F5FF3B" stroke="#111111" strokeWidth="2" />
    </svg>
  );
}

/** Stagger wrapper: children rise in sequence via --i custom property. */
export function Stagger({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`tx-stagger ${className}`}>{children}</div>;
}

/** Index injector: clones children assigning --i for stagger/sequence. */
export function staggerStyle(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}
