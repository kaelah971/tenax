// Mobile navigation overlay for the public landing page.
//
// Replaces the old <details> dropdown, which rendered menu links into the
// hero stacking context over a translucent surface (unreadable collisions)
// and depended on backdrop-filter, which mispaints in iOS WKWebView
// (Telegram in-app browser) as transparency or full-page black.
//
// This overlay is deliberately boring for compositor safety:
// - fixed inset-0 with a SOLID opaque background (no translucency,
//   no backdrop-filter anywhere in this tree)
// - very high z-index above header glows and the fixed signal field
// - its own scroll container; body scroll locked while open, restored
//   exactly on close/unmount/navigation (no stale locks, no stranded
//   overlay — it unmounts fully when closed)
// - closes on Escape, on link activation (route change), and on
//   browser back/forward (pathname change)
// - focus moves into the dialog on open and returns to MENU on close
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NAV_LINKS } from "./nav-links";

export default function MobileMenu() {
  // Keyed by route so any navigation (link tap, back, forward) remounts
  // the menu in its closed initial state — no state resets in effects.
  const pathname = usePathname();
  return <MenuInner key={pathname} />;
}

function MenuInner() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Lock body scroll while open; restore the exact prior value on
  // close/unmount so no stale lock can ever strand the page.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      trigger?.focus();
    };
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);

  return (
    <div className="ml-auto md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="tenax-mobile-menu"
        className="font-syslabel flex min-h-11 cursor-pointer items-center rounded-[10px] border border-line px-4 text-[11px] uppercase tracking-[0.14em] text-ink/80 transition-colors hover:border-ink/30 hover:text-ink"
      >
        MENU
      </button>
      {open ? (
        <div
          id="tenax-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-ivory"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
            <span className="font-display text-[22px] font-bold uppercase leading-none tracking-[0.12em] text-ink">
              Tenax
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="font-syslabel flex min-h-11 cursor-pointer items-center rounded-[10px] border border-line px-4 text-[11px] uppercase tracking-[0.14em] text-ink/80 transition-colors hover:border-ink/30 hover:text-ink"
            >
              CLOSE
            </button>
          </div>
          <nav aria-label="Mobile" className="flex flex-1 flex-col gap-1 px-5 py-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="font-syslabel rounded-[10px] border border-line bg-softwhite px-5 py-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink/40"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/app"
              onClick={() => setOpen(false)}
              className="font-syslabel mt-3 rounded-[10px] bg-signal px-5 py-4 text-[13px] font-bold uppercase tracking-[0.12em] text-ink transition-transform active:scale-[0.99]"
            >
              OPEN APP →
            </Link>
          </nav>
          <p className="shrink-0 px-5 pb-8 font-syslabel text-[10px] uppercase leading-[16px] tracking-[0.14em] text-ink/50">
            AI CAN PROPOSE · IT CANNOT AUTHORIZE ITSELF
          </p>
        </div>
      ) : null}
    </div>
  );
}
