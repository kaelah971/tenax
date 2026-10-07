// Tenax — minimal Bitget MCP transport (server-only, read-only).
//
// Speaks ONLY the Streamable-HTTP JSON-RPC behavior observed live from
// https://agent.bitget.com/mcp (bitget-mcp-server 4.0.5, 2026-10-07):
// - POST {base}/mcp with Accept: application/json, text/event-stream
// - initialize → SSE `data:` payload + `mcp-session-id` response header
// - later calls require the `Mcp-Session-Id` header (else -32600)
// - tools/list (catalog) and tools/call {name, arguments} (queries)
// No SDK dependency, no credentials, no writes: this transport only ever
// POSTs initialize/tools-list/tools-call/notifications-initialized and a
// best-effort session DELETE. Catalog entry ids are resolved live via the
// `guide` tool — never hardcoded from memory.

if (typeof window !== "undefined") {
  throw new Error("Bitget MCP transport is server-only");
}

export const BITGET_MCP_BASE_URL = "https://agent.bitget.com";
export const BITGET_MCP_PATH = "/mcp";
export const BITGET_MCP_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_MCP_TIMEOUT_MS = 20_000;

export type McpFailureCode =
  | "MCP_TRANSPORT"
  | "MCP_TIMEOUT"
  | "MCP_HTTP"
  | "MCP_PROTOCOL"
  | "MCP_BAD_RESPONSE";

export class McpError extends Error {
  readonly code: McpFailureCode;
  constructor(code: McpFailureCode, detail: string) {
    super(`MCP_${code}: ${detail}`);
    this.code = code;
  }
}

export interface McpTransportRequest {
  readonly url: string;
  readonly method: "POST" | "DELETE";
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly timeoutMs: number;
}

export interface McpTransportResponse {
  readonly status: number;
  header(name: string): string | null;
  text(): Promise<string>;
}

export type McpFetchImpl = (request: McpTransportRequest) => Promise<McpTransportResponse>;

function defaultFetchImpl(): McpFetchImpl {
  return async (request) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
      return {
        status: response.status,
        header: (name) => response.headers.get(name),
        text: () => response.text(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(
        /abort/i.test(message) ? "MCP_TIMEOUT" : "MCP_TRANSPORT",
        message.slice(0, 200),
      );
    } finally {
      clearTimeout(timer);
    }
  };
}

export interface McpSession {
  readonly baseUrl: string;
  readonly sessionId: string;
  readonly fetchImpl: McpFetchImpl;
  readonly timeoutMs: number;
}

function mcpUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${BITGET_MCP_PATH}`;
}

/** First SSE `data:` payload parsed as JSON. Throws McpError on any deviation. */
export function parseSseDataPayload(text: string): unknown {
  const match = /(?:^|\n)data:\s*(\{.*\})\s*$/m.exec(text.trim());
  if (!match) throw new McpError("MCP_BAD_RESPONSE", "no SSE data payload");
  try {
    return JSON.parse(match[1] as string) as unknown;
  } catch {
    throw new McpError("MCP_BAD_RESPONSE", "SSE data is not JSON");
  }
}

interface JsonRpcEnvelope {
  readonly result?: unknown;
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

function unwrapResult(payload: unknown, what: string): unknown {
  const envelope = payload as Partial<JsonRpcEnvelope>;
  if (!envelope || typeof envelope !== "object") {
    throw new McpError("MCP_BAD_RESPONSE", `${what} envelope is not an object`);
  }
  if (envelope.error !== undefined && envelope.error !== null) {
    const inner = envelope.error as { code?: unknown; message?: unknown };
    throw new McpError(
      "MCP_PROTOCOL",
      `${what}: code ${String(inner.code ?? "?")} ${String(inner.message ?? "").slice(0, 200)}`,
    );
  }
  if (!("result" in (envelope as object))) {
    throw new McpError("MCP_BAD_RESPONSE", `${what} has neither result nor error`);
  }
  return envelope.result;
}

async function postJson(
  session: Pick<McpSession, "baseUrl" | "sessionId" | "fetchImpl" | "timeoutMs"> & { readonly sessionId?: string },
  id: number | string,
  method: string,
  params?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const response = await session.fetchImpl({
    url: mcpUrl(session.baseUrl),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(session.sessionId ? { "Mcp-Session-Id": session.sessionId } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
    timeoutMs: session.timeoutMs,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new McpError("MCP_HTTP", `POST ${method} -> http ${response.status}`);
  }
  return unwrapResult(await response.text().then(parseSseDataPayload), method);
}

export interface OpenMcpSessionInput {
  readonly baseUrl?: string;
  readonly clientName?: string;
  readonly fetchImpl?: McpFetchImpl;
  readonly timeoutMs?: number;
}

/** Open a session: initialize handshake, capture the session id. */
export async function openMcpSession(input: OpenMcpSessionInput = {}): Promise<McpSession> {
  const baseUrl = (input.baseUrl ?? BITGET_MCP_BASE_URL).trim() || BITGET_MCP_BASE_URL;
  const fetchImpl = input.fetchImpl ?? defaultFetchImpl();
  const timeoutMs = input.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
  const probe = { baseUrl, sessionId: "", fetchImpl, timeoutMs };
  const response = await fetchImpl({
    url: mcpUrl(baseUrl),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "tenax-init",
      method: "initialize",
      params: {
        protocolVersion: BITGET_MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: input.clientName ?? "tenax-evidence", version: "0.1.0" },
      },
    }),
    timeoutMs,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new McpError("MCP_HTTP", `initialize -> http ${response.status}`);
  }
  unwrapResult(await response.text().then(parseSseDataPayload), "initialize");
  const sessionId = response.header("mcp-session-id")?.trim() ?? "";
  if (sessionId === "") throw new McpError("MCP_BAD_RESPONSE", "initialize returned no session id");
  // Protocol courtesy; failures never fail the session.
  try {
    await postJson({ ...probe, sessionId }, "tenax-notif", "notifications/initialized");
  } catch {
    // Best-effort only.
  }
  return { baseUrl, sessionId, fetchImpl, timeoutMs };
}

/** Call one MCP tool by its catalog-listed name. */
export async function callMcpTool(
  session: McpSession,
  input: { readonly tool: string; readonly args: Record<string, unknown>; readonly id?: number | string },
): Promise<unknown> {
  const result = await postJson(session, input.id ?? "tenax-call", "tools/call", {
    name: input.tool,
    arguments: input.args,
  });
  return result;
}

/** Best-effort session close. Never throws. */
export async function closeMcpSession(session: McpSession): Promise<void> {
  try {
    await session.fetchImpl({
      url: mcpUrl(session.baseUrl),
      method: "DELETE",
      headers: { "Mcp-Session-Id": session.sessionId },
      timeoutMs: Math.min(session.timeoutMs, 5_000),
    });
  } catch {
    // Sessions expire server-side; close is courtesy only.
  }
}
