// Server-only: activate a DRAFT standing mandate (the authorization moment).
// POST /api/mandate/activate { id } — binds id + timestamp + exact policy
// into mandateHash. Refuses when another mandate is already ACTIVE and
// when the record is not a DRAFT. Activation authorizes a CLASS of action,
// never a specific order.
import { ZodError } from "zod";

import { activateStandingMandateRecord, standingMandateIdSchema } from "@/lib/tenax/service";
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
    const mandate = activateStandingMandateRecord(
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
    const message = err instanceof Error ? err.message : "Activation failed";
    return Response.json(
      { ok: false, error: { code: "MANDATE_REJECTED", message } },
      { status: 400 },
    );
  }
}
