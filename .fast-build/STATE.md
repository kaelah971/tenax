# Fast Build State

## Product
- Name: Tenax
- Outcome: Let a visitor inspect their own Bitget account in a session-scoped, read-only Connected Mode without moving credentials to Tenax.
- Primary demo path: Demo Mode remains instant; Connected Mode provisions a durable session, pairs a local connector later, then shows sanitized personal account state.

## MVP slices
- [x] Slice 1: Durable tenant/session boundary, connected data model, and Connected Mode shell.
- [x] Slice 2: One-time pairing protocol with expiry, replay protection, and connection states.
- [ ] Slice 3: Local official Bitget Agentic connector with credential-free sanitized snapshot upload.
- [ ] Slice 4: Connected account snapshot storage, read-only UI, stale/error states, and isolation proof.
- [ ] Slice 5: Disconnect and isolation hardening; no connected execution.

## Existing capabilities
- Demo Mode and shared Bitget Demo adapters: working; must remain separate from Connected Mode.
- Public market-data adapters and server-side Demo execution guards: working; not reused for connected accounts.
- Durable Postgres proof ledger: working; Connected Mode gets separate ownership tables.
- Auth/session layer for personal accounts: genuinely missing.

## Remaining MVP gaps
- Connected tenant/session identity and durable account ownership boundary.
- Pairing, local connector, sanitized snapshots, disconnect, and final isolation verification.

## Current slice
- Slice 2 complete: short-lived, one-time pairing creates a read-only connection atomically. No OAuth, provider calls, account sync, or execution.

## Completed
- Added 10-minute high-entropy display codes; only SHA-256 hashes persist.
- Added durable pairing records with PENDING/CONSUMED/EXPIRED/REVOKED state and owner/session foreign keys.
- Added authenticated browser create/status APIs and connector-facing consume API with generic invalid/expired responses.
- Added row-lock transaction consume path: one concurrent consume succeeds; replay fails.
- Wired `/app/connected` to honest CONNECT BITGET / pairing-code / READ ONLY states.

## Blockers
- Connected Mode requires `DATABASE_URL` for durable state; no process-global fallback is allowed for personal account data.

## Verification
- Focused Connected Mode + pairing tests: 18 passed.
- Full Vitest: 767 passed across 39 files.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` passed.

## Next action
- Slice 3: build the local Bitget Agentic connector. Keep OAuth local, upload sanitized snapshots only, and do not add connected execution.
