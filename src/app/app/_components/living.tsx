// Tenax Phase 1E-C — premium living primitives (server-safe, CSS-only motion).
//
// TenaxAgent (Sentinel): an original SVG guardian — ink/graphite body,
// glowing eyes, Signal Yellow core, shield motif, market-wave detail.
// Pure display mapping (agentPresence) stays unit-tested; rendering is
// covered by typecheck + production build.
import type { CSSProperties, ReactNode } from "react";

export type AgentState =
  | "idle"
  | "watching"
  | "analyzing"
  | "gate-check"
  | "approved"
  | "refused"
  | "complete";

export interface AgentPresence {
  readonly eyes: "soft" | "open" | "narrow" | "happy" | "flat" | "calm";
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

function AgentEyes({ kind }: { kind: AgentPresence["eyes"] }) {
  const ink = "#111111";
  const glowYellow = "#F5FF3B";
  const glowClay = "#C74B3B";
  if (kind === "happy") {
    return (
      <g stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M25 30c2.5-3.4 7-3.4 9.5 0" />
        <path d="M46 30c2.5-3.4 7-3.4 9.5 0" />
      </g>
    );
  }
  if (kind === "calm") {
    return (
      <g stroke={ink} strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M25 30c2.5 2.6 7 2.6 9.5 0" />
        <path d="M46 30c2.5 2.6 7 2.6 9.5 0" />
      </g>
    );
  }
  if (kind === "flat") {
    return (
      <g stroke={glowClay} strokeWidth="2.4" strokeLinecap="round">
        <line x1="24" y1="30" x2="35" y2="30" />
        <line x1="45" y1="30" x2="56" y2="30" />
      </g>
    );
  }
  if (kind === "narrow") {
    return (
      <g fill={glowYellow}>
        <rect x="23" y="28" width="13" height="4.6" rx="2.3" />
        <rect x="44" y="28" width="13" height="4.6" rx="2.3" />
      </g>
    );
  }
  const ry = kind === "open" ? 6 : 4.4;
  return (
    <g fill={glowYellow}>
      <ellipse cx="29.5" cy="30" rx="5" ry={ry} />
      <ellipse cx="50.5" cy="30" rx="5" ry={ry} />
      <circle cx="29.5" cy="30" r="1.6" fill="#111111" />
      <circle cx="50.5" cy="30" r="1.6" fill="#111111" />
    </g>
  );
}

/**
 * TENAX SENTINEL — small rounded guardian orb. Ink/graphite body, glowing
 * eyes, Signal Yellow core, shield ring, market-wave detail. Gentle float;
 * expressive changes carry state, never complex animation.
 */
export function TenaxAgent({
  state = "idle",
  size = 88,
  caption,
}: {
  state?: AgentState;
  size?: number;
  caption?: string;
}) {
  const presence = agentPresence(state);
  const core = presence.glow === "clay" ? "#C74B3B" : "#F5FF3B";
  const glowClass =
    presence.glow === "signal" ? "tx-agent-glow-pass" : "tx-agent-glow-dim";
  return (
    <figure
      className="flex shrink-0 flex-col items-center gap-1.5"
      role="img"
      aria-label={`Tenax Sentinel — ${presence.label}`}
      data-agent-state={state}
    >
      <div className={`tx-agent ${glowClass}`}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 80 80"
          fill="none"
          aria-hidden="true"
        >
          {presence.orbit ? (
            <g className="tx-agent-orbit">
              <circle cx="40" cy="38" r="31" stroke="#F5FF3B" strokeWidth="1.6" strokeDasharray="10 14" opacity="0.85" />
              <circle cx="40" cy="7" r="2.6" fill="#F5FF3B" />
            </g>
          ) : (
            <path
              d="M40 4l22 8v12c0 14-9.5 24-22 28C27.5 48 18 38 18 24V12l22-8z"
              stroke={presence.glow === "signal" ? "#F5FF3B" : "#6E6D66"}
              strokeWidth="1.6"
              opacity="0.9"
            />
          )}
          <rect x="16" y="14" width="48" height="48" rx="20" fill="#242424" />
          <rect x="16" y="14" width="48" height="48" rx="20" fill="url(#txa-sheen)" />
          <rect x="16" y="14" width="48" height="48" rx="20" stroke="#111111" strokeWidth="2" />
          <defs>
            <linearGradient id="txa-sheen" x1="16" y1="14" x2="64" y2="62" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3d3d3d" />
              <stop offset="0.55" stopColor="#242424" stopOpacity="0.4" />
              <stop offset="1" stopColor="#111111" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <AgentEyes kind={presence.eyes} />
          {presence.scan ? (
            <line x1="26" y1="40" x2="54" y2="40" stroke="#F5FF3B" strokeWidth="1.2" opacity="0.7" className="tx-agent-scan" />
          ) : null}
          <circle cx="40" cy="50" r="5" fill={core} opacity={presence.glow === "dim" ? 0.55 : 1} />
          <circle cx="40" cy="50" r="8.5" stroke={core} strokeWidth="1" opacity="0.4" />
          <polyline
            points="30,57 35,57 37.5,53.5 40,58.5 42.5,55 45,55 48,51.5 50,55"
            stroke={core}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        </svg>
      </div>
      {caption ? (
        <figcaption className="font-syslabel text-center text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Fixed Tenax environment: bloom, grid, decision paths, blobs, grain. */
export function TenaxEnvironment({ bloom = false }: { bloom?: boolean }) {
  return (
    <div className="tx-env" aria-hidden="true">
      <div className={`tx-env-bloom${bloom ? " tx-env-bloom-pass" : ""}`} />
      <div className="tx-env-grid" />
      <div className="tx-env-path" />
      <div className="tx-env-path tx-env-path-right" />
      <div className="tx-env-blob tx-env-blob-a" />
      <div className="tx-env-blob tx-env-blob-b" />
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
      viewBox="0 0 300 72"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="txs-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F5FF3B" stopOpacity="0.5" />
          <stop offset="1" stopColor="#F5FF3B" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 52 L30 46 L55 50 L85 34 L110 40 L140 26 L165 32 L195 18 L225 24 L255 12 L300 16 L300 72 L0 72 Z"
        fill="url(#txs-fill)"
      />
      <path
        d="M0 52 L30 46 L55 50 L85 34 L110 40 L140 26 L165 32 L195 18 L225 24 L255 12 L300 16"
        fill="none"
        stroke="#111111"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="spark-draw"
      />
      <circle cx="255" cy="12" r="4" fill="#F5FF3B" stroke="#111111" strokeWidth="2" className="spark-end" />
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
