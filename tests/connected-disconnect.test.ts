import { describe, expect, it } from "vitest";

import { POST as disconnectPost } from "../src/app/api/connected/disconnect/route";
import { accountSnapshotSchema } from "@/lib/connected/model";
import { PostgresConnectedRepository } from "@/lib/connected/repository";
import { hashConnectionSyncToken } from "@/lib/connected/sync-token";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const SESSION_HASH = "a".repeat(64);
const SYNC_TOKEN = "s".repeat(43);
const SYNC_HASH = hashConnectionSyncToken(SYNC_TOKEN);

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
  return accountSnapshotSchema.parse({
    connectionId,
    provider: "BITGET",
    providerUserId: "bitget-user-a",
    connectionStatus: "CONNECTED",
    accessMode: "READ_ONLY",
    syncedAt: NOW.toISOString(),
    assets: [],
    positions: [],
  });
}

describe("Connected Mode disconnect and token revocation", () => {
  it("disconnects only the session owner's active connection and revokes pending pairings", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("FROM tenax_connected_sessions AS s")) {
          return { rows: [{ id: "connection-a", user_id: "user-a", status: "CONNECTED" }] };
        }
        if (text.includes("SET status = 'DISCONNECTED'")) return { rows: [{ id: "connection-a" }] };
        return { rows: [] };
      }, queries),
    );

    const disconnected = await repository.disconnectConnectionBySessionTokenHash({
      sessionTokenHash: SESSION_HASH,
      now: NOW,
    });
    expect(disconnected).toEqual({ status: "DISCONNECTED" });
    const update = queries.find((query) => query.text.includes("SET status = 'DISCONNECTED'"));
    expect(update?.text).toContain("sync_token_hash = NULL");
    expect(update?.values?.[2]).toBe("user-a");
    expect(queries.some((query) => query.text.includes("SET status = 'REVOKED'"))).toBe(true);
    expect(JSON.stringify(queries)).not.toContain(SYNC_TOKEN);
  });

  it("returns no result and performs no mutation for a non-owner session token", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("FROM tenax_connected_sessions AS s")) return { rows: [] };
        return { rows: [] };
      }, queries),
    );

    expect(
      await repository.disconnectConnectionBySessionTokenHash({ sessionTokenHash: "b".repeat(64), now: NOW }),
    ).toBeNull();
    expect(queries.some((query) => query.text.includes("SET status = 'DISCONNECTED'"))).toBe(false);
  });

  it("accepts a token before disconnect, rejects it after disconnect, and keeps a new connection isolated", async () => {
    let disconnected = false;
    let activeConnection = "connection-a";
    const newTokenHash = hashConnectionSyncToken("n".repeat(43));
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text, values) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("WHERE sync_token_hash = $1 FOR UPDATE")) {
          if (String(values?.[0]) === SYNC_HASH) {
            return {
              rows: [{ id: "connection-a", user_id: "user-a", provider: "BITGET", provider_user_id: "bitget-user-a", status: disconnected ? "DISCONNECTED" : "CONNECTED", access_mode: "READ_ONLY" }],
            };
          }
          if (String(values?.[0]) === newTokenHash) {
            return {
              rows: [{ id: "connection-b", user_id: "user-a", provider: "BITGET", provider_user_id: "bitget-user-a", status: "CONNECTED", access_mode: "READ_ONLY" }],
            };
          }
        }
        if (text.includes("FROM tenax_connected_sessions AS s")) {
          return disconnected ? { rows: [] } : { rows: [{ id: activeConnection, user_id: "user-a", status: "CONNECTED" }] };
        }
        if (text.includes("SET status = 'DISCONNECTED'")) {
          disconnected = true;
          return { rows: [{ id: activeConnection }] };
        }
        if (text.includes("INSERT INTO tenax_connected_account_snapshots")) return { rows: [{ id: `snapshot-${activeConnection}` }] };
        if (text.includes("UPDATE tenax_bitget_connections SET provider_user_id")) return { rows: [{ id: activeConnection }] };
        return { rows: [] };
      }, queries),
    );

    expect(await repository.syncSnapshotByTokenHash({ syncTokenHash: SYNC_HASH, snapshot: snapshot(), now: NOW })).not.toBeNull();
    await repository.disconnectConnectionBySessionTokenHash({ sessionTokenHash: SESSION_HASH, now: NOW });
    expect(await repository.syncSnapshotByTokenHash({ syncTokenHash: SYNC_HASH, snapshot: snapshot(), now: NOW })).toBeNull();

    activeConnection = "connection-b";
    const newSync = await repository.syncSnapshotByTokenHash({
      syncTokenHash: newTokenHash,
      snapshot: snapshot("connection-b"),
      now: NOW,
    });
    expect(newSync?.connectionId).toBe("connection-b");
    expect(newSync?.connectionId).not.toBe("connection-a");
    expect(queries.filter((query) => query.text.includes("INSERT INTO tenax_connected_account_snapshots"))).toHaveLength(2);
  });

  it("enforces same-origin browser disconnects before session lookup", async () => {
    const response = await disconnectPost(
      new Request("https://tenax.test/api/connected/disconnect", {
        method: "POST",
        headers: { origin: "https://evil.test", host: "tenax.test" },
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "CSRF_ORIGIN_REJECTED" });
  });
});
