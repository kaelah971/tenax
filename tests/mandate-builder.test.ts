// Tenax Phase 4B-B3 — user-configurable mandate builder tests (offline).
//
// Covers: custom draft creation, draft updates (valid + all rejection
// classes), ACTIVE/EXHAUSTED/REVOKED immutability, hash binding of the
// edited final policy (incl. expiry), new id/hash after exhaustion,
// builder summary copy, dynamic authority wiring, and Tenax-routes-only
// posts. No network, no orders, no provider writes.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetStandingMandateCounterForTests,
  activateStandingMandate,
  hashStandingPolicy,
} from "../src/lib/tenax/standing-mandate";
import {
  activateStandingMandateRecord,
  consumeStandingMandateExecution,
  createDevStore,
  createStandingMandateRecord,
  revokeStandingMandateRecord,
  standingMandateCreateSchema,
  standingMandateUpdateSchema,
  updateStandingMandateDraftRecord,
} from "../src/lib/tenax/index";
import {
  currentAuthorityCopy,
  formatExpiryPreview,
  mandateClassCardValues,
  mandateSummaryPreview,
} from "../src/app/app/_copy";

const NOW = Date.parse("2026-09-21T12:00:00.000Z");
const FUTURE = new Date(NOW + 7 * 24 * 3600 * 1000).toISOString();
const PAST = new Date(NOW - 1000).toISOString();

beforeEach(() => {
  __resetStandingMandateCounterForTests();
});

function customDraft() {
  const store = createDevStore();
  const mandate = createStandingMandateRecord(
    store,
    {
      authorityMode: "AUTO_WITHIN_MANDATE",
      maxProtectionPct: 20,
      maxNotionalUsdt: 100,
      maxExecutions: 3,
      expiresAt: FUTURE,
    },
    NOW,
  );
  return { store, mandate };
}

describe("custom draft creation", () => {
  it("accepts valid user-chosen bounds with fixture leverage pinned", () => {
    const { mandate } = customDraft();
    expect(mandate.status).toBe("DRAFT");
    expect(mandate.policy).toMatchObject({
      subjectId: "NVDA",
      maxProtectionPct: 20,
      maxNotionalUsdt: 100,
      maxLeverage: 1,
      authorityMode: "AUTO_WITHIN_MANDATE",
      maxExecutions: 3,
      allowedSymbols: ["NVDAUSDT"],
      allowedActionTypes: ["SHORT_HEDGE"],
      sellUnderlyingAllowed: false,
      transfersAllowed: false,
      leverageChangesAllowed: false,
    });
    expect(mandate.expiresAt).toBe(FUTURE);
    expect(mandate.mandateHash).toBeNull();
  });

  it("keeps fixture defaults when optional bounds are omitted", () => {
    const store = createDevStore();
    const mandate = createStandingMandateRecord(
      store,
      { authorityMode: "REVIEW_EVERY_ACTION", maxExecutions: 1 },
      NOW,
    );
    expect(mandate.policy.maxProtectionPct).toBe(30);
    expect(mandate.policy.maxNotionalUsdt).toBe(150);
    expect(mandate.policy.maxLeverage).toBe(1);
    expect(mandate.expiresAt).toBeNull();
  });

  it("rejects invalid protection %, notional, counts, expiry, and modes", () => {
    const store = createDevStore();
    const bad: readonly unknown[] = [
      { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 0 },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: -5 },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 101 },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: NaN },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: Infinity },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxNotionalUsdt: 0 },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxNotionalUsdt: -1 },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxNotionalUsdt: NaN },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxNotionalUsdt: Infinity },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 0 },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1.5 },
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: NaN },
      { authorityMode: "AUTO_WITHIN_MANDATE", expiresAt: PAST },
      { authorityMode: "AUTO_WITHIN_MANDATE", expiresAt: "not-a-date" },
      { authorityMode: "SUDO_ANYTHING" },
    ];
    for (const input of bad) {
      expect(() =>
        createStandingMandateRecord(store, input as never, NOW),
      ).toThrow();
    }
  });

  it("rejects scope, leverage, and arbitrary extra fields without clamping", () => {
    const store = createDevStore();
    const hostile: readonly unknown[] = [
      { authorityMode: "AUTO_WITHIN_MANDATE", maxLeverage: 5 },
      { authorityMode: "AUTO_WITHIN_MANDATE", subjectId: "AAPL" },
      { authorityMode: "AUTO_WITHIN_MANDATE", allowedSymbols: ["BTCUSDT"] },
      { authorityMode: "AUTO_WITHIN_MANDATE", allowedActionTypes: ["SPOT_BUY"] },
      { authorityMode: "AUTO_WITHIN_MANDATE", sellUnderlyingAllowed: true },
      { authorityMode: "AUTO_WITHIN_MANDATE", transfersAllowed: true },
      { authorityMode: "AUTO_WITHIN_MANDATE", leverageChangesAllowed: true },
      { authorityMode: "AUTO_WITHIN_MANDATE", admin: true },
    ];
    for (const input of hostile) {
      expect(() =>
        createStandingMandateRecord(store, input as never, NOW),
      ).toThrow();
    }
    expect(store.mandates.size).toBe(0);
  });
});

describe("draft updates", () => {
  it("applies valid edits while preserving id and createdAt", () => {
    const { store, mandate } = customDraft();
    const updated = updateStandingMandateDraftRecord(
      store,
      { id: mandate.id, maxProtectionPct: 25, maxNotionalUsdt: 120 },
      NOW,
    );
    expect(updated.id).toBe(mandate.id);
    expect(updated.createdAt).toBe(mandate.createdAt);
    expect(updated.status).toBe("DRAFT");
    expect(updated.mandateHash).toBeNull();
    expect(updated.policy).toMatchObject({
      maxProtectionPct: 25,
      maxNotionalUsdt: 120,
      maxExecutions: 3,
      authorityMode: "AUTO_WITHIN_MANDATE",
    });
    expect(store.mandates.get(mandate.id)?.policy.maxProtectionPct).toBe(25);
  });

  it("clears expiry back to null and switches mode", () => {
    const { store, mandate } = customDraft();
    const updated = updateStandingMandateDraftRecord(
      store,
      { id: mandate.id, expiresAt: null, authorityMode: "REVIEW_EVERY_ACTION" },
      NOW,
    );
    expect(updated.expiresAt).toBeNull();
    expect(updated.policy.authorityMode).toBe("REVIEW_EVERY_ACTION");
  });

  it("rejects every invalid value class without mutating the draft", () => {
    const { store, mandate } = customDraft();
    const before = JSON.stringify(store.mandates.get(mandate.id));
    const bad: readonly unknown[] = [
      { maxProtectionPct: 0 },
      { maxProtectionPct: 101 },
      { maxProtectionPct: NaN },
      { maxProtectionPct: Infinity },
      { maxNotionalUsdt: -10 },
      { maxNotionalUsdt: NaN },
      { maxNotionalUsdt: Infinity },
      { maxExecutions: 0 },
      { maxExecutions: 2.5 },
      { maxExecutions: 101 },
      { expiresAt: PAST },
      { expiresAt: "tomorrow-ish" },
      { authorityMode: "YOLO" },
      { maxLeverage: 5 },
      { allowedSymbols: ["BTCUSDT"] },
      { subjectId: "AAPL" },
      { sellUnderlyingAllowed: true },
    ];
    for (const patch of bad) {
      expect(() =>
        updateStandingMandateDraftRecord(store, { id: mandate.id, ...(patch as object) }, NOW),
      ).toThrow();
    }
    expect(JSON.stringify(store.mandates.get(mandate.id))).toBe(before);
  });

  it("rejects updates to ACTIVE, EXHAUSTED, and REVOKED mandates", () => {
    const { store, mandate } = customDraft();
    const activated = activateStandingMandateRecord(store, { id: mandate.id }, NOW);
    expect(() =>
      updateStandingMandateDraftRecord(store, { id: mandate.id, maxProtectionPct: 10 }, NOW),
    ).toThrow(/only a DRAFT/);
    expect(store.mandates.get(mandate.id)?.policy.maxProtectionPct).toBe(20);
    void activated;
    revokeStandingMandateRecord(store, { id: mandate.id }, NOW);

    const single = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: single.id }, NOW);
    consumeStandingMandateExecution(store, { id: single.id });
    expect(store.mandates.get(single.id)?.status).toBe("EXHAUSTED");
    expect(() =>
      updateStandingMandateDraftRecord(store, { id: single.id, maxProtectionPct: 10 }, NOW),
    ).toThrow(/only a DRAFT/);

    const doomed = createStandingMandateRecord(
      store,
      { authorityMode: "AUTO_WITHIN_MANDATE", maxExecutions: 1 },
      NOW,
    );
    activateStandingMandateRecord(store, { id: doomed.id }, NOW);
    revokeStandingMandateRecord(store, { id: doomed.id }, NOW);
    expect(store.mandates.get(doomed.id)?.status).toBe("REVOKED");
    expect(() =>
      updateStandingMandateDraftRecord(store, { id: doomed.id, maxProtectionPct: 10 }, NOW),
    ).toThrow(/only a DRAFT/);
  });

  it("rejects unknown ids and unknown schema keys", () => {
    const { store } = customDraft();
    expect(() =>
      updateStandingMandateDraftRecord(store, { id: "smand-9999", maxProtectionPct: 10 }, NOW),
    ).toThrow(/unknown mandate/);
    expect(() =>
      standingMandateUpdateSchema.parse({ id: "smand-0001", maxLeverage: 2 }),
    ).toThrow();
    expect(() =>
      standingMandateCreateSchema.parse({ authorityMode: "AUTO_WITHIN_MANDATE", maxLeverage: 2 }),
    ).toThrow();
  });
});

describe("activation hash binding", () => {
  it("binds the edited final policy including expiry", () => {
    const { store, mandate } = customDraft();
    const edited = updateStandingMandateDraftRecord(
      store,
      { id: mandate.id, maxProtectionPct: 25, expiresAt: FUTURE },
      NOW,
    );
    const activated = activateStandingMandateRecord(store, { id: mandate.id }, NOW);
    expect(activated.mandateHash).toBe(
      hashStandingPolicy({
        id: edited.id,
        activatedAt: activated.activatedAt,
        expiresAt: FUTURE,
        policy: edited.policy,
      }),
    );
  });

  it("produces different hashes for different policies", () => {
    const store = createDevStore();
    const first = activateStandingMandate(
      createStandingMandateRecord(
        store,
        { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 20, maxNotionalUsdt: 100 },
        NOW,
      ),
      NOW,
    );
    const second = activateStandingMandate(
      createStandingMandateRecord(
        store,
        { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 25, maxNotionalUsdt: 100 },
        NOW,
      ),
      NOW,
    );
    expect(second.mandateHash).not.toBe(first.mandateHash);
  });

  it("mints a new id and hash when rebuilding after exhaustion", () => {
    const store = createDevStore();
    const first = activateStandingMandateRecord(
      store,
      {
        id: createStandingMandateRecord(
          store,
          { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 20, maxExecutions: 1 },
          NOW,
        ).id,
      },
      NOW,
    );
    consumeStandingMandateExecution(store, { id: first.id });
    expect(store.mandates.get(first.id)?.status).toBe("EXHAUSTED");
    const second = activateStandingMandateRecord(
      store,
      {
        id: createStandingMandateRecord(
          store,
          { authorityMode: "AUTO_WITHIN_MANDATE", maxProtectionPct: 15, maxExecutions: 1 },
          NOW + 1000,
        ).id,
      },
      NOW + 1000,
    );
    expect(second.id).not.toBe(first.id);
    expect(second.mandateHash).not.toBe(first.mandateHash);
    expect(second.status).toBe("ACTIVE");
  });
});

describe("builder summary copy", () => {
  it("states bounds, leverage, executions, and expiry plainly", () => {
    const lines = mandateSummaryPreview({
      maxProtectionPct: 20,
      maxNotionalUsdt: 100,
      maxExecutions: 1,
      expiresAt: null,
      authorityMode: "AUTO_WITHIN_MANDATE",
    });
    expect(lines.join(" ")).toMatch(/up to 20%.*\$100.*1x leverage.*1 execution/);
    expect(lines.join(" ")).toMatch(/no expiry/i);
  });

  it("requires approval under REVIEW and waives it within AUTO bounds", () => {
    const review = mandateSummaryPreview({
      maxProtectionPct: 20,
      maxNotionalUsdt: 100,
      maxExecutions: 2,
      expiresAt: null,
      authorityMode: "REVIEW_EVERY_ACTION",
    });
    expect(review.join(" ")).toMatch(/every action still requires human approval/i);
    const auto = mandateSummaryPreview({
      maxProtectionPct: 20,
      maxNotionalUsdt: 100,
      maxExecutions: 2,
      expiresAt: null,
      authorityMode: "AUTO_WITH_ESCALATION",
    });
    expect(auto.join(" ")).toMatch(/do not require per-trade approval/i);
  });

  it("shows expiry readably with the raw timestamp", () => {
    expect(formatExpiryPreview(null)).toMatch(/no expiry/i);
    const rendered = formatExpiryPreview(FUTURE);
    expect(rendered).toContain(FUTURE);
    expect(rendered).toMatch(/GMT/);
  });
});

describe("post-activation summary truth", () => {
  it("reflects a custom ACTIVE 15%/$60 policy with locked class facts", () => {
    const rows = mandateClassCardValues({ maxProtectionPct: 15, maxNotionalUsdt: 60 });
    expect(rows).toContainEqual(["MAX PROTECTION", "15%"]);
    expect(rows).toContainEqual(["MAX ACTION", "$60"]);
    expect(rows).toContainEqual(["MAX LEVERAGE", "1X"]);
    expect(rows).toContainEqual(["ALLOWED", "NVDAUSDT"]);
    expect(rows).toContainEqual(["SELL UNDERLYING", "NEVER"]);
    expect(rows).toContainEqual(["TRANSFERS", "NEVER"]);
    expect(rows).toContainEqual(["LEVERAGE CHANGES", "NEVER"]);
    const values = rows.map(([, value]) => value).join(" ");
    expect(values).not.toContain("30%");
    expect(values).not.toContain("$150");
  });

  it("shows honest placeholders with no ACTIVE mandate", () => {
    const rows = mandateClassCardValues(null);
    expect(rows).toContainEqual(["MAX PROTECTION", "—"]);
    expect(rows).toContainEqual(["MAX ACTION", "—"]);
    expect(rows).toContainEqual(["ALLOWED", "NVDAUSDT"]);
  });

  it("words authority per active mode without generic approval claims", () => {
    const review = currentAuthorityCopy({
      hasActiveMandate: true,
      hasExhaustedMandate: false,
      authorityMode: "REVIEW_EVERY_ACTION",
    });
    expect(review.value).toBe("REQUIRED FOR EVERY ACTION");
    expect(review.note ?? "").toMatch(/human approval/i);

    const escalation = currentAuthorityCopy({
      hasActiveMandate: true,
      hasExhaustedMandate: false,
      authorityMode: "AUTO_WITH_ESCALATION",
    });
    expect(escalation.value).toBe("AUTOMATIC WITHIN BOUNDS");
    expect(escalation.note ?? "").toMatch(/outside bounds/i);
    expect(`${escalation.term} ${escalation.value}`).not.toMatch(/human approval required/i);

    const auto = currentAuthorityCopy({
      hasActiveMandate: true,
      hasExhaustedMandate: false,
      authorityMode: "AUTO_WITHIN_MANDATE",
    });
    expect(auto.value).toBe("NOT REQUIRED WITHIN BOUNDS");
  });

  it("sources the class card from the stored ACTIVE policy", () => {
    const pageSource = readFileSync(
      new URL("../src/app/app/mandate/page.tsx", import.meta.url),
      "utf8",
    );
    expect(pageSource).toContain("mandateClassCardValues(");
    expect(pageSource).toContain("activeMandate?.policy.authorityMode");
    expect(pageSource).toContain("activeMandate?.policy.maxProtectionPct");
    expect(pageSource).toContain("activeMandate?.policy.maxNotionalUsdt");
    expect(pageSource).not.toContain('["MAX PROTECTION", "30%"]');
    expect(pageSource).not.toContain('["MAX ACTION", "$150"]');
    expect(pageSource).not.toContain("fetch(");
  });

  it("narrates the ACTIVE policy live instead of the static fixture summary", () => {
    const pageSource = readFileSync(
      new URL("../src/app/app/mandate/page.tsx", import.meta.url),
      "utf8",
    );
    expect(pageSource).toContain("mandateSummaryPreview({");
    expect(pageSource).toContain("activeMandate.policy.maxExecutions");
  });
});

describe("builder surface truth", () => {
  const panelSource = readFileSync(
    new URL("../src/app/app/mandate/MandatePanel.tsx", import.meta.url),
    "utf8",
  );
  const mandateSource = readFileSync(
    new URL("../src/app/app/mandate/page.tsx", import.meta.url),
    "utf8",
  );
  const routeSource = readFileSync(
    new URL("../src/app/api/mandate/update-draft/route.ts", import.meta.url),
    "utf8",
  );

  it("renders the builder with locked leverage and review/activate flow", () => {
    expect(panelSource).toContain("Define what Tenax is allowed to do.");
    expect(panelSource).toContain("1X · LOCKED");
    expect(panelSource).toContain("EDIT DRAFT");
    expect(panelSource).toContain("ACTIVATE STANDING MANDATE");
    expect(panelSource).toContain("ACTIVATION LOCKS THESE PERMISSIONS AND BINDS THE MANDATE HASH");
    expect(panelSource).toContain("/api/mandate/update-draft");
  });

  it("drives the authority card from the active policy, not fixtures", () => {
    expect(mandateSource).toContain("activeMandate?.policy.maxProtectionPct");
    expect(mandateSource).toContain("activeMandate?.policy.maxNotionalUsdt");
    expect(mandateSource).toContain("USER DEFINED");
  });

  it("keeps draft writes on Tenax routes with validation", () => {
    expect(routeSource).toContain("updateStandingMandateDraftRecord");
    expect(routeSource).toContain("standingMandateUpdateSchema");
    expect(routeSource).not.toMatch(/bitget/i);
    expect(routeSource).not.toContain("place-order");
    expect(panelSource).not.toMatch(/bitget/i);
    expect(panelSource).not.toContain("place-order");
  });
});
