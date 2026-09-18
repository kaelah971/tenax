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

## Phase 0A — Owner-network rerun

- Date: 2026-09-18. Window: 2026-09-18T17:12:50Z through
  2026-09-18T17:13:02Z. Script: `scripts/spikes/bitget-public.mjs`
  (unchanged from sandbox run).
- Base URL: `https://api.bitget.com`. Credential: none (public) for all
  probes. No credentials sent, no authenticated endpoints, no orders placed.
- Result: all eight public probes returned `HTTP 200`, Bitget `code 00000`,
  Bitget `msg success`, verdict PASS.
- The sandbox transport-failure record above is preserved unchanged and
  remains the evidence for that environment.

### Environment troubleshooting (not a Bitget API defect)

- The first local owner-machine run failed before reaching Bitget because
  Windows Wi-Fi was using router DNS `192.168.0.1`, which timed out for
  Bitget domains.
- Owner changed Windows Wi-Fi DNS to `1.1.1.1` / `8.8.8.8`. After that:
  - `Resolve-DnsName api.bitget.com` succeeded.
  - `curl` reached `api.bitget.com` and received `HTTP 404` at the root URL
    (root-path probe only; expected — no API route at `/`).
  - Node fetch reached `api.bitget.com` and received `HTTP 404` at root.
  - The Phase 0A script then completed with all eight probes PASS.
- Treat the original local failures as environment/network evidence, not
  Bitget API failures.

### Probes (owner-network rerun, credential: none/public for all)

| Probe | Endpoint + params | Verdict | Returned fields | Proves |
|---|---|---|---|---|
| instruments | `GET /api/v3/market/instruments?category=SPOT&symbol=RNVDAUSDT` | PASS (HTTP 200, code 00000, msg success) | symbol RNVDAUSDT; category SPOT; status online; isReality yes; baseCoin rNVDA; quoteCoin USDT; minOrderQty 0.0001; minOrderAmount 10; pricePrecision 2; quantityPrecision 4; quotePrecision 6; symbolType stock | Proves canonical RNVDAUSDT SPOT instrument, online status, Reality flag, and sizing/precision constraints for the exposure adapter. |
| ticker | `GET /api/v3/market/tickers?category=SPOT&symbol=RNVDAUSDT` | PASS (HTTP 200, code 00000, msg success) | symbol RNVDAUSDT; live public ticker payload with fields including lastPrice, openPrice24h, highPrice24h, lowPrice24h, ask1Price, bid1Price, bid1Size, ask1Size, price24hPcnt, volume24h, turnover24h, platformTurnover24h, ts | Proves a live public ticker exists for RNVDAUSDT (market-state input). |
| stock-info | `GET /api/v3/reality/market/stock-info?symbol=RNVDAUSDT` | PASS (HTTP 200, code 00000, msg success) | symbol RNVDAUSDT; code NVDA; tradingPeriod overnight, pre_market, regular, after_hours; weekendTradable yes; name field null | Proves Reality RNVDAUSDT → NVDA underlying mapping plus session metadata. `symbol=RNVDAUSDT` param confirmed working. Null name recorded as observed; not used as mapping evidence. |
| market-states | `GET /api/v3/reality/market/states` | PASS (HTTP 200, code 00000, msg success) | market US; daylightType standard; stateList length 4; observed examples pre_market EST 04:00–09:30, regular EST 09:30–16:00 | Verified usable Bitget-native session-state context source for event-risk analysis. |
| market-calendar | `GET /api/v3/reality/market/calendar` | PASS (HTTP 200, code 00000, msg success) | timeZone EST; regularConfig SATURDAY, SUNDAY; specificConfig 3 entries | Verified usable Bitget-native closure/calendar context source. |
| earnings-forecast | `GET /api/v3/reality/market/earnings-forecast?code=NVDA` | PASS (HTTP 200, code 00000, msg success) | fiscalYear 2029; publicationDeadline null; isActual false; eps 25.2300; revenue 1025950.0000; currency USD | Verified for forecast/fundamentals context ONLY. `publicationDeadline` was null — this endpoint does NOT prove the actual NVIDIA earnings date. `code=NVDA` param confirmed working. |
| company-overview (opt) | `GET /api/v3/reality/market/company-overview?code=NVDA` | PASS (HTTP 200, code 00000, msg success) | code NVDA; name Nvidia; listingDate 1999-01-22; employees 42000; peRatio 27.5; pbRatio 23.13; high52Week 241.01; low52Week 162.94 | Optional verified enrichment surface only. Confirms NVDA underlying mapping with company context. `code=NVDA` param confirmed working. |
| valuation-indicators (opt) | `GET /api/v3/reality/market/valuation-indicators?code=NVDA` | PASS (HTTP 200, code 00000, msg success) | valuation fields including PE, PB, PS, PCF, EV/EBITDA, market-value fields and dividendYieldTtm | Optional verified enrichment surface for fundamentals context only. `code=NVDA` param confirmed working. |

No endpoint required auth/whitelist. No credentials, authenticated APIs, or
execution assumptions are added by this rerun. Demo + RNVDA execution remains
UNVERIFIED; default execution mode stays DRY_RUN. Phase 0B not begun.
