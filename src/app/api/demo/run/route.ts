// Server-only: explicit one-click judge demo (RUN DEMO).
// POST /api/demo/run { scenario?: "refusal" | "execution" } — runs ONE
// canonical judge-demo cycle through the real domain services:
//
// - refusal (default): controlled 40%/$200 input → deterministic mandate
//   REFUSE → activity + proof + run, NO_ORDER.
// - execution: fixture 20%/$100 analysis → mandate PASS → fresh demo
//   standing mandate → autonomous DRY_RUN cycle → preview-only execution
//   → receipt + run, PREVIEW (submitted false, no funds moved).
//
// Both paths perform zero network I/O and never reach a provider-writing
// adapter regardless of server configuration: no AI calls, no Bitget
// traffic, no credentials required. No GET handler exists by
// construction: demo runs are explicit actions, never navigations.
import { z } from "zod";

import { getDemoSnapshot } from "@/lib/bitget/snapshot-cache";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { runJudgeDemo, runJudgeExecutionDemo } from "@/lib/tenax/judge-demo";

const demoRunInputSchema = z
  .object({
    scenario: z.enum(["refusal", "execution"]).default("refusal"),
  })
  .strict();

export async function POST(request?: Request) {
  let body: unknown = {};
  if (request) {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    if (body === null || body === undefined) body = {};
  }
  const parsed = demoRunInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "scenario must be refusal or execution" } },
      { status: 400 },
    );
  }
  try {
    if (parsed.data.scenario === "execution") {
      const snapshot = await getDemoSnapshot();
      const result = await runJudgeExecutionDemo(getTenaxDevStore(), {
        snapshot,
        nowMs: Date.now(),
      });
      return Response.json({ ok: true, scenario: "execution" as const, ...result });
    }
    const result = await runJudgeDemo(getTenaxDevStore(), { nowMs: Date.now() });
    return Response.json({ ok: true, scenario: "refusal" as const, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Judge demo failed";
    return Response.json(
      { ok: false, error: { code: "DEMO_FAILED", message } },
      { status: 500 },
    );
  }
}
