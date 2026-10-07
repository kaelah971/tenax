// Server-only: re-derives intent, analysis, and mandate server-side.
// POST /api/protection/analyze { rawText } — creates the flow, analyzes the
// intent against live market context, and evaluates the mandate. Nothing the
// client sends is trusted as authority beyond the raw intent text.
//
// Analysis mode is explicit server env (TENAX_ANALYSIS_MODE):
// - "ai": genuine model analysis via the AI pipeline. Any AI failure
//   (AI_UNAVAILABLE / AI_PROVIDER_ERROR / AI_ANALYSIS_INVALID) is
//   returned honestly — the fixture is never substituted.
// - anything else: the explicit, honestly-labeled development fixture.
import { ZodError } from "zod";

import { fetchNvdaCandles, fetchNvdaFuturesTicker } from "@/lib/bitget/market-series";
import { normalizeNvdaInstrument } from "@/lib/bitget/nvda-hedge";
import { BITGET_BASE_URL, createDefaultPublicClient } from "@/lib/bitget/reality";
import { getDemoBundle } from "@/lib/bitget/snapshot-cache";
import { normalizeNvidiaSnapshot } from "@/lib/intelligence/snapshot";
import { resolveAnalysisMode } from "@/lib/ai/provider.ts";
import { fetchDemoAccountEvidence } from "@/lib/ai/demo-account.ts";
import { fetchTrustedNvidiaEvent } from "@/lib/intelligence/nvidia-events.ts";
import {
  analyzeInputSchema,
  analyzeProtectionIntent,
  analyzeProtectionIntentWithAi,
  createProtectionIntent,
  readDemoCredentials,
} from "@/lib/tenax/service";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import {
  createDefaultXstocksClient,
  fetchNvdaxDiscovery,
} from "@/lib/xstocks/public.ts";

/** Public NVDAUSDT instrument rules (read-only); null when unverified. */
async function fetchNvdaInstrumentRules() {
  const res = await createDefaultPublicClient(8000).getJson(
    `${BITGET_BASE_URL}/api/v3/market/instruments?category=USDT-FUTURES&symbol=NVDAUSDT`,
  );
  if (res.httpStatus !== 200) return null;
  return normalizeNvdaInstrument(res.body);
}

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
    const store = getTenaxDevStore();
    const { flowId } = createProtectionIntent(store, analyzeInputSchema.parse(body));
    const snapshot = normalizeNvidiaSnapshot(await getDemoBundle());
    if (resolveAnalysisMode(process.env) === "ai") {
      // Read-only Demo account context is best-effort: absent credentials
      // or any failed read yields null (honestly unknown), never a block.
      // No writes occur on this path — fetchDemoReadOnly is GET-only.
      const demoCreds = readDemoCredentials(process.env);
      const demoBaseUrl = ((process.env.BITGET_API_BASE_URL ?? "").trim() ||
        "https://api.bitget.com");
      const [ticker, candles, nvdax, instrument, demoAccount, nvidiaEvent] = await Promise.all([
        fetchNvdaFuturesTicker().catch(() => null),
        fetchNvdaCandles(undefined, "5m").catch(() => null).then((s) => s?.candles ?? null),
        fetchNvdaxDiscovery(createDefaultXstocksClient(8000), { gapMs: 300 }).catch(() => null),
        fetchNvdaInstrumentRules().catch(() => null),
        demoCreds
          ? fetchDemoAccountEvidence({ credentials: demoCreds, baseUrl: demoBaseUrl }).catch(() => null)
          : Promise.resolve(null),
        fetchTrustedNvidiaEvent().catch(() => null),
      ]);
      const result = await analyzeProtectionIntentWithAi(store, flowId, snapshot, {
        futuresTicker: ticker?.ticker ?? null,
        candles,
        nvdax,
        instrument,
        demoAccount,
        nvidiaEvent,
      });
      return Response.json({ ok: true, ...result });
    }
    const result = analyzeProtectionIntent(store, flowId, snapshot);
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
    if (message.startsWith("AI_UNAVAILABLE")) {
      return Response.json(
        { ok: false, error: { code: "AI_UNAVAILABLE", message } },
        { status: 400 },
      );
    }
    if (message.startsWith("AI_PROVIDER_ERROR")) {
      return Response.json(
        { ok: false, error: { code: "AI_PROVIDER_ERROR", message } },
        { status: 502 },
      );
    }
    if (message.startsWith("AI_ANALYSIS_INVALID")) {
      return Response.json(
        { ok: false, error: { code: "AI_ANALYSIS_INVALID", message } },
        { status: 500 },
      );
    }
    return Response.json(
      { ok: false, error: { code: blocked ? "FLOW_REJECTED" : "ANALYZE_FAILED", message } },
      { status: blocked ? 400 : 500 },
    );
  }
}
