// Tenax public landing page.
//
// Composition follows the approved dark fintech reference (hero + devices,
// system strip, storytelling visual, three cards, FAQ, outcome carousel,
// closing CTA, footer) with Tenax-only content. Truth rules:
// - no users, volumes, countries, returns, partners or testimonials;
// - device screens are labelled illustrative and render canonical demo
//   fixtures through the real deterministic Mandate Engine;
// - the execution mode is server-resolved per request, never hardcoded;
// - every link targets an existing route or an on-page section.
import Link from "next/link";

import { TenaxMark, TenaxWordmark } from "@/app/app/_components/brand";
import { SignalField } from "@/app/app/_components/signal-field";
import { resolveExecutionMode } from "@/lib/tenax/execution";
import {
  MANDATE_FIXTURE,
  NVDA_EXPOSURE_FIXTURE,
  PROPOSAL_REFUSE_VALUE_FIXTURE,
} from "@/lib/tenax/fixtures";
import { evaluateMandate } from "@/lib/tenax/mandate";
import AuthorityFlow from "./_landing/AuthorityFlow";
import { CtaDevices, type DeviceData } from "./_landing/devices";
import {
  AnalysisIcon,
  DemoIcon,
  EvidenceIcon,
  GateIcon,
  IntentIcon,
  MandateIcon,
  McpIcon,
} from "./_landing/icons";
import HeroArt from "./_landing/HeroArt";
import { HERO_ART } from "./_landing/hero-art";
import OutcomeCarousel from "./_landing/OutcomeCarousel";
import "./_landing/landing.css";

export const dynamic = "force-dynamic";

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Authority", href: "#authority" },
  { label: "Evidence", href: "/app/proof" },
] as const;

const SYSTEM_STRIP = [
  { label: "BITGET MCP", role: "EVENT SOURCE", Icon: McpIcon },
  { label: "BITGET DEMO", role: "VIRTUAL-FUNDS VENUE", Icon: DemoIcon },
  { label: "AI ANALYSIS", role: "INTERPRETS · PROPOSES", Icon: AnalysisIcon },
  { label: "DETERMINISTIC MANDATES", role: "AUTHORIZES · REFUSES", Icon: MandateIcon },
] as const;

const SYSTEM_FACTS = [
  { value: "0", label: "SELF-AUTHORIZED ORDERS", note: null },
  { value: "4", label: "AUTHORITY OUTCOMES", note: "PASS · REFUSE · ESCALATE · REVIEW" },
  { value: "1", label: "DURABLE EVIDENCE CHAIN", note: null },
] as const;

const STAGES = [
  {
    title: "AI INTENT",
    stage: "01 · PROBABILISTIC",
    role: "surface-ai",
    Icon: IntentIcon,
    copy: "Tenax turns market and event context into an explicit proposed action — without granting the model execution authority.",
  },
  {
    title: "MANDATE GATE",
    stage: "02 · DETERMINISTIC",
    role: "surface-authority",
    Icon: GateIcon,
    copy: "Deterministic rules decide whether the proposal is permitted, refused, escalated, or requires human review.",
  },
  {
    title: "DECISION EVIDENCE",
    stage: "03 · DURABLE",
    role: "surface-proof",
    Icon: EvidenceIcon,
    copy: "Every terminal decision preserves what the AI proposed, what authority decided, and what actually happened.",
  },
] as const;

const FAQ = [
  {
    q: "CAN THE AI TRADE BY ITSELF?",
    a: "No. AI produces intent. Execution authority comes from deterministic mandates and, where required, explicit human approval.",
  },
  {
    q: "WHAT HAPPENS IF THE AI PROPOSES SOMETHING DANGEROUS?",
    a: "Tenax can refuse it before an order exists. The refusal becomes durable evidence rather than being recorded as a failed trade.",
  },
  {
    q: "WHAT EXACTLY IS A MANDATE?",
    a: "A mandate defines the deterministic limits around what an autonomous system is allowed to do — including protection size, trade value, review requirements, and execution authority.",
  },
  {
    q: "WHAT'S THE DIFFERENCE BETWEEN REFUSE AND A FAILED TRADE?",
    a: "A refused action never reached execution. Tenax stopped it at the authority layer, so the correct outcome is NO ORDER SENT.",
  },
  {
    q: "DOES TENAX ASSUME THE AI IS ALWAYS RIGHT?",
    a: "No. Tenax is designed around the opposite assumption. Model reasoning and execution authority are deliberately separated.",
  },
  {
    q: "HOW DO I KNOW WHAT ACTUALLY HAPPENED?",
    a: "Tenax links the analysis, authority decision, execution state, run, and durable proof so the decision can be reconstructed afterward.",
  },
] as const;

const FOOTER_COLUMNS = [
  {
    title: "PRODUCT",
    links: [
      { label: "Exposure", href: "/app/exposure/nvidia" },
      { label: "Events", href: "/app/events" },
      { label: "Protect", href: "/app/protect/nvidia" },
      { label: "Evidence", href: "/app/proof" },
    ],
  },
  {
    title: "SYSTEM",
    links: [
      { label: "Mandates", href: "/app/mandate" },
      { label: "Decision Proofs", href: "/app/proof" },
      { label: "Execution", href: "/app/paper-trading" },
    ],
  },
  {
    title: "BUILD",
    links: [
      { label: "Bitget MCP", href: "/app/events" },
      { label: "Bitget Demo", href: "/app/paper-trading" },
    ],
  },
] as const;

const CONTAINER = "mx-auto w-full max-w-[1240px] px-5 sm:px-8";
const H2 = "font-display font-bold uppercase leading-[0.92] tracking-[0.005em] text-ink";
const LEDE = "font-syslabel text-[14px] leading-[24px] text-ink/65 sm:text-[15px] sm:leading-[26px]";
const CTA =
  "tx-l-cta inline-flex min-h-12 items-center justify-center rounded-[11px] pl-6 pr-4 font-syslabel text-[12px] font-semibold uppercase tracking-[0.12em]";

export default function LandingPage() {
  const executionMode = resolveExecutionMode(process.env);
  const decision = evaluateMandate(
    PROPOSAL_REFUSE_VALUE_FIXTURE,
    MANDATE_FIXTURE,
    NVDA_EXPOSURE_FIXTURE,
    "demo-fixture",
  );
  const devices: DeviceData = {
    exposureUsdt: NVDA_EXPOSURE_FIXTURE.exposureValueUsdt,
    representation: NVDA_EXPOSURE_FIXTURE.representation.baseCoin,
    proposal: PROPOSAL_REFUSE_VALUE_FIXTURE,
    decision,
    maxPct: MANDATE_FIXTURE.maxProtectionPct,
    maxTrade: MANDATE_FIXTURE.maxTradeValueUsdt,
  };

  return (
    <div className="tx-landing min-h-screen">
      <SignalField variant="landing" />
      <header className="sticky top-0 z-40 border-b border-line bg-ivory/70 backdrop-blur-xl">
        <div className={`${CONTAINER} relative flex h-16 items-center gap-8`}>
          <TenaxWordmark href="/" label="Tenax home" />
          <nav aria-label="Main navigation" className="ml-auto hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="font-syslabel text-[11px] uppercase tracking-[0.14em] text-ink/60 transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/app"
            className="tx-btn-secondary font-syslabel hidden min-h-10 items-center rounded-[10px] border px-5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors md:inline-flex"
          >
            OPEN APP
          </Link>
          <details className="ml-auto md:hidden">
            <summary className="font-syslabel flex min-h-11 cursor-pointer list-none items-center rounded-[10px] border border-line px-4 text-[11px] uppercase tracking-[0.14em] text-ink/80">
              MENU
            </summary>
            <nav
              aria-label="Main navigation (mobile)"
              className="tx-authority-dock absolute right-5 top-[calc(100%+8px)] flex w-60 flex-col gap-1 rounded-[14px] p-2"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="font-syslabel rounded-[8px] px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-softwhite/80 hover:bg-softwhite/[0.06] hover:text-softwhite"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/app"
                className="font-syslabel mt-1 rounded-[8px] bg-signal/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-signal"
              >
                OPEN APP →
              </Link>
            </nav>
          </details>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative">
          <span className="tx-l-glow tx-l-glow-deep -left-64 -top-64 h-[760px] w-[760px]" aria-hidden="true" />
          <span className="tx-l-glow tx-l-glow-green -right-40 bottom-0 h-[520px] w-[620px]" aria-hidden="true" />
          <span className="tx-l-grid" aria-hidden="true" />
          <div className={`${CONTAINER} grid items-center gap-14 pb-20 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.98fr)] lg:gap-6 lg:pb-24`}>
            <div>
              <p className="font-syslabel text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/70">
                AUTHORITY LAYER FOR AI TRADING
              </p>
              <h1
                id="hero-title"
                className="mt-7 font-display text-[50px] font-bold uppercase leading-[0.9] tracking-[0.005em] text-ink sm:text-[64px] md:text-[76px] lg:text-[62px] xl:text-[78px]"
              >
                <span className="sm:block">Give AI limits</span>{" "}
                <span className="sm:block">before you give it</span>{" "}
                <span className="tx-l-gradient-text sm:block">execution.</span>
              </h1>
              <p className={`${LEDE} mt-7 max-w-[510px]`}>
                Tenax turns AI trading intent into governed action. Every proposal passes through deterministic mandates, human authority where required, and durable decision evidence before an order can move.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link href="/app/protect/nvidia" className={CTA}>
                  SEE TENAX IN ACTION <span className="tx-l-arrow" aria-hidden="true">→</span>
                </Link>
                <p className="font-syslabel text-[10px] uppercase tracking-[0.14em] text-mutedink">
                  □ EXECUTION MODE · {executionMode}
                </p>
              </div>

              <div className="mt-14 max-w-[540px] border-t border-line pt-7">
                <p className="font-syslabel text-[10px] uppercase tracking-[0.18em] text-mutedink">BUILT AROUND</p>
                <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 min-[420px]:grid-cols-2">
                  {SYSTEM_STRIP.map(({ label, role, Icon }) => (
                    <li key={label} className="tx-system-mark">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-softwhite/60">
                        <Icon />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-syslabel text-[11px] font-semibold uppercase tracking-[0.12em]">{label}</span>
                        <span className="block font-syslabel text-[9.5px] uppercase tracking-[0.14em] text-mutedink">{role}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {HERO_ART.approved ? (
              <div className="flex justify-center lg:justify-end lg:pr-[2%]">
                <HeroArt />
              </div>
            ) : null}
          </div>
        </section>

        {/* Storytelling: the authority seam */}
        <section id="product" aria-labelledby="story-title" className="relative scroll-mt-20 py-20 sm:py-28">
          <span className="tx-l-glow tx-l-glow-green -right-56 top-10 h-[560px] w-[620px] opacity-70" aria-hidden="true" />
          <div className={`${CONTAINER} grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-4`}>
            <div className="relative z-10">
              <h2 id="story-title" className={`${H2} text-[40px] sm:text-[52px] lg:text-[42px] xl:text-[50px]`}>
                <span className="sm:block">AI can suggest the trade.</span>{" "}
                <span className="sm:block">Tenax decides whether</span>{" "}
                <span className="sm:block">it has authority.</span>
              </h2>
              <p className={`${LEDE} mt-6 max-w-[470px]`}>
                Models are probabilistic. Execution authority shouldn&apos;t be. Tenax independently evaluates every proposed action against deterministic limits before execution becomes possible.
              </p>
              <dl className="mt-12 grid grid-cols-3 gap-5 border-t border-line pt-8 sm:gap-8">
                {SYSTEM_FACTS.map((fact) => (
                  <div key={fact.label}>
                    <dt className="sr-only">{fact.label}</dt>
                    <dd className="font-display text-[56px] font-bold leading-none text-ink sm:text-[72px]">{fact.value}</dd>
                    <dd className="mt-3 font-syslabel text-[10px] uppercase leading-[15px] tracking-[0.12em] text-ink/70" aria-hidden="true">
                      {fact.label}
                    </dd>
                    {fact.note ? (
                      <dd className="mt-2 font-syslabel text-[9px] uppercase leading-[14px] tracking-[0.12em] text-signal">{fact.note}</dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            </div>
            <div className="relative -mx-5 sm:mx-0 lg:-mr-10 xl:-mr-20">
              <div className="aspect-[840/480] w-full">
                <AuthorityFlow />
              </div>
            </div>
          </div>
        </section>

        {/* Three cards */}
        <section id="how-it-works" aria-labelledby="stages-title" className="relative scroll-mt-20 py-20 sm:py-28">
          <div className={CONTAINER}>
            <div className="mx-auto max-w-[720px] text-center">
              <h2 id="stages-title" className={`${H2} text-[40px] sm:text-[56px]`}>
                <span className="sm:block">From intent</span> <span className="sm:block">to authorized action.</span>
              </h2>
              <p className={`${LEDE} mx-auto mt-5 max-w-[520px]`}>
                Three separations between a model&apos;s idea and an order. None of them can be skipped.
              </p>
            </div>
            <ol className="mt-14 grid gap-5 md:grid-cols-3">
              {STAGES.map(({ title, stage, role, Icon, copy }) => (
                <li key={title} className={`tx-feature-card surface-glass ${role} px-7 pb-10 pt-10`}>
                  <span className="tx-feature-icon">
                    <Icon size={26} />
                  </span>
                  <p className="mt-7 font-syslabel text-[10px] uppercase tracking-[0.16em] text-mutedink">{stage}</p>
                  <h3 className="mt-2 font-display text-[30px] font-bold uppercase leading-none text-ink">{title}</h3>
                  <p className="mt-4 max-w-[310px] font-syslabel text-[13px] leading-[21px] text-ink/65">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-title" className="relative scroll-mt-20 py-20 sm:py-28">
          <span className="tx-l-glow tx-l-glow-deep -left-60 top-0 h-[520px] w-[560px] opacity-70" aria-hidden="true" />
          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-16`}>
            <div>
              <h2 id="faq-title" className={`${H2} text-[40px] sm:text-[56px]`}>
                Curious about <span className="sm:block">Tenax?</span>
              </h2>
              <p className={`${LEDE} mt-6 max-w-[400px]`}>
                The important part isn&apos;t whether AI can propose a trade.{" "}
                <span className="text-ink">It&apos;s who gets to authorize it.</span>
              </p>
              <Link
                href="/app/mandate"
                className="mt-7 inline-flex font-syslabel text-[11px] font-semibold uppercase tracking-[0.12em] text-signal underline decoration-signal/40 underline-offset-[6px] transition-colors hover:decoration-signal"
              >
                Inspect a standing mandate →
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {FAQ.map((item) => (
                <details key={item.q} name="tenax-faq" className="tx-faq-item surface-structural">
                  <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-6 px-5 py-4 font-syslabel text-[12px] font-semibold uppercase leading-[18px] tracking-[0.08em] text-ink sm:px-6">
                    <span>{item.q}</span>
                    <span className="tx-faq-plus text-ink/55" aria-hidden="true" />
                  </summary>
                  <div className="tx-faq-answer px-5 pb-5 sm:px-6">
                    <p className="border-t border-line pt-4 font-syslabel text-[13px] leading-[22px] text-ink/70">{item.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Authority outcomes */}
        <section id="authority" aria-labelledby="authority-title" className="relative scroll-mt-20 py-20 sm:py-28">
          <span className="tx-l-glow tx-l-glow-violet -left-40 top-24 h-[480px] w-[560px]" aria-hidden="true" />
          <div className={CONTAINER}>
            <div className="mx-auto max-w-[760px] text-center">
              <h2 id="authority-title" className={`${H2} text-[40px] sm:text-[56px]`}>
                <span className="sm:block">See what</span> <span className="sm:block">authority looks like.</span>
              </h2>
              <p className={`${LEDE} mx-auto mt-5 max-w-[520px]`}>
                Four first-class outcomes. A refusal is a result, not an error.
              </p>
            </div>
            <div className="mt-14">
              <OutcomeCarousel />
            </div>
            <div className="mt-12 flex justify-center">
              <Link
                href="/app/proof"
                className="tx-btn-secondary font-syslabel inline-flex min-h-11 items-center rounded-[10px] border px-6 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors"
              >
                View recorded decision proofs →
              </Link>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section aria-labelledby="cta-title" className="tx-cta-band mt-24 sm:mt-36">
          <div className={`${CONTAINER} grid items-center gap-6 pb-16 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 lg:py-0`}>
            <div className="lg:py-28">
              <h2 id="cta-title" className={`${H2} text-[40px] sm:text-[56px] xl:text-[62px]`}>
                <span className="sm:block">AI shouldn&apos;t be</span> <span className="sm:block">its own risk officer.</span>
              </h2>
              <p className={`${LEDE} mt-6 max-w-[440px]`}>
                Give autonomous systems intelligence — then put deterministic authority between intent and execution.
              </p>
              <Link href="/app" className={`${CTA} mt-9`}>
                OPEN TENAX <span className="tx-l-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="mx-auto w-full max-w-[520px] lg:-mt-32 lg:max-w-[560px]">
              <CtaDevices data={devices} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-[#040605]/85 backdrop-blur-md">
        <div className={`${CONTAINER} grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.3fr] lg:gap-8`}>
          <div>
            <TenaxWordmark href="/" label="Tenax home" />
            <p className="mt-5 font-syslabel text-[12px] leading-[20px] text-ink/60">
              AI can propose.
              <span className="block">It cannot authorize itself.</span>
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="font-syslabel text-[10px] font-semibold uppercase tracking-[0.18em] text-mutedink">{column.title}</p>
              <ul className="mt-5 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="font-syslabel text-[12px] text-ink/70 transition-colors hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <div>
            <p className="font-syslabel text-[10px] font-semibold uppercase tracking-[0.18em] text-mutedink">EXECUTION MODE</p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-[8px] border border-signal/40 bg-signal/[0.07] px-3 py-1.5 font-syslabel text-[10px] font-semibold uppercase tracking-[0.12em] text-signal">
              <TenaxMark size={14} />□ {executionMode}
            </p>
            <Link
              href="/app"
              className="tx-btn-secondary mt-4 flex min-h-11 w-full max-w-[220px] items-center justify-center rounded-[10px] border font-syslabel text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors"
            >
              OPEN APP →
            </Link>
          </div>
        </div>
        <div className="border-t border-line">
          <div className={`${CONTAINER} flex flex-col gap-2 py-6 font-syslabel text-[10px] uppercase leading-[16px] tracking-[0.12em] text-mutedink sm:flex-row sm:justify-between`}>
            <p>TENAX · BOUNDED AUTONOMY FOR TOKENIZED EQUITIES</p>
            <p>Bitget Demo uses virtual funds. Nothing on this page is trading performance.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
