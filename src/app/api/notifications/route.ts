// Server-only: read the current process-local notification list.
// GET /api/notifications → newest-first notifications + unread count.
// No mutations, no provider calls, no secrets.
import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { getUnreadNotificationCount, listNotifications } from "@/lib/tenax/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = getTenaxDevStore();
  return Response.json({
    ok: true,
    unreadCount: getUnreadNotificationCount(store),
    notifications: listNotifications(store),
  });
}
