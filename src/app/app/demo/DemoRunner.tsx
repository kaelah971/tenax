// Client-side judge-demo trigger. Authority stays server-side: this
// button only POSTs the explicit demo action and renders the returned
// terminal result. Stages come from actual domain state in the response —
// stagger is presentation-only sequencing over complete data, never a
// fake progress timer. No credentials, no AI, no provider writes.
"use client";

import Link from "next/link";
import { useState } from "react";

import type { JudgeDemoResult } from "@/lib/tenax/judge-demo";
import { DEMO_TAKEAWAY_LINE } from "../_copy";
import { AuthorityInstrument } from "../_components/materials";
import { staggerStyle } from "../_components/living";

type RunnerState = "idle" | "running" | "done" | "error";

export default function DemoRunner() {
  const [state, setState] = useState<RunnerState>("idle");
  const [result, setResult] = useState<JudgeDemoResult | null>(null);
  const [message, setMessage] = useState("");

  async function onRun() {
    setState("running");
    setMessage("");
    try {
      const res = await fetch("/api/demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await res.json()) as JudgeDemoResult & {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!res.ok || body.ok === false || !("flowId" in body)) {
        throw new Error(body.error?.message ?? `Demo request failed (http ${res.status})`);
      }
      setResult(body as JudgeDemoResult);
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Demo run failed");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <button
          type="button"
          onClick={onRun}
          disabled={state === "running"}
          className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:opacity-60"
        >
          {state === "running" ? "RUNNING DEMO…" : "RUN DEMO"} <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
        {state === "error" ? (
          <p role="alert" className="mt-3 max-w-xl text-[14px] leading-[20px] text-clay">{message}</p>
        ) : null}
        {state === "idle" ? (
          <p className="font-syslabel mt-3 max-w-xl text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
            EACH RUN CREATES A NEW EXPLICIT DEMO FLOW — RETRIES NEVER DUPLICATE EXECUTION
          </p>
        ) : null}
      </div>

      {result ? (
        <AuthorityInstrument as="section" aria-label="Demo result" className="rounded-[18px] p-5 text-softwhite sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">DEMO COMPLETE</p>
            <span className="state-mark ml-auto bg-clay text-softwhite">AUTHORITY · REFUSE</span>
          </div>
          <ol className="mt-5 flex flex-col">
            {result.stages.map((stage, i) => (
              <li
                key={stage.id}
                style={staggerStyle(i)}
                className="anim-rise flex flex-col gap-1 border-t border-softwhite/15 py-3 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <span className="font-syslabel w-40 shrink-0 text-[11px] leading-[14px] tracking-[0.08em] text-softwhite/60">
                  {stage.label}
                </span>
                <span className="text-[15px] font-bold leading-[22px]">{stage.detail}</span>
              </li>
            ))}
          </ol>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-softwhite/15 pt-4 sm:grid-cols-4">
            <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AUTHORITY OUTCOME</dt><dd className="mt-1 text-[20px] font-extrabold leading-none">{result.authorityOutcome}</dd></div>
            <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">EXECUTION</dt><dd className="mt-1 text-[20px] font-extrabold leading-none">NO ORDER SENT</dd></div>
            <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">PROVENANCE</dt><dd className="mt-1 text-[20px] font-extrabold leading-none">{result.provenance}</dd></div>
            <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">PROPOSAL</dt><dd className="mt-1 text-[20px] font-extrabold leading-none">{result.protectionPct}% · ${result.proposedTradeValueUsdt}</dd></div>
          </dl>
          <p className="mt-4 max-w-2xl text-[15px] font-bold leading-[22px] text-softwhite/90">
            {DEMO_TAKEAWAY_LINE}
          </p>
          <nav aria-label="Demo evidence" className="mt-5 flex flex-wrap items-center gap-2">
            <Link href={`/app/paper-trading/${encodeURIComponent(result.runId)}`} className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] text-ink hover:brightness-95">
              VIEW PAPER-TRADING RUN <span className="btn-arrow" aria-hidden="true">→</span>
            </Link>
            <Link href={`/app/proof/${encodeURIComponent(result.proofId)}`} className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] text-softwhite hover:bg-softwhite/10">
              VIEW DECISION PROOF <span className="btn-arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/app/paper-trading" className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] text-softwhite hover:bg-softwhite/10">
              ALL RUNS <span className="btn-arrow" aria-hidden="true">→</span>
            </Link>
          </nav>
          <p className="font-syslabel mt-4 text-[10px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/45">
            FLOW {result.flowId} · PROPOSAL {result.proposalHash} · {result.createdAt}
          </p>
        </AuthorityInstrument>
      ) : null}
    </div>
  );
}
