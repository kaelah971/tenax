// Server-only: execution with mandatory server-side re-verification.
// POST /api/protection/execute { flowId } — re-runs mandate evaluation from
// the stored proposal and re-verifies approval binding before any adapter is
// touched. Client PASS claims are never trusted, and only flowId is
// accepted: quantity, symbol, side, and leverage are always derived
// server-side and can never be overridden by the client.
// Execution mode resolves server-side (TENAX_EXECUTION_MODE, default
// DRY_RUN); BITGET_DEMO additionally requires BITGET_TRADING_MODE=demo.
// Only POST executes — there is no GET execution path.
import { ZodError } from "zod";

import {
  executeInputSchema,
  executeProtectionProposal,
  getDecisionReceipt,
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
    const parsed = executeInputSchema.parse(body);
    const store = getTenaxDevStore();
    const execution = await executeProtectionProposal(store, parsed);
    const { receipt } = getDecisionReceipt(store, parsed.flowId);
    return Response.json({ ok: true, ...execution, receipt });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INPUT", message: "flowId required" } },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Execution failed";
    return Response.json(
      { ok: false, error: { code: "EXECUTION_REJECTED", message } },
      { status: 400 },
    );
  }
}
