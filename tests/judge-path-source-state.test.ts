// Tenax judge-path source-state regressions (offline, stubbed only).
//
// Proves: the event source probe distinguishes LIVE_VERIFIED_EVENT from
// SOURCE_UNAVAILABLE from NO_ELIGIBLE_EVENT; a dead source never becomes
// fixture content, a date, or an AI proposal; the Event Room communicates
// source-integrity truth without reading logs; REFUSE/NO_ORDER authority
// language stays explicit on judge surfaces. No live network, no writes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildEvidencePack } from "../src/lib/ai/evidence-pack";
import { fetchRealityBundle } from "../src/lib/bitget/reality";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot";
import { fetchTrustedNvidiaEvent, probeNvidiaEventSource } from "../src/lib/intelligence/nvidia-events";
import type { McpFetchImpl } from "../src/lib/intelligence/bitget-mcp";
import {
  NVDA_EXPOSURE_FIXTURE,
} from "../src/lib/tenax/fixtures";
import { createProtectEventRiskIntent } from "../src/lib/tenax/intent";
import { FULL_PAYLOADS, stubClientFor } from "./fixtures/reality-payloads";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";
const AT = Date.parse("2026-10-07T12:00:00.000Z");

function sse(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

function response(text: string, status = 200, sessionId: string | null = "sid") {
  return {
    status,
    header: (name: string) => (name.toLowerCase() === "mcp-session-id" ? sessionId : null),
    text: async () => text,
  };
}

function callResult(text: string): string {
  return sse({ jsonrpc: "2.0", id: "c", result: { content: [{ type: "text", text }] } });
}

const CATALOG = JSON.stringify({
  entries: [
    { id: "equity_price_quote", url_path: "equity/price/quote" },
    { id: "equity_calendar", url_path: "equity/calendar" },
  ],
});

/** Full stubbed MCP flow with a canned calendar payload. */
function stubFlow(calendarData: unknown): McpFetchImpl {
  return async (request) => {
    const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
    if (body.method === "initialize") {
      return response(sse({ jsonrpc: "2.0", id: 1, result: {} }), 200, "sid");
    }
    if (body.method === "notifications/initialized") return response("", 200);
    const params = (body.params ?? {}) as { name?: string };
    if (params.name === "guide") {
      return response(callResult(CATALOG), 200);
    }
    return response(
      callResult(JSON.stringify({ success: true, status_code: 200, data: calendarData, error: null })),
      200,
    );
  };
}

const failing503: McpFetchImpl = async (request) => {
  const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
  if (body.method === "initialize") {
    return response(sse({ jsonrpc: "2.0", id: 1, result: {} }), 200, "sid");
  }
  if (body.method === "notifications/initialized") return response("", 200);
  const params = (body.params ?? {}) as { name?: string };
  if (params.name === "guide") return response(callResult(CATALOG), 200);
  return response(
    callResult(JSON.stringify({ success: false, status_code: 503, data: "<html>503</html>", error: null })),
    200,
  );
};

describe("event source state model", () => {
  it("distinguishes verified event, dead source, and no eligible event", async () => {
    const live = await probeNvidiaEventSource({
      fetchImpl: stubFlow([{ symbol: "NVDA", report_date: "2026-11-18" }]),
      nowMs: AT,
    });
    expect(live.kind).toBe("LIVE_VERIFIED_EVENT");
    if (live.kind !== "LIVE_VERIFIED_EVENT") throw new Error("expected verified event");
    expect(live.event.eventDate).toBe("2026-11-18");
    expect(live.event.meta).toMatchObject({ source: "bitget:mcp", provenance: "REAL" });

    expect((await probeNvidiaEventSource({ fetchImpl: failing503, nowMs: AT })).kind).toBe(
      "SOURCE_UNAVAILABLE",
    );
    expect(
      (await probeNvidiaEventSource({ fetchImpl: stubFlow([]), nowMs: AT })).kind,
    ).toBe("NO_ELIGIBLE_EVENT");
    expect(
      (
        await probeNvidiaEventSource({
          fetchImpl: stubFlow([{ symbol: "NVDA", report_date: "2026-01-01" }]),
          nowMs: AT,
        })
      ).kind,
    ).toBe("NO_ELIGIBLE_EVENT");
  });

  it("a dead source never becomes fixture content, a date, or a proposal seed", async () => {
    const state = await probeNvidiaEventSource({ fetchImpl: failing503, nowMs: AT });
    expect(state.kind).toBe("SOURCE_UNAVAILABLE");
    expect(JSON.stringify(state)).not.toContain("DEVELOPMENT_FIXTURE");
    expect(JSON.stringify(state)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // The evidence-pack path keeps earningsDate null for null events.
    const snapshot = normalizeNvidiaSnapshot(
      await fetchRealityBundle(stubClientFor(FULL_PAYLOADS), { gapMs: 0 }),
    );
    const pack = buildEvidencePack({
      exposure: NVDA_EXPOSURE_FIXTURE,
      intent: createProtectEventRiskIntent(NVDA_EXPOSURE_FIXTURE, RAW_TEXT),
      snapshot,
      futuresTicker: null,
      candles: null,
      nvdax: null,
      instrument: null,
      nvidiaEvent: await fetchTrustedNvidiaEvent({ fetchImpl: failing503, nowMs: AT }),
    });
    expect(pack.nvidiaEvent).toBeNull();
    expect(pack.intent.earningsDate).toBeNull();
    expect(pack.exposure.exposureMode).toBe("SIMULATED_PAPER");
  });
});

describe("judge-facing source truth", () => {
  const eventsSource = readFileSync("src/app/app/events/page.tsx", "utf8");

  it("Event Room probes the verified calendar with a bounded timeout", () => {
    expect(eventsSource).toContain("probeNvidiaEventSource");
    expect(eventsSource).toContain("timeoutMs");
    expect(eventsSource).not.toContain("fetch(");
  });

  it("communicates source-integrity states without log-reading", () => {
    expect(eventsSource).toContain("VERIFIED EVENT CALENDAR");
    expect(eventsSource).toContain("LIVE_EVENT_SOURCE_UNAVAILABLE_LINE");
    expect(eventsSource).toContain("NO_ELIGIBLE_EVENT_LINE");
    expect(eventsSource).toContain("SOURCE INTEGRITY HELD — NOT AN APPLICATION FAILURE");
    expect(eventsSource).toContain("NO VERIFIED EVENT");
    const copySource = readFileSync("src/app/app/_copy.ts", "utf8");
    expect(copySource).toContain("No AI decision generated");
    expect(copySource).toContain("Live event source unavailable");
  });

  it("never hardcodes an event date into the Event Room", () => {
    expect(eventsSource).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(eventsSource).toContain("UNVERIFIED");
  });

  it("keeps fixture and live labels distinct across the journey", () => {
    const analysisSource = readFileSync("src/app/app/analysis/[id]/page.tsx", "utf8");
    expect(analysisSource).toContain("AI ANALYSIS");
    expect(analysisSource).toContain("DEVELOPMENT ANALYSIS");
    const detailSource = readFileSync("src/app/app/paper-trading/[runId]/page.tsx", "utf8");
    expect(detailSource).toContain("NO ORDER SENT");
    expect(eventsSource).toContain("SIMULATED PORTFOLIO");
  });

  it("authority-refusal language stays refusal, never failure", () => {
    const analysisSource = readFileSync("src/app/app/analysis/[id]/page.tsx", "utf8");
    expect(analysisSource).toContain("TENAX REFUSED");
    expect(analysisSource).toContain("No order sent");
  });
});
