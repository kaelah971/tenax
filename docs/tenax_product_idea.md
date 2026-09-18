# Tenax — Product Idea & MVP Blueprint

**BITGET AI BASE CAMP HACKATHON S2**

**Product:** An AI agent that protects tokenized U.S. stock exposure around earnings and high-risk market events — while staying inside user-defined rules.

**Hackathon wedge:** NVIDIA / rNVDA earnings protection.

**Larger thesis:** Tell your capital what you want it to accomplish.

*Product Idea & MVP Blueprint. Prepared September 2026. Public product name: Tenax.*

---

## 1. The Product in One Sentence

An AI agent that protects a user's tokenized U.S. stock exposure around earnings and other high-risk market events, without forcing the user to constantly babysit the position.

For the hackathon, the first proof is deliberately narrow: a user owns NVIDIA exposure through Bitget's rNVDA, asks the agent to protect that exposure through earnings, defines hard limits, reviews the proposed action, approves it, and receives a transparent decision/execution receipt.

---

## 2. The Problem

Tokenized equities create a new operating environment. The reference U.S. equity market has defined sessions, while tokenized representations can have different trading windows, liquidity conditions, issuers, rights and execution rails. Material information such as earnings can arrive when the holder is not actively watching.

The user therefore has two problems at once: understanding what an event means for their economic exposure, and deciding what action is appropriate without giving an AI unrestricted control of their account.

The product promise: **"I know what you own. I know what's happening. I know what you've permitted me to do. I'll tell you when your position needs attention."**

---

## 3. First User

The initial user is a crypto-native investor or trader who holds tokenized U.S. equities and wants the benefits of programmable/extended-hours markets without monitoring every earnings event manually.

The first emotional use case is intentionally simple: **"I own NVIDIA. Earnings are coming. Watch my back."**

---

## 4. The Hackathon Experience

| Step | User / System Experience |
|---|---|
| 1 | Connect Bitget Demo. The product reads the user's supported position data. |
| 2 | Understand exposure. rNVDA is interpreted as NVIDIA economic exposure, not merely a ticker string. |
| 3 | Set intent. Example: "Protect my NVIDIA through earnings. Don't hedge more than 25% or $125." |
| 4 | Observe the event. Real market, session, earnings/fundamental and relevant contextual data feed the analysis. |
| 5 | AI proposes. The reasoning layer interprets the event and proposes a bounded protection action. |
| 6 | Mandate Gate validates. Deterministic code checks amount, exposure, leverage, permissions and approval requirements. |
| 7 | User approves. No unrestricted autonomous authority in the MVP. |
| 8 | Execute or preview. Use Bitget Demo paper execution if rNVDA is supported there; otherwise use a clearly labelled genuine dry-run. |
| 9 | Decision Receipt. Show what happened, why, what passed, what was rejected and the execution result. |

---

## 5. The Product Fingerprint

Someone else may build an earnings agent. Our differentiation is the complete chain below, expressed consistently in the product, architecture, demo and pitch:

**Exposure → Intent → Intelligence → Mandate → Action or Refusal → Receipt**

**Exposure-aware, not ticker-aware.** The system starts from economic exposure. NVIDIA can be represented by different tokenized instruments and derivatives. The MVP only executes on the chosen Bitget rail, but the data model begins with the underlying exposure so the product can expand later without being trapped as an rNVDA-only bot.

**Intent instead of trading commands.** The user expresses an outcome — for example, protect this position through earnings — rather than manually specifying every trade. This is the first visible proof of the larger Tenax abstraction.

**A visible mandate.** The user's authority boundary is a first-class product object, not buried in settings:

- Maximum hedge percentage
- Maximum trade value
- Allowed exposure/instrument
- Leverage allowed or disabled
- Whether explicit approval is required

**Refusal is a feature.** The system is allowed to conclude NO ACTION. If the proposed action violates the mandate or execution conditions are unsuitable, the position remains unchanged and the reason is recorded. This makes restraint part of the product rather than treating every AI output as a trade signal.

**Decision receipts.** The receipt proves the reasoning-to-action chain: exposure, event, signals considered, proposal, mandate checks, approval, execution state, and rejected alternatives. It is more useful than a normal transaction receipt because it answers both "what happened?" and "why was this allowed?"

---

## 6. Example Decision Receipt

**NVIDIA EARNINGS — DECISION #0182**

- Exposure: $512 rNVDA
- Event: NVIDIA earnings
- Assessment: Elevated event risk
- Proposed protection: $102 / 19.9%
- Mandate: max protection 25%; max value $125; leverage disabled; approval required
- Policy result: **PASS**
- User: **APPROVED**
- Execution: Bitget Demo or clearly labelled Dry Run
- Why this happened: signals influencing the proposal are shown.
- What was rejected: alternatives that breached the mandate or failed execution criteria are shown.

---

## 7. What the AI Does — and Does Not Do

AI is the reasoning layer. It interprets earnings/event information and combines relevant context to answer: what changed, what might it mean for this user's exposure, and what bounded action — if any — should be proposed?

Deterministic software is the authority layer. Code checks whether the proposal is permitted, correctly sized and executable under the user's mandate. The LLM does not receive raw unrestricted trading authority.

**AI = reasoning. Code = authority.**

---

## 8. Exposure Graph

The underlying system begins with a small semantic graph that maps an underlying company/exposure to its financial representations. Conceptually:

```
NVIDIA (Underlying economic exposure)
├── rNVDA (Reality / Bitget)
├── NVDAx (xStocks)
└── Ondo NVDA representation (Ondo)
```

The graph must preserve meaningful differences rather than pretending every NVIDIA representation is identical: issuer/provider, chain, instrument type, rights, corporate-action treatment, trading availability, liquidity/execution mechanism and eligibility can matter to an agent's decision.

---

## 9. Why Bitget Is Core to the Product

Bitget is not a sponsor badge added after the product is built. The hackathon architecture is centered on Bitget's tokenized-equity and agent infrastructure.

- **Reality / rTokens:** the tokenized U.S. equity exposure used in the first demo.
- **Reality market and fundamental data:** stock identity, market/session context and event/fundamental information.
- **Agent Hub / Agent SDK:** agent-facing trading capabilities for a custom application.
- **UTA:** the execution environment.
- **Demo / paper trading:** safe execution path where supported.
- **Bitget Wallet RWA data:** a way to discover/normalize representations from ecosystems such as Reality, Ondo and xStocks.

---

## 10. Technical Architecture

```
USER
"Protect my NVIDIA through earnings."
↓
EXPOSURE GRAPH
Resolve NVIDIA → user's rNVDA + known external representations
↓
EVENT INTELLIGENCE
Earnings + market/session + relevant market context
↓
AI REASONING
Interpret event and propose bounded protection
↓
MANDATE ENGINE
Deterministic permission, sizing and approval checks
↓
BITGET EXECUTION
Paper order if supported; otherwise explicit dry-run preview
↓
DECISION RECEIPT
Reason → policy → approval → action/refusal → result
```

---

## 11. MVP Scope — Locked

- Connect to Bitget Demo safely.
- Detect/read the user's supported rNVDA exposure.
- Resolve rNVDA to NVIDIA economic exposure.
- Retrieve real NVIDIA earnings/event and relevant market context.
- Allow one intent: PROTECT_EVENT_RISK.
- Allow a simple user mandate with maximum percentage/value and approval requirements.
- Use AI to propose a bounded action or NO ACTION.
- Run deterministic mandate validation.
- Require user approval for the hackathon flow.
- Execute through Bitget paper trading if the rNVDA Demo path is supported; otherwise use a clearly labelled genuine dry-run.
- Generate a polished decision receipt.
- Show known cross-ecosystem NVIDIA representations as intelligence only; do not execute across them.

---

## 12. Explicitly Out of Scope

To protect the deadline and the quality of the 90-second demo, the following are intentionally excluded from the hackathon MVP:

- Cross-chain execution or custom bridging
- A strategy/agent marketplace
- Yield routing and borrowing workflows
- Multiple intent types
- A large multi-agent swarm
- Custom smart contracts unless a later requirement makes one unavoidable
- A custom backtesting engine
- Full autonomous 24/7 production scheduling
- Many equities and many event types
- Extra sponsor integrations that do not strengthen the core loop

---

## 13. The Larger Company Thesis

**Tell your capital what you want it to accomplish.**

Earnings protection is the first application of a broader Tenax system. The long-term product would understand the user's economic exposures, discover the financial operations currently available to those exposures, evaluate conditions and eligibility, apply the user's mandate, and hand execution to existing financial rails.

Future intents could include:

- **Generate yield:** make idle equity exposure productive within defined risk constraints.
- **Raise liquidity without selling:** discover eligible collateral/borrowing paths.
- **Reduce drawdown:** find bounded protection appropriate to the exposure and conditions.
- **Weekend guard:** react to material information when reference markets are closed.
- **Rebalance:** maintain a desired economic exposure rather than blindly moving ticker symbols.

---

## 14. Long-Term Moat

**Exposure Graph.** A normalized but non-lossy understanding of economic exposures and their different representations, rights, providers, chains and execution properties.

**Opportunity Graph.** A current map of what each exposure can do across connected ecosystems: trade, hedge, borrow, lend, enter a vault, provide liquidity, move, rebalance or unwind.

**Outcome data.** A record of what happened when intents were executed under particular mandates and market conditions.

**Refusal data.** A record of opportunities the system considered but rejected — and why. Over time this could become valuable intelligence about why capital does or does not flow into particular products or protocols.

---

## 15. Business Model

The MVP does not need to monetize immediately, but the architecture supports several aligned revenue paths:

- Execution/referral/routing revenue when the product generates useful activity through supported rails.
- Premium automation for users who want richer mandates, more event types and continuous monitoring.
- B2B APIs exposing exposure, opportunity, integrity or intent-resolution capabilities to wallets, exchanges and other agents.
- Capital Modules marketplace later, where third-party developers publish specialized financial intents and the platform participates in module revenue.

---

## 16. Ecosystem Value

The product is designed so value creation is not zero-sum. Bitget gains useful rToken/UTA/Agent Hub activity and stronger retention; external ecosystems can gain transactions, liquidity, borrowing or vault activity when they become eligible destinations; issuers gain utility for tokenized assets; users gain a simpler way to express financial objectives; and the product captures value for generating and safely routing that intent.

---

## 17. The 90-Second Judge Demo

- **0–10 sec:** User connects Bitget Demo. NVIDIA exposure appears.
- **10–20 sec:** The UI expands NVIDIA into known representations, then highlights the user's rNVDA position.
- **20–30 sec:** User says: "Protect this through earnings. Max 25%, max $125."
- **30–45 sec:** Real earnings/market context appears. AI produces a concise assessment and proposed action.
- **45–55 sec:** Mandate Gate visibly evaluates the proposal: PASS or REFUSE.
- **55–70 sec:** User approves a valid proposal. Bitget paper execution or genuine dry-run is triggered.
- **70–85 sec:** Decision Receipt appears, including why the action happened and what alternatives were rejected.
- **85–90 sec:** End on the larger thesis: "One intent. One exposure. Many possible financial rails."

---

## 18. Product Principles

- No custody.
- AI reasons; deterministic code authorizes.
- Recommend → simulate → approve before deeper autonomy.
- Refusal is a valid and visible outcome.
- Never pretend different tokenized representations are economically or legally identical.
- Never fake execution. If paper Reality execution is unavailable, label dry-run clearly.
- Every hackathon feature must improve the judge demo or prove the larger Tenax thesis.

---

## 19. Remaining Feasibility Gate

One execution detail remains to be proven in an owner-side technical spike: whether the specific rNVDA Reality order path is available inside Bitget Demo. The product does not depend on a positive result. If it works, the demo uses real paper execution. If it does not, the demo uses Bitget's supported dry-run request preview and labels it honestly.

The immediate spike sequence is: create a Demo API key locally; authenticate the official SDK against Demo; confirm the rNVDA instrument; attempt the smallest safe Demo Reality order; verify earnings/event retrieval; and verify NVIDIA representation discovery through the RWA data surface.

---

## 20. Positioning

**Your tokenized stocks don't sleep when Wall Street closes. Your agent shouldn't either.**

The hackathon story is not "we built an AI trading bot." It is: we taught an agent to understand what capital represents, what its owner wants, what it is permitted to do, and how to prove why it acted or refused.

Today: protect NVIDIA through earnings.  
Tomorrow: the same engine can help capital work across tokenized financial ecosystems.

---

## 21. Current Decision

Product direction: **locked.** The hackathon wedge is NVIDIA/rNVDA earnings protection. Tenax is the underlying thesis. The Exposure Graph is the foundational abstraction. The public brand name is Tenax, selected before final visual identity, README and submission copy are frozen.
