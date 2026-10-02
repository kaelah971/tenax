// Tenax Connected Mode — connector snapshot sync endpoint.
// The bearer is a connection-scoped sync token, never a browser session or
// provider credential. The body is only the strict sanitized snapshot DTO.
import { accountSnapshotSchema } from "@/lib/connected/model";
import { getConnectedRepository } from "@/lib/connected/repository";
import { hashConnectionSyncToken, normalizeConnectionSyncToken } from "@/lib/connected/sync-token";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return Response.json(
    { ok: false, code: "SYNC_UNAUTHORIZED", message: "Snapshot sync authorization was rejected." },
    { status: 401 },
  );
}

function invalidSnapshotResponse() {
  return Response.json(
    { ok: false, code: "SNAPSHOT_INVALID", message: "Snapshot is not a valid sanitized Connected Mode payload." },
    { status: 400 },
  );
}

function unavailableResponse() {
  return Response.json(
    { ok: false, code: "CONNECTED_MODE_UNAVAILABLE", message: "Connected Mode is temporarily unavailable." },
    { status: 503 },
  );
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value || !/^Bearer\s+\S+$/i.test(value)) return null;
  const raw = value.replace(/^Bearer\s+/i, "");
  return normalizeConnectionSyncToken(raw);
}

export async function POST(request: Request) {
  const syncToken = bearerToken(request);
  if (!syncToken) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidSnapshotResponse();
  }
  const parsed = accountSnapshotSchema.safeParse(body);
  if (!parsed.success) return invalidSnapshotResponse();

  const handle = getConnectedRepository();
  if (handle.reason) return unavailableResponse();

  try {
    const synced = await handle.repo.syncSnapshotByTokenHash({
      syncTokenHash: hashConnectionSyncToken(syncToken),
      snapshot: parsed.data,
    });
    if (!synced) return unauthorizedResponse();
    return Response.json({
      ok: true,
      connectionId: synced.connectionId,
      provider: synced.provider,
      providerUserId: synced.providerUserId,
      status: synced.status,
      accessMode: synced.accessMode,
      syncedAt: synced.syncedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONNECTED_STORE_CORRUPT") {
      return unavailableResponse();
    }
    return unavailableResponse();
  }
}
