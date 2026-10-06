# Agentic Trading Capture Manifest — one genuine Bitget Demo paper run

> Slice 4 of the Agentic Trading Evidence milestone. Read-only checklist for
> the owner-authorized live capture. No secrets are recorded here — ever.

## Pre-flight (all verified 2026-10-06, see Decision log)

- [ ] Durable Postgres reachable: run ledger `DURABLE` (0 runs), proof
      ledger `DURABLE` (1 proof). `DATABASE_URL` present; config valid.
- [ ] Demo discovery `overallDiscovery: PASS` (exit 0):
      instrument PASS (NVDAUSDT online) · ticker PASS · position probe PASS ·
      futures trade-read PASS · account settings PASS
      (hybrid/basic, hedge_mode, crossed, configured 1x, NVDA config present).
      1x preview NOT_RUN with `PERMISSION_ERROR` — honest, non-blocking.
- [ ] AI path live-verified: groq `openai/gpt-oss-120b`, `overall: PASS`.
      NOTE: with canonical fixture evidence the model decides **WAIT**
      (unverified earnings timing + simulated exposure), so a genuine
      AI-driven EXECUTE needs owner-accepted intent/evidence or the
      explicit fixture path (see § Decisions).
- [ ] `.env.local` hygiene fixed: exactly one `TENAX_ANALYSIS_MODE` line
      (`ai` for a genuine AI run, `fixture` for the deterministic run).
- [ ] Owner decision on the pre-existing Demo short recorded (§ Decisions).
      The agent never closes positions automatically.

## Owner decisions (required before the run)

1. **Analysis mode**: `ai` (genuine model proposal) or `fixture`
   (deterministic 20% / $100 PROTECT). If `ai` + model returns WAIT/NO_ACTION,
   the cycle stops with NO_ACTION evidence — that is a valid capture, not a failure.
2. **Pre-existing Demo position**: live probe showed
   `currentPosition: PRESENT, short 0.43 @ 1x` (~$103 ≈ 20.6% of $500 exposure).
   A further $100 short projects ~40.6% > 30% mandate max, so the autonomous
   cumulative gate will ESCALATE (AUTO_WITH_ESCALATION) or REFUSE
   (AUTO_WITHIN_MANDATE) — also valid evidence, but NOT an EXECUTE capture.
   For a clean EXECUTE capture the owner must first flatten/reduce the Demo
   NVDAUSDT short manually (owner action, outside Tenax). Recommended: close it,
   re-run the discovery probe to confirm NONE, then capture.
3. **Authority path**: standing-mandate agent cycle
   (`POST /api/protection/agent-cycle`) or manual human approval
   (Protect → Analysis → Gate → Approve → Execute). Note: only the autonomous
   cycle enforces the cumulative ceiling; the manual path enforces the 16
   executor gates but not cumulative stacking — prefer the agent cycle after
   flattening, or record the manual path choice explicitly below.

## Proposed Demo action (awaiting owner authorization)

- One `POST /api/v3/trade/place-order` on Bitget **Demo** (`paptrading: 1`):
  `category=USDT-FUTURES, symbol=NVDAUSDT, side=sell, posSide=short,
  orderType=market`, qty derived live as
  `floor($100 / markPrice, quantityPrecision=2)` (≈ 0.41 at 239.7),
  `clientOid=tenax-<flowId>-<proposalHash>`, no marginMode, no leverage
  (account 1x crossed applies untouched). Verification via read-only
  `GET order-info`; FILLED reported only on explicit filled status.
- Preconditions: `TENAX_EXECUTION_MODE=BITGET_DEMO`,
  `BITGET_TRADING_MODE=demo`, server-side Demo credentials present,
  mandate PASS + bound authority + all 16 gates + explicit invocation.
  Anything else → REFUSED with zero POSTs.

## Evidence to collect after capture

- [ ] `runId` (`paper-run:v1:<flowId>`) and `flowId`
- [ ] `proofId` (JudgeProof) and proof kind
- [ ] Provider `orderId` / `clientOid` (if submitted; null + NO_ORDER reason otherwise)
- [ ] Execution terminal state: PREVIEW / SUBMITTED / FILLED / FAILED / NO_ORDER
      (SUBMITTED ≠ FILLED — acceptance is never reported as a fill)
- [ ] Outcome state: NOT_OBSERVED / OPEN_MARK / REALIZED / UNAVAILABLE
      (OPEN_MARK ≠ REALIZED — marks never count as realized)
- [ ] Screenshots: `/app/paper-trading`, `/app/paper-trading/[runId]`,
      `/app/proof` (or `/app/proof/[id]`), receipt/approval screens
- [ ] CSV export (`/api/paper-trading/export.csv`) contains the run row
- [ ] JSON export (`/api/paper-trading/export.json`) contains the run record
- [ ] Summary (`/api/paper-trading/summary`) reflects the run in totals
- [ ] AI provider/model + `evidencePackHash`/`outputHash` (AI path) or
      `analysis: DEVELOPMENT_FIXTURE` label (fixture path)
- [ ] Mandate version/bounds, `createdAt`/`submittedAt`/`verifiedAt` timestamps
- [ ] Environment label (`BITGET_DEMO`), symbol (`NVDAUSDT`), persistence
      (`DURABLE · POSTGRES`), sample-size + INSUFFICIENT DATA states where true

## Truth rules (judge-facing)

- SUBMITTED ≠ FILLED · OPEN_MARK ≠ REALIZED · unknown ≠ zero.
- No-order outcomes are explicit (`NO_ORDER` + reason, zero POSTs).
- Environment, provenance, sample size, and methodology stay visible.
- Sharpe stays non-annualized run-return with INSUFFICIENT DATA below n=2.
- No secrets in any DTO, log, screenshot, or export.
