// Tenax Phase 4B-B5.2 — server-only Telegram Bot API adapter.
//
// Safety contract (do not weaken without owner approval):
// - Server-only. Bot token and chat id arrive as arguments from server
//   code that loaded them from the environment; they are never logged,
//   printed, serialized, or returned. Only the message text (display
//   facts) and safe fixed error codes ever leave this module.
// - Raw fetch, no SDK. Exactly one endpoint: POST
//   https://api.telegram.org/bot<token>/sendMessage. No GETs, no other
//   methods, no other hosts.
// - Plain-text messages only (no parse mode): no Markdown escaping bugs,
//   no link-preview side effects (previews disabled explicitly).
// - Every failure maps to a fixed safe code (TRANSPORT_ERROR, TIMEOUT,
//   HTTP_<status>, TELEGRAM_<error_code>, INVALID_RESPONSE). Error text
//   from fetch/provider is never stored or returned — it could contain
//   the request URL including the token.
// - Timeouts are enforced; no retries here (retry is an explicit
//   delivery-layer decision, never implicit).

export const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
export const TELEGRAM_SEND_TIMEOUT_MS = 10_000;

export interface TelegramConfig {
  readonly botToken: string;
  readonly chatId: string;
  readonly appOrigin: string;
}

export type TelegramFetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  readonly status: number;
  readonly text: () => Promise<string>;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Validate the public app origin used for absolute deep links. Accepts
 * https origins (and http for loopback dev only), host-only with no path,
 * query, or fragment. Returns the normalized origin or null.
 */
export function normalizeAppOrigin(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host === "") return null;
  if (parsed.protocol === "http:" && host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
    return null;
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
  if (parsed.search !== "" || parsed.hash !== "") return null;
  return `${parsed.protocol}//${parsed.host}`;
}

export type TelegramConfigStatus = "CONFIGURED" | "MISSING" | "ORIGIN_INVALID";

/** Presence check only — never returns the values themselves. */
export function telegramConfigStatus(
  env: Record<string, string | undefined>,
): TelegramConfigStatus {
  const botToken = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (env.TENAX_TELEGRAM_CHAT_ID ?? "").trim();
  if (botToken === "" || chatId === "") return "MISSING";
  if (normalizeAppOrigin(env.TENAX_APP_ORIGIN) === null) return "ORIGIN_INVALID";
  return "CONFIGURED";
}

/**
 * Load server-side Telegram configuration. Returns null unless a bot
 * token, chat id, AND a valid public origin are all present — without a
 * safe absolute-link origin there is nothing truthful to send.
 */
export function readTelegramConfig(
  env: Record<string, string | undefined>,
): TelegramConfig | null {
  const botToken = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (env.TENAX_TELEGRAM_CHAT_ID ?? "").trim();
  const appOrigin = normalizeAppOrigin(env.TENAX_APP_ORIGIN);
  if (botToken === "" || chatId === "" || appOrigin === null) return null;
  return { botToken, chatId, appOrigin };
}

export type TelegramSendResult =
  | { readonly ok: true; readonly providerMessageId: number | null }
  | { readonly ok: false; readonly safeErrorCode: string };

function timeoutSignal(timeoutMs: number): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(timeoutMs);
    }
  } catch {
    // Fall through: send without a timeout signal rather than failing.
  }
  return undefined;
}

/**
 * Send one plain-text Telegram message. Transport only — copy is built by
 * the message builder, eligibility by the delivery layer. Never throws:
 * every outcome (including timeouts) maps to a safe result.
 */
export async function sendTelegramMessage(options: {
  readonly config: TelegramConfig;
  readonly text: string;
  readonly fetchImpl?: TelegramFetchImpl;
  readonly timeoutMs?: number;
}): Promise<TelegramSendResult> {
  const fetchImpl: TelegramFetchImpl =
    options.fetchImpl ??
    (async (url, init) => {
      const res = await fetch(url, init);
      return { status: res.status, text: () => res.text() };
    });
  const url = `${TELEGRAM_API_BASE_URL}/bot${options.config.botToken}/sendMessage`;
  let res: { readonly status: number; readonly text: () => Promise<string> };
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: options.config.chatId,
        text: options.text,
        disable_web_page_preview: true,
      }),
      signal: timeoutSignal(options.timeoutMs ?? TELEGRAM_SEND_TIMEOUT_MS),
    });
  } catch (err) {
    // Fixed codes only: err text could embed the token-bearing URL.
    if (err instanceof Error && err.name === "TimeoutError") return { ok: false, safeErrorCode: "TIMEOUT" };
    return { ok: false, safeErrorCode: "TRANSPORT_ERROR" };
  }
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, safeErrorCode: `HTTP_${res.status}` };
  }
  let body: unknown = null;
  try {
    body = JSON.parse(await res.text()) as unknown;
  } catch {
    return { ok: false, safeErrorCode: "INVALID_RESPONSE" };
  }
  const root = asRecord(body);
  if (!root || root.ok !== true) {
    const errorCode = typeof root?.error_code === "number" ? root.error_code : null;
    return { ok: false, safeErrorCode: errorCode === null ? "TELEGRAM_REJECTED" : `TELEGRAM_${errorCode}` };
  }
  const messageId = asRecord(root.result)?.message_id;
  return {
    ok: true,
    providerMessageId: typeof messageId === "number" ? messageId : null,
  };
}

// ---- Message copy (pure; structured values in, short text out) --------------

/** Notification types with Telegram copy. Everything else stays silent. */
export type TelegramMessageType =
  | "STANDING_REVIEW_REQUIRED"
  | "STANDING_AUTHORITY_ESCALATED"
  | "STANDING_AUTHORITY_REFUSED"
  | "AUTONOMOUS_EXECUTION_FILLED"
  | "AUTONOMOUS_EXECUTION_FAILED";

export interface TelegramMessageFacts {
  readonly proposedPct?: number | null;
  readonly proposedUsd?: number | null;
  readonly maxPct?: number | null;
  readonly maxNotional?: number | null;
  readonly executedValueUsd?: number | null;
  readonly authoritySource?: string | null;
  readonly reasonCodes?: readonly string[];
}

function fmtPct(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : null;
}

function fmtUsd(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `$${value}` : null;
}

/**
 * Build the short actionable Telegram text for an eligible notification.
 * Uses structured facts only — every line with a missing value is
 * omitted, never invented. Absolute deep link comes from the validated
 * origin plus the canonical targetHref.
 */
export function buildTelegramMessage(input: {
  readonly type: TelegramMessageType;
  readonly facts: TelegramMessageFacts;
  readonly targetHref: string;
  readonly appOrigin: string;
}): string {
  const link = `${input.appOrigin}${input.targetHref}`;
  const f = input.facts;
  switch (input.type) {
    case "STANDING_REVIEW_REQUIRED": {
      const scope =
        fmtPct(f.proposedPct) && fmtUsd(f.proposedUsd)
          ? ` for ${fmtPct(f.proposedPct)} (${fmtUsd(f.proposedUsd)})`
          : "";
      return [
        "⚠️ Tenax needs your approval",
        "",
        `Human approval required${scope}.`,
        "",
        "No order sent.",
        "",
        "Review:",
        link,
      ].join("\n");
    }
    case "STANDING_AUTHORITY_ESCALATED": {
      const lines = ["⚠️ Tenax needs human review", "", "NVIDIA protection request:"];
      const proposed =
        fmtPct(f.proposedPct) && fmtUsd(f.proposedUsd)
          ? `Proposed: ${fmtPct(f.proposedPct)} · ${fmtUsd(f.proposedUsd)}`
          : null;
      const bounds =
        fmtPct(f.maxPct) && fmtUsd(f.maxNotional)
          ? `Standing mandate: ${fmtPct(f.maxPct)} · ${fmtUsd(f.maxNotional)}`
          : null;
      if (proposed) lines.push(proposed);
      if (bounds) lines.push(bounds);
      lines.push("", "No autonomous order was sent.", "", "Review:", link);
      return lines.join("\n");
    }
    case "STANDING_AUTHORITY_REFUSED": {
      const reasons = (f.reasonCodes ?? []).filter((r) => r.length > 0);
      const lines = [
        "🛑 Tenax refused an action",
        "",
        "The action could not proceed within your safety rules.",
      ];
      if (reasons.length > 0) lines.push(`(${reasons.join(" · ").toUpperCase()})`);
      lines.push("No order was sent.", "", "Inspect:", link);
      return lines.join("\n");
    }
    case "AUTONOMOUS_EXECUTION_FILLED": {
      const lines = ["✅ Tenax protected NVIDIA", "", "Bitget Demo · NVDAUSDT · SHORT"];
      const executed = fmtUsd(f.executedValueUsd);
      if (executed) lines.push(`Executed value: ${executed}`);
      if (f.authoritySource === "STANDING_MANDATE") {
        lines.push("Authority: Standing mandate · no per-action approval");
      } else if (f.authoritySource === "HUMAN_APPROVAL") {
        lines.push("Authority: Human approval");
      }
      lines.push("", "Virtual funds only — no real money moved.", "", "View receipt:", link);
      return lines.join("\n");
    }
    case "AUTONOMOUS_EXECUTION_FAILED": {
      return [
        "⚠️ Protection could not be executed",
        "",
        "Tenax could not complete the protection. No position was opened.",
        "",
        "Inspect the decision:",
        link,
      ].join("\n");
    }
  }
}
