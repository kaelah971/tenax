// Tenax Phase 1D — shared UI primitives (DESIGN.md, server-safe).
//
// Cream field, white cards with soft shadows, labeled state chips, one type
// family with tabular figures. Pure presentational helpers plus the
// check-display mapping the Mandate Gate renders from server decisions.
import type { ReactNode } from "react";

import type { MandateCheck, MandateCheckId } from "@/lib/tenax/domain";

export function formatUsd(value: number): string {
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export function formatPct(value: number): string {
  return `${value}%`;
}

type ChipTone = "pass" | "refused" | "dryrun" | "live" | "muted" | "deep";

const CHIP_STYLES: Record<ChipTone, string> = {
  pass: "bg-pass text-white",
  refused: "bg-clay text-white",
  dryrun: "bg-caution text-white",
  live: "bg-deep text-white",
  deep: "bg-deep text-white",
  muted: "bg-badgefill text-ink",
};

export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-medium leading-[18px] ${CHIP_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[14px] bg-white p-4 text-ink shadow-[0_6px_16px_rgba(0,0,0,0.08)] sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold leading-[18px]">{title}</h2>
          {meta ? <p className="mt-0.5 text-[11px] leading-[14px] text-muted">{meta}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="#1A1A1A"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const CHECK_GLYPHS: Record<MandateCheckId, string> = {
  underlying_allowed: "M10 2.5 L17 7.5 V12.5 L10 17.5 L3 12.5 V7.5 Z",
  max_protection_pct: "M15 5 L5 15 M7.5 7.5 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M14.5 14.5 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0",
  max_trade_value: "M10 3 v14 M13.5 6.5 h-6 a2.5 2.5 0 0 0 0 5 h5 a2.5 2.5 0 0 1 0 5 h-7",
  leverage_disabled: "M4 4 L16 16 M6 17.5 h12 M10 2.5 V6",
  approval_required: "M4 10.5 L8.5 15 L16 6.5",
  min_order_amount: "M3 7 h14 M3 12 h14 M3 17 h8",
};

export const CHECK_TITLES: Record<MandateCheckId, string> = {
  underlying_allowed: "Allowed asset",
  max_protection_pct: "Max hedge",
  max_trade_value: "Max trade",
  leverage_disabled: "Leverage",
  approval_required: "Human approval",
  min_order_amount: "Min order size",
};

export interface CheckDisplay {
  readonly title: string;
  readonly detail: string;
  readonly tone: "pass" | "refused" | "dryrun";
  readonly label: string;
}

/** Pure mapping from a server-computed check to its gate rendering. */
export function checkDisplay(check: MandateCheck): CheckDisplay {
  if (check.id === "approval_required") {
    return {
      title: CHECK_TITLES[check.id],
      detail: check.detail,
      tone: "dryrun",
      label: "REQUIRED",
    };
  }
  return check.pass
    ? { title: CHECK_TITLES[check.id], detail: check.detail, tone: "pass", label: "PASS" }
    : { title: CHECK_TITLES[check.id], detail: check.detail, tone: "refused", label: "REFUSED" };
}

export function CheckRow({ check }: { check: MandateCheck }) {
  const display = checkDisplay(check);
  return (
    <li className="flex items-center gap-3 rounded-[10px] bg-white px-3 py-2.5 shadow-[0_6px_14px_rgba(0,0,0,0.08)]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-cream">
        <Glyph d={CHECK_GLYPHS[check.id]} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-[18px]">{display.title}</span>
        <span className="block truncate text-[11px] leading-[14px] text-muted">{display.detail}</span>
      </span>
      <Chip tone={display.tone}>{display.label}</Chip>
    </li>
  );
}

/** The signature Mandate Gate core: white module, blue glow rings, label stack. */
export function GateCore() {
  return (
    <div className="flex items-center justify-center py-6" aria-label="Mandate Gate diagram">
      <div className="rounded-full bg-primary/10 p-8">
        <div className="rounded-full bg-primary/15 p-6">
          <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_8px_20px_rgba(78,128,232,0.25)]">
            <span className="text-[12px] font-semibold leading-[16px]">Mandate Gate</span>
            <span className="mt-1 text-[11px] leading-[14px] text-muted">ENFORCED</span>
            <span className="text-[11px] leading-[14px] text-muted">deterministic</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChainSteps({ current }: { current: string }) {
  const steps = [
    "Exposure",
    "Intent",
    "Intelligence",
    "Proposal",
    "Mandate",
    "Approval",
    "Action",
    "Receipt",
  ];
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Protection chain">
      {steps.map((step, i) => {
        const active = step === current;
        return (
          <li key={step} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] leading-[14px] ${
                active ? "bg-ink font-semibold text-white" : "bg-badgefill text-ink"
              }`}
            >
              {step}
            </span>
            {i < steps.length - 1 ? <span className="text-muted">→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ProvenanceStrip({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Data provenance">
      {items.map((item) => (
        <Chip key={item} tone="muted">
          {item}
        </Chip>
      ))}
    </div>
  );
}
