// Tenax Phase 1E-A — app shell: ink authority bar, signal-yellow active
// route, compact mono DRY RUN indicator. Cream field persists below.
import Link from "next/link";
import type { ReactNode } from "react";

import ShellNav from "./_components/ShellNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory text-ink">
      <header className="bg-ink text-softwhite">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
          <Link href="/app" className="flex items-center gap-2.5" aria-label="Tenax Capital home">
            <span className="inline-block h-4 w-4 bg-signal" aria-hidden="true" />
            <span className="text-[17px] font-extrabold leading-[20px] tracking-[0.08em]">
              TENAX
            </span>
          </Link>
          <ShellNav />
          <details className="md:hidden">
            <summary className="font-syslabel cursor-pointer list-none border border-softwhite/30 px-3 py-1.5 text-[11px] uppercase leading-[20px] tracking-[0.08em]">
              Menu
            </summary>
            <ShellNav mobile />
          </details>
          <span className="font-syslabel ml-auto border border-signal px-2 py-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
            □ DRY_RUN
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-6">{children}</main>
    </div>
  );
}
