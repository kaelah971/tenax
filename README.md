# TENAX

### Give AI permission to act. Not unlimited control of your capital.

Tenax is a **programmable financial authority layer for autonomous capital**.

> Protection is the demonstration. Authority is the product.

Most trading agents optimize **what to do**. Tenax governs **what they are allowed to do**.

The first demonstration is autonomous protection for simulated NVIDIA exposure, using Bitget market context, a deterministic standing mandate, and a verified Bitget Demo or dry-run execution path.

## Tenax in 60 seconds

1. Tenax starts from capital exposure, not a raw trade command.
2. A user states an intent such as: **protect my NVIDIA exposure through a high-risk event**.
3. AI interprets the evidence and proposes a bounded action.
4. A Standing Mandate and deterministic authority engine decide what is permitted.
5. Tenax returns one of three meaningful outcomes: **EXECUTE**, **ESCALATE**, or **REFUSE**.
6. The result is written to a decision receipt and, when configured, a durable proof ledger.

The point is not to make an AI sound confident. The point is to make its authority inspectable.

## The problem

AI can increasingly decide what financial action it wants to take. The harder problem is:

> What is the agent actually allowed to do with the user's capital?

The usual choices are uncomfortable:

- approve every action manually, which limits useful autonomy; or
- give the agent broad trading authority and hope its reasoning stays within bounds.

Tenax introduces **bounded autonomy**. The user delegates a narrow class of authority. AI can reason and propose, but it cannot rewrite the mandate, grant itself permissions, or bypass deterministic execution gates.

## How Tenax works

```text
Capital Exposure
      →
User Intent
      →
AI Intelligence
      →
Standing Mandate
      →
Deterministic Authority Engine
      →
EXECUTE / ESCALATE / REFUSE
      →
Bitget
      →
Durable Decision Proof
```

The separation is deliberate:

- **AI reasons and proposes.** It interprets event, market, exposure, and protection evidence.
- **Deterministic code owns authority.** It evaluates the stored proposal against the active mandate, freshness, cumulative protection, execution mode, and hard safety gates.
- **The model never determines its own permissions.** A server boundary re-evaluates authority before an execution path can touch a provider adapter.

## EXECUTE / ESCALATE / REFUSE

| Outcome | Meaning | What happens next |
| --- | --- | --- |
| **EXECUTE** | The action is inside delegated authority and passes the remaining execution gates. | The configured path produces a dry-run preview or a Bitget Demo submission. |
| **ESCALATE** | The action may be reasonable, but it exceeds numeric delegated authority or requires human review. | No autonomous provider action occurs. A human must decide through the approval path. |
| **REFUSE** | A hard safety, validity, freshness, forbidden-action, or unknown-evidence condition failed. | The action is blocked and the reason is recorded. |

Refusal and escalation are product features, not generic error states. A safe financial agent must be able to stop without turning every proposal into a trade.

`REVIEW_EVERY_ACTION` is the strict review mode: every action goes through human approval even when it fits the standing class. It is distinct from an out-of-bounds escalation.

## Standing Mandates

A **Standing Mandate** is the user's programmable delegation of financial authority. It authorizes a narrow class of future protection actions; it is not a standing order and never gives the model unrestricted execution authority.

A mandate is drafted first and becomes authoritative only after explicit activation. Activation binds the exact policy to a hash. Once active, the policy is immutable; changing limits requires a new mandate. Mandates can expire, be revoked, or become exhausted after their execution budget is consumed.

### Current NVIDIA protection example

| Boundary | Example |
| --- | --- |
| Asset / subject | NVIDIA (`NVDA`) |
| Intent | `PROTECT_EVENT_RISK` |
| Protection market | `NVDAUSDT` short hedge |
| Maximum protection | `30%` |
| Maximum action size | `$100` in the judge-facing golden-path proposal |
| Maximum executions | `1` |
| Maximum leverage | `1x` |
| Sell underlying | `NEVER` |
| Transfers | `NEVER` |
| Authority mode | `AUTO_WITH_ESCALATION` |

The repository's canonical legacy fixture uses a `$150` notional ceiling while its PASS proposal is `$100` at 20% of the simulated `$500` exposure. The example above describes the bounded `$100` judge action without misrepresenting that code-level fixture default.

The supported authority modes are exactly:

- `REVIEW_EVERY_ACTION` — the mandate defines the allowed class, but every action still needs human approval.
- `AUTO_WITHIN_MANDATE` — actions inside the active mandate may proceed through the remaining deterministic gates; out-of-bounds actions refuse.
- `AUTO_WITH_ESCALATION` — actions inside the mandate may proceed; reasonable out-of-bounds authority conflicts escalate to human review; hard safety failures still refuse.

Cumulative protection is evaluated before a Demo write. Unknown, opposite, unreadable, or unvalued exposure does not get silently netted or resized; it fails closed.

## The NVIDIA demonstration

The primary product loop is:

```text
Simulated NVIDIA exposure
      →
Live/public market context where available
      →
AI-assisted analysis when explicitly configured
      →
Proposed NVDAUSDT protection
      →
Deterministic mandate evaluation
      →
Bitget Demo execution or explicit dry-run
      →
Decision receipt and proof
```

Truth conditions for the demo:

- The NVIDIA portfolio exposure is **simulated**.
- Public market and event context is shown only with its actual provenance; unavailable data stays unavailable.
- AI analysis is explicit. `TENAX_ANALYSIS_MODE=ai` selects the configured provider; otherwise the development fixture remains explicitly labeled.
- `NVDAUSDT` protection is derived by deterministic code. The model does not construct arbitrary order authority.
- Bitget Demo uses **virtual funds**. The default execution mode remains `DRY_RUN` until Demo configuration and gates are explicitly satisfied.
- A provider-accepted Demo order is not automatically a fill. `EXECUTION_FILLED` requires explicit verified fill evidence.
- Tenax does not claim to own NVDAx, rNVDA, or any tokenized NVIDIA position. The product understands exposure; this repository's portfolio fixture is simulated.

There is no live execution adapter in this product path. `LIVE` is not a supported execution mode.

## Durable decision proof

The proof ledger is the durable record of what Tenax decided, why it was allowed or blocked, and what execution evidence existed at that time. Proof persistence is downstream of authority: a storage failure cannot turn a refusal into a success or trigger another provider write.

Current proof kinds include:

| Proof kind | Meaning |
| --- | --- |
| `EXECUTION_FILLED` | A verified Bitget Demo fill with virtual-funds evidence. |
| `AUTHORITY_ESCALATED` | Authority exceeded; human review is required and no autonomous order was sent. |
| `AUTHORITY_REFUSED` | Deterministic safety or policy refusal; no order was sent. |
| `REVIEW_REQUIRED` | The mandate requires ordinary per-action human approval. |
| `EXECUTION_FAILED` | An execution attempt failed; no position is claimed as opened. |

With `DATABASE_URL` configured, proof is stored in PostgreSQL and survives browser sessions and process restarts. Neon-hosted PostgreSQL URLs are supported. Without `DATABASE_URL`, local development uses an explicitly **ephemeral** in-memory repository; it must not be presented as durable judge history.

Historical proof is historical evidence. It records what Tenax decided at that time; it does not prove that a position is still open, that capital is still protected, or that the user is profitable now.

## Connected Mode

**Connected Mode is read only today.** It is the personal Bitget account path, separate from the shared Demo experience.

```text
User Bitget Account
      →
Local Tenax Connector
      →
Official Bitget Agentic OAuth
      →
Credentials remain on this device
      →
Read-only account / assets / positions
      →
Sanitized snapshot
      →
Tenax Connected Mode
```

Connected Mode currently supports:

- a personal Bitget connection;
- sanitized assets and positions;
- last-sync, awaiting-sync, stale, disconnected, and error states;
- authenticated disconnect and reconnect through a fresh pairing;
- connection-scoped sanitized snapshot syncing.

Connected Mode currently does **not** support:

- personal-account trading;
- autonomous execution on a personal Bitget account;
- connected-user mandates that can write to a personal account.

The Connected Mode surface explicitly displays `READ ONLY` and does not read the shared Demo account.

## The Tenax Connector

The local connector exists to keep the personal credential boundary on the owner's device while the web app receives only sanitized account information.

The intended user flow is:

```text
Open Tenax
      →
CONNECT BITGET
      →
Install Tenax Connector once, if needed
      →
Approve Bitget locally
      →
Connected · READ ONLY
```

Normal users should not need PowerShell, Node commands, manual registry editing, or manual pairing codes. Those are engineering and owner-QA tools, not the product path.

Current connector security properties:

- loopback-only bridge on `127.0.0.1:43127`;
- strict browser Origin validation;
- short-lived, one-time pairing records;
- pairing secret accepted only in a request body;
- secret-free `tenax://open` protocol URI;
- sanitized browser-visible status and error states;
- Bitget OAuth credentials remain on the local connector device;
- official Bitget Agentic SDK configured read only;
- provider operations restricted to the connector's read allowlist for account, assets, and positions;
- no personal-account provider writes.

The Windows connector is packaged as a per-user executable using Node SEA. Generated release binaries stay outside source control under `release/tenax-connector/`.

## Demo Mode vs Connected Mode

| | Demo Mode | Connected Mode |
| --- | --- | --- |
| Account | Shared Bitget Demo environment | User's own Bitget account |
| Funds | Virtual funds | Personal account data; no Tenax trading |
| Purpose | Judge-friendly autonomous mandate demonstration | Private account boundary and read-only sync |
| Credentials | Server-side Demo configuration when explicitly enabled | Local connector device |
| Authority | Standing Mandate can drive the Demo agent cycle | Read-only today |
| Execution | `DRY_RUN` by default; gated `BITGET_DEMO` path | No personal execution |
| Proof | Decision receipt and proof ledger | Connection/snapshot status, not personal trade proof |

## Safety model

Tenax's safety boundary is implemented in code, not in a prompt:

- AI cannot rewrite an active mandate.
- AI does not build or control execution authority.
- Deterministic code evaluates permission from the stored proposal and active policy.
- Execution rechecks the mandate, approval or standing authority, proposal binding, freshness, sizing, mode, and other gates at the server boundary.
- Cumulative protection is evaluated before a Demo write.
- Hard safety failures fail closed.
- Provider success is not automatically equivalent to a filled execution.
- `DRY_RUN` never moves funds and never becomes a fill proof.
- Connected personal accounts remain read only.
- Notifications never authorize, trigger, or substitute for execution gates.

## Architecture

### Autonomous Demo authority path

```text
┌──────────────────────────┐
│ TENAX WEB               │
│ exposure · intent · UI  │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ AI / INTELLIGENCE       │
│ evidence → proposal     │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ DETERMINISTIC AUTHORITY │
│ mandate · safety gates  │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ EXECUTE / ESCALATE /    │
│ REFUSE                  │
└───────┬─────────┬────────┘
        ↓         ↓
┌──────────────┐  ┌──────────────────────┐
│ BITGET DEMO │  │ DURABLE DECISION     │
│ virtual     │  │ PROOF / RECEIPT      │
│ funds       │  │                      │
└──────────────┘  └──────────────────────┘
```

### Personal account boundary

```text
┌──────────────────────────┐
│ TENAX WEB               │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ LOCAL TENAX CONNECTOR   │
│ OAuth + read-only SDK   │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ BITGET PERSONAL ACCOUNT │
│ assets / positions only │
└──────────────────────────┘
```

The two paths are intentionally different. Demo Mode proves bounded autonomous protection. Connected Mode proves the personal credential and account-data boundary without implying personal trading is available.

## Notifications

Notifications are derived from canonical activity events and are idempotent. They inform the user; they do not control authority or execution.

Current notification paths:

- **In-app:** notification bell, activity, analysis, approval, receipt, and mandate destinations.
- **Browser notifications:** explicit opt-in foreground/session alerts using the browser Notification API. No service worker is used; unsupported or denied browsers fall back to in-app notifications.
- **Telegram:** optional best-effort delivery for high-value outcomes such as review required, escalation, refusal, verified Demo fill, and execution failure. Telegram failures are isolated from the authority result and never trigger a retrying execution.

Examples include:

- protection executed;
- authority escalated;
- action refused;
- execution failed;
- human review required.

## Technology

The repository currently uses:

- Next.js `16.3.5` App Router;
- React `19.2.8`;
- strict TypeScript;
- Tailwind CSS v4;
- Zod for boundary and domain validation;
- Bitget public market APIs and the official `@bitget-ai/bitget-agent-sdk`;
- PostgreSQL through the `pg` driver, including Neon-compatible hosted URLs;
- a server-only raw-fetch AI provider boundary for OpenAI and Groq's OpenAI-compatible API shape;
- Node SEA with esbuild/postject for the Windows connector;
- Vitest for deterministic offline tests.

Provider keys, database URLs, connector metadata, and OAuth credentials are server- or device-side concerns. They do not belong in browser bundles, fixtures, screenshots, or this README.

## Local development

### App setup

Use your repository URL for the clone step; this README does not invent a public repository address:

```bash
git clone <TENAX_REPOSITORY_URL>
cd tenax
npm install
```

This repository does not ship a tracked `.env.example`. Create the ignored `.env.local` from your local secret manager or environment template. If your environment provides a template file, the conditional PowerShell command is:

```powershell
if (Test-Path .env.example) { Copy-Item .env.example .env.local }
```

Never commit `.env.local`, API keys, OAuth credentials, database URLs, or connector metadata. Durable Connected Mode and durable proof require a valid server-side `DATABASE_URL`.

Run the app and verification commands with npm:

```bash
npm run dev
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Open `http://localhost:3000` after starting the development server. The default execution mode is `DRY_RUN`; do not describe local output as live execution.

### Build the Windows connector

For local owner QA, build the packaged connector against the local app origin:

```bash
npm run build:connector -- --server-origin http://localhost:3000
```

Generated binaries are written to and remain ignored under:

```text
release/tenax-connector/
```

The expected setup artifact is `release/tenax-connector/tenax-connector-setup.exe`. The web Connected Mode install button serves that ignored local artifact only in development. Public production hosting uses the configured `TENAX_CONNECTOR_INSTALLER_URL` release URL instead.

## Current product truth

| Capability | Current status |
| --- | --- |
| Standing Mandates | Implemented: draft, activate, revoke, expiry/exhaustion, hash-bound active policy |
| Deterministic Execute / Escalate / Refuse | Implemented: server-gated and independently testable |
| AI-assisted analysis | Implemented when explicitly configured; development fixture remains the default otherwise |
| Bitget public market data | Implemented with explicit available / partial / unavailable provenance |
| Bitget Demo execution | Implemented as a gated virtual-funds path; default remains `DRY_RUN` and owner QA is required |
| Durable decision proof | Implemented with `DATABASE_URL`-backed PostgreSQL; local memory fallback is explicitly ephemeral |
| In-app notifications | Implemented |
| Browser notifications | Implemented as explicit opt-in foreground/session alerts |
| Telegram notifications | Implemented as optional best-effort delivery |
| Personal Bitget connection | Implemented through the local connector and local OAuth boundary |
| Personal asset / position sync | Implemented as sanitized read-only snapshots |
| Local credential boundary | Implemented: credentials remain on the connector device |
| Personal Bitget trading | Not available |
| Autonomous personal-account execution | Not available |

## Why Tenax matters

Financial agents will become increasingly autonomous. The core infrastructure question is not only whether an agent can produce a good proposal. It is:

- what may the agent control?
- how much may it deploy?
- which actions require human approval?
- what must it never do?
- how does authority expire?
- how are violations prevented?
- how can decisions later be proven?

Tenax is building that boundary.

> AI decides what it wants to do. Tenax decides what it is allowed to do.

## Roadmap

Near-term work is deliberately grounded in the current product boundary:

- complete real Connected Mode owner QA;
- production connector distribution and release hosting;
- code signing for the Windows installer;
- improve production Bitget public-data reliability;
- strengthen per-user mandate ownership and account isolation;
- strengthen per-user proof isolation.

Later direction, not current capability:

- explicitly authorized personal execution;
- persistent autonomous monitoring;
- multi-asset mandates;
- richer escalation workflows;
- multi-agent and treasury authority.

## Screenshots

No verified product screenshots are currently tracked in this repository.

<!-- TODO: Add verified screenshots for the landing page, Standing Mandate, Execute / Escalate / Refuse cockpit, and Proof Ledger once approved assets are checked in. Do not replace this with invented paths. -->

## Source documents

- [Product idea and MVP blueprint](docs/tenax_product_idea.md)
- [PRD, architecture, and build plan](docs/tenax_prd_architecture_build_plan.md)
- [Brand messaging](docs/tenax-brand-messaging.md)
- [Design system](DESIGN.md)
