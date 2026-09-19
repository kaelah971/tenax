// Server-only: human approval grant against the server-side flow record.
// POST /api/protection/approve { flowId, actor } — the flowId only selects
// the record; approval validity is computed server-side, never trusted.
import { ZodError } from "zod";

import { approveInputSchema, approveProtectionProposal } from "@/lib/tenax/service";
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
    const result = approveProtectionProposal(getTenaxDevStore(), approveInputSchema.parse(body));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INPUT", message: "flowId and human actor required" } },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Approval failed";
    return Response.json(
      { ok: false, error: { code: "APPROVAL_REJECTED", message } },
      { status: 400 },
    );
  }
}
