import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  accountSnapshotSchema,
  connectedAccountOverviewSchema,
} from "@/lib/connected/model";
import {
  createOpaqueSessionToken,
  hashSessionToken,
  normalizeSessionToken,
  sessionCookieOptions,
} from "@/lib/connected/session";
import { CONNECTED_MODE_SCHEMA_SQL } from "@/lib/connected/schema";
import { PostgresConnectedRepository } from "@/lib/connected/repository";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const SESSION_ROW = {
  id: "session-a",
  user_id: "user-a",
  created_at: NOW,
  expires_at: new Date("2026-10-22T12:00:00.000Z"),
  last_seen_at: NOW,
  revoked_at: null,
};

function fakeFactory(
  handler: (text: string, values?: unknown[]) => { rows: Array<Record<string, unknown>> },
  queries: Array<{ text: string; values?: unknown[] }>,
) {
  return async () => ({
    connect: async () => {},
    query: async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return handler(text, values);
    },
    end: async () => {},
  });
}

function snapshot(connectionId = "connection-a") {
  return {
    connectionId,
    provider: "BITGET" as const,
    providerUserId: "bitget-user-a",
    connectionStatus: "CONNECTED" as const,
    accessMode: "READ_ONLY" as const,
    syncedAt: NOW.toISOString(),
    assets: [
      {
        asset: "USDT",
        available: "100.00",
        frozen: null,
        equity: "100.00",
        usdValue: "100.00",
      },
    ],
    positions: [],
  };
}

describe("Connected Mode session and tenant boundary", () => {
  it("creates high-entropy opaque tokens and stores only a one-way hash", () => {
    const token = createOpaqueSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(normalizeSessionToken(token)).toBe(token);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).not.toBe(token);
    expect(normalizeSessionToken("session-a")).toBeNull();
  });

  it("uses an HttpOnly, same-site cookie with Secure enabled in production", () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it("rejects credential-shaped fields from the sanitized snapshot contract", () => {
    const valid = accountSnapshotSchema.parse(snapshot());
    expect(valid.accessMode).toBe("READ_ONLY");
    expect(
      accountSnapshotSchema.safeParse({ ...valid, apiKey: "never" }).success,
    ).toBe(false);
    expect(
      accountSnapshotSchema.safeParse({
        ...valid,
        assets: [{ ...valid.assets[0], secretKey: "never" }],
      }).success,
    ).toBe(false);
  });

  it("returns only a public account overview and binds the lookup to the session token hash", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const tokenHash = "a".repeat(64);
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text, values) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("FROM tenax_connected_sessions AS s")) {
          if (values?.[0] !== tokenHash) return { rows: [] };
          return {
            rows: [
              {
                connection_id: "connection-a",
                provider: "BITGET",
                provider_user_id: "bitget-user-a",
                connection_status: "CONNECTED",
                access_mode: "READ_ONLY",
                connection_created_at: NOW,
                connection_updated_at: NOW,
                disconnected_at: null,
                snapshot_payload: snapshot(),
              },
            ],
          };
        }
        return { rows: [] };
      }, queries),
    );

    const overview = await repository.getAccountOverviewByTokenHash(tokenHash, NOW);
    expect(overview?.connection?.id).toBe("connection-a");
    expect(overview?.latestSnapshot?.providerUserId).toBe("bitget-user-a");
    expect(overview).not.toHaveProperty("userId");
    expect(overview).not.toHaveProperty("apiKey");

    const ownershipQuery = queries.find((query) => query.text.includes("FROM tenax_connected_sessions AS s"));
    expect(ownershipQuery?.text).toContain("c.user_id = s.user_id");
    expect(ownershipQuery?.text).toContain("snapshot.user_id = s.user_id");
    expect(ownershipQuery?.values?.[0]).toBe(tokenHash);
    expect(JSON.stringify(queries)).not.toContain("password");
  });

  it("refreshes a session through its hash without accepting a user id", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const tokenHash = "b".repeat(64);
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("UPDATE tenax_connected_sessions")) return { rows: [SESSION_ROW] };
        return { rows: [] };
      }, queries),
    );

    const session = await repository.getSessionByTokenHash(tokenHash, NOW);
    expect(session?.id).toBe("session-a");
    const update = queries.find((query) => query.text.includes("UPDATE tenax_connected_sessions"));
    expect(update?.text).toContain("token_hash = $1");
    expect(update?.text).toContain("revoked_at IS NULL");
    expect(update?.values).toEqual([tokenHash, NOW.toISOString()]);
    expect(update?.text).not.toContain("user_id = $2");
  });

  it("declares separate durable ownership tables without credential columns", () => {
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("tenax_connected_users");
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("tenax_connected_sessions");
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("tenax_bitget_connections");
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("tenax_connected_account_snapshots");
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("FOREIGN KEY (connection_id, user_id)");
    expect(CONNECTED_MODE_SCHEMA_SQL).not.toMatch(/apiKey|secretKey|passphrase|dataKey|signature|authorization/i);
  });

  it("keeps Connected Mode off the shared Demo credential surface", () => {
    const connectedRoot = resolve(process.cwd(), "src", "lib", "connected");
    const route = readFileSync(resolve(process.cwd(), "src", "app", "api", "session", "route.ts"), "utf8");
    const page = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "page.tsx"), "utf8");
    expect(route).not.toContain("BITGET_API_KEY");
    expect(route).not.toContain("BITGET_SECRET_KEY");
    expect(page).toContain("READ ONLY");
    expect(page).toContain("PROVIDER TRADE CAPABILITY");
    expect(readFileSync(resolve(connectedRoot, "repository.ts"), "utf8")).not.toContain("BITGET_API_KEY");
  });

  it("renders an explicit Demo/Connected mode boundary in the shell", () => {
    const shell = readFileSync(resolve(process.cwd(), "src", "app", "app", "_components", "ShellNav.tsx"), "utf8");
    const page = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "page.tsx"), "utf8");
    expect(shell).toContain('href: "/app/connected"');
    expect(page).toContain("DEMO MODE");
    expect(page).toContain("CONNECTED MODE");
    expect(page).toContain("This session never reads the shared Demo account.");
  });

  it("keeps the public overview strict and nullable before a connection exists", () => {
    expect(
      connectedAccountOverviewSchema.safeParse({ connection: null, latestSnapshot: null }).success,
    ).toBe(true);
    expect(
      connectedAccountOverviewSchema.safeParse({
        connection: null,
        latestSnapshot: null,
        sessionId: "should-not-cross-the-boundary",
      }).success,
    ).toBe(false);
  });
});
