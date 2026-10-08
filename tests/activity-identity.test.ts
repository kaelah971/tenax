// Activity identity regressions: globally unique event IDs.
//
// Reproduces the production failure where two serverless cold starts both
// minted act-0001, so the second process's proof/run INSERTs lost to
// unrelated historical rows on UNIQUE(source_activity_event_id) while the
// API still reported success. Proves: fresh processes never mint the same
// ID; both processes' proof+run persist with correct linkage; same-flow
// retries stay idempotent. Fully offline, injected memory repos.
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetActivityCounterForTests,
  createActivityId,
  emitActivityEvent,
} from "../src/lib/tenax/activity";
import { createDevStore } from "../src/lib/tenax/index";
import {
  InMemoryPaperTradingRunRepository,
} from "../src/lib/tenax/paper-trading-run-repository";
import { InMemoryProofRepository } from "../src/lib/proof/repository";
import { recordJudgeProof } from "../src/lib/proof/seam";
import { persistPaperTradingRun } from "../src/lib/tenax/paper-trading-run-service";

const NOW = Date.parse("2026-10-08T09:00:00.000Z");
const ID_PATTERN = /^act-[0-9a-z-]{1,60}$/;

function refusalDetails() {
  return {
    mandateId: null,
    proposedPct: 40,
    proposedUsd: 200,
    maxPct: 30,
    maxNotional: 150,
    reasonCodes: ["max_protection_pct", "max_trade_value"],
    outcome: "POLICY_REFUSED",
  } as const;
}

describe("createActivityId", () => {
  it("mints short secret-free URL-safe ids that never repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const id = createActivityId(NOW);
      expect(id).toMatch(ID_PATTERN);
      expect(id.length).toBeLessThanOrEqual(64);
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("never collides with historical act-NNNN rows", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(createActivityId(NOW)).not.toBe("act-0001");
    }
  });
});

describe("cold-start identity collision (production repro)", () => {
  beforeEach(() => {
    __resetActivityCounterForTests();
  });

  async function coldProcessRun(flowId: string) {
    // A fresh serverless process: brand-new store AND reset counter.
    __resetActivityCounterForTests();
    const store = createDevStore();
    const proofRepo = new InMemoryProofRepository();
    const runRepo = new InMemoryPaperTradingRunRepository();
    const event = emitActivityEvent(
      store,
      {
        type: "DETERMINISTIC_POLICY_REFUSED",
        flowId,
        summary: "Deterministic mandate refused 40% / $200 — no order sent",
        details: { ...refusalDetails() },
      },
      NOW,
    );
    const proof = await recordJudgeProof(store, event, proofRepo);
    const run = await persistPaperTradingRun({ store, event, proof, repository: runRepo, nowMs: NOW });
    return { store, proofRepo, runRepo, event, proof, run };
  }

  it("two cold processes mint distinct ids and both persist with correct links", async () => {
    const first = await coldProcessRun("flow-cold-A");
    const second = await coldProcessRun("flow-cold-B");

    // Distinct global identity despite identical counters and clocks.
    expect(first.event.id).not.toBe(second.event.id);
    expect(first.event.id).toMatch(ID_PATTERN);
    expect(second.event.id).toMatch(ID_PATTERN);

    // Neither loses to the other: both runs retrievable with own links,
    // and each proof belongs to its own process's event (never cross-wired).
    expect(first.run?.sourceActivityEventId).toBe(first.event.id);
    expect(second.run?.sourceActivityEventId).toBe(second.event.id);
    expect(first.proof?.sourceActivityEventId).toBe(first.event.id);
    expect(second.proof?.sourceActivityEventId).toBe(second.event.id);
    expect(first.run?.sourceProofId).toBe(first.proof?.id ?? null);
    expect(second.run?.sourceProofId).toBe(second.proof?.id ?? null);
    expect(first.proof?.id).not.toBe(second.proof?.id);
    expect(first.run?.runId).not.toBe(second.run?.runId);

    const rereadA = await first.runRepo.getRun(first.run?.runId ?? "");
    expect(rereadA?.sourceProofId).toBe(first.proof?.id ?? null);
    const rereadB = await second.runRepo.getRun(second.run?.runId ?? "");
    expect(rereadB?.sourceProofId).toBe(second.proof?.id ?? null);
  });

  it("same-flow retries stay idempotent and keep the original linkage", async () => {
    const first = await coldProcessRun("flow-retry");
    const again = await persistPaperTradingRun({
      store: first.store,
      event: first.event,
      proof: first.proof,
      repository: first.runRepo,
      nowMs: NOW,
    });
    expect(again?.runId).toBe(first.run?.runId);
    expect(again?.sourceActivityEventId).toBe(first.event.id);
    expect(again?.sourceProofId).toBe(first.proof?.id ?? null);
    expect(await first.runRepo.listRuns()).toHaveLength(1);
  });
});
