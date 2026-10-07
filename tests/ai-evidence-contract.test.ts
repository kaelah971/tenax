// Tenax evidence-contract fix — focused offline tests (fake client only).
//
// Proves: SIMULATED_PAPER is valid scenario context (never live ownership,
// never a failed verification claim); Demo account state enters the pack
// safely with DEMO provenance; funding context carries provenance and
// freshness; unavailable events stay unavailable with source provenance
// preserved when present; fixture mode stays distinct; the model cannot
// set authority/order fields; no provider writes occur. No live calls.
import { describe, expect, it } from "vitest";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import { buildDemoAccountEvidence } from "../src/lib/ai/demo-account";
import type { DemoAccountEvidence } from "../src/lib/ai/evidence-pack";
import {
  buildEvidencePack,
  serializeEvidencePack,
  type TrustedNvidiaEvent,
} from "../src/lib/ai/evidence-pack";
import { aiModelPayloadSchema } from "../src/lib/ai/schemas";
import { buildAiSystemPrompt } from "../src/lib/ai/provider";
import { fetchTrustedNvidiaEvent } from "../src/lib/intelligence/nvidia-events";
import { runAiAnalysis } from "../src/lib/ai/pipeline";
import {
  MANDATE_FIXTURE,
  NVDA_EXPOSURE_FIXTURE,
} from "../src/lib/tenax/fixtures";
import { analyzeProtectionFixture } from "../src/lib/tenax/analysis";
import { createProtectEventRiskIntent } from "../src/lib/tenax/intent";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const TEST_CONFIG = {
  provider: "groq" as const,
  model: "test-model",
  apiKey: "test-key-never-logged",
  baseUrl: "https://ai.example.invalid/v1",
};

async function testSnapshot() {
  return normalizeNvidiaSnapshot(
    await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
  );
}

function testIntent() {
  return createProtectEventRiskIntent(NVDA_EXPOSURE_FIXTURE, RAW_TEXT);
}

const STUB_DEMO_ACCOUNT: DemoAccountEvidence = buildDemoAccountEvidence({
  position: "NONE",
  positionSide: null,
  positionSize: null,
  positionLeverage: null,
  pendingOrders: "NONE",
  marginMode: "crossed",
  holdMode: "hedge_mode",
  configuredLeverage: "1",
  observedAt: "2026-10-06T22:00:00.000Z",
});

const STUB_EVENT: TrustedNvidiaEvent = {
  eventType: "EARNINGS",
  eventDate: "2026-11-18",
  status: "VERIFIED",
  source: "test:verified-calendar",
  retrievedAt: "2026-10-06T22:00:00.000Z",
  meta: { source: "test:verified-calendar", provenance: "REAL" },
};

describe("simulated-paper exposure contract", () => {
  it("represents the canonical exposure as SIMULATED_PAPER with no ownership claim", async () => {
    const pack = buildEvidencePack({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: testIntent(),
      snapshot: await testSnapshot(),
      futuresTicker: null,
      candles: null,
      nvdax: null,
      instrument: null,
    });
    expect(pack.exposure.exposureMode).toBe("SIMULATED_PAPER");
    expect(pack.exposure.ownedAssetClaim).toBe("NONE");
    expect(pack.exposure.liveOwnership).toBe(false);
    expect(pack.exposure.provenance).toBe("SIMULATED");
    const serialized = serializeEvidencePack(pack);
    expect(serialized).toContain("SIMULATED_PAPER");
    for (const claim of ["LIVE_VERIFIED", "owned:true", "\"owned\":true", "live holdings", "owns NVDA"]) {
      expect(serialized).not.toContain(claim);
    }
  });

  it("teaches the model that SIMULATED_PAPER is a valid scenario, not a verification failure", () => {
    const prompt = buildAiSystemPrompt();
    expect(prompt).toMatch(/SIMULATED_PAPER/);
    expect(prompt).toMatch(/intentional paper-trading scenario/);
    expect(prompt).toMatch(/never a failed ownership verification/i);
    expect(prompt).toMatch(/does NOT mean the user owns|Do NOT claim the user owns/);
  });
});

describe("demo account evidence", () => {
  it("enters the pack with DEMO provenance and flips capability to PROBED", async () => {
    const pack = buildEvidencePack({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: testIntent(),
      snapshot: await testSnapshot(),
      futuresTicker: null,
      candles: null,
      nvdax: null,
      instrument: null,
      demoAccount: STUB_DEMO_ACCOUNT,
    });
    expect(pack.demoAccount).toMatchObject({
      position: "NONE",
      pendingOrders: "NONE",
      marginMode: "crossed",
      holdMode: "hedge_mode",
      configuredLeverage: "1",
      observedAt: "2026-10-06T22:00:00.000Z",
    });
    expect(pack.demoAccount?.meta).toMatchObject({
      source: "bitget:demo-private",
      provenance: "DEMO",
    });
    expect(pack.protectionInstrument).toBeNull();
    const serialized = serializeEvidencePack(pack);
    for (const secret of ["apiKey", "secretKey", "passphrase", "ACCESS-SIGN", "Bearer "]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("stays UNKNOWN (not empty) when not probed", async () => {
    const pack = buildEvidencePack({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: testIntent(),
      snapshot: await testSnapshot(),
      futuresTicker: null,
      candles: null,
      nvdax: null,
      instrument: null,
    });
    expect(pack.demoAccount).toBeNull();
    expect(buildAiSystemPrompt()).toMatch(/null demoAccount means account state unknown/);
  });

  it("carries no mandate ceilings through the account group", async () => {
    const pack = buildEvidencePack({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: testIntent(),
      snapshot: await testSnapshot(),
      futuresTicker: null,
      candles: null,
      nvdax: null,
      instrument: null,
      demoAccount: STUB_DEMO_ACCOUNT,
    });
    const serialized = serializeEvidencePack(pack);
    for (const ceiling of ["maxProtectionPct", "maxTradeValueUsdt", "maxLeverage", "30%", "$150"]) {
      expect(serialized).not.toContain(ceiling);
    }
  });
});

describe("funding context and event evidence", () => {
  it("funding context carries REAL provenance and an observation timestamp", async () => {
    const snapshot = await testSnapshot();
    const pack = buildEvidencePack({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: testIntent(),
      snapshot,
      futuresTicker: null,
      candles: null,
      nvdax: null,
      instrument: null,
    });
    expect(pack.liveMarket.meta).toMatchObject({ source: "bitget:public", provenance: "REAL" });
    expect(pack.liveMarket.observedAt).toBe(snapshot.fetchedAt);
  });

  it("unavailable events stay unavailable with no fabricated date", async () => {
    expect(await fetchTrustedNvidiaEvent()).toBeNull();
    const pack = buildEvidencePack({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: testIntent(),
      snapshot: await testSnapshot(),
      futuresTicker: null,
      candles: null,
      nvdax: null,
      instrument: null,
    });
    expect(pack.nvidiaEvent).toBeNull();
    expect(pack.intent.earningsDate).toBeNull();
    expect(buildAiSystemPrompt()).toMatch(/null nvidiaEvent means no trusted event exists/);
  });

  it("preserves real event source provenance when a verified event exists", async () => {
    const pack = buildEvidencePack({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: testIntent(),
      snapshot: await testSnapshot(),
      futuresTicker: null,
      candles: null,
      nvdax: null,
      instrument: null,
      nvidiaEvent: STUB_EVENT,
    });
    expect(pack.nvidiaEvent).toMatchObject({
      eventType: "EARNINGS",
      eventDate: "2026-11-18",
      status: "VERIFIED",
      source: "test:verified-calendar",
      retrievedAt: "2026-10-06T22:00:00.000Z",
    });
    expect(pack.nvidiaEvent?.meta).toMatchObject({
      source: "test:verified-calendar",
      provenance: "REAL",
    });
  });
});

describe("decision-semantics guardrails", () => {
  it("keeps fixture analysis distinct from model analysis", async () => {
    const snapshot = await testSnapshot();
    const fixture = analyzeProtectionFixture(
      NVDA_EXPOSURE_FIXTURE,
      testIntent(),
      MANDATE_FIXTURE,
      snapshot,
    );
    expect(fixture.reasoning.kind).toBe("development-fixture");
  });

  it("rejects model output carrying authority or order fields", () => {
    const hostile = {
      subjectId: "NVDA",
      decision: "PROTECT",
      recommendedProtectionPct: 20,
      rationale: "Bounded.",
      keyDrivers: ["d"],
      risks: ["r"],
      missingEvidence: [],
      evidenceRefs: [],
      symbol: "NVDAUSDT",
      side: "sell",
      qty: "0.41",
      leverage: 1,
      mandateVerdict: "PASS",
      provider: "groq",
    };
    expect(aiModelPayloadSchema.safeParse(hostile).success).toBe(false);
  });

  it("runs the full pipeline with new evidence and makes zero provider writes", async () => {
    const network: string[] = [];
    const result = await runAiAnalysis({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: testIntent(),
      mandate: MANDATE_FIXTURE,
      snapshot: await testSnapshot(),
      market: {
        futuresTicker: null,
        candles: null,
        nvdax: null,
        instrument: null,
        demoAccount: STUB_DEMO_ACCOUNT,
        nvidiaEvent: null,
      },
      config: TEST_CONFIG,
      fetchImpl: async (url, init) => {
        network.push(`${init.method} ${url}`);
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      subjectId: "NVDA",
                      decision: "WAIT",
                      recommendedProtectionPct: null,
                      rationale: "Paper scenario noted; event timing unknown.",
                      keyDrivers: ["No trusted event date."],
                      risks: ["Overnight gap risk."],
                      missingEvidence: ["Verified earnings date."],
                      evidenceRefs: ["tenax:fixture"],
                    }),
                  },
                },
              ],
            }),
        };
      },
    });
    if (!result.ok) throw new Error("expected ok pipeline");
    expect(result.audit.decision).toBe("WAIT");
    expect(result.proposal).toBeNull();
    expect(result.pack.exposure.exposureMode).toBe("SIMULATED_PAPER");
    expect(result.pack.demoAccount?.position).toBe("NONE");
    expect(result.pack.nvidiaEvent).toBeNull();
    // Exactly one model call; no Bitget (or other provider) touch.
    expect(network).toHaveLength(1);
    expect(network[0]).toContain("ai.example.invalid");
    expect(network.join(" ")).not.toMatch(/bitget/i);
  });
});
