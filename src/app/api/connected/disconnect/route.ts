// Tenax Connected Mode — browser-owned Tenax disconnect.
// This revokes Tenax sync access only. It does not claim to revoke Bitget
// OAuth or delete credentials stored on the local connector device.
import { getCurrentConnectedSession, isSameOrigin } from "@/lib/connected/session";

export const dynamic = "force-dynamic";

function sessionFailure(status: "NO_COOKIE" | "INVALID_COOKIE" | "UNAVAILABLE") {
  if (status === "UNAVAILABLE") {
    return Response.json(
      { ok: false, code: "CONNECTED_MODE_UNAVAILABLE", message: "Connected Mode requires durable PostgreSQL state." },
      { status: 503 },
    );
  }
  return Response.json(
    { ok: false, code: "SESSION_REQUIRED", message: "A Tenax session is required." },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ ok: false, code: "CSRF_ORIGIN_REJECTED" }, { status: 403 });
  }

  const current = await getCurrentConnectedSession();
  if (current.status !== "READY") return sessionFailure(current.status);

  try {
    await current.repository.disconnectConnectionBySessionTokenHash({
      sessionTokenHash: current.tokenHash,
    });
    return Response.json({ ok: true, status: "DISCONNECTED" });
  } catch {
    return Response.json(
      { ok: false, code: "CONNECTED_MODE_UNAVAILABLE", message: "Connected Mode is temporarily unavailable." },
      { status: 503 },
    );
  }
}
