<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TENAX — AGENT RULES

## CRITICAL RULES

- Treat the docs in `## PROJECT SOURCE OF TRUTH` as authoritative (do not invent them).
- Do not silently change product scope, architecture, financial semantics, or design direction.
- Auto-log meaningful decisions + implementation state to `## Decision log` below (append; never rewrite the Next.js header block).
- Auto-commit after every meaningful verified checkpoint. Push only when `git remote -v` shows a remote and pushing is safe.
- Auto-clean temp files and build clutter; keep the repo recoverable. Never commit `.next/`, `node_modules/`, or secrets.
- Never expose, print, commit, or log secrets or API credentials.

## PROJECT SOURCE OF TRUTH

Read the relevant docs before planning or implementing Tenax work. They are authoritative — do not contradict or silently reinterpret them.

- `docs/tenax_product_idea.md` — product thesis, problem, wedge, differentiation, MVP scope, larger Tenax vision, and 90-second demo concept.
- `docs/tenax_prd_architecture_build_plan.md` — canonical PRD, product requirements, system architecture, domain model, security invariants, implementation phases, exit gates, testing plan, and build order.
- `docs/tenax-brand-messaging.md` — canonical brand messaging, voice, claims discipline, terminology, and product copy guidance.
- `DESIGN.md` — mandatory visual design system, components, interaction language, and UI direction (repo root).

Sub-agent rule: pass or point sub-agents to the relevant source docs before delegating. Never ask questions the docs already answer. If implementation reality conflicts with the docs, stop and report — do not silently change product or architecture.

## RESPONSES

- Concise and execution-focused unless asked otherwise.
- State what changed, verification performed, and blockers.

## STACK & COMMANDS (npm only — `package-lock.json` exists)

- Next.js 16 (Turbopack default) + React 19 + TypeScript strict + Tailwind v4 + ESLint 9 flat. App Router under `src/app/`; `@/*` → `./src/*`.
- `npm run dev` — dev server. `npm run build` — production build + typecheck; this is the verifier (no test suite configured yet).
- `npx tsc --noEmit` — fast typecheck. `npm run lint` — ESLint (`eslint-config-next` core-web-vitals + typescript). `npm run start` — serve production build.
- Tailwind v4 is CSS-first: theme in `src/app/globals.css` via `@import "tailwindcss"` + `@theme`, PostCSS `@tailwindcss/postcss`. No `tailwind.config.js` — don't add one or use v3 `@tailwind` directives.
- `src/app/layout.tsx` uses Next 16 typed routes (`LayoutProps<"/">`) — keep the generated prop type.
- Generated: `.next/`, `next-env.d.ts` — never hand-edit. Docs beat training data: check `node_modules/next/dist/docs/` before writing framework code.

## PLANNING MODE

- Do not ask about decisions already answered by project docs; ask only when ambiguity materially affects implementation or safety.
- Never invent product behavior, API capabilities, financial semantics, or design requirements.
- Use research/deep-dive sub-agents to verify external technical facts; use review sub-agents for complex plans when useful.
- Do not implement while explicitly in planning mode.

## CHANGE / EDIT MODE

- Follow the approved plan and current build phase. Prefer sub-agents for separable work; act as coordinator and review before accepting.
- Parallelize only non-conflicting workstreams. Sub-agents must not redefine architecture or scope.
- Stronger models for complex coding/reasoning, cheaper models for mechanical/docs work.
- After meaningful checkpoints run relevant tests + `npx tsc --noEmit` + `npm run lint` + `npm run build`. Never claim a feature works from code alone.

## TENAX PRODUCT INVARIANTS

- Economic exposure is the primary abstraction; token symbols are representations.
- AI interprets. Deterministic code authorizes. The LLM must never receive unrestricted execution authority.
- Mandate Engine stays deterministic and independently testable. No execution unless Mandate Gate passes + required human approval exists.
- REFUSE / NO ACTION are valid first-class outcomes.
- Never misrepresent execution mode (demo, dry-run, simulated, live); never silently fall back between modes.
- External NVIDIA representations are informational only in the MVP.
- No cross-chain execution, lending, yield routing, marketplaces, smart contracts, multi-agent swarms, or additional assets unless explicitly approved.
- Default execution mode is dry-run until Bitget Demo execution is explicitly proven.

## DATABASE SCHEMA CHANGES

- No database until the approved architecture/build phase requires persistence.
- If Drizzle is introduced: schema changes via `drizzle generate` + migrations. NEVER `drizzle push`.

## TESTING

- Never assume changes work. Use the project's existing tools; if none fit, ask before skipping verification.
- Add focused tests for deterministic financial/policy logic; test Mandate PASS and REFUSE boundaries.
- Test execution adapters without risking real funds. Maintain a golden-path E2E test once the product flow exists.

## SECURITY

- Bitget secrets are server-side only. Never expose secrets via browser bundles, logs, screenshots, fixtures, or commits.
- Use Demo credentials for hackathon development. Never request withdrawal permissions.
- Execution endpoints must independently revalidate mandate + approval. Maintain an environment-level execution kill switch.

## UI DESIGN

- Follow DESIGN.md for all UI work; never invent conflicting colors, typography, spacing, or components.
- The Mandate Gate is the signature interaction — give it appropriate visual emphasis.
- Optimize the primary experience for the 90-second judge demo; stay responsive. Do not build a generic trading terminal.

## Decision log

- 2026-09-18 Phase 0A: zero-credential public Reality spike executed (`scripts/spikes/bitget-public.mjs`); all 8 probes transport-blocked by sandbox DNS (no Bitget response observed) — evidence recorded in `docs/spike-result.md`, rerun required on owner network. No credentials used, no orders placed. Default execution mode stays DRY_RUN.
- 2026-09-18 Phase 0B: official `@bitget-ai/bitget-agent-sdk@3.3.0` installed; Reality-specific order ops NOT SUPPORTED (0/109 catalog matches), UTA `placeOrder` + `dryRun` preview VERIFIED, RNVDAUSDT representation UNCERTAIN; mandate PASS (100 USDT) / REFUSE (200 USDT) + example DRY_RUN receipt proven via `scripts/spikes/bitget-sdk-dryrun.mjs` with zero credentials and zero network writes. KYC blocks Demo — MVP execution mode locked DRY_RUN, BITGET_DEMO gated.
- 2026-09-18 Phase 1A: credential-independent domain foundation added (`src/lib/tenax/` types, Zod schemas, NVDA/RNVDA fixture, PROTECT_EVENT_RISK intent, deterministic Mandate Engine, DRY_RUN-only execution adapter with BITGET_DEMO unavailable, deterministic receipt) + 12 focused vitest tests. No UI, DB, auth, LLM, or Demo code. DRY_RUN remains default; BITGET_DEMO stays supported-but-unverified.
- 2026-09-18 Phase 1B: Bitget Reality intelligence layer added (`src/lib/bitget/reality.ts` credential-free typed adapter for all 8 verified public endpoints with injected-fetch boundary + classified errors; `src/lib/intelligence/` normalized NVDA snapshot with AVAILABLE/PARTIAL/UNAVAILABLE semantics, deterministic EARNINGS builder with occursAt always null, UNKNOWN-by-default session classifier) + 17 vitest tests on Phase 0A-observed fixtures + live contract check `scripts/spikes/bitget-reality-verify.mjs` (8/8 PASS 2026-09-18T21:15–21:16Z, zero credentials). No UI, DB, auth, LLM, Demo, or Mandate-semantics changes.
- 2026-09-18 Phase 1C: golden-path orchestration connected (`src/lib/tenax/` analysis contract with deterministic 20%/100 USDT fixture, hash-bound human approval, ProtectionFlow state machine, service API with server-side mandate re-verification, dev-only isolated store) + 4 dynamic API routes (`/api/capital/nvda`, `/api/protection/{analyze,approve,execute}` with Zod validation, DRY_RUN default, Demo gated) + 14 vitest tests (golden path, pre-approval/REFUSE/tamper blocks, provenance). No LLM, Demo, DB, auth, UI, or earnings-date fabrication.
- 2026-09-18 Phase 1D: golden-path product UI built on the real service (`src/app/app/` shell + Capital/Exposure/Protect/Analysis/Gate/Receipt/Events/Mandate/Activity, DESIGN.md cream/blue/chips/GateCore, centralized honest copy, client components POST-only with server authority) + demo snapshot cache (60s TTL, fetchedAt provenance) + 13 vitest UI-contract tests. No LLM, Demo, DB, auth, landing page, wallet, or earnings-date fabrication.
- 2026-09-18 Phase 1E-A: approved visual rewrite to the Tenax signal system (DESIGN.md beta-signal: Signal Yellow #F5FF3B dominance, Ink authority, ivory field, editorial + mono type, Decision Rail, compact ●○◇□ provenance, ink GateCore with yellow illumination, CSS-only reduced-motion-safe motion). Redesigned shell, Capital hero, Protect arming surface, rail/provenance/gate/check primitives; other pages inherit shell/tokens (full refinement in 1E-B). 59 vitest tests pass. No logic, route, domain, API, mandate, or execution changes.
