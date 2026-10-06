import { loadSubmissionSummary } from "@/lib/tenax/paper-trading-submission-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await loadSubmissionSummary(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { ok: false, code: "PAPER_RUN_LEDGER_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
