// Tenax Standing Mandate — pre-authorized bounded authority, presentation + control.
// Creating drafts nothing; the ACTIVATE step binds policy into mandateHash.
// Client actions POST to server routes; this page asserts no authority itself.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { StandingMandate } from "@/lib/tenax/standing-mandate";

type Phase = "idle" | "working" | "error";

async function post(path: string, body: unknown): Promise<{ ok: boolean; mandate?: StandingMandate; error?: { message?: string } }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as { ok: boolean; mandate?: StandingMandate; error?: { message?: string } };
  if (!res.ok || !parsed.ok) throw new Error(parsed.error?.message ?? "Request failed");
  return parsed;
}

const MODES = ["REVIEW_EVERY_ACTION", "AUTO_WITHIN_MANDATE", "AUTO_WITH_ESCALATION"] as const;

export default function MandatePanel({ mandates }: { mandates: StandingMandate[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]>("REVIEW_EVERY_ACTION");
  const [maxExecutions, setMaxExecutions] = useState("1");

  const active = mandates.find((m) => m.status === "ACTIVE") ?? null;
  const draft = [...mandates].reverse().find((m) => m.status === "DRAFT") ?? null;

  async function run(path: string, body: unknown) {
    setPhase("working");
    setMessage("");
    try {
      await post(path, body);
      setPhase("idle");
      router.refresh();
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Request failed");
    }
  }

  if (active) {
    const remaining = active.policy.maxExecutions - active.executionCount;
    return (
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 min-[480px]:grid-cols-2 sm:grid-cols-3">
          {[
            ["MANDATE ID", active.id],
            ["STATUS", active.status],
            ["MODE", active.policy.authorityMode.replaceAll("_", " ")],
            ["ACTIVATED", active.activatedAt ?? "—"],
            ["EXPIRES", active.expiresAt ?? "NO EXPIRY"],
            ["REMAINING", `${remaining} / ${active.policy.maxExecutions}`],
            ["HASH", active.mandateHash ? `${active.mandateHash.slice(0, 16)}…` : "—"],
          ].map(([term, value]) => (
            <div key={term} className="min-w-0 border-t border-softwhite/15 pt-2">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                {term}
              </dt>
              <dd className="mt-1 break-words text-[15px] font-bold leading-[20px]">{value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => run("/api/mandate/revoke", { id: active.id })}
          disabled={phase === "working"}
          className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-clay/70 px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-clay hover:bg-clay hover:text-softwhite disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
        >
          {phase === "working" ? "REVOKING…" : "REVOKE STANDING MANDATE"}
        </button>
        {phase === "error" ? (
          <p role="alert" className="text-[13px] font-medium leading-[18px] text-clay">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          AUTHORITY MODE
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Authority mode">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`font-syslabel rounded-[8px] px-3 py-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] ${
                mode === m
                  ? "bg-signal font-bold text-ink"
                  : "border border-softwhite/25 text-softwhite/80 hover:bg-softwhite/10"
              }`}
            >
              {m.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </div>
      <label className="flex max-w-48 flex-col gap-2">
        <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
          MAX EXECUTIONS
        </span>
        <input
          type="number"
          min={1}
          max={100}
          value={maxExecutions}
          onChange={(e) => setMaxExecutions(e.target.value)}
          className="min-h-11 rounded-[10px] border border-softwhite/25 bg-softwhite/5 px-3 py-2 text-[15px] font-bold leading-[20px] text-softwhite"
        />
      </label>
      {draft ? (
        <div className="flex flex-col gap-3 border-t border-softwhite/15 pt-4">
          <p className="text-[15px] leading-[22px]">
            Draft <span className="font-bold">{draft.id}</span> prepared — bounds locked to policy.
            Activation pre-authorizes this class of action.
          </p>
          <button
            type="button"
            onClick={() => run("/api/mandate/activate", { id: draft.id })}
            disabled={phase === "working"}
            className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] bg-clay px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-softwhite hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
          >
            {phase === "working" ? "ACTIVATING…" : "ACTIVATE STANDING MANDATE"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => run("/api/mandate/create", { authorityMode: mode, maxExecutions: Number(maxExecutions) })}
          disabled={phase === "working"}
          className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
        >
          {phase === "working" ? "DRAFTING…" : "CREATE DRAFT"}
        </button>
      )}
      {phase === "error" ? (
        <p role="alert" className="text-[13px] font-medium leading-[18px] text-clay">{message}</p>
      ) : (
        <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-softwhite/60">
          DRAFT AUTHORIZES NOTHING · ACTIVATION BINDS POLICY HASH
        </p>
      )}
    </div>
  );
}
