// Tenax Phase 4B-B1 — Standing Mandate tests (offline, no network).
//
// Covers: draft inertness, activation hash determinism + immutability,
// expiry/revocation/exhaustion refusals, subject scoping, in-bound
// AUTHORIZED (20%/$100, 30%/$150 boundary), strict REFUSE vs escalation
// ESCALATE on 50%/$250, review-mode never authorizing, forbidden-action
// refusals (spot sale, transfer, leverage change, wrong symbol), execution
// budget enforcement, WAIT non-consumption, human-flow independence,
// store lifecycle + single-active invariant, and secret-free state.
// No order is ever submitted here.
import { beforeEach, describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import {
  __resetStandingMandateCounterForTests,
  activateStandingMandate,
  consumeStandingExecution,
  createStandingMandate,
  evaluateStandingAuthority,
  revokeStandingMandate,
  type StandingAuthorityAction,
  type StandingAuthorityMode,
  type StandingMandate,
} from "../src/lib/tenax/standing-mandate";
import {
  analyzeProtectionIntent,
  approveProtectionProposal,
  consumeStandingMandateExecution,
  createDevStore,
  createProtectionIntent,
  createStandingMandateRecord,
  activateStandingMandateRecord,
  evaluateStandingAuthorityForAction,
  executeProtectionProposal,
  getActiveStandingMandate,
  revokeStandingMandateRecord,
  standingActionFromProposal,
} from "../src/lib/tenax/index";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const NOW = Date.parse("2026-09-21T12:00:00.000Z");
const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

beforeEach(() => {
  __resetStandingMandateCounterForTests();
});

function draft(
  mode: StandingAuthorityMode = "AUTO_WITHIN_MANDATE",
  overrides: Record<string, unknown> = {},
): StandingMandate {
  return createStandingMandate(
    {
      maxProtectionPct: 30,
      maxNotionalUsdt: 150,
      maxLeverage: 1,
      allowedSymbols: ["NVDAUSDT"],
      allowedActionTypes: ["SHORT_HEDGE"],
      authorityMode: mode,
      maxExecutions: 1,
      ...overrides,
    },
    NOW,
  );
}

function active(
  mode: StandingAuthorityMode = "AUTO_WITHIN_MANDATE",
  overrides: Record<string, unknown> = {},
): StandingMandate {
  return activateStandingMandate(draft(mode, overrides), NOW);
}

function action(overrides: Partial<StandingAuthorityAction> = {}): StandingAuthorityAction {
  return {
    subjectId: "NVDA",
    intentType: "PROTECT_EVENT_RISK",
    protectionPct: 20,
    notionalUsdt: 100,
    leverage: 1,
    symbol: "NVDAUSDT",
    actionType: "SHORT_HEDGE",
    requestsSellUnderlying: false,
    requestsTransfer: false,
    requestsLeverageChange: false,
    proposalAtMs: NOW,
    ...overrides,
  };
}

describe("lifecycle", () => {
  it("creates inert drafts with validated bounds", () => {
    const mandate = draft();
    expect(mandate.status).toBe("DRAFT");
    expect(mandate.mandateHash).toBeNull();
    expect(mandate.executionCount).toBe(0);
    expect(mandate.policy.sellUnderlyingAllowed).toBe(false);
    expect(() =>
      createStandingMandate(
        {
          maxProtectionPct: 0,
          maxNotionalUsdt: 150,
          maxLeverage: 1,
          allowedSymbols: ["NVDAUSDT"],
          allowedActionTypes: ["SHORT_HEDGE"],
          authorityMode: "AUTO_WITHIN_MANDATE",
          maxExecutions: 1,
        },
        NOW,
      ),
    ).toThrow(/STANDING_MANDATE_INVALID/);
    expect(() =>
      createStandingMandate(
        {
          maxProtectionPct: 30,
          maxNotionalUsdt: 150,
          maxLeverage: 1,
          allowedSymbols: [],
          allowedActionTypes: ["SHORT_HEDGE"],
          authorityMode: "AUTO_WITHIN_MANDATE",
          maxExecutions: 1,
        },
        NOW,
      ),
    ).toThrow(/STANDING_MANDATE_INVALID/);
    expect(() =>
      createStandingMandate(
        {
          maxProtectionPct: 30,
          maxNotionalUsdt: 150,
          maxLeverage: 1,
          allowedSymbols: ["NVDAUSDT"],
          allowedActionTypes: ["SHORT_HEDGE"],
          authorityMode: "AUTO_WITHIN_MANDATE",
          maxExecutions: 0,
        },
        NOW,
      ),
    ).toThrow(/STANDING_MANDATE_INVALID/);
  });

  it("binds a deterministic hash at activation over id + time + exact policy", () => {
    const first = activateStandingMandate(draft(), NOW);
    expect(first.status).toBe("ACTIVE");
    expect(first.activatedAt).toBe(new Date(NOW).toISOString());
    expect(first.mandateHash).toMatch(/^[0-9a-f]{64}$/);
    __resetStandingMandateCounterForTests();
    const second = activateStandingMandate(draft(), NOW);
    expect(second.mandateHash).toBe(first.mandateHash);
    expect(second.id).toBe(first.id);
    const different = activateStandingMandate(
      draft("AUTO_WITHIN_MANDATE", { maxExecutions: 2 }),
      NOW,
    );
    expect(different.mandateHash).not.toBe(first.mandateHash);
  });

  it("rejects activation of non-drafts and revocation of non-active records", () => {
    expect(() => activateStandingMandate(active(), NOW)).toThrow(/only a DRAFT/);
    expect(() => revokeStandingMandate(draft(), NOW)).toThrow(/only an ACTIVE/);
    const revoked = revokeStandingMandate(active(), NOW);
    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokedAt).toBe(new Date(NOW).toISOString());
    expect(() => revokeStandingMandate(revoked, NOW)).toThrow(/only an ACTIVE/);
  });

  it("enforces the execution budget with EXHAUSTED transition", () => {
    const mandate = activateStandingMandate(draft("AUTO_WITHIN_MANDATE", { maxExecutions: 2 }), NOW);
    const once = consumeStandingExecution(mandate);
    expect(once.executionCount).toBe(1);
    expect(once.status).toBe("ACTIVE");
    const twice = consumeStandingExecution(once);
    expect(twice.executionCount).toBe(2);
    expect(twice.status).toBe("EXHAUSTED");
    expect(() => consumeStandingExecution(twice)).toThrow(/already exhausted/);
  });
});

describe("deterministic evaluation", () => {
  it("refuses draft mandates (creating is not authorizing)", () => {
    const result = evaluateStandingAuthority(draft(), action(), NOW);
    expect(result.decision).toBe("REFUSED");
    expect(result.failedRules).toContain("mandate_draft");
    expect(result.authoritySource).toBe("STANDING_MANDATE");
  });

  it("authorizes 20%/$100 inside 30%/$150", () => {
    const mandate = active();
    const result = evaluateStandingAuthority(mandate, action(), NOW);
    expect(result.decision).toBe("AUTHORIZED");
    expect(result.failedRules).toEqual([]);
    expect(result.reasonCodes).toEqual(["within_standing_authority"]);
    expect(result.mandateHash).toBe(mandate.mandateHash);
  });

  it("authorizes the exact 30%/$150 boundary", () => {
    const result = evaluateStandingAuthority(
      active(),
      action({ protectionPct: 30, notionalUsdt: 150 }),
      NOW,
    );
    expect(result.decision).toBe("AUTHORIZED");
  });

  it("refuses 50%/$250 under AUTO_WITHIN_MANDATE", () => {
    const result = evaluateStandingAuthority(
      active(),
      action({ protectionPct: 50, notionalUsdt: 250 }),
      NOW,
    );
    expect(result.decision).toBe("REFUSED");
    expect(result.failedRules).toContain("exceeds_max_protection_pct");
    expect(result.failedRules).toContain("exceeds_max_notional");
  });

  it("escalates 50%/$250 under AUTO_WITH_ESCALATION", () => {
    const result = evaluateStandingAuthority(
      active("AUTO_WITH_ESCALATION"),
      action({ protectionPct: 50, notionalUsdt: 250 }),
      NOW,
    );
    expect(result.decision).toBe("ESCALATE");
    expect(result.failedRules).toContain("exceeds_max_protection_pct");
  });

  it("never auto-authorizes under REVIEW_EVERY_ACTION", () => {
    const clean = evaluateStandingAuthority(active("REVIEW_EVERY_ACTION"), action(), NOW);
    expect(clean.decision).toBe("ESCALATE");
    expect(clean.reasonCodes).toContain("human_review_required");
    const over = evaluateStandingAuthority(
      active("REVIEW_EVERY_ACTION"),
      action({ protectionPct: 50, notionalUsdt: 250 }),
      NOW,
    );
    expect(over.decision).toBe("ESCALATE");
  });

  it("refuses explicitly forbidden actions in every mode", () => {
    for (const mode of ["AUTO_WITHIN_MANDATE", "AUTO_WITH_ESCALATION", "REVIEW_EVERY_ACTION"] as const) {
      const mandate = active(mode);
      expect(
        evaluateStandingAuthority(mandate, action({ requestsSellUnderlying: true }), NOW).decision,
      ).toBe("REFUSED");
      expect(
        evaluateStandingAuthority(mandate, action({ requestsTransfer: true }), NOW).decision,
      ).toBe("REFUSED");
      expect(
        evaluateStandingAuthority(mandate, action({ requestsLeverageChange: true }), NOW).decision,
      ).toBe("REFUSED");
      expect(
        evaluateStandingAuthority(mandate, action({ symbol: "BTCUSDT" }), NOW).failedRules,
      ).toContain("symbol_not_allowed");
    }
  });

  it("refuses scope mismatches, expiry, revocation, exhaustion, and stale proposals", () => {
    const mandate = active();
    expect(
      evaluateStandingAuthority(mandate, action({ subjectId: "AAPL" }), NOW).failedRules,
    ).toContain("subject_mismatch");
    expect(
      evaluateStandingAuthority(mandate, action({ intentType: "BUY_THE_DIP" }), NOW).failedRules,
    ).toContain("intent_mismatch");
    expect(
      evaluateStandingAuthority(mandate, action({ actionType: "SPOT_BUY" }), NOW).failedRules,
    ).toContain("action_not_allowed");
    expect(
      evaluateStandingAuthority(mandate, action({ leverage: 5 }), NOW).failedRules,
    ).toContain("exceeds_max_leverage");
    const expiring = activateStandingMandate(
      draft("AUTO_WITHIN_MANDATE", { expiresAt: new Date(NOW + 1000).toISOString() }),
      NOW,
    );
    expect(evaluateStandingAuthority(expiring, action(), NOW + 2000).failedRules).toContain(
      "mandate_expired",
    );
    expect(
      evaluateStandingAuthority(revokeStandingMandate(mandate, NOW), action(), NOW).failedRules,
    ).toContain("mandate_revoked");
    const exhausted = { ...mandate, executionCount: 1, status: "EXHAUSTED" as const };
    expect(evaluateStandingAuthority(exhausted, action(), NOW).failedRules).toContain(
      "mandate_exhausted",
    );
    expect(
      evaluateStandingAuthority(mandate, action({ proposalAtMs: NOW - 16 * 60 * 1000 }), NOW)
        .failedRules,
    ).toContain("proposal_stale");
    expect(
      evaluateStandingAuthority(mandate, action({ proposalAtMs: null }), NOW).failedRules,
    ).toContain("proposal_stale");
  });
});

describe("store and service lifecycle", () => {
  it("creates, activates, revokes, and selects the active mandate", () => {
    const store = createDevStore();
    expect(getActiveStandingMandate(store)).toBeNull();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    expect(created.status).toBe("DRAFT");
    expect(store.mandates.get(created.id)).toBe(created);
    const activated = activateStandingMandateRecord(store, { id: created.id }, NOW);
    expect(activated.status).toBe("ACTIVE");
    expect(activated.mandateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(getActiveStandingMandate(store)?.id).toBe(created.id);
    const revoked = revokeStandingMandateRecord(store, { id: created.id }, NOW);
    expect(revoked.status).toBe("REVOKED");
    expect(getActiveStandingMandate(store)).toBeNull();
  });

  it("refuses a second ACTIVE mandate (single-active invariant)", () => {
    const store = createDevStore();
    const first = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: first.id }, NOW);
    const second = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITH_ESCALATION", maxExecutions: 1 },
      NOW,
    );
    expect(() => activateStandingMandateRecord(store, { id: second.id }, NOW)).toThrow(
      /already ACTIVE/,
    );
  });

  it("evaluates proposals without consuming executions", () => {
    const store = createDevStore();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITH_ESCALATION", maxExecutions: 3 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: created.id }, NOW);
    const authorized = evaluateStandingAuthorityForAction(
      store,
      standingActionFromProposal({
        underlying: "NVDA",
        protectionPct: 20,
        tradeValueUsdt: 100,
        leverageUsed: 1,
        proposalAtMs: NOW,
      }),
      NOW,
    );
    expect(authorized?.decision).toBe("AUTHORIZED");
    expect(authorized?.mandateId).toBe(created.id);
    const escalated = evaluateStandingAuthorityForAction(
      store,
      standingActionFromProposal({
        underlying: "NVDA",
        protectionPct: 50,
        tradeValueUsdt: 250,
        leverageUsed: 1,
        proposalAtMs: NOW,
      }),
      NOW,
    );
    expect(escalated?.decision).toBe("ESCALATE");
    expect(store.mandates.get(created.id)?.executionCount).toBe(0);
  });

  it("returns null with no active mandate (human path fallback)", () => {
    const store = createDevStore();
    expect(
      evaluateStandingAuthorityForAction(
        store,
        standingActionFromProposal({
          underlying: "NVDA",
          protectionPct: 20,
          tradeValueUsdt: 100,
          leverageUsed: 1,
          proposalAtMs: NOW,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("consumes executions through the service without touching orders", () => {
    const store = createDevStore();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: created.id }, NOW);
    const consumed = consumeStandingMandateExecution(store, { id: created.id });
    expect(consumed.executionCount).toBe(1);
    expect(consumed.status).toBe("EXHAUSTED");
    expect(getActiveStandingMandate(store)).toBeNull();
  });
});

describe("WAIT non-consumption and human-flow independence", () => {
  async function testSnapshot() {
    return normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
    );
  }

  it("a WAIT-equivalent halted flow leaves standing budget untouched", async () => {
    const store = createDevStore();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: created.id }, NOW);
    // A flow that never reaches approval (no AI PROTECT adopted) cannot
    // consume standing authority; the budget stays intact.
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    expect(store.mandates.get(created.id)?.executionCount).toBe(0);
    expect(getActiveStandingMandate(store)?.id).toBe(created.id);
  });

  it("the human approval flow stays green beside an active mandate", async () => {
    const store = createDevStore();
    const created = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: created.id }, NOW);
    const snapshot = await testSnapshot();
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    const analyzed = analyzeProtectionIntent(store, flowId, snapshot);
    expect(analyzed.mandateVerdict).toBe("PASS");
    const approved = approveProtectionProposal(store, { flowId, actor: "human" });
    expect(approved.state).toBe("APPROVED");
    expect(approved.approval.actor).toBe("human");
    const executed = await executeProtectionProposal(store, { flowId });
    expect(executed.executionMode).toBe("DRY_RUN");
    // Human execution never draws from the standing budget.
    expect(store.mandates.get(created.id)?.executionCount).toBe(0);
  });
});

describe("no secrets serialized", () => {
  it("serializes mandates and evaluations cleanly", () => {
    const mandate = active("AUTO_WITH_ESCALATION");
    const evaluation = evaluateStandingAuthority(mandate, action(), NOW);
    const serialized = JSON.stringify({ mandate, evaluation });
    for (const fragment of [
      "BITGET_API_KEY",
      "BITGET_SECRET_KEY",
      "BITGET_PASSPHRASE",
      "OPENAI_API_KEY",
      "GROQ_API_KEY",
      "Bearer ",
      "ACCESS-SIGN",
      "passphrase",
    ]) {
      expect(serialized).not.toContain(fragment);
    }
    expect(evaluation.authoritySource).toBe("STANDING_MANDATE");
    expect(evaluation.mandateHash).toBe(mandate.mandateHash);
  });
});
