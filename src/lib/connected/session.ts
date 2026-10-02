// Tenax Connected Mode — opaque database-backed browser session boundary.
//
// The browser receives only a random token in an HttpOnly cookie. Postgres
// stores a SHA-256 hash, never the token itself. The session id and user id
// are server records, not authentication inputs supplied by the browser.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import {
  getConnectedRepository,
  type ConnectedRepository,
} from "./repository.ts";
import type { ConnectedSession } from "./model.ts";

export const TENAX_SESSION_COOKIE = "tenax_session";
export const CONNECTED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function createOpaqueSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeSessionToken(value: string | undefined): string | null {
  if (!value || value.length < 40 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  return value;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: CONNECTED_SESSION_TTL_SECONDS,
    priority: "high" as const,
  };
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const requestHost = request.headers.get("host") ?? new URL(request.url).host;
  const expectedHost = (forwardedHost ?? requestHost).split(",")[0]?.trim();
  try {
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

export type CurrentConnectedSession =
  | {
      readonly status: "NO_COOKIE";
      readonly session: null;
      readonly tokenHash: null;
      readonly repository: null;
      readonly reason: null;
    }
  | {
      readonly status: "INVALID_COOKIE" | "UNAVAILABLE";
      readonly session: null;
      readonly tokenHash: string | null;
      readonly repository: ConnectedRepository | null;
      readonly reason: string;
    }
  | {
      readonly status: "READY";
      readonly session: ConnectedSession;
      readonly tokenHash: string;
      readonly repository: ConnectedRepository;
      readonly reason: null;
    };

/** Server-side request context for connected pages and future account routes. */
export async function getCurrentConnectedSession(): Promise<CurrentConnectedSession> {
  const cookieStore = await cookies();
  const token = normalizeSessionToken(cookieStore.get(TENAX_SESSION_COOKIE)?.value);
  if (!token) {
    return { status: "NO_COOKIE", session: null, tokenHash: null, repository: null, reason: null };
  }

  const tokenHash = hashSessionToken(token);
  const handle = getConnectedRepository();
  if (handle.reason) {
    return {
      status: "UNAVAILABLE",
      session: null,
      tokenHash,
      repository: null,
      reason: "Connected Mode requires durable PostgreSQL state.",
    };
  }

  try {
    const session = await handle.repo.getSessionByTokenHash(tokenHash);
    if (!session) {
      return {
        status: "INVALID_COOKIE",
        session: null,
        tokenHash,
        repository: handle.repo,
        reason: "Session is missing, expired, or revoked.",
      };
    }
    return {
      status: "READY",
      session,
      tokenHash,
      repository: handle.repo,
      reason: null,
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      session: null,
      tokenHash,
      repository: null,
      reason: "Connected Mode is temporarily unavailable.",
    };
  }
}
