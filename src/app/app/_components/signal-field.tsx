// Tenax LEVEL 0 environment — the green signal field.
//
// One shared primitive for the public site and the application: a black
// base, low-opacity green light forms, blurred ribbon loops with brighter
// cores, optional violet AI light, vignette and film grain. Variants
// re-weight the same layers per page (CSS custom properties in
// globals.css) so pages feel related but never identical. Static,
// decorative, aria-hidden; no images, no animation loops.

export const SIGNAL_FIELD_VARIANTS = [
  "landing",
  "dashboard",
  "event",
  "protect",
  "analysis",
  "authority",
  "proof",
] as const;

export type SignalFieldVariant = (typeof SIGNAL_FIELD_VARIANTS)[number];

/** Pure route → environment mapping for the application shell. */
export function signalFieldForPath(pathname: string): SignalFieldVariant {
  if (pathname.startsWith("/app/events")) return "event";
  if (pathname.startsWith("/app/protect")) return "protect";
  if (pathname.startsWith("/app/analysis")) return "analysis";
  if (pathname.startsWith("/app/approval") || pathname.startsWith("/app/mandate")) return "authority";
  if (
    pathname.startsWith("/app/proof") ||
    pathname.startsWith("/app/receipts") ||
    pathname.startsWith("/app/paper-trading") ||
    pathname.startsWith("/app/activity") ||
    pathname.startsWith("/app/notifications")
  ) {
    return "proof";
  }
  return "dashboard";
}

function Ribbons({ core }: { core: boolean }) {
  const id = core ? "sf-core" : "sf-soft";
  const w = core ? 0.2 : 1;
  return (
    <svg
      className={core ? "tx-field-core" : "tx-field-ribbons"}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#63ff2a" stopOpacity="0" />
          <stop offset="0.22" stopColor="#63ff2a" stopOpacity={core ? 0.55 : 0.85} />
          <stop offset="0.48" stopColor="#123d16" stopOpacity="0.25" />
          <stop offset="0.72" stopColor="#87ff4d" stopOpacity={core ? 0.8 : 0.95} />
          <stop offset="1" stopColor="#63ff2a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#63ff2a" stopOpacity="0" />
          <stop offset="0.35" stopColor="#63ff2a" stopOpacity={core ? 0.45 : 0.7} />
          <stop offset="0.65" stopColor="#2c8a1c" stopOpacity="0.35" />
          <stop offset="1" stopColor="#63ff2a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse
        cx="1000"
        cy="360"
        rx="520"
        ry="200"
        transform="rotate(-14 1000 360)"
        fill="none"
        stroke={`url(#${id}-a)`}
        strokeWidth={96 * w}
      />
      <path
        d="M-120 830 C 240 650 520 990 860 770 S 1400 620 1720 850"
        fill="none"
        stroke={`url(#${id}-b)`}
        strokeWidth={78 * w}
        strokeLinecap="round"
      />
      <ellipse
        cx="1330"
        cy="770"
        rx="250"
        ry="110"
        transform="rotate(16 1330 770)"
        fill="none"
        stroke={`url(#${id}-a)`}
        strokeWidth={54 * w}
      />
    </svg>
  );
}

export function SignalField({ variant }: { variant: SignalFieldVariant }) {
  return (
    <div className={`tx-field tx-field--${variant}`} data-field={variant} aria-hidden="true">
      <div className="tx-field-base" />
      <div className="tx-field-form tx-field-form-a" />
      <div className="tx-field-form tx-field-form-b" />
      <Ribbons core={false} />
      <Ribbons core />
      <div className="tx-field-ai" />
      <div className="tx-field-grid" />
      <div className="tx-field-vignette" />
      <div className="tx-field-grain" />
    </div>
  );
}
