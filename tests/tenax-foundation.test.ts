// Tenax Phase 1A — focused foundation tests (no Next.js, no network).
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXECUTION_MODE,
  DEMO_UNAVAILABLE_REASON,
  MANDATE_FIXTURE,
  NVDA_EXPOSURE_FIXTURE,
  PROPOSAL_PASS_FIXTURE,
  PROPOSAL_REFUSE_ASSET_FIXTURE,
  PROPOSAL_REFUSE_PCT_FIXTURE,
  PROPOSAL_REFUSE_VALUE_FIXTURE,
  buildDecisionReceipt,
  createProtectEventRiskIntent,
  dryRunAdapter,
  evaluateMandate,
  exposureSchema,
  getExecutionAdapter,
  mandateSchema,
} from "../src/lib/tenax/index";

describe("mandate engine", () => {
  it("PASS boundary: 20% / 100 USDT within 30% / 150 USDT", () => {
    const d = evaluateMandate(
      PROPOSAL_PASS_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
      "2026-09-18T00:00:00.000Z",
    );
    expect(d.verdict).toBe("PASS");
    expect(d.failedRules).toEqual([]);
    expect(d.pendingHumanApproval).toBe(true);
  });

  it("REFUSE when trade value exceeds max (200 > 150)", () => {
    const d = evaluateMandate(
      PROPOSAL_REFUSE_VALUE_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    expect(d.verdict).toBe("REFUSE");
    expect(d.failedRules).toContain("max_trade_value");
  });

  it("REFUSE when hedge pct exceeds max (40% > 30%)", () => {
    const d = evaluateMandate(
      PROPOSAL_REFUSE_PCT_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    expect(d.verdict).toBe("REFUSE");
    expect(d.failedRules).toContain("max_protection_pct");
  });

  it("REFUSE for disallowed underlying", () => {
    const d = evaluateMandate(
      PROPOSAL_REFUSE_ASSET_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    expect(d.verdict).toBe("REFUSE");
    expect(d.failedRules).toContain("underlying_allowed");
  });

  it("returns structured reason codes, not prose-only", () => {
    const d = evaluateMandate(
      PROPOSAL_PASS_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    expect(d.checks.length).toBeGreaterThan(0);
    for (const c of d.checks) {
      expect(typeof c.id).toBe("string");
      expect(typeof c.pass).toBe("boolean");
      expect(typeof c.detail).toBe("string");
    }
  });

  it("approval-required semantics: PASS stays pending until approval", () => {
    const required = evaluateMandate(
      PROPOSAL_PASS_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    expect(required.verdict).toBe("PASS");
    expect(required.pendingHumanApproval).toBe(true);

    const optional = evaluateMandate(
      PROPOSAL_PASS_FIXTURE,
      { ...MANDATE_FIXTURE, approvalRequired: false },
      NVDA_EXPOSURE_FIXTURE,
    );
    expect(optional.verdict).toBe("PASS");
    expect(optional.pendingHumanApproval).toBe(false);
  });
});

describe("exposure fixture + intent", () => {
  it("NVDA/RNVDAUSDT fixture carries verified Phase 0A facts", () => {
    expect(NVDA_EXPOSURE_FIXTURE.underlying).toBe("NVDA");
    expect(NVDA_EXPOSURE_FIXTURE.representation.symbol).toBe("RNVDAUSDT");
    expect(NVDA_EXPOSURE_FIXTURE.representation.status).toBe("online");
    expect(NVDA_EXPOSURE_FIXTURE.representation.isReality).toBe(true);
    expect(NVDA_EXPOSURE_FIXTURE.representation.minOrderAmount).toBe(10);
    expect(NVDA_EXPOSURE_FIXTURE.representation.minOrderQty).toBe(0.0001);
    expect(NVDA_EXPOSURE_FIXTURE.exposureValueUsdt).toBe(500);
    expect(NVDA_EXPOSURE_FIXTURE.valueSource).toBe("fixture");
    expect(exposureSchema.parse(NVDA_EXPOSURE_FIXTURE)).toBeTruthy();
    expect(mandateSchema.parse(MANDATE_FIXTURE)).toBeTruthy();
  });

  it("creates only PROTECT_EVENT_RISK deterministically", () => {
    const intent = createProtectEventRiskIntent(
      NVDA_EXPOSURE_FIXTURE,
      "Protect my NVIDIA through earnings, but don't hedge more than 30%.",
      null,
      "2026-09-18T00:00:00.000Z",
    );
    expect(intent.type).toBe("PROTECT_EVENT_RISK");
    expect(intent.exposureId).toBe(NVDA_EXPOSURE_FIXTURE.id);
    expect(intent.rawText).toContain("NVIDIA");
  });
});

describe("execution adapter boundary", () => {
  it("defaults to DRY_RUN and keeps DEMO gated", () => {
    expect(DEFAULT_EXECUTION_MODE).toBe("DRY_RUN");
    expect(getExecutionAdapter("DRY_RUN").mode).toBe("DRY_RUN");
    expect(getExecutionAdapter("BITGET_DEMO").mode).toBe("BITGET_DEMO");
  });

  it("DRY_RUN constructs would-be request and never moves funds", () => {
    const request = dryRunAdapter.previewProtection({ qty: "0.4513" });
    expect(request.mode).toBe("DRY_RUN");
    expect(request.symbol).toBe("RNVDAUSDT");
    expect(request.operationId).toBe("placeOrder");
    expect(request.kind).toContain("NOT submitted");

    const result = dryRunAdapter.executeProtection({ qty: "0.4513" });
    expect(result.mode).toBe("DRY_RUN");
    expect(result.submitted).toBe(false);
    expect(result.fundsMoved).toBe(false);
    expect(result.disclaimer).toBe("DRY_RUN — NO FUNDS MOVED");
    expect("orderId" in result).toBe(false);
  });

  it("BITGET_DEMO is unavailable until the authenticated spike", () => {
    expect(() =>
      getExecutionAdapter("BITGET_DEMO").previewProtection({ qty: "1" }),
    ).toThrow(DEMO_UNAVAILABLE_REASON);
    expect(getExecutionAdapter("BITGET_DEMO").executeProtection({ qty: "1" }))
      .toBe(DEMO_UNAVAILABLE_REASON);
  });
});

describe("decision receipt", () => {
  it("snapshots the example PASS chain with the 200 USDT REFUSE alternative", () => {
    const decision = evaluateMandate(
      PROPOSAL_PASS_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    const refuse = evaluateMandate(
      PROPOSAL_REFUSE_VALUE_FIXTURE,
      MANDATE_FIXTURE,
      NVDA_EXPOSURE_FIXTURE,
    );
    const intent = createProtectEventRiskIntent(
      NVDA_EXPOSURE_FIXTURE,
      "Protect my NVIDIA through earnings, but don't hedge more than 30%.",
    );
    const request = dryRunAdapter.previewProtection({ qty: "0.4513" });
    const receipt = buildDecisionReceipt({
      receiptId: "TENAX-1A-EXAMPLE-001",
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent,
      proposal: PROPOSAL_PASS_FIXTURE,
      mandateResult: decision.verdict,
      mandateChecks: decision.checks,
      approval: "REQUIRED",
      request,
      rejectedAlternatives: [
        {
          proposedTradeValueUsdt: 200,
          protectionPct: 40,
          mandateResult: refuse.verdict,
          failedRules: refuse.failedRules,
          reason: "Exceeds mandate maxTradeValue 150 USDT",
        },
      ],
      evidenceRefs: ["docs/spike-result.md Phase 0A owner-network rerun"],
      timestamp: "2026-09-18T00:00:00.000Z",
    });

    expect(receipt.underlying).toBe("NVDA");
    expect(receipt.representation).toBe("RNVDAUSDT");
    expect(receipt.exposureValueUsdt).toBe(500);
    expect(receipt.intent).toBe("PROTECT_EVENT_RISK");
    expect(receipt.proposedProtectionPct).toBe(20);
    expect(receipt.proposedTradeValueUsdt).toBe(100);
    expect(receipt.mandateResult).toBe("PASS");
    expect(receipt.approval).toBe("REQUIRED");
    expect(receipt.executionMode).toBe("DRY_RUN");
    expect(receipt.fundsMoved).toBe(false);
    expect(receipt.rejectedAlternatives[0]?.mandateResult).toBe("REFUSE");
    expect("transactionHash" in receipt).toBe(false);
  });
});
