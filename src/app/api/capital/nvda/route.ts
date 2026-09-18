// Server-only: live Bitget fetch happens here, never in the browser.
// GET /api/capital/nvda — NVDA capital context with strict provenance:
// market sections are REAL (or explicitly unavailable); the 500 USDT
// portfolio exposure is SIMULATED fixture data, always labelled as such.
import { getDemoBundle } from "@/lib/bitget/snapshot-cache";
import { getCapitalContext } from "@/lib/tenax/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getCapitalContext(getDemoBundle);
    return Response.json({ ok: true, ...context });
  } catch {
    return Response.json(
      { ok: false, error: { code: "CAPITAL_UNAVAILABLE", message: "Bitget market data unreachable" } },
      { status: 502 },
    );
  }
}
