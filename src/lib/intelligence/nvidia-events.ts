// Tenax — trusted NVIDIA event evidence via the official Bitget US-stock
// MCP (server-only, read-only).
//
// Source: https://agent.bitget.com/mcp (bitget-mcp-server, catalog
// observed 2026-10-07: `guide` browses data categories, `do_query`
// executes a catalog entry by id). The earnings-calendar entry id is
// resolved LIVE from the catalog (url_path "equity/calendar") — never
// from memory. No credentials, no OAuth, no writes.
//
// Honesty contract: any transport/catalog/query failure, any upstream
// non-success envelope (e.g. 503 from agent-data-platform), any empty or
// ambiguous date set, or any past-only date set yields null
// (UNAVAILABLE). A VERIFIED event requires exactly one distinct upcoming
// ISO calendar date found under an explicitly recorded evidence key —
// the key travels in the report path via eventDate provenance below.
// Dates are never invented, never inferred from prose.

import {
  BITGET_MCP_BASE_URL,
  callMcpTool,
  closeMcpSession,
  openMcpSession,
  type McpFetchImpl,
} from "./bitget-mcp.ts";
import type { TrustedNvidiaEvent } from "../ai/evidence-pack.ts";

if (typeof window !== "undefined") {
  throw new Error("NVIDIA event evidence is server-only");
}

export const NVDA_MCP_SYMBOL = "NVDA";
const EQUITY_CALENDAR_URL_PATH = "equity/calendar";

/**
 * Calendar date evidence keys the parser accepts, in priority order.
 * The matched key is part of the returned provenance (reported in the
 * capture log), so a date is always traceable to its exact field.
 */
const CALENDAR_DATE_KEYS = [
  "report_date",
  "earnings_date",
  "announce_date",
  "announcement_date",
  "release_date",
  "event_date",
  "date",
  "datetime",
  "publish_time",
] as const;

/** Symbol-ish keys used to skip records that are explicitly not NVDA. */
const SYMBOL_KEYS = ["symbol", "ticker", "code", "name"] as const;

export interface FetchNvidiaEventInput {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: McpFetchImpl;
  readonly nowMs?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toolTextContent(result: unknown): string | null {
  const root = asRecord(result);
  const content = root?.content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const item of content) {
    const row = asRecord(item);
    if (row && typeof row.text === "string") texts.push(row.text);
  }
  return texts.length > 0 ? texts.join("\n") : null;
}

function parseToolJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

interface CatalogEntry {
  readonly id: string;
  readonly url_path: string;
}

/** Resolve the earnings-calendar entry id live from the MCP catalog. */
export function resolveCalendarEntryId(catalogText: string): string | null {
  const catalog = parseToolJson(catalogText);
  const entries = (asRecord(catalog)?.entries ?? asRecord(asRecord(catalog)?.result)?.entries) as
    | unknown
    | null;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const row = asRecord(entry) as Partial<CatalogEntry> | null;
    if (row && row.url_path === EQUITY_CALENDAR_URL_PATH && typeof row.id === "string" && row.id !== "") {
      return row.id;
    }
  }
  return null;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = Date.parse(day);
  if (!Number.isFinite(parsed)) return false;
  // Reject impossible calendar dates that Date.parse normalizes (e.g. month 13).
  const [y, m, d] = day.split("-").map(Number);
  const check = new Date(Date.UTC(y, (m as number) - 1, d));
  return (
    check.getUTCFullYear() === y && check.getUTCMonth() === (m as number) - 1 && check.getUTCDate() === d
  );
}

function recordIsNvda(record: Record<string, unknown>): boolean {
  for (const key of SYMBOL_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "" && value.trim().toUpperCase() !== NVDA_MCP_SYMBOL) {
      return false;
    }
  }
  return true;
}

function candidateRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map(asRecord).filter((r): r is Record<string, unknown> => r !== null);
  const root = asRecord(data);
  if (!root) return [];
  for (const key of ["events", "data", "results", "list", "calendar"]) {
    if (Array.isArray(root[key])) {
      return (root[key] as unknown[]).map(asRecord).filter((r): r is Record<string, unknown> => r !== null);
    }
  }
  return [];
}

export interface VerifiedCalendarDate {
  readonly date: string;
  /** The exact evidence key the date was read from (provenance). */
  readonly key: string;
}

/**
 * Extract the single upcoming verified calendar date, or null when the
 * payload is empty, ambiguous (several distinct upcoming dates), or
 * past-only. Pure and fully unit-tested; never invents.
 */
export function extractVerifiedCalendarDate(data: unknown, today: string): VerifiedCalendarDate | null {
  const dates = new Map<string, string>();
  for (const row of candidateRows(data)) {
    if (!recordIsNvda(row)) continue;
    for (const key of CALENDAR_DATE_KEYS) {
      const value = row[key];
      if (isIsoDate(value)) {
        const day = (value as string).slice(0, 10);
        if (day >= today && !dates.has(day)) dates.set(day, key);
        break;
      }
    }
  }
  if (dates.size !== 1) return null;
  const [[date, key]] = [...dates.entries()];
  return { date: date as string, key: key as string };
}

/**
 * Judge-facing source truth for the NVIDIA event calendar. The UI must
 * distinguish these — a dead source is a safety state, never an
 * application failure, and never a license to invent or reuse stale data.
 */
export type NvidiaEventSourceState =
  | { readonly kind: "LIVE_VERIFIED_EVENT"; readonly event: TrustedNvidiaEvent }
  | { readonly kind: "SOURCE_UNAVAILABLE" }
  | { readonly kind: "NO_ELIGIBLE_EVENT" };

/**
 * Probe the source and classify the outcome. Read-only (initialize +
 * guide + do_query + best-effort close). Never throws for provider
 * conditions — transport/catalog/query failures are SOURCE_UNAVAILABLE,
 * healthy-but-empty/ambiguous/past-only answers are NO_ELIGIBLE_EVENT.
 */
export async function probeNvidiaEventSource(
  input: FetchNvidiaEventInput = {},
): Promise<NvidiaEventSourceState> {
  const nowMs = input.nowMs ?? Date.now();
  let session = null;
  try {
    session = await openMcpSession({
      baseUrl: input.baseUrl ?? BITGET_MCP_BASE_URL,
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs,
    });
    const guideResult = await callMcpTool(session, {
      tool: "guide",
      args: { category: "equity" },
      id: "tenax-guide",
    });
    const guideText = toolTextContent(guideResult);
    if (guideText === null) return { kind: "SOURCE_UNAVAILABLE" };
    const entryId = resolveCalendarEntryId(guideText);
    if (entryId === null) return { kind: "SOURCE_UNAVAILABLE" };
    const queryResult = await callMcpTool(session, {
      tool: "do_query",
      args: { entry_id: entryId, params: { symbol: NVDA_MCP_SYMBOL } },
      id: "tenax-query",
    });
    const queryText = toolTextContent(queryResult);
    if (queryText === null) return { kind: "SOURCE_UNAVAILABLE" };
    const envelope = asRecord(parseToolJson(queryText));
    // Observed failure shape: {success:false, status_code:503, ...}.
    if (!envelope || envelope.success !== true) return { kind: "SOURCE_UNAVAILABLE" };
    const verified = extractVerifiedCalendarDate(
      envelope.data,
      new Date(nowMs).toISOString().slice(0, 10),
    );
    if (!verified) return { kind: "NO_ELIGIBLE_EVENT" };
    const retrievedAt = new Date(nowMs).toISOString();
    return {
      kind: "LIVE_VERIFIED_EVENT",
      event: {
        eventType: "EARNINGS",
        eventDate: verified.date,
        status: "VERIFIED",
        source: `bitget:mcp:${entryId} (evidence key ${verified.key})`,
        retrievedAt,
        meta: { source: "bitget:mcp", provenance: "REAL" },
      },
    };
  } catch {
    return { kind: "SOURCE_UNAVAILABLE" };
  } finally {
    if (session) await closeMcpSession(session);
  }
}

/**
 * Fetch one trusted NVIDIA earnings-calendar event, or null when the
 * source is unreachable, unsuccessful, empty, ambiguous, or past-only.
 * Thin wrapper over probeNvidiaEventSource for evidence-pack callers
 * that only need the event-or-null shape. Never throws for provider
 * conditions — callers treat null as UNAVAILABLE.
 */
export async function fetchTrustedNvidiaEvent(
  input: FetchNvidiaEventInput = {},
): Promise<TrustedNvidiaEvent | null> {
  try {
    const state = await probeNvidiaEventSource(input);
    return state.kind === "LIVE_VERIFIED_EVENT" ? state.event : null;
  } catch {
    return null;
  }
}
