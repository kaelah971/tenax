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
- [ ] Slice 2: Judge Paper-Trading Log UI + Export.

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
- Judge paper-trading log UI and export remain the next evidence slice.
- Sharpe, drawdown, win-rate, and risk-control effectiveness metrics require genuinely observed outcome series.
- Owner-controlled real OAuth/snapshot QA remains separately gated: durable Postgres, approved Bitget OAuth access, installed local connector, and explicit owner authorization are required.
- Public release hosting/signing/configuration remains owner-side; experimental connector infrastructure is not public onboarding.

## Current slice
- Agentic Trading Evidence Slice 1 complete: canonical paper/Demo run model, additive Postgres schema/repository, cycle wiring, idempotent reconciliation, and read-only summaries. No provider writes or invented outcomes.
- Next work is the judge-visible paper-trading log UI + export slice.

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

## Blockers
- Connected Mode requires `DATABASE_URL` for durable state; no process-global fallback is allowed for personal account data.
- Real OAuth/provider/snapshot QA is intentionally owner-gated and was not run: owner approval, approved Bitget OAuth access, durable Postgres, and local connector access remain required.
- Public installer hosting and code signing remain release work; unsigned local SEA artifacts are acceptable for owner QA only.

## Verification
- Paper ledger focused tests: 5 passed; relevant service/proof tests: 56 passed; full Vitest: 821 passed across 47 files.
- `npx tsc --noEmit`, `npm run lint`, Next production build, and `git diff --check` passed.
- Ledger tests use fake flows, activity/proof records, injected Postgres clients, and fake public data; no provider writes, OAuth, or live Bitget calls were made.

## Next action
- Judge Paper-Trading Log UI + Export; do not start that slice in this invocation.
