// Tenax Connected Mode — authenticated browser pairing lifecycle.
// POST returns the raw one-time code once. GET never returns the code.
// No provider calls or credentials are accepted here.
import { getCurrentConnectedSession, isSameOrigin } from "@/lib/connected/session";
import {
  createPairingCode,
  formatPairingCode,
  hashPairingCode,
  pairingExpiresAt,
} from "@/lib/connected/pairing";

export const dynamic = "force-dynamic";

function authFailure(status: "UNAVAILABLE" | "NO_COOKIE" | "INVALID_COOKIE") {
  if (status === "UNAVAILABLE") {
    return Response.json(
      {
        ok: false,
        code: "CONNECTED_MODE_UNAVAILABLE",
        message: "Connected Mode requires durable PostgreSQL state.",
      },
      { status: 503 },
    );
  }
  return Response.json(
    { ok: false, code: "SESSION_REQUIRED", message: "A Tenax session is required." },
    { status: 401 },
  );
}

export async function GET() {
  const current = await getCurrentConnectedSession();
  if (current.status !== "READY") return authFailure(current.status);

  try {
    const [pairing, overview] = await Promise.all([
      current.repository.getCurrentPairingForSession({
        userId: current.session.userId,
        sessionId: current.session.id,
      }),
      current.repository.getAccountOverviewByTokenHash(current.tokenHash),
    ]);
    return Response.json({
      ok: true,
      pairing: pairing
        ? {
            status: pairing.status,
            expiresAt: pairing.expiresAt,
          }
        : null,
      connection: overview?.connection
        ? {
            status: overview.connection.status,
            accessMode: overview.connection.accessMode,
          }
        : null,
    });
  } catch {
    return Response.json(
      {
        ok: false,
        code: "CONNECTED_MODE_UNAVAILABLE",
        message: "Connected Mode is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ ok: false, code: "CSRF_ORIGIN_REJECTED" }, { status: 403 });
  }

  const current = await getCurrentConnectedSession();
  if (current.status !== "READY") return authFailure(current.status);

  const now = new Date();
  const pairingCode = createPairingCode();
  const expiresAt = pairingExpiresAt(now);

  try {
    await current.repository.createPairing({
      userId: current.session.userId,
      sessionId: current.session.id,
      secretHash: hashPairingCode(pairingCode),
      now,
      expiresAt,
    });
  } catch {
    return Response.json(
      {
        ok: false,
        code: "CONNECTED_MODE_UNAVAILABLE",
        message: "Connected Mode is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  return Response.json({
    ok: true,
    status: "PENDING",
    pairingCode: formatPairingCode(pairingCode),
    expiresAt: expiresAt.toISOString(),
  });
}
