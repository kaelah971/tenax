// Tenax Phase 1E-C — app shell: ink authority bar, signal-yellow active
// route, compact mono execution-mode indicator, living environment backdrop.
// Ivory field persists; depth comes from the fixed environment layer.
// The mode badge is server-resolved per request via the canonical resolver
// (TENAX_EXECUTION_MODE, default DRY_RUN): capability display only, never
// an execution claim, never client-decided, never a secret.
import Link from "next/link";
import type { ReactNode } from "react";

import { resolveExecutionMode } from "@/lib/tenax/execution";
import { TenaxEnvironment } from "./_components/living";
import ShellNav from "./_components/ShellNav";
import "./observatory.css";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  const executionMode = resolveExecutionMode(process.env);
  return (
    <div className="tx-observatory-app min-h-screen bg-ivory/60 text-ink">
      <TenaxEnvironment />
      <header className="px-3 pt-3 text-softwhite sm:px-5 sm:pt-5">
        <div className="tx-authority-dock mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-3 rounded-[18px] px-4 py-3 sm:px-6 sm:py-3.5">
          <Link href="/app" className="flex items-center gap-2.5" aria-label="Tenax Capital home">
            <span className="inline-block h-4 w-4 bg-signal" aria-hidden="true" />
            <span className="text-[17px] font-extrabold leading-[20px] tracking-[0.08em]">
              TENAX
            </span>
          </Link>
          <ShellNav />
          <details className="md:hidden">
            <summary className="font-syslabel min-h-11 cursor-pointer list-none rounded-[10px] border border-softwhite/25 bg-softwhite/5 px-3 py-2.5 text-[11px] uppercase leading-[20px] tracking-[0.08em] transition-colors hover:bg-softwhite/10">
              Menu
            </summary>
            <ShellNav mobile />
          </details>
          <span className="font-syslabel ml-auto rounded-[7px] border border-signal/70 bg-signal/[0.08] px-2.5 py-1.5 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_18px_-6px_rgba(245,255,59,0.7)]">
            □ {executionMode}
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-6">{children}</main>
    </div>
  );
}
