// Server-only: re-derives intent, analysis, and mandate server-side.
// POST /api/protection/analyze { rawText } — creates the flow, analyzes the
// intent against live market context, and evaluates the mandate. Nothing the
// client sends is trusted as authority beyond the raw intent text.
import { ZodError } from "zod";

import { getDemoBundle } from "@/lib/bitget/snapshot-cache";
import { normalizeNvidiaSnapshot } from "@/lib/intelligence/snapshot";
import {
  analyzeInputSchema,
  analyzeProtectionIntent,
  createProtectionIntent,
} from "@/lib/tenax/service";
import { routeDevStore } from "../_dev-store";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "BAD_JSON", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }
  try {
    const { flowId } = createProtectionIntent(routeDevStore, analyzeInputSchema.parse(body));
    const snapshot = normalizeNvidiaSnapshot(await getDemoBundle());
    const result = analyzeProtectionIntent(routeDevStore, flowId, snapshot);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INPUT", message: "rawText must be 1–500 characters" } },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Analysis failed";
    const blocked = message.startsWith("ANALYSIS_BLOCKED") || message.startsWith("FLOW_REJECTED");
    return Response.json(
      { ok: false, error: { code: blocked ? "FLOW_REJECTED" : "ANALYZE_FAILED", message } },
      { status: blocked ? 400 : 500 },
    );
  }
}
