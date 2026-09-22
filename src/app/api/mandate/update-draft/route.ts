// Server-only: edit a DRAFT standing mandate (changes NO authority).
// POST /api/mandate/update-draft { id, maxProtectionPct?, maxNotionalUsdt?,
// maxExecutions?, expiresAt?, authorityMode? } — only DRAFT mandates edit;
// ACTIVE / EXHAUSTED / REVOKED reject deterministically. Unknown fields
// (subject, symbols, actions, leverage, anything else) are rejected, never
// stripped. Activation remains the separate hash-binding step.
import { ZodError } from "zod";

import { standingMandateUpdateSchema, updateStandingMandateDraftRecord } from "@/lib/tenax/service";
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
    const mandate = updateStandingMandateDraftRecord(
      getTenaxDevStore(),
      standingMandateUpdateSchema.parse(body),
    );
    return Response.json({ ok: true, mandate });
  } catch (err) {
    if (err instanceof ZodError) {
      const detail = err.issues[0];
      return Response.json(
        {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: detail ? `${detail.path.join(".") || "body"}: ${detail.message}` : "Invalid draft patch",
          },
        },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Draft update failed";
    return Response.json(
      { ok: false, error: { code: "MANDATE_REJECTED", message } },
      { status: 400 },
    );
  }
}
