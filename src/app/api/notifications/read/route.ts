// Server-only: mark notifications read.
// POST /api/notifications/read { id } | { all: true } — explicit user
// action only (bell/page clicks). No mutations beyond read status.
import { z } from "zod";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import {
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/tenax/notifications";

export const dynamic = "force-dynamic";

const readInputSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    all: z.literal(true).optional(),
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
  const parsed = readInputSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.id && !parsed.data.all)) {
    return Response.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Provide { id } or { all: true }" } },
      { status: 400 },
    );
  }
  const store = getTenaxDevStore();
  if (parsed.data.all) {
    const marked = markAllNotificationsRead(store);
    return Response.json({ ok: true, marked, unreadCount: getUnreadNotificationCount(store) });
  }
  const found = markNotificationRead(store, parsed.data.id as string);
  if (!found) {
    return Response.json(
      { ok: false, error: { code: "UNKNOWN_NOTIFICATION", message: "Unknown notification id" } },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, marked: 1, unreadCount: getUnreadNotificationCount(store) });
}
