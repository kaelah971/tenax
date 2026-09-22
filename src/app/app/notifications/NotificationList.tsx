// Client-side notification list: click-to-read navigation plus
// mark-all-read, backed by the read API. Receives server-rendered items;
// refreshes the route after mutations so server state stays canonical.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Notification } from "@/lib/tenax/notifications";

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
      return "bg-pass text-white";
    default:
      return "bg-ink text-softwhite";
  }
}

function formatTime(createdAt: string): string {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return createdAt;
  const date = new Date(ms);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function NotificationList({ items }: { items: Notification[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function openNotification(item: Notification) {
    setBusy(true);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
    } finally {
      router.push(item.targetHref);
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  if (items.length === 0) {
    return (
      <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
        Nothing here. Tenax speaks up only when it needs you or acts.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={busy}
          className="font-syslabel min-h-11 rounded-[9px] border border-ink/70 bg-softwhite/30 px-4 py-2 text-[12px] font-bold uppercase leading-[18px] tracking-[0.08em] hover:bg-ink hover:text-softwhite disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark all as read
        </button>
      </div>
      <ol className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="border-t border-ink/15 py-4">
            <button
              type="button"
              onClick={() => void openNotification(item)}
              disabled={busy}
              className="flex w-full flex-col gap-1.5 text-left disabled:cursor-wait"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-syslabel rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase leading-[16px] tracking-[0.08em] ${severityClass(item.severity)}`}
                >
                  {item.severity}
                </span>
                {item.status === "UNREAD" ? (
                  <span className="font-syslabel text-[11px] font-bold uppercase leading-[16px] tracking-[0.08em] text-ink">
                    ● Unread
                  </span>
                ) : (
                  <span className="font-syslabel text-[11px] uppercase leading-[16px] tracking-[0.08em] text-mutedink">
                    Read
                  </span>
                )}
                <span className="font-syslabel ml-auto text-[11px] uppercase leading-[16px] tracking-[0.08em] text-mutedink">
                  {formatTime(item.createdAt)}
                </span>
              </span>
              <span className="text-[17px] font-bold leading-[24px]">{item.title}</span>
              <span className="max-w-3xl text-[14px] leading-[20px] text-mutedink">{item.body}</span>
              <span className="font-syslabel text-[11px] uppercase leading-[16px] tracking-[0.08em] underline decoration-signal underline-offset-4">
                {TARGET_LABEL[item.target]} →
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
