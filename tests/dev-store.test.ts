// Tenax bugfix regression — shared development flow state.
//
// Reproduces the reported blocker at the storage boundary: an analyze POST
// writes a flow, then the analysis page reads it back. Before the fix the
// route used a module-level singleton that Turbopack dev can evaluate once
// per chunk realm, so writer and reader observed different (empty) stores
// and /app/analysis/<id> 404'd. The canonical getTenaxDevStore() accessor
// is process-wide via globalThis; these tests pin that contract.
// Network-free: snapshots come from injected stub fixtures.
import { describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import {
  analyzeProtectionIntent,
  approveProtectionProposal,
  createProtectionIntent,
  executeProtectionProposal,
  getDecisionReceipt,
  getTenaxDevStore,
  hashProposal,
} from "../src/lib/tenax/index";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

async function stubSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

describe("canonical dev store", () => {
  it("returns the identical instance to every caller in this process", () => {
    expect(getTenaxDevStore()).toBe(getTenaxDevStore());
  });

  it("survives module re-evaluation, as separate Turbopack chunk realms do", async () => {
    const { flowId } = createProtectionIntent(getTenaxDevStore(), { rawText: RAW_TEXT });
    const fresh = (await import(
      /* @vite-ignore */ `../src/lib/tenax/dev-store.ts?t=${Date.now()}`
    )) as typeof import("../src/lib/tenax/dev-store");
    expect(fresh.getTenaxDevStore()).toBe(getTenaxDevStore());
    expect(fresh.getTenaxDevStore().flows.has(flowId)).toBe(true);
  });

  it("resolves a created flow on read-back with its analysis intact", async () => {
    const snapshot = await stubSnapshot();
    const { flowId } = createProtectionIntent(getTenaxDevStore(), { rawText: RAW_TEXT });
    analyzeProtectionIntent(getTenaxDevStore(), flowId, snapshot);
    const reread = getTenaxDevStore().flows.get(flowId);
    expect(reread).toBeDefined();
    expect(reread?.getContext().analysis).not.toBeNull();
    expect(reread?.getFlowState()).toBe("MANDATE_PASS");
  });

  it("keeps unknown IDs missing instead of fabricating state", () => {
    expect(getTenaxDevStore().flows.get("flow-9999")).toBeUndefined();
    expect(() => getDecisionReceipt(getTenaxDevStore(), "flow-9999")).toThrow(/unknown flowId/);
  });

  it("serves approval, execution, and receipt from the same flow instance", async () => {
    const snapshot = await stubSnapshot();
    const { flowId } = createProtectionIntent(getTenaxDevStore(), { rawText: RAW_TEXT });
    analyzeProtectionIntent(getTenaxDevStore(), flowId, snapshot);
    const { approval } = approveProtectionProposal(getTenaxDevStore(), {
      flowId,
      actor: "human",
    });
    const reread = getTenaxDevStore().flows.get(flowId);
    expect(reread).toBe(getTenaxDevStore().flows.get(flowId));
    const analysis = reread?.getContext().analysis;
    if (!analysis) throw new Error("test setup failed: no analysis");
    expect(approval.proposalHash).toBe(hashProposal(analysis.proposal));
    const executed = await executeProtectionProposal(getTenaxDevStore(), { flowId });
    expect(executed.state).toBe("COMPLETED");
    const { receipt } = getDecisionReceipt(getTenaxDevStore(), flowId);
    expect(receipt.receiptId).toContain(flowId);
    expect(receipt.mandateResult).toBe("PASS");
  });
});
