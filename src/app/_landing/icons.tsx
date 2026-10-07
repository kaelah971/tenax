// Line icons for the landing page, drawn on a 24px grid in the Tenax mark
// language (pillars, apertures, records). Decorative: always aria-hidden.
import type { ReactNode } from "react";

function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** AI intent: a proposal node emitting toward an open target. */
export function IntentIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="7" cy="12" r="3" />
      <path d="M10 12h5" strokeDasharray="1.5 2" />
      <path d="M15 8.5 19 12l-4 3.5" />
      <path d="M7 5v1.5M7 17.5V19M2.5 12H1" />
    </Icon>
  );
}

/** Mandate gate: two pillars and the aperture between them. */
export function GateIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="4" y="4" width="3.5" height="16" rx="1" />
      <rect x="16.5" y="4" width="3.5" height="16" rx="1" />
      <path d="M12 7.5v9" />
      <path d="M10 10l2-2.5 2 2.5" />
    </Icon>
  );
}

/** Decision evidence: a sealed record with linked lines. */
export function EvidenceIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 15.5h4" />
      <circle cx="16.5" cy="18" r="2.2" />
    </Icon>
  );
}

export function McpIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01M12 10v4" />
    </Icon>
  );
}

export function DemoIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M4 18 9 12l4 3 7-8" />
      <path d="M16 7h4v4" />
      <path d="M3 21h18" strokeDasharray="1.5 2.5" />
    </Icon>
  );
}

export function AnalysisIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </Icon>
  );
}

export function MandateIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function ArrowLeftIcon() {
  return (
    <Icon size={18}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function ArrowRightIcon() {
  return (
    <Icon size={18}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}
