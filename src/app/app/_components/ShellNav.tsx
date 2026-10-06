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
        className="tx-authority-dock absolute right-0 z-20 mt-2 flex min-w-48 flex-col gap-1 rounded-[14px] p-2"
        aria-label="Primary mobile"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
                className={`font-syslabel min-h-11 px-4 py-3 text-[11px] uppercase leading-[20px] tracking-[0.08em] ${
                active
                  ? "rounded-[7px] bg-signal font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_12px_-8px_rgba(17,17,17,0.65)]"
                  : "rounded-[7px] text-softwhite hover:bg-softwhite/10"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="hidden items-center gap-1 rounded-[11px] border border-softwhite/10 bg-softwhite/[0.035] p-1 md:flex" aria-label="Primary">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`font-syslabel text-[11px] uppercase leading-[20px] tracking-[0.08em] ${
              active
                ? "tx-nav-active rounded-[7px] bg-signal font-bold text-ink"
                : "rounded-[7px] text-softwhite/65 hover:bg-softwhite/[0.08] hover:text-softwhite"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
