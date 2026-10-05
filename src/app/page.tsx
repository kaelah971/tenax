import Link from "next/link";
import { resolveExecutionMode } from "@/lib/tenax/execution";
import { getProofRepository } from "@/lib/proof/repository";
import { reconcileJudgeProofs } from "@/lib/proof/seam";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import {
  formatProofTime,
  proofKindLabel,
  proofTone,
  type ProofTone,
} from "@/lib/proof/display";
import type { JudgeProof } from "@/lib/proof/model";
import { TenaxAgent, TenaxEnvironment, LiveDot } from "@/app/app/_components/living";
import { DecisionRail } from "@/app/app/_components/ui";
import "@/app/app/observatory.css";

export const dynamic = "force-dynamic";

function toneClass(tone: ProofTone): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "border-clay/60";
    case "escalated":
    case "review":
      return "border-signal";
    default:
      return "border-ink/15";
  }
}

function badgeClass(tone: ProofTone): string {
  switch (tone) {
    case "refused":
    case "failed":
      return "bg-clay text-softwhite";
    case "escalated":
    case "review":
      return "bg-signal text-ink font-bold";
    default:
      return "bg-ink text-softwhite";
  }
}

function cardResult(proof: JudgeProof): string {
  switch (proof.kind) {
    case "EXECUTION_FILLED":
      return "FILLED · VERIFIED · BITGET DEMO · VIRTUAL FUNDS";
    case "AUTHORITY_ESCALATED":
      return "NO AUTONOMOUS ORDER SENT";
    case "AUTHORITY_REFUSED":
      return "NO ORDER SENT";
    case "REVIEW_REQUIRED":
      return "NO AUTONOMOUS ORDER SENT";
    case "EXECUTION_FAILED":
      return "NO POSITION OPENED";
  }
}

export default async function LandingPage() {
  const executionMode = resolveExecutionMode(process.env);
  const handle = getProofRepository();
  const store = getTenaxDevStore();

  let proofs: JudgeProof[] = [];
  let storeError: string | null = null;
  const isDurableBackend = handle.backend === "POSTGRES";

  if (!isDurableBackend) {
    storeError = "DATABASE_URL is not configured. Ephemeral session state is never presented as verified proof.";
  } else {
    try {
      await reconcileJudgeProofs(store, handle.repo);
    } catch {
      // Reconcile non-fatal for landing preview
    }

    try {
      proofs = await handle.repo.listProofs({ limit: 3 });
      if (handle.durabilityState !== "DURABLE") {
        storeError = "Durable PostgreSQL connection is unavailable. Ephemeral session state is never presented as verified proof.";
        proofs = [];
      }
    } catch {
      storeError = "Durable history could not be loaded.";
      proofs = [];
    }
  }

  return (
    <div className="tx-observatory-app min-h-screen bg-ivory/60 text-ink antialiased selection:bg-signal selection:text-ink">
      <TenaxEnvironment />

      {/* 1. Header / Navigation */}
      <header className="px-3 pt-3 text-softwhite sm:px-5 sm:pt-5">
        <div className="tx-authority-dock mx-auto flex w-full max-w-[1408px] flex-wrap items-center gap-x-6 gap-y-3 rounded-[18px] px-4 py-3 sm:px-6 sm:py-3.5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Tenax home">
            <span className="inline-block h-4 w-4 bg-signal" aria-hidden="true" />
            <span className="text-[17px] font-extrabold leading-[20px] tracking-[0.08em]">
              TENAX
            </span>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Main Navigation">
            <Link
              href="/app"
              className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/80 transition-colors hover:text-signal"
            >
              CAPITAL
            </Link>
            <Link
              href="/app/protect/nvidia"
              className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/80 transition-colors hover:text-signal"
            >
              PROTECT NVIDIA
            </Link>
            <Link
              href="/app/mandate"
              className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/80 transition-colors hover:text-signal"
            >
              MANDATE
            </Link>
            <Link
              href="/app/proof"
              className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/80 transition-colors hover:text-signal"
            >
              PROOF LEDGER
            </Link>
            <Link
              href="/app/activity"
              className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/80 transition-colors hover:text-signal"
            >
              ACTIVITY
            </Link>
            <Link
              href="/app/connected"
              className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/80 transition-colors hover:text-signal"
            >
              CONNECTED
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="font-syslabel rounded-[7px] border border-signal/70 bg-signal/[0.08] px-2.5 py-1.5 text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_18px_-6px_rgba(245,255,59,0.7)]">
              □ {executionMode}
            </span>
            <Link
              href="/app/protect/nvidia"
              className="btn-living inline-flex items-center justify-center rounded-[9px] bg-signal px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.04em] text-ink hover:brightness-95"
            >
              LAUNCH PROTECTION <span className="btn-arrow ml-1" aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Mobile navigation toggle */}
          <details className="w-full lg:hidden">
            <summary className="font-syslabel min-h-11 cursor-pointer list-none rounded-[10px] border border-softwhite/25 bg-softwhite/5 px-3 py-2.5 text-center text-[11px] uppercase leading-[20px] tracking-[0.08em] transition-colors hover:bg-softwhite/10">
              MENU
            </summary>
            <div className="mt-2 flex flex-col gap-1 rounded-[12px] border border-softwhite/15 bg-ink/95 p-3">
              <Link
                href="/app"
                className="font-syslabel rounded-[6px] px-3 py-2 text-[12px] uppercase tracking-[0.08em] text-softwhite/90 hover:bg-softwhite/5 hover:text-signal"
              >
                CAPITAL
              </Link>
              <Link
                href="/app/protect/nvidia"
                className="font-syslabel rounded-[6px] px-3 py-2 text-[12px] uppercase tracking-[0.08em] text-softwhite/90 hover:bg-softwhite/5 hover:text-signal"
              >
                PROTECT NVIDIA
              </Link>
              <Link
                href="/app/mandate"
                className="font-syslabel rounded-[6px] px-3 py-2 text-[12px] uppercase tracking-[0.08em] text-softwhite/90 hover:bg-softwhite/5 hover:text-signal"
              >
                MANDATE
              </Link>
              <Link
                href="/app/proof"
                className="font-syslabel rounded-[6px] px-3 py-2 text-[12px] uppercase tracking-[0.08em] text-softwhite/90 hover:bg-softwhite/5 hover:text-signal"
              >
                PROOF LEDGER
              </Link>
              <Link
                href="/app/activity"
                className="font-syslabel rounded-[6px] px-3 py-2 text-[12px] uppercase tracking-[0.08em] text-softwhite/90 hover:bg-softwhite/5 hover:text-signal"
              >
                ACTIVITY
              </Link>
              <Link
                href="/app/connected"
                className="font-syslabel rounded-[6px] px-3 py-2 text-[12px] uppercase tracking-[0.08em] text-softwhite/90 hover:bg-softwhite/5 hover:text-signal"
              >
                CONNECTED
              </Link>
            </div>
          </details>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-[1408px] flex-col gap-16 px-4 pt-8 pb-24 sm:gap-24 sm:px-6 sm:pt-14">
        {/* 2. Hero Section */}
        <section aria-label="Hero" className="relative flex flex-col gap-8 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              BOUNDED AUTONOMY FOR TOKENIZED EQUITIES · INSTITUTIONAL RISK INFRASTRUCTURE
            </p>
            <div className="inline-flex items-center gap-2">
              <LiveDot label="PROTOCOL ACTIVE" />
            </div>
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-6">
              <h1 className="max-w-[900px] text-[40px] font-extrabold leading-[0.98] tracking-[-0.04em] text-ink text-balance sm:text-[56px] lg:text-[60px] xl:text-[68px]">
                Give AI permission to act.
                <span className="block">Not unlimited control of your capital.</span>
              </h1>
              <p className="max-w-2xl text-[16px] leading-[26px] text-mutedink sm:text-[19px] sm:leading-[30px]">
                Tenax lets tokenized equity holders define standing protection mandates. AI recommends what to do. Deterministic rules decide what the agent is actually allowed to execute.
              </p>

              {/* Action Buttons Row */}
              <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
                <Link
                  href="/app/protect/nvidia"
                  className="btn-living inline-flex min-h-12 w-full items-center justify-center rounded-[11px] bg-signal px-6 py-3.5 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink shadow-[0_4px_16px_rgba(245,255,59,0.35)] hover:brightness-95 sm:w-auto"
                >
                  LAUNCH NVIDIA PROTECTION <span className="btn-arrow ml-1.5" aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/app/proof"
                  className="btn-living inline-flex min-h-12 w-full items-center justify-center rounded-[11px] border-2 border-ink bg-softwhite/80 px-6 py-3.5 text-[15px] font-bold leading-[20px] tracking-[0.02em] text-ink hover:bg-ink hover:text-softwhite sm:w-auto"
                >
                  VIEW VERIFIED DECISIONS <span className="btn-arrow ml-1.5" aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/app/mandate"
                  className="font-syslabel self-start text-left text-[11px] font-bold uppercase tracking-[0.08em] text-mutedink underline decoration-signal decoration-2 underline-offset-4 transition-colors hover:text-ink"
                >
                  INSPECT STANDING MANDATE →
                </Link>
                <Link
                  href="/app/connected"
                  className="inline-flex min-h-11 self-start items-center justify-center rounded-[9px] border border-ink/25 bg-softwhite/60 px-4 py-2.5 text-left text-[12px] font-bold leading-[16px] tracking-[0.02em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-softwhite sm:ml-1"
                >
                  <span className="font-syslabel text-[10px] uppercase tracking-[0.08em]">CONNECTED · READ ONLY</span>
                  <span className="ml-2">USE YOUR OWN ACCOUNT <span aria-hidden="true">→</span></span>
                </Link>
              </div>
            </div>

            {/* Asset-backed Tenax Sentinel mascot */}
            <div className="flex w-full max-w-[360px] flex-col items-center justify-center self-center rounded-[20px] border border-ink/10 bg-softwhite/40 p-4 backdrop-blur-md sm:max-w-none sm:p-5">
              <TenaxAgent state="watching" size={156} caption="SENTINEL · ACTIVE" />
              <div className="mt-4 text-center">
                <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
                  BOUNDED SENTINEL
                </p>
                <p className="mt-1 text-[12px] leading-[16px] text-mutedink">
                  Autonomous sentinel inspecting order permissions in real time.
                </p>
              </div>
            </div>
          </div>

          {/* Truth / Status Strip */}
          <div className="rounded-[12px] border border-ink/15 bg-softwhite/60 px-4 py-3.5 backdrop-blur-sm sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-syslabel text-[11px] uppercase tracking-[0.08em]">
              <span className="flex items-center gap-1.5 font-bold text-ink">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-pass" aria-hidden="true" />
                ● LIVE BITGET MARKET DATA
              </span>
              <span className="flex items-center gap-1.5 text-mutedink">
                <span className="font-bold text-ink">○</span> SIMULATED NVIDIA EXPOSURE
              </span>
              <span className="flex items-center gap-1.5 text-mutedink">
                <span className="font-bold text-ink">□</span> BITGET DEMO · VIRTUAL FUNDS
              </span>
              <span className="flex items-center gap-1.5 font-bold text-ink">
                <span className="text-signal">■</span> DURABLE DECISION PROOF
              </span>
            </div>
          </div>
        </section>

        {/* 3. Core Problem & Solution (Why Tenax Exists) */}
        <section
          aria-label="Core Problem and Solution"
          className="tx-material-editorial flex flex-col gap-6 border-t-2 border-ink pt-8 sm:pt-10"
        >
          {/* Thesis banner */}
          <div className="rounded-[18px] border-2 border-ink bg-ink p-6 text-softwhite shadow-[0_16px_36px_-16px_rgba(17,17,17,0.4)] sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-softwhite/15 pb-4">
              <span className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-signal">
                CORE THESIS · THE TENAX INVARIANT
              </span>
              <span className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/60">
                PERMISSION OVER CAPABILITY
              </span>
            </div>
            <p className="mt-4 text-[24px] font-extrabold leading-[1.1] tracking-[-0.03em] text-softwhite sm:text-[36px]">
              Most agent systems focus on what an agent can do. Tenax focuses on what the agent is{" "}
              <span className="text-signal underline decoration-signal decoration-2 underline-offset-4">
                allowed to do
              </span>
              .
            </p>
            <p className="mt-3 max-w-3xl text-[15px] leading-[24px] text-softwhite/80 sm:text-[17px]">
              Autonomy without deterministic boundaries is an existential balance sheet liability. Tenax sits between recommendation algorithms and execution venues to eliminate agent overreach.
            </p>
          </div>

          {/* Contrast grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* The Risk */}
            <div className="flex flex-col justify-between rounded-[18px] border-x border-b border-t-4 border-ink/15 border-t-clay bg-softwhite/50 p-6 sm:p-7">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-clay">
                    THE RISK · UNRESTRICTED AUTONOMY
                  </span>
                  <span className="rounded-full bg-clay/10 px-2.5 py-0.5 font-syslabel text-[10px] font-bold text-clay">
                    VULNERABLE
                  </span>
                </div>
                <h3 className="mt-3 text-[22px] font-extrabold leading-[28px] tracking-[-0.02em] text-ink">
                  The Danger of Unbounded Agents
                </h3>
                <p className="mt-3 text-[14px] leading-[22px] text-mutedink sm:text-[15px]">
                  Unrestricted AI agents holding trading API keys can over-hedge, increase leverage, hallucinate positions, or liquidate portfolios during market volatility.
                </p>
                <ul className="mt-5 flex flex-col gap-2.5 border-t border-ink/10 pt-4 text-[13px] text-ink">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-clay">✕</span>
                    <span>Hallucinates trade sizing outside portfolio risk limits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-clay">✕</span>
                    <span>Uncapped leverage escalation during high volatility spikes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-clay">✕</span>
                    <span>Accidental spot liquidation or off-mandate token transfers</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-clay">✕</span>
                    <span>No deterministic guarantee between prompt text and exchange API</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 rounded-[8px] border border-clay/20 bg-clay/5 p-3">
                <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-clay">
                  CONSEQUENCE: COMPLETE CAPITAL COMPROMISE
                </p>
              </div>
            </div>

            {/* The Tenax Layer */}
            <div className="flex flex-col justify-between rounded-[18px] border-x border-b border-t-4 border-ink/15 border-t-pass bg-softwhite/70 p-6 shadow-[0_4px_20px_-8px_rgba(17,17,17,0.08)] sm:p-7">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-pass">
                    THE TENAX LAYER · BOUNDED PERMISSION
                  </span>
                  <span className="rounded-full bg-pass/10 px-2.5 py-0.5 font-syslabel text-[10px] font-bold text-pass">
                    ENFORCED
                  </span>
                </div>
                <h3 className="mt-3 text-[22px] font-extrabold leading-[28px] tracking-[-0.02em] text-ink">
                  Programmable Capital Intent
                </h3>
                <p className="mt-3 text-[14px] leading-[22px] text-mutedink sm:text-[15px]">
                  Standing mandates define strict numeric guardrails (caps on protection %, notional USD, 1x leverage, hedge-only actions). Deterministic code enforces the boundary.
                </p>
                <ul className="mt-5 flex flex-col gap-2.5 border-t border-ink/10 pt-4 text-[13px] text-ink">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-pass">✓</span>
                    <span>Strict percentage and dollar notional hedge ceilings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-pass">✓</span>
                    <span>Invariable 1x leverage cap — no leveraged exposure permitted</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-pass">✓</span>
                    <span>Hedge-only contracts on whitelisted Bitget inverse perpetuals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-pass">✓</span>
                    <span>Immutable proof record in PostgreSQL ledger for every verdict</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 rounded-[8px] border border-signal/60 bg-signal/20 p-3">
                <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
                  OUTCOME: CONTINUOUS SAFETY WITHOUT PER-TRADE FRICTION
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3A. Example Standing Mandate (Concrete programmable authority) */}
        <section
          aria-label="Example Standing Mandate"
          className="tx-material-editorial flex flex-col gap-6 border-t-2 border-ink pt-8 sm:pt-10"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                EXAMPLE CAPITAL INTENT · STANDING MANDATE
              </p>
              <span className="font-syslabel rounded-[4px] border border-ink/25 bg-softwhite/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-mutedink">
                ILLUSTRATIVE ONLY
              </span>
            </div>
            <h2 className="text-[32px] font-extrabold leading-[0.95] tracking-[-0.03em] text-ink sm:text-[52px]">
              Permission, made concrete.
            </h2>
            <p className="max-w-3xl text-[15px] leading-[22px] text-mutedink">
              The agent does not receive unlimited discretion. It receives a mandate.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
            <div className="rounded-[16px] border-2 border-ink bg-ink p-5 text-softwhite sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-softwhite/15 pb-4">
                <div>
                  <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-signal">
                    STANDING MANDATE
                  </p>
                  <p className="mt-1 text-[18px] font-extrabold leading-[22px]">
                    NVIDIA PROTECTION
                  </p>
                </div>
                <span className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-softwhite/60">
                  EXAMPLE MANDATE
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-4 sm:grid-cols-3">
                <div className="min-w-0 border-t border-softwhite/15 py-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">SUBJECT</dt>
                  <dd className="mt-1 break-words text-[20px] font-extrabold leading-[24px] tabular-nums">NVIDIA</dd>
                </div>
                <div className="min-w-0 border-t border-softwhite/15 py-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MARKET</dt>
                  <dd className="mt-1 break-words text-[20px] font-extrabold leading-[24px] tabular-nums">NVDAUSDT</dd>
                </div>
                <div className="min-w-0 border-t border-softwhite/15 py-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MAX PROTECTION</dt>
                  <dd className="mt-1 break-words text-[20px] font-extrabold leading-[24px] tabular-nums">30%</dd>
                </div>
                <div className="min-w-0 border-t border-softwhite/15 py-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MAX ACTION</dt>
                  <dd className="mt-1 break-words text-[20px] font-extrabold leading-[24px] tabular-nums">$100</dd>
                </div>
                <div className="min-w-0 border-t border-softwhite/15 py-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MAX LEVERAGE</dt>
                  <dd className="mt-1 break-words text-[20px] font-extrabold leading-[24px] tabular-nums">1X</dd>
                </div>
                <div className="min-w-0 border-t border-softwhite/15 py-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">MAX EXECUTIONS</dt>
                  <dd className="mt-1 break-words text-[20px] font-extrabold leading-[24px] tabular-nums">1</dd>
                </div>
                <div className="min-w-0 border-t border-softwhite/15 py-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">SELL UNDERLYING</dt>
                  <dd className="mt-1 break-words text-[20px] font-extrabold leading-[24px] text-signal">NEVER</dd>
                </div>
                <div className="min-w-0 border-t border-softwhite/15 py-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">TRANSFERS</dt>
                  <dd className="mt-1 break-words text-[20px] font-extrabold leading-[24px] text-signal">NEVER</dd>
                </div>
                <div className="col-span-2 min-w-0 border-t border-softwhite/15 py-3 sm:col-span-3">
                  <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">AUTHORITY MODE</dt>
                  <dd className="mt-1 break-words text-[19px] font-extrabold leading-[24px] text-signal sm:text-[22px]">AUTO WITH ESCALATION</dd>
                </div>
              </dl>

              <p className="font-syslabel mt-4 border-t border-softwhite/15 pt-3 text-[11px] uppercase leading-[16px] tracking-[0.08em] text-softwhite/55">
                ILLUSTRATIVE POLICY · NOT YOUR ACTIVE MANDATE
              </p>
            </div>

            <div className="grid content-start gap-3">
              <div className="border-l-4 border-pass bg-pass/5 p-4">
                <p className="font-syslabel text-[11px] font-bold uppercase leading-[14px] tracking-[0.08em] text-pass">
                  INSIDE BOUNDS
                </p>
                <p className="mt-2 text-[17px] font-bold leading-[22px] text-ink">
                  Tenax may act automatically.
                </p>
              </div>
              <div className="border-l-4 border-signal bg-signal/15 p-4">
                <p className="font-syslabel text-[11px] font-bold uppercase leading-[14px] tracking-[0.08em] text-ink">
                  OUTSIDE DELEGATED BOUNDS
                </p>
                <p className="mt-2 text-[17px] font-bold leading-[22px] text-ink">
                  Human review required.
                </p>
              </div>
              <div className="border-l-4 border-clay bg-clay/5 p-4">
                <p className="font-syslabel text-[11px] font-bold uppercase leading-[14px] tracking-[0.08em] text-clay">
                  HARD SAFETY VIOLATION
                </p>
                <p className="mt-2 text-[17px] font-bold leading-[22px] text-ink">
                  Tenax refuses the action.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. How Tenax Works (The 6-Stage Bounded Flow) */}
        <section
          aria-label="How Tenax Works"
          className="tx-material-editorial flex flex-col gap-8 border-t-2 border-ink pt-8 sm:pt-10"
        >
          <div className="flex flex-col gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              ARCHITECTURE · THE 6-STAGE BOUNDED LIFECYCLE
            </p>
            <h2 className="text-[32px] font-extrabold leading-[0.95] tracking-[-0.03em] text-ink sm:text-[52px]">
              How Tenax Works
            </h2>
            <p className="max-w-2xl text-[15px] leading-[22px] text-mutedink">
              From initial tokenized asset exposure to immutable decision receipt, every transition is observable, auditable, and bounded.
            </p>
          </div>

          {/* Decision Rail component */}
          <div className="overflow-x-auto py-2">
            <DecisionRail current="MANDATE" />
          </div>

          {/* Prominent Transformation Diagram */}
          <div className="rounded-[16px] border border-ink/20 bg-ink p-5 text-softwhite sm:p-7">
            <p className="mb-4 text-center font-syslabel text-[11px] uppercase tracking-[0.08em] text-signal">
              MANDATE GATE PIPELINE TRANSFORMATION
            </p>
            <div className="flex flex-col items-center justify-center gap-3 text-center font-syslabel text-[12px] uppercase tracking-[0.06em] sm:gap-4 sm:text-[13px] md:flex-row">
              <div className="w-full rounded-[10px] border border-softwhite/20 bg-softwhite/10 px-4 py-3 font-bold text-softwhite md:w-auto">
                AI PROPOSAL
              </div>
              <span className="text-[18px] font-extrabold text-signal">↓</span>
              <div className="w-full rounded-[10px] border-2 border-signal bg-signal/15 px-4 py-3 font-bold text-signal md:w-auto">
                DETERMINISTIC MANDATE EVALUATION
              </div>
              <span className="text-[18px] font-extrabold text-signal">↓</span>
              <div className="grid w-full grid-cols-3 gap-2 md:w-auto">
                <span className="rounded-[8px] border border-pass/60 bg-pass/20 px-3 py-2 text-[11px] font-bold text-pass">
                  EXECUTE
                </span>
                <span className="rounded-[8px] border border-signal/60 bg-signal/20 px-3 py-2 text-[11px] font-bold text-signal">
                  ESCALATE
                </span>
                <span className="rounded-[8px] border border-clay/60 bg-clay/20 px-3 py-2 text-[11px] font-bold text-clay">
                  REFUSE
                </span>
              </div>
            </div>
          </div>

          {/* 6 Sequential Steps */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Step 1 */}
            <div className="flex flex-col rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                <span className="font-syslabel text-[24px] font-extrabold text-ink">01</span>
                <span className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-mutedink">
                  STAGE
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-bold text-ink">01 EXPOSURE</h3>
              <p className="mt-2 text-[14px] leading-[20px] text-mutedink">
                Simulated NVIDIA tokenized equity ($500 rNVDA). Monitors underlying balance sheet asset and vulnerability window.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                <span className="font-syslabel text-[24px] font-extrabold text-ink">02</span>
                <span className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-mutedink">
                  STAGE
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-bold text-ink">02 INTENT</h3>
              <p className="mt-2 text-[14px] leading-[20px] text-mutedink">
                Natural-language risk intent (&ldquo;Protect my NVIDIA through earnings&rdquo;). Converts holder objective into a structured agent task.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                <span className="font-syslabel text-[24px] font-extrabold text-ink">03</span>
                <span className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-mutedink">
                  STAGE
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-bold text-ink">03 INTELLIGENCE</h3>
              <p className="mt-2 text-[14px] leading-[20px] text-mutedink">
                Live Bitget market data + AI risk evaluation and hedge proposal. Synthesizes orderbook metrics, 24h ranges, and volatility risks.
              </p>
            </div>

            {/* Step 4 */}
            <div className="flex flex-col rounded-[14px] border-2 border-signal bg-softwhite/80 p-5 shadow-[0_4px_16px_rgba(245,255,59,0.15)]">
              <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                <span className="font-syslabel text-[24px] font-extrabold text-ink">04</span>
                <span className="rounded bg-signal px-2 py-0.5 font-syslabel text-[10px] font-bold uppercase text-ink">
                  CORE GATE
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-bold text-ink">04 MANDATE</h3>
              <p className="mt-2 text-[14px] leading-[20px] text-mutedink">
                Deterministic permission gate checking ceilings and forbidden actions. Mathematical rules strictly govern whether execution is permitted.
              </p>
            </div>

            {/* Step 5 */}
            <div className="flex flex-col rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                <span className="font-syslabel text-[24px] font-extrabold text-ink">05</span>
                <span className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-mutedink">
                  STAGE
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-bold text-ink">05 ACTION</h3>
              <p className="mt-2 text-[14px] leading-[20px] text-mutedink">
                Bounded execution, human review escalation, or hard refusal. Immediate routing based solely on verified mathematical authorization.
              </p>
            </div>

            {/* Step 6 */}
            <div className="flex flex-col rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div className="flex items-center justify-between border-b border-ink/10 pb-3">
                <span className="font-syslabel text-[24px] font-extrabold text-ink">06</span>
                <span className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-mutedink">
                  STAGE
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-bold text-ink">06 PROOF</h3>
              <p className="mt-2 text-[14px] leading-[20px] text-mutedink">
                Immutable decision receipt and durable PostgreSQL judge ledger. Permanent records preserve full context, parameters, and hashes.
              </p>
            </div>
          </div>
        </section>

        {/* 5. Three Outcomes Story (Bounded Autonomy is the Feature) */}
        <section
          aria-label="Three Outcomes Story"
          className="tx-material-editorial flex flex-col gap-6 border-t-2 border-ink pt-8 sm:pt-10"
        >
          <div className="flex flex-col gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              BOUNDED OUTCOMES · SAFETY BY CONSTRUCTION
            </p>
            <h2 className="text-[32px] font-extrabold leading-[0.95] tracking-[-0.03em] text-ink sm:text-[52px]">
              Three Outcomes Story
            </h2>
            <p className="max-w-3xl text-[15px] leading-[22px] text-mutedink">
              Bounded autonomy means the agent can execute freely inside standing parameters, safely escalates when limits are exceeded, and is stopped cold on invalid operations.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Outcome 1: EXECUTE */}
            <div className="flex flex-col justify-between rounded-[18px] border-x border-b border-t-4 border-ink/15 border-t-pass bg-softwhite/70 p-6 shadow-[0_8px_24px_-12px_rgba(23,122,80,0.15)] sm:p-7">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-ink/10 pb-3">
                  <span className="rounded-full bg-pass/10 px-2.5 py-1 font-syslabel text-[11px] font-bold uppercase text-pass">
                    INSIDE MANDATE · AUTONOMOUS
                  </span>
                  <span className="font-syslabel text-[11px] font-bold text-pass">01</span>
                </div>
                <h3 className="mt-4 text-[22px] font-extrabold leading-[26px] tracking-[-0.02em] text-ink">
                  Execute Within Bounds
                </h3>
                <p className="mt-3 text-[14px] leading-[22px] text-mutedink">
                  When an AI proposal strictly satisfies your active standing mandate, Tenax executes autonomously on Bitget Demo with zero delay. No per-trade approval needed.
                </p>
              </div>
              <div className="mt-6 rounded-[10px] border border-pass/30 bg-pass/5 p-3.5">
                <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-pass">
                  GUARDRAIL GUARANTEE
                </p>
                <p className="mt-1 text-[12px] font-medium leading-[16px] text-ink">
                  Bounded by max protection %, max notional, and 1x leverage.
                </p>
              </div>
            </div>

            {/* Outcome 2: ESCALATE */}
            <div className="flex flex-col justify-between rounded-[18px] border-x border-b border-t-4 border-ink/15 border-t-signal bg-softwhite/70 p-6 shadow-[0_8px_24px_-12px_rgba(245,255,59,0.2)] sm:p-7">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-ink/10 pb-3">
                  <span className="rounded-full bg-signal px-2.5 py-1 font-syslabel text-[11px] font-bold uppercase text-ink">
                    OUTSIDE NUMERIC BOUNDS · REVIEW
                  </span>
                  <span className="font-syslabel text-[11px] font-bold text-ink">02</span>
                </div>
                <h3 className="mt-4 text-[22px] font-extrabold leading-[26px] tracking-[-0.02em] text-ink">
                  Escalate to Human Review
                </h3>
                <p className="mt-3 text-[14px] leading-[22px] text-mutedink">
                  When an action exceeds numerical boundaries (such as cumulative hedge exceeding your mandate cap), Tenax halts autonomously. A human review is required before any order can be submitted.
                </p>
              </div>
              <div className="mt-6 rounded-[10px] border border-signal bg-signal/15 p-3.5">
                <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
                  GUARDRAIL GUARANTEE
                </p>
                <p className="mt-1 text-[12px] font-medium leading-[16px] text-ink">
                  No autonomous order sent. Standing budget stays untouched.
                </p>
              </div>
            </div>

            {/* Outcome 3: REFUSE */}
            <div className="flex flex-col justify-between rounded-[18px] border-x border-b border-t-4 border-ink/15 border-t-clay bg-softwhite/70 p-6 shadow-[0_8px_24px_-12px_rgba(199,75,59,0.15)] sm:p-7">
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-ink/10 pb-3">
                  <span className="rounded-full bg-clay px-2.5 py-1 font-syslabel text-[11px] font-bold uppercase text-softwhite">
                    HARD SAFETY FAILURE · BLOCKED
                  </span>
                  <span className="font-syslabel text-[11px] font-bold text-clay">03</span>
                </div>
                <h3 className="mt-4 text-[22px] font-extrabold leading-[26px] tracking-[-0.02em] text-ink">
                  Refuse Unsafe Actions
                </h3>
                <p className="mt-3 text-[14px] leading-[22px] text-mutedink">
                  When an action attempts a forbidden operation (spot sale, transfer, leverage change, off-list symbol, stale data), Tenax refuses outright. Refusal is a first-class feature.
                </p>
              </div>
              <div className="mt-6 rounded-[10px] border border-clay/30 bg-clay/5 p-3.5">
                <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-clay">
                  GUARDRAIL GUARANTEE
                </p>
                <p className="mt-1 text-[12px] font-medium leading-[16px] text-ink">
                  Hard stop. No order sent. Refusal reason recorded in immutable proof.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Real Proof Preview (Live Durable PostgreSQL Ledger) */}
        <section
          aria-label="Real Proof Preview"
          className="tx-material-editorial flex flex-col gap-6 border-t-2 border-ink pt-8 sm:pt-10"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
                LIVE DURABLE POSTGRESQL LEDGER
              </p>
              <h2 className="mt-2 text-[32px] font-extrabold leading-[0.95] tracking-[-0.03em] text-ink sm:text-[52px]">
                Verified Proof Ledger
              </h2>
              <p className="mt-2 max-w-2xl text-[15px] leading-[22px] text-mutedink">
                Every terminal outcome from autonomous protection cycles is immutably committed to durable storage.
              </p>
            </div>
            <Link
              href="/app/proof"
              className="btn-living inline-flex min-h-11 items-center justify-center rounded-[11px] bg-ink px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.04em] text-softwhite hover:bg-graphite"
            >
              VIEW ALL PROOFS →
            </Link>
          </div>

          {storeError ? (
            <div className="rounded-[14px] border-2 border-clay/40 bg-clay/5 p-6">
              <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-clay">
                DURABLE HISTORY UNAVAILABLE
              </p>
              <p className="mt-2 text-[14px] text-mutedink">{storeError}</p>
            </div>
          ) : proofs.length === 0 ? (
            <div className="rounded-[16px] border border-ink/15 bg-softwhite/60 p-6 text-center sm:p-8">
              <p className="font-syslabel text-[12px] font-bold uppercase tracking-[0.08em] text-mutedink">
                DURABLE POSTGRES LEDGER ACTIVE · AWAITING FIRST TERMINAL OUTCOME
              </p>
              <p className="mx-auto mt-2 max-w-xl text-[15px] text-mutedink">
                Terminal outcomes from protection flows are recorded here as immutable proof. Launch a protection flow to generate verified entries.
              </p>
              <div className="mt-5">
                <Link
                  href="/app/protect/nvidia"
                  className="btn-living inline-flex items-center justify-center rounded-[9px] bg-signal px-4 py-2.5 text-[13px] font-bold text-ink hover:brightness-95"
                >
                  GENERATE FIRST PROOF →
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {proofs.map((proof) => {
                const tone = proofTone(proof.kind);
                return (
                  <div
                    key={proof.id}
                    className={`flex flex-col justify-between rounded-[14px] border-2 bg-softwhite/70 p-5 ${toneClass(tone)}`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 border-b border-ink/10 pb-3">
                        <span className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">
                          NVIDIA · NVDAUSDT
                        </span>
                        <span
                          className={`state-mark rounded-[4px] px-2 py-0.5 font-syslabel text-[10px] ${badgeClass(tone)}`}
                        >
                          {proofKindLabel(proof.kind)}
                        </span>
                      </div>
                      <p className="font-syslabel mt-3 text-[11px] uppercase tracking-[0.08em] text-mutedink">
                        {formatProofTime(proof.createdAt)}
                      </p>
                      <p className="font-syslabel mt-2 text-[12px] font-bold uppercase tracking-[0.06em] text-ink">
                        {cardResult(proof)}
                      </p>
                    </div>
                    <div className="mt-5 border-t border-ink/10 pt-3">
                      <Link
                        href={`/app/proof/${proof.id}`}
                        className="font-syslabel inline-block rounded-[6px] border border-ink/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-softwhite"
                      >
                        VIEW PROOF →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="font-syslabel border-t border-ink/10 pt-3 text-[11px] uppercase leading-[16px] tracking-[0.08em] text-mutedink">
            Historical record only — does not imply an open position or current PnL.
          </p>
        </section>

        {/* 7. Why Tenax is Different (5 Institutional Pillars) */}
        <section
          aria-label="Why Tenax is Different"
          className="tx-material-editorial flex flex-col gap-6 border-t-2 border-ink pt-8 sm:pt-10"
        >
          <div className="flex flex-col gap-3">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              INSTITUTIONAL GRADE CAPITAL GOVERNANCE
            </p>
            <h2 className="text-[32px] font-extrabold leading-[0.95] tracking-[-0.03em] text-ink sm:text-[52px]">
              Why Tenax is Different
            </h2>
            <p className="max-w-2xl text-[15px] leading-[22px] text-mutedink">
              Five foundational architectural commitments designed for institutional custody and treasury safety.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Pillar 1 */}
            <div className="flex flex-col justify-between rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div>
                <span className="font-syslabel inline-block rounded bg-ink px-2 py-1 text-[18px] font-extrabold text-signal">
                  01
                </span>
                <h3 className="mt-4 text-[16px] font-bold text-ink">Programmable Capital Intent</h3>
                <p className="mt-2 text-[13px] leading-[19px] text-mutedink">
                  Holders define risk tolerance, hedge caps, and operational constraints prior to market volatility, encoding intent as code.
                </p>
              </div>
              <p className="font-syslabel mt-4 border-t border-ink/10 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70">
                INTENT OVER DISCRETION
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="flex flex-col justify-between rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div>
                <span className="font-syslabel inline-block rounded bg-ink px-2 py-1 text-[18px] font-extrabold text-signal">
                  02
                </span>
                <h3 className="mt-4 text-[16px] font-bold text-ink">Bounded Standing Authority</h3>
                <p className="mt-2 text-[13px] leading-[19px] text-mutedink">
                  Pre-authorizes action within strict numerical corridors so agents execute instantly when needed without manual trade-by-trade latency.
                </p>
              </div>
              <p className="font-syslabel mt-4 border-t border-ink/10 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70">
                ZERO UNBOUNDED KEYS
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="flex flex-col justify-between rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div>
                <span className="font-syslabel inline-block rounded bg-ink px-2 py-1 text-[18px] font-extrabold text-signal">
                  03
                </span>
                <h3 className="mt-4 text-[16px] font-bold text-ink">Deterministic Enforcement</h3>
                <p className="mt-2 text-[13px] leading-[19px] text-mutedink">
                  Rules are verified by rigorous mathematical assertions. LLMs propose strategy, but deterministic logic decides execution.
                </p>
              </div>
              <p className="font-syslabel mt-4 border-t border-ink/10 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70">
                MATH &gt; PROBABILITY
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="flex flex-col justify-between rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div>
                <span className="font-syslabel inline-block rounded bg-ink px-2 py-1 text-[18px] font-extrabold text-signal">
                  04
                </span>
                <h3 className="mt-4 text-[16px] font-bold text-ink">Escalation Instead of Overreach</h3>
                <p className="mt-2 text-[13px] leading-[19px] text-mutedink">
                  When market reality breaches policy bounds, Tenax automatically pauses and routes to human approval rather than forcing a trade.
                </p>
              </div>
              <p className="font-syslabel mt-4 border-t border-ink/10 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70">
                FAIL-SAFE REVIEW
              </p>
            </div>

            {/* Pillar 5 */}
            <div className="flex flex-col justify-between rounded-[14px] border border-ink/15 bg-softwhite/60 p-5">
              <div>
                <span className="font-syslabel inline-block rounded bg-ink px-2 py-1 text-[18px] font-extrabold text-signal">
                  05
                </span>
                <h3 className="mt-4 text-[16px] font-bold text-ink">Durable Decision Receipts</h3>
                <p className="mt-2 text-[13px] leading-[19px] text-mutedink">
                  Every proposal, mandate evaluation, and execution event produces an immutable cryptographic receipt in the judge ledger.
                </p>
              </div>
              <p className="font-syslabel mt-4 border-t border-ink/10 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70">
                VERIFIABLE AUDIT TRAIL
              </p>
            </div>
          </div>
        </section>

        {/* 8. Judge Journey Quick Start */}
        <section
          aria-label="Judge Journey Quick Start"
          className="tx-material-editorial flex flex-col gap-6 border-t-2 border-ink pt-8 sm:pt-10"
        >
          <div className="flex flex-col gap-3">
            <p className="font-syslabel w-fit rounded bg-ink px-2 py-1 text-[11px] font-bold uppercase leading-[14px] tracking-[0.08em] text-signal">
              HACKATHON EVALUATOR GUIDE · 2-MINUTE WALKTHROUGH
            </p>
            <h2 className="text-[32px] font-extrabold leading-[0.95] tracking-[-0.03em] text-ink sm:text-[52px]">
              Judge Journey Quick Start
            </h2>
            <p className="max-w-2xl text-[15px] leading-[22px] text-mutedink">
              Follow these five sequential steps to experience the complete bounded autonomy loop.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {/* Step 1 */}
            <Link
              href="/app/proof"
              className="btn-living group flex flex-col justify-between gap-4 rounded-[14px] border border-ink/20 bg-softwhite/70 p-5 transition-all hover:border-ink hover:bg-softwhite sm:flex-row sm:items-center"
            >
              <div className="flex items-start gap-4">
                <span className="font-syslabel rounded bg-signal px-2.5 py-1 text-[16px] font-extrabold text-ink">
                  01
                </span>
                <div>
                  <h3 className="text-[16px] font-bold text-ink underline-offset-4 group-hover:underline decoration-signal decoration-2">
                    01 READ THESIS &amp; PROOF PREVIEW
                  </h3>
                  <p className="mt-1 text-[13px] text-mutedink">
                    Inspect immutable decision records and understand how Tenax categorizes executions, escalations, and refusals.
                  </p>
                </div>
              </div>
              <span className="font-syslabel text-[12px] font-bold uppercase tracking-[0.08em] text-ink sm:ml-auto">
                OPEN PROOF LEDGER →
              </span>
            </Link>

            {/* Step 2 */}
            <Link
              href="/app/mandate"
              className="btn-living group flex flex-col justify-between gap-4 rounded-[14px] border border-ink/20 bg-softwhite/70 p-5 transition-all hover:border-ink hover:bg-softwhite sm:flex-row sm:items-center"
            >
              <div className="flex items-start gap-4">
                <span className="font-syslabel rounded bg-signal px-2.5 py-1 text-[16px] font-extrabold text-ink">
                  02
                </span>
                <div>
                  <h3 className="text-[16px] font-bold text-ink underline-offset-4 group-hover:underline decoration-signal decoration-2">
                    02 CONFIGURE STANDING MANDATE
                  </h3>
                  <p className="mt-1 text-[13px] text-mutedink">
                    Review or update the active protection policy: set hedge caps, max USD notional, and 1x leverage constraints.
                  </p>
                </div>
              </div>
              <span className="font-syslabel text-[12px] font-bold uppercase tracking-[0.08em] text-ink sm:ml-auto">
                OPEN MANDATE →
              </span>
            </Link>

            {/* Step 3 */}
            <Link
              href="/app/protect/nvidia"
              className="btn-living group flex flex-col justify-between gap-4 rounded-[14px] border border-ink/20 bg-softwhite/70 p-5 transition-all hover:border-ink hover:bg-softwhite sm:flex-row sm:items-center"
            >
              <div className="flex items-start gap-4">
                <span className="font-syslabel rounded bg-signal px-2.5 py-1 text-[16px] font-extrabold text-ink">
                  03
                </span>
                <div>
                  <h3 className="text-[16px] font-bold text-ink underline-offset-4 group-hover:underline decoration-signal decoration-2">
                    03 LAUNCH NVIDIA PROTECTION
                  </h3>
                  <p className="mt-1 text-[13px] text-mutedink">
                    Run the autonomous protection agent against live Bitget market data and your simulated $500 rNVDA position.
                  </p>
                </div>
              </div>
              <span className="font-syslabel text-[12px] font-bold uppercase tracking-[0.08em] text-ink sm:ml-auto">
                OPEN PROTECT →
              </span>
            </Link>

            {/* Step 4 */}
            <Link
              href="/app/protect/nvidia"
              className="btn-living group flex flex-col justify-between gap-4 rounded-[14px] border border-ink/20 bg-softwhite/70 p-5 transition-all hover:border-ink hover:bg-softwhite sm:flex-row sm:items-center"
            >
              <div className="flex items-start gap-4">
                <span className="font-syslabel rounded bg-signal px-2.5 py-1 text-[16px] font-extrabold text-ink">
                  04
                </span>
                <div>
                  <h3 className="text-[16px] font-bold text-ink underline-offset-4 group-hover:underline decoration-signal decoration-2">
                    04 OBSERVE GATE &amp; ESCALATION
                  </h3>
                  <p className="mt-1 text-[13px] text-mutedink">
                    Watch the deterministic Mandate Gate evaluate the proposal and observe either instant execution or escalation to human review.
                  </p>
                </div>
              </div>
              <span className="font-syslabel text-[12px] font-bold uppercase tracking-[0.08em] text-ink sm:ml-auto">
                OBSERVE FLOW →
              </span>
            </Link>

            {/* Step 5 */}
            <Link
              href="/app/proof"
              className="btn-living group flex flex-col justify-between gap-4 rounded-[14px] border border-ink/20 bg-softwhite/70 p-5 transition-all hover:border-ink hover:bg-softwhite sm:flex-row sm:items-center"
            >
              <div className="flex items-start gap-4">
                <span className="font-syslabel rounded bg-signal px-2.5 py-1 text-[16px] font-extrabold text-ink">
                  05
                </span>
                <div>
                  <h3 className="text-[16px] font-bold text-ink underline-offset-4 group-hover:underline decoration-signal decoration-2">
                    05 VERIFY RECEIPT &amp; RESTART QA
                  </h3>
                  <p className="mt-1 text-[13px] text-mutedink">
                    Inspect the newly generated decision receipt in the durable proof ledger or trigger a fresh QA flow.
                  </p>
                </div>
              </div>
              <span className="font-syslabel text-[12px] font-bold uppercase tracking-[0.08em] text-ink sm:ml-auto">
                VERIFY LEDGER →
              </span>
            </Link>
          </div>
        </section>

        {/* 9. Footer */}
        <footer className="flex flex-col gap-8 border-t-2 border-ink pt-10 pb-16 text-ink">
          {/* Full truth disclosures */}
          <div className="flex flex-col gap-2 rounded-[12px] border border-ink/20 bg-softwhite/40 p-4 sm:p-5">
            <p className="font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
              TRUTH &amp; DISCLOSURE SPECIFICATION
            </p>
            <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              LIVE BITGET MARKET DATA · SIMULATED NVIDIA EXPOSURE · BITGET DEMO · VIRTUAL FUNDS ONLY
            </p>
            <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
              TENAX OPERATING SYSTEM FOR BOUNDED AUTONOMY · HACKATHON SUBMISSION
            </p>
            <p className="mt-1 text-[12px] leading-[18px] text-mutedink">
              Tenax enforces programmable capital intent through standing mandates. Bounded autonomy allows execution only within deterministic numerical constraints. All trading actions are simulated or routed to Bitget Demo with virtual funds.
            </p>
          </div>

          {/* Navigation links grid */}
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-ink/15 pb-8">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-4 w-4 bg-signal" aria-hidden="true" />
              <span className="text-[17px] font-extrabold leading-[20px] tracking-[0.08em]">
                TENAX
              </span>
            </div>
            <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Footer navigation">
              <Link
                href="/app"
                className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink transition-colors hover:text-ink"
              >
                CAPITAL
              </Link>
              <Link
                href="/app/protect/nvidia"
                className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink transition-colors hover:text-ink"
              >
                PROTECT NVIDIA
              </Link>
              <Link
                href="/app/mandate"
                className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink transition-colors hover:text-ink"
              >
                MANDATE
              </Link>
              <Link
                href="/app/proof"
                className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink transition-colors hover:text-ink"
              >
                PROOF LEDGER
              </Link>
              <Link
                href="/app/activity"
                className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink transition-colors hover:text-ink"
              >
                ACTIVITY LOG
              </Link>
              <Link
                href="/app/exposure/nvidia"
                className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink transition-colors hover:text-ink"
              >
                EXPOSURE
              </Link>
              <Link
                href="/app/notifications"
                className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink transition-colors hover:text-ink"
              >
                ALERTS
              </Link>
            </nav>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 text-[12px] text-mutedink">
            <p>© 2026 Tenax Systems. Bounded Autonomy for Tokenized Equities.</p>
            <p className="font-syslabel text-[11px] uppercase tracking-[0.08em]">
              MODE: {executionMode}
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
