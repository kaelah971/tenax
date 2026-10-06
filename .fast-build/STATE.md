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

## Preflight 2026-10-06 (no write, GENUINE_AI_NO_ACTION)
- Owner fixed `.env.local` (single TENAX_ANALYSIS_MODE=ai; DATABASE_URL rejoined, len 128) and flattened the Demo position.
- Verified: env single-ai + groq/openai/gpt-oss-120b + BITGET_DEMO/demo + creds present + no live-money path; Postgres DURABLE on both ledgers (runs 0, proofs 1) after one Neon cold-start retry; Demo discovery overall PASS with currentPosition NONE, pending NVDAUSDT orders 0, hedge_mode/crossed/1x, mark 239.7.
- Fresh genuine AI inference (new pack hash, overall PASS) decided WAIT: unverified earnings date, simulated exposure only, no live ownership. No override attempted; no authority run (nothing actionable); no order preview constructed; no ledger writes. Focused tests 25/25 pass. No code changes, no commit.
