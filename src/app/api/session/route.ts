// Tenax Connected Mode — establish or refresh the opaque durable session.
// This endpoint accepts no body and never accepts, stores, or forwards
// provider credentials. It is not a Bitget OAuth endpoint.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getConnectedRepository } from "@/lib/connected/repository";
import {
  createOpaqueSessionToken,
  hashSessionToken,
  isSameOrigin,
  normalizeSessionToken,
  sessionCookieOptions,
  TENAX_SESSION_COOKIE,
} from "@/lib/connected/session";

export const dynamic = "force-dynamic";

function unavailableResponse() {
  return NextResponse.json(
    {
      ok: false,
      code: "CONNECTED_MODE_UNAVAILABLE",
      message: "Connected Mode requires durable PostgreSQL state.",
    },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, code: "CSRF_ORIGIN_REJECTED" },
      { status: 403 },
    );
  }

  const handle = getConnectedRepository();
  if (handle.reason) return unavailableResponse();

  const cookieStore = await cookies();
  const existingToken = normalizeSessionToken(cookieStore.get(TENAX_SESSION_COOKIE)?.value);
  let token = existingToken;
  let session;

  try {
    session = existingToken
      ? await handle.repo.getSessionByTokenHash(hashSessionToken(existingToken))
      : null;
    if (!session) {
      token = createOpaqueSessionToken();
      session = await handle.repo.createSession({ tokenHash: hashSessionToken(token) });
    }
  } catch {
    return unavailableResponse();
  }

  if (!session || !token) return unavailableResponse();

  const response = NextResponse.json({
    ok: true,
    mode: "CONNECTED",
    status: "READY",
    sessionId: session.id,
  });
  response.cookies.set({
    name: TENAX_SESSION_COOKIE,
    value: token,
    ...sessionCookieOptions(),
  });
  return response;
}
