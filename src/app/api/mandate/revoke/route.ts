// Server-only: revoke an ACTIVE standing mandate (terminal, timestamped).
// POST /api/mandate/revoke { id } — revoked authority never reactivates;
// a new mandate is required for new authority.
import { ZodError } from "zod";

import { revokeStandingMandateRecord, standingMandateIdSchema } from "@/lib/tenax/service";
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
    const mandate = revokeStandingMandateRecord(
      getTenaxDevStore(),
      standingMandateIdSchema.parse(body),
    );
    return Response.json({ ok: true, mandate });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INPUT", message: "mandate id required" } },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Revocation failed";
    return Response.json(
      { ok: false, error: { code: "MANDATE_REJECTED", message } },
      { status: 400 },
    );
  }
}
