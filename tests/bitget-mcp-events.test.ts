// Tenax Bitget-MCP event-source tests (offline, stubbed transport only).
//
// Proves: session handshake + tool calls use only observed protocol;
// calendar entry id resolves live from the catalog (never hardcoded
// knowledge); failure/empty/ambiguous/past-only payloads stay null; one
// clean upcoming date yields a VERIFIED event with key provenance; the
// transport only ever touches the MCP path (no writes anywhere — the
// protocol has no write operation). No live network.
import { describe, expect, it } from "vitest";

import {
  callMcpTool,
  McpError,
  openMcpSession,
  parseSseDataPayload,
} from "../src/lib/intelligence/bitget-mcp";
import type { McpFetchImpl } from "../src/lib/intelligence/bitget-mcp";
import {
  extractVerifiedCalendarDate,
  fetchTrustedNvidiaEvent,
  resolveCalendarEntryId,
} from "../src/lib/intelligence/nvidia-events";

const SID = "test-session-id";

function sse(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

function response(
  text: string,
  status = 200,
  sessionId: string | null = null,
): { status: number; header: (name: string) => string | null; text: () => Promise<string> } {
  return {
    status,
    header: (name) => (name.toLowerCase() === "mcp-session-id" ? sessionId : null),
    text: async () => text,
  };
}

/** Scripted transport: routes by JSON-RPC method / tool name. */
function scripted(
  calls: string[],
  handlers: Record<string, (body: Record<string, unknown>) => ReturnType<typeof response>>,
): McpFetchImpl {
  return async (request) => {
    const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
    const method = String(body.method ?? request.method);
    calls.push(`${request.method} ${request.url} ${method}`);
    const handler = handlers[method];
    if (!handler) throw new Error(`unexpected MCP call ${method}`);
    return handler(body);
  };
}

// Catalog shape as observed live 2026-10-07 (recorded test fixture —
// provider data shape for parsing tests, not a Tenax fact).
const EQUITY_CATALOG_TEXT = JSON.stringify({
  entries: [
    { id: "equity_price_quote", url_path: "equity/price/quote" },
    { id: "equity_calendar", url_path: "equity/calendar" },
  ],
});

function callResultEnvelope(text: string): string {
  return sse({
    jsonrpc: "2.0",
    id: "tenax-call",
    result: { content: [{ type: "text", text }] },
  });
}

function calendarEnvelope(data: unknown): string {
  return callResultEnvelope(
    JSON.stringify({ success: true, status_code: 200, data, error: null }),
  );
}

function guideEnvelope(catalogText: string): string {
  return sse({ jsonrpc: "2.0", id: "tenax-guide", result: { content: [{ type: "text", text: catalogText }] } });
}

describe("MCP transport discipline", () => {
  it("opens a session via initialize and captures the session id", async () => {
    const calls: string[] = [];
    const fetchImpl = scripted(calls, {
      initialize: () => response(sse({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "x", serverInfo: {} } }), 200, SID),
      "notifications/initialized": () => response("", 200),
    });
    const session = await openMcpSession({ baseUrl: "https://mcp.example.invalid", fetchImpl, timeoutMs: 1000 });
    expect(session.sessionId).toBe(SID);
    expect(session.baseUrl).toBe("https://mcp.example.invalid");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("https://mcp.example.invalid/mcp");
  });

  it("fails closed on HTTP errors, missing sessions, protocol errors, and malformed SSE", async () => {
    const bad: McpFetchImpl = async () => response("nope", 500);
    await expect(openMcpSession({ fetchImpl: bad })).rejects.toThrow(/MCP_HTTP/);
    const noSid: McpFetchImpl = async () =>
      response(sse({ jsonrpc: "2.0", id: 1, result: {} }), 200, null);
    await expect(openMcpSession({ fetchImpl: noSid })).rejects.toThrow(/MCP_BAD_RESPONSE/);
    const protoErr: McpFetchImpl = async (request) => {
      const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
      if (body.method === "initialize") {
        return response(sse({ jsonrpc: "2.0", id: 1, result: {} }), 200, SID);
      }
      if (body.method === "notifications/initialized") return response("", 200);
      return response(sse({ jsonrpc: "2.0", id: 2, error: { code: -32600, message: "Bad Request" } }), 200);
    };
    const session = await openMcpSession({ fetchImpl: protoErr });
    await expect(callMcpTool(session, { tool: "do_query", args: {} })).rejects.toThrow(/MCP_PROTOCOL/);
    expect(() => parseSseDataPayload("event: nothing here\n")).toThrow(McpError);
  });
});

describe("calendar entry resolution", () => {
  it("finds the earnings-calendar entry live from the catalog", () => {
    expect(resolveCalendarEntryId(EQUITY_CATALOG_TEXT)).toBe("equity_calendar");
  });

  it("returns null when the catalog lacks the calendar entry", () => {
    expect(resolveCalendarEntryId(JSON.stringify({ entries: [{ id: "x", url_path: "y" }] }))).toBeNull();
    expect(resolveCalendarEntryId("not json")).toBeNull();
    expect(resolveCalendarEntryId(JSON.stringify({}))).toBeNull();
  });
});

describe("verified-date extraction stays honest", () => {
  const TODAY = "2026-10-07";

  it("accepts one clean upcoming NVDA date with key provenance", () => {
    expect(
      extractVerifiedCalendarDate(
        [{ symbol: "NVDA", report_date: "2026-11-18", fiscal_year: 2026 }],
        TODAY,
      ),
    ).toEqual({ date: "2026-11-18", key: "report_date" });
  });

  it("rejects empty, ambiguous, past-only, non-NVDA, and malformed payloads", () => {
    expect(extractVerifiedCalendarDate([], TODAY)).toBeNull();
    expect(extractVerifiedCalendarDate(null, TODAY)).toBeNull();
    expect(
      extractVerifiedCalendarDate(
        [{ symbol: "NVDA", report_date: "2026-11-18" }, { symbol: "NVDA", report_date: "2027-02-17" }],
        TODAY,
      ),
    ).toBeNull();
    expect(
      extractVerifiedCalendarDate([{ symbol: "NVDA", report_date: "2026-01-01" }], TODAY),
    ).toBeNull();
    expect(
      extractVerifiedCalendarDate([{ symbol: "AAPL", report_date: "2026-11-18" }], TODAY),
    ).toBeNull();
    expect(
      extractVerifiedCalendarDate([{ symbol: "NVDA", report_date: "2026-13-45" }], TODAY),
    ).toBeNull();
    expect(
      extractVerifiedCalendarDate([{ symbol: "NVDA", note: "soon" }], TODAY),
    ).toBeNull();
  });
});

describe("fetchTrustedNvidiaEvent end to end (stubbed)", () => {
  function fullFlow(calls: string[], calendarData: unknown): McpFetchImpl {
    return scripted(calls, {
      initialize: () => response(sse({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "t" } } }), 200, SID),
      "notifications/initialized": () => response("", 200),
      "tools/call": (body) => {
        const params = body.params as { name: string; arguments: Record<string, unknown> };
        if (params.name === "guide") return response(guideEnvelope(EQUITY_CATALOG_TEXT), 200);
        if (params.name === "do_query") return response(calendarEnvelope(calendarData), 200);
        throw new Error(`unexpected tool ${params.name}`);
      },
      DELETE: () => response("", 200),
    });
  }

  it("returns a VERIFIED event for one clean upcoming date", async () => {
    const calls: string[] = [];
    const event = await fetchTrustedNvidiaEvent({
      baseUrl: "https://mcp.example.invalid",
      fetchImpl: fullFlow(calls, [{ symbol: "NVDA", earnings_date: "2026-11-18" }]),
      nowMs: Date.parse("2026-10-07T12:00:00.000Z"),
    });
    expect(event).toMatchObject({
      eventType: "EARNINGS",
      eventDate: "2026-11-18",
      status: "VERIFIED",
      meta: { source: "bitget:mcp", provenance: "REAL" },
    });
    expect(event?.source).toContain("equity_calendar");
    expect(event?.source).toContain("earnings_date");
    expect(event?.retrievedAt).toBe("2026-10-07T12:00:00.000Z");
    // Only MCP-path calls: initialize, notifications, guide, do_query (+close).
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) expect(call).toContain("/mcp");
    expect(calls.join(" ")).not.toMatch(/place-order|order-info|position|account/i);
  });

  it("returns null for upstream failure, empty, ambiguous, and transport errors", async () => {
    const at = Date.parse("2026-10-07T12:00:00.000Z");
    // Exact observed live failure shape: success:false with a 503 body.
    const envelope503: McpFetchImpl = async (request) => {
      const body = JSON.parse(request.body ?? "{}") as Record<string, unknown>;
      if (body.method === "initialize") {
        return response(sse({ jsonrpc: "2.0", id: 1, result: {} }), 200, SID);
      }
      if (body.method === "notifications/initialized") return response("", 200);
      const params = (body.params ?? {}) as { name?: string };
      if (params.name === "guide") return response(guideEnvelope(EQUITY_CATALOG_TEXT), 200);
      return response(
        callResultEnvelope(
          JSON.stringify({ success: false, status_code: 503, data: "<html>503</html>", error: null }),
        ),
        200,
      );
    };
    expect(await fetchTrustedNvidiaEvent({ fetchImpl: envelope503, nowMs: at })).toBeNull();
    const empty: string[] = [];
    expect(await fetchTrustedNvidiaEvent({ fetchImpl: fullFlow(empty, []), nowMs: at })).toBeNull();
    const ambiguous: string[] = [];
    expect(
      await fetchTrustedNvidiaEvent({
        fetchImpl: fullFlow(ambiguous, [
          { symbol: "NVDA", report_date: "2026-11-18" },
          { symbol: "NVDA", report_date: "2027-02-17" },
        ]),
        nowMs: at,
      }),
    ).toBeNull();
    const throwing: McpFetchImpl = async () => {
      throw new McpError("MCP_TRANSPORT", "down");
    };
    expect(await fetchTrustedNvidiaEvent({ fetchImpl: throwing })).toBeNull();
  });
});
