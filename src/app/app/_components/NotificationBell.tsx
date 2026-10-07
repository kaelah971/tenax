// Client-side notification bell for the Tenax shell. Fetches the
// process-local list on mount and whenever the panel opens (fresh after
// navigations, which is when new notifications land). Clicking an item
// marks it read, then navigates to its canonical target. No polling,
// no provider calls, no secrets.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Notification } from "@/lib/tenax/notifications";

interface BellState {
  readonly unreadCount: number;
  readonly notifications: Notification[];
}

const TARGET_LABEL: Record<Notification["target"], string> = {
  ANALYSIS: "View analysis",
  APPROVAL: "Review approval",
  RECEIPT: "View receipt",
  MANDATE: "View mandate",
  ACTIVITY: "View activity",
};

function severityClass(severity: Notification["severity"]): string {
  switch (severity) {
    case "WARNING":
      return "bg-clay text-softwhite";
    case "ATTENTION":
      return "bg-signal text-ink";
    case "SUCCESS":
      return "bg-pass text-ink";
    default:
      return "bg-softwhite/15 text-softwhite";
  }
}

function formatTime(createdAt: string): string {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return createdAt;
  const date = new Date(ms);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<BellState>({ unreadCount: initialUnread, notifications: [] });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const parsed = (await res.json()) as {
        ok?: boolean;
        unreadCount?: number;
        notifications?: Notification[];
      };
      if (res.ok && parsed.ok) {
        setState({
          unreadCount: typeof parsed.unreadCount === "number" ? parsed.unreadCount : 0,
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        });
      }
    } catch {
      // Bell degrades to its last known state; in-app pages still work.
    }
  }, []);

  // Initial load on mount via a settled-promise callback (never a
  // synchronous setState in the effect body).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications", { cache: "no-store" })
      .then(async (res) => ({ res, parsed: (await res.json()) as {
        ok?: boolean;
        unreadCount?: number;
        notifications?: Notification[];
      } }))
      .then(({ res, parsed }) => {
        if (cancelled || !res.ok || !parsed.ok) return;
        setState({
          unreadCount: typeof parsed.unreadCount === "number" ? parsed.unreadCount : 0,
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function openPanel() {
    setOpen((was) => {
      if (!was) void refresh();
      return !was;
    });
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } finally {
      await refresh();
    }
  }

  async function openNotification(item: Notification) {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
    } finally {
      setOpen(false);
      router.push(item.targetHref);
    }
  }

  const latest = state.notifications.slice(0, 6);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void openPanel()}
        aria-label={state.unreadCount > 0 ? `Notifications, ${state.unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className="font-syslabel relative flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-softwhite/25 bg-softwhite/5 px-2.5 py-2 text-[11px] uppercase leading-[20px] tracking-[0.08em] transition-colors hover:bg-softwhite/10"
      >
        <span aria-hidden="true">◉</span>
        {state.unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 text-[11px] font-bold leading-[14px] text-ink">
            {state.unreadCount > 9 ? "9+" : state.unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="tx-authority-dock absolute right-0 z-30 mt-2 flex w-[min(92vw,360px)] flex-col gap-1 rounded-[14px] p-3"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/70">
              NOTIFICATIONS
            </p>
            <div className="flex items-center gap-2">
              {state.unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="font-syslabel rounded-[7px] px-2 py-1.5 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal hover:bg-softwhite/10"
                >
                  Mark all read
                </button>
              ) : null}
              <Link
                href="/app/notifications"
                onClick={() => setOpen(false)}
                className="font-syslabel rounded-[7px] px-2 py-1.5 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/70 hover:bg-softwhite/10 hover:text-softwhite"
              >
                View all
              </Link>
            </div>
          </div>
          {latest.length === 0 ? (
            <p className="font-syslabel rounded-[9px] bg-softwhite/5 px-3 py-4 text-[11px] uppercase leading-[18px] tracking-[0.08em] text-softwhite/60">
              Nothing needs you. Tenax will speak up here first.
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {latest.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openNotification(item)}
                    className={`flex w-full flex-col gap-1 rounded-[9px] px-3 py-2.5 text-left hover:bg-softwhite/10 ${
                      item.status === "UNREAD" ? "bg-softwhite/[0.06]" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`font-syslabel rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-[14px] tracking-[0.08em] ${severityClass(item.severity)}`}
                      >
                        {item.severity}
                      </span>
                      {item.status === "UNREAD" ? (
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal" aria-label="Unread" />
                      ) : null}
                      <span className="font-syslabel ml-auto text-[10px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/50">
                        {formatTime(item.createdAt)}
                      </span>
                    </span>
                    <span className="text-[13px] font-bold leading-[18px] text-softwhite">
                      {item.title}
                    </span>
                    <span className="text-[12px] leading-[17px] text-softwhite/70">{item.body}</span>
                    <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
                      {TARGET_LABEL[item.target]} →
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
