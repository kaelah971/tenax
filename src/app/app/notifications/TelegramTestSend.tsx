// Client-side Telegram test send: one explicit click POSTs to the test
// route; nothing fires on mount, nothing is sent during implementation
// or review. Transient result only — no records, no navigation.
"use client";

import { useState } from "react";

type SendState = "idle" | "sending" | "sent" | "failed";

export default function TelegramTestSend() {
  const [state, setState] = useState<SendState>("idle");

  async function onSend() {
    setState("sending");
    try {
      const res = await fetch("/api/notifications/telegram-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const parsed = (await res.json()) as { ok?: boolean };
      setState(res.ok && parsed.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void onSend()}
        disabled={state === "sending"}
        className="font-syslabel min-h-11 rounded-[9px] border border-ink/70 bg-softwhite/30 px-4 py-2 text-[12px] font-bold uppercase leading-[18px] tracking-[0.08em] hover:bg-ink hover:text-softwhite disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Send test alert"}
      </button>
      {state === "sent" ? (
        <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-pass">
          Test alert sent.
        </p>
      ) : null}
      {state === "failed" ? (
        <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-clay">
          Test alert failed — check deployment configuration.
        </p>
      ) : null}
    </div>
  );
}
