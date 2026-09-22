// Server-only: explicit retry of a FAILED Telegram delivery.
// POST /api/notifications/telegram-retry { notificationId } — explicit
// user action only. SENT and PENDING records reconcile untouched (no
// second message); unknown ids answer 404. No GET by construction.
import { z } from "zod";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { retryTelegramDelivery } from "@/lib/telegram/delivery";

export const dynamic = "force-dynamic";

const retryInputSchema = z
  .object({
    notificationId: z.string().min(1).max(64),
  })
  .strict();

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
  const parsed = retryInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Provide { notificationId }" } },
      { status: 400 },
    );
  }
  const store = getTenaxDevStore();
  const { retried, delivery } = await retryTelegramDelivery(store, parsed.data.notificationId);
  if (!delivery) {
    return Response.json(
      { ok: false, error: { code: "UNKNOWN_NOTIFICATION", message: "Unknown notification id" } },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, retried, status: delivery.status });
}
