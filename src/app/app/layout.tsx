// Tenax Phase 1E-C — app shell: ink authority bar, signal-yellow active
// route, compact mono DRY RUN indicator, living environment backdrop.
// Ivory field persists; depth comes from the fixed environment layer.
import Link from "next/link";
import type { ReactNode } from "react";

import { TenaxEnvironment } from "./_components/living";
import ShellNav from "./_components/ShellNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory/60 text-ink">
      <TenaxEnvironment />
      <header className="bg-ink text-softwhite shadow-[0_18px_44px_-20px_rgba(17,17,17,0.55)]">
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
          <span className="font-syslabel ml-auto border border-signal px-2 py-1 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal shadow-[0_0_18px_-6px_rgba(245,255,59,0.7)]">
            □ DRY_RUN
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-6">{children}</main>
    </div>
  );
}
