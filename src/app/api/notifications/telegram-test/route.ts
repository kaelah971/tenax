// Server-only: explicit Telegram test alert.
// POST /api/notifications/telegram-test {} — explicit user click only.
// Sends one harmless test message through the server-side adapter; never
// invokes AI, trading, agent-cycle, or mandate logic. Requires Telegram
// configuration, otherwise 503 TELEGRAM_DISABLED. No GET by construction.
import { z } from "zod";

import {
  readTelegramConfig,
  sendTelegramMessage,
  telegramConfigStatus,
} from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

const testInputSchema = z.object({}).strict();

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
  if (!testInputSchema.safeParse(body).success) {
    return Response.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Test send takes an empty object" } },
      { status: 400 },
    );
  }
  // The test send itself is transient and creates no records.
  const config = readTelegramConfig(process.env);
  if (!config) {
    const status = telegramConfigStatus(process.env);
    return Response.json(
      {
        ok: false,
        error: {
          code: "TELEGRAM_DISABLED",
          message:
            status === "ORIGIN_INVALID"
              ? "Telegram origin is invalid on this deployment."
              : "Telegram delivery is unavailable on this deployment.",
        },
      },
      { status: 503 },
    );
  }
  const sent = await sendTelegramMessage({
    config,
    text: [
      "🔔 Tenax Telegram alerts are on.",
      "",
      "This is a harmless test — no action needed, nothing was traded.",
    ].join("\n"),
  });
  if (!sent.ok) {
    return Response.json(
      { ok: false, error: { code: sent.safeErrorCode, message: "Telegram test send failed." } },
      { status: 502 },
    );
  }
  return Response.json({ ok: true, sent: true });
}
