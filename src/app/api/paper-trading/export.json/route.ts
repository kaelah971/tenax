import { loadPaperTradingRuns } from "@/lib/tenax/paper-trading-run-query";
import { paperTradingExportPayload } from "@/lib/tenax/paper-trading-run-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const loaded = await loadPaperTradingRuns(new URL(request.url).searchParams);
    return Response.json(paperTradingExportPayload({
      exportedAt: new Date().toISOString(),
      persistence: loaded.repository.durabilityState,
      aggregates: loaded.summary,
      runs: loaded.runs,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, code: "PAPER_RUN_LEDGER_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
