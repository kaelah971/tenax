// Tenax wordmark shared by the public site and the application shell.
// The mark is the Mandate Gate seen head-on: two authority pillars with a
// lit teal aperture between them. Server-safe, decorative SVG only.
import Link from "next/link";

export function TenaxMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="6.25" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
      <rect x="6" y="6" width="3" height="12" rx="1" fill="currentColor" />
      <rect x="15" y="6" width="3" height="12" rx="1" fill="currentColor" />
      <rect x="10.75" y="8.5" width="2.5" height="7" rx="1.25" fill="var(--color-signal)" />
    </svg>
  );
}

export function TenaxWordmark({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2.5 text-ink" aria-label={label}>
      <TenaxMark />
      <span className="font-display text-[22px] font-bold uppercase leading-none tracking-[0.12em]">Tenax</span>
    </Link>
  );
}
