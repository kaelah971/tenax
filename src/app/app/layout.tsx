// Tenax app shell: thin dark glass command bar shared with the public site,
// teal active route, compact mono execution-mode indicator, atmospheric
// environment backdrop.
// The mode badge is server-resolved per request via the canonical resolver
// (TENAX_EXECUTION_MODE, default DRY_RUN): capability display only, never
// an execution claim, never client-decided, never a secret.
import type { ReactNode } from "react";

import { resolveExecutionMode } from "@/lib/tenax/execution";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { getUnreadNotificationCount } from "@/lib/tenax/notifications";
import { TenaxWordmark } from "./_components/brand";
import AppSignalField from "./_components/AppSignalField";
import NotificationBell from "./_components/NotificationBell";
import SessionBootstrap from "./_components/SessionBootstrap";
import ShellNav from "./_components/ShellNav";
import "./observatory.css";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  const executionMode = resolveExecutionMode(process.env);
  const initialUnread = getUnreadNotificationCount(getTenaxDevStore());
  return (
    <div className="tx-observatory-app min-h-screen text-ink">
      <AppSignalField />
      <SessionBootstrap />
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/75 backdrop-blur-lg">
        <div className="relative mx-auto flex min-h-16 w-full max-w-[1408px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:gap-x-6 sm:px-6">
          <TenaxWordmark href="/app" label="Tenax Capital home" />
          <ShellNav />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="font-syslabel inline-flex items-center gap-2 rounded-full border border-signal/40 bg-signal/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase leading-[14px] tracking-[0.1em] text-signal">
              <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_8px_var(--color-signal)]" aria-hidden="true" />
              □ {executionMode}
            </span>
            <NotificationBell initialUnread={initialUnread} />
            <details className="md:hidden">
              <summary className="font-syslabel flex min-h-11 cursor-pointer list-none items-center rounded-full border border-line px-3 text-[11px] uppercase tracking-[0.1em] text-ink/80 transition-colors hover:border-ink/30 hover:text-ink">
                Menu
              </summary>
              <ShellNav mobile />
            </details>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1408px] px-4 pb-24 sm:px-6">{children}</main>
    </div>
  );
}
