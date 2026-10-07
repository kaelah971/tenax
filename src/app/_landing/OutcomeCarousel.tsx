// Authority outcome carousel: the four first-class Tenax outcomes presented
// as system states, not testimonials. Tiny client island (index state only);
// server render shows index 0 so hydration is deterministic.
"use client";

import { useState } from "react";

import { ArrowLeftIcon, ArrowRightIcon } from "./icons";

type Tone = "refuse" | "escalate" | "pass" | "review";

interface Outcome {
  readonly name: string;
  readonly tone: Tone;
  readonly glyph: string;
  readonly description: string;
  readonly result: string;
  readonly boundary: string;
}

export const AUTHORITY_OUTCOMES: readonly Outcome[] = [
  {
    name: "REFUSE",
    tone: "refuse",
    glyph: "✕",
    description: "Proposed action violates the standing mandate.",
    result: "NO ORDER SENT",
    boundary: "STOPPED AT · MANDATE GATE",
  },
  {
    name: "ESCALATE",
    tone: "escalate",
    glyph: "↑",
    description: "The action exceeds the agent's authority and must move to higher authority.",
    result: "NO AUTONOMOUS ORDER SENT",
    boundary: "ROUTED TO · HIGHER AUTHORITY",
  },
  {
    name: "PASS",
    tone: "pass",
    glyph: "✓",
    description:
      "Action satisfies the deterministic mandate and may proceed to its next required authority step.",
    result: "PROCEEDS TO NEXT REQUIRED STEP",
    boundary: "CLEARED · MANDATE GATE",
  },
  {
    name: "REVIEW REQUIRED",
    tone: "review",
    glyph: "◐",
    description: "Human review is required before execution may continue.",
    result: "NO AUTONOMOUS ORDER SENT",
    boundary: "HELD FOR · HUMAN REVIEW",
  },
];

const pad = (n: number): string => String(n).padStart(2, "0");

const TONE_SURFACE: Record<Tone, string> = {
  refuse: "surface-refuse",
  escalate: "surface-review",
  pass: "surface-authority",
  review: "surface-review",
};

function OutcomeCard({
  outcome,
  position,
  primary,
  className = "",
}: {
  outcome: Outcome;
  position: number;
  primary: boolean;
  className?: string;
}) {
  return (
    <article
      className={`tx-outcome-card flex flex-col ${primary ? "surface-glass-raised tx-outcome-primary" : "surface-glass"} ${TONE_SURFACE[outcome.tone]} tx-outcome-${outcome.tone} ${className}`}
      aria-label={`${outcome.name} outcome`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="tx-outcome-seal" aria-hidden="true">
          {outcome.glyph}
        </span>
        <span className="font-syslabel text-[10px] uppercase leading-[14px] tracking-[0.12em] text-mutedink">
          OUTCOME {pad(position + 1)}
        </span>
      </div>
      <h3 className="tx-outcome-name mt-7 font-display text-[40px] font-bold uppercase leading-[0.95] sm:text-[46px]">
        {outcome.name}
      </h3>
      <p className="mt-3 min-h-[60px] font-syslabel text-[13px] leading-[20px] text-ink/70">{outcome.description}</p>
      <dl className="mt-6 grid gap-3 border-t border-line pt-5">
        <div>
          <dt className="font-syslabel text-[10px] uppercase leading-[14px] tracking-[0.12em] text-mutedink">RESULT</dt>
          <dd className="tx-outcome-result mt-1 font-syslabel text-[12px] font-semibold uppercase leading-[18px] tracking-[0.08em]">
            {outcome.result}
          </dd>
        </div>
        <div>
          <dt className="font-syslabel text-[10px] uppercase leading-[14px] tracking-[0.12em] text-mutedink">BOUNDARY</dt>
          <dd className="mt-1 font-syslabel text-[12px] uppercase leading-[18px] tracking-[0.08em] text-ink/80">
            {outcome.boundary}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function OutcomeCarousel() {
  const [index, setIndex] = useState(0);
  const total = AUTHORITY_OUTCOMES.length;
  const next = (index + 1) % total;
  const go = (to: number) => setIndex(((to % total) + total) % total);

  return (
    <div role="region" aria-roledescription="carousel" aria-label="Authority outcomes" className="grid gap-5 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_250px] lg:gap-6">
      <div aria-live="polite" className="contents">
        <OutcomeCard key={`p-${index}`} outcome={AUTHORITY_OUTCOMES[index]} position={index} primary />
        <OutcomeCard key={`s-${next}`} outcome={AUTHORITY_OUTCOMES[next]} position={next} primary={false} className="max-md:hidden" />
      </div>

      <div className="flex flex-col justify-between gap-6 md:col-span-2 md:flex-row md:items-end lg:col-span-1 lg:flex-col lg:items-stretch lg:py-2">
        <div>
          <p className="font-display text-[56px] font-bold leading-none text-ink">
            {pad(index + 1)}
            <span className="text-mutedink/60"> / {pad(total)}</span>
          </p>
          <p className="mt-2 font-syslabel text-[10px] uppercase tracking-[0.14em] text-mutedink">AUTHORITY OUTCOMES</p>
          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {AUTHORITY_OUTCOMES.map((o, i) => (
              <span key={o.name} className={`h-[3px] flex-1 rounded-full ${i <= index ? "bg-signal shadow-[0_0_8px_rgba(99,255,42,0.6)]" : "bg-ink/15"}`} />
            ))}
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 lg:flex-col">
            {AUTHORITY_OUTCOMES.map((o, i) => (
              <li key={o.name}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === index ? "true" : undefined}
                  className={`font-syslabel min-h-8 text-left text-[11px] uppercase tracking-[0.12em] transition-colors ${
                    i === index ? "text-signal" : "text-mutedink hover:text-ink"
                  }`}
                >
                  {pad(i + 1)} · {o.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous outcome"
            className="tx-btn-secondary flex h-12 w-12 items-center justify-center rounded-[12px] border transition-colors"
          >
            <ArrowLeftIcon />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next outcome"
            className="flex h-12 w-12 items-center justify-center tx-btn-primary rounded-[12px] transition-transform hover:translate-x-0.5"
          >
            <ArrowRightIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
