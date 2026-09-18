// Client-side approve → execution-preview panel. Every step POSTs to the
// server; nothing here asserts authority, it only follows server responses.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DRY_RUN_PRE_NOTICE, approveCta } from "../../_copy";

type Phase = "ready" | "approving" | "approved" | "executing" | "error";

export default function ApproveExecutePanel({
  flowId,
  tradeValueUsdt,
}: {
  flowId: string;
  tradeValueUsdt: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [message, setMessage] = useState("");

  async function post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json()) as { ok: boolean; error?: { message?: string } };
    if (!res.ok || !parsed.ok) throw new Error(parsed.error?.message ?? "Request failed");
  }

  async function onApprove() {
    setPhase("approving");
    setMessage("");
    try {
      await post("/api/protection/approve", { flowId, actor: "human" });
      setPhase("approved");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Approval failed");
    }
  }

  async function onExecute() {
    setPhase("executing");
    setMessage("");
    try {
      await post("/api/protection/execute", { flowId });
      router.push(`/app/receipts/${flowId}`);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Execution preview failed");
    }
  }

  if (phase === "approved" || phase === "executing") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[16px] leading-[24px]">
          Approved — one action authorized. {DRY_RUN_PRE_NOTICE}
        </p>
        <button
          type="button"
          onClick={onExecute}
          disabled={phase === "executing"}
          className="inline-flex h-12 items-center justify-center rounded-[10px] bg-deep px-6 text-[15px] font-semibold leading-[20px] text-white shadow-[0_8px_20px_rgba(78,128,232,0.25)] hover:bg-pressed disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "executing" ? "Creating preview…" : "Create execution preview ↗"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={phase === "approving"}
        className="inline-flex h-12 items-center justify-center rounded-[10px] bg-deep px-6 text-[15px] font-semibold leading-[20px] text-white shadow-[0_8px_20px_rgba(78,128,232,0.25)] hover:bg-pressed disabled:cursor-not-allowed disabled:opacity-50"
      >
        {phase === "approving" ? "Approving…" : `${approveCta(tradeValueUsdt)} ↗`}
      </button>
      {phase === "error" ? (
        <p role="alert" className="text-[13px] font-medium leading-[18px] text-clay">
          {message}
        </p>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted">
          One action, one approval. {DRY_RUN_PRE_NOTICE}
        </p>
      )}
    </div>
  );
}
