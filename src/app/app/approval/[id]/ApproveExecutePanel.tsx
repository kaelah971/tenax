// Client-side approve → transition → execution-preview panel. Every step
// POSTs to the server; nothing here asserts authority, it only follows
// server responses. Never claims a trade executed.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DRY_RUN_PRE_NOTICE, approveCta } from "../../_copy";

type Phase = "ready" | "approving" | "approved" | "executing" | "preview" | "error";

interface PreviewRequest {
  readonly symbol: string;
  readonly side: string;
  readonly orderType: string;
  readonly qty: string;
  readonly mode: string;
}

interface ServerReply {
  readonly ok: boolean;
  readonly error?: { message?: string };
  readonly request?: PreviewRequest;
}

async function post(path: string, body: unknown): Promise<ServerReply> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as ServerReply;
  if (!res.ok || !parsed.ok) throw new Error(parsed.error?.message ?? "Request failed");
  return parsed;
}

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
  const [preview, setPreview] = useState<PreviewRequest | null>(null);

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
      const reply = await post("/api/protection/execute", { flowId });
      if (!reply.request) throw new Error("Execution preview missing");
      setPreview(reply.request);
      setPhase("preview");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Execution preview failed");
    }
  }

  if (phase === "preview" && preview) {
    return (
      <div className="anim-rise rounded-[2px] bg-ink p-5 text-softwhite sm:p-8">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
          ACTION_01 · EXECUTION PREVIEW CREATED
        </p>
        <p className="mt-3 text-[56px] font-extrabold leading-none tracking-[-0.03em] sm:text-[88px]">
          ${tradeValueUsdt}
        </p>
        <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          WOULD-BE PROTECTION · NEVER SUBMITTED
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {[
            ["SYMBOL", preview.symbol],
            ["SIDE", preview.side.toUpperCase()],
            ["TYPE", preview.orderType.toUpperCase()],
            ["QTY", preview.qty],
            ["MODE", "DRY RUN"],
            ["FUNDS MOVED", "NO"],
          ].map(([term, value]) => (
            <div key={term} className="border-t border-softwhite/15 pt-2">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                {term}
              </dt>
              <dd className="mt-1 text-[16px] font-bold leading-[20px]">{value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => router.push(`/app/receipts/${flowId}`)}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center bg-signal px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:w-auto"
        >
          VIEW DECISION RECEIPT →
        </button>
      </div>
    );
  }

  if (phase === "approved" || phase === "executing") {
    return (
      <div className="flex flex-col gap-4">
        <ol className="anim-rise flex flex-col gap-px overflow-hidden rounded-[2px] bg-ink/10">
          {[
            ["HUMAN", "APPROVED", "text-signal"],
            ["MANDATE", "PASS", "text-pass"],
            ["ACTION", "CLEARED", "text-ink"],
          ].map(([label, state, color]) => (
            <li key={label} className="flex items-baseline gap-4 bg-softwhite px-4 py-3">
              <span className="font-syslabel w-20 shrink-0 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                {label}
              </span>
              <span className={`anim-rise text-[20px] font-extrabold leading-none ${color}`}>
                {state}
              </span>
              {label === "ACTION" ? (
                <span className="ml-1 inline-block h-4 w-16 bg-signal" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="text-[16px] leading-[24px]">
          Approved — one action authorized. {DRY_RUN_PRE_NOTICE}
        </p>
        <button
          type="button"
          onClick={onExecute}
          disabled={phase === "executing"}
          className="inline-flex min-h-12 items-center justify-center bg-signal px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
        >
          {phase === "executing" ? "CREATING PREVIEW…" : "CREATE EXECUTION PREVIEW →"}
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
        className="inline-flex min-h-12 items-center justify-center bg-signal px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
      >
        {phase === "approving" ? "APPROVING…" : `${approveCta(tradeValueUsdt)} →`}
      </button>
      {phase === "error" ? (
        <p role="alert" className="text-[13px] font-medium leading-[18px] text-clay">
          {message}
        </p>
      ) : (
        <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
          ONE ACTION · ONE APPROVAL · {DRY_RUN_PRE_NOTICE.toUpperCase()}
        </p>
      )}
    </div>
  );
}
