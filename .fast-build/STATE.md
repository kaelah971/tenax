# Fast Build State

## Product
- Name: Tenax
- Outcome: Demonstrate an agentic NVIDIA protection decision with deterministic authority, permitted Bitget Demo execution, and durable evidence.
- Primary demo path: NVIDIA exposure/event → LLM proposal → Standing Mandate → EXECUTE / ESCALATE / REFUSE → Bitget Demo or DRY_RUN → proof.

## MVP slices
- [x] Slice 1: Durable tenant/session boundary, connected data model, and Connected Mode shell.
- [x] Slice 2: One-time pairing protocol with expiry, replay protection, and connection states.
- [x] Slice 3: Local official Bitget Agentic connector with credential-free sanitized snapshot preparation.
- [x] Slice 4: Authenticated snapshot sync, read-only personal account UI, stale/error states, and isolation proof.
- [x] Slice 5: Disconnect, sync-token revocation, isolation hardening, and owner QA readiness; no connected execution.

## Local Connector UX milestone
- [x] Slice 1: Loopback local bridge and secret-free custom protocol launch contract.
- [x] Slice 2: Browser one-click connect UX.
- [x] Slice 3: Install, registration, and manual fallback UX.
- [x] Slice 4: Packaging and owner QA readiness.

## Agentic Trading Evidence milestone
- [x] Slice 1: Canonical Paper-Trading Run Ledger.
- [x] Slice 2: Judge Paper-Trading Log UI + Export.
- [x] Slice 3: Observed Outcome + Quantitative Metrics.
- [x] Slice 4a: Submission Evidence QA (implement-only, never executed live).
- [ ] Slice 4b: Live Paper-Run Capture (owner-authorized, pending).

## Existing capabilities
- Demo Mode and shared Bitget Demo adapters: working; must remain separate from Connected Mode.
- Public market-data adapters and server-side Demo execution guards: working; not reused for connected accounts.
- Durable Postgres proof ledger: working; Connected Mode gets separate ownership tables.
- Canonical paper/Demo run ledger: working, additive Postgres repository plus idempotent reconciliation/read-only summaries.
- Auth/session layer for personal accounts: working for Connected Mode.
- Local connector bridge: working on `127.0.0.1:43127`; fixed `POST /v1/handoff` and safe `GET /v1/status` contract.
- Windows connector packaging: working via a release-time Node SEA build; no binary is committed or required in development.
- Packaged runtime preflight: working outside the repo cwd; validates embedded Tenax origin, loopback bridge, SDK catalog, read-only operation boundary, metadata path, and safe fake handoff.

## Remaining MVP gaps
- Submission evidence QA and owner-controlled live paper-run capture remain.
- Further outcome observations require genuinely trusted Demo provider/market data and safe attribution.
- Owner-controlled real OAuth/snapshot QA remains separately gated: durable Postgres, approved Bitget OAuth access, installed local connector, and explicit owner authorization are required.
- Public release hosting/signing/configuration remains owner-side; experimental connector infrastructure is not public onboarding.

## Current slice
- Agentic Trading Evidence Slice 4a complete: durable QA, fake end-to-end evidence path, Execute/Escalate/Refuse QA, Demo+AI readiness probes (read-only), submission summary API, capture manifest, and 4 new offline tests. No provider writes were made.
- Next work is Slice 4b owner-controlled live paper-run capture.

## READY_FOR_OWNER_AUTHORIZATION
- Exact proposed Demo action (NOT executed): one POST /api/v3/trade/place-order on Bitget Demo (paptrading:1) — category=USDT-FUTURES, symbol=NVDAUSDT, side=sell, posSide=short, orderType=market, qty=floor($100/markPrice, precision 2) (~0.41 at 239.7), clientOid=tenax-<flowId>-<proposalHash>, no marginMode/leverage (account 1x crossed untouched), then read-only GET order-info verify; FILLED only on explicit filled status.
- Required owner decisions first: (1) collapse .env.local to a single TENAX_ANALYSIS_MODE line (ai or fixture); (2) flatten/reduce the pre-existing Demo NVDAUSDT short 0.43 @1x manually for a clean EXECUTE capture (else the cumulative gate will ESCALATE/REFUSE by design); (3) choose agent-cycle vs manual approval path. See docs/agentic-trading-capture-manifest.md.

## Completed
- Added 10-minute high-entropy display codes; only SHA-256 hashes persist.
- Added durable pairing records with PENDING/CONSUMED/EXPIRED/REVOKED state and owner/session foreign keys.
- Added authenticated browser create/status APIs and connector-facing consume API with generic invalid/expired responses.
- Added row-lock transaction consume path: one concurrent consume succeeds; replay fails.
- Wired `/app/connected` to honest CONNECT BITGET / pairing-code / READ ONLY states.
- Added `src/lib/connected/connector.ts` and `snapshot.ts`: POST-only pairing consumption, local official SDK OAuth, credential-file identity match, fixed private GET allowlist, SDK `readOnly`, strict fail-closed sanitization, and safe summary metadata.
- Added `scripts/bitget-agentic-connector.ts` and offline fake-boundary tests. No provider credentials, hosted OAuth, trading, or connected execution path was added.
- Added one-time-returned 256-bit connection sync token; Postgres stores only `sync_token_hash`, and local metadata stores the raw token outside the repo with 0600 permissions.
- Added `POST /api/connected/snapshot`: bearer sync-token auth, strict DTO validation, token-bound connection ownership, latest-snapshot upsert, provider identity binding, and CONNECTED status update.
- Extended the CLI to upload sanitized snapshots and retry the last upload without repeating OAuth. `/app/connected` now renders personal assets/positions with honest empty, awaiting, stale, disconnected, and error states.
- Added authenticated `POST /api/connected/disconnect`, atomic connection status/token-hash revocation, pending-pairing revocation, disconnected snapshot hiding, fresh reconnect behavior, and a `DISCONNECT BITGET` UI action.
- Added local `--disconnect` cleanup that removes only Tenax connector metadata; Bitget OAuth credentials remain untouched and remote revocation is not claimed. Added PowerShell owner QA commands to README.
- Added root landing navigation entries and a secondary `USE YOUR OWN ACCOUNT` / `CONNECTED · READ ONLY` hero CTA linking to `/app/connected`; existing Demo and judge CTAs remain unchanged.
- Added `src/lib/connected/local-bridge.ts`: fixed loopback-only bridge on `127.0.0.1:43127`, strict JSON `POST /v1/handoff`, safe `GET /v1/status`, exact configured Origin matching, no query secrets, busy protection, and safe state/error responses. It invokes existing `runLocalConnector` orchestration with injectable boundaries.
- Added `scripts/tenax-connector-bridge.ts`, `src/lib/connected/launch-contract.ts`, and `scripts/generate-tenax-protocol-registration.ts`. `tenax://open` carries no pairing data; Windows registration is a generated per-user HKCU fixture and never mutates the OS during tests.
- Added connector progress callbacks for HANDOFF_ACCEPTED, OAUTH_PENDING, and SYNCING; existing CLI/manual entry remains unchanged.
- Added `src/lib/connected/browser-handoff.ts`: browser-safe handoff orchestration with pairing creation, loopback status detection, secret-free protocol launch, body-only pairing POST, bounded polling, safe state mapping, expiry, abort cleanup, and terminal outcomes.
- Added browser-safe `local-bridge-contract.ts` and `protocol-contract.ts` modules so the Client Component never bundles Node/provider connector code. Added standards-compatible Private Network Access preflight support to the loopback bridge.
- Refined `/app/connected` pairing UI: one-click CONNECT BITGET is primary, pairing code is hidden by default, explicit manual fallback exposes code/expiry/CLI only on request, retry generates a fresh pairing, missing-connector and authorization/sync states are honest, and success refreshes server account data.
- Added `src/lib/connected/windows-install-contract.ts`, `scripts/build-tenax-connector.ts`, and `scripts/tenax-connector-setup.ts`: release-time esbuild + Node SEA packaging, compressed connector asset embedding, current-user setup, HKCU registration, idempotent reinstall, safe uninstall, and explicit-only metadata/Bitget credential cleanup.
- Added `GET /api/connected/installer` and wired missing-connector UI to a configured HTTPS setup artifact only. Development returns `INSTALLER_UNAVAILABLE`; no download URL is fabricated. `release/` artifacts are ignored.
- Updated the connector bridge for SEA argument handling and EADDRINUSE `ALREADY_RUNNING` behavior; no duplicate loopback listener is created.
- Added focused installer/packaging tests for per-user registration, install location, secret-free command/protocol, idempotence, uninstall contract, artifact gating, single-instance behavior, and no provider writes.
- Added `inspectConnectorRuntime()` and packaged `--preflight` / `--preflight-handoff` modes. Preflight prints only version, configured origin, loopback endpoint/status, local metadata path, SDK availability, read-only availability, and fake handoff acceptance; it never starts OAuth or provider reads.
- Embedded the exact build-time origin into connector SEA bundles. Local QA accepts `http://localhost:3000`; production builds require their explicit public HTTPS origin and do not silently trust localhost.
- Documented PowerShell-friendly local build, install, HKCU verification, protocol launch, bridge status, preflight, and uninstall commands in `README.md`.
- Fixed the packaged setup executable's zero-argument Node SEA argv shape: when SEA exposes the executable path as `argv[1]`, it is now discarded instead of parsed as an invalid user argument. Zero args installs; uninstall and invalid-argument semantics remain unchanged.
- Added the canonical paper/Demo run ledger: validated run model with field-level provenance, additive Postgres DDL/repository, best-effort agent-cycle writes, idempotent activity/proof reconciliation, and chronological/filterable/aggregate data access. Unknown outcomes remain null.
- Added `/app/paper-trading`, `/app/paper-trading/[runId]`, factual environment/authority/execution filters, truthful durable/ephemeral labels, CSV/JSON exports, and `PAPER TRADING` app navigation. Exports use canonical ledger rows only and leave unknown financial fields blank.
- Added monotonic trusted outcome observations (OPEN_MARK/REALIZED/UNAVAILABLE), short-entry PnL math, safe exit attribution requirements, realized-only risk/performance metrics, non-annualized Sharpe status, percentage drawdown, methodology display, and additive outcome exports.
- Added read-only submission summary composer (src/lib/tenax/paper-trading-submission-summary.ts) + GET /api/paper-trading/summary + SUMMARY JSON link on /app/paper-trading; all compose existing ledger/metrics/export modules with zero fabricated values.
- Added docs/agentic-trading-capture-manifest.md (pre-flight, owner decisions, exact proposed Demo action, post-capture evidence checklist, judge truth rules).
- Added tests/paper-trading-submission-summary.test.ts (4 offline: fake EXECUTE end-to-end incl. query/exports/summary/secret-scan/zero-writes; ESCALATE NO_ORDER zero-write; REFUSE NO_ORDER zero-write; empty-ledger honesty).

## Blockers
- Slice 4b capture needs 3 owner decisions: (1) `.env.local` has DUPLICATE `TENAX_ANALYSIS_MODE` lines (`ai` then `fixture`; effective `fixture`) — collapse to one line; (2) pre-existing Demo NVDAUSDT short 0.43 @1x (~$103) breaks a clean EXECUTE capture (existing+proposed ~40.6% > 30% max → cumulative ESCALATE/REFUSE by design; owner must flatten manually, agent never closes); (3) live groq model decides WAIT on canonical fixture evidence, so a genuine AI EXECUTE needs owner-accepted intent/evidence or the explicit fixture path. `DATABASE_URL` is also split across two lines (stray lowercase `sslmode` line) — works today (config valid, DURABLE proven) but should be rejoined.
- Connected Mode requires `DATABASE_URL` for durable state; no process-global fallback is allowed for personal account data.
- Real OAuth/provider/snapshot QA is intentionally owner-gated and was not run: owner approval, approved Bitget OAuth access, durable Postgres, and local connector access remain required.
- Public installer hosting and code signing remain release work; unsigned local SEA artifacts are acceptable for owner QA only.

## Verification
- Slice 4a: 4 new submission-QA tests pass; related evidence suites (agent-cycle, authority-routing, demo-hedge-executor, paper-trading run/ui/outcomes, judge-proof): 113 pass; full Vitest: 832 passed across 50 files (one earlier run flaked 6 tests with 1 error, clean on rerun).
- `npx tsc --noEmit`, `npm run lint`, Next production build (incl. /api/paper-trading/summary), and `git diff --check` passed.
- Durable Postgres proven live read-only: run ledger DURABLE (0 runs), proof ledger DURABLE (1 proof); Demo discovery overall PASS (exit 0, read-only); AI verify overall PASS with live WAIT decision (groq openai/gpt-oss-120b, one inference, no approve/execute).
- New tests use deterministic fixtures and injected fetch boundaries; no provider writes, OAuth, or live Bitget writes were made.

## Next action
- Slice 4b Live Paper-Run Capture ONLY after explicit owner authorization addressing the three decisions in READY_FOR_OWNER_AUTHORIZATION above; do not submit any Demo order in this invocation.

## Hosted judge demo (RUNNABLE_JUDGE_DEMO_READY)
- /app/demo + POST /api/demo/run (POST-only) run the real domain path on controlled 40%/$200 fixture input: exposure fixture → intent → demo-seated analysis (new minimal ProtectionFlow.adoptDemoAnalysis, fixture-kind-guarded) → real mandate REFUSE → recordDeterministicRefusal seam (activity + POLICY_REFUSED proof + NO_ORDER run). Zero network/creds/AI/MCP; execution unreachable by construction. Reruns mint fresh demo-<ms> flow identities (behavior A).
- Landing SEE DEMO added beside hero CTA (OPEN APP preserved); docs/JUDGE_QUICKSTART.md (hosted-first + local + env table + Demo connection + capability table) + README pointer added.
- Manually exercised live on dev server: demo run paper-run:v1:demo-1791394814469 persisted DURABLE (first canonical demo run, honestly labeled), run/proof/demo pages 200, export + summary reflect 1 refusal / prevention 1 / Sharpe INSUFFICIENT DATA.
- 7 new judge-demo tests; full suite 918 pass (59 files); tsc/lint/build/diff-check clean. No commit.

## Typography pass (TYPOGRAPHY_READY_JUDGE_JOURNEY_EVENT_SOURCE_BLOCKED)
- Previous system: Rajdhani/Georama loaded but headings actually rendered in fallback sans (font-display utility unused); labels already system-mono. Final: Barlow Condensed 600/700 for display + IBM Plex Mono 400/500/600 as the primary UI voice, both via next/font/google (latin), centralized through --font-display/--font-syslabel tokens; no scattered font-family, no binaries, no stroke effects.
- Headings (h1s, NVIDIA EARNINGS, verdicts, ACTION CLEARED, gate word) on font-display at loaded 700 with eased tracking; financial/decision numerals ($500, prices, %, mandate rows, summaries) on font-syslabel (inherently tabular + global tabular-nums); 0.08em label tracking preserved; Georama/Inter body kept for long-form readability.
- Responsive: short numeric strings only, existing wrap/truncate/flex primitives untouched; no new layout. Connected Mode inherits tokens via its existing display class (coherent, no structural change).
- 7 new typography tests; full suite 893 pass (57 files); tsc/lint/build/diff-check clean. Fonts verified in build output. No commit.

## Deployment hardening (DEPLOYMENT_READY_EVENT_SOURCE_BLOCKED)
- No hard blockers: app boots with zero env (all integrations degrade to labeled safe states); zero NEXT_PUBLIC vars; client bundles import no secret-bearing modules (one pure format helper + type-only imports; window-guard pattern is defense-in-depth); all client fetches are same-origin relative; all judge pages force-dynamic (no build-time DB/MCP); snapshot cache 60s TTL; default Node runtime (pg-safe).
- Added .env.example (classified contract, bare KEY= lines, no values — NOTE: .gitignore covers .env* so it needs `git add -f` at checkpoint) and GET /api/health (instant config booleans, provider/mode names only, zero secrets, zero external calls).
- Proven live on a real production server (:3210): health true-config, summary DURABLE/POSTGRES honest-zeros, Event Room 200 with integrity copy, landing + paper-trading 200 with honest empty state. Server stopped after. MCP 503 does not block boot/build/render.
- Fresh-deploy judge path needs DATABASE_URL for durable history (else labeled EPHEMERAL) — documented, no fake seeding.
- 6 new deployment tests; full suite 886 pass (56 files); tsc/lint/build/diff-check clean. No commit.

## Judge-journey clarity B7 (JUDGE_JOURNEY_READY_EVENT_SOURCE_BLOCKED)
- Core message now judge-facing: AUTHORITY_SEPARATION_LINE ("AI can propose. It cannot authorize itself — deterministic rules decide.") rendered at the analysis FINAL TENAX DECISION boundary.
- Fixed AI/fixture labeling from seated truth: receipts derive AI ANALYSIS/AI MODEL from the flow aiAudit (was hardcoded DEV); protect strip follows server analysis mode; proof detail derives AI labeling from the linked run and maps DETERMINISTIC_MANDATE/HUMAN_APPROVAL to human words (was raw enum).
- Journey continuity: receipt → proof + canonical run links (hide-on-absence), run → proof link, proof → run link. Refusal language audited (no failure-confusion; UNKNOWN fail-closed copy is correct usage).
- No receipt state-machine change: executed-only receipts stand; refusal story terminates at proof + run detail (both durable). Responsive: existing classes only, no new layout primitives, no client state.
- 12 new journey tests; full suite 880 pass (55 files); tsc/lint/build/diff-check clean. No commit.

## Judge-path hardening (JUDGE_PATH_READY_EVENT_SOURCE_BLOCKED)
- Event source now has a typed judge-facing state: LIVE_VERIFIED_EVENT / SOURCE_UNAVAILABLE / NO_ELIGIBLE_EVENT via probeNvidiaEventSource (fetchTrustedNvidiaEvent kept as the null-wrapper; route callers untouched). Dead source can never become fixture content, a date, or a proposal seed (tested).
- Event Room gained a VERIFIED EVENT CALENDAR · BITGET MCP panel (bounded 12s server probe): verified date+source+retrievedAt when live, else explicit integrity copy ("Live event source unavailable … No AI decision generated … SOURCE INTEGRITY HELD — NOT AN APPLICATION FAILURE") plus NO VERIFIED EVENT provenance. No hardcoded dates; existing cassette untouched.
- Fixture/live audit: analysis page already separates AI ANALYSIS vs DEVELOPMENT ANALYSIS; run/proof surfaces already render NO ORDER SENT as authority outcomes. No silent fallback paths exist (probe failures yield typed states, never fixture mode).
- Live re-check this slice: still SOURCE_UNAVAILABLE — no AI call, no writes. Recovery needs no code changes: route already consumes fetchTrustedNvidiaEvent; a future VERIFIED event flows into a materially new pack automatically.
- 7 new judge-path tests; full suite 868 pass (54 files); tsc/lint/build/diff-check clean. No commit.

## MCP event-source wiring 2026-10-07 (BLOCKED_EVENT_SOURCE)
- Live-inspected https://agent.bitget.com/mcp (bitget-mcp-server 4.0.5): initialize → session id → tools/list shows exactly 2 tools (guide catalog browser, do_query executor). Resolved the earnings-calendar entry live from the catalog (equity_calendar). Added dependency-free server-only transport (src/lib/intelligence/bitget-mcp.ts) + wired fetchTrustedNvidiaEvent to guide→do_query with conservative single-upcoming-date extraction (key provenance, upcoming-only, ambiguous/past-only → null).
- Live result: agent-data-platform upstream returns 503 for EVERY data query (equity_calendar x2, equity_price_quote, crypto_spot_ticker) — gateway/catalog healthy, all data down. Boundary honestly returns null; no AI call made (no material change exists); no writes.
- 8 new MCP/event tests (+1 contract-test live-call removal); full suite 861 pass (53 files); tsc/lint/build/diff-check clean. No commit.
- Retry of the calendar is allowed on a later materially-different source state (upstream recovery); same-evidence AI reruns remain prohibited.

## Terminal-evidence fix (no live calls, no writes)
- Fixed analyze-route provenance: AI analyses now report analysis:AI_MODEL (fixture stays DEVELOPMENT_FIXTURE); receipt evidence string derives the same way. No hash changes (provenance is display truth, not pack input).
- New DETERMINISTIC_POLICY_REFUSED activity → POLICY_REFUSED proof (authority DETERMINISTIC_MANDATE, NO ORDER SENT, explicit reason codes) → canonical run (REFUSE/NO_ORDER, AI attribution preserved). Wired into the analyze route on REFUSE verdicts and the agent-cycle POLICY_REFUSED/NO_STANDING_MANDATE branches; WAIT stays a non-refusal; per-flow idempotent. ESCALATE/REVIEW paths already emitted and now regression-locked.
- No backfill of flow-0001 (server-local only, unprovable from durable sources) — fix is forward-looking.
- 10 new terminal-evidence tests (+1 judge-proof pin update); full suite 853 pass (52 files); tsc/lint/build/diff-check clean. No commit.
- Standing rule: same-evidence retry for a favorable decision is prohibited; the genuine 40%/$200 REFUSE stands; next capture needs materially new trusted event/evidence.

## Authorized capture attempt 2026-10-07 (no write, BLOCKED)
- Owner authorized ONE Demo order for the then-current 30%/$150 PROTECT proposal with fresh-gate re-verification.
- Live server (PID 7004, :3000) confirmed current: Postgres DURABLE, 0 runs baseline.
- Fresh genuine Groq analysis (flow-0001, new pack hash) decided PROTECT 40% → $200 — over mandate (30%/$150) → deterministic verdict MANDATE_REFUSED (failedRules max_protection_pct, max_trade_value). No clamping, no override, no second attempt.
- Post-check read-only probe: position NONE, trade-read PASS — zero orders placed, ledger untouched (0 runs).
- Incidental observation (not fixed, out of scope): analyze-route provenance still labels AI analyses analysis:DEVELOPMENT_FIXTURE in the JSON payload (page shows the AI pill separately). No code changes, no commit.

## Evidence-contract fix 2026-10-06 (no write, READY_FOR_OWNER_AUTHORIZATION)
- Pack now carries exposureMode SIMULATED_PAPER + ownedAssetClaim NONE, read-only demoAccount group (DEMO provenance), liveMarket.observedAt freshness, and nvidiaEvent (null = no trusted source; new boundary module documents why). Prompt rubric distinguishes paper scenario / external evidence / execution context; model stays free (PROTECT/WAIT/NO_ACTION), no authority/order fields, no ceilings.
- Fresh genuine AI (groq/openai/gpt-oss-120b, new pack hash): PROTECT 30% → $150, mandate PASS (boundary), demoAccount position NONE confirmed live, nvidiaEvent UNAVAILABLE. Preflight on live data: flat re-verified, mandate PASS, standing AUTHORIZED, cumulative within (30% = max), all 16 gates PASS, preview sell/short market 0.62 @ 239.74 (~$148.64). Stopped before POST. No order placed.
- 11 new contract tests; full suite 843 pass; tsc/lint/build/diff-check clean. No commit.

## Preflight 2026-10-06 (no write, GENUINE_AI_NO_ACTION)
- Owner fixed `.env.local` (single TENAX_ANALYSIS_MODE=ai; DATABASE_URL rejoined, len 128) and flattened the Demo position.
- Verified: env single-ai + groq/openai/gpt-oss-120b + BITGET_DEMO/demo + creds present + no live-money path; Postgres DURABLE on both ledgers (runs 0, proofs 1) after one Neon cold-start retry; Demo discovery overall PASS with currentPosition NONE, pending NVDAUSDT orders 0, hedge_mode/crossed/1x, mark 239.7.
- Fresh genuine AI inference (new pack hash, overall PASS) decided WAIT: unverified earnings date, simulated exposure only, no live ownership. No override attempted; no authority run (nothing actionable); no order preview constructed; no ledger writes. Focused tests 25/25 pass. No code changes, no commit.

## Unified dark authority visual system (VISUAL_SYSTEM_READY_EVENT_SOURCE_BLOCKED)
- Landing rebuilt to the approved dark-fintech reference (src/app/page.tsx + src/app/_landing/); app converted centrally via token remap + polarity scopes (globals.css, observatory.css), shell/nav restyled, AI/authority/evidence role tints on Analysis.
- No logic, route, API, mandate, provider, DB, or execution changes. DESIGN.md palette now superseded (docs follow-up).
- 893 tests; lint/tsc/build/diff-check clean; CDP layout/interaction checks clean on isolated DRY_RUN fixture server.
