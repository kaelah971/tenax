// Client-side analyze trigger. Authority stays server-side: this button only
// POSTs the raw intent text and follows the returned flowId.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AnalyzeButton({
  rawText,
  disabled,
  disabledReason,
}: {
  rawText: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onAnalyze() {
    setState("working");
    setMessage("");
    try {
      const res = await fetch("/api/protection/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const body = (await res.json()) as { ok: boolean; flowId?: string; error?: { message?: string } };
      if (!res.ok || !body.ok || !body.flowId) {
        throw new Error(body.error?.message ?? "Analysis failed");
      }
      router.push(`/app/analysis/${body.flowId}`);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Analysis failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onAnalyze}
        disabled={disabled || state === "working"}
        className="inline-flex h-12 items-center justify-center rounded-[10px] bg-deep px-6 text-[15px] font-semibold leading-[20px] text-white shadow-[0_8px_20px_rgba(78,128,232,0.25)] hover:bg-pressed disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "working" ? "Analyzing…" : "Analyze protection ↗"}
      </button>
      {disabled && disabledReason ? (
        <p className="text-[13px] leading-[18px] text-muted">{disabledReason}</p>
      ) : null}
      {state === "error" ? (
        <p role="alert" className="text-[13px] font-medium leading-[18px] text-clay">
          {message}
        </p>
      ) : null}
    </div>
  );
}
