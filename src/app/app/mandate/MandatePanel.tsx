// Tenax Standing Mandate builder — user-defined bounded authority.
// Creating drafts nothing; EDIT works only on DRAFTs via
// POST /api/mandate/update-draft; only ACTIVATE binds the mandate hash
// (ACTIVE is immutable and read-only). This page asserts no authority
// itself — every write goes through the server-validated routes.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  StandingAuthorityMode,
  StandingMandate,
} from "@/lib/tenax/standing-mandate";
import { mandateSummaryPreview } from "../_copy";

type Phase = "idle" | "working" | "error";

async function post(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; mandate?: StandingMandate; error?: { message?: string } }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as {
    ok: boolean;
    mandate?: StandingMandate;
    error?: { message?: string };
  };
  if (!res.ok || !parsed.ok) throw new Error(parsed.error?.message ?? "Request failed");
  return parsed;
}

const MODES: ReadonlyArray<{ mode: StandingAuthorityMode; label: string; blurb: string }> = [
  {
    mode: "REVIEW_EVERY_ACTION",
    label: "REVIEW EVERY ACTION",
    blurb: "Every action still requires human approval. Nothing runs on its own.",
  },
  {
    mode: "AUTO_WITHIN_MANDATE",
    label: "AUTO WITHIN MANDATE",
    blurb: "Runs inside these bounds without per-trade approval.",
  },
  {
    mode: "AUTO_WITH_ESCALATION",
    label: "AUTO + ESCALATE",
    blurb: "Runs inside bounds; asks a human outside them.",
  },
];

const BUILDER_DEFAULTS = {
  maxProtectionPct: "20",
  maxNotionalUsdt: "100",
  maxExecutions: "1",
  mode: "REVIEW_EVERY_ACTION" as StandingAuthorityMode,
};

function toIsoOrNull(local: string): string | null {
  const trimmed = local.trim();
  if (trimmed === "") return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : trimmed;
}

function policyRows(mandate: StandingMandate): Array<[string, string]> {
  return [
    ["MANDATE ID", mandate.id],
    ["STATUS", mandate.status],
    ["MODE", mandate.policy.authorityMode.replaceAll("_", " ")],
    ["MAX PROTECTION", `${mandate.policy.maxProtectionPct}%`],
    ["MAX ACTION", `$${mandate.policy.maxNotionalUsdt}`],
    ["MAX LEVERAGE", `${mandate.policy.maxLeverage}X · LOCKED`],
    ["MAX EXECUTIONS", `${mandate.policy.maxExecutions}`],
    ["EXECUTIONS", `${mandate.executionCount} / ${mandate.policy.maxExecutions}`],
    [
      "REMAINING",
      `${mandate.policy.maxExecutions - mandate.executionCount} / ${mandate.policy.maxExecutions}`,
    ],
    ["EXPIRES", mandate.expiresAt ?? "NO EXPIRY"],
    ["ACTIVATED", mandate.activatedAt ?? "—"],
    ["HASH", mandate.mandateHash ? `${mandate.mandateHash.slice(0, 16)}…` : "—"],
  ];
}

function PolicyGrid({ mandate }: { mandate: StandingMandate }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 min-[480px]:grid-cols-2 sm:grid-cols-3">
      {policyRows(mandate).map(([term, value]) => (
        <div key={term} className="min-w-0 border-t border-softwhite/15 pt-2">
          <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
            {term}
          </dt>
          <dd className="mt-1 break-words text-[15px] font-bold leading-[20px]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function MandatePanel({
  mandates,
  exhaustedReceiptHref = null,
}: {
  mandates: StandingMandate[];
  /** Receipt flow consumed under the latest exhausted mandate, if resolvable. */
  exhaustedReceiptHref?: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<StandingAuthorityMode>(BUILDER_DEFAULTS.mode);
  const [pct, setPct] = useState(BUILDER_DEFAULTS.maxProtectionPct);
  const [notional, setNotional] = useState(BUILDER_DEFAULTS.maxNotionalUsdt);
  const [executions, setExecutions] = useState(BUILDER_DEFAULTS.maxExecutions);
  const [expiryChoice, setExpiryChoice] = useState<"none" | "custom">("none");
  const [expiryLocal, setExpiryLocal] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const active = mandates.find((m) => m.status === "ACTIVE") ?? null;
  // Most recent exhausted mandate stays visible as history: policy is
  // immutable and it can never reactivate — a new id/version is required.
  const exhausted = [...mandates].reverse().find((m) => m.status === "EXHAUSTED") ?? null;
  const draft = [...mandates].reverse().find((m) => m.status === "DRAFT") ?? null;
  const editing = draft !== null && editingId === draft.id;

  async function run(path: string, body: unknown, after?: () => void) {
    setPhase("working");
    setMessage("");
    try {
      await post(path, body);
      setPhase("idle");
      after?.();
      router.refresh();
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Request failed");
    }
  }

  function startEdit(target: StandingMandate) {
    setMode(target.policy.authorityMode);
    setPct(String(target.policy.maxProtectionPct));
    setNotional(String(target.policy.maxNotionalUsdt));
    setExecutions(String(target.policy.maxExecutions));
    if (target.expiresAt) {
      setExpiryChoice("custom");
      const ms = Date.parse(target.expiresAt);
      setExpiryLocal(
        Number.isFinite(ms)
          ? new Date(ms).toISOString().slice(0, 16)
          : target.expiresAt.slice(0, 16),
      );
    } else {
      setExpiryChoice("none");
      setExpiryLocal("");
    }
    setEditingId(target.id);
  }

  function draftPayload(id?: string) {
    const body: Record<string, unknown> = {
      maxProtectionPct: Number(pct),
      maxNotionalUsdt: Number(notional),
      maxExecutions: Number(executions),
      authorityMode: mode,
      expiresAt: expiryChoice === "custom" ? toIsoOrNull(expiryLocal) : null,
    };
    if (id) body.id = id;
    return body;
  }

  const preview = mandateSummaryPreview({
    maxProtectionPct: Number(pct) || 0,
    maxNotionalUsdt: Number(notional) || 0,
    maxExecutions: Number(executions) || 0,
    expiresAt: expiryChoice === "custom" ? toIsoOrNull(expiryLocal) : null,
    authorityMode: mode,
  });

  if (active) {
    return (
      <div className="flex flex-col gap-4">
        <PolicyGrid mandate={active} />
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
    <div className="flex flex-col gap-6">
      {exhausted ? (
        <div className="flex flex-col gap-3" aria-label="Exhausted mandate history">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
            PREVIOUS MANDATE · BUDGET CONSUMED
          </p>
          <PolicyGrid mandate={exhausted} />
          <p className="text-[14px] leading-[20px] text-softwhite/80">
            Execution budget consumed. This mandate can no longer authorize new actions.
          </p>
          {exhaustedReceiptHref ? (
            <Link
              href={exhaustedReceiptHref}
              className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-softwhite/40 px-5 py-3 text-[13px] font-bold leading-[18px] tracking-[0.02em] text-softwhite hover:bg-softwhite hover:text-ink sm:self-start"
            >
              VIEW RECEIPT <span className="btn-arrow" aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      ) : null}

      {draft && !editing ? (
        <div className="flex flex-col gap-4" aria-label="Review draft">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
            REVIEW DRAFT · {draft.id.toUpperCase()} · AUTHORIZES NOTHING YET
          </p>
          <PolicyGrid mandate={draft} />
          <div className="flex flex-col gap-2">
            {mandateSummaryPreview({
              maxProtectionPct: draft.policy.maxProtectionPct,
              maxNotionalUsdt: draft.policy.maxNotionalUsdt,
              maxExecutions: draft.policy.maxExecutions,
              expiresAt: draft.expiresAt,
              authorityMode: draft.policy.authorityMode,
            }).map((line) => (
              <p key={line} className="text-[14px] leading-[20px] text-softwhite/80">
                {line}
              </p>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startEdit(draft)}
              disabled={phase === "working"}
              className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-softwhite/40 px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-softwhite hover:bg-softwhite hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              EDIT DRAFT
            </button>
            <button
              type="button"
              onClick={() => run("/api/mandate/activate", { id: draft.id })}
              disabled={phase === "working"}
              className="btn-living inline-flex min-h-12 items-center justify-center rounded-[12px] bg-clay px-8 py-4 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-softwhite hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "working" ? "ACTIVATING…" : "ACTIVATE STANDING MANDATE"}
            </button>
          </div>
          <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-softwhite/60">
            ACTIVATION LOCKS THESE PERMISSIONS AND BINDS THE MANDATE HASH
          </p>
          {phase === "error" ? (
            <p role="alert" className="text-[13px] font-medium leading-[18px] text-clay">{message}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4" aria-label="Mandate builder">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
            {draft ? `EDITING DRAFT · ${draft.id.toUpperCase()}` : "DEFINE WHAT TENAX IS ALLOWED TO DO"}
          </p>
          {!draft ? (
            <p className="text-[22px] font-extrabold leading-none">Define what Tenax is allowed to do.</p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-3">
            <label className="flex min-w-0 flex-col gap-2">
              <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                MAX PROTECTION · %
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className="min-h-11 rounded-[10px] border border-softwhite/25 bg-softwhite/5 px-3 py-2 text-[15px] font-bold leading-[20px] text-softwhite"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                MAX ACTION · USD
              </span>
              <input
                type="number"
                min={1}
                value={notional}
                onChange={(e) => setNotional(e.target.value)}
                className="min-h-11 rounded-[10px] border border-softwhite/25 bg-softwhite/5 px-3 py-2 text-[15px] font-bold leading-[20px] text-softwhite"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
                MAX EXECUTIONS
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={executions}
                onChange={(e) => setExecutions(e.target.value)}
                className="min-h-11 rounded-[10px] border border-softwhite/25 bg-softwhite/5 px-3 py-2 text-[15px] font-bold leading-[20px] text-softwhite"
              />
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
              EXPIRY
            </p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Expiry">
              <button
                type="button"
                onClick={() => setExpiryChoice("none")}
                aria-pressed={expiryChoice === "none"}
                className={`font-syslabel rounded-[8px] px-3 py-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] ${
                  expiryChoice === "none"
                    ? "bg-signal font-bold text-ink"
                    : "border border-softwhite/25 text-softwhite/80 hover:bg-softwhite/10"
                }`}
              >
                NO EXPIRY
              </button>
              <button
                type="button"
                onClick={() => setExpiryChoice("custom")}
                aria-pressed={expiryChoice === "custom"}
                className={`font-syslabel rounded-[8px] px-3 py-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] ${
                  expiryChoice === "custom"
                    ? "bg-signal font-bold text-ink"
                    : "border border-softwhite/25 text-softwhite/80 hover:bg-softwhite/10"
                }`}
              >
                CUSTOM DATE
              </button>
              {expiryChoice === "custom" ? (
                <input
                  type="datetime-local"
                  value={expiryLocal}
                  onChange={(e) => setExpiryLocal(e.target.value)}
                  aria-label="Expiry date and time"
                  className="min-h-11 rounded-[10px] border border-softwhite/25 bg-softwhite/5 px-3 py-2 text-[15px] font-bold leading-[20px] text-softwhite"
                />
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 border-t border-softwhite/15 py-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
              MAX LEVERAGE
            </p>
            <p className="text-[15px] font-bold leading-[20px]">
              1X · LOCKED <span className="font-normal text-softwhite/60">— execution stays 1x cross; higher leverage is not supported.</span>
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
              AUTHORITY MODE
            </p>
            <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Authority mode">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => setMode(m.mode)}
                  aria-pressed={mode === m.mode}
                  className={`rounded-[10px] p-3 text-left ${
                    mode === m.mode
                      ? "bg-signal text-ink"
                      : "border border-softwhite/25 text-softwhite/80 hover:bg-softwhite/10"
                  }`}
                >
                  <span className="font-syslabel block text-[11px] font-bold uppercase leading-[14px] tracking-[0.08em]">
                    {m.label}
                  </span>
                  <span className="mt-1 block text-[12px] leading-[17px] opacity-80">{m.blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-[10px] border border-signal/40 bg-signal/[0.06] p-4">
            {preview.map((line) => (
              <p key={line} className="text-[14px] leading-[20px] text-softwhite/90">
                {line}
              </p>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {draft ? (
              <>
                <button
                  type="button"
                  onClick={() => run("/api/mandate/update-draft", draftPayload(draft.id), () => setEditingId(null))}
                  disabled={phase === "working"}
                  className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "working" ? "SAVING…" : "SAVE CHANGES"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  disabled={phase === "working"}
                  className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] border border-softwhite/40 px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-softwhite hover:bg-softwhite hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  CANCEL
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => run("/api/mandate/create", draftPayload())}
                disabled={phase === "working"}
                className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-signal px-6 py-3 text-[14px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase === "working" ? "DRAFTING…" : exhausted ? "CREATE NEW MANDATE" : "CREATE DRAFT"}
              </button>
            )}
          </div>
          {phase === "error" ? (
            <p role="alert" className="text-[13px] font-medium leading-[18px] text-clay">{message}</p>
          ) : (
            <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-softwhite/60">
              DRAFT AUTHORIZES NOTHING · ACTIVATION BINDS POLICY HASH
            </p>
          )}
        </div>
      )}
    </div>
  );
}
