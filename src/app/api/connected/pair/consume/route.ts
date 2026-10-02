// Tenax Connected Mode — connector-facing one-time pairing consume endpoint.
// The pairing code is the only authentication input. No provider credentials,
// metadata, signatures, or Bitget calls are accepted in this slice.
import { getConnectedRepository } from "@/lib/connected/repository";
import {
  hashPairingCode,
  normalizePairingCode,
  pairingConsumeInputSchema,
} from "@/lib/connected/pairing";
import { isSameOrigin } from "@/lib/connected/session";

export const dynamic = "force-dynamic";

function invalidPairingResponse() {
  return Response.json(
    {
      ok: false,
      code: "PAIRING_INVALID_OR_EXPIRED",
      message: "Pairing code is invalid or expired.",
    },
    { status: 400 },
  );
}

function unavailableResponse() {
  return Response.json(
    {
      ok: false,
      code: "CONNECTED_MODE_UNAVAILABLE",
      message: "Connected Mode is temporarily unavailable.",
    },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ ok: false, code: "CSRF_ORIGIN_REJECTED" }, { status: 403 });
  }

  let parsed;
  try {
    parsed = pairingConsumeInputSchema.safeParse(await request.json());
  } catch {
    return invalidPairingResponse();
  }
  if (!parsed.success) return invalidPairingResponse();

  const pairingCode = normalizePairingCode(parsed.data.pairingCode);
  if (!pairingCode) return invalidPairingResponse();

  const handle = getConnectedRepository();
  if (handle.reason) return unavailableResponse();

  try {
    const consumed = await handle.repo.consumePairing({
      secretHash: hashPairingCode(pairingCode),
    });
    if (!consumed) return invalidPairingResponse();

    return Response.json({
      ok: true,
      status: consumed.status,
      connectionId: consumed.connectionId,
      provider: consumed.provider,
      accessMode: consumed.accessMode,
    });
  } catch {
    return unavailableResponse();
  }
}
