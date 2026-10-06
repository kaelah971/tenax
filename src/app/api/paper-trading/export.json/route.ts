import { loadPaperTradingRuns } from "@/lib/tenax/paper-trading-run-query";
import { calculatePaperTradingMetrics } from "@/lib/tenax/paper-trading-metrics";
import { paperTradingExportPayload } from "@/lib/tenax/paper-trading-run-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const loaded = await loadPaperTradingRuns(new URL(request.url).searchParams);
    const allRuns = await loaded.repository.listRuns({ limit: 5000 });
    return Response.json(paperTradingExportPayload({
      exportedAt: new Date().toISOString(),
      persistence: loaded.repository.durabilityState,
      aggregates: loaded.summary,
      metrics: calculatePaperTradingMetrics(allRuns),
      runs: loaded.runs,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, code: "PAPER_RUN_LEDGER_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
