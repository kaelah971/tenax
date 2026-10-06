import { loadPaperTradingRuns } from "@/lib/tenax/paper-trading-run-query";
import { paperTradingRunsToCsv } from "@/lib/tenax/paper-trading-run-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const loaded = await loadPaperTradingRuns(new URL(request.url).searchParams);
    const body = paperTradingRunsToCsv(loaded.runs);
    return new Response(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="tenax-paper-trading-runs.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch {
    return Response.json({ ok: false, code: "PAPER_RUN_LEDGER_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
