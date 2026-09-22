// Client-side RUN TENAX AGENT panel. One explicit click POSTs a single
// agent-cycle invocation; nothing here executes, approves, or asserts
// authority — it only follows server responses. This is NOT an Approve
// button: authority was granted earlier by activating the Standing Mandate.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Phase = "ready" | "running" | "done" | "error";

interface CycleReply {
  readonly ok: boolean;
  readonly outcome?: string;
  readonly receipt?: { receiptId?: string };
  readonly error?: { message?: string };
}

async function postCycle(flowId: string): Promise<CycleReply> {
  const res = await fetch("/api/protection/agent-cycle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flowId }),
  });
  const parsed = (await res.json()) as CycleReply;
  if (!res.ok || !parsed.ok) throw new Error(parsed.error?.message ?? "Agent cycle failed");
  return parsed;
}

export default function RunAgentPanel({ flowId }: { flowId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [message, setMessage] = useState("");
  const [receiptId, setReceiptId] = useState<string | null>(null);

  async function onRun() {
    setPhase("running");
    setMessage("");
    setReceiptId(null);
    try {
      const reply = await postCycle(flowId);
      setPhase("done");
      setMessage(`Agent cycle ${String(reply.outcome ?? "finished").toUpperCase()}`);
      if (reply.receipt?.receiptId) setReceiptId(reply.receipt.receiptId);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Agent cycle failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
        Pre-authorized by your active Standing Mandate — no per-trade approval needed
      </p>
      <button
        type="button"
        onClick={onRun}
        disabled={phase === "running"}
        className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] bg-signal px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
      >
        {phase === "running" ? "RUNNING AGENT CYCLE…" : "RUN TENAX AGENT "}
        {phase === "running" ? null : (
          <span className="btn-arrow" aria-hidden="true">→</span>
        )}
      </button>
      <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
        This starts an autonomous agent cycle. It is not an Approve button.
      </p>
      {phase === "done" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[16px] font-bold leading-[24px]">{message}</p>
          {receiptId ? (
            <button
              type="button"
              onClick={() => router.push(`/app/receipts/${flowId}`)}
              className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-ink/70 px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] hover:bg-ink hover:text-softwhite sm:self-start"
            >
              VIEW DECISION RECEIPT <span className="btn-arrow" aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {phase === "error" ? (
        <p role="alert" className="text-[13px] font-medium leading-[18px] text-clay">
          {message}
        </p>
      ) : null}
    </div>
  );
}
