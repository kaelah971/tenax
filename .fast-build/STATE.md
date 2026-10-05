# Fast Build State

## Product
- Name: Tenax
- Outcome: Let a visitor inspect their own Bitget account in a session-scoped, read-only Connected Mode without moving credentials to Tenax.
- Primary demo path: Demo Mode remains instant; Connected Mode provisions a durable session, pairs a local connector later, then shows sanitized personal account state.

## MVP slices
- [x] Slice 1: Durable tenant/session boundary, connected data model, and Connected Mode shell.
- [x] Slice 2: One-time pairing protocol with expiry, replay protection, and connection states.
- [x] Slice 3: Local official Bitget Agentic connector with credential-free sanitized snapshot preparation.
- [x] Slice 4: Authenticated snapshot sync, read-only personal account UI, stale/error states, and isolation proof.
- [x] Slice 5: Disconnect, sync-token revocation, isolation hardening, and owner QA readiness; no connected execution.

## Existing capabilities
- Demo Mode and shared Bitget Demo adapters: working; must remain separate from Connected Mode.
- Public market-data adapters and server-side Demo execution guards: working; not reused for connected accounts.
- Durable Postgres proof ledger: working; Connected Mode gets separate ownership tables.
- Auth/session layer for personal accounts: genuinely missing.

## Remaining MVP gaps
- Connected tenant/session identity and durable account ownership boundary.
- Pairing, local connector, sanitized snapshots, disconnect, and final isolation verification.

## Current slice
- Connected Mode typography refinement complete: Rajdhani display headings, Georama body copy, preserved mono labels, reduced page scale/spacing, and responsive connected UI. No Connected Mode behavior or Demo changes.

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

## Blockers
- Connected Mode requires `DATABASE_URL` for durable state; no process-global fallback is allowed for personal account data.
- Live OAuth/provider/snapshot sync QA requires an owner-run Bitget OAuth account, configured local connector access, and durable Postgres; it was intentionally not run here.

## Verification
- Focused Connected UI test: 3 passed.
- Full Vitest baseline: 789 passed across 43 files; this refinement's production build, `npx tsc --noEmit`, `npm run lint`, and `git diff --check` passed.
- Automated tests use fake HTTP/OAuth/provider boundaries only; no live OAuth or Bitget calls were made.

## Next action
- READ ONLY Connected Mode milestone is complete. Remaining work is owner-controlled real OAuth/provider QA only; do not start connected trading, mandates, or autonomous watchers.
