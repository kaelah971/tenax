// Client-side approve → transition → execution-preview panel. Every step
// POSTs to the server; nothing here asserts authority, it only follows
// server responses. Never claims a trade executed.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DRY_RUN_PRE_NOTICE, approveCta } from "../../_copy";
import { AuthorityInstrument, LightInstrument } from "../../_components/materials";
import { TenaxAgent, staggerStyle } from "../../_components/living";

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
      <AuthorityInstrument className="tx-preview-sheet tx-observatory-entry p-5 text-softwhite sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">
              EXECUTION PREVIEW
            </p>
            <p className="state-mark mt-3 bg-signal text-ink">NO FUNDS MOVED</p>
            <p className="font-syslabel mt-3 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
              ACTION_01 · PREVIEW CREATED
            </p>
            <p className="value-live mt-3 text-[56px] font-extrabold leading-none tracking-[-0.03em] sm:text-[88px]">
              ${tradeValueUsdt}
            </p>
            <p className="font-syslabel mt-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
              WOULD-BE PROTECTION · NEVER SUBMITTED
            </p>
          </div>
          <div className="agent-stage">
            <TenaxAgent state="complete" size={72} caption="PREVIEW COMPLETE" className="mascot-scale" />
          </div>
        </div>
        <p className="font-syslabel mt-4 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/70">
          □ DRY RUN · NEVER SUBMITTED
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
            <div key={term} className="border-t instrument-divider pt-2">
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
          className="btn-living mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-[12px] bg-signal px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 sm:w-auto"
        >
          VIEW DECISION RECEIPT <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
      </AuthorityInstrument>
    );
  }

  if (phase === "approved" || phase === "executing") {
    return (
      <div className="flex flex-col gap-4">
        <LightInstrument className="tx-material-light-frost flex items-center gap-4 rounded-[16px] p-4 sm:p-5">
            <ol className="anim-rise flex flex-1 flex-col gap-1.5 overflow-hidden">
            {[
              ["HUMAN", "APPROVED", "text-signal"],
              ["MANDATE", "PASS", "text-pass"],
              ["ACTION", "CLEARED", "text-ink"],
            ].map(([label, state, color], i) => (
              <li
                key={label}
                style={staggerStyle(i)}
                className="tx-rule flex flex-wrap items-baseline gap-4 rounded-[4px] border-t border-ink/10 bg-softwhite/60 px-4 py-3"
              >
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
        </LightInstrument>
        <p className="text-[16px] leading-[24px]">
          Approved — one action authorized. {DRY_RUN_PRE_NOTICE}
        </p>
        <button
          type="button"
          onClick={onExecute}
          disabled={phase === "executing"}
          className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] bg-signal px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
        >
          {phase === "executing" ? "CREATING PREVIEW…" : "CREATE EXECUTION PREVIEW "}
          {phase === "executing" ? null : (
            <span className="btn-arrow" aria-hidden="true">→</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <LightInstrument className="tx-material-light-frost flex flex-col gap-3 rounded-[16px] p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      <div className="flex flex-1 flex-col gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={phase === "approving"}
        className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] bg-signal px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
      >
        {phase === "approving" ? "APPROVING…" : `${approveCta(tradeValueUsdt)} `}
        {phase === "approving" ? null : (
          <span className="btn-arrow" aria-hidden="true">→</span>
        )}
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
    </LightInstrument>
  );
}
