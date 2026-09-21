// Server-only: live Demo market surface for client polling.
// GET /api/market/demo-surface — public NVDAUSDT ticker snapshot plus the
// authenticated Demo position view, both sanitized to display strings.
// Credentials never leave this route: they are read from the server
// environment, used for exactly one allowlisted position query, and never
// serialized. No order placement, no writes. Only GET exists — there is
// no POST/PUT/DELETE handler by construction.
import { getDemoSurfaceView, toSurfaceResponse } from "@/lib/tenax/demo-surface";

export async function GET() {
  try {
    const view = await getDemoSurfaceView();
    return Response.json({ ok: true, ...toSurfaceResponse(view) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Surface unavailable";
    return Response.json(
      { ok: false, error: { code: "SURFACE_UNAVAILABLE", message } },
      { status: 503 },
    );
  }
}
