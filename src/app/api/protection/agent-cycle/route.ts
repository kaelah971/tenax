// Server-only: explicit autonomous agent-cycle invocation (RUN TENAX AGENT).
// POST /api/protection/agent-cycle { flowId } — runs ONE agent cycle:
// reads the validated analysis, stops cold for WAIT/NO_ACTION, re-checks
// deterministic policy, evaluates standing authority fresh, and only then
// executes through the shared guarded executor tails. The client sends
// only the flowId; every financial and authority value is derived
// server-side from canonical state. No GET can trigger execution — there
// is no GET handler by construction.
import { ZodError } from "zod";

import {
  agentCycleInputSchema,
  runProtectionAgentCycle,
} from "@/lib/tenax/service";
import { getTenaxDevStore } from "@/lib/tenax/dev-store";

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
    const result = await runProtectionAgentCycle(
      getTenaxDevStore(),
      agentCycleInputSchema.parse(body),
    );
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INPUT", message: "flowId required" } },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Agent cycle failed";
    return Response.json(
      { ok: false, error: { code: "AGENT_CYCLE_REJECTED", message } },
      { status: 400 },
    );
  }
}
