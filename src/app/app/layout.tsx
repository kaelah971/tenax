// Tenax Phase 1D — app shell: Capital / Events / Mandate / Activity.
// Cream field, quiet nav, unmissable DRY RUN environment chip on every view.
import Link from "next/link";
import type { ReactNode } from "react";

import { Chip } from "./_components/ui";

const NAV = [
  { href: "/app", label: "Capital" },
  { href: "/app/events", label: "Events" },
  { href: "/app/mandate", label: "Mandate" },
  { href: "/app/activity", label: "Activity" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="px-6 py-4 sm:px-10">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/app" className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold leading-[20px]">Tenax</span>
            <span className="hidden text-[11px] leading-[14px] text-muted sm:inline">
              Firm of purpose.
            </span>
          </Link>
          <nav className="hidden items-center gap-4 md:flex" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[15px] font-normal leading-[20px] text-muted hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <details className="md:hidden">
            <summary className="cursor-pointer list-none rounded-[10px] border border-secondaryborder bg-white px-4 py-2 text-[15px] leading-[20px]">
              Menu
            </summary>
            <nav className="absolute z-10 mt-2 flex flex-col gap-1 rounded-[10px] bg-white p-2 shadow-[0_6px_16px_rgba(0,0,0,0.08)]" aria-label="Primary mobile">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[10px] px-4 py-2 text-[15px] leading-[20px] text-ink hover:bg-secondaryhover"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
          <span className="ml-auto">
            <Chip tone="dryrun">DRY RUN</Chip>
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-6">{children}</main>
    </div>
  );
}
