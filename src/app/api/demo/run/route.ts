// Server-only: explicit one-click judge demo (RUN DEMO).
// POST /api/demo/run — runs ONE canonical judge-demo cycle through the
// real domain services (exposure fixture → intent → demo analysis →
// deterministic mandate REFUSE → activity + proof + run, NO_ORDER).
// The refusal path performs zero network I/O and never reaches an
// execution adapter, so this route cannot trade, call AI, or write to
// any provider regardless of server configuration. No GET handler exists
// by construction: demo runs are explicit actions, never navigations.
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { runJudgeDemo } from "@/lib/tenax/judge-demo";

export async function POST() {
  try {
    const result = await runJudgeDemo(getTenaxDevStore(), { nowMs: Date.now() });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Judge demo failed";
    return Response.json(
      { ok: false, error: { code: "DEMO_FAILED", message } },
      { status: 500 },
    );
  }
}
