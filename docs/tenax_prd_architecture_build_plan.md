# Tenax — PRD, Architecture & Build Plan

**BITGET AI BASE CAMP HACKATHON S2**

Full Product Requirements Document, System Architecture & Build Plan.

**Hackathon product:** AI-powered protection for tokenized U.S. stock exposure around earnings and high-risk events.

**First wedge:** NVIDIA / rNVDA earnings protection through Bitget Demo or verified dry-run.

**Core product fingerprint:** Exposure → Intent → Intelligence → Mandate → Action / Refusal → Receipt

**Status:** product direction locked; public brand: Tenax.

**Build window:** September 18–20, 2026 internal target; September 21 reserved as safety buffer.

---

# PART I — PRODUCT REQUIREMENTS DOCUMENT

## 0. Executive Summary

**Tell your capital what you want it to accomplish.**

Tenax is a control layer for programmable financial exposure. The user expresses an outcome rather than a raw trade command; the system understands what the user economically owns, interprets relevant events, proposes an action, checks that action against a deterministic mandate, requests approval, executes through an existing rail, and produces a transparent decision receipt.

The hackathon does not attempt to build the whole platform. It proves one narrow intent exceptionally well: protect NVIDIA exposure through earnings. The user's position is rNVDA on Bitget. The system resolves that instrument to NVIDIA economic exposure, observes the earnings event and market context, uses AI for interpretation, applies hard permission and sizing rules, and then executes through Bitget Demo if the exact Reality path is supported. Otherwise it uses Bitget's genuine dry-run path and labels it explicitly.

**North-star demo:** A judge should understand the product in under 90 seconds without needing to know token standards, agent frameworks, or cross-chain infrastructure.

**What makes it different:**

- **Exposure-aware:** understands NVIDIA as the economic object beneath rNVDA and other representations.
- **Intent-driven:** starts from "Protect this through earnings," not Buy/Sell buttons.
- **Bounded AI:** AI reasons; deterministic code authorizes.
- **Refusal-aware:** NO ACTION is a first-class valid result.
- **Decision receipts:** records why the system acted, what was allowed, what was rejected and what executed.

---

## 1. Product Definition

**Product name:** Tenax.

**Hackathon product:** An AI agent that protects tokenized U.S. stock exposure around earnings and high-risk events while staying inside explicit user-defined limits.

**Initial asset/event:** NVIDIA economic exposure held as rNVDA on Bitget; NVIDIA earnings is the only fully supported event in the MVP.

**Primary integration:** Bitget Reality/rTokens, Bitget market/fundamental data, Agent Hub/Agent SDK, UTA, Demo/paper environment and/or supported dry-run. Bitget Wallet RWA data seeds the cross-ecosystem exposure view.

## 2. Problem Statement

Tokenized equities combine traditional equity events with crypto-like availability and programmable execution. A holder may be exposed to earnings, after-hours information, changing liquidity and representation-specific constraints without actively monitoring the position. Existing AI trading products often jump from signal to trade; this product inserts a user-owned authority layer between reasoning and action.

The core user question is not "what ticker should I trade?" It is: what is happening to the capital I already own, what should I consider doing, and what is my agent actually allowed to do?

## 3. Goals and Non-Goals

| Goals | Non-Goals |
|---|---|
| Prove one complete event-protection loop | Build a general autonomous hedge fund |
| Use real Bitget data/infrastructure wherever available | Fake a successful transaction |
| Make user authority visible and deterministic | Give the LLM unrestricted account authority |
| Show exposure-level intelligence across representations | Execute cross-chain or build a bridge |
| Create a polished, memorable 90-second demo | Build a Bloomberg-style terminal |
| Leave a credible path to a larger Tenax platform | Support every stock, event or protocol now |

## 4. Target User

**Primary persona:** crypto-native user who holds or trades tokenized U.S. equities and wants extended-hours/programmatic access without manually watching every material event.

**Job to be done:** "When an event could materially affect my tokenized stock exposure, help me understand it and prepare a bounded response without giving an AI unlimited control."

**First use case:** "I own NVIDIA. Earnings are coming. Protect me, but do not touch more than 25% of my position or $125."

## 5. Product Principles

- Economic exposure is the primary abstraction; token symbols are representations.
- AI interprets; deterministic code validates authority, sizing and permissions.
- Recommend → simulate/preview → approve before deeper autonomy.
- Refusal is a valid product outcome.
- Never collapse materially different tokenized instruments into "the same asset."
- Never misrepresent Demo, dry-run, simulated or live execution.
- Every MVP feature must improve the judge demo or prove the larger thesis.

## 6. Core User Journey

| # | Stage | User Experience | System Responsibility |
|---|---|---|---|
| 1 | Connect | Connect Bitget Demo / enter app | Authenticate safely; fetch supported account state |
| 2 | Capital | See NVIDIA exposure | Resolve rNVDA → NVIDIA economic exposure |
| 3 | Event | See upcoming NVIDIA earnings | Fetch event/session/market context |
| 4 | Intent | "Protect this through earnings" | Create PROTECT_EVENT_RISK intent |
| 5 | Mandate | Set max % / $ / leverage / approval | Persist deterministic authority constraints |
| 6 | Analyze | Review agent assessment | AI proposes bounded action or NO ACTION |
| 7 | Gate | See PASS / REFUSE | Run deterministic validation |
| 8 | Approve | Approve one action | Create one-time authorization |
| 9 | Execute | See order/preview status | Call Bitget Demo or dry-run adapter |
| 10 | Receipt | Inspect proof | Persist full decision/action trace |

## 7. Information Architecture

The app is intentionally small. Desktop navigation: Capital, Events, Mandate, Activity. The entire demo can still run as one continuous guided flow.

| Route | Purpose | MVP Status |
|---|---|---|
| `/` | Public landing page and product explanation | Required but lightweight |
| `/app` | Capital dashboard; exposure + next event + intent entry | Core |
| `/app/exposure/nvidia` | NVIDIA exposure view + representation graph | Core |
| `/app/events` | Events affecting monitored capital | Core / minimal |
| `/app/events/nvidia-earnings` | Event Room and agent context | Core |
| `/app/protect/nvidia` | Protection intent + mandate setup | Core |
| `/app/analysis/:id` | Structured AI proposal | Core |
| `/app/approval/:id` | Mandate Gate + approval | Core |
| `/app/receipts/:id` | Decision Receipt | Core |
| `/app/mandate` | Persistent authority view | Core / reused data |
| `/app/activity` | Audit timeline | Core / reused data |

## 8. Screen Requirements

### 8.1 Landing Page
- Hero: "Your tokenized stocks don't sleep when Wall Street closes. Your agent shouldn't either."
- Primary CTA: Launch App.
- Simple mechanism visual: Exposure → Event → AI → Mandate → Action.
- Explain bounded authority and Decision Receipts.
- Show Bitget as the execution/data environment, not as a decorative sponsor logo.
- Do not overbuild marketing sections before the app loop works.

### 8.2 Capital Dashboard
- Show monitored capital and rNVDA/NVIDIA exposure.
- Show next material event: NVIDIA earnings.
- Show protection status.
- Primary intent input: "What should your capital do?"
- CTA into event/protection flow.
- Bitget Demo / Dry Run environment indicator must always be visible.

### 8.3 NVIDIA Exposure View
- Top-level object is NVIDIA, not rNVDAUSDT.
- Show user's rNVDA amount/value and provider/venue.
- Show compact Exposure Graph with rNVDA, NVDAx and Ondo representation where data is available.
- Clearly mark "You are here" on the user's representation.
- External representations are informational only in MVP; no cross-chain action buttons.

### 8.4 Event Room
- Countdown / timing for NVIDIA earnings where available.
- User exposure affected.
- Market/session state and selected contextual signals.
- Agent status: monitoring / ready / assessment available.
- Structured assessment, not a chat transcript.
- CTA: Protect this position.

### 8.5 Protection & Mandate
- Intent fixed to PROTECT_EVENT_RISK for MVP.
- User sets max protected percentage.
- User sets max notional value.
- Leverage disabled by default.
- Approval required by default.
- Mandate summary must be understandable without financial jargon.

### 8.6 Agent Analysis
- Show exposure, event-risk level, relevant signals and concise reasoning.
- Return a proposed protection percentage/notional OR NO ACTION.
- Show alternatives considered.
- Show at least one rejected alternative when appropriate, especially one exceeding mandate.
- Never expose hidden chain-of-thought; show concise user-facing reasons/signals only.

### 8.7 Mandate Gate
- Run deterministic checks one by one: allowed exposure, max %, max $, leverage, approval.
- Display PASS or REFUSE prominently.
- A REFUSE state must explain which rule failed and must not expose an execution CTA.
- A PASS state proceeds to explicit human approval.

### 8.8 Execution
- Show exact proposed action and environment before approval.
- Authorization is one action only.
- If Demo Reality execution works, show genuine paper-order lifecycle.
- If it does not, use the supported dry-run path and label "Execution Preview — No funds moved."
- Never silently fall back from one execution mode to another.

### 8.9 Decision Receipt
- Exposure and representation.
- Intent and event.
- Agent assessment and proposed action.
- Mandate snapshot and rule results.
- Human approval timestamp/state.
- Execution mode and result.
- Alternatives rejected and reasons.
- Stable receipt ID and shareable/readable route.

## 9. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Authenticate/read Bitget Demo account safely | P0 |
| FR-02 | Resolve supported rNVDA position to NVIDIA exposure | P0 |
| FR-03 | Retrieve NVIDIA earnings/event context | P0 |
| FR-04 | Retrieve current relevant market/session context | P0 |
| FR-05 | Create PROTECT_EVENT_RISK intent | P0 |
| FR-06 | Create/edit mandate constraints | P0 |
| FR-07 | Generate structured AI proposal or NO ACTION | P0 |
| FR-08 | Validate proposal deterministically | P0 |
| FR-09 | Require explicit approval | P0 |
| FR-10 | Execute Demo order OR supported dry-run | P0 |
| FR-11 | Persist/display Decision Receipt | P0 |
| FR-12 | Display external NVIDIA representations | P1 |
| FR-13 | Activity timeline from same event data | P1 |
| FR-14 | Public landing page | P1 |
| FR-15 | Share/export receipt image/PDF | P2 |

## 10. Non-Functional Requirements

- **Safety:** no withdrawal capability; least-privilege API permissions; secrets server-side only.
- **Truthfulness:** execution mode and data provenance are visible.
- **Latency:** interactive app actions should feel immediate; AI analysis should show clear progress rather than a frozen screen.
- **Resilience:** unavailable external data must degrade to an explicit "unavailable" state, not fabricated values.
- **Auditability:** every proposal, gate result, approval and execution result is timestamped.
- **Determinism:** mandate validation must be testable and independent from the LLM.
- **Accessibility:** keyboard focus, readable contrast, non-color-only PASS/REFUSE states.
- **Responsive:** desktop judge demo first; mobile remains usable.

## 11. Success Criteria

| Area | Pass Condition |
|---|---|
| Comprehension | A new viewer can explain the product after one 90-second demo. |
| Bitget integration | Real Bitget data is visible and execution path is genuinely Demo or dry-run. |
| Safety | LLM cannot bypass mandate checks; approval required. |
| Differentiation | Exposure Graph + Intent + Mandate + Receipt are visible, not just described. |
| Demo reliability | Golden-path demo can be repeated without manual database edits. |
| Technical quality | Core policy/receipt/execution-adapter tests pass; production build succeeds. |

---

# PART II — SYSTEM ARCHITECTURE

## 12. Architecture Overview

| Layer | Responsibility |
|---|---|
| Web UI | Dashboard, exposure, event, mandate, analysis, approval, receipts |
| Application API | Server-side orchestration; never expose secrets to browser |
| Exposure Engine | Map representation → economic exposure; normalize metadata without erasing differences |
| Event Intelligence | Fetch/normalize earnings, market session and contextual signals |
| AI Reasoning | Return structured proposal + concise reasons; no direct execution authority |
| Mandate Engine | Pure deterministic validation of proposal against user constraints |
| Execution Adapter | Bitget Demo order or explicit dry-run; normalize status/results |
| Receipt Engine | Persist immutable-ish snapshot of inputs, checks, approval and execution result |
| Persistence | User/demo session, exposure snapshots, intents, mandates, analyses, approvals, receipts |

Flow: **Browser → server orchestration → data/reasoning → deterministic gate → human approval → Bitget execution → receipt.**

## 13. Recommended Technical Stack

Use the smallest stack that supports a polished web app and safe server-side integrations. Do not introduce smart contracts or distributed infrastructure for the hackathon.

| Area | Recommendation | Why |
|---|---|---|
| Framework | Next.js + TypeScript | One repo for UI and server routes; fast deployment |
| UI | Tailwind CSS + small component system | Fast, consistent judge-ready interface |
| Validation | Zod | Shared runtime schemas for API/AI responses |
| AI | One model via a thin provider adapter | Avoid provider lock-in and multi-agent complexity |
| Bitget | Official Agent SDK / documented REST as needed | Native sponsor integration |
| Persistence | SQLite/local JSON for spike; hosted Postgres only if needed | Avoid backend setup becoming the project |
| Testing | Vitest + focused integration tests | Fast deterministic verification |
| E2E | Playwright for golden path | Protect demo reliability |
| Deploy | Vercel or equivalent | Fast public deployment |

## 14. Suggested Repository Structure

```
app/
  (marketing)/page.tsx
  app/page.tsx
  app/exposure/[slug]/page.tsx
  app/events/page.tsx
  app/events/[eventId]/page.tsx
  app/protect/[slug]/page.tsx
  app/analysis/[id]/page.tsx
  app/approval/[id]/page.tsx
  app/receipts/[id]/page.tsx
  app/mandate/page.tsx
  app/activity/page.tsx
lib/domain/     exposure.ts, intent.ts, mandate.ts, decision.ts, receipt.ts
lib/bitget/     client.ts, reality.ts, execution.ts, demo.ts
lib/intelligence/ earnings.ts, market-state.ts, normalize.ts
lib/ai/         provider.ts, schemas.ts, analyze-event.ts
lib/policy/     validate-mandate.ts
lib/receipts/   build-receipt.ts, store.ts
app/api/        server-only orchestration endpoints
tests/          policy, domain, adapter, receipt, golden-path
```

## 15. Core Domain Model

| Entity | Key Fields |
|---|---|
| Exposure | id, underlying=NVIDIA, userRepresentation=rNVDA, provider, venue, quantity, notional, metadata |
| Representation | symbol, provider, chain/venue, instrumentType, rights metadata, market availability |
| Event | id, type=EARNINGS, underlying, occursAt, source, market/session context |
| Intent | id, type=PROTECT_EVENT_RISK, exposureId, eventId, createdAt, status |
| Mandate | maxProtectionPct, maxNotional, leverageAllowed, approvalRequired, allowedUnderlying |
| Analysis | riskLevel, proposedPct, proposedNotional, reasons[], alternatives[], model/version |
| GateResult | pass, checks[], failedRules[], evaluatedAt, policyVersion |
| Approval | approved, approvedAt, scope=single action |
| Execution | mode=DEMO\|DRY_RUN, request summary, external id if any, status, result |
| Receipt | stable id + snapshots of all above |

## 16. AI Contract

The AI must return a strict structured object. It should never return an executable order payload directly.

```
analysis output
riskLevel: LOW | MEDIUM | HIGH
recommendedAction: PROTECT | NO_ACTION
proposedProtectionPct: number | null
proposedNotional: number | null
reasons: short user-facing reasons[]
signalsUsed: normalized signal ids[]
alternatives: [{ action, pct, notional, reason }]
confidenceNote: short caveat
```

The server validates this schema before any policy evaluation.

Do not request or display hidden chain-of-thought. The UI shows concise reasons and signals, which are sufficient for auditability without pretending to expose internal model reasoning.

## 17. Deterministic Mandate Engine

The mandate engine is a pure function: proposal + mandate + exposure → gate result. It must not call the LLM or external APIs.

| Check | Example |
|---|---|
| Underlying allowed | proposal.underlying === NVIDIA |
| Protection percentage | 20% <= mandate.maxProtectionPct 25% |
| Notional | $102 <= mandate.maxNotional $125 |
| Leverage | proposal requires none; mandate disables leverage |
| Approval | approvalRequired=true; execution blocked until approval exists |
| Action scope | authorization applies to this proposal only |

**Invariant:** no execution adapter call is reachable unless the gate is PASS and required human approval is present.

## 18. Bitget Integration Boundary

Keep Bitget behind a small adapter so the product can switch cleanly between real Demo execution and dry-run without changing domain logic.

| Adapter Method | Purpose |
|---|---|
| `getAccountSnapshot()` | Read safe account/position state |
| `getRealityInstrument(symbol)` | Confirm rNVDA / instrument metadata |
| `getMarketState(underlying)` | Current session/market context |
| `getEarningsContext(underlying)` | Earnings/fundamental context |
| `previewProtection(proposal)` | Construct dry-run request without moving funds |
| `executeProtection(proposal, approval)` | Submit paper/Demo action if supported |
| `getExecutionStatus(id)` | Normalize lifecycle status |

The exact hedge instrument/order semantics must be chosen only after the owner-side execution spike proves what Bitget Demo supports. The architecture intentionally does not hardcode an unverified instrument path.

## 19. Exposure Graph Architecture

For the MVP, the graph can be a typed in-memory/server-side structure populated from Bitget/Bitget Wallet data plus minimal curated metadata. It does not need Neo4j or a graph database.

```
NVIDIA (UnderlyingExposure)
├── rNVDA (Representation: Reality / Bitget)
├── NVDAx (Representation: xStocks / onchain ecosystems)
└── Ondo NVIDIA representation (Representation: Ondo)
```

Each edge means "provides economic exposure to," not "is legally/economically identical to."

The model preserves provider, venue/chain, instrument type, rights/corporate-action metadata, market availability and execution mechanism when available.

## 20. Event Intelligence Pipeline

1. Fetch event/fundamental data for NVIDIA.
2. Fetch market/session state and selected market context.
3. Normalize to a compact EventContext object.
4. Store source timestamps and freshness.
5. Pass only normalized, relevant context to the AI.
6. If required data is unavailable/stale, surface that state and allow the agent to return NO ACTION rather than fabricate.

## 21. Receipt Architecture

A Decision Receipt is a snapshot, not a live recomputation. Once execution completes or is refused, the receipt stores the exact exposure/event/analysis/mandate/gate/approval/execution state used at that time.

This prevents a later market-data refresh or mandate edit from rewriting history. For the hackathon, database-level immutability is not required; application logic and append-only receipt records are enough.

## 22. Security & Safety

- Never put Bitget secret key or passphrase in browser bundles or localStorage.
- Use Demo credentials only for the hackathon build.
- Request Read + Trade only; never withdrawal.
- Server routes validate every input with Zod.
- Use CSRF/session protections appropriate to the chosen auth model.
- Do not log secrets, signed headers or raw credential objects.
- Persist only what the demo requires.
- Execution endpoint independently re-checks mandate and approval; never trust client PASS state.
- Add an environment-level execution kill switch.
- Default execution mode to dry-run until Demo execution is explicitly proven.

## 23. State Machine

```
DRAFT_INTENT
→ ANALYZING
→ PROPOSED | NO_ACTION
→ GATE_PASS | GATE_REFUSED
→ AWAITING_APPROVAL
→ APPROVED | CANCELLED
→ EXECUTING | PREVIEWING
→ COMPLETED | FAILED
→ RECEIPT_FINALIZED
```

Transitions are server-controlled. A client cannot jump directly from proposal to execution.

## 24. Failure States

| Failure | Expected UX |
|---|---|
| Bitget unavailable | Show integration unavailable; do not invent balance/order state |
| No rNVDA position | Offer demo/sample exposure only if explicitly labelled |
| Earnings data unavailable | Show unavailable/stale and block confident event action |
| AI timeout/invalid schema | Retry once or show analysis unavailable; no execution |
| Mandate REFUSE | Explain failed rule; no approve/execute CTA |
| Demo order unsupported | Use explicit dry-run path if available |
| Execution fails | Receipt records FAILED with external error summary |
| User cancels | Receipt/activity can record cancelled proposal without execution |

---

# PART III — BUILD PLAN

## 25. Build Strategy

**Build the proof from the risky integration inward, then wrap it in the product experience.**

The biggest mistake would be spending a day polishing the dashboard before proving the exact Bitget path. The build therefore starts with an integration spike, then locks domain logic, then implements the golden path, and only then adds visual polish and supporting screens.

## 26. Phase 0 — Owner-Side Feasibility Spike

Goal: resolve the only material execution uncertainty before normal implementation.

1. Create Bitget Demo API credentials locally. Do not paste them into chat or commit them.
2. Initialize a tiny Node/TypeScript spike using the official Bitget agent/UTA integration path.
3. Authenticate to Demo and prove read access.
4. Confirm rNVDA/Reality instrument discovery.
5. Attempt the smallest safe Demo Reality order or supported equivalent.
6. If unsupported, verify the genuine dry-run/preview path and lock DRY_RUN as MVP execution mode.
7. Verify NVIDIA earnings/event data retrieval.
8. Verify NVIDIA representation discovery through the available RWA data surface.

**Exit gate:** write a one-page spike result: DATA PASS/FAIL, DEMO EXECUTION PASS/FAIL, DRY-RUN PASS/FAIL, exact endpoints/SDK operations used, and any permission/whitelist constraints.

## 27. Phase 1 — Foundation

Goal: create a clean app shell and domain contracts without building full screens.

- Initialize Next.js + TypeScript + Tailwind.
- Create env validation and server-only Bitget client.
- Create domain types/schemas for Exposure, Event, Intent, Mandate, Analysis, GateResult, Approval, Execution, Receipt.
- Implement deterministic mandate validator with tests.
- Implement execution adapter interface with dry-run and Demo implementations.
- Create mock fixtures matching real response shapes for offline UI development.
- Add execution kill switch.

**Exit gate:** typecheck/lint/tests pass; policy engine has focused PASS and REFUSE tests; secrets cannot be imported into client code.

## 28. Phase 2 — Data & Exposure

Goal: make the app understand NVIDIA exposure before adding AI.

- Fetch/read rNVDA account exposure or use a clearly labelled demo fixture if account state is unavailable.
- Normalize rNVDA → NVIDIA underlying exposure.
- Implement small Exposure Graph structure.
- Fetch external NVIDIA representations for informational display.
- Fetch earnings + market/session context.
- Add freshness/source metadata.
- Build Capital Dashboard and NVIDIA Exposure View using real normalized objects.

**Exit gate:** dashboard renders NVIDIA from the domain model; no hardcoded UI-only ticker mapping; event context can be inspected as JSON in dev mode.

## 29. Phase 3 — Intent, AI & Mandate

Goal: complete the product's reasoning/authority split.

- Implement PROTECT_EVENT_RISK intent creation.
- Build mandate setup UI.
- Implement structured AI analysis endpoint with strict schema validation.
- Feed only normalized event/exposure/mandate context to the model.
- Render structured reasons, signals and alternatives.
- Run proposal through deterministic Mandate Gate.
- Implement REFUSE state before implementing execution.

**Exit gate:** a deliberately oversized proposal is refused even if the AI recommends it; a valid proposal reaches AWAITING_APPROVAL.

## 30. Phase 4 — Approval, Execution & Receipt

- Build final approval screen with exact notional, mode and one-action scope.
- Server creates approval record.
- Execution endpoint re-fetches/re-validates required state and mandate.
- Call Demo adapter if proven; otherwise dry-run adapter.
- Normalize result.
- Finalize Decision Receipt snapshot.
- Build receipt screen and activity timeline.

**Exit gate:** one golden path runs end-to-end from intent to receipt with no manual database edits.

## 31. Phase 5 — Judge UX & Polish

- Add progressive Exposure → Intent → Event → Decision → Mandate → Action indicator.
- Animate Mandate Gate checks lightly; no gimmicky loading delays.
- Polish Exposure Graph and "You are here" state.
- Make Demo/Dry Run labels impossible to miss.
- Create strong empty/loading/error/refusal states.
- Add landing page only after the app loop is stable.
- Optimize desktop 1440/1280 judge view; verify mobile.
- Prepare seeded demo state if live data becomes unreliable, with explicit labels.

## 32. Phase 6 — Verification & Submission

- Run unit tests for mandate engine, domain normalization and receipt construction.
- Run integration test against non-destructive Bitget read/dry-run path.
- Run Playwright golden-path test.
- Run typecheck, lint and production build.
- Deploy production URL.
- Perform browser console/network check.
- Record 90-second demo.
- Write README: problem → architecture → Bitget integration → safety → demo → future thesis.
- Prepare submission copy and required X post.
- Capture fallback screenshots/video in case live services fail during judging.

## 33. Priority Matrix

| Priority | Build |
|---|---|
| P0 — Must ship | Bitget data path; NVIDIA exposure; earnings context; one intent; mandate; structured AI proposal; PASS/REFUSE; approval; Demo/dry-run; receipt |
| P1 — Strong demo | Exposure Graph UI; activity; persistent mandate view; landing page; polished transitions |
| P2 — Only if ahead | Shareable receipt export; extra event preview; richer charts |
| DO NOT BUILD | Cross-chain execution; marketplace; lending/yield; smart contracts; multi-agent swarm; custom bridge; many assets |

## 34. Suggested Three-Day Schedule

| Window | Focus | Output |
|---|---|---|
| Sep 18 — first block | Feasibility spike | Execution mode locked; endpoints/SDK path proven |
| Sep 18 — second block | Foundation + policy | Repo, schemas, mandate tests, adapters |
| Sep 19 — first block | Data + exposure + event | Capital/Exposure/Event screens on real normalized data |
| Sep 19 — second block | AI + intent + gate | Proposal and REFUSE/PASS flow |
| Sep 20 — first block | Approval + execution + receipt | End-to-end golden path |
| Sep 20 — second block | Polish + deploy + verify | Judge-ready app |
| Sep 20 night | Demo + README + submission | Submission package complete |
| Sep 21 | Safety buffer only | Emergency fixes / final submission if needed |

## 35. Testing Plan

**Unit**
- Exposure normalization.
- Mandate PASS/REFUSE boundaries.
- Notional/percentage calculations.
- AI response schema validation.
- Receipt snapshot construction.
- State-machine transition guards.

**Integration**
- Bitget authenticated read path.
- Reality/rNVDA discovery.
- Event/fundamental data retrieval.
- Dry-run and/or Demo execution adapter.
- Failure normalization.

**E2E**
One Playwright golden path: open app → NVIDIA exposure → earnings event → create mandate → analysis → gate PASS → approve → execute/preview → receipt. Add one refusal path where proposed protection exceeds the mandate.

## 36. Demo Data Strategy

Prefer live public/Bitget data for market/event context and real Demo account state where reliable. For any fixture used, the UI must explicitly label it as sample/demo data. The build should support a deterministic seeded scenario so the judge demo does not depend on NVIDIA actually reporting earnings during the recording.

Important: a seeded event scenario can be a product demo fixture, but it must not be presented as a current live event if it is not current. Real integration and simulated scenario are separate dimensions.

## 37. Acceptance Criteria — MVP

| ID | Acceptance Criterion |
|---|---|
| AC-01 | User can reach NVIDIA exposure from Capital dashboard. |
| AC-02 | rNVDA is represented as NVIDIA exposure with provider/venue metadata. |
| AC-03 | At least one external NVIDIA representation is shown when data is available. |
| AC-04 | User can create an earnings-protection mandate. |
| AC-05 | AI analysis conforms to strict schema and can return NO ACTION. |
| AC-06 | Mandate engine independently PASSes/REFUSEs proposals. |
| AC-07 | REFUSE state cannot execute. |
| AC-08 | PASS requires explicit approval. |
| AC-09 | Execution mode is visibly Demo or Dry Run. |
| AC-10 | Receipt captures the exact decision chain and rejected alternative(s). |
| AC-11 | Core flow works on deployed URL without dev tools. |
| AC-12 | Production build and golden-path tests pass. |

## 38. Demo Script

1. "I hold NVIDIA exposure through rNVDA on Bitget." Open Capital dashboard.
2. Open NVIDIA and briefly reveal the Exposure Graph: the agent understands the economic exposure, not only the token symbol.
3. Open the earnings event: "The agent knows an event is approaching and what part of my capital it affects."
4. Enter intent: "Protect this through earnings. Max 25%, max $125."
5. Show AI assessment and proposed bounded protection.
6. Show an alternative rejected for exceeding the mandate.
7. Run Mandate Gate. Explain: "AI reasons; code decides what it is allowed to do."
8. Approve one action.
9. Show Bitget Demo execution or explicit dry-run.
10. Open Decision Receipt: "This proves why it acted, what I permitted, what it rejected and what actually happened."
11. Close: "Today this protects NVIDIA through earnings. The same intent layer can eventually help capital hedge, borrow, earn or rebalance across tokenized financial ecosystems."

## 39. Post-Hackathon Expansion

Do not build these now; they explain the roadmap.

| Layer | Next Expansion |
|---|---|
| Events | FOMC, CPI, dividends, splits, material news, closures/divergence |
| Intents | GENERATE_YIELD, RAISE_LIQUIDITY_WITHOUT_SELLING, REDUCE_DRAWDOWN, REBALANCE |
| Exposure Graph | More issuers, chains, rights, corporate-action semantics |
| Opportunity Graph | Hedge, lend, borrow, vault, LP, move, unwind destinations |
| Mandates | Time windows, protocol allowlists, risk budgets, automation tiers |
| Execution | More rails after eligibility and safety validation |
| Receipts | Portable/verifiable decision history |
| Platform | Intent/Exposure APIs and later a modules marketplace |

## 40. Final Build Rule

**If a feature does not improve the 90-second judge demo or prove the larger Tenax thesis, it does not ship this weekend.**

The product should feel small, complete and intentional. The hackathon win condition is not feature count. It is showing a credible new abstraction — economic exposure + human intent + bounded AI authority — through one polished, technically honest loop.
