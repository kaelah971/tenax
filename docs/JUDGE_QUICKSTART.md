# Tenax Judge Quickstart

> Judge? Start here. Two paths: the hosted one-click demo (primary), or a
> local clone for inspectors. No Bitget account is needed for the demo.

## A. Fastest way to try Tenax (primary judge path)

1. Open the hosted Tenax deployment URL: **`[HOSTED_TENAX_URL]`**
   (deployment URL to be confirmed — this placeholder stands in for it).
2. Click **SEE DEMO** in the hero (or open `/app/demo` directly).
3. Click **RUN DEMO**.
4. Watch the six real stages complete from actual domain state:
   Exposure → Event Context → Intent → Mandate Gate → Authority → Result.
5. Read the terminal result: authority **REFUSE**, execution **NO ORDER SENT**,
   provenance **DEVELOPMENT_FIXTURE**.
6. Open the generated evidence with the on-screen links:
   **VIEW PAPER-TRADING RUN** and **VIEW DECISION PROOF**.

What just happened: Tenax ran its real exposure model, intent pipeline, and
deterministic mandate gate against a controlled 40% / $200 demo proposal.
The 30% / $150 mandate refused it, and the refusal itself was persisted as
durable activity + proof + run. Nothing traded, no AI was called, no
provider was contacted. Each RUN DEMO click mints a fresh explicit demo
flow, so reruns never duplicate anything — a refused path cannot execute
by construction.

The second scenario, RUN EXECUTION DEMO, feeds the canonical 20% / $100
fixture analysis through mandate PASS plus a fresh demo standing mandate,
then runs the autonomous cycle forced to DRY_RUN. The preview-only
adapter constructs the would-be order and moves nothing; the receipt +
run persist with submitted false. Same zero-credential, zero-network,
zero-AI guarantees as the refusal path.

## B. Optional: run Tenax locally (inspectors only)

Only if you want to inspect the repository yourself. `localhost` appears
here solely because *you* chose to run Tenax on *your* computer.

```bash
git clone <TENAX_REPOSITORY_URL>
cd tenax
npm install
npm run dev
```

Then open `http://localhost:3000` and follow path A from step 2
(`SEE DEMO` → `RUN DEMO`). Production equivalent: `npm run build`
followed by `npm start`. Health check: `GET /api/health` returns
configuration booleans only — never secrets.

Without `DATABASE_URL`, local runs use explicitly labeled ephemeral
in-memory stores; configure Postgres for durable judge history.

## C. Optional integrations (only if you want live behavior)

The hosted demo needs none of this. Each variable below is read
server-side only; nothing is exposed to the browser.

| Capability | Variables | Effect when absent |
|---|---|---|
| No credentials | — | Hosted/local controlled judge demo (fixture-labeled REFUSE path) |
| `DATABASE_URL` | `DATABASE_URL` | Durable run/proof history; absent → labeled EPHEMERAL stores |
| AI provider key | `TENAX_ANALYSIS_MODE=ai`, `TENAX_AI_PROVIDER`, `TENAX_AI_MODEL`, `GROQ_API_KEY` or `OPENAI_API_KEY` | Genuine model analysis; absent → `AI_UNAVAILABLE`, fixture stays labeled |
| Bitget Demo credentials | `BITGET_API_KEY`, `BITGET_SECRET_KEY`, `BITGET_PASSPHRASE`, `BITGET_TRADING_MODE=demo`, `TENAX_EXECUTION_MODE=BITGET_DEMO` | Guarded Bitget Demo execution; defaults stay `DRY_RUN` (LIVE is unrepresentable) |
| Bitget MCP healthy | `BITGET_MCP_BASE_URL` (defaults to `https://agent.bitget.com`) | Verified live event intelligence; unreachable → `SOURCE_UNAVAILABLE`, never a block |
| Telegram fan-out | `TELEGRAM_BOT_TOKEN`, `TENAX_TELEGRAM_CHAT_ID`, `TENAX_APP_ORIGIN` | Best-effort notifications; absent → disabled with zero network |

Judges do NOT need to connect a Bitget account to try the hosted demo.
Bitget credentials are only for judges who deliberately want to test
connected Demo execution. Never use live-money credentials: Tenax has no
live-trading path, and Demo keys must never carry withdrawal permissions.

## D. Connecting guarded Bitget Demo execution

Using existing Tenax behavior only:

1. Put the three Demo credentials plus `BITGET_TRADING_MODE=demo` and
   `TENAX_EXECUTION_MODE=BITGET_DEMO` in the server environment
   (`.env.local` locally; your host's env dashboard when deployed).
   Acquiring Demo API credentials happens on Bitget's own site and is
   outside this repository — this doc does not invent those steps.
2. Restart (local `npm run dev`) or redeploy (hosted) so the server
   process picks up the values.
3. Verify with `GET /api/health`: `execution.mode` should read
   `BITGET_DEMO`, `demoBackend` true, `demoCredentialsPresent` true.
4. Run the normal Protect → Analysis → approval flow. Every Demo order
   still passes all deterministic gates plus explicit human approval.
5. Evidence appears as the run (`/app/paper-trading`), the proof
   (`/app/proof`), the receipt, and CSV/JSON exports. Provider acceptance
   is never reported as a fill — only explicit `filled` status counts.
