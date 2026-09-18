# Tenax — Phase 0 Spike Result (canonical evidence document)

Accumulating, append-only evidence for the Phase 0 feasibility spike
(build-plan §26). Each phase section records endpoint, timestamp,
credential requirement, PASS / FAIL / UNCERTAIN, important fields,
what it proves, and schema/doc discrepancies. No raw dumps, no headers,
no secrets — this file must never contain credentials.

## Phase 0A — Public Reality Data (zero-credential)

- Date: 2026-09-18. Script: `scripts/spikes/bitget-public.mjs`
  (Node built-in fetch only, sequential, ~1200ms spacing, single attempt each).
- Docs verified immediately before calling via official Bitget API search
  snippets (direct `bitget.com` page fetches are bot-blocked from research
  networks; endpoint paths/params below match the Sept 2026 docs).
- Base URL: `https://api.bitget.com`. No credentials sent or required.

### Environment finding (material)

All 8 probes failed at transport (`HTTP 0`, `fetch failed`): this sandbox
cannot resolve `api.bitget.com` (system DNS timeout; public resolvers
1.1.1.1/8.8.8.8 also unreachable), while general HTTPS egress works.
These are **environment-blocked, not Bitget rejections** — no HTTP status,
no Bitget error code, no auth/whitelist signal was observed. Verdicts below
are FAIL (transport); the phase status is INCONCLUSIVE pending rerun.

### Probes (run 2026-09-18T14:47–14:48Z, credential: none/public for all)

| Probe | Endpoint + params | Verdict | Returned fields | Proves / discrepancy |
|---|---|---|---|---|
| instruments | `GET /api/v3/market/instruments?category=SPOT&symbol=RNVDAUSDT` | FAIL (transport) | none captured | Would prove canonical symbol/status/sizing. Doc path confirmed current (Sept 2026 changelog still extends this endpoint). |
| ticker | `GET /api/v3/market/tickers?category=SPOT&symbol=RNVDAUSDT` | FAIL (transport) | none captured | Would prove live public ticker. Guide confirms rToken tickers via reused endpoint. |
| stock-info | `GET /api/v3/reality/market/stock-info?symbol=RNVDAUSDT` | FAIL (transport) | none captured | Would prove Reality→NVDA mapping + session metadata. `symbol` param inferred from "specified Reality trading pair" wording — confirm on rerun. |
| market-states | `GET /api/v3/reality/market/states` | FAIL (transport) | none captured | Would prove session-state source (added 2026-08-20). |
| market-calendar | `GET /api/v3/reality/market/calendar` | FAIL (transport) | none captured | Would prove holiday/closure source (added 2026-08-20). |
| earnings-forecast | `GET /api/v3/reality/market/earnings-forecast?code=NVDA` | FAIL (transport) | none captured | Would prove forecast/fundamentals shape. `code` param confirmed by official example (`earnings-forecast?code=`). `publicationDeadline` is a forecast field, NOT the confirmed earnings date. |
| company-overview (opt) | `GET /api/v3/reality/market/company-overview?code=NVDA` | FAIL (transport) | none captured | Optional mapping confirmation. `code` param inferred, unconfirmed. |
| valuation-indicators (opt) | `GET /api/v3/reality/market/valuation-indicators?code=NVDA` | FAIL (transport) | none captured | Optional fundamentals context. `code` param inferred, unconfirmed. |

No endpoint unexpectedly required auth/whitelist — no endpoint was reached
at all. Nothing in this run changes the prior research status: Demo +
RNVDA execution remains UNVERIFIED; default execution mode stays DRY_RUN.

### Corrections to prior research (verified 2026-09-18)

1. Current Reality documentation supports Reality trading through BOTH the
   dedicated Reality place/cancel endpoints AND the regular UTA place/cancel
   endpoints (regular-path support added 2026-09-03: "Place/Cancel Order:
   Added Reality (rToken) support", 5/sec/UID default, 30/sec whitelisted).
   Do not encode dedicated-endpoint exclusivity. Source: Bitget UTA
   changelog 2026-09.
2. `@bitget-ai/bitget-agent-sdk` is official Bitget tooling
   (Bitget-AI org). Source: https://github.com/Bitget-AI/agent-sdk
3. `bitget-api` (sieblyio, formerly tiagosiebler) is third-party and must
   not be described as official.
4. Demo + RNVDA execution remains unresolved — no official statement found
   either way; the owner-side authenticated spike is still required.

### Rerun

On any network with working DNS: `node scripts/spikes/bitget-public.mjs`.
Pure public GETs, rerun-safe, writes no files. Append results as Phase 0A
rerun below; do not overwrite this section.
