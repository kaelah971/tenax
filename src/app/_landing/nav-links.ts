// Shared landing navigation links (single source of truth).
//
// Imported by the server-rendered landing header (desktop nav) and the
// client mobile overlay. Labels/hrefs live here so the two surfaces can
// never drift apart.

export interface LandingNavLink {
  readonly label: string;
  readonly href: string;
}

export const NAV_LINKS: readonly LandingNavLink[] = [
  { label: "Product", href: "#product" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Authority", href: "#authority" },
  { label: "Evidence", href: "/app/proof" },
] as const;
