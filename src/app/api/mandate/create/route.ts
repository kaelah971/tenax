// Server-only: draft a standing mandate (creates NO authority).
// POST /api/mandate/create { authorityMode, maxExecutions?, expiresAt? }
// — policy bounds bind from the canonical mandate fixture; only mode,
// executions, and expiry are caller-chosen. Activation is a separate step.
import { ZodError } from "zod";

import { createStandingMandateRecord, standingMandateCreateSchema } from "@/lib/tenax/service";
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
    const mandate = createStandingMandateRecord(
      getTenaxDevStore(),
      standingMandateCreateSchema.parse(body),
    );
    return Response.json({ ok: true, mandate });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INPUT", message: "authorityMode, maxExecutions required" } },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Mandate creation failed";
    return Response.json(
      { ok: false, error: { code: "MANDATE_REJECTED", message } },
      { status: 400 },
    );
  }
}
