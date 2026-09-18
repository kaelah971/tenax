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

## Phase 0B — SDK + Dry-run Execution

- Date: 2026-09-18. Script: `scripts/spikes/bitget-sdk-dryrun.mjs`
  (official SDK discover/tool metadata + isolated mandate logic + dryRun
  preview + example receipt; rerun-safe, writes no files).
- Credential: none. No `BITGET_*` env vars detected at runtime. No Demo
  credentials, no live credentials, no authenticated writes, no network
  order submission. `readOnly:true` config + `dryRun:true` previews only.
- KYC blocker (material): the owner cannot complete Bitget KYC right now,
  so authenticated Demo trading is unavailable. Demo execution = BLOCKED BY
  KYC (not attempted, not a product failure).
- Locked hackathon execution mode: DRY_RUN. Rules: no real funds, no Demo
  credentials, no live credentials, no authenticated writes, no network
  order submission, never present a dry-run as an executed trade, all
  UI/receipts must label DRY_RUN / NO FUNDS MOVED.
- Prior Phase 0A sections above are preserved unchanged.

Authenticated Bitget Demo execution was not tested because the owner could
not complete KYC. Tenax therefore uses an explicitly labelled dry-run
execution adapter for the hackathon MVP.

### Official SDK verification

- Package: `@bitget-ai/bitget-agent-sdk` (official Bitget tooling,
  Bitget-AI org). Third-party `bitget-api` was NOT installed.
- `npm view` before install: `version 3.3.0`, `dist-tags { latest: 3.3.0 }`.
- Install: `npm install @bitget-ai/bitget-agent-sdk` → `3.3.0`
  (confirmed via `npm list` and SDK `package.json`).
- Catalog: 109 operations (`CATALOG.length`). Intent tools observed:
  `market, order, position, strategy_order, account_overview,
  account_config, repayment, transfer_funds, deposit, withdraw,
  funds_records, subaccount, loan, tax, raw, authorize_start,
  get_auth_status, discover`.

### SDK coverage (VERIFIED / UNCERTAIN / NOT SUPPORTED)

| Question | Verdict | Evidence |
|---|---|---|
| Reality-specific order operations | NOT SUPPORTED | 0 catalog matches for `reality`, `rtoken`, `rwa`, `stock` across all 109 ops/paths/summaries. No dedicated Reality place/cancel operation in SDK v3 UTA surface. Recorded, not faked. |
| Regular UTA place-order exposed | VERIFIED | `placeOrder`: `POST /api/v3/trade/place-order`, `auth private`, `isWrite true`, `module trade`. Reachable via `order` verb `action=place` and via `raw` `operationId=placeOrder`. |
| dryRun supported on writes | VERIFIED | `safeInvoke(order, {action:'place', ..., dryRun:true})` and `safeInvoke(raw, {operationId:'placeOrder', args:{...}, dryRun:true})` both return `{ok:true, data:{dryRun:true, operationId:'placeOrder', wouldSend}}` with zero network writes and zero credentials, allowed even in `readOnly`. |
| RNVDAUSDT representable via schema | UNCERTAIN | Place-order schema accepts a free-form `symbol` string, and the dryRun preview builds for `category SPOT / symbol RNVDAUSDT`, but the SDK has no Reality-specific operation and no live submission was made. This does NOT prove RNVDA/Reality execution support. No BTCUSDT or other asset substituted as proof. |

### Dry-run fixture (per brief, labelled fixture — not live state)

- Exposure: underlying NVDA, representation RNVDAUSDT, venue Bitget Reality,
  exposure value 500 USDT.
- Mandate: max hedge 30%, max trade value 150 USDT, leverage disabled,
  human approval required yes, allowed asset NVDA.
- Proposed protection: 20% of exposure = 100 USDT (expected).
- Instrument constraints (from Phase 0A owner rerun): status online,
  isReality yes, minOrderAmount 10 USDT, minOrderQty 0.0001, pricePrecision 2,
  quantityPrecision 4.
- Quantity derivation: no fill price invented. Script fetched the real
  public ticker `GET /api/v3/market/tickers?category=SPOT&symbol=RNVDAUSDT`
  (HTTP 200, code 00000; observed run `2026-09-18T20:31:36.568Z`:
  `lastPrice 221.57`, `ask1Price 221.54`, `bid1Price 221.53`) and derived
  `qty 0.4513 = 100 / 221.57` rounded to quantityPrecision 4 with a clear
  timestamp. Note: this sandbox now reaches `api.bitget.com` (unlike the
  Phase 0A sandbox run); if the ticker is ever unavailable the script
  records `tickerUnavailable` and uses an explicitly shape-only qty.
- Exact dry-run mechanism proven: official SDK `executeWithSafety` dryRun
  path via (1) `order` verb and (2) `raw` escape hatch. Example would-be
  payload (NOT submitted):
  `placeOrder POST /api/v3/trade/place-order { category SPOT,
  symbol RNVDAUSDT, side sell, orderType market, qty 0.4513 }`
  (`order`-verb preview additionally echoes an auto-generated `clientOid`;
  `raw` preview echoes the verbatim args). `riskLevel write`,
  `dryRun true`, `networkWrite false`, `credentialsSent false`.

### Mandate check (spike-local deterministic logic, not Phase 1 code)

- PASS fixture: 20% / 100 USDT vs max 30% / 150 USDT, asset NVDA,
  leverage disabled, approval required, 100 USDT >= minOrderAmount 10 USDT
  → `PASS, pending human approval` (all 6 checks pass; `failedRules []`).
- REFUSE fixture: 40% / 200 USDT vs max 30% / 150 USDT → `REFUSE`
  (`failedRules [max_protection_pct, max_trade_value]`; all other checks
  pass). Recorded as the rejected alternative in the receipt.

### Example Decision Receipt (deterministic, dry-run only)

- Receipt `TENAX-0B-DRYRUN-EXAMPLE-001`: exposure NVIDIA / RNVDAUSDT,
  500 USDT; intent PROTECT_EVENT_RISK; proposed 20% / 100 USDT
  (qty preview 0.4513 with timestamped price source); mandate PASS;
  approval REQUIRED (pending; no auto-execution); execution mode DRY_RUN;
  funds moved false; Bitget order request = would-be payload only
  (`placeOrder POST /api/v3/trade/place-order`); rejected alternative =
  200 USDT / 40% REFUSE; timestamp + evidence/source references included.
- No fake orderId, no fake transaction hash, no "executed successfully"
  wording. Disclaimers: `DRY_RUN — NO FUNDS MOVED`, `No orderId. No
  transaction hash. Nothing was executed.`, `Authenticated Bitget Demo
  execution was not tested (KYC blocker).`

### Execution adapter boundary (locked for MVP)

- Market/intelligence plane: Bitget public Reality REST (Phase 0A probes).
- Order-shape plane: Tenax DRY_RUN adapter constructs the documented UTA
  place-order request shape locally and labels it would-be payload only;
  never submits.
- SDK role: official Agent SDK v3 stays integrated for Agent Hub
  compatibility/tooling (discover, order-verb dryRun preview, raw escape
  hatch); it is NOT claimed as Reality execution proof.
- Forbidden: live or Demo submission, credentials, BTCUSDT substitution as
  RNVDA proof, labelling dry-run as executed.

### Phase 0 exit

- DATA: PASS (Phase 0A public Reality data, owner-network rerun).
- DEMO EXECUTION: BLOCKED BY KYC (not tested; no credentials created).
- DRY-RUN: PASS (official SDK dryRun preview + mandate PASS/REFUSE +
  example receipt, zero network writes, zero credentials).
- Final locked MVP execution mode = DRY_RUN. Phase 0 is closed on this
  basis. Phase 1 not begun.
