// Tenax Phase 4B-B2.3 — live decision cockpit UI contracts (offline).
//
// Pins the B2.3 UX without rendering: instrument roles (NVDAUSDT =
// protection, rNVDA = exposure reference), live-surface projection math,
// compressed evidence rows, standing-aware authority copy (no stale human
// approval messaging), journey/rail navigation targets (GET pages only,
// never mutations, never invented ids), interval controls, secret-free
// surface serialization, and evidence still produced. Live Bitget calls,
// orders, and Groq are NEVER exercised.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { toSurfaceResponse, type DemoSurfaceView } from "../src/lib/tenax/demo-surface";
import {
  analyzeProtectionIntent,
  createDevStore,
  createProtectionIntent,
} from "../src/lib/tenax/index";
import {
  evidenceSummary,
  EXPOSURE_REFERENCE,
  EXPOSURE_VIEWPORT,
  finalActionState,
  FOCUS_VIEWPORT,
  PROTECTION_INSTRUMENT,
  surfaceProjection,
  type FinalActionInput,
} from "../src/lib/tenax/visuals";
import {
  CANDLE_VIEWPORT,
  candleGeometry,
} from "../src/app/app/exposure/nvidia/_visuals";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import {
  cumulativeRefusalSentence,
  standingAuthorityCopy,
} from "../src/app/app/_copy";
import {
  analysisIntervalHref,
  analysisJourney,
  APP_ROUTES,
  exposureIntervalHref,
  mandateJourney,
  receiptJourney,
} from "../src/app/app/_components/ui";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

/** Every journey/rail href must resolve to a known GET page (params allowed). */
function expectValidRoute(href: string): void {
  expect(href.startsWith("/api/")).toBe(false);
  const path = href.split("?")[0] ?? href;
  const ok = (APP_ROUTES as readonly string[]).some((route) => {
    const pattern = `^${route.replace("[id]", "[^/]+")}$`;
    return new RegExp(pattern).test(path);
  });
  expect(ok).toBe(true);
}

describe("instrument roles", () => {
  it("labels NVDAUSDT as the protection instrument", () => {
    expect(PROTECTION_INSTRUMENT).toMatchObject({
      symbol: "NVDAUSDT",
      category: "USDT-FUTURES",
      venue: "BITGET",
      role: "PROTECTION",
    });
  });

  it("keeps rNVDA as exposure reference, never owned live", () => {
    expect(EXPOSURE_REFERENCE).toMatchObject({
      symbol: "RNVDA",
      venue: "BITGET REALITY",
      role: "EXPOSURE",
    });
    expect(EXPOSURE_REFERENCE.symbol).not.toBe(PROTECTION_INSTRUMENT.symbol);
  });
});

describe("live-surface projection", () => {
  it("projects zero existing plus 20% within bounds", () => {
    const result = surfaceProjection(
      { state: "NO_POSITION", size: null, markPrice: null },
      100,
      500,
      30,
    );
    expect(result).toMatchObject({
      existingUsd: 0,
      projectedUsd: 100,
      projectedPct: 20,
      positionState: "NONE",
      overLimit: false,
    });
  });

  it("flags ~$99 existing plus $100 as over the 30% mandate", () => {
    const result = surfaceProjection(
      { state: "POSITION", size: "0.44", markPrice: "225" },
      100,
      500,
      30,
    );
    expect(result.existingUsd).toBe(99);
    expect(result.projectedUsd).toBe(199);
    expect(result.projectedPct).toBeCloseTo(39.8, 2);
    expect(result.overLimit).toBe(true);
  });

  it("passes the exact 30% boundary", () => {
    const result = surfaceProjection(
      { state: "POSITION", size: "0.25", markPrice: "200" },
      100,
      500,
      30,
    );
    expect(result).toMatchObject({ projectedUsd: 150, projectedPct: 30, overLimit: false });
  });

  it("stays unknown on unavailable or unvalued positions, never zero", () => {
    for (const position of [
      { state: "UNAVAILABLE", size: null, markPrice: null },
      { state: "POSITION", size: null, markPrice: "225" },
      { state: "POSITION", size: "0.44", markPrice: null },
      { state: "POSITION", size: "bogus", markPrice: "225" },
    ] as const) {
      const result = surfaceProjection(position, 100, 500, 30);
      expect(result.positionState).toBe("UNKNOWN");
      expect(result.existingUsd).toBeNull();
      expect(result.projectedUsd).toBeNull();
      expect(result.projectedPct).toBeNull();
      expect(result.overLimit).toBeNull();
    }
  });
});

describe("evidence summary", () => {
  it("communicates meaning first with live states", () => {
    const rows = evidenceSummary({
      realityAvailable: true,
      futuresAvailable: true,
      nvdaxAvailable: true,
    });
    expect(rows.map((r) => `${r.label}: ${r.status}`)).toEqual([
      "Bitget Reality: LIVE",
      "Bitget Futures: LIVE",
      "xStocks NVDAx: AVAILABLE · NOT OWNED",
      "Earnings date: UNVERIFIED",
    ]);
  });

  it("stays honest when legs are unavailable", () => {
    const rows = evidenceSummary({
      realityAvailable: false,
      futuresAvailable: false,
      nvdaxAvailable: false,
    });
    expect(rows.map((r) => r.status)).toEqual([
      "UNAVAILABLE",
      "UNAVAILABLE",
      "UNVERIFIED",
      "UNVERIFIED",
    ]);
  });

  it("never fabricates an earnings date", () => {
    for (const nvdax of [true, false, null] as const) {
      const earnings = evidenceSummary({
        realityAvailable: true,
        futuresAvailable: true,
        nvdaxAvailable: nvdax,
      }).find((r) => r.label === "Earnings date");
      expect(earnings?.status).toBe("UNVERIFIED");
    }
  });
});

describe("authority copy", () => {
  it("requires per-action approval with no standing mandate", () => {
    const copy = standingAuthorityCopy(null);
    expect(copy.title).toBe("PER-ACTION AUTHORITY");
    expect(copy.lines.join(" ")).toMatch(/human approval required/i);
  });

  it("never renders stale human-approval-required under AUTO_WITHIN_MANDATE", () => {
    const copy = standingAuthorityCopy("AUTO_WITHIN_MANDATE");
    expect(copy.title).toBe("AUTHORITY");
    expect(copy.lines.join(" ")).toMatch(/standing mandate active/i);
    expect(copy.lines.join(" ")).toMatch(/not required within bounds/i);
    expect(copy.lines.join(" ")).not.toMatch(/human approval required/i);
  });

  it("describes escalation and review-every-action distinctly", () => {
    expect(standingAuthorityCopy("AUTO_WITH_ESCALATION").lines.join(" ")).toMatch(
      /human review outside bounds/i,
    );
    expect(standingAuthorityCopy("REVIEW_EVERY_ACTION").lines.join(" ")).toMatch(
      /every action/i,
    );
  });
});

describe("cumulative refusal sentences", () => {
  it("attributes over-mandate refusal to the deterministic gate, never the AI", () => {
    const sentence = cumulativeRefusalSentence("projected_protection_exceeds_mandate");
    expect(sentence).toMatch(/mandate/i);
    expect(sentence).toMatch(/no order sent/i);
    expect(sentence).not.toMatch(/\bAI\b/);
  });

  it("fails closed in words for unknown position states", () => {
    for (const code of ["position_unreadable", "position_unvalued", "opposite_position"]) {
      const sentence = cumulativeRefusalSentence(code);
      expect(sentence).toMatch(/fails closed/i);
      expect(sentence).toMatch(/no order sent/i);
    }
  });
});

describe("final action state", () => {
  const clear: FinalActionInput = {
    wait: false,
    actionable: true,
    policyPass: true,
    standingDecision: "AUTHORIZED",
    cumulativeOverLimit: false,
  };

  it("authorizes only when every known deterministic gate is clear", () => {
    expect(finalActionState(clear)).toBe("AUTHORIZED");
  });

  it("refuses when standing is AUTHORIZED but cumulative exceeds the mandate", () => {
    expect(finalActionState({ ...clear, cumulativeOverLimit: true })).toBe("REFUSED");
  });

  it("fails closed to UNKNOWN when the projection is unknown", () => {
    expect(finalActionState({ ...clear, cumulativeOverLimit: null })).toBe("UNKNOWN");
  });

  it("keeps mandate and standing refusals refused regardless of projection", () => {
    expect(finalActionState({ ...clear, policyPass: false })).toBe("REFUSED");
    expect(
      finalActionState({ ...clear, standingDecision: "REFUSED", cumulativeOverLimit: false }),
    ).toBe("REFUSED");
  });

  it("preserves the manual path on ESCALATE and reports missing authority", () => {
    expect(finalActionState({ ...clear, standingDecision: "ESCALATE" })).toBe("ESCALATE");
    expect(finalActionState({ ...clear, standingDecision: null })).toBe("NO_MANDATE");
  });

  it("shows WAIT and NO_ACTION with no execution path", () => {
    expect(finalActionState({ ...clear, wait: true })).toBe("WAIT");
    expect(finalActionState({ ...clear, actionable: false })).toBe("NO_ACTION");
    expect(
      finalActionState({ ...clear, wait: true, standingDecision: "AUTHORIZED" }),
    ).toBe("WAIT");
  });

  it("resolves every gate combination to exactly one valid state", () => {
    const valid = ["AUTHORIZED", "REFUSED", "ESCALATE", "WAIT", "NO_ACTION", "NO_MANDATE", "UNKNOWN"];
    for (const wait of [false, true]) {
      for (const actionable of [false, true]) {
        for (const policyPass of [false, true]) {
          for (const standingDecision of ["AUTHORIZED", "ESCALATE", "REFUSED", null] as const) {
            for (const cumulativeOverLimit of [false, true, null] as const) {
              const state = finalActionState({
                wait,
                actionable,
                policyPass,
                standingDecision,
                cumulativeOverLimit,
              });
              expect(valid).toContain(state);
            }
          }
        }
      }
    }
  });
});

describe("cockpit final-state presentation", () => {
  const pageSource = readFileSync(
    new URL("../src/app/app/analysis/[id]/page.tsx", import.meta.url),
    "utf8",
  );

  it("renders one FINAL decision from the derived state", () => {
    expect(pageSource).toContain("FINAL TENAX DECISION");
    expect(pageSource).toContain("finalActionState");
    expect(pageSource).toContain("TENAX AUTHORIZED");
    expect(pageSource).toContain("TENAX REFUSED");
  });

  it("shows RUN TENAX AGENT only in the AUTHORIZED branch", () => {
    const renders = pageSource.split("<RunAgentPanel").length - 1;
    expect(renders).toBe(1);
    expect(pageSource).toMatch(/finalState === "AUTHORIZED"[\s\S]{0,600}<RunAgentPanel/);
    expect(pageSource).not.toMatch(/finalState === "REFUSED"[\s\S]{0,200}<RunAgentPanel/);
  });

  it("keeps cumulative numbers visible on refusal with the raw reason code", () => {
    for (const label of ["EXISTING", "PROPOSED", "PROJECTED", "MANDATE MAX"]) {
      expect(pageSource).toContain(label);
    }
    expect(pageSource).toContain("projected_protection_exceeds_mandate");
    expect(pageSource).toContain("Reason:");
    expect(pageSource).toContain("NO ORDER SENT");
  });

  it("removed the redundant authority blocks and mandate CTA", () => {
    expect(pageSource).not.toContain("CHECK AGAINST MANDATE");
    expect(pageSource).not.toContain("STANDING AUTHORITY · AUTHORIZED");
    expect(pageSource).not.toContain("Code decides whether this is allowed");
    // Mandate detail survives as non-primary navigation via the journey row.
    expect(pageSource).toContain("JourneyNav");
    expect(
      analysisJourney({ flowId: "flow-x", hasReceipt: false }).map((l) => l.label),
    ).toContain("VIEW MANDATE DETAILS");
  });
});

describe("journey continuity", () => {
  it("carries only cross-cutting navigation on the cockpit row", () => {
    const links = analysisJourney({ flowId: "flow-1", hasReceipt: false });
    expect(links.map((l) => l.label)).toEqual(["VIEW MANDATE DETAILS", "VIEW ACTIVITY"]);
    expect(links.find((l) => l.label === "VIEW MANDATE DETAILS")?.href).toBe(
      "/app/approval/flow-1",
    );
    for (const link of links) expectValidRoute(link.href);
  });

  it("links receipts only when canonical state exists, never inventing ids", () => {
    expect(
      analysisJourney({ flowId: "flow-4", hasReceipt: false }).map((l) => l.label),
    ).not.toContain("VIEW RECEIPT");
    expect(
      analysisJourney({ flowId: "flow-4", hasReceipt: true }).find(
        (l) => l.label === "VIEW RECEIPT",
      )?.href,
    ).toBe("/app/receipts/flow-4");
  });

  it("returns mandate continuation to the current analysis or the intent", () => {
    expect(mandateJourney(null).map((l) => l.label)).toContain("PROTECT NVIDIA");
    const returning = mandateJourney("flow-9");
    expect(
      returning.find((l) => l.label === "RETURN TO CURRENT ANALYSIS")?.href,
    ).toBe("/app/analysis/flow-9");
    for (const link of returning) expectValidRoute(link.href);
  });

  it("navigates receipts to exposure, activity, and protect again", () => {
    const links = receiptJourney();
    expect(links.map((l) => l.label)).toEqual(["VIEW EXPOSURE", "VIEW ACTIVITY", "PROTECT AGAIN"]);
    for (const link of links) expectValidRoute(link.href);
  });

  it("keeps every journey link off mutation routes", () => {
    const all = [
      ...analysisJourney({ flowId: "f", hasReceipt: true }),
      ...mandateJourney("f"),
      ...receiptJourney(),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const link of all) {
      expect(link.kind).toBe("nav");
      expect(link.href.startsWith("/api/")).toBe(false);
      expect(link.href).not.toMatch(/POST|approve|execute|agent-cycle/);
    }
  });
});

describe("interval controls", () => {
  it("targets the owning surface with pure GET links", () => {
    expect(exposureIntervalHref("1m")).toBe("/app/exposure/nvidia?interval=1m");
    expect(analysisIntervalHref("flow-1", "15m")).toBe("/app/analysis/flow-1?interval=15m");
    expectValidRoute(exposureIntervalHref("5m"));
    expectValidRoute(analysisIntervalHref("flow-1", "5m"));
  });
});

describe("focus viewport", () => {
  it("constrains the cockpit chart to a centered terminal, not full width", () => {
    expect(FOCUS_VIEWPORT.maxWidthPx).toBeGreaterThanOrEqual(850);
    expect(FOCUS_VIEWPORT.maxWidthPx).toBeLessThanOrEqual(1000);
    expect(FOCUS_VIEWPORT.moduleMaxWidthPx).toBeLessThanOrEqual(1050);
  });

  it("renders 430–520px tall at max width with room for candles to breathe", () => {
    const rendered =
      (FOCUS_VIEWPORT.maxWidthPx * FOCUS_VIEWPORT.chartHeightPx) / CANDLE_VIEWPORT.width;
    expect(rendered).toBeGreaterThanOrEqual(430);
    expect(rendered).toBeLessThanOrEqual(520);
  });

  it("leaves the shared base viewport untouched for the exposure surface", () => {
    expect(CANDLE_VIEWPORT).toMatchObject({ width: 680, height: 300 });
  });

  it("scales chart geometry with the requested height", () => {
    const candles = [
      { t: 1, o: 100, h: 110, l: 90, c: 105, vol: null },
      { t: 2, o: 105, h: 115, l: 95, c: 100, vol: null },
    ];
    const base = candleGeometry(candles);
    const tall = candleGeometry(candles, FOCUS_VIEWPORT.chartHeightPx);
    expect(base.H).toBe(300);
    expect(tall.H).toBe(FOCUS_VIEWPORT.chartHeightPx);
    // Price mapping spans the taller plot (padT=14, padB=22).
    expect(tall.y(tall.hi)).toBeCloseTo(14, 6);
    expect(tall.y(tall.lo)).toBeCloseTo(FOCUS_VIEWPORT.chartHeightPx - 22, 6);
    expect(tall.y(tall.lo) - tall.y(tall.hi)).toBeGreaterThan(
      base.y(base.lo) - base.y(base.hi),
    );
  });
});

describe("exposure viewport", () => {
  it("centers the exposure terminal with slightly more room than the cockpit", () => {
    expect(EXPOSURE_VIEWPORT.moduleMaxWidthPx).toBeGreaterThanOrEqual(1000);
    expect(EXPOSURE_VIEWPORT.moduleMaxWidthPx).toBeLessThanOrEqual(1100);
    expect(EXPOSURE_VIEWPORT.maxWidthPx).toBeGreaterThanOrEqual(850);
    expect(EXPOSURE_VIEWPORT.maxWidthPx).toBeLessThanOrEqual(950);
    const rendered =
      (EXPOSURE_VIEWPORT.maxWidthPx * EXPOSURE_VIEWPORT.chartHeightPx) / CANDLE_VIEWPORT.width;
    expect(rendered).toBeGreaterThanOrEqual(400);
    expect(rendered).toBeLessThanOrEqual(500);
  });

  it("keeps the two surfaces related but intentionally different", () => {
    expect(EXPOSURE_VIEWPORT).not.toEqual(FOCUS_VIEWPORT);
    expect(EXPOSURE_VIEWPORT.maxWidthPx).toBeGreaterThan(FOCUS_VIEWPORT.maxWidthPx);
    expect(EXPOSURE_VIEWPORT.moduleMaxWidthPx).toBeGreaterThanOrEqual(
      FOCUS_VIEWPORT.moduleMaxWidthPx,
    );
  });

  it("wires each surface to its own preset through the shared panel", () => {
    const panelSource = readFileSync(
      new URL("../src/app/app/_components/protection-market.tsx", import.meta.url),
      "utf8",
    );
    expect(panelSource).toContain("viewport: MarketViewport");
    expect(panelSource).toContain("viewport.moduleMaxWidthPx");
    expect(panelSource).toContain("viewport.maxWidthPx");
    expect(panelSource).toContain("viewport.chartHeightPx");
    expect(panelSource).toContain("LiveSurface");
    expect(panelSource).toContain("toSurfaceResponse");
    expect(panelSource).not.toMatch(/method:\s*"POST"/);
    const exposureSource = readFileSync(
      new URL("../src/app/app/exposure/nvidia/page.tsx", import.meta.url),
      "utf8",
    );
    expect(exposureSource).toContain("EXPOSURE_VIEWPORT");
    const analysisSource = readFileSync(
      new URL("../src/app/app/analysis/[id]/page.tsx", import.meta.url),
      "utf8",
    );
    expect(analysisSource).toContain("FOCUS_VIEWPORT");
    expect(analysisSource).not.toContain("EXPOSURE_VIEWPORT");
  });
});

describe("surface serialization", () => {
  it("exposes only the whitelisted display keys, never secrets", () => {
    const view = {
      ticker: {
        symbol: "NVDAUSDT",
        lastPrice: "200",
        markPrice: "200",
        indexPrice: "200",
        bidPrice: "199",
        askPrice: "201",
        fundingRate: "0.0001",
        change24h: "0.01",
        high24h: "205",
        low24h: "195",
        openInterest: "1000",
        updatedAt: "2026-09-22T00:00:00.000Z",
      },
      position: {
        state: "POSITION",
        symbol: "NVDAUSDT",
        side: "short",
        size: "0.44",
        avgEntryPrice: "223.53",
        markPrice: "225",
        leverage: "1",
        marginMode: "crossed",
        upnl: "1.5",
        upnlRoi: "0.6",
        liqPrice: null,
        updatedAt: null,
        ...( { apiKey: "secret", passphrase: "secret" } as Record<string, unknown> ),
      },
      fetchedAt: "2026-09-22T00:00:00.000Z",
    } as unknown as DemoSurfaceView;
    const serialized = JSON.stringify(toSurfaceResponse(view));
    for (const fragment of ["secret", "apiKey", "passphrase", "Bearer ", "ACCESS-SIGN"]) {
      expect(serialized).not.toContain(fragment);
    }
    const parsed = JSON.parse(serialized) as { position: Record<string, unknown> };
    expect(Object.keys(parsed.position).sort()).toEqual(
      [
        "avgEntryPrice",
        "leverage",
        "liqPrice",
        "marginMode",
        "markPrice",
        "side",
        "size",
        "state",
        "symbol",
        "updatedAt",
        "upnl",
        "upnlRoi",
      ].sort(),
    );
  });
});

describe("technical evidence retained", () => {
  it("analysis still produces endpoint evidence refs behind the disclosure", async () => {
    const store = createDevStore();
    const snapshot = normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
    );
    const { flowId } = createProtectionIntent(store, { rawText: RAW_TEXT });
    analyzeProtectionIntent(store, flowId, snapshot);
    const analysis = store.flows.get(flowId)?.getContext().analysis;
    expect(analysis?.reasoning.evidenceRefs.length).toBeGreaterThan(0);
  });
});
