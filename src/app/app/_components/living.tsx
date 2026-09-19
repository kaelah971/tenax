// Tenax Phase 1E-D — premium living primitives (server-safe, CSS-only motion).
//
// TenaxAgent: an original hooded companion in the soft-3D family — rounded
// protective hood, black screen-face, subtle glowing eyes, Signal Yellow
// core, market-wave hem. Cute but intelligent; calm, watchful, trustworthy.
// Pure display mapping (agentPresence) stays unit-tested; rendering is
// covered by typecheck + production build.
import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";

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

function AgentEyes({ kind, glow }: { kind: AgentPresence["eyes"]; glow: string }) {
  const clay = "#C74B3B";
  if (kind === "happy") {
    return (
      <g stroke={glow} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M44 62c2.5-3.6 7.5-3.6 10 0" />
        <path d="M66 62c2.5-3.6 7.5-3.6 10 0" />
      </g>
    );
  }
  if (kind === "calm") {
    return (
      <g stroke={glow} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M44 61c2.5 2.8 7.5 2.8 10 0" />
        <path d="M66 61c2.5 2.8 7.5 2.8 10 0" />
      </g>
    );
  }
  if (kind === "flat") {
    return (
      <g stroke={clay} strokeWidth="3" strokeLinecap="round">
        <line x1="43" y1="62" x2="55" y2="62" />
        <line x1="65" y1="62" x2="77" y2="62" />
      </g>
    );
  }
  if (kind === "narrow") {
    return (
      <g fill={glow}>
        <rect x="42" y="59.5" width="14" height="5" rx="2.5" />
        <rect x="64" y="59.5" width="14" height="5" rx="2.5" />
      </g>
    );
  }
  if (kind === "half") {
    return (
      <g>
        <ellipse cx="49" cy="63" rx="5.5" ry="3" fill={glow} opacity="0.85" />
        <ellipse cx="71" cy="63" rx="5.5" ry="3" fill={glow} opacity="0.85" />
        <line x1="42" y1="59" x2="56" y2="59" stroke="#0A0A0A" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="64" y1="59" x2="78" y2="59" stroke="#0A0A0A" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    );
  }
  const ry = kind === "open" ? 7 : 5;
  const opacity = kind === "soft" ? 0.6 : 1;
  return (
    <g fill={glow} opacity={opacity}>
      <ellipse cx="49" cy="62" rx="5.5" ry={ry} />
      <ellipse cx="71" cy="62" rx="5.5" ry={ry} />
    </g>
  );
}

/**
 * TENAX hooded companion — soft pseudo-3D guardian. Layered graphite hood
 * with sheen + signal rim light, rounded black screen-face with glowing
 * eyes, Signal Yellow core gem, market-wave hem. Gentle float; expressive
 * changes carry state, never complex animation.
 */
export function TenaxAgent({
  state = "idle",
  size = 88,
  caption,
  className = "",
}: {
  state?: AgentState;
  size?: number;
  caption?: string;
  className?: string;
}) {
  const presence = agentPresence(state);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const hoodId = `txh-hood-${uid}`;
  const faceId = `txh-face-${uid}`;
  const eyeGlowId = `txh-eyeglow-${uid}`;
  const eyeColor = presence.glow === "clay" ? "#C74B3B" : "#F5FF3B";
  const core = eyeColor;
  const rim =
    presence.glow === "signal" ? "#F5FF3B" : presence.glow === "clay" ? "#C74B3B" : "#6E6D66";
  const glowClass =
    presence.glow === "signal" ? "tx-agent-glow-pass" : "tx-agent-glow-dim";
  return (
    <figure
      className={`flex shrink-0 flex-col items-center gap-1.5 ${className}`}
      role="img"
      aria-label={`Tenax agent — ${presence.label}`}
      data-agent-state={state}
    >
      <div className={`tx-agent ${glowClass}`}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 120 120"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={hoodId} x1="20" y1="8" x2="100" y2="114" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4a4a4a" />
              <stop offset="0.45" stopColor="#2b2b2b" />
              <stop offset="1" stopColor="#141414" />
            </linearGradient>
            <linearGradient id={faceId} x1="34" y1="40" x2="86" y2="82" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1c1c1c" />
              <stop offset="1" stopColor="#070707" />
            </linearGradient>
            <filter id={eyeGlowId} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {presence.orbit ? (
            <g className="tx-agent-orbit">
              <circle cx="60" cy="60" r="52" stroke="#F5FF3B" strokeWidth="1.6" strokeDasharray="12 16" opacity="0.8" />
              <circle cx="60" cy="8" r="3" fill="#F5FF3B" />
            </g>
          ) : null}
          {/* Hood: soft protective cloak */}
          <path
            d="M60 6C88 6 104 32 104 64c0 30-20 50-44 50S16 94 16 64C16 32 32 6 60 6Z"
            fill={`url(#${hoodId})`}
          />
          {/* Hood sheen: soft top-left light */}
          <ellipse cx="42" cy="30" rx="20" ry="12" fill="#FFFFFF" opacity="0.1" transform="rotate(-24 42 30)" />
          {/* Hood rim light: signal edge on the watchful side */}
          <path
            d="M60 6c28 0 44 26 44 58"
            stroke={rim}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={presence.glow === "dim" ? 0.45 : 0.95}
          />
          {/* Screen-face: rounded black visor */}
          <rect x="34" y="42" width="52" height="42" rx="21" fill={`url(#${faceId})`} />
          <rect x="34" y="42" width="52" height="42" rx="21" stroke="#000000" strokeWidth="2" />
          {/* Face glass reflection */}
          <rect x="40" y="47" width="18" height="6" rx="3" fill="#FFFFFF" opacity="0.09" transform="rotate(-8 40 47)" />
          <g filter={`url(#${eyeGlowId})`}>
            <AgentEyes kind={presence.eyes} glow={eyeColor} />
          </g>
          {presence.scan ? (
            <line x1="42" y1="74" x2="78" y2="74" stroke="#F5FF3B" strokeWidth="1.2" opacity="0.6" className="tx-agent-scan" />
          ) : null}
          {/* Core gem */}
          <circle cx="60" cy="99" r="5" fill={core} opacity={presence.glow === "dim" ? 0.6 : 1} />
          <circle cx="60" cy="99" r="8.5" stroke={core} strokeWidth="1" opacity="0.35" />
          {/* Market-wave hem */}
          <polyline
            points="40,108 46,108 49,104.5 52,109.5 55,106 59,106 62,102.5 65,106 70,106 74,103 77,106 80,106"
            stroke={core}
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.75"
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
