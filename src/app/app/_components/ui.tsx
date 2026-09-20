// Tenax Phase 1E-A — shared signal-system primitives (DESIGN.md beta-signal).
//
// Signal Yellow dominance, Ink authority, ivory field, mono system labels.
// Server-safe. Pure display mappings (railStages, provenanceMarker,
// checkDisplay) stay unit-tested; rendering behavior is covered by
// typecheck + production build.
import type { ReactNode } from "react";

import type {
  MandateCheck,
  MandateCheckId,
  MandateDecision,
  ProtectionProposal,
} from "@/lib/tenax/domain";

export function formatUsd(value: number): string {
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export function formatPct(value: number): string {
  return `${value}%`;
}

/** Human-compact large market figures: 145580319.3223 → 145.58M. */
export function formatCompact(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return value;
}

/** Compact product timestamp: ISO → "23:01 UTC". Exact ISO stays in title. */
export function formatMarketTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** User-facing execution-mode display: enum DRY_RUN renders as DRY RUN. */
export function provenanceDisplay(label: string): string {
  return label.replace(/DRY_RUN/g, "DRY RUN");
}

type ChipTone = "pass" | "refused" | "dryrun" | "live" | "muted";

const CHIP_STYLES: Record<ChipTone, string> = {
  pass: "border border-pass/40 bg-pass/10 text-pass",
  refused: "border border-clay/50 bg-clay/10 text-clay",
  dryrun: "border border-ink bg-signal text-ink",
  live: "border border-ink/30 bg-signal text-ink",
  muted: "border border-ink/20 bg-ivory text-ink",
};

/** State words only. Do not use this pill treatment for navigation or metadata. */
export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase leading-[14px] tracking-[0.06em] ${CHIP_STYLES[tone]}`}
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
    <section className="tx-material-editorial border-t-2 border-ink p-4 text-ink sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-ink/15 pb-3">
        <div>
          <h2 className="text-[13px] font-bold leading-[18px]">{title}</h2>
          {meta ? <p className="mt-0.5 text-[11px] leading-[14px] text-mutedink">{meta}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---- Tenax Decision Rail ----------------------------------------------------

export const RAIL_STAGES = [
  "EXPOSURE",
  "INTENT",
  "INTELLIGENCE",
  "MANDATE",
  "ACTION",
  "RECEIPT",
] as const;

export type RailStage = (typeof RAIL_STAGES)[number];
export type RailState = "active" | "done" | "todo";

export interface RailStageView {
  readonly index: string;
  readonly label: RailStage;
  readonly state: RailState;
}

/** Pure mapping: stages before current are done, current is active. */
export function railStages(current: string): RailStageView[] {
  const at = RAIL_STAGES.indexOf(current as RailStage);
  return RAIL_STAGES.map((label, i) => ({
    index: String(i + 1).padStart(2, "0"),
    label,
    state: (at === -1 ? "todo" : i < at ? "done" : i === at ? "active" : "todo") as RailState,
  }));
}

export function DecisionRail({ current }: { current: string }) {
  const stages = railStages(current);
  return (
    <div className="tx-rail-shell">
      <span className="tx-rail-line" aria-hidden="true" />
      <ol className="tx-rail relative flex min-w-max items-center gap-1" aria-label="Decision rail">
        {stages.map((stage) => (
          <li key={stage.label}>
            <span
              className={`font-syslabel tx-rail-stage text-[11px] uppercase leading-[14px] tracking-[0.08em] ${
                stage.state === "active"
                  ? "tx-rail-stage-active font-bold text-ink"
                  : stage.state === "done"
                    ? "tx-rail-stage-done font-bold text-ink"
                    : "text-mutedink/60"
              }`}
            >
              {stage.index} {stage.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---- Compact provenance strip ------------------------------------------------
// Markers: ● LIVE (Bitget Reality) · ○ DEMO (simulated) · ◇ DEV (fixture) ·
// □ DRY (no funds moved). Full required truth always rendered as words.

export interface ProvenanceMark {
  readonly glyph: string;
  readonly hot: boolean;
  readonly alert: boolean;
}

/** Pure mapping from a provenance label to its compact marker. */
export function provenanceMarker(label: string): ProvenanceMark {
  const upper = label.toUpperCase();
  if (upper.startsWith("LIVE")) return { glyph: "●", hot: true, alert: false };
  if (upper.includes("UNAVAILABLE") || upper.startsWith("OFFLINE"))
    return { glyph: "○", hot: false, alert: true };
  if (upper.startsWith("SIMULATED") || upper.startsWith("DEMO"))
    return { glyph: "○", hot: false, alert: false };
  if (upper.startsWith("DEVELOPMENT") || upper.startsWith("DEV") || upper.startsWith("◇"))
    return { glyph: "◇", hot: false, alert: false };
  if (upper.startsWith("DRY") || upper.startsWith("□")) return { glyph: "□", hot: false, alert: false };
  return { glyph: "•", hot: false, alert: false };
}

export function ProvenanceStrip({ items }: { items: readonly string[] }) {
  return (
    <p
      className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink"
      aria-label="Data provenance"
    >
      {items.map((item, i) => {
        const mark = provenanceMarker(item);
        return (
          <span key={item}>
            {i > 0 ? <span className="mx-2">·</span> : null}
            <span
              className={
                mark.hot
                  ? "bg-signal px-1 py-px font-bold text-ink"
                  : mark.alert
                    ? "font-bold text-clay"
                    : undefined
              }
            >
              {mark.glyph} {provenanceDisplay(item)}
            </span>
          </span>
        );
      })}
    </p>
  );
}

// ---- Mandate checks ----------------------------------------------------------

function Glyph({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="#111111"
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
  max_leverage: "M4 4 L16 16 M6 17.5 h12 M10 2.5 V6",
  approval_required: "M4 10.5 L8.5 15 L16 6.5",
  min_order_amount: "M3 7 h14 M3 12 h14 M3 17 h8",
};

export const CHECK_TITLES: Record<MandateCheckId, string> = {
  underlying_allowed: "Allowed asset",
  max_protection_pct: "Max hedge",
  max_trade_value: "Max trade",
  max_leverage: "Leverage",
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

export function CheckRow({ check, index }: { check: MandateCheck; index: string }) {
  const display = checkDisplay(check);
  return (
    <li className="flex items-center gap-3 rounded-[4px] border-t border-ink/10 bg-softwhite/50 px-3 py-2.5">
      <span className="font-syslabel w-6 shrink-0 text-[11px] leading-[14px] text-mutedink">
        {index}
      </span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-ivory">
        <Glyph d={CHECK_GLYPHS[check.id]} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold leading-[18px]">{display.title}</span>
        <span className="block break-words text-[11px] leading-[14px] text-mutedink">
          {display.detail}
        </span>
      </span>
      {display.tone === "dryrun" ? (
        <span className="rounded-full border-2 border-ink bg-signal px-2.5 py-0.5 text-[13px] font-bold leading-[18px] text-ink">
          {display.label}
        </span>
      ) : (
        <Chip tone={display.tone}>{display.label}</Chip>
      )}
    </li>
  );
}

// ---- Permission ledger --------------------------------------------------------
// Indexed gate rows with values derived from the actual proposal and mandate
// limits. Approval is always WAITING at gate stage — mandate PASS is never
// merged with human approval.

export interface LedgerRow {
  readonly index: string;
  readonly title: string;
  readonly value: string;
  readonly state: "PASS" | "REFUSED" | "WAITING";
}

export interface LedgerLimits {
  readonly maxPct: number;
  readonly maxTrade: number;
}

const LEDGER_TITLES: Record<MandateCheckId, string> = {
  underlying_allowed: "EXPOSURE",
  max_protection_pct: "MAX HEDGE",
  max_trade_value: "MAX TRADE",
  max_leverage: "LEVERAGE",
  approval_required: "HUMAN APPROVAL",
  min_order_amount: "MIN SIZE",
};

function ledgerValue(
  check: MandateCheck,
  proposal: ProtectionProposal,
  limits: LedgerLimits,
): string {
  switch (check.id) {
    case "underlying_allowed":
      return proposal.underlying;
    case "max_protection_pct":
      return `${proposal.protectionPct}% / ${limits.maxPct}%`;
    case "max_trade_value":
      return `$${proposal.proposedTradeValueUsdt} / $${limits.maxTrade}`;
    case "max_leverage":
      return `${proposal.leverageUsed}x`;
    case "approval_required":
      return "REQUIRED";
    case "min_order_amount":
      return check.detail;
  }
}

/** Pure mapping from a server-computed decision to indexed ledger rows. */
export function ledgerRows(
  decision: MandateDecision,
  proposal: ProtectionProposal,
  limits: LedgerLimits,
): LedgerRow[] {
  return decision.checks.map((check, i) => ({
    index: String(i + 1).padStart(2, "0"),
    title: LEDGER_TITLES[check.id],
    value: ledgerValue(check, proposal, limits),
    state: (check.id === "approval_required" ? "WAITING" : check.pass ? "PASS" : "REFUSED") as
      | "PASS"
      | "REFUSED"
      | "WAITING",
  }));
}

/** Truthful cleared-rule count straight from the decision's checks. */
export function rulesCleared(decision: MandateDecision): { cleared: number; total: number } {
  return {
    cleared: decision.checks.filter((c) => c.pass).length,
    total: decision.checks.length,
  };
}

// ---- Mandate Gate core (signature primitive) ---------------------------------
// Level-3 gate object: one inner illumination, a finite check beam, and a
// floor reflection on PASS. Refusal stays flat clay with no glow or beam.

export function GateCore({ state }: { state: "PASS" | "REFUSED" | null }) {
  const lit = state === "PASS";
  const refused = state === "REFUSED";
  return (
    <div
      className={`tx-material-critical relative rounded-[18px] px-5 py-7 text-softwhite sm:px-10 ${refused ? "tx-gate-refused" : ""}`}
      aria-label="Mandate Gate"
    >
      {lit ? <span className="tx-gate-beam" aria-hidden="true" /> : null}
      <p className="font-syslabel relative text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/60">
        MANDATE_GATE · ENFORCED · DETERMINISTIC
      </p>
      <div className="relative mt-4 flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
        <div className={`tx-gate-aperture ${refused ? "tx-gate-refused" : ""}`} aria-hidden="true">
          {lit ? <span className="tx-gate-floor" /> : null}
        </div>
        <div className="text-center sm:text-left">
          <p
            className="text-[56px] font-extrabold leading-none tracking-[-0.03em] sm:text-[72px]"
            style={{ color: state === null ? "#6E6D66" : state === "PASS" ? "#F5FF3B" : "#C74B3B" }}
          >
            {state ?? "GATE"}
          </p>
          <p className="mt-2 text-[16px] leading-[24px] text-softwhite/80">
            {state === "PASS"
              ? "Every rule cleared. Approval still required — nothing has moved."
              : state === "REFUSED"
                ? "A rule failed below. No approval path exists from here."
                : "Verdict pending."}
          </p>
        </div>
      </div>
      {lit ? <span className="tx-gate-floor" aria-hidden="true" /> : null}
    </div>
  );
}
