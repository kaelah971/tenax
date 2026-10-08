// Client-side judge-demo trigger. Authority stays server-side: this
// button only POSTs the explicit demo action and renders the returned
// terminal result. Stages come from actual domain state in the response —
// stagger is presentation-only sequencing over complete data, never a
// fake progress timer. No credentials, no AI, no provider writes.
"use client";

import Link from "next/link";
import { useState } from "react";

import type { JudgeDemoResult, JudgeExecutionDemoResult } from "@/lib/tenax/judge-demo";
import { DEMO_TAKEAWAY_LINE } from "../_copy";
import { AuthorityInstrument } from "../_components/materials";
import { staggerStyle } from "../_components/living";

type DemoScenario = "refusal" | "execution";
type RunnerState = "idle" | "running" | "done" | "error";

interface DemoRunnerProps {
  readonly scenario: DemoScenario;
  readonly buttonLabel: string;
  readonly idleNote: string;
}

type AnyResult = (JudgeDemoResult & { scenario?: "refusal" }) | (JudgeExecutionDemoResult & { scenario?: "execution" });

function isRefusal(result: AnyResult): result is JudgeDemoResult {
  return result.authorityOutcome === "REFUSE";
}

export default function DemoRunner({ scenario, buttonLabel, idleNote }: DemoRunnerProps) {
  const [state, setState] = useState<RunnerState>("idle");
  const [result, setResult] = useState<AnyResult | null>(null);
  const [message, setMessage] = useState("");

  async function onRun() {
    setState("running");
    setMessage("");
    try {
      const res = await fetch("/api/demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const body = (await res.json()) as AnyResult & {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!res.ok || body.ok === false || !("flowId" in body)) {
        throw new Error(body.error?.message ?? `Demo request failed (http ${res.status})`);
      }
      setResult(body as AnyResult);
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Demo run failed");
    }
  }

  const refused = result !== null && isRefusal(result);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <button
          type="button"
          onClick={onRun}
          disabled={state === "running"}
          className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:opacity-60"
        >
          {state === "running" ? "RUNNING DEMO…" : buttonLabel} <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
        {state === "error" ? (
          <p role="alert" className="mt-3 max-w-xl text-[14px] leading-[20px] text-clay">{message}</p>
        ) : null}
        {state === "idle" ? (
          <p className="font-syslabel mt-3 max-w-xl text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
            {idleNote}
          </p>
        ) : null}
      </div>

      {result ? (
        <AuthorityInstrument as="section" aria-label="Demo result" className="rounded-[18px] p-5 text-softwhite sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">DEMO COMPLETE</p>
            <span className={`state-mark ml-auto ${refused ? "bg-clay text-softwhite" : "bg-signal text-ink"}`}>
              AUTHORITY · {result.authorityOutcome}
            </span>
          </div>
          <ol className="mt-5 flex flex-col">
            {result.stages.map((stage, i) => (
              <li
                key={`${stage.id}-${i}`}
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
            <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">EXECUTION</dt><dd className="mt-1 text-[20px] font-extrabold leading-none">{refused ? "NO ORDER SENT" : "PREVIEW · NO FUNDS MOVED"}</dd></div>
            <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">PROVENANCE</dt><dd className="mt-1 text-[20px] font-extrabold leading-none">{result.provenance}</dd></div>
            <div><dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">PROPOSAL</dt><dd className="mt-1 text-[20px] font-extrabold leading-none">{result.protectionPct}% · ${result.proposedTradeValueUsdt}</dd></div>
          </dl>
          {refused ? (
            <p className="mt-4 max-w-2xl text-[15px] font-bold leading-[22px] text-softwhite/90">
              {DEMO_TAKEAWAY_LINE}
            </p>
          ) : (
            <p className="mt-4 max-w-2xl text-[15px] font-bold leading-[22px] text-softwhite/90">
              The proposal fit the mandate, so Tenax previewed the order without submitting it.
            </p>
          )}
          <nav aria-label="Demo evidence" className="mt-5 flex flex-wrap items-center gap-2">
            <Link href={`/app/paper-trading/${encodeURIComponent(result.runId)}`} className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] text-ink hover:brightness-95">
              VIEW PAPER-TRADING RUN <span className="btn-arrow" aria-hidden="true">→</span>
            </Link>
            {"proofId" in result && result.proofId ? (
              <Link href={`/app/proof/${encodeURIComponent(result.proofId)}`} className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] text-softwhite hover:bg-softwhite/10">
                VIEW DECISION PROOF <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
            ) : null}
            {"receiptId" in result && result.receiptId ? (
              <Link href={`/app/receipts/${encodeURIComponent(result.flowId)}`} className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-softwhite/30 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] text-softwhite hover:bg-softwhite/10">
                VIEW DECISION RECEIPT <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
            ) : null}
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
