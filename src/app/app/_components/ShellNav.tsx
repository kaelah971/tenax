// Client-side primary nav with true active-route highlighting.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/app", label: "Capital" },
  { href: "/app/events", label: "Events" },
  { href: "/app/mandate", label: "Mandate" },
  { href: "/app/activity", label: "Activity" },
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
        className="absolute z-10 mt-2 flex flex-col gap-1 rounded-[6px] bg-graphite p-2"
        aria-label="Primary mobile"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`font-syslabel px-4 py-2 text-[11px] uppercase leading-[20px] tracking-[0.08em] ${
                active ? "bg-signal font-bold text-ink" : "text-softwhite hover:bg-ink"
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
    <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`font-syslabel text-[11px] uppercase leading-[20px] tracking-[0.08em] ${
              active
                ? "anim-rail bg-signal px-1.5 py-0.5 font-bold text-ink"
                : "text-softwhite/70 hover:text-softwhite"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
