// Tenax Phase 1A — deterministic Mandate Engine.
//
// Pure function: proposal + mandate -> decision. No LLM, no network, no
// credentials, no Next.js. Independently testable per AGENTS.md invariants.
// Invariant: no execution adapter call is reachable unless the gate is PASS
// and required human approval is present (enforced by callers).

import type {
  Exposure,
  Mandate,
  MandateCheck,
  MandateCheckId,
  MandateDecision,
  ProtectionProposal,
} from "./domain";

const POLICY_VERSION = "tenax-mandate-1a";

function check(
  id: MandateCheckId,
  pass: boolean,
  detail: string,
): MandateCheck {
  return { id, pass, detail };
}

export function evaluateMandate(
  proposal: ProtectionProposal,
  mandate: Mandate,
  exposure?: Exposure,
  evaluatedAt: string = new Date().toISOString(),
): MandateDecision {
  const checks: MandateCheck[] = [
    check(
      "underlying_allowed",
      proposal.underlying === mandate.allowedUnderlying,
      `proposal.underlying=${proposal.underlying} allowed=${mandate.allowedUnderlying}`,
    ),
    check(
      "max_protection_pct",
      proposal.protectionPct <= mandate.maxProtectionPct,
      `${proposal.protectionPct}% <= ${mandate.maxProtectionPct}%`,
    ),
    check(
      "max_trade_value",
      proposal.proposedTradeValueUsdt <= mandate.maxTradeValueUsdt,
      `${proposal.proposedTradeValueUsdt} USDT <= ${mandate.maxTradeValueUsdt} USDT`,
    ),
    check(
      "leverage_disabled",
      mandate.leverageAllowed ? true : proposal.leverageUsed === false,
      `leverageUsed=${proposal.leverageUsed} leverageAllowed=${mandate.leverageAllowed}`,
    ),
    // Approval is a gate acknowledgement, not a bypass: PASS still requires
    // a separate human approval before any execution adapter call.
    check(
      "approval_required",
      true,
      mandate.approvalRequired
        ? "human approval required before any execution adapter call"
        : "approval not required by mandate",
    ),
    check(
      "min_order_amount",
      proposal.proposedTradeValueUsdt >=
        (exposure?.representation.minOrderAmount ?? 10),
      `${proposal.proposedTradeValueUsdt} USDT >= minOrderAmount ${exposure?.representation.minOrderAmount ?? 10} USDT`,
    ),
  ];

  const failedRules = checks.filter((c) => !c.pass).map((c) => c.id);
  const verdict = failedRules.length === 0 ? "PASS" : "REFUSE";

  return {
    verdict,
    pendingHumanApproval:
      verdict === "PASS" && mandate.approvalRequired === true,
    failedRules,
    checks,
    evaluatedAt: `${evaluatedAt} (${POLICY_VERSION})`,
  };
}

export const MANDATE_POLICY_VERSION = POLICY_VERSION;
