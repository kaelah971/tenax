// Client-side primary nav with true active-route highlighting.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/app", label: "CAPITAL" },
  { href: "/app/events", label: "EVENTS" },
  { href: "/app/mandate", label: "MANDATE" },
  { href: "/app/proof", label: "PROOF" },
  { href: "/app/paper-trading", label: "PAPER TRADING" },
  { href: "/app/activity", label: "ACTIVITY" },
  { href: "/app/connected", label: "PERSONAL ACCOUNTS" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ShellNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  if (mobile) {
    return (
      <nav
        className="tx-authority-dock absolute right-4 z-20 mt-2 flex min-w-56 flex-col gap-1 rounded-[14px] p-2"
        aria-label="Primary mobile"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`font-syslabel min-h-11 rounded-[8px] px-4 py-3 text-[11px] uppercase leading-[20px] tracking-[0.1em] ${
                active
                  ? "bg-signal/10 font-semibold text-signal shadow-[inset_2px_0_0_var(--color-signal)]"
                  : "text-softwhite/75 hover:bg-softwhite/[0.06] hover:text-softwhite"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {/* Plain anchor on purpose: leaving /app/* must be a full navigation, never a client transition. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="font-syslabel mt-1 min-h-11 rounded-[8px] px-4 py-3 text-[11px] uppercase leading-[20px] tracking-[0.1em] text-softwhite/60 hover:bg-softwhite/[0.06] hover:text-softwhite"
        >
          ← BACK TO SITE
        </a>
      </nav>
    );
  }
  return (
    <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`font-syslabel rounded-[7px] px-2.5 py-2 text-[11px] uppercase leading-[16px] tracking-[0.1em] transition-colors lg:px-3 ${
              active
                ? "tx-nav-active font-semibold text-signal"
                : "text-ink/55 hover:bg-ink/[0.04] hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
